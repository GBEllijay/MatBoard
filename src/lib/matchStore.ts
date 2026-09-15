import { clamp, minutesToMs } from './format';
import { playEndBuzzer } from './audio';

export type Side = 'blue' | 'white';
export type ScoreKind = 'points' | 'advantages' | 'disadvantages';

export type Competitor = {
  name: string;
  gym: string;
  points: number;
  advantages: number;
  disadvantages: number;
};

export type MatchState = {
  blue: Competitor;
  white: Competitor;
  round: string;
  division: string;
  durationMs: number;
  remainingMs: number;
  running: boolean;
  startedAt: number | null;
  endBuzzer: boolean;
  revision: number;
};

export type MatchAction =
  | { type: 'replace'; state: MatchState }
  | { type: 'bump'; side: Side; kind: ScoreKind; delta: number }
  | { type: 'toggleClock' }
  | { type: 'resetClock' }
  | { type: 'resetScores' }
  | { type: 'setDuration'; durationMs: number }
  | { type: 'setField'; field: 'round' | 'division'; value: string }
  | { type: 'setCompetitor'; side: Side; field: 'name' | 'gym'; value: string }
  | { type: 'setEndBuzzer'; value: boolean }
  | { type: 'expireClock' };

const STORAGE_KEY = 'matboard.match.v1';
const CHANNEL_NAME = 'matboard-match-v1';
export const TIME_PRESETS_MIN = [5, 6, 7, 8, 10, 20, 30] as const;

const LIMITS: Record<ScoreKind, number> = {
  points: 99,
  advantages: 99,
  disadvantages: 9,
};

const listeners = new Set<() => void>();
const presentationConnections = new Set<PresentationLike>();

let channel: BroadcastChannel | null = null;
let applyingRemote = false;
let state: MatchState = loadState();
let buzzedRevision = -1;

type PresentationLike = {
  send: (data: string) => void;
  addEventListener?: (type: string, listener: (ev: MessageEvent) => void) => void;
  onmessage?: ((ev: MessageEvent) => void) | null;
};

function defaultCompetitor(name: string): Competitor {
  return { name, gym: '', points: 0, advantages: 0, disadvantages: 0 };
}

export function defaultMatch(): MatchState {
  const durationMs = minutesToMs(5);
  return {
    blue: defaultCompetitor('Competitor 1'),
    white: defaultCompetitor('Competitor 2'),
    round: '1',
    division: '',
    durationMs,
    remainingMs: durationMs,
    running: false,
    startedAt: null,
    endBuzzer: false,
    revision: 1,
  };
}

function loadState(): MatchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMatch();
    const parsed = JSON.parse(raw) as Partial<MatchState>;
    const base = defaultMatch();
    return {
      ...base,
      ...parsed,
      blue: { ...base.blue, ...parsed.blue },
      white: { ...base.white, ...parsed.white },
      endBuzzer: Boolean(parsed.endBuzzer),
      revision: Number(parsed.revision ?? 1),
    };
  } catch {
    return defaultMatch();
  }
}

function clone(s: MatchState): MatchState {
  return {
    ...s,
    blue: { ...s.blue },
    white: { ...s.white },
  };
}

export function remainingNow(s: MatchState, now = Date.now()): number {
  if (!s.running || s.startedAt == null) return s.remainingMs;
  return Math.max(0, s.remainingMs - (now - s.startedAt));
}

function persist(next: MatchState): void {
  state = next;
  if (!applyingRemote) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    channel?.postMessage({ type: 'state', state });
    const payload = JSON.stringify({ type: 'state', state });
    for (const conn of presentationConnections) {
      try {
        conn.send(payload);
      } catch {
        presentationConnections.delete(conn);
      }
    }
  }
  listeners.forEach((fn) => fn());
}

function bumpRevision(s: MatchState): MatchState {
  return { ...s, revision: s.revision + 1 };
}

function applyAction(current: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'replace':
      return clone(action.state);
    case 'bump': {
      const competitor = { ...current[action.side] };
      const max = LIMITS[action.kind];
      competitor[action.kind] = clamp(competitor[action.kind] + action.delta, 0, max);
      return bumpRevision({ ...current, [action.side]: competitor });
    }
    case 'toggleClock': {
      if (current.running) {
        return bumpRevision({
          ...current,
          running: false,
          remainingMs: remainingNow(current),
          startedAt: null,
        });
      }
      const remaining = remainingNow(current);
      if (remaining <= 0) {
        return bumpRevision({
          ...current,
          running: true,
          remainingMs: current.durationMs,
          startedAt: Date.now(),
        });
      }
      return bumpRevision({
        ...current,
        running: true,
        remainingMs: remaining,
        startedAt: Date.now(),
      });
    }
    case 'resetClock':
      return bumpRevision({
        ...current,
        running: false,
        remainingMs: current.durationMs,
        startedAt: null,
      });
    case 'resetScores':
      return bumpRevision({
        ...current,
        blue: { ...current.blue, points: 0, advantages: 0, disadvantages: 0 },
        white: { ...current.white, points: 0, advantages: 0, disadvantages: 0 },
      });
    case 'setDuration':
      return bumpRevision({
        ...current,
        durationMs: action.durationMs,
        remainingMs: action.durationMs,
        running: false,
        startedAt: null,
      });
    case 'setField':
      return bumpRevision({ ...current, [action.field]: action.value });
    case 'setCompetitor':
      return bumpRevision({
        ...current,
        [action.side]: { ...current[action.side], [action.field]: action.value },
      });
    case 'setEndBuzzer':
      return bumpRevision({ ...current, endBuzzer: action.value });
    case 'expireClock': {
      if (!current.running || remainingNow(current) > 0) return current;
      return bumpRevision({
        ...current,
        running: false,
        remainingMs: 0,
        startedAt: null,
      });
    }
    default:
      return current;
  }
}

export function getMatch(): MatchState {
  return state;
}

export function subscribeMatch(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function maybeBuzz(prev: MatchState, next: MatchState): void {
  if (!(prev.running && !next.running && next.remainingMs === 0 && next.endBuzzer)) return;
  const token = String(next.revision);
  if (buzzedRevision === next.revision) return;
  try {
    if (localStorage.getItem('matboard.match.lastBuzz') === token) return;
    localStorage.setItem('matboard.match.lastBuzz', token);
  } catch {
    /* ignore quota */
  }
  buzzedRevision = next.revision;
  playEndBuzzer();
}

export function dispatchMatch(action: MatchAction): void {
  if (isPresentationReceiver()) {
    sendToPresenters(action);
    return;
  }
  const prev = state;
  const next = applyAction(state, action);
  persist(next);
  if (action.type === 'expireClock') maybeBuzz(prev, next);
}

export function expireMatchClock(): boolean {
  if (!state.running) return false;
  if (remainingNow(state) > 0) return false;
  dispatchMatch({ type: 'expireClock' });
  return true;
}

function incoming(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const msg = data as { type?: string; state?: MatchState; action?: MatchAction };
  if (msg.type === 'state' && msg.state) {
    if (msg.state.revision < state.revision) return;
    applyingRemote = true;
    persist(clone(msg.state));
    applyingRemote = false;
    return;
  }
  if (msg.type === 'action' && msg.action && !isPresentationReceiver()) {
    const prev = state;
    const next = applyAction(state, msg.action);
    persist(next);
    if (msg.action.type === 'expireClock') maybeBuzz(prev, next);
  }
}

function sendToPresenters(action: MatchAction): void {
  const payload = JSON.stringify({ type: 'action', action });
  for (const conn of presentationConnections) {
    try {
      conn.send(payload);
    } catch {
      presentationConnections.delete(conn);
    }
  }
}

export function attachPresentation(conn: PresentationLike): void {
  presentationConnections.add(conn);
  const onMessage = (ev: MessageEvent) => {
    try {
      incoming(typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data);
    } catch {
      /* ignore */
    }
  };
  if (typeof conn.addEventListener === 'function') {
    conn.addEventListener('message', onMessage);
  } else {
    conn.onmessage = onMessage;
  }
  try {
    conn.send(JSON.stringify({ type: 'state', state }));
  } catch {
    /* receiver may not send */
  }
}

export function isPresentationReceiver(): boolean {
  try {
    const presentation = (navigator as Navigator & { presentation?: { receiver?: unknown } }).presentation;
    return Boolean(presentation?.receiver);
  } catch {
    return false;
  }
}

export function initMatchSync(): void {
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (ev) => incoming(ev.data);
  }

  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY || !ev.newValue) return;
    try {
      incoming({ type: 'state', state: JSON.parse(ev.newValue) as MatchState });
    } catch {
      /* ignore */
    }
  });

  const presentation = (navigator as Navigator & {
    presentation?: {
      receiver?: {
        connectionList: Promise<{
          connections: PresentationLike[];
          addEventListener: (type: string, fn: (ev: { connection: PresentationLike }) => void) => void;
        }>;
      };
    };
  }).presentation;

  if (presentation?.receiver) {
    void presentation.receiver.connectionList.then((list) => {
      list.connections.forEach(attachPresentation);
      list.addEventListener('connectionavailable', (ev) => attachPresentation(ev.connection));
    });
  }
}
