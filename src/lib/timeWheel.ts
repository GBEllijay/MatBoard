import { clamp, formatMss } from './format.ts';

/** Shared 10-second step for the round, rest, and match length wheels. */
export const WHEEL_STEP_MS = 10_000;

export type WheelRange = {
  minMs: number;
  maxMs: number;
  stepMs: number;
  /** Values that sit on the step grid and are called out in the picker. */
  snapsMs?: readonly number[];
};

export type WheelOption = {
  value: number;
  label: string;
  snap?: boolean;
};

/** Round length. Default 5:00. 1:00 through 60:00. */
export const ROUND_LENGTH_RANGE: WheelRange = {
  minMs: 60_000,
  maxMs: 60 * 60_000,
  stepMs: WHEEL_STEP_MS,
};

/** Break / rest. Default 0:30. 0:00 (no rest) through the previous 10:00 ceiling. */
export const REST_RANGE: WheelRange = {
  minMs: 0,
  maxMs: 10 * 60_000,
  stepMs: WHEEL_STEP_MS,
};

export const DEFAULT_WORK_MS = 5 * 60_000;
export const DEFAULT_REST_MS = 30_000;
export const DEFAULT_ROUNDS = 5;
export const ROUNDS_MIN = 1;
export const ROUNDS_MAX = 99;

export const ROUND_COUNT_OPTIONS: readonly WheelOption[] = Array.from({ length: ROUNDS_MAX }, (_, index) => {
  const value = index + 1;
  return { value, label: String(value) };
});

/**
 * Nearest wheel step, then clamped to the range.
 * A saved 7:07 round becomes 7:10. A saved 0:04 rest becomes 0:00.
 * Values under the minimum land on the minimum (a 0:30 round becomes 1:00).
 */
export function snapDurationMs(ms: number, range: WheelRange, fallback: number): number {
  if (!Number.isFinite(ms)) return fallback;
  const snapped = Math.round(ms / range.stepMs) * range.stepMs;
  return clamp(snapped, range.minMs, range.maxMs);
}

/** Saved round counts land on a whole number from 1 to 99. */
export function snapRounds(rounds: number, fallback = DEFAULT_ROUNDS): number {
  if (!Number.isFinite(rounds)) return fallback;
  return clamp(Math.round(rounds), ROUNDS_MIN, ROUNDS_MAX);
}

export function durationOptions(range: WheelRange): WheelOption[] {
  const snaps = new Set(range.snapsMs ?? []);
  const options: WheelOption[] = [];
  for (let ms = range.minMs; ms <= range.maxMs; ms += range.stepMs) {
    options.push({
      value: ms,
      label: formatMss(ms / 1000),
      snap: snaps.has(ms),
    });
  }
  return options;
}
