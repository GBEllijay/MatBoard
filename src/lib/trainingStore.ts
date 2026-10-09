import { clamp } from './format.ts';
import { endCueFollowMs, playSelectedEndCue, playStartCue, playWarningCue } from './audio.ts';

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
};

const STORAGE_KEY = 'matboard.training.v1';
export const WORK_PRESETS_MIN = [1, 2, 5, 10] as const;
export const BREAK_PRESETS_MS = [0, 30_000, 60_000] as const;
export const MIN_WORK_MS = 1_000;
export const MAX_WORK_MS = (99 * 60 + 59) * 1_000;
export const MIN_BREAK_MS = 0;
export const MAX_BREAK_MS = 10 * 60_000;

export function clampWorkMs(ms: number): number {
  if (!Number.isFinite(ms)) return 5 * 60_000;
  return clamp(Math.round(ms / 1000) * 1000, MIN_WORK_MS, MAX_WORK_MS);
}

export function clampBreakMs(ms: number): number {
  if (!Number.isFinite(ms)) return 30_000;
  return clamp(Math.round(ms / 1000) * 1000, MIN_BREAK_MS, MAX_BREAK_MS);
}

export function isWorkPreset(ms: number): boolean {
  return WORK_PRESETS_MIN.some((minutes) => minutes * 60_000 === ms);
}

export function isBreakPreset(ms: number): boolean {
  return BREAK_PRESETS_MS.some((preset) => preset === ms);
}

const listeners = new Set<() => void>();

export function defaultTraining(): TrainingState {
  const workMs = 5 * 60_000;
  return {
    workMs,
    breakMs: 30_000,
    rounds: 5,
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
    startSound: parsed.startSound !== false,
    warningSound: parsed.warningSound !== false,
    endSound: parsed.endSound !== false,
    running: false,
    startedAt: null,
    warned: Boolean(parsed.warned),
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

function persist(next: TrainingState): void {
  state = next;
  const stored = { ...next, running: false, startedAt: null };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  listeners.forEach((fn) => fn());
}

export function remainingTraining(s: TrainingState, now = Date.now()): number {
  if (!s.running || s.startedAt == null) return s.remainingMs;
  return Math.max(0, s.remainingMs - (now - s.startedAt));
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
    rounds: clamp(rounds, 1, 99),
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

export function toggleTrainingClock(): void {
  if (state.running) {
    persist({
      ...state,
      running: false,
      remainingMs: remainingTraining(state),
      startedAt: null,
    });
    return;
  }
  const remaining = remainingTraining(state);
  const restarting = remaining <= 0;
  persist({
    ...state,
    running: true,
    remainingMs: restarting ? (state.phase === 'work' ? state.workMs : state.breakMs) : remaining,
    startedAt: Date.now(),
    warned: restarting ? false : state.warned,
  });
  playTrainStartCue();
}

function playTrainEndCue(): void {
  if (!state.endSound) return;
  playSelectedEndCue('training');
}

function playTrainStartCue(): void {
  if (!state.startSound) return;
  playStartCue();
}

function followWithStartCue(): void {
  if (!state.startSound) return;
  if (state.endSound) {
    window.setTimeout(() => playStartCue(), endCueFollowMs());
    return;
  }
  playStartCue();
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
  if (!state.running) return;
  const left = remainingTraining(state);
  if (state.phase === 'work' && !state.warned && left <= 10_000 && left > 0) {
    const warningSound = state.warningSound;
    persist({ ...state, warned: true });
    if (warningSound) playWarningCue();
  }
  if (left > 0) return;
  if (state.phase === 'work') nextAfterWork();
  else nextAfterBreak();
}
