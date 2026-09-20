import { clamp, minutesToMs, secondsToMs } from './format';
import {
  getAudioPrefs,
  parseEndCue,
  playSelectedEndCue,
  playStartCue,
  playWarningCue,
  type EndCue,
} from './audio';

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
  startBeep: boolean;
  warningBeep: boolean;
  warned: boolean;
  endBuzzer: boolean;
  endCue: EndCue;
  /**
   * Phase 2: when set, this live bout reports Win/DQ/tech into that mock-bracket match.
   * One of `MATCH_IDS` from tournamentStore. Unused in Phase 1.
   */
  bracketMatchId: string | null;
  revision: number;
};

export type MatchAction =
  | { type: 'replace'; state: MatchState }
  | { type: 'bump'; side: Side; kind: ScoreKind; delta: number }
  | { type: 'toggleClock' }
  | { type: 'resetClock' }
  | { type: 'adjustClock'; deltaMs: number }
  | { type: 'resetScores' }
  | { type: 'setDuration'; durationMs: number }
  | { type: 'setField'; field: 'round' | 'division'; value: string }
  | { type: 'setCompetitor'; side: Side; field: 'name' | 'gym'; value: string }
  | { type: 'setStartBeep'; value: boolean }
  | { type: 'setWarningBeep'; value: boolean }
  | { type: 'markWarned' }
  | { type: 'setEndBuzzer'; value: boolean }
  | { type: 'setEndCue'; value: EndCue }
  | { type: 'setBracketMatchId'; value: string | null }
  | { type: 'expireClock' };

const STORAGE_KEY = 'matboard.match.v1';
const CHANNEL_NAME = 'matboard-match-v1';
export const TIME_PRESETS_MIN = [3, 5, 10] as const;
export const CLOCK_NUDGES_SEC = [-5, -1, 1, 5] as const;
/** Optional Match 10-second warning; off by default (IBJJF does not use one). */
export const MATCH_WARNING_MS = 10_000;
/** Existing custom duration ceiling (180 minutes). */
export const MAX_REMAINING_MS = minutesToMs(180);
/** Display-friendly nudge cap (99:59) unless the match duration is longer. */
const NUDGE_DISPLAY_CAP_MS = secondsToMs(99 * 60 + 59);

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
let startedRevision = -1;
let warnedRevision = -1;

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
    startBeep: false,
    warningBeep: false,
    warned: false,
    endBuzzer: true,
    endCue: getAudioPrefs().endCue,
    bracketMatchId: null,
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
      startBeep: parsed.startBeep === true,
      warningBeep: parsed.warningBeep === true,
      warned: Boolean(parsed.warned),
      endBuzzer: typeof parsed.endBuzzer === 'boolean' ? parsed.endBuzzer : true,
      endCue: parsed.endCue != null ? parseEndCue(parsed.endCue) : getAudioPrefs().endCue,
      bracketMatchId: typeof parsed.bracketMatchId === 'string' ? parsed.bracketMatchId : null,
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

export function remainingNow(
  s: Pick<MatchState, 'running' | 'startedAt' | 'remainingMs'>,
  now = Date.now(),
): number {
  if (!s.running || s.startedAt == null) return s.remainingMs;
  return Math.max(0, s.remainingMs - (now - s.startedAt));
}

export function remainingCapMs(durationMs: number): number {
  return Math.min(MAX_REMAINING_MS, Math.max(durationMs, NUDGE_DISPLAY_CAP_MS));
}

export function clampRemainingMs(ms: number, durationMs: number): number {
  return clamp(Math.round(ms), 0, remainingCapMs(durationMs));
}

export function applyAdjustClock(
  current: Pick<MatchState, 'running' | 'startedAt' | 'remainingMs' | 'durationMs'>,
  deltaMs: number,
  now = Date.now(),
): Pick<MatchState, 'remainingMs' | 'running' | 'startedAt'> {
  const remaining = remainingNow(current, now);
  const nextRemaining = clampRemainingMs(remaining + deltaMs, current.durationMs);
  if (nextRemaining <= 0) {
    return { running: false, remainingMs: 0, startedAt: null };
  }
  return {
    remainingMs: nextRemaining,
    startedAt: current.running ? now : null,
    running: current.running,
  };
}

function persist(next: MatchState): void {
  const prev = state;
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
  maybeMatchCues(prev, next);
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
          warned: false,
        });
      }
      return bumpRevision({
        ...current,
        running: true,
        remainingMs: remaining,
        startedAt: Date.now(),
        warned: remaining > MATCH_WARNING_MS ? false : current.warned,
      });
    }
    case 'resetClock':
      return bumpRevision({
        ...current,
        running: false,
        remainingMs: current.durationMs,
        startedAt: null,
        warned: false,
      });
    case 'adjustClock': {
      const now = Date.now();
      const next = applyAdjustClock(current, action.deltaMs, now);
      return bumpRevision({
        ...current,
        ...next,
        warned: next.remainingMs > MATCH_WARNING_MS ? false : current.warned,
      });
    }
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
        warned: false,
      });
    case 'setField':
      return bumpRevision({ ...current, [action.field]: action.value });
    case 'setCompetitor':
      return bumpRevision({
        ...current,
        [action.side]: { ...current[action.side], [action.field]: action.value },
      });
    case 'setStartBeep':
      return bumpRevision({ ...current, startBeep: action.value });
    case 'setWarningBeep':
      return bumpRevision({ ...current, warningBeep: action.value, warned: action.value ? current.warned : false });
    case 'markWarned':
      if (current.warned) return current;
      return bumpRevision({ ...current, warned: true });
    case 'setEndBuzzer':
      return bumpRevision({ ...current, endBuzzer: action.value });
    case 'setEndCue':
      return bumpRevision({ ...current, endCue: parseEndCue(action.value) });
    case 'setBracketMatchId':
      return bumpRevision({ ...current, bracketMatchId: action.value });
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

function maybeMatchCues(prev: MatchState, next: MatchState): void {
  if (!prev.running && next.running && next.startBeep && startedRevision !== next.revision) {
    startedRevision = next.revision;
    playStartCue();
  }
  if (!prev.warned && next.warned && next.warningBeep && warnedRevision !== next.revision) {
    warnedRevision = next.revision;
    playWarningCue();
  }
  if (!(prev.running && !next.running && next.remainingMs === 0 && next.endBuzzer)) return;
  if (buzzedRevision === next.revision) return;
  buzzedRevision = next.revision;
  playSelectedEndCue('match', next.endCue);
}

export function dispatchMatch(action: MatchAction): void {
  if (isPresentationReceiver()) {
    sendToPresenters(action);
    return;
  }
  const next = applyAction(state, action);
  persist(next);
}

export function expireMatchClock(): boolean {
  if (state.running && state.warningBeep && !state.warned) {
    const left = remainingNow(state);
    if (left <= MATCH_WARNING_MS && left > 0) {
      dispatchMatch({ type: 'markWarned' });
    }
  }
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
    const next = applyAction(state, msg.action);
    persist(next);
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
