/**
 * Lesson plans on Advantage Cloud: one gym template per day, plus one copy per instructor.
 *
 *   groups/{license}/lessons/current/{week}/{date}.json                       the gym template
 *   groups/{license}/lessons/instructors/{instructorId}/{week}/{date}.json    one instructor's plan
 *
 * `instructorId` is the seat id for a seat and `owner` for the academy owner, from the one
 * instructor id helper (instructorIdentity.ts) that the assessment inbox uses too.
 * An instructor's edits always land in their own copy. The template changes only when
 * the owner (or a Coach seat) picks "Update template".
 */

import { isCalendarDateKey, lessonWeekId } from './gymTree.ts';
import { INSTRUCTOR_ID_RE, OWNER_INSTRUCTOR_ID, instructorIdFor } from './instructorIdentity.ts';

/** The owner's own plan folder. Seat ids are UUIDs, so this never matches a seat. Same id as instructorIdentity.ts. */
export const LESSON_OWNER_INSTRUCTOR_ID = OWNER_INSTRUCTOR_ID;

const INSTRUCTOR_SEGMENT = INSTRUCTOR_ID_RE;
export const LESSON_TEMPLATE_KEY = /^lessons\/current\/\d{4}-W\d{2}\/\d{4}-\d{2}-\d{2}\.json$/;
export const INSTRUCTOR_LESSON_KEY = /^lessons\/instructors\/[A-Za-z0-9_-]{1,80}\/\d{4}-W\d{2}\/\d{4}-\d{2}-\d{2}\.json$/;

export type LessonPlanTarget = 'mine' | 'template';
export type LessonPlanSource = 'mine' | 'template';

type LessonActor = { kind: 'owner' | 'seat'; seatId?: string; preset?: string | null };

/** Folder id for whoever is signed in, or null for a seat with no id. One rule: instructorIdentity.ts instructorIdFor. */
export function lessonInstructorId(actor: LessonActor): string | null {
  return instructorIdFor(actor);
}

export function templateLessonPath(dateKey: string): string | null {
  if (!isCalendarDateKey(dateKey)) return null;
  const week = lessonWeekId(dateKey);
  if (!week) return null;
  return `lessons/current/${week}/${dateKey}.json`;
}

export function instructorLessonPath(instructorId: string, dateKey: string): string | null {
  if (!INSTRUCTOR_SEGMENT.test(instructorId) || !isCalendarDateKey(dateKey)) return null;
  const week = lessonWeekId(dateKey);
  if (!week) return null;
  const path = `lessons/instructors/${instructorId}/${week}/${dateKey}.json`;
  return INSTRUCTOR_LESSON_KEY.test(path) ? path : null;
}

export function isTemplateLessonPath(path: string): boolean {
  return LESSON_TEMPLATE_KEY.test(path);
}

export function parseInstructorLessonPath(path: string): { instructorId: string; week: string; dateKey: string } | null {
  const match = /^lessons\/instructors\/([A-Za-z0-9_-]{1,80})\/(\d{4}-W\d{2})\/(\d{4}-\d{2}-\d{2})\.json$/.exec(path);
  if (!match) return null;
  return { instructorId: match[1], week: match[2], dateKey: match[3] };
}

/** Who may replace the gym template: the owner and Coach seats. */
export function lessonTemplateWriteAllowed(actor: LessonActor): boolean {
  if (actor.kind === 'owner') return true;
  return actor.preset === 'coach';
}

/** Each instructor writes only their own copy. The owner may read every copy. A seat reads only its own. */
export function instructorLessonAccess(actor: LessonActor, targetInstructorId: string, mode: 'read' | 'write'): boolean {
  const own = lessonInstructorId(actor);
  if (!own || !INSTRUCTOR_SEGMENT.test(targetInstructorId)) return false;
  if (own === targetInstructorId) return true;
  return mode === 'read' && actor.kind === 'owner';
}

/** Upload target for a lesson plan JSON. Missing or unknown means the instructor's own copy. */
export function lessonPlanTargetOf(value: unknown): LessonPlanTarget {
  return value === 'template' ? 'template' : 'mine';
}

/** Which plan opens for a day: the instructor's own copy, else the template, else nothing. */
export function pickLessonPlan<T>(input: { mine: T | null; template: T | null }): { source: LessonPlanSource; plan: T } | null {
  if (input.mine) return { source: 'mine', plan: input.mine };
  if (input.template) return { source: 'template', plan: input.template };
  return null;
}

export function lessonSourceLabel(source: LessonPlanSource): string {
  return source === 'template' ? 'Gym template' : 'My plan';
}

/**
 * Per-device marker for a day the phone opened from the gym template and nobody has edited yet.
 * The local plan copy stays in `matboard.coach.trainingNotes.v1`, so casting and the board read it.
 * Keyed by instructor id so an owner and a seat on one phone never share the mark.
 */
export const LESSON_SOURCE_STORAGE_KEY = 'matboard.coach.lessonSource.v1';

type SourceMap = Record<string, Record<string, LessonPlanSource>>;
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function readSourceMap(storage: Storage | null | undefined): SourceMap {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(LESSON_SOURCE_STORAGE_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SourceMap) : {};
  } catch {
    return {};
  }
}

export function readLessonSource(storage: Storage | null | undefined, instructorId: string, dateKey: string): LessonPlanSource | null {
  const value = readSourceMap(storage)[instructorId]?.[dateKey];
  return value === 'template' || value === 'mine' ? value : null;
}

export function writeLessonSource(
  storage: Storage | null | undefined,
  instructorId: string,
  dateKey: string,
  source: LessonPlanSource | null,
): void {
  if (!storage || !isCalendarDateKey(dateKey)) return;
  const map = readSourceMap(storage);
  const days = { ...(map[instructorId] ?? {}) };
  if (source) days[dateKey] = source;
  else delete days[dateKey];
  // Keep the marker small: the newest 60 days per instructor.
  const keys = Object.keys(days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete days[old];
  map[instructorId] = days;
  try {
    storage.setItem(LESSON_SOURCE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full: the plan itself is already stored */
  }
}

export type LessonOpenDecision<T> =
  | { action: 'keep'; source: LessonPlanSource | null }
  | { action: 'adopt'; source: LessonPlanSource; plan: T };

/**
 * What the editor shows for one day once Cloud answers.
 * - This phone already has the instructor's own edits: keep them ("My plan").
 * - Otherwise the instructor's Cloud copy, else the gym template.
 * A day the phone opened from the template and never edited follows the template as it changes.
 */
export function decideLessonOpen<T>(input: {
  localHasContent: boolean;
  localSource: LessonPlanSource | null;
  mine: T | null;
  template: T | null;
}): LessonOpenDecision<T> {
  const localIsMine = input.localHasContent && input.localSource !== 'template';
  if (localIsMine) return { action: 'keep', source: 'mine' };
  const picked = pickLessonPlan({ mine: input.mine, template: input.template });
  if (picked) return { action: 'adopt', source: picked.source, plan: picked.plan };
  return { action: 'keep', source: input.localHasContent ? (input.localSource ?? 'mine') : null };
}
