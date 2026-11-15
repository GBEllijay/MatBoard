/**
 * When a student communication arrives (a self-assessment, or a later card share)
 * and no linked Student Roster card exists yet, add or link one so the coach can reply.
 * Students may send a card share or a self-assessment independently.
 */
import { canSendCoachSync, type SyncActor } from './coachSync.ts';
import type { InstructorAssessmentItem } from './instructorAssessments.ts';
import {
  addStudent,
  clipName,
  getRoster,
  isArchivedStudent,
  isStudentRosterCard,
  linkRosterCard,
  markRosterRankUnset,
  updateStudent,
  type Student,
  type StudentDraft,
  type StudentWriteOptions,
} from './rosterStore.ts';
import { normalizeRosterPersonName } from './rosterPersonName.ts';
export { normalizeRosterPersonName } from './rosterPersonName.ts';
import { isStableStudentId } from './studentIdentity.ts';

export type InboxRoster = {
  students: readonly Student[];
  add(draft: StudentDraft, options: { rosterList: 'student' }): Student | null;
  update(id: string, draft: Partial<StudentDraft>, options?: StudentWriteOptions): Student | null;
  link(id: string, studentId: string): Student | null;
};

export type InboxStudentIdentity = {
  studentId: string;
  name?: string;
  belt?: string;
  stripes?: number;
  division?: string;
  gym?: string;
};

export type EnsureRosterCardResult =
  | { status: 'existing'; card: Student }
  | { status: 'linked'; card: Student }
  | { status: 'created'; card: Student }
  | { status: 'skipped'; reason: 'not-allowed' | 'invalid-student' | 'invalid-card' };

function liveRoster(roster?: InboxRoster): InboxRoster {
  return (
    roster ?? {
      get students() {
        return getRoster().students;
      },
      add: addStudent,
      update: updateStudent,
      link: linkRosterCard,
    }
  );
}

/** NFC, trim, collapse spaces, case-fold. Conservative exact match only. */
export function linkedRosterCardForStudent(students: readonly Student[], studentId: string): Student | undefined {
  const id = studentId.trim();
  if (!isStableStudentId(id)) return undefined;
  return students.find((row) => row.linkedStudentId === id && !row.guestId);
}

function unlinkedSameNameMatches(students: readonly Student[], name: string): Student[] {
  const key = normalizeRosterPersonName(name);
  if (!key) return [];
  return students.filter((row) => {
    if (row.guestId || row.linkedStudentId || isArchivedStudent(row)) return false;
    if (!isStudentRosterCard(row)) return false;
    return normalizeRosterPersonName(row.name) === key;
  });
}

function draftFromIdentity(identity: InboxStudentIdentity): StudentDraft | null {
  const name = clipName(identity.name ?? '') || 'Student';
  return {
    name,
    belt: identity.belt?.trim() ? identity.belt : 'White',
    division: identity.division ?? '',
    gym: identity.gym ?? '',
    lastPromotion: '',
    lastPromotionDetail: '',
    note: '',
    ...(identity.stripes != null ? { stripes: identity.stripes } : {}),
  };
}

/**
 * Find, link, or create the Student Roster card for this Student Edition id.
 * Idempotent on studentId: never adds a second card for the same id.
 * A same-name unlinked student card is linked only when exactly one matches.
 */
export function ensureRosterCardForStudent(
  identity: InboxStudentIdentity,
  options: { actor: SyncActor; roster?: InboxRoster } = { actor: 'owner' },
): EnsureRosterCardResult {
  if (!canSendCoachSync(options.actor)) return { status: 'skipped', reason: 'not-allowed' };
  const studentId = identity.studentId.trim();
  if (!isStableStudentId(studentId)) return { status: 'skipped', reason: 'invalid-student' };
  const roster = liveRoster(options.roster);
  const existing = linkedRosterCardForStudent(roster.students, studentId);
  if (existing) return { status: 'existing', card: existing };

  const givenName = clipName(identity.name ?? '');
  const matches = givenName ? unlinkedSameNameMatches(roster.students, givenName) : [];
  if (matches.length === 1) {
    const linked = roster.link(matches[0].id, studentId);
    if (!linked) return { status: 'skipped', reason: 'invalid-card' };
    return { status: 'linked', card: linked };
  }

  const draft = draftFromIdentity(identity);
  if (!draft) return { status: 'skipped', reason: 'invalid-card' };
  let card = roster.add(draft, { rosterList: 'student' });
  if (!card) return { status: 'skipped', reason: 'invalid-card' };
  const linked = card.linkedStudentId === studentId ? card : roster.link(card.id, studentId) ?? card;
  if (!linked.linkedStudentId) return { status: 'skipped', reason: 'invalid-card' };
  const hasStudentBelt = Boolean(identity.belt?.trim());
  if (hasStudentBelt) {
    const patch: Partial<StudentDraft> = { belt: identity.belt };
    if (identity.stripes != null) patch.stripes = identity.stripes;
    card = roster.update(linked.id, patch, { source: 'student-submission' }) ?? linked;
    return { status: 'created', card };
  }
  const unset = markRosterRankUnset(linked.id) ?? { ...linked, rankUnset: true };
  return { status: 'created', card: unset };
}

export function identityFromAssessment(item: InstructorAssessmentItem): InboxStudentIdentity {
  return {
    studentId: item.submission.studentId,
    name: item.submission.studentName,
  };
}

export type EnsureAssessmentsResult = { created: Student[]; linked: Student[]; existing: Student[] };

/** One card per distinct studentId in the waiting list. Safe to call on every roster open. */
export function ensureRosterCardsForAssessments(
  items: readonly InstructorAssessmentItem[],
  options: { actor: SyncActor; roster?: InboxRoster } = { actor: 'owner' },
): EnsureAssessmentsResult {
  const created: Student[] = [];
  const linked: Student[] = [];
  const existing: Student[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const studentId = item.submission.studentId.trim();
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);
    const result = ensureRosterCardForStudent(identityFromAssessment(item), options);
    if (result.status === 'created') created.push(result.card);
    else if (result.status === 'linked') linked.push(result.card);
    else if (result.status === 'existing') existing.push(result.card);
  }
  return { created, linked, existing };
}

export function identityFromShare(share: { studentId: string; card: { name?: string; belt?: string; stripes?: number; division?: string; gym?: string } }): InboxStudentIdentity {
  return {
    studentId: share.studentId,
    name: share.card.name,
    belt: share.card.belt,
    stripes: share.card.stripes,
    division: share.card.division,
    gym: share.card.gym,
  };
}

