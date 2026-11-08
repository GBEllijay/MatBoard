/**
 * Who owns what when an academy and a student are connected.
 *
 * The student keeps the personal profile, journal, photos, and backups.
 * The academy keeps the roster, teaching materials, and its official records.
 * A connection allows a specific share. It does not move ownership.
 * Leaving, or revoking a seat or student license, ends that access.
 * It does not delete the student's personal history or the academy's own files.
 *
 * This is not a personal-sync product. Student journals are not copied into
 * the academy folder. Instructor review of student submissions is unchanged.
 */

/** Device stores that stay with the student. Academy revoke must not touch them. */
export const STUDENT_PERSONAL_STORAGE_KEYS = [
  'matboard.studentEdition.v1',
  'matboard.studentEdition.rankPhotos.v1',
] as const;

export type CloudDataScope = 'academy' | 'shared' | 'refused';

/**
 * Academy folder roles.
 * `academy` is the gym's own material (roster, lessons, daily videos, skins, pending clips).
 * `shared` is a copy sent under a permission (inbox, photo submission, card share, event).
 * Anything else, including a student journal, is refused as an academy object.
 */
export function cloudPathScope(relativePath: string): CloudDataScope {
  if (
    relativePath.startsWith('roster/') ||
    relativePath.startsWith('lessons/') ||
    relativePath.startsWith('videos/daily/') ||
    relativePath.startsWith('skins/') ||
    relativePath.startsWith('pending/')
  ) {
    return 'academy';
  }
  if (relativePath.startsWith('students/') || relativePath.startsWith('card-shares')) return 'shared';
  return 'refused';
}

export function isStudentPersonalStorageKey(key: string): boolean {
  return (STUDENT_PERSONAL_STORAGE_KEYS as readonly string[]).includes(key);
}
