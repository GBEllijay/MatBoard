/**
 * A student's worn belt is updated from their own card share, assessment, or
 * update file. A coach may edit belt on their own roster (for brackets and
 * divisions), and that edit never goes back to the student's app.
 */

export type RankOwnerFields = {
  linkedStudentId?: string;
  guestId?: string;
  belt?: string;
  stripes?: number;
  /** Auto-created before the student sent a belt, and the coach has not set one yet. */
  rankUnset?: boolean;
  /** When belt/stripes last came from the student's own submission. */
  studentRankAt?: number;
  /** When the coach last edited belt, stripes, or last promotion on this roster card. */
  coachRankAt?: number;
};

/** A non-guest card linked to a Student Edition id. */
export function studentOwnsRosterRank(row: RankOwnerFields): boolean {
  return Boolean(row.linkedStudentId?.trim()) && !row.guestId;
}

export function rosterRankLabel(row: RankOwnerFields): string {
  if (studentOwnsRosterRank(row) && (row.rankUnset || !row.belt?.trim()) && !row.coachRankAt) return 'Not set yet';
  return (row.belt ?? '').trim();
}

export const ROSTER_RANK_STAYS_LOCAL = "Changes here stay on your roster and don't update the student's app.";

/** Shown under an editable belt on a linked roster card. */
export function rosterRankHint(row: RankOwnerFields): string | null {
  if (!studentOwnsRosterRank(row)) return null;
  return ROSTER_RANK_STAYS_LOCAL;
}

function stamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function latestRankAt(row: RankOwnerFields): number {
  return Math.max(stamp(row.studentRankAt), stamp(row.coachRankAt));
}

/**
 * Whether incoming belt/stripes should replace local ones.
 * A later student submission wins over an earlier coach edit.
 * A coach edit applies only when it is newer than the latest student submission.
 * A card with no rank timestamp never overwrites.
 */
export function incomingRankSource(incoming: RankOwnerFields, local: RankOwnerFields): 'student' | 'coach' | null {
  const inStudent = stamp(incoming.studentRankAt);
  const inCoach = stamp(incoming.coachRankAt);
  const localStudent = stamp(local.studentRankAt);
  const localCoach = stamp(local.coachRankAt);
  if (incoming.rankUnset) return null;
  if (inStudent > 0 && inStudent >= Math.max(localStudent, localCoach)) return 'student';
  if (inCoach > 0 && inCoach > localStudent && inCoach >= localCoach) return 'coach';
  return null;
}

/** @deprecated Use incomingRankSource === 'student'. Kept for older call sites. */
export function isNewerStudentRank(incoming: RankOwnerFields, local: RankOwnerFields): boolean {
  return incomingRankSource(incoming, local) === 'student';
}

export function studentRankStamp(now = Date.now()): number {
  return now;
}

const STRIPPED_RANK_KEYS = new Set(['stripes', 'stripeCount', 'lastPromotion', 'lastPromotionDetail', 'promotionDate']);

/**
 * Remove belt promotions, stripes, and last-promotion from a coach → student
 * packet. Notes, assessment scores, suggested videos, and other fields stay.
 * The worn-belt identifier on a belt-progress packet is left in place so
 * benchmarks still attach to a curriculum; the student app must not apply it
 * as a promotion.
 */
export function stripCoachToStudentRank<T>(packet: T): T {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return packet;
  const out = { ...(packet as Record<string, unknown>) };
  if (out.rankUpdate && typeof out.rankUpdate === 'object' && !Array.isArray(out.rankUpdate)) {
    const rankUpdate = { ...(out.rankUpdate as Record<string, unknown>) };
    delete rankUpdate.belt;
    delete rankUpdate.stripeCount;
    delete rankUpdate.stripes;
    delete rankUpdate.promotionDate;
    delete rankUpdate.lastPromotion;
    delete rankUpdate.lastPromotionDetail;
    if (typeof rankUpdate.note === 'string' && rankUpdate.note.trim()) out.rankUpdate = rankUpdate;
    else delete out.rankUpdate;
  }
  for (const key of STRIPPED_RANK_KEYS) delete out[key];
  // Top-level `belt` would be a promotion. Nested beltProgress.belt is a curriculum id.
  if ('belt' in out && !('beltProgress' in out) && out.kind !== 'coach-belt-progress-update') {
    delete out.belt;
  }
  if (out.assessment && typeof out.assessment === 'object' && !Array.isArray(out.assessment)) {
    const assessment = { ...(out.assessment as Record<string, unknown>) };
    delete assessment.belt;
    delete assessment.stripes;
    delete assessment.stripeCount;
    delete assessment.lastPromotion;
    delete assessment.lastPromotionDetail;
    delete assessment.promotionDate;
    out.assessment = assessment;
  }
  if (out.coachNote && typeof out.coachNote === 'object' && !Array.isArray(out.coachNote)) {
    const note = { ...(out.coachNote as Record<string, unknown>) };
    delete note.belt;
    delete note.stripes;
    delete note.stripeCount;
    delete note.lastPromotion;
    delete note.lastPromotionDetail;
    delete note.promotionDate;
    out.coachNote = note;
  }
  return out as T;
}

/** True when a packet would have changed the student's worn belt or stripes. */
export function coachPacketCarriesRank(packet: unknown): boolean {
  if (!packet || typeof packet !== 'object') return false;
  const row = packet as Record<string, unknown>;
  if (row.kind === 'coach-rank-update' || row.rankUpdate) return true;
  if (typeof row.stripes === 'number' || typeof row.stripeCount === 'number') return true;
  if (typeof row.lastPromotion === 'string' || typeof row.promotionDate === 'string') return true;
  if (typeof row.belt === 'string' && row.kind !== 'coach-belt-progress-update' && !row.beltProgress) return true;
  return false;
}
