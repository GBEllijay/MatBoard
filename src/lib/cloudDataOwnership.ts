/**
 * Who owns what when an academy and a student are connected.
 *
 * The student keeps the personal profile, journal, photos, and backups.
 * A purchased Instructor Edition keeps that instructor's own info and stats.
 * The academy keeps the roster, teaching materials, and its official records.
 * A connection may share permissioned instructor info and student statistics
 * upward. That share is not an ownership transfer.
 * The instructor, the student, or the academy may disconnect. Revocation stops
 * future sharing and access. It does not erase personal history, and it does
 * not leave the academy inside personal files. Official academy history stays
 * as the academy's own record.
 *
 * This is not a personal-sync product. Student journals are not copied into
 * the academy folder. Instructor review of student submissions is unchanged.
 */

/** Device stores that stay with the student. Academy revoke must not touch them. */
export const STUDENT_PERSONAL_STORAGE_KEYS = [
  'matboard.studentEdition.v1',
  'matboard.studentEdition.rankPhotos.v1',
] as const;

/** Device stores that stay with a purchased instructor, connected or not. */
export const INSTRUCTOR_PERSONAL_STORAGE_KEYS = [
  'matboard.coach.techniqueTree.v1',
  'matboard.coach.trainingNotes.v1',
  'matboard.coach.competitionCurriculum.v1',
] as const;

export type DisconnectBy = 'instructor' | 'student' | 'academy';

export type CloudDataScope = 'academy' | 'shared' | 'refused';

/**
 * Academy folder roles.
 * `academy` is the gym's own material (roster, lessons, daily videos, gallery, skins, pending clips).
 * `shared` is a copy sent under a permission (inbox, photo submission, card share, event).
 * Anything else, including a student journal, is refused as an academy object.
 */
export function cloudPathScope(relativePath: string): CloudDataScope {
  if (
    relativePath.startsWith('roster/') ||
    relativePath.startsWith('lessons/') ||
    relativePath.startsWith('videos/daily/') ||
    relativePath.startsWith('gallery/') ||
    relativePath.startsWith('instructors/') ||
    relativePath.startsWith('skins/') ||
    relativePath.startsWith('pending/')
  ) {
    return 'academy';
  }
  if (relativePath.startsWith('students/') || relativePath.startsWith('card-shares')) return 'shared';
  return 'refused';
}

export function isStudentPersonalStorageKey(key: string): boolean {
  if ((STUDENT_PERSONAL_STORAGE_KEYS as readonly string[]).includes(key)) return true;
  return STUDENT_PERSONAL_STORAGE_KEYS.some((base) => key.startsWith(`${base}::profile:`));
}

export function isInstructorPersonalStorageKey(key: string): boolean {
  return (INSTRUCTOR_PERSONAL_STORAGE_KEYS as readonly string[]).includes(key);
}

/** A purchased instructor keeps their own record with no academy connected. */
export function instructorEditionStandsAlone(): boolean {
  return true;
}

/**
 * Ending a connection from either side.
 * Personal data is returned unchanged. Academy access to those files is closed.
 * The academy's own official history is a separate value and is not passed here.
 */
export function personalRecordAfterDisconnect<T>(record: T, endedBy: DisconnectBy): { record: T; personalAccess: false; endedBy: DisconnectBy } {
  return { record, personalAccess: false, endedBy };
}
