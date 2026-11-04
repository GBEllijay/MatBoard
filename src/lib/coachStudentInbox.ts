/**
 * Coach side of the two narrow student → coach kinds.
 *
 *  - Tournament registration: a dismissible notice on the student's roster card
 *    and any linked competitor card. Read only; it never changes coach data.
 *  - Student card share: a pending card after a QR sign-up. An Instructor or
 *    Coach seat (or the owner) accepts it as a new card or merges it into an
 *    existing card. A merge fills only empty coach fields. The photo always
 *    goes to head-coach photo review; accepting never puts it on a card.
 *
 * Guests never get notices. Comms off for a student drops their notices.
 */
import type { SyncActor } from './coachSync.ts';
import {
  intakePhotoSubmission,
  PHOTO_SUBMISSION_KIND,
  savePhotoReview,
  type StudentPhotoSubmission,
} from './rosterPhotoApproval.ts';
import type { Student, StudentDraft } from './rosterStore.ts';
import { readStudentCardShare, type StudentCardShare } from './studentCardShare.ts';
import { readTournamentRegistration, type TournamentRegistrationEvent } from './studentEvents.ts';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const COACH_STUDENT_INBOX_KEY = 'matboard.coach.studentInbox.v1';
export const COACH_STUDENT_INBOX_EVENT = 'matboard-coach-student-inbox';
const NOTICE_MAX = 300;
const SHARE_MAX = 60;

export type CardShareDecision = { shareId: string; decision: 'accepted' | 'merged' | 'declined'; cardId: string | null; at: number };

type InboxState = {
  notices: TournamentRegistrationEvent[];
  dismissed: string[];
  shares: StudentCardShare[];
  decided: CardShareDecision[];
};

function read(storage: Pick<Store, 'getItem'>): InboxState {
  try {
    const raw = JSON.parse(storage.getItem(COACH_STUDENT_INBOX_KEY) ?? '{}') as Partial<Record<keyof InboxState, unknown>>;
    const list = (value: unknown) => (Array.isArray(value) ? value : []);
    return {
      notices: list(raw.notices).flatMap((row) => readTournamentRegistration(row) ?? []),
      dismissed: list(raw.dismissed).filter((row): row is string => typeof row === 'string'),
      shares: list(raw.shares).flatMap((row) => readStudentCardShare(row) ?? []),
      decided: list(raw.decided).filter(
        (row): row is CardShareDecision => Boolean(row) && typeof (row as CardShareDecision).shareId === 'string',
      ),
    };
  } catch {
    return { notices: [], dismissed: [], shares: [], decided: [] };
  }
}

function write(storage: Store, state: InboxState): void {
  storage.setItem(
    COACH_STUDENT_INBOX_KEY,
    JSON.stringify({
      notices: state.notices.slice(-NOTICE_MAX),
      dismissed: state.dismissed.slice(-NOTICE_MAX),
      shares: state.shares.slice(-SHARE_MAX),
      decided: state.decided.slice(-SHARE_MAX * 4),
    }),
  );
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COACH_STUDENT_INBOX_EVENT));
}

type NoticeCard = Pick<Student, 'id' | 'linkedStudentId' | 'guestId' | 'coachSync'>;

/* ------------------------------ tournament notices ----------------------------- */

export type NoticeReceive = 'stored' | 'updated' | 'ignored' | 'no-student' | 'sync-off';

/** Store a tournament registration for the coach. Never touches roster data. */
export function receiveTournamentNotice(storage: Store, raw: unknown, roster: readonly NoticeCard[]): NoticeReceive {
  const event = readTournamentRegistration(raw);
  if (!event) return 'ignored';
  const cards = roster.filter((card) => card.linkedStudentId === event.studentId && !card.guestId);
  if (!cards.length) return 'no-student';
  if (cards.some((card) => card.coachSync === 'off')) return 'sync-off';
  const state = read(storage);
  const existing = state.notices.find((row) => row.eventId === event.eventId);
  if (existing && existing.sentAt >= event.sentAt) return 'ignored';
  const same = existing && existing.eventName === event.eventName && existing.date === event.date && existing.division === event.division;
  write(storage, {
    ...state,
    notices: [...state.notices.filter((row) => row.eventId !== event.eventId), event],
    // A changed registration (new date or division) shows again; a repeat stays dismissed.
    dismissed: same ? state.dismissed : state.dismissed.filter((id) => id !== event.eventId),
  });
  return existing ? 'updated' : 'stored';
}

/** Undismissed notices for a card (card id or linked student id). Both linked cards see the same ones. */
export function noticesForCard(
  storage: Pick<Store, 'getItem'>,
  studentId: string,
  roster: readonly NoticeCard[],
): TournamentRegistrationEvent[] {
  const card = roster.find((row) => row.id === studentId) ?? roster.find((row) => row.linkedStudentId === studentId);
  if (!card || card.guestId || !card.linkedStudentId) return [];
  if (roster.some((row) => row.linkedStudentId === card.linkedStudentId && row.coachSync === 'off')) return [];
  const state = read(storage);
  const dismissed = new Set(state.dismissed);
  return state.notices
    .filter((row) => row.studentId === card.linkedStudentId && !dismissed.has(row.eventId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function dismissTournamentNotice(storage: Store, eventId: string): void {
  const state = read(storage);
  if (state.dismissed.includes(eventId)) return;
  write(storage, { ...state, dismissed: [...state.dismissed, eventId] });
}

/* -------------------------------- card shares -------------------------------- */

export type ShareReceive = 'pending' | 'already' | 'decided' | 'ignored';

export function receiveCardShare(storage: Store, raw: unknown): ShareReceive {
  const share = readStudentCardShare(raw);
  if (!share || (share.parent.required && typeof share.parent.approvedAt !== 'number')) return 'ignored';
  const state = read(storage);
  if (state.decided.some((row) => row.shareId === share.shareId)) return 'decided';
  if (state.shares.some((row) => row.shareId === share.shareId)) return 'already';
  write(storage, { ...state, shares: [...state.shares, share] });
  return 'pending';
}

export function pendingCardShares(storage: Pick<Store, 'getItem'>): StudentCardShare[] {
  const state = read(storage);
  const decided = new Set(state.decided.map((row) => row.shareId));
  return state.shares.filter((row) => !decided.has(row.shareId));
}

export function cardShareDecisions(storage: Pick<Store, 'getItem'>): CardShareDecision[] {
  return read(storage).decided;
}

/** Instructor (head) or Coach seat, or the owner. Assistants and directors cannot. */
export function canAcceptCardShare(actor: SyncActor): boolean {
  return actor === 'owner' || actor === 'head' || actor === 'coach';
}

/**
 * The merge patch: only coach fields that are empty on the card are filled.
 * Nothing set by the coach is replaced.
 */
export function cardShareMergePatch(card: Student, share: StudentCardShare): Partial<StudentDraft> {
  const patch: Partial<StudentDraft> = {};
  if (!card.name.trim() && share.card.name) patch.name = share.card.name;
  if (!card.belt.trim() && share.card.belt) patch.belt = share.card.belt;
  if (!card.division.trim() && share.card.division) patch.division = share.card.division;
  if (!card.gym.trim() && share.card.gym) patch.gym = share.card.gym;
  if (card.stripes === undefined && share.card.stripes) patch.stripes = share.card.stripes;
  return patch;
}

export type CardShareRoster = {
  students: readonly Student[];
  add(draft: StudentDraft, options: { rosterList: 'student' }): Student | null;
  update(id: string, draft: Partial<StudentDraft>): Student | null;
  link(id: string, studentId: string): Student | null;
};

export type CardShareAccept =
  | { ok: true; card: Student; decision: 'accepted' | 'merged'; photo: 'pending-head-coach' | 'none' }
  | { ok: false; reason: 'not-allowed' | 'not-pending' | 'no-card' | 'guest' | 'linked-elsewhere' | 'invalid' };

function photoSubmissionFrom(share: StudentCardShare): StudentPhotoSubmission | null {
  if (!share.photo) return null;
  return {
    schemaVersion: 1,
    kind: PHOTO_SUBMISSION_KIND,
    photoId: `photo-${share.shareId}`.slice(0, 80),
    studentId: share.studentId,
    submittedAt: share.sentAt,
    image: share.photo.image,
    parent: share.parent,
  };
}

/** Accept a pending share as a new Student Roster card, or merge it into `target.cardId`. */
export function acceptCardShare(
  storage: Store,
  shareId: string,
  actor: SyncActor,
  target: { mode: 'new' } | { mode: 'merge'; cardId: string },
  roster: CardShareRoster,
  now = Date.now(),
): CardShareAccept {
  if (!canAcceptCardShare(actor)) return { ok: false, reason: 'not-allowed' };
  const share = pendingCardShares(storage).find((row) => row.shareId === shareId);
  if (!share) return { ok: false, reason: 'not-pending' };
  let card: Student | null;
  let decision: 'accepted' | 'merged';
  if (target.mode === 'merge') {
    const current = roster.students.find((row) => row.id === target.cardId);
    if (!current) return { ok: false, reason: 'no-card' };
    if (current.guestId) return { ok: false, reason: 'guest' };
    if (current.linkedStudentId && current.linkedStudentId !== share.studentId) return { ok: false, reason: 'linked-elsewhere' };
    const patch = cardShareMergePatch(current, share);
    card = Object.keys(patch).length ? roster.update(current.id, patch) : current;
    decision = 'merged';
  } else {
    card = roster.add(
      {
        name: share.card.name,
        belt: share.card.belt || 'White',
        division: share.card.division,
        gym: share.card.gym,
        lastPromotion: '',
        lastPromotionDetail: '',
        note: '',
      } as StudentDraft,
      { rosterList: 'student' },
    );
    // Stripes go through update: a new card stores them only when set.
    if (card && share.card.stripes) card = roster.update(card.id, { stripes: share.card.stripes }) ?? card;
    decision = 'accepted';
  }
  if (!card) return { ok: false, reason: 'invalid' };
  const linked = card.linkedStudentId === share.studentId ? card : roster.link(card.id, share.studentId) ?? card;
  let photo: 'pending-head-coach' | 'none' = 'none';
  const submission = photoSubmissionFrom(share);
  if (submission) {
    const intake = intakePhotoSubmission(linked, submission);
    if (intake.ok) {
      savePhotoReview(storage, intake.review);
      photo = 'pending-head-coach';
    }
  }
  const state = read(storage);
  write(storage, { ...state, decided: [...state.decided, { shareId, decision, cardId: linked.id, at: now }] });
  return { ok: true, card: linked, decision, photo };
}

export function declineCardShare(storage: Store, shareId: string, actor: SyncActor, now = Date.now()): boolean {
  if (!canAcceptCardShare(actor)) return false;
  if (!pendingCardShares(storage).some((row) => row.shareId === shareId)) return false;
  const state = read(storage);
  write(storage, { ...state, decided: [...state.decided, { shareId, decision: 'declined', cardId: null, at: now }] });
  return true;
}

/* ------------------------------- file fallback ------------------------------- */

/** Coach imports a student file (tournament notice or card share). Anything else is refused. */
export function importStudentToCoachText(
  storage: Store,
  text: string,
  roster: readonly NoticeCard[],
): { kind: 'notice'; result: NoticeReceive } | { kind: 'card-share'; result: ShareReceive } | { kind: 'not-student-file' } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'not-student-file' };
  }
  if (readTournamentRegistration(raw)) return { kind: 'notice', result: receiveTournamentNotice(storage, raw, roster) };
  if (readStudentCardShare(raw)) return { kind: 'card-share', result: receiveCardShare(storage, raw) };
  return { kind: 'not-student-file' };
}
