/**
 * Belt and stripes on a linked Student Roster card are owned by the student.
 * Instructors never set or overwrite them; the newest card share or assessment
 * (or the student's own update file) wins. This avoids crossover with GB Members.
 */

export type RankOwnerFields = {
  linkedStudentId?: string;
  guestId?: string;
  belt?: string;
  stripes?: number;
  /** Auto-created before the student sent a belt. Display as "Not set yet". */
  rankUnset?: boolean;
  /** When belt/stripes last came from the student's own submission. */
  studentRankAt?: number;
};

/** A non-guest card linked to a Student Edition id. The student owns its rank. */
export function studentOwnsRosterRank(row: RankOwnerFields): boolean {
  return Boolean(row.linkedStudentId?.trim()) && !row.guestId;
}

export function rosterRankLabel(row: RankOwnerFields): string {
  if (studentOwnsRosterRank(row) && (row.rankUnset || !row.belt?.trim())) return 'Not set yet';
  return (row.belt ?? '').trim();
}

/** Short note under a linked card's belt, or null when the coach may still edit it. */
export function rosterRankHint(row: RankOwnerFields): string | null {
  if (!studentOwnsRosterRank(row)) return null;
  if (row.rankUnset || !row.belt?.trim()) return 'Not set yet. This updates when the student shares their card.';
  if (typeof row.studentRankAt !== 'number') return 'This updates when the student shares their card.';
  return 'Set by the student';
}

/**
 * True when `incoming` carries a newer student-owned rank than `local`.
 * A missing timestamp, or a placeholder "not set yet" card, never overwrites.
 */
export function isNewerStudentRank(incoming: RankOwnerFields, local: RankOwnerFields): boolean {
  if (incoming.rankUnset) return false;
  if (typeof incoming.studentRankAt !== 'number' || !Number.isFinite(incoming.studentRankAt) || incoming.studentRankAt <= 0) {
    return false;
  }
  if (local.rankUnset || typeof local.studentRankAt !== 'number' || !Number.isFinite(local.studentRankAt)) {
    return true;
  }
  return incoming.studentRankAt >= local.studentRankAt;
}

export function studentRankStamp(now = Date.now()): number {
  return now;
}
