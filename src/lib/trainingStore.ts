import { endCueFollowMs, playManualStartSound, playSelectedEndCue, playTrainingStart, playWarningCue } from './audio.ts';
import { isFirstStart } from './startSoundPolicy.ts';
import {
  DEFAULT_REST_MS,
  DEFAULT_ROUNDS,
  DEFAULT_WORK_MS,
  REST_RANGE,
  ROUND_LENGTH_RANGE,
  snapDurationMs,
  snapRounds,
} from './timeWheel.ts';

export type TrainingPhase = 'work' | 'break';

export type TrainingState = {
  workMs: number;
  breakMs: number;
  rounds: number;
  endless: boolean;
  remainingMs: number;
  running: boolean;
  startedAt: number | null;
  phase: TrainingPhase;
  currentRound: number;
  warned: boolean;
  /** Rising start cue. On unless an older save turned it off. */
  startSound: boolean;
  /** Ten-second warning ticks. On unless an older save turned it off. */
  warningSound: boolean;
  /** Round/session end cue. Parallel to Match `endBuzzer`. */
  endSound: boolean;
  /** Bumped on every local persist so a stale tab cannot overwrite a newer clock. */
  revision: number;
};

const STORAGE_KEY = 'matboard.training.v1';
const CHANNEL_NAME = 'matboard-training-v1';
const PRESENCE_KEY = 'matboard.training.presence.v1';
const TRANSITION_KEY = 'matboard.training.transition.v1';
const PRESENCE_TTL_MS = 2_000;
/** Wheel bounds. Saved values snap onto these in clampWorkMs / clampBreakMs. */
export const MIN_WORK_MS = ROUND_LENGTH_RANGE.minMs;
export const MAX_WORK_MS = ROUND_LENGTH_RANGE.maxMs;
export const MIN_BREAK_MS = REST_RANGE.minMs;
export const MAX_BREAK_MS = REST_RANGE.maxMs;

export function clampWorkMs(ms: number): number {
  return snapDurationMs(ms, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS);
}

export function clampBreakMs(ms: number): number {
  return snapDurationMs(ms, REST_RANGE, DEFAULT_REST_MS);
}

const listeners = new Set<() => void>();

export function defaultTraining(): TrainingState {
  const workMs = DEFAULT_WORK_MS;
  return {
    workMs,
    breakMs: DEFAULT_REST_MS,
    rounds: DEFAULT_ROUNDS,
    endless: false,
    remainingMs: workMs,
    running: false,
    startedAt: null,
    phase: 'work',
    currentRound: 1,
    warned: false,
    startSound: true,
    warningSound: true,
    endSound: true,
    revision: 0,
  };
}

/** Older saves omit the start and warning switches. Those stay on. */
export function normalizeStoredTraining(parsed: Partial<TrainingState> | null | undefined): TrainingState {
  const base = defaultTraining();
  if (!parsed) return base;
  return {
    ...base,
    ...parsed,
    workMs: clampWorkMs(typeof parsed.workMs === 'number' ? parsed.workMs : base.workMs),
    breakMs: clampBreakMs(typeof parsed.breakMs === 'number' ? parsed.breakMs : base.breakMs),
    rounds: snapRounds(typeof parsed.rounds === 'number' ? parsed.rounds : base.rounds),
    startSound: parsed.startSound !== false,
    warningSound: parsed.warningSound !== false,
    endSound: parsed.endSound !== false,
    running: parsed.running === true && typeof parsed.startedAt === 'number',
    startedAt: parsed.running === true && typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
    warned: Boolean(parsed.warned),
    revision: typeof parsed.revision === 'number' && Number.isFinite(parsed.revision) ? parsed.revision : 0,
  };
}

function load(): TrainingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTraining();
    const parsed = JSON.parse(raw) as Partial<TrainingState>;
    return normalizeStoredTraining(parsed);
  } catch {
    return defaultTraining();
  }
}

let state: TrainingState = load();

let channel: BroadcastChannel | null = null;
let applyingRemote = false;
let syncReady = false;
const tabId = `t${Math.random().toString(36).slice(2, 10)}`;

function persist(next: TrainingState): void {
  const stamped = applyingRemote ? next : { ...next, revision: (next.revision ?? 0) + 1 };
  state = stamped;
  if (!applyingRemote) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
      channel?.postMessage({ type: 'state', state: stamped });
    } catch {
      /* quota / private mode */
    }
  }
  listeners.forEach((fn) => fn());
}

function readPresence(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PRESENCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writePresence(map: Record<string, number>): void {
  try {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function touchTrainingPresence(at = Date.now()): void {
  const map = readPresence();
  map[tabId] = at;
  for (const [id, seen] of Object.entries(map)) {
    if (at - seen > PRESENCE_TTL_MS) delete map[id];
  }
  writePresence(map);
}

export function otherTrainingTabsLive(at = Date.now()): boolean {
  const map = readPresence();
  return Object.entries(map).some(([id, seen]) => id !== tabId && at - seen < PRESENCE_TTL_MS);
}

function clearTrainingPresence(): void {
  const map = readPresence();
  delete map[tabId];
  writePresence(map);
}

function claimTransition(id: string): boolean {
  try {
    if (localStorage.getItem(TRANSITION_KEY) === id) return false;
    localStorage.setItem(TRANSITION_KEY, id);
    return true;
  } catch {
    return true;
  }
}

/** Apply a clock snapshot from another tab. Ignores an older revision. Does not replay cues. */
export function applyRemoteTraining(incoming: TrainingState): void {
  if (!incoming || typeof incoming !== 'object') return;
  const next = normalizeStoredTraining(incoming);
  if (incoming.running === true && typeof incoming.startedAt === 'number') {
    next.running = true;
    next.startedAt = incoming.startedAt;
  }
  if (typeof incoming.revision === 'number' && incoming.revision < state.revision) return;
  applyingRemote = true;
  persist(next);
  applyingRemote = false;
}

export function initTrainingSync(): void {
  if (syncReady || typeof window === 'undefined') return;
  syncReady = true;
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (ev) => {
      const data = ev.data as { type?: string; state?: TrainingState } | null;
      if (data?.type === 'state' && data.state) applyRemoteTraining(data.state);
    };
  }
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY || !ev.newValue) return;
    try {
      applyRemoteTraining(JSON.parse(ev.newValue) as TrainingState);
    } catch {
      /* ignore */
    }
  });
}

export function remainingTraining(s: TrainingState, now = Date.now()): number {
  if (!s.running || s.startedAt == null) return s.remainingMs;
  return Math.max(0, s.remainingMs - (now - s.startedAt));
}

export function trainingClockActionLabel(
  s: TrainingState,
  now = Date.now(),
): 'Pause' | 'Restart' | 'Resume' | 'Start' {
  if (s.running) return 'Pause';
  const remaining = remainingTraining(s, now);
  if (remaining <= 0) return 'Restart';
  const duration = s.phase === 'break' ? s.breakMs : s.workMs;
  if (remaining < duration) return 'Resume';
  return 'Start';
}

export function getTraining(): TrainingState {
  return state;
}

export function subscribeTraining(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setWorkMs(workMs: number): void {
  const next = clampWorkMs(workMs);
  persist({
    ...state,
    workMs: next,
    remainingMs: state.phase === 'work' && !state.running ? next : state.remainingMs,
    running: false,
    startedAt: null,
    warned: false,
  });
}

export function setBreakMs(breakMs: number): void {
  const next = clampBreakMs(breakMs);
  persist({
    ...state,
    breakMs: next,
    remainingMs: state.phase === 'break' && !state.running ? next : state.remainingMs,
    running: false,
    startedAt: null,
  });
}

export function setStartSound(startSound: boolean): void {
  persist({ ...state, startSound });
}

export function setWarningSound(warningSound: boolean): void {
  persist({ ...state, warningSound });
}

export function setEndSound(endSound: boolean): void {
  persist({ ...state, endSound });
}

export function setRounds(rounds: number, endless: boolean): void {
  persist({
    ...state,
    rounds: snapRounds(rounds),
    endless,
  });
}

export function resetTrainingSession(): void {
  persist({
    ...state,
    remainingMs: state.workMs,
    running: false,
    startedAt: null,
    phase: 'work',
    currentRound: 1,
    warned: false,
  });
}

/**
 * Hold on the clock. Restores the configured length of the period on screen:
 * full work time during work, full rest time during rest. Not zero.
 * The round number and the length, rest, and rounds settings stay.
 */
export function resetTrainingPeriod(): void {
  const remainingMs = state.phase === 'break' ? state.breakMs : state.workMs;
  persist({
    ...state,
    remainingMs,
    running: false,
    startedAt: null,
    warned: false,
  });
}

export function toggleTrainingClock(): void {
  if (state.running) {
    pauseTrainingClock();
    return;
  }
  const remaining = remainingTraining(state);
  const restarting = remaining <= 0;
  const durationMs = state.phase === 'break' ? state.breakMs : state.workMs;
  const firstStart = isFirstStart(remaining, durationMs);
  persist({
    ...state,
    running: true,
    remainingMs: restarting ? durationMs : remaining,
    startedAt: Date.now(),
    warned: restarting ? false : state.warned,
  });
  playTrainManualStartCue(firstStart);
}

/**
 * Freeze the clock where it stands. No start or end cue.
 * Leaving the round timer uses this so time away cannot finish the round.
 */
export function pauseTrainingClock(): void {
  ignoreExpiredCatchUp = false;
  if (!state.running) return;
  persist({
    ...state,
    running: false,
    remainingMs: remainingTraining(state),
    startedAt: null,
  });
}

/** Longer than a same-gesture hop between the rounds display and the controller. */
const CATCH_UP_GAP_MS = 1_000;

let attachedScreens = 0;
let ignoreExpiredCatchUp = false;
let lastLiveTickAt: number | null = null;

/**
 * One mounted rounds screen (display or controller). The clock keeps running
 * while either is on screen. The last one to leave freezes it, with no cue.
 * A later mount's first tick cannot catch up across that gap and buzz.
 */
export function attachTrainingScreen(): () => void {
  attachedScreens += 1;
  touchTrainingPresence();
  if (attachedScreens === 1) {
    const gap = lastLiveTickAt == null ? Number.POSITIVE_INFINITY : Date.now() - lastLiveTickAt;
    ignoreExpiredCatchUp = state.running && remainingTraining(state) <= 0 && gap > CATCH_UP_GAP_MS;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    attachedScreens -= 1;
    if (attachedScreens > 0) return;
    clearTrainingPresence();
    queueMicrotask(() => {
      if (attachedScreens === 0 && !otherTrainingTabsLive()) pauseTrainingClock();
    });
  };
}

function playTrainEndCue(): void {
  if (!state.endSound) return;
  playSelectedEndCue('training');
}

function playTrainStartCue(): void {
  if (!state.startSound) return;
  playTrainingStart();
}

/** Manual begin only. Automatic work/rest transitions still use playTrainStartCue. */
function playTrainManualStartCue(firstStart: boolean): void {
  if (!state.startSound) return;
  playManualStartSound(firstStart);
}

function followWithStartCue(): void {
  if (!state.startSound) return;
  if (state.endSound) {
    window.setTimeout(() => playTrainingStart(), endCueFollowMs());
    return;
  }
  playTrainingStart();
}

function nextAfterWork(): void {
  const lastRound = !state.endless && state.currentRound >= state.rounds;
  if (lastRound) {
    persist({
      ...state,
      running: false,
      remainingMs: 0,
      startedAt: null,
      warned: false,
    });
    playTrainEndCue();
    return;
  }
  if (state.breakMs <= 0) {
    persist({
      ...state,
      phase: 'work',
      currentRound: state.currentRound + 1,
      remainingMs: state.workMs,
      startedAt: Date.now(),
      running: true,
      warned: false,
    });
    playTrainEndCue();
    followWithStartCue();
    return;
  }
  persist({
    ...state,
    phase: 'break',
    remainingMs: state.breakMs,
    startedAt: Date.now(),
    running: true,
    warned: false,
  });
  playTrainEndCue();
}

function nextAfterBreak(): void {
  persist({
    ...state,
    phase: 'work',
    currentRound: state.currentRound + 1,
    remainingMs: state.workMs,
    startedAt: Date.now(),
    running: true,
    warned: false,
  });
  playTrainStartCue();
}

export function tickTraining(): void {
  if (attachedScreens > 0) touchTrainingPresence();
  if (!state.running) return;
  // First tick after a screen mounts onto a clock that already hit zero while
  // nobody was ticking. Freeze. Do not end the round or play a cue.
  if (ignoreExpiredCatchUp) {
    ignoreExpiredCatchUp = false;
    if (remainingTraining(state) <= 0) {
      pauseTrainingClock();
      return;
    }
  }
  lastLiveTickAt = Date.now();
  const left = remainingTraining(state);
  if (state.phase === 'work' && !state.warned && left <= 10_000 && left > 0) {
    const warningSound = state.warningSound;
    if (claimTransition(`warn:${state.startedAt ?? 0}`)) {
      persist({ ...state, warned: true });
      if (warningSound) playWarningCue();
    }
  }
  // The end cue starts in this same tick, as soon as remaining hits 0.
  // It does not wait for the 0:00 paint or a requestAnimationFrame.
  if (left > 0) return;
  if (!claimTransition(`expire:${state.phase}:${state.currentRound}:${state.startedAt ?? 0}`)) return;
  if (state.phase === 'work') nextAfterWork();
  else nextAfterBreak();
}
