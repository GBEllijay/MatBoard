/**
 * Loop length for a clip opened on the Daily Lesson Plan.
 * Same rules as Daily Training Videos: a manual technique length wins,
 * otherwise the block's expected time. Warm-up and cool down with no
 * expected text stay an untimed loop (0).
 */

import { lessonExpectedText, loopSecondsForSlot } from './expectedDuration.ts';
import { parallelVideoSlot, type LessonSlotRef } from './lessonLinks.ts';
import { DEFAULT_DRILL_SEC, type VideoPlan } from './techniqueLogic.ts';

type LessonTimes = {
  warmupExpected: string;
  cooldownExpected: string;
  techniques: readonly { expected: string }[];
};

/** Milliseconds for a timed loop, or undefined when the clip should loop with no clock. */
export function lessonClipLoopMs(
  plan: LessonTimes,
  videos: VideoPlan | null,
  ref: LessonSlotRef,
): number | undefined {
  const slot = videos ? parallelVideoSlot(videos, ref) : null;
  const seconds = loopSecondsForSlot(
    {
      kind: ref.role,
      drillSec: slot?.drillSec ?? DEFAULT_DRILL_SEC,
      drillManual: slot?.drillManual,
    },
    lessonExpectedText(plan, { kind: ref.role }, ref.role === 'technique' ? ref.index : 0),
  );
  return seconds > 0 ? seconds * 1000 : undefined;
}
