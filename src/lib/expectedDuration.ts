/**
 * Expected duration on a Daily Lesson Plan or Competition Class block.
 * 15-second steps, 0:30 through 60:00. The coach picks them on the shared
 * scroll wheel (`WheelPicker`). Labels are m:ss. No quick-pick chips.
 * 5, 10, and 15 minute rows are slow-scroll detents. A fast flick passes
 * through them. The coast still settles with the shared two-row catch
 * (30 seconds at this step).
 *
 * Stored value is a minute count: "8", "8.5", "8.25", or "8.75". Whole
 * minutes stay whole, so an existing save of "8" still reads as 8 and shows
 * 8:00. A saved half ("8.5") still reads as 8:30. Older free text migrates
 * onto the 15-second grid: "8:00" becomes "8", "8:15" becomes "8.25",
 * "1:30" becomes "1.5", "8 min" becomes "8". Under 30 seconds lands on 0.5.
 * Above 60 clamps to 60. Blank stays blank and means the 5-minute default,
 * so an untouched plan is not saved just because every block shows 5.
 *
 * Loop length precedence when a block has a looping video:
 * 1. A length the coach set on the Daily Training Videos card wins
 *    (`drillManual`: the 2:30 / 5:00 / 7:00 preset or the Custom stepper).
 * 2. Otherwise, when this technique's expected time is set, that time is the
 *    countdown. "8:15" and "8.25" are 8 minutes 15 seconds. A saved length
 *    that is not 5:00 still yields to the expected time until the coach
 *    changes it on the video card.
 * 3. When no expected time is set, the card keeps its own length.
 *    Warm-up and Cool down use the expected minutes when the video was opened
 *    from that class plan. Blank there is 5. Opened from the videos menu,
 *    with no class plan, they still loop with no time limit.
 * 4. Intro, Specific Training, and Game have the wheel and no video slot, so
 *    there is no loop to drive.
 * Competition class "Looping video" cards have no separate length control.
 * Their loop is the expected minutes (`expectedToWorkMs`). The round timer
 * opened from a block starts at those minutes (8.5 is 8:30, 8.25 is 8:15). Its own
 * wheel still clamps the work period to 1:00–60:00, so 0:30 opens at 1:00.
 */

import { formatMss } from './format.ts';

/** Shortest row: 0:30. Fifteen seconds below that is not a class block. */
export const EXPECTED_MIN_MINUTES = 0.5;
export const EXPECTED_MAX_MINUTES = 60;
/** 15 seconds, as a fraction of a minute. */
export const EXPECTED_STEP_MINUTES = 0.25;
export const DEFAULT_EXPECTED_MINUTES = 5;

const MIN_QUARTERS = Math.round(EXPECTED_MIN_MINUTES * 4);
const MAX_QUARTERS = EXPECTED_MAX_MINUTES * 4;

export type ExpectedMinuteOption = {
  value: number;
  label: string;
  /** Chip above the wheel. */
  snap?: boolean;
  /** Slow-scroll catch, same two-row radius as the round timer's tens marks. */
  detent?: boolean;
};

/** No chips above the expected-duration wheel (owner: less clutter). */
export const EXPECTED_SNAP_MINUTES: readonly number[] = [];

/** Slow-scroll catches. Fast flicks do not land here unless they stop on the row. */
export const EXPECTED_DETENT_MINUTES = [5, 10, 15] as const;

const EXPECTED_SNAP_SET = new Set<number>(EXPECTED_SNAP_MINUTES);
const EXPECTED_DETENT_SET = new Set<number>(EXPECTED_DETENT_MINUTES);

const MINUTE_WORD = /^(?:(\d{1,3})\s*)?½(?:\s*(?:minutes|minute|mins|min|m))?$/i;
const MINUTE_COUNT = /^(\d{1,3}(?:\.\d+)?)(?:\s*(?:minutes|minute|mins|min|m))?$/i;

function clampQuarters(quarters: number): number {
  if (!Number.isFinite(quarters)) return MIN_QUARTERS;
  return Math.min(MAX_QUARTERS, Math.max(MIN_QUARTERS, Math.round(quarters)));
}

/**
 * Stored minute count. "8" for a whole minute, "8.5" for a half, "8.25" and
 * "8.75" for the other 15-second rows. Whole minutes stay whole.
 */
export function formatExpectedDuration(minutes: number): string {
  const quarters = clampQuarters(Math.round(minutes * 4));
  const whole = Math.floor(quarters / 4);
  const rem = quarters % 4;
  if (rem === 0) return String(whole);
  if (rem === 2) return whole === 0 ? '0.5' : `${whole}.5`;
  return (quarters / 4).toFixed(2);
}

/** Wheel label. "8:00", "8:15", "8:30", "8:45", and "0:30". */
export function expectedDurationLabel(minutes: number): string {
  const quarters = clampQuarters(Math.round(minutes * 4));
  return formatMss(quarters * 15);
}

/** One row per 15 seconds, from 0:30 through 60:00. Labels are m:ss. */
export const EXPECTED_MINUTE_OPTIONS: readonly ExpectedMinuteOption[] = Array.from(
  { length: MAX_QUARTERS - MIN_QUARTERS + 1 },
  (_, index) => {
    const value = (MIN_QUARTERS + index) / 4;
    return {
      value,
      label: expectedDurationLabel(value),
      snap: EXPECTED_SNAP_SET.has(value),
      detent: EXPECTED_DETENT_SET.has(value),
    };
  },
);

/**
 * Minutes on the 15-second grid, or null when the text is not a duration.
 * "8:00" is 8. "8:15" is 8.25. "1:30" is 1.5. Seconds snap to the nearest
 * 15, then clamp from 0.5 through 60. "8 min", "8.5", and "8½ min" are
 * minute counts.
 */
export function parseExpectedMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (clock) {
    const totalSeconds = Number(clock[1]) * 60 + Number(clock[2]);
    return clampQuarters(Math.round(totalSeconds / 15)) / 4;
  }
  const fraction = MINUTE_WORD.exec(trimmed);
  if (fraction) {
    const whole = fraction[1] ? Number(fraction[1]) : 0;
    return clampQuarters(whole * 4 + 2) / 4;
  }
  const words = MINUTE_COUNT.exec(trimmed);
  if (!words) return null;
  return clampQuarters(Math.round(Number(words[1]) * 4)) / 4;
}

/**
 * Value to store. A clock or minute phrase becomes "8", "8.25", "8.5", or
 * "8.75". Blank stays blank. Text that is not a duration is kept (trimmed).
 */
export function migrateExpectedDuration(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const minutes = parseExpectedMinutes(trimmed);
  if (minutes == null) return trimmed;
  return formatExpectedDuration(minutes);
}

/** Minutes the wheel and the loop use. Blank or unreadable text is 5. */
export function expectedMinutes(value: string, fallback = DEFAULT_EXPECTED_MINUTES): number {
  const minutes = parseExpectedMinutes(value);
  if (minutes == null) return fallback;
  return minutes;
}

export type LoopSlot = {
  kind: 'warmup' | 'technique' | 'cooldown';
  drillSec: number;
  /** Set when the coach picks a preset or the custom stepper, including 5:00. */
  drillManual?: boolean;
};

/**
 * Seconds the looping video should run.
 * `expected` null means this video was not opened from a class plan.
 * A return of 0 means keep the untimed loop (warm-up and cool down off a plan).
 */
export function loopSecondsForSlot(slot: LoopSlot, expected: string | null): number {
  if (slot.kind === 'technique') {
    // No class plan, a blank expected time, or a length set on the video card:
    // keep the card's own countdown.
    if (expected == null || slot.drillManual === true) return slot.drillSec;
    const chosen = parseExpectedMinutes(expected);
    if (chosen == null) return slot.drillSec;
    return Math.round(chosen * 60);
  }
  if (expected == null) return 0;
  return Math.round(expectedMinutes(expected) * 60);
}

type LessonDurationPlan = {
  warmupExpected: string;
  cooldownExpected: string;
  techniques: readonly { expected: string }[];
};

/**
 * Expected text for the video slot that pairs with this lesson block.
 * Null when no class plan is open. Warm-up, technique N, and cool down only.
 */
export function lessonExpectedText(
  plan: LessonDurationPlan | null,
  slot: { kind: 'warmup' | 'technique' | 'cooldown' },
  techniqueOrdinal: number,
): string | null {
  if (!plan) return null;
  if (slot.kind === 'warmup') return plan.warmupExpected;
  if (slot.kind === 'cooldown') return plan.cooldownExpected;
  return plan.techniques[techniqueOrdinal]?.expected ?? '';
}
