/**
 * Likely duplicate Student Roster cards, and a merge that keeps one card,
 * fills its blanks from the other, and archives the other.
 * Kept free of rosterStore so the gym roster API can import it.
 */
import { normalizeRosterPersonName } from './rosterPersonName.ts';
import { incomingRankSource } from './studentOwnedRank.ts';

export type DupableStudent = {
  id: string;
  name: string;
  belt: string;
  division?: string;
  gym?: string;
  photo?: string;
  cardPhotoId?: string;
  lastPromotion?: string;
  lastPromotionDetail?: string;
  note?: string;
  stripes?: number;
  linkedStudentId?: string;
  assignedInstructorId?: string;
  guestId?: string;
  rosterList?: 'student';
  archivedAt?: string;
  archivedReason?: 'left' | 'paused' | 'moved' | 'other';
  checkedIn?: boolean;
  rankUnset?: boolean;
  studentRankAt?: number;
  coachRankAt?: number;
};

export type RosterDupeReason = 'linked-student' | 'name';

export type RosterDupeGroup<T extends DupableStudent = DupableStudent> = {
  key: string;
  reason: RosterDupeReason;
  cards: T[];
};

function text(value: string | undefined): string {
  return (value ?? '').trim();
}

function isStudentRosterCard(row: DupableStudent): boolean {
  return row.rosterList === 'student';
}

function isArchivedStudent(row: DupableStudent): boolean {
  return typeof row.archivedAt === 'string' && row.archivedAt.length > 0;
}

function activeStudentCards<T extends DupableStudent>(students: readonly T[]): T[] {
  return students.filter((row) => isStudentRosterCard(row) && !isArchivedStudent(row) && !row.guestId);
}

/** Groups of two or more likely duplicates: same Student Edition id, or the same normalized name. */
export function findRosterDuplicates<T extends DupableStudent>(students: readonly T[]): RosterDupeGroup<T>[] {
  const active = activeStudentCards(students);
  const groups: RosterDupeGroup<T>[] = [];
  const seen = new Set<string>();

  const byLink = new Map<string, T[]>();
  for (const row of active) {
    const id = row.linkedStudentId?.trim();
    if (!id) continue;
    const list = byLink.get(id) ?? [];
    list.push(row);
    byLink.set(id, list);
  }
  for (const [id, cards] of byLink) {
    if (cards.length < 2) continue;
    groups.push({ key: `id:${id}`, reason: 'linked-student', cards });
    for (const row of cards) seen.add(row.id);
  }

  const byName = new Map<string, T[]>();
  for (const row of active) {
    if (seen.has(row.id)) continue;
    const name = normalizeRosterPersonName(row.name);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(row);
    byName.set(name, list);
  }
  for (const [name, cards] of byName) {
    if (cards.length < 2) continue;
    groups.push({ key: `name:${name}`, reason: 'name', cards });
  }
  return groups;
}

/** Keep the owner's chosen card; fill only its blank profile and coach fields from the other. */
export function combinedDuplicateCard<T extends DupableStudent>(keep: T, drop: T): T {
  const next: T = { ...keep };
  if (!text(next.name) && text(drop.name)) next.name = drop.name;
  if (!text(next.belt) && text(drop.belt)) next.belt = drop.belt;
  if (!text(next.division) && text(drop.division)) next.division = drop.division;
  if (!text(next.gym) && text(drop.gym)) next.gym = drop.gym;
  if (!next.photo && drop.photo) {
    next.photo = drop.photo;
    if (drop.cardPhotoId) next.cardPhotoId = drop.cardPhotoId;
  }
  if (!next.lastPromotion && drop.lastPromotion) next.lastPromotion = drop.lastPromotion;
  if (!next.lastPromotionDetail && drop.lastPromotionDetail) next.lastPromotionDetail = drop.lastPromotionDetail;
  if (!text(next.note) && text(drop.note)) next.note = drop.note;
  if (next.stripes === undefined && drop.stripes !== undefined) next.stripes = drop.stripes;
  if (!next.linkedStudentId && drop.linkedStudentId) next.linkedStudentId = drop.linkedStudentId;
  if (!next.assignedInstructorId && drop.assignedInstructorId) next.assignedInstructorId = drop.assignedInstructorId;
  // The owner picks which card to keep. Belt comes from the newest student
  // submission, or from a later coach edit if that edit is newer than the student.
  const useDrop = incomingRankSource(drop, keep);
  const source = useDrop ? drop : keep;
  if (source.belt?.trim() && (source.studentRankAt || source.coachRankAt || useDrop)) {
    next.belt = source.belt;
    if (source.stripes !== undefined) next.stripes = source.stripes;
    if (source.studentRankAt) next.studentRankAt = source.studentRankAt;
    if (source.coachRankAt) next.coachRankAt = source.coachRankAt;
    delete next.rankUnset;
  }
  return next;
}

export type MergeDuplicateResult<T extends DupableStudent = DupableStudent> =
  | { ok: true; students: T[]; kept: T; dropped: T }
  | { ok: false; reason: 'missing' | 'same-card' };

/**
 * Keep `keepId`, combine blanks from `dropId`, and archive the dropped card.
 * The caller writes the returned list (local roster or academy master).
 */
export function mergeDuplicateStudents<T extends DupableStudent>(
  students: readonly T[],
  keepId: string,
  dropId: string,
  now = new Date().toISOString(),
): MergeDuplicateResult<T> {
  if (keepId === dropId) return { ok: false, reason: 'same-card' };
  const keep = students.find((row) => row.id === keepId);
  const drop = students.find((row) => row.id === dropId);
  if (!keep || !drop) return { ok: false, reason: 'missing' };
  const kept = combinedDuplicateCard(keep, drop);
  const dropped: T = { ...drop, archivedAt: drop.archivedAt ?? now, archivedReason: drop.archivedReason ?? 'other', checkedIn: false };
  const next = students.map((row) => (row.id === keepId ? kept : row.id === dropId ? dropped : row));
  return { ok: true, students: next, kept, dropped };
}
