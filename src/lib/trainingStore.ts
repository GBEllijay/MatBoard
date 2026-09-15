import { clamp } from './format';
import { playEndBuzzer, playStartCue, playWarningCue } from './audio';

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
};

const STORAGE_KEY = 'matboard.training.v1';
export const WORK_PRESETS_MIN = [1, 2, 5, 10] as const;
export const BREAK_PRESETS_MS = [0, 30_000, 60_000] as const;

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
  };
}

function load(): TrainingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTraining();
    const parsed = JSON.parse(raw) as Partial<TrainingState>;
    const base = defaultTraining();
    return {
      ...base,
      ...parsed,
      running: false,
      startedAt: null,
      warned: Boolean(parsed.warned),
    };
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

export function patchTraining(partial: Partial<TrainingState>): void {
  persist({ ...state, ...partial });
}

export function setWorkMs(workMs: number): void {
  persist({
    ...state,
    workMs,
    remainingMs: state.phase === 'work' && !state.running ? workMs : state.remainingMs,
    running: false,
    startedAt: null,
    warned: false,
  });
}

export function setBreakMs(breakMs: number): void {
  persist({
    ...state,
    breakMs,
    remainingMs: state.phase === 'break' && !state.running ? breakMs : state.remainingMs,
    running: false,
    startedAt: null,
  });
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
    playEndBuzzer();
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
    playEndBuzzer();
    window.setTimeout(() => playStartCue(), 700);
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
  playEndBuzzer();
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
  playStartCue();
}

export function tickTraining(): void {
  if (!state.running) return;
  const left = remainingTraining(state);
  if (state.phase === 'work' && !state.warned && left <= 10_000 && left > 0) {
    persist({ ...state, warned: true });
    playWarningCue();
  }
  if (left > 0) return;
  if (state.phase === 'work') nextAfterWork();
  else nextAfterBreak();
}
