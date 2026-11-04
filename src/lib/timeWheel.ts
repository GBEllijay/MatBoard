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

/** Row height. Matches `.wheel-item` in `src/index.css`. */
export const WHEEL_ITEM_PX = 48;

/** Visible window. Matches `.wheel-scroller` height. */
export const WHEEL_WINDOW_PX = 240;

/**
 * Hard mouse-wheel and trackpad deltas are multiplied by at most this.
 * Smaller deltas stay 1:1 so a light swipe is not exaggerated.
 */
export const WHEEL_DELTA_GAIN_MAX = 1.45;

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
  /** Bolder row, longer tick, and a gentle slow-scroll catch. A fast flick passes through. */
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

/**
 * Match length. 10-second steps from 0:10 through the existing 180:00 custom ceiling.
 * 3:00, 5:00, and 10:00 are snap points on that grid.
 */
export const MATCH_LENGTH_RANGE: WheelRange = {
  minMs: WHEEL_STEP_MS,
  maxMs: 180 * 60_000,
  stepMs: WHEEL_STEP_MS,
  snapsMs: [3 * 60_000, 5 * 60_000, 10 * 60_000],
};

export const DEFAULT_MATCH_MS = 5 * 60_000;

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

/** Nearest row for a scroll offset. Always a real index. */
export function nearestRowIndex(scrollTop: number, count: number, itemPx = WHEEL_ITEM_PX): number {
  if (count <= 0 || !Number.isFinite(scrollTop) || itemPx <= 0) return 0;
  return clamp(Math.round(scrollTop / itemPx), 0, count - 1);
}

/** Scroll offset that centers `index` in the wheel window. */
export function centeredScrollTop(index: number, itemPx = WHEEL_ITEM_PX): number {
  if (!Number.isFinite(index) || itemPx <= 0) return 0;
  return Math.round(index) * itemPx;
}

/**
 * Where a coast lands.
 * A direct pick (tap, arrow, chip) stays on the centered row.
 * A slow scroll within two rows of a detent lands on that detent.
 * A fast flick stays on the nearest row, so the coast is not pulled backward.
 */
export function settleRowIndex(
  scrollTop: number,
  options: readonly { detent?: boolean }[],
  speedPxPerMs: number,
  precise: boolean,
  itemPx = WHEEL_ITEM_PX,
): number {
  const centered = nearestRowIndex(scrollTop, options.length, itemPx);
  if (precise) return centered;
  return detentIndex(centered, options, speedPxPerMs);
}

/** True when the samples left the row they started on. */
export function wheelGestureMoved(samples: readonly WheelSample[], slop = 0.5): boolean {
  if (samples.length < 2) return false;
  const origin = samples[0]?.top ?? 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (Math.abs((samples[i]?.top ?? origin) - origin) > slop) return true;
  }
  return false;
}

/**
 * A finger-down that never moved, already sitting on a row, must not be
 * re-snapped onto a nearby detent. A real drag, a coast that stopped between
 * rows, or a direct pick still settles.
 */
export function shouldSettleWheel(
  scrollTop: number,
  count: number,
  samples: readonly WheelSample[],
  precise: boolean,
  originTop: number,
  itemPx = WHEEL_ITEM_PX,
): boolean {
  if (precise) return true;
  if (wheelGestureMoved(samples)) return true;
  if (Number.isFinite(originTop) && Math.abs(scrollTop - originTop) > 0.5) return true;
  const nearest = nearestRowIndex(scrollTop, count, itemPx);
  return Math.abs(scrollTop - centeredScrollTop(nearest, itemPx)) > 0.5;
}

/**
 * Pixel distance for one wheel or trackpad delta.
 * Pixel deltas (trackpads and most mouse wheels) pass through, and a hard
 * flick larger than one row picks up a modest gain, capped. Line deltas become
 * a fraction of a row. Page deltas move one window. Both stay proportional
 * to the reported delta.
 */
export function wheelDeltaPx(
  deltaY: number,
  deltaMode: number,
  itemPx = WHEEL_ITEM_PX,
  pagePx = WHEEL_WINDOW_PX,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0 || itemPx <= 0) return 0;
  const raw = deltaMode === 1 ? deltaY * (itemPx / 3) : deltaMode === 2 ? deltaY * pagePx : deltaY;
  // Line and page deltas are already a chosen distance. Pixel deltas (trackpad
  // and most mouse wheels) pick up a modest gain once they pass one row.
  if (deltaMode !== 0) return raw;
  const abs = Math.abs(raw);
  const gain = abs <= itemPx ? 1 : Math.min(WHEEL_DELTA_GAIN_MAX, 1 + (abs - itemPx) / (itemPx * 10));
  return raw * gain;
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
