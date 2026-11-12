/**
 * One id per instructor, shared by every per-instructor Cloud folder.
 *
 *   seat     the seat id from the signed seat pass (claims.sid)
 *   owner    'owner' for the academy owner
 *
 * The one instructor id helper. Per-instructor lesson plans (lessonPlanCopies.ts lessonInstructorId,
 * groups/{license}/lessons/instructors/{instructorId}/…) call instructorIdFor,
 * so an instructor's lesson copies and her assessment inbox
 * (groups/{license}/instructors/{instructorId}/assessments/…) use one id in separate folders.
 * Seat ids are UUIDs, so 'owner' never matches a seat.
 */

export const OWNER_INSTRUCTOR_ID = 'owner';
export const INSTRUCTOR_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export function isInstructorId(value: unknown): value is string {
  return typeof value === 'string' && INSTRUCTOR_ID_RE.test(value);
}

/** Folder id for whoever is signed in, or null for a seat with no usable id. */
export function instructorIdFor(actor: { kind: 'owner' | 'seat'; seatId?: string | null }): string | null {
  if (actor.kind === 'owner') return OWNER_INSTRUCTOR_ID;
  const seat = actor.seatId ?? '';
  if (!INSTRUCTOR_ID_RE.test(seat) || seat === OWNER_INSTRUCTOR_ID) return null;
  return seat;
}

/** Same rule from pass claims: a seat pass gives its sid, anything else is the owner. */
export function instructorIdFromClaims(claims: { src?: unknown; tier?: unknown; sid?: unknown } | null | undefined): string | null {
  if (!claims) return null;
  const seat = claims.src === 'seat' || claims.tier === 'seat';
  return instructorIdFor({ kind: seat ? 'seat' : 'owner', seatId: typeof claims.sid === 'string' ? claims.sid : '' });
}

/**
 * Who may reassign a student to another instructor: the owner only.
 * A merge or a seat only fills a blank assignment (fillAssignedInstructor).
 */
export function canReassignInstructor(actor: { kind: 'owner' | 'seat' }): boolean {
  return actor.kind === 'owner';
}

/** Fill-blank rule for assignedInstructorId. Keeps what is there; takes the incoming id only when blank. */
export function fillAssignedInstructor(current: string | undefined, incoming: string | undefined): string | undefined {
  if (isInstructorId(current)) return current;
  return isInstructorId(incoming) ? incoming : undefined;
}

/**
 * Achievements stay in two lanes on one person:
 *   student lane     keyed by the Student Edition id (linkedStudentId): belts, stripes received, mat hours, check-ins.
 *   instructor lane  keyed by instructorId: stripes given, classes taught, assessments answered.
 * The instructor card builds on the student card (same linkedStudentId); counts never mix.
 */
export type AchievementLane = 'student' | 'instructor';

export function achievementKey(lane: AchievementLane, id: string): string {
  return lane === 'student' ? `student:${id}` : `instructor:${id}`;
}
