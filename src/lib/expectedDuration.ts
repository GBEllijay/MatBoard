/**
 * Expected duration on a Daily Lesson Plan or Competition Class block.
 * Whole minutes, 1 through 60. The coach picks them on the shared scroll wheel
 * (`WheelPicker`), the same wheel the round timer uses.
 * No quick-pick chips: the wheel alone, to keep the block uncluttered.
 * 5, 10, and 15 are slow-scroll detents. A fast flick passes through them.
 *
 * Stored value is a minute count such as "8". Older saves used free text:
 * "8:00", "1:30", "8 min", "10 minutes". Those migrate to a whole minute.
 * Blank stays blank and means the 5-minute default, so an untouched plan is
 * not saved just because every block shows 5.
 *
 * Loop length precedence when a block has a looping video:
 * 1. A manual length on the Daily Training Videos card wins. That is the
 *    2:30 / 5:00 / 7:00 preset or the Custom stepper (`drillManual`), and any
 *    saved technique length that is not the untouched 5:00 default.
 * 2. Otherwise the block's expected minutes are the loop length. Blank is 5.
 *    Warm-up and Cool down use this when the video was opened from that class
 *    plan. Opened from the videos menu, with no class plan, they still loop
 *    with no time limit.
 * 3. Intro, Specific Training, and Game have the wheel and no video slot, so
 *    there is no loop to drive.
 * Competition class "Looping video" cards have no separate length control.
 * Their loop is the expected minutes (`expectedToWorkMs`). The round timer
 * opened from a block still starts at those minutes, then its own wheel
 * clamps the work period to 1:00–60:00.
 */

import { DEFAULT_DRILL_SEC } from './techniqueLogic.ts';

export const EXPECTED_MIN_MINUTES = 1;
export const EXPECTED_MAX_MINUTES = 60;
export const DEFAULT_EXPECTED_MINUTES = 5;

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

/** One row per minute. Labels are "5 min", never m:ss. */
export const EXPECTED_MINUTE_OPTIONS: readonly ExpectedMinuteOption[] = Array.from(
  { length: EXPECTED_MAX_MINUTES - EXPECTED_MIN_MINUTES + 1 },
  (_, index) => {
    const value = EXPECTED_MIN_MINUTES + index;
    return {
      value,
      label: `${value} min`,
      snap: EXPECTED_SNAP_SET.has(value),
      detent: EXPECTED_DETENT_SET.has(value),
    };
  },
);

function clampMinute(minutes: number): number {
  return Math.min(EXPECTED_MAX_MINUTES, Math.max(EXPECTED_MIN_MINUTES, minutes));
}

/**
 * Whole minutes, or null when the text is not a duration.
 * "8:00" and "1:30" are m:ss (8 minutes, 1 minute 30 seconds).
 * Seconds round to the nearest minute. Under 30 seconds lands on 1, the
 * shortest row. "8 min" and "10 minutes" are minute counts.
 */
export function parseExpectedMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (clock) {
    const totalSeconds = Number(clock[1]) * 60 + Number(clock[2]);
    return clampMinute(Math.round(totalSeconds / 60));
  }
  const words = /^(\d{1,3})(?:\s*(?:minutes|minute|mins|min|m))?$/i.exec(trimmed);
  if (words) return clampMinute(Math.round(Number(words[1])));
  const decimal = /^(\d{1,3}\.\d+)$/.exec(trimmed);
  if (decimal) return clampMinute(Math.round(Number(decimal[1])));
  return null;
}

/**
 * Value to store. A clock or minute phrase becomes "8". Blank stays blank.
 * Text that is not a duration is kept (trimmed) so a note is not thrown away.
 */
export function migrateExpectedDuration(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const minutes = parseExpectedMinutes(trimmed);
  if (minutes == null) return trimmed;
  return String(minutes);
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
    const manual = slot.drillManual === true || slot.drillSec !== DEFAULT_DRILL_SEC;
    if (manual || expected == null) return slot.drillSec;
    return expectedMinutes(expected) * 60;
  }
  if (expected == null) return 0;
  return expectedMinutes(expected) * 60;
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
