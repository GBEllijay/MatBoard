/**
 * Roster actions behind the Coach Clipboard card. Each one goes through the
 * existing roster store functions (addStudent, updateStudent, linkRosterCard,
 * removeStudent). No second roster model.
 */

import {
  addStudent,
  canonicalBelt,
  getRoster,
  linkRosterCard,
  removeStudent,
  updateStudent,
  type Student,
  type StudentDraft,
} from './rosterStore.ts';
import {
  readRosterCard,
  updateRosterCard,
  type CardPhoto,
  type RosterCardRecord,
} from './rosterCardStore.ts';
import {
  canApproveNewCards,
  decideItem,
  type CoachInbox,
  type CoachInboxItem,
  type SharedCard,
} from './studentToCoach.ts';

type MemoryStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

const STYLE_LABEL = { gi: 'Gi', nogi: 'No-Gi', both: 'Gi & No-Gi' } as const;

function findCard(id: string): Student | undefined {
  return getRoster().students.find((row) => row.id === id);
}

/** The photo shown on the card: the head instructor's pick, if the head coach approved it. */
export function shownCardPhoto(record: RosterCardRecord, fallback = ''): string {
  const pick = record.photos.find((row) => row.id === record.shownPhotoId && row.coach === 'approved');
  return pick?.src ?? fallback;
}

// ---------- Add to Competitor Roster ----------

/** Name, photo, belt and stripes, gym, and Gi/No-Gi, from the student card. */
export function competitorDraftFromStudentCard(student: Student, record: RosterCardRecord): StudentDraft {
  const style = record.trainingStyle || record.snapshot?.trainingStyle || '';
  return {
    name: student.name,
    belt: student.belt,
    division: style ? STYLE_LABEL[style] : student.division,
    gym: student.gym,
    lastPromotion: student.lastPromotion,
    lastPromotionDetail: student.lastPromotionDetail,
    note: '',
    photo: shownCardPhoto(record, student.photo),
    ...(student.stripes !== undefined ? { stripes: student.stripes } : {}),
  };
}

export type CompetitorToggle = { ok: true; competitorId: string; created: boolean } | { ok: false; error: string };

/**
 * Checked: make a NEW, separate Competitor Roster card prefilled from the student
 * card, linked to the same Student Edition id so rank and result updates keep working.
 * Checking again later reuses the card it made before. It never makes a second one.
 */
export function addToCompetitorRoster(rosterId: string, storage?: MemoryStore | null): CompetitorToggle {
  const student = findCard(rosterId);
  if (!student || student.rosterList !== 'student') return { ok: false, error: 'Open a Student Roster card.' };
  const record = readRosterCard(rosterId, storage ?? undefined);
  const existing = record.competitorCardId ? findCard(record.competitorCardId) : undefined;
  if (existing && existing.rosterList !== 'student') {
    updateRosterCard(rosterId, (row) => ({ ...row, competitorOn: true }), storage ?? undefined);
    return { ok: true, competitorId: existing.id, created: false };
  }
  const draft = competitorDraftFromStudentCard(student, record);
  const card = addStudent(draft);
  if (!card) return { ok: false, error: 'Could not add this student to the Competitor Roster.' };
  if (draft.stripes !== undefined) updateStudent(card.id, { stripes: draft.stripes });
  if (student.linkedStudentId) linkRosterCard(card.id, student.linkedStudentId);
  updateRosterCard(rosterId, (row) => ({ ...row, competitorOn: true, competitorCardId: card.id }), storage ?? undefined);
  return { ok: true, competitorId: card.id, created: true };
}

/** Unchecked: the competitor card and its history stay. Removing it is a separate, confirmed step. */
export function turnOffCompetitorToggle(rosterId: string, storage?: MemoryStore | null): void {
  updateRosterCard(rosterId, (row) => ({ ...row, competitorOn: false }), storage ?? undefined);
}

/** Only after the coach confirms. Uses the Competitor Roster's own Remove. */
export function removeLinkedCompetitorCard(rosterId: string, confirmed: boolean, storage?: MemoryStore | null): boolean {
  if (!confirmed) return false;
  const record = readRosterCard(rosterId, storage ?? undefined);
  const card = record.competitorCardId ? findCard(record.competitorCardId) : undefined;
  if (!card || card.rosterList === 'student') return false;
  removeStudent(card.id);
  updateRosterCard(rosterId, (row) => ({ ...row, competitorOn: false, competitorCardId: '' }), storage ?? undefined);
  return true;
}

// ---------- New student cards ----------

function rosterBelt(card: SharedCard): string {
  if (card.system === 'kids') {
    const head = card.belt.split('-')[0] ?? '';
    return canonicalBelt(head) || 'White';
  }
  return canonicalBelt(card.belt) || 'White';
}

function studentPhoto(card: SharedCard, now: number): CardPhoto[] {
  if (!card.photo) return [];
  // The parent gate ran on the student's phone before upload. The head coach still approves.
  return [{ id: `photo.${now.toString(36)}`, src: card.photo, from: 'student', addedAt: now, parent: 'approved', coach: 'pending' }];
}

export type ApproveResult = { ok: true; rosterId: string; inbox: CoachInbox } | { ok: false; error: string };

/**
 * Head coach approves a New student card. With no merge target it is added to the
 * Student Roster right away. With a merge target, coach fields win and the
 * student's data fills blanks only. Either way the card is linked to the student,
 * the same link Sync with student app uses. The photo waits for head coach approval.
 */
export function approveNewStudentCard(
  inbox: CoachInbox,
  item: CoachInboxItem,
  seat: { presetId?: string | null } | null,
  options: { mergeInto?: string; storage?: MemoryStore | null; now?: number } = {},
): ApproveResult {
  if (!canApproveNewCards(seat)) return { ok: false, error: 'Only the head coach approves new student cards.' };
  if (item.packet.type !== 'card-share' || item.status !== 'pending') return { ok: false, error: 'This card was already handled.' };
  const card = item.packet.card;
  const now = options.now ?? Date.now();
  const storage = options.storage ?? undefined;
  const lastPromotion = card.lastStripeOn || card.beltAchievedOn;

  if (options.mergeInto) {
    const target = findCard(options.mergeInto);
    if (!target || target.rosterList !== 'student') return { ok: false, error: 'Choose a Student Roster card to merge into.' };
    if (target.linkedStudentId && target.linkedStudentId !== item.packet.studentId) {
      return { ok: false, error: `${target.name} is already linked to a different student.` };
    }
    const fill: Partial<StudentDraft> = {};
    if (!target.gym && card.gymName) fill.gym = card.gymName;
    if (!target.lastPromotion && lastPromotion) fill.lastPromotion = lastPromotion;
    if (target.stripes === undefined && card.stripes) fill.stripes = card.stripes;
    if (Object.keys(fill).length) updateStudent(target.id, fill);
    linkRosterCard(target.id, item.packet.studentId);
    updateRosterCard(
      target.id,
      (row) => ({
        ...row,
        trainingStartedOn: row.trainingStartedOn || card.startedOn,
        trainingStyle: row.trainingStyle || card.trainingStyle,
        photos: [...row.photos, ...studentPhoto(card, now)],
      }),
      storage,
    );
    return { ok: true, rosterId: target.id, inbox: decideItem(inbox, item.packet.updateId, 'merged', target.id, now) };
  }

  const added = addStudent(
    { name: card.displayName, belt: rosterBelt(card), division: '', gym: card.gymName, lastPromotion, note: '' },
    { rosterList: 'student' },
  );
  if (!added) return { ok: false, error: 'This card is missing a name.' };
  updateStudent(added.id, { stripes: card.stripes });
  linkRosterCard(added.id, item.packet.studentId);
  updateRosterCard(
    added.id,
    (row) => ({
      ...row,
      trainingStartedOn: card.startedOn,
      trainingStyle: card.trainingStyle,
      coachRank: { belt: rosterBelt(card), awardedOn: card.beltAchievedOn, stripeDates: card.stripes ? [...Array(card.stripes - 1).fill(''), card.lastStripeOn] : [] },
      photos: studentPhoto(card, now),
    }),
    storage,
  );
  return { ok: true, rosterId: added.id, inbox: decideItem(inbox, item.packet.updateId, 'approved', added.id, now) };
}

/** Head coach approves or rejects a card image. Approving the first one shows it. */
export function decideCardPhoto(
  rosterId: string,
  photoId: string,
  decision: 'approved' | 'rejected',
  seat: { presetId?: string | null } | null,
  storage?: MemoryStore | null,
): boolean {
  if (!canApproveNewCards(seat)) return false;
  let changed = false;
  updateRosterCard(
    rosterId,
    (row) => {
      const photos = row.photos.map((photo) => {
        if (photo.id !== photoId || photo.parent === 'pending') return photo;
        changed = true;
        return { ...photo, coach: decision };
      });
      const shown = row.shownPhotoId || (decision === 'approved' && changed ? photoId : '');
      return { ...row, photos, shownPhotoId: shown === photoId && decision === 'rejected' ? '' : shown };
    },
    storage ?? undefined,
  );
  return changed;
}

/** Head instructor picks the shown photo from approved ones. */
export function pickShownPhoto(rosterId: string, photoId: string, seat: { presetId?: string | null } | null, storage?: MemoryStore | null): boolean {
  if (!canApproveNewCards(seat)) return false;
  const record = readRosterCard(rosterId, storage ?? undefined);
  if (!record.photos.some((row) => row.id === photoId && row.coach === 'approved')) return false;
  updateRosterCard(rosterId, (row) => ({ ...row, shownPhotoId: photoId }), storage ?? undefined);
  return true;
}

/**
 * Act on a student notice. Competitor info fills blanks on the linked competitor
 * card. It never overwrites what the coach saved. A registration is marked handled.
 */
export function applyStudentNotice(inbox: CoachInbox, item: CoachInboxItem, rosterId: string, storage?: MemoryStore | null, now = Date.now()): CoachInbox {
  if (item.status !== 'pending') return inbox;
  if (item.packet.type === 'competitor-info') {
    const record = readRosterCard(rosterId, storage ?? undefined);
    const comp = record.competitorCardId ? findCard(record.competitorCardId) : undefined;
    if (comp && !comp.division && item.packet.competitor.division) updateStudent(comp.id, { division: item.packet.competitor.division });
    if (!record.trainingStyle && item.packet.competitor.trainingStyle) {
      updateRosterCard(rosterId, (row) => ({ ...row, trainingStyle: item.packet.type === 'competitor-info' ? item.packet.competitor.trainingStyle : row.trainingStyle }), storage ?? undefined);
    }
  }
  return decideItem(inbox, item.packet.updateId, 'applied', rosterId, now);
}

export function dismissStudentNotice(inbox: CoachInbox, updateId: string, now = Date.now()): CoachInbox {
  return decideItem(inbox, updateId, 'dismissed', undefined, now);
}
