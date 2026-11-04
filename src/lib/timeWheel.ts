import { clamp, formatMss } from './format.ts';

/**
 * Match length on the scoreboard stays on 10-second steps.
 * Round length and rest do not use this constant.
 */
export const WHEEL_STEP_MS = 10_000;

/** Round length and rest. One second per row. */
export const SECOND_STEP_MS = 1_000;

/** :00, :10, :20, :30, :40, and :50. */
export const TENS_MARK_MS = 10_000;

/**
 * A flick faster than this (pixels per millisecond) is left on the second it
 * reaches. Slower scrolls can settle onto a nearby tens mark.
 */
export const WHEEL_FLICK_PX_PER_MS = 0.55;

export type WheelRange = {
  minMs: number;
  maxMs: number;
  stepMs: number;
  /** Values that sit on the step grid and are called out as chips in the picker. */
  snapsMs?: readonly number[];
  /** Every 10 seconds is a visual mark and a slow-scroll detent. Not a chip row. */
  tensDetent?: boolean;
};

export type WheelOption = {
  value: number;
  label: string;
  snap?: boolean;
  /** Ten-second mark. Bolder row, longer tick, and a gentle slow-scroll catch. */
  detent?: boolean;
};

/** Round length. Default 5:00. 1:00 through 60:00, one second at a time. */
export const ROUND_LENGTH_RANGE: WheelRange = {
  minMs: 60_000,
  maxMs: 60 * 60_000,
  stepMs: SECOND_STEP_MS,
  tensDetent: true,
};

/** Break / rest. Default 0:30. 0:00 (no rest) through 10:00, one second at a time. */
export const REST_RANGE: WheelRange = {
  minMs: 0,
  maxMs: 10 * 60_000,
  stepMs: SECOND_STEP_MS,
  tensDetent: true,
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
 * A saved whole second stays that second. A value under the minimum lands on
 * the minimum (a 0:30 round becomes 1:00). A value past the maximum lands on
 * the maximum.
 */
export function snapDurationMs(ms: number, range: WheelRange, fallback: number): number {
  if (!Number.isFinite(ms)) return fallback;
  const snapped = Math.round(ms / range.stepMs) * range.stepMs;
  return clamp(snapped, range.minMs, range.maxMs);
}

export type WheelSample = { t: number; top: number };

/**
 * Peak speed while the list was still moving. The last 40ms are the stop, so
 * a flick stays fast even though scrolling has ended.
 */
export function wheelGestureSpeed(samples: readonly WheelSample[]): number {
  if (samples.length < 2) return 0;
  const end = samples[samples.length - 1].t;
  let peak = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (end - samples[i].t < 40) continue;
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= 0) continue;
    const speed = Math.abs(samples[i].top - samples[i - 1].top) / dt;
    if (speed > peak) peak = speed;
  }
  return peak;
}

/**
 * Slow scrolls within two seconds of a tens mark land on that mark.
 * A fast flick, or a stop farther than two seconds from a mark, stays on the
 * centered second. Keyboard and direct picks should not call this.
 */
export function detentIndex(
  index: number,
  options: readonly { detent?: boolean }[],
  speedPxPerMs: number,
  radius = 2,
): number {
  if (!options.length) return 0;
  const centered = clamp(Math.round(index), 0, options.length - 1);
  if (speedPxPerMs > WHEEL_FLICK_PX_PER_MS) return centered;
  let best = -1;
  let bestDist = radius + 1;
  const start = Math.max(0, centered - radius);
  const end = Math.min(options.length - 1, centered + radius);
  for (let i = start; i <= end; i += 1) {
    if (!options[i]?.detent) continue;
    const dist = Math.abs(i - centered);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best >= 0 ? best : centered;
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
      detent: range.tensDetent === true && ms % TENS_MARK_MS === 0,
    });
  }
  return options;
}
