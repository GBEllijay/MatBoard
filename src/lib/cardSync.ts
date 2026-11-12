/**
 * Card sync public API (coach device).
 *
 * This is the one surface a roster card UI (Coach Clipboard card) should use.
 * Everything here is coach → student, one way. The student accepts each update
 * on their phone; nothing overwrites the student's own data; the parent gate on
 * the student phone holds every packet when it is on.
 *
 *   getCardSyncState(studentId)          What the card shows: comms on/off, can a send go out now,
 *                                        rank fields, last send per field.
 *   setCardComms(studentId, on)          Per-student comms toggle. Off sends nothing.
 *   setCardParentPhotoApproval(id, on)   Coach-side "parent approves photos first".
 *   sendCoachAssessment(studentId, a)    Explicit "Send to student's card" for one assessment.
 *   sendCoachNote(studentId, n)          Explicit coach note, optional journal date.
 *   sendBeltProgress(studentId, b)       Explicit belt progress / benchmarks.
 *   sendCardSync(studentId, packet)      Gate + transport (Advantage Cloud, else gym folder if
 *                                        given, else a file to export) + sent log.
 *   rankCardFields(belt, promotions)     "Belt achieved" and "Last stripe awarded".
 *   rankCardFieldsFromRank(belt, rank)   Same rule from a student report's rank.
 *   subscribeCardSync(fn)                Re-render when the roster, sent log, or student notices change.
 *
 * The only two student → coach kinds (everything else is one way):
 *   getCardNotices(studentId)            Tournament registrations (also in getCardSyncState().notices).
 *                                        Shown on the student card and any linked competitor card.
 *   dismissCardNotice(eventId)           Dismiss on this device. Coach data is never changed.
 *   refreshCardNotices(studentId)        Pull this student's registrations from Advantage Cloud.
 *   getPendingCardShares()               Student card shares from a QR sign-up, waiting.
 *   refreshCardShares()                  Pull pending card shares from Advantage Cloud.
 *   acceptCardShare(shareId, target)     Instructor/Coach seat or owner: {mode:'new'} or
 *                                        {mode:'merge', cardId}. Merge fills only empty fields.
 *                                        The photo waits for head-coach photo review.
 *   declineCardShare(shareId)            Same seats. Nothing is deleted.
 *   importStudentFile(text)              File fallback for either kind.
 *
 * `studentId` may be the roster card id or the linked Student Edition id.
 * Guests and unlinked cards are never eligible. Assistant coach and program
 * director seats cannot send. Nothing here deletes anything sent before.
 *
 * Nothing syncs automatically. Every packet leaves only from an explicit send
 * call (a coach button press). Saving or editing a card never sends.
 */
import {
  applyStudentCoachUpdate,
  dismissStudentCoachUpdate,
  pendingStudentCoachUpdates,
  type StudentCoachUpdate,
  type UpdateApply,
} from './coachProgressFile.ts';
import {
  buildCoachAssessmentUpdate,
  buildCoachBeltProgressUpdate,
  buildCoachNoteUpdate,
  coachSyncOffFor,
  deliverSyncPacket,
  SYNC_GATE_COPY,
  syncActorFromToken,
  syncSendGate,
  type SyncActor,
  type SyncDelivery,
  type SyncGate,
  type SyncPacket,
  type SyncPacketKind,
} from './coachSync.ts';
import type { HandoffFolder } from './driveHandoff.ts';
import type { CoachBenchmarkStatus, CoachGymBrand, StudentRank } from './progress/types.ts';
import {
  acceptCardShare as acceptCardShareIn,
  COACH_STUDENT_INBOX_EVENT,
  declineCardShare as declineCardShareIn,
  dismissTournamentNotice,
  importStudentToCoachText,
  noticesForCard,
  pendingCardShares,
  receiveCardShare,
  receiveTournamentNotice,
  type CardShareAccept,
} from './coachStudentInbox.ts';
import {
  addStudent,
  getRoster,
  linkRosterCard,
  setAssignedInstructor,
  setCardSyncSettings,
  subscribeRoster,
  updateStudent,
  type Student,
} from './rosterStore.ts';
import type { StudentCardShare } from './studentCardShare.ts';
import { readCloudBearer } from './advantageCloudMedia.ts';
import { submitGymRoster } from './gymRosterClient.ts';
import { buildRosterBackup } from './rosterBackup.ts';
import type { TournamentRegistrationEvent } from './studentEvents.ts';
import {
  coachCardShareRequest,
  coachStudentEventList,
  readStoredEntitlementToken,
  type InboxDelivery,
} from './studentInboxClient.ts';

type MemoryStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Fields the owner confirmed for card sync, plus coach notes. Competition results (#372) still send as before. */
export const CARD_SYNC_FIELDS = ['rank', 'belt-progress', 'assessment', 'coach-note'] as const;
export type CardSyncField = (typeof CARD_SYNC_FIELDS)[number];

export const RANK_FIELD_DASH = '—';

/* ------------------------------ rank fields ------------------------------ */

/** One promotion. `stripe` 0 is the belt itself; 1 and up are stripes or degrees on that belt. */
export type RankPromotion = { belt: string; stripe: number; awardedOn: string };

export type RankCardFields = {
  /** The current belt's first promotion date (the belt promotion's awardedOn, never a stripe date), or a dash. */
  beltAchieved: string;
  /** The latest stripe promotion's awardedOn on the current belt, or a dash. No per-stripe dates. */
  lastStripeAwarded: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const beltKey = (belt: string) => belt.trim().toLowerCase();

export function rankCardFields(currentBelt: string, promotions: readonly RankPromotion[]): RankCardFields {
  const onBelt = promotions.filter(
    (row) => beltKey(row.belt) === beltKey(currentBelt) && ISO_DATE.test(row.awardedOn),
  );
  const dates = (rows: RankPromotion[]) => rows.map((row) => row.awardedOn).sort();
  const beltDays = dates(onBelt.filter((row) => row.stripe === 0));
  const stripes = dates(onBelt.filter((row) => row.stripe > 0));
  return {
    beltAchieved: beltDays[0] ?? RANK_FIELD_DASH,
    lastStripeAwarded: stripes[stripes.length - 1] ?? RANK_FIELD_DASH,
  };
}

/** Student report rank: awardedOn is the belt date; tape and high-degree dates are stripes. */
export function rankCardFieldsFromRank(
  belt: string,
  rank: Pick<StudentRank, 'awardedOn' | 'tapeDates' | 'highDegreeDates'>,
): RankCardFields {
  const promotions: RankPromotion[] = [{ belt, stripe: 0, awardedOn: rank.awardedOn }];
  [...rank.tapeDates, ...(rank.highDegreeDates ?? [])].forEach((date, index) => {
    if (date) promotions.push({ belt, stripe: index + 1, awardedOn: date });
  });
  const fields = rankCardFields(belt, promotions);
  // The belt date is the belt's own awardedOn, never an earlier stripe date.
  return { ...fields, beltAchieved: ISO_DATE.test(rank.awardedOn) ? rank.awardedOn : RANK_FIELD_DASH };
}

/* -------------------------------- sent log -------------------------------- */

export const CARD_SYNC_SENT_KEY = 'matboard.coach.cardSyncSent.v1';
export const CARD_SYNC_EVENT = 'matboard-card-sync';
const SENT_MAX = 400;

export type CardSyncSendMode = 'cloud' | 'folder' | 'file';

export type CardSyncSent = {
  linkedStudentId: string;
  kind: SyncPacketKind;
  updateId: string;
  sentAt: number;
  mode: CardSyncSendMode;
  /** Rank sends only: the promotion the coach sent. */
  promotion?: RankPromotion;
};

function defaultStorage(): MemoryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readCardSyncSent(storage: Pick<MemoryStore, 'getItem'> | null = defaultStorage()): CardSyncSent[] {
  try {
    const parsed = JSON.parse(storage?.getItem(CARD_SYNC_SENT_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is CardSyncSent =>
        !!row &&
        typeof row.linkedStudentId === 'string' &&
        typeof row.kind === 'string' &&
        typeof row.updateId === 'string' &&
        typeof row.sentAt === 'number' &&
        ['cloud', 'folder', 'file'].includes(row.mode),
    );
  } catch {
    return [];
  }
}

export function recordCardSyncSent(
  packet: SyncPacket,
  mode: CardSyncSendMode,
  storage: MemoryStore | null = defaultStorage(),
  now = Date.now(),
): void {
  if (!storage) return;
  const row: CardSyncSent = { linkedStudentId: packet.studentId, kind: packet.kind, updateId: packet.updateId, sentAt: now, mode };
  if (packet.kind === 'coach-rank-update') {
    row.promotion = {
      belt: packet.rankUpdate.belt,
      stripe: packet.rankUpdate.stripeCount,
      awardedOn: packet.rankUpdate.promotionDate,
    };
  }
  const next = [...readCardSyncSent(storage).filter((item) => item.updateId !== row.updateId), row].slice(-SENT_MAX);
  storage.setItem(CARD_SYNC_SENT_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(CARD_SYNC_EVENT));
  }
}

/* ------------------------------- card state ------------------------------- */

const FIELD_KIND: Record<CardSyncField, SyncPacketKind> = {
  rank: 'coach-rank-update',
  'belt-progress': 'coach-belt-progress-update',
  assessment: 'coach-assessment-update',
  'coach-note': 'coach-note-update',
};

export type CardSyncState = {
  cardId: string;
  linkedStudentId: string | null;
  /** A gym-account student: linked and not a guest. */
  eligible: boolean;
  /** Per-student comms toggle. Off on any card of this student means off. */
  comms: 'on' | 'off';
  /** 'send' when a send would go out now for this actor; otherwise why not. */
  gate: SyncGate;
  gateText: string | null;
  parentPhotoApproval: boolean;
  fields: readonly CardSyncField[];
  rank: { belt: string; stripes: number } & RankCardFields;
  /** Newest send per confirmed field. Sent is not accepted; the student decides on their phone. */
  lastSent: Partial<Record<CardSyncField, { updateId: string; sentAt: number; mode: CardSyncSendMode }>>;
  /**
   * Student → coach tournament registrations, not dismissed. The same list
   * shows on the Student Roster card and any linked Competitor card. Read only.
   */
  notices: TournamentRegistrationEvent[];
};

export type CardSyncDeps = {
  roster?: readonly Student[];
  actor?: SyncActor;
  storage?: Pick<MemoryStore, 'getItem'> | null;
};

function findCard(studentId: string, roster: readonly Student[]): Student | null {
  return (
    roster.find((card) => card.id === studentId) ??
    roster.find((card) => card.linkedStudentId === studentId && !card.guestId) ??
    null
  );
}

function currentActor(): SyncActor {
  return syncActorFromToken(readStoredEntitlementToken());
}

export function getCardSyncState(studentId: string, deps: CardSyncDeps = {}): CardSyncState | null {
  const roster = deps.roster ?? getRoster().students;
  const card = findCard(studentId, roster);
  if (!card) return null;
  const actor = deps.actor ?? currentActor();
  const gate = syncSendGate(card, actor, roster);
  const linked = card.linkedStudentId ?? null;
  const sent = linked ? readCardSyncSent(deps.storage === undefined ? defaultStorage() : deps.storage) : [];
  const mine = sent.filter((row) => row.linkedStudentId === linked);
  const lastSent: CardSyncState['lastSent'] = {};
  for (const field of CARD_SYNC_FIELDS) {
    const newest = mine.filter((row) => row.kind === FIELD_KIND[field]).sort((a, b) => b.sentAt - a.sentAt)[0];
    if (newest) lastSent[field] = { updateId: newest.updateId, sentAt: newest.sentAt, mode: newest.mode };
  }
  const stripes = card.stripes ?? 0;
  const promotions: RankPromotion[] = mine.flatMap((row) => (row.promotion ? [row.promotion] : []));
  if (card.lastPromotion) promotions.push({ belt: card.belt, stripe: stripes, awardedOn: card.lastPromotion });
  const offEverywhere = card.coachSync === 'off' || coachSyncOffFor(roster, linked ?? undefined);
  return {
    cardId: card.id,
    linkedStudentId: linked,
    eligible: Boolean(linked) && !card.guestId,
    comms: offEverywhere ? 'off' : 'on',
    gate,
    gateText: gate === 'send' ? null : SYNC_GATE_COPY[gate],
    parentPhotoApproval: card.parentPhotoApproval === true,
    fields: CARD_SYNC_FIELDS,
    rank: { belt: card.belt, stripes, ...rankCardFields(card.belt, promotions) },
    lastSent,
    notices: noticesForCard(
      deps.storage === undefined ? (defaultStorage() ?? EMPTY_STORE) : (deps.storage ?? EMPTY_STORE),
      studentId,
      roster,
    ),
  };
}

const EMPTY_STORE: Pick<MemoryStore, 'getItem'> = { getItem: () => null };

/** Per-student comms toggle. Off applies to every card linked to the same student. */
export function setCardComms(studentId: string, on: boolean, roster: readonly Student[] = getRoster().students): boolean {
  const card = findCard(studentId, roster);
  if (!card) return false;
  const targets = card.linkedStudentId
    ? roster.filter((row) => row.linkedStudentId === card.linkedStudentId)
    : [card];
  for (const row of targets) setCardSyncSettings(row.id, { coachSync: on ? 'on' : 'off' });
  return true;
}

export function setCardParentPhotoApproval(studentId: string, on: boolean): boolean {
  const card = findCard(studentId, getRoster().students);
  if (!card) return false;
  return Boolean(setCardSyncSettings(card.id, { parentPhotoApproval: on }));
}

export type CardSyncSendResult = SyncDelivery | { mode: 'folder'; name: string } | { mode: 'blocked'; gate: 'unknown-card'; reason: string };

/**
 * The one send for a card. Checks the card gate (comms, guest, linked, seat),
 * sends over Advantage Cloud, falls back to the gym folder when one is given,
 * then to a file for the coach to export. Logs sends that went out.
 */
export async function sendCardSync(
  studentId: string,
  packet: SyncPacket,
  options: CardSyncDeps & {
    folder?: HandoffFolder | null;
    deliver?: (packet: SyncPacket) => Promise<InboxDelivery>;
    log?: MemoryStore | null;
    now?: number;
  } = {},
): Promise<CardSyncSendResult> {
  const roster = options.roster ?? getRoster().students;
  const card = findCard(studentId, roster);
  if (!card) return { mode: 'blocked', gate: 'unknown-card', reason: 'That card is not on this roster.' };
  let gate = syncSendGate(card, options.actor ?? currentActor(), roster);
  if (gate === 'send' && card.linkedStudentId !== packet.studentId) gate = 'unlinked';
  const result = await deliverSyncPacket(packet, gate, { folder: options.folder, deliver: options.deliver });
  if (result.mode !== 'blocked') {
    recordCardSyncSent(packet, result.mode, options.log === undefined ? defaultStorage() : options.log, options.now);
  }
  return result;
}

export type CardSendOptions = Parameters<typeof sendCardSync>[2] & {
  gym?: CoachGymBrand;
  now?: number;
  /** Called with the built packet before it is sent, so a caller can keep its updateId. */
  onBuilt?: (packet: SyncPacket) => void;
};
export type CardBuildRefused = { mode: 'invalid'; error: string };

function today(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function linkedIdFor(studentId: string, options: CardSendOptions): string {
  const card = findCard(studentId, options.roster ?? getRoster().students);
  return card && !card.guestId ? card.linkedStudentId ?? '' : '';
}

/** Gate first, so a guest or unlinked card reports why instead of a build error. */
function blockedBeforeBuild(studentId: string, options: CardSendOptions): CardSyncSendResult | null {
  const roster = options.roster ?? getRoster().students;
  const card = findCard(studentId, roster);
  if (!card) return { mode: 'blocked', gate: 'unknown-card', reason: 'That card is not on this roster.' };
  const gate = syncSendGate(card, options.actor ?? currentActor(), roster);
  return gate === 'send' ? null : { mode: 'blocked', gate, reason: SYNC_GATE_COPY[gate] };
}

/**
 * Explicit "Send to student's card" for one coach assessment. Each press sends
 * one packet; the student accepts it, the parent gate holds it when on, and it
 * sits beside the student's own self-assessment without changing it.
 */
export async function sendCoachAssessment(
  studentId: string,
  assessment: { date?: string; scores: Record<string, number>; strengths?: string; weaknesses?: string; note?: string },
  options: CardSendOptions = {},
): Promise<CardSyncSendResult | CardBuildRefused> {
  const blocked = blockedBeforeBuild(studentId, options);
  if (blocked) return blocked;
  const now = options.now ?? Date.now();
  const built = buildCoachAssessmentUpdate({
    studentId: linkedIdFor(studentId, options),
    date: assessment.date || today(now),
    scores: assessment.scores,
    strengths: assessment.strengths,
    weaknesses: assessment.weaknesses,
    note: assessment.note,
    gym: options.gym,
    now,
  });
  if (!built.ok) return { mode: 'invalid', error: built.error };
  options.onBuilt?.(built.packet);
  return sendCardSync(studentId, built.packet, options);
}

/** Explicit coach note. On accept it is appended under the journal entry for `journalDate` (default today). */
export async function sendCoachNote(
  studentId: string,
  input: { note: string; journalDate?: string },
  options: CardSendOptions = {},
): Promise<CardSyncSendResult | CardBuildRefused> {
  const blocked = blockedBeforeBuild(studentId, options);
  if (blocked) return blocked;
  const now = options.now ?? Date.now();
  const built = buildCoachNoteUpdate({
    studentId: linkedIdFor(studentId, options),
    note: input.note,
    issuedOn: today(now),
    journalDate: input.journalDate,
    gym: options.gym,
    now,
  });
  if (!built.ok) return { mode: 'invalid', error: built.error };
  return sendCardSync(studentId, built.packet, options);
}

/** Explicit belt progress: the coach's view of each benchmark. Never checks off the student's items. */
export async function sendBeltProgress(
  studentId: string,
  input: {
    belt: string;
    issuedOn?: string;
    note?: string;
    benchmarks: { targetId: string; name: string; coachStatus: CoachBenchmarkStatus; note?: string }[];
  },
  options: CardSendOptions = {},
): Promise<CardSyncSendResult | CardBuildRefused> {
  const blocked = blockedBeforeBuild(studentId, options);
  if (blocked) return blocked;
  const now = options.now ?? Date.now();
  const built = buildCoachBeltProgressUpdate({
    studentId: linkedIdFor(studentId, options),
    belt: input.belt,
    issuedOn: input.issuedOn || today(now),
    note: input.note,
    benchmarks: input.benchmarks,
    gym: options.gym,
    now,
  });
  if (!built.ok) return { mode: 'invalid', error: built.error };
  return sendCardSync(studentId, built.packet, options);
}

export function subscribeCardSync(fn: () => void): () => void {
  const off = subscribeRoster(fn);
  const onEvent = () => fn();
  if (typeof window !== 'undefined') {
    window.addEventListener(CARD_SYNC_EVENT, onEvent);
    window.addEventListener(COACH_STUDENT_INBOX_EVENT, onEvent);
  }
  return () => {
    off();
    if (typeof window !== 'undefined') {
      window.removeEventListener(CARD_SYNC_EVENT, onEvent);
      window.removeEventListener(COACH_STUDENT_INBOX_EVENT, onEvent);
    }
  };
}

/* --------------------------- student → coach (narrow) -------------------------- */

/** Tournament registration notices for one card (card id or linked student id). */
export function getCardNotices(
  studentId: string,
  deps: { roster?: readonly Student[]; storage?: Pick<MemoryStore, 'getItem'> | null } = {},
): TournamentRegistrationEvent[] {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  return storage ? noticesForCard(storage, studentId, deps.roster ?? getRoster().students) : [];
}

/** Dismiss on this coach device only. Coach data is not changed. */
export function dismissCardNotice(eventId: string, storage: MemoryStore | null = defaultStorage()): void {
  if (storage) dismissTournamentNotice(storage, eventId);
}

/** Pull this student's tournament registrations from Advantage Cloud. */
export async function refreshCardNotices(
  studentId: string,
  deps: { roster?: readonly Student[]; storage?: MemoryStore | null; fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<{ ok: true; stored: number } | { ok: false; reason: 'unknown-card' | 'not-linked' | 'cloud' }> {
  const roster = deps.roster ?? getRoster().students;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const card = findCard(studentId, roster);
  if (!card || !storage) return { ok: false, reason: 'unknown-card' };
  if (!card.linkedStudentId || card.guestId) return { ok: false, reason: 'not-linked' };
  const listed = await coachStudentEventList(card.linkedStudentId, { fetchImpl: deps.fetchImpl, token: deps.token });
  if (!listed.ok) return { ok: false, reason: 'cloud' };
  let stored = 0;
  for (const event of listed.events) {
    const result = receiveTournamentNotice(storage, event, roster);
    if (result === 'stored' || result === 'updated') stored += 1;
  }
  return { ok: true, stored };
}

/** Student card shares waiting for an Instructor or Coach seat. */
export function getPendingCardShares(storage: Pick<MemoryStore, 'getItem'> | null = defaultStorage()): StudentCardShare[] {
  return storage ? pendingCardShares(storage) : [];
}

/** Pull pending card shares from Advantage Cloud (license from the coach token). */
export async function refreshCardShares(
  deps: { storage?: MemoryStore | null; fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<{ ok: true; pending: number } | { ok: false; reason: 'cloud' }> {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  // studentId is only the request shape; the list is gym-wide.
  const listed = await coachCardShareRequest('card-share-list', { studentId: 'coach' }, deps);
  if (!listed.ok || !storage) return { ok: false, reason: 'cloud' };
  const shares = Array.isArray(listed.body.shares) ? listed.body.shares : [];
  for (const share of shares) receiveCardShare(storage, share);
  return { ok: true, pending: pendingCardShares(storage).length };
}

async function markShareDecided(share: StudentCardShare | undefined, deps: { fetchImpl?: typeof fetch; token?: string | null }) {
  if (!share) return;
  // Best effort marker so other coach devices stop listing it. Nothing is deleted.
  await coachCardShareRequest('card-share-decide', { studentId: share.studentId, shareId: share.shareId }, deps);
}

/**
 * Accept a card share as a new Student Roster card (`{mode:'new'}`) or merge
 * into an existing card (`{mode:'merge', cardId}`). Merge fills only empty
 * coach fields. The photo goes to head-coach photo review, never onto the card.
 */
export type CardShareMasterPush = 'applied' | 'pending' | 'skipped' | 'failed';

export type CardShareAcceptResult =
  | (Extract<CardShareAccept, { ok: true }> & { assignedInstructorId: string | null; master: CardShareMasterPush })
  | Extract<CardShareAccept, { ok: false }>;

/** One student card to the academy master roster: the owner applies at once, a seat goes to the head coach (or trust mode). */
async function pushCardToMaster(card: Student, deps: { fetchImpl?: typeof fetch; token?: string | null }): Promise<CardShareMasterPush> {
  const token = deps.token ?? readCloudBearer();
  if (!token || !card.linkedStudentId || card.guestId) return 'skipped';
  const backup = buildRosterBackup(
    {
      roster: { version: 1, students: [{ ...card, checkedIn: false }], ready: {}, gamePlans: {}, competitionPlans: {} },
      cardFile: { cards: {} },
      privateNotes: {},
      inbox: [],
    },
    { scope: 'shared' },
  );
  const sent = await submitGymRoster(backup, deps.fetchImpl ?? fetch, token);
  if (!sent.ok) return 'failed';
  return sent.data.applied ? 'applied' : 'pending';
}

/**
 * Accept a card share as a new Student Roster card (`{mode:'new'}`) or merge
 * into an existing card (`{mode:'merge', cardId}`). Merge fills only empty
 * coach fields. The photo goes to head-coach photo review, never onto the card.
 *
 * The code the student scanned says who showed it (share.viaInstructorId, checked by
 * the server). That fills a blank assignedInstructorId on the card; it never moves a
 * student who is already assigned. The card then goes to the academy master roster
 * under the same linkedStudentId, so attendance keeps one person key.
 */
export async function acceptCardShare(
  shareId: string,
  target: { mode: 'new' } | { mode: 'merge'; cardId: string },
  deps: {
    actor?: SyncActor;
    storage?: MemoryStore | null;
    fetchImpl?: typeof fetch;
    token?: string | null;
    pushMaster?: (card: Student) => Promise<CardShareMasterPush>;
  } = {},
): Promise<CardShareAcceptResult> {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  if (!storage) return { ok: false, reason: 'not-pending' };
  const share = pendingCardShares(storage).find((row) => row.shareId === shareId);
  const result = acceptCardShareIn(storage, shareId, deps.actor ?? currentActor(), target, {
    students: getRoster().students,
    add: addStudent,
    update: updateStudent,
    link: linkRosterCard,
  });
  if (!result.ok) return result;
  await markShareDecided(share, deps);
  let card = result.card;
  if (share?.viaInstructorId) card = setAssignedInstructor(card.id, share.viaInstructorId) ?? card;
  let master: CardShareMasterPush = 'skipped';
  try {
    master = await (deps.pushMaster ?? ((row: Student) => pushCardToMaster(row, deps)))(card);
  } catch {
    master = 'failed';
  }
  return { ...result, card, assignedInstructorId: card.assignedInstructorId ?? null, master };
}

export async function declineCardShare(
  shareId: string,
  deps: { actor?: SyncActor; storage?: MemoryStore | null; fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<boolean> {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  if (!storage) return false;
  const share = pendingCardShares(storage).find((row) => row.shareId === shareId);
  const done = declineCardShareIn(storage, shareId, deps.actor ?? currentActor());
  if (done) await markShareDecided(share, deps);
  return done;
}

/** File fallback: a student's tournament notice or card share file. */
export function importStudentFile(text: string, storage: MemoryStore | null = defaultStorage()) {
  if (!storage) return { kind: 'not-student-file' as const };
  return importStudentToCoachText(storage, text, getRoster().students);
}

/** "Make a file for my coach" updates waiting on this coach phone. */
export function getPendingStudentUpdates(storage: MemoryStore | null = defaultStorage()): StudentCoachUpdate[] {
  return storage ? pendingStudentCoachUpdates(storage) : [];
}

/** Fill blanks on the linked card. Belt and stripes only with `approveRank`. */
export function applyStudentUpdate(
  updateId: string,
  approveRank: boolean,
  deps: { actor?: SyncActor; storage?: MemoryStore | null } = {},
): UpdateApply {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  if (!storage) return { ok: false, reason: 'not-pending' };
  return applyStudentCoachUpdate(
    storage,
    updateId,
    { students: getRoster().students, update: updateStudent },
    { actor: deps.actor ?? currentActor(), approveRank },
  );
}

export function dismissStudentUpdate(updateId: string, storage: MemoryStore | null = defaultStorage()): void {
  if (storage) dismissStudentCoachUpdate(storage, updateId);
}

export { COACH_STUDENT_INBOX_EVENT };
