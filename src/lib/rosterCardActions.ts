/**
 * Roster actions behind the Coach Clipboard card. Each one goes through the
 * existing roster store functions (addStudent, updateStudent, linkRosterCard,
 * removeStudent). No second roster model.
 */

import {
  addStudent,
  getRoster,
  linkRosterCard,
  removeStudent,
  setCheckedIn,
  setNoPhotos,
  updateStudent,
  type Student,
  type StudentDraft,
} from './rosterStore.ts';
import { readRosterCard, updateRosterCard, type RosterCardRecord } from './rosterCardStore.ts';

type MemoryStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

const STYLE_LABEL = { gi: 'Gi', nogi: 'No-Gi', both: 'Gi & No-Gi' } as const;

function findCard(id: string): Student | undefined {
  return getRoster().students.find((row) => row.id === id);
}

/** The photo shown on the card. A No photos student never shows or carries one. */
export function shownCardPhoto(student: Pick<Student, 'photo' | 'noPhotos'>): string {
  return student.noPhotos ? '' : student.photo;
}

// ---------- Add to Competitor Roster ----------

/** Name, photo, belt and stripes, gym, and Gi/No-Gi, from the student card. */
export function competitorDraftFromStudentCard(student: Student, record: RosterCardRecord): StudentDraft & { noPhotos?: Student['noPhotos'] } {
  const style = record.trainingStyle || record.snapshot?.trainingStyle || '';
  return {
    name: student.name,
    belt: student.belt,
    division: style ? STYLE_LABEL[style] : student.division,
    gym: student.gym,
    lastPromotion: student.lastPromotion,
    lastPromotionDetail: student.lastPromotionDetail,
    note: '',
    photo: shownCardPhoto(student),
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
  // The No photos flag follows the student onto the competitor card, with who set it.
  if (student.noPhotos) setNoPhotos(card.id, true, student.noPhotos);
  if (student.linkedStudentId) linkRosterCard(card.id, student.linkedStudentId);
  updateRosterCard(rosterId, (row) => ({ ...row, competitorOn: true, competitorCardId: card.id }), storage ?? undefined);
  return { ok: true, competitorId: card.id, created: true };
}

/**
 * The one Add to Competitor Roster switch action, shared by the card's top switch and
 * the Student Roster row switch. On: add (or reuse) the competitor card. Off: keep it.
 * Callers show the switch only where the Competitor Roster is open (competitorRosterOpen).
 */
export function toggleCompetitor(rosterId: string, storage?: MemoryStore | null): { on: boolean; text: string; error?: true } {
  const student = findCard(rosterId);
  const record = readRosterCard(rosterId, storage ?? undefined);
  const name = student?.name ?? 'This student';
  if (record.competitorOn) {
    turnOffCompetitorToggle(rosterId, storage);
    return { on: false, text: record.competitorCardId ? 'Off. The competitor card and its history are kept.' : 'Off.' };
  }
  const result = addToCompetitorRoster(rosterId, storage);
  if (!result.ok) return { on: false, text: result.error, error: true };
  return { on: true, text: result.created ? `${name} was added to the Competitor Roster as a new card.` : `${name} is back on the Competitor Roster.` };
}

/** Unchecked: the competitor card and its history stay. Removing it is a separate, confirmed step. */
export function turnOffCompetitorToggle(rosterId: string, storage?: MemoryStore | null): void {
  const record = readRosterCard(rosterId, storage ?? undefined);
  updateRosterCard(rosterId, (row) => ({ ...row, competitorOn: false }), storage ?? undefined);
  // A switched-off student is not here for the tournament: clear the competitor card's
  // Check In so Fill from check-in never pulls them into a bracket. The card itself stays.
  const card = record.competitorCardId ? findCard(record.competitorCardId) : undefined;
  if (card && card.rosterList !== 'student' && card.checkedIn) setCheckedIn(card.id, false);
}

// ---------- Check In ----------

/**
 * The competitor card behind a Student Roster card, only while its Competitor switch is on.
 * Check In for a Student Roster student IS this card's checkedIn (the one Competitor Roster
 * check-in that brackets read). There is no second check-in store.
 */
export function linkedCompetitorForCheckIn(rosterId: string, storage?: MemoryStore | null): Student | undefined {
  const record = readRosterCard(rosterId, storage ?? undefined);
  if (!record.competitorOn || !record.competitorCardId) return undefined;
  const card = findCard(record.competitorCardId);
  return card && card.rosterList !== 'student' ? card : undefined;
}

/**
 * The one Check In action for the Student Roster row and the card's top block. It flips the
 * linked competitor card's checkedIn with the Competitor Roster's own setCheckedIn, so the
 * competitor list and Fill from check-in see the same state. Shown only while Competitor is on.
 */
export function toggleStudentCheckIn(rosterId: string, storage?: MemoryStore | null): { checkedIn: boolean; text: string; error?: true } {
  const card = linkedCompetitorForCheckIn(rosterId, storage);
  if (!card) return { checkedIn: false, text: 'Turn on Competitor first. Brackets only use the Competitor Roster.', error: true };
  const next = setCheckedIn(card.id, !card.checkedIn);
  if (!next) return { checkedIn: card.checkedIn, text: 'Could not change Check In.', error: true };
  return { checkedIn: next.checkedIn, text: next.checkedIn ? `${next.name} is checked in.` : `${next.name} is no longer checked in.` };
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
