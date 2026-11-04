/**
 * Full roster backup: one versioned JSON file with everything on the coach's
 * roster. It is the same file the coach saves to a gym folder or Advantage
 * Cloud, minus private coach notes when it leaves the device.
 *
 * Import only adds students that are not here yet, or fills fields that are
 * blank here. It never overwrites a value, never removes anything, and running
 * it twice changes nothing the second time.
 *
 * Matching, inside the same list (Student Roster or Competitor Roster):
 *   1. the same roster id,
 *   2. the same linked Student Edition id,
 *   3. the same name and belt, case-insensitive.
 * When step 2 or 3 finds more than one card here, the row is reported as
 * ambiguous and skipped. Nothing is guessed.
 */

import {
  type CoachInboxItemLike,
  type RosterCardFile,
  type RosterCardRecordLike,
} from './rosterCardFields.ts';

/**
 * Roster card shape this file needs. `Student` in rosterStore.ts fits it. This
 * file does not import rosterStore so the Advantage Cloud function can use it too.
 */
export type BackupStudent = {
  id: string;
  name: string;
  belt: string;
  division?: string;
  gym?: string;
  photo?: string;
  lastPromotion?: string;
  lastPromotionDetail?: string;
  note?: string;
  checkedIn?: boolean;
  rosterList?: 'student';
  linkedStudentId?: string;
  guestId?: string;
  stripes?: number;
  /** Roster sync layer: 'off' keeps the card local. */
  coachSync?: 'off';
  parentPhotoApproval?: true;
  cardPhotoId?: string;
  /**
   * No photos for this student. 'family' = the student or a parent set it and only
   * the family can clear it; 'coach' = the coach set it. While set, no photo of this
   * student is kept in any backup, gym folder or Advantage Cloud copy.
   */
  noPhotos?: 'coach' | 'family';
};

/** Same shape as BackupRoster in rosterStore.ts. Plan maps are keyed by roster id. */
export type BackupRoster = {
  version: 1;
  students: BackupStudent[];
  ready: Record<string, unknown>;
  gamePlans: Record<string, unknown>;
  competitionPlans: Record<string, unknown>;
};

export type RosterNormalizer = (raw: unknown) => BackupRoster;

const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
const STUDENT_TEXT = ['division', 'gym', 'photo', 'lastPromotion', 'lastPromotionDetail', 'note'] as const;

/**
 * Shape check used where rosterStore is not loaded (the cloud function). The app
 * passes rosterStore.normalizeRoster instead, which also clips and checks belts.
 */
export function lightNormalizeRoster(raw: unknown): BackupRoster {
  const out: BackupRoster = { version: 1, students: [], ready: {}, gamePlans: {}, competitionPlans: {} };
  if (!raw || typeof raw !== 'object') return out;
  const row = raw as Record<string, unknown>;
  const seen = new Set<string>();
  for (const item of Array.isArray(row.students) ? row.students : []) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const id = typeof s.id === 'string' ? s.id.trim() : '';
    const name = typeof s.name === 'string' ? s.name.trim().slice(0, 80) : '';
    const belt = typeof s.belt === 'string' ? s.belt.trim().slice(0, 40) : '';
    if (!ID_RE.test(id) || !name || !belt || seen.has(id)) continue;
    seen.add(id);
    const student: BackupStudent = { id, name, belt, checkedIn: false };
    for (const field of STUDENT_TEXT) if (typeof s[field] === 'string') student[field] = s[field] as string;
    if (s.rosterList === 'student') student.rosterList = 'student';
    if (typeof s.linkedStudentId === 'string' && ID_RE.test(s.linkedStudentId)) student.linkedStudentId = s.linkedStudentId;
    if (typeof s.guestId === 'string' && ID_RE.test(s.guestId)) student.guestId = s.guestId;
    if (typeof s.stripes === 'number' && Number.isInteger(s.stripes) && s.stripes >= 0 && s.stripes <= 4) student.stripes = s.stripes;
    if (s.coachSync === 'off') student.coachSync = 'off';
    if (s.parentPhotoApproval === true) student.parentPhotoApproval = true;
    if (typeof s.cardPhotoId === 'string' && ID_RE.test(s.cardPhotoId)) student.cardPhotoId = s.cardPhotoId;
    if (s.noPhotos === 'coach' || s.noPhotos === 'family') {
      student.noPhotos = s.noPhotos;
      student.photo = '';
      delete student.cardPhotoId;
    }
    out.students.push(student);
  }
  for (const map of ['ready', 'gamePlans', 'competitionPlans'] as const) {
    const bag = row[map];
    if (!bag || typeof bag !== 'object') continue;
    for (const [id, value] of Object.entries(bag as Record<string, unknown>)) {
      if (seen.has(id) && value && typeof value === 'object') out[map][id] = value;
    }
  }
  return out;
}

export const ROSTER_BACKUP_KIND = 'advantage-roster-backup';
export const ROSTER_BACKUP_SCHEMA_VERSION = 1;
export const ROSTER_BACKUP_FILE_NAME = 'advantage-roster-backup.json';

/**
 * coach-private: the coach's own file on this device. Carries private coach notes.
 * shared: what goes to a gym folder or Advantage Cloud. Never carries private notes.
 */
export type RosterBackupScope = 'coach-private' | 'shared';

export type RosterBackup = {
  kind: typeof ROSTER_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  app: 'Advantage';
  scope: RosterBackupScope;
  roster: BackupRoster;
  /** Coach Clipboard card records keyed by roster id: assessments, benchmarks, belt dates, training notes, competitor link. */
  cards: Record<string, RosterCardRecordLike>;
  cardSettings?: Record<string, unknown>;
  /** Coach inbox: card shares, tournament registration notices, competitor info. */
  inbox: CoachInboxItemLike[];
  /** Private coach notes keyed by roster id. Only on scope coach-private. */
  privateNotes?: Record<string, string>;
  /** Coach sync stores. Shared copies leave out card shares and photo reviews (student photos, parent contact). */
  coachStores?: CoachSyncStores;
};

export type RosterBackupSources = {
  roster: BackupRoster;
  cardFile: RosterCardFile;
  privateNotes: Record<string, string>;
  inbox: CoachInboxItemLike[];
  /** Coach sync stores from the roster sync layer (#392). Optional so older callers still work. */
  coachStores?: CoachSyncStores;
};

/**
 * Coach-side stores from the roster sync layer:
 * - studentInbox: `matboard.coach.studentInbox.v1` — tournament registration notices,
 *   dismissed notices, student card shares (QR sign-up), and share decisions.
 * - photoReviews: `matboard.coach.photoReviews.v1` — student photos waiting on a parent or head coach.
 * - cardSyncSent: `matboard.coach.cardSyncSent.v1` — what the coach already sent each student.
 */
export type CoachSyncStores = {
  studentInbox: { notices: unknown[]; dismissed: string[]; shares: unknown[]; decided: unknown[] };
  photoReviews: unknown[];
  cardSyncSent: unknown[];
};

export const COACH_STORE_CAPS = { notices: 300, dismissed: 300, shares: 60, decided: 240, photoReviews: 40, cardSyncSent: 400 } as const;

export function emptyCoachStores(): CoachSyncStores {
  return { studentInbox: { notices: [], dismissed: [], shares: [], decided: [] }, photoReviews: [], cardSyncSent: [] };
}

export type AmbiguousMatch = { name: string; belt: string; list: 'student' | 'competitor'; reason: 'linked-student' | 'name-belt'; matches: number };

export type RosterMergeReport = {
  studentsAdded: number;
  studentsFilled: number;
  studentsUnchanged: number;
  ambiguous: AmbiguousMatch[];
  cardsAdded: number;
  cardsFilled: number;
  privateNotesAdded: number;
  plansAdded: number;
  inboxAdded: number;
  /** Notices, card shares, decisions, photo reviews and sent-log rows from the roster sync layer. */
  coachItemsAdded: number;
  /** The file came from a newer Advantage. Known fields were read; the rest were left out. */
  newerSchema: boolean;
};

export function buildRosterBackup(
  sources: RosterBackupSources,
  options: { scope: RosterBackupScope; now?: Date },
): RosterBackup {
  const { cards, settings } = sources.cardFile;
  const backup: RosterBackup = {
    kind: ROSTER_BACKUP_KIND,
    schemaVersion: ROSTER_BACKUP_SCHEMA_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    app: 'Advantage',
    scope: options.scope,
    roster: structuredClone(sources.roster),
    cards: structuredClone(cards),
    inbox: structuredClone(sources.inbox),
  };
  if (settings) backup.cardSettings = structuredClone(settings);
  if (sources.coachStores) backup.coachStores = structuredClone(sources.coachStores);
  if (options.scope === 'coach-private') {
    backup.privateNotes = { ...sources.privateNotes };
    return withoutBlockedPhotos(backup);
  }
  return sharedRosterBackup(backup);
}

/** Roster ids whose No photos flag is set. */
export function noPhotosIds(roster: BackupRoster): Set<string> {
  return new Set(roster.students.filter((row) => row.noPhotos === 'coach' || row.noPhotos === 'family').map((row) => row.id));
}

/**
 * No photos: blank the student's photo and card photo id, drop the card's photo
 * fields, and drop photo reviews and card-share photos for that card. Used on
 * every scope, so a coach-private file, a gym folder copy and an Advantage Cloud
 * copy never hold a photo of a No photos student. The flag itself stays.
 */
export function withoutBlockedPhotos<T extends Pick<RosterBackup, 'roster' | 'cards'> & { coachStores?: CoachSyncStores }>(backup: T): T {
  const blocked = noPhotosIds(backup.roster);
  if (!blocked.size) return backup;
  const out = { ...backup };
  out.roster = {
    ...backup.roster,
    students: backup.roster.students.map((row) => {
      if (!blocked.has(row.id)) return row;
      const copy: BackupStudent = { ...row, photo: '' };
      delete copy.cardPhotoId;
      return copy;
    }),
  };
  const cards: Record<string, RosterCardRecordLike> = {};
  for (const [id, card] of Object.entries(backup.cards)) {
    if (!blocked.has(id)) {
      cards[id] = card;
      continue;
    }
    const copy: RosterCardRecordLike = { ...card };
    for (const field of CARD_PHOTO_FIELDS) delete copy[field];
    cards[id] = copy;
  }
  out.cards = cards;
  if (backup.coachStores) {
    const cardOf = (row: unknown) => (row && typeof row === 'object' && typeof (row as { cardId?: unknown }).cardId === 'string' ? (row as { cardId: string }).cardId : '');
    const decidedCard = new Map<string, string>();
    for (const row of backup.coachStores.studentInbox.decided) {
      const shareId = field(row, 'shareId');
      const cardId = cardOf(row);
      if (shareId && cardId) decidedCard.set(shareId, cardId);
    }
    out.coachStores = {
      ...backup.coachStores,
      studentInbox: {
        ...backup.coachStores.studentInbox,
        shares: backup.coachStores.studentInbox.shares.map((row) => {
          const cardId = decidedCard.get(field(row, 'shareId'));
          if (!cardId || !blocked.has(cardId) || !row || typeof row !== 'object') return row;
          const copy = { ...(row as Record<string, unknown>) };
          delete copy.photo;
          return copy;
        }),
      },
      photoReviews: backup.coachStores.photoReviews.filter((row) => !blocked.has(cardOf(row))),
    };
  }
  return out;
}

export function serializeRosterBackup(backup: RosterBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

const CARD_PHOTO_FIELDS = ['photos', 'shownPhotoId'];

/**
 * The shared copy of a backup for a gym folder or Advantage Cloud.
 * Leaves out private coach notes, face photos (they stay on the device),
 * student card shares (parent contact, photo), and photo reviews.
 */
export function sharedRosterBackup(backup: RosterBackup): RosterBackup {
  const shared: RosterBackup = { ...withoutBlockedPhotos(backup), scope: 'shared' };
  delete shared.privateNotes;
  shared.roster = {
    ...backup.roster,
    students: backup.roster.students.map((row) => {
      const copy: BackupStudent = { ...row, photo: '' };
      delete copy.cardPhotoId;
      return copy;
    }),
  };
  const cards: Record<string, RosterCardRecordLike> = {};
  for (const [id, card] of Object.entries(backup.cards)) {
    const copy: RosterCardRecordLike = { ...card };
    for (const field of CARD_PHOTO_FIELDS) delete copy[field];
    cards[id] = copy;
  }
  shared.cards = cards;
  if (backup.coachStores) {
    shared.coachStores = {
      studentInbox: { ...backup.coachStores.studentInbox, shares: [] },
      photoReviews: [],
      cardSyncSent: backup.coachStores.cardSyncSent,
    };
  }
  return shared;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readCoachStores(raw: unknown): CoachSyncStores | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const inbox = (row.studentInbox && typeof row.studentInbox === 'object' ? row.studentInbox : {}) as Record<string, unknown>;
  const objects = (value: unknown) => arrayOf(value).filter((item) => item && typeof item === 'object');
  return {
    studentInbox: {
      notices: objects(inbox.notices),
      dismissed: arrayOf(inbox.dismissed).filter((item): item is string => typeof item === 'string'),
      shares: objects(inbox.shares),
      decided: objects(inbox.decided),
    },
    photoReviews: objects(row.photoReviews),
    cardSyncSent: objects(row.cardSyncSent),
  };
}

export type ParsedRosterBackup = { ok: true; backup: RosterBackup; newerSchema: boolean } | { ok: false; error: string };

export function parseRosterBackup(text: string, normalize: RosterNormalizer = lightNormalizeRoster): ParsedRosterBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, error: 'That file is not an Advantage roster backup.' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'That file is not an Advantage roster backup.' };
  const row = raw as Partial<RosterBackup> & Record<string, unknown>;
  if (row.kind !== ROSTER_BACKUP_KIND) return { ok: false, error: 'That file is not an Advantage roster backup.' };
  const version = typeof row.schemaVersion === 'number' && Number.isInteger(row.schemaVersion) ? row.schemaVersion : 0;
  if (version < 1) return { ok: false, error: 'That roster backup has no schema version.' };
  const scope: RosterBackupScope = row.scope === 'coach-private' ? 'coach-private' : 'shared';
  const cards: Record<string, RosterCardRecordLike> = {};
  if (row.cards && typeof row.cards === 'object') {
    for (const [id, card] of Object.entries(row.cards as Record<string, unknown>)) {
      if (card && typeof card === 'object' && !Array.isArray(card)) cards[id] = card as RosterCardRecordLike;
    }
  }
  const inbox = Array.isArray(row.inbox)
    ? (row.inbox as unknown[]).filter(
        (item): item is CoachInboxItemLike =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as CoachInboxItemLike).packet?.updateId === 'string' &&
          typeof (item as CoachInboxItemLike).status === 'string',
      )
    : [];
  const backup: RosterBackup = {
    kind: ROSTER_BACKUP_KIND,
    schemaVersion: version,
    exportedAt: typeof row.exportedAt === 'string' ? row.exportedAt : '',
    app: 'Advantage',
    scope,
    roster: normalize(row.roster),
    cards,
    inbox,
  };
  const coachStores = readCoachStores(row.coachStores);
  if (coachStores) backup.coachStores = coachStores;
  if (row.cardSettings && typeof row.cardSettings === 'object') backup.cardSettings = row.cardSettings as Record<string, unknown>;
  if (scope === 'coach-private' && row.privateNotes && typeof row.privateNotes === 'object') {
    const notes: Record<string, string> = {};
    for (const [id, text] of Object.entries(row.privateNotes as Record<string, unknown>)) {
      if (typeof text === 'string' && text.trim()) notes[id] = text;
    }
    backup.privateNotes = notes;
  }
  return { ok: true, backup, newerSchema: version > ROSTER_BACKUP_SCHEMA_VERSION };
}

function listOf(student: Pick<BackupStudent, 'rosterList'>): 'student' | 'competitor' {
  return student.rosterList === 'student' ? 'student' : 'competitor';
}

function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

type MatchResult = { kind: 'match'; id: string } | { kind: 'none' } | { kind: 'ambiguous'; reason: AmbiguousMatch['reason']; matches: number };

/** Find the local card for an incoming one. Exported for tests. */
export function matchStudent(local: readonly BackupStudent[], incoming: BackupStudent): MatchResult {
  const list = listOf(incoming);
  const same = local.filter((row) => listOf(row) === list);
  const byId = same.find((row) => row.id === incoming.id);
  if (byId) return { kind: 'match', id: byId.id };
  if (incoming.linkedStudentId) {
    const linked = same.filter((row) => row.linkedStudentId === incoming.linkedStudentId);
    if (linked.length === 1) return { kind: 'match', id: linked[0].id };
    if (linked.length > 1) return { kind: 'ambiguous', reason: 'linked-student', matches: linked.length };
  }
  const named = same.filter((row) => key(row.name) === key(incoming.name) && key(row.belt) === key(incoming.belt));
  if (named.length === 1) {
    const only = named[0];
    // Two different linked students with the same name and belt are two people.
    if (only.linkedStudentId && incoming.linkedStudentId && only.linkedStudentId !== incoming.linkedStudentId) {
      return { kind: 'none' };
    }
    return { kind: 'match', id: only.id };
  }
  if (named.length > 1) return { kind: 'ambiguous', reason: 'name-belt', matches: named.length };
  return { kind: 'none' };
}

const FILL_STUDENT_FIELDS = ['division', 'gym', 'photo', 'lastPromotion', 'lastPromotionDetail', 'note'] as const;

function fillStudent(local: BackupStudent, incoming: BackupStudent): BackupStudent {
  const next: BackupStudent = { ...local };
  for (const field of FILL_STUDENT_FIELDS) {
    if (!next[field] && incoming[field]) next[field] = incoming[field];
  }
  // The chosen card photo id travels with the photo it names.
  if (!local.photo && next.photo && incoming.cardPhotoId && !next.cardPhotoId) next.cardPhotoId = incoming.cardPhotoId;
  // coachSync and parentPhotoApproval stay as this device has them for a card already here.
  if (!next.linkedStudentId && incoming.linkedStudentId) next.linkedStudentId = incoming.linkedStudentId;
  if (!next.guestId && incoming.guestId) next.guestId = incoming.guestId;
  if (next.stripes === undefined && incoming.stripes !== undefined) next.stripes = incoming.stripes;
  // No photos is only ever added, never cleared by a file. A family flag outranks a coach flag.
  if (incoming.noPhotos === 'family' || (incoming.noPhotos === 'coach' && !next.noPhotos)) next.noPhotos = incoming.noPhotos;
  if (next.noPhotos) {
    next.photo = '';
    delete next.cardPhotoId;
  }
  // checkedIn and rosterList are never taken from a file.
  return next;
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

function rowId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const row = value as { id?: unknown; updateId?: unknown };
  if (typeof row.id === 'string') return row.id;
  if (typeof row.updateId === 'string') return row.updateId;
  return '';
}

/** Add incoming list rows whose id is not here yet. Rows without an id are left as they are. */
function unionById(local: unknown[], incoming: unknown[]): unknown[] {
  const ids = new Set(local.map(rowId).filter(Boolean));
  if (!ids.size && local.some((row) => !rowId(row))) return local;
  const extra = incoming.filter((row) => {
    const id = rowId(row);
    return id && !ids.has(id);
  });
  return extra.length ? [...local, ...structuredClone(extra)] : local;
}

/** Fill blank keys on an object, add missing list rows by id, and recurse into objects. Never overwrites. */
export function fillBlankDeep(local: Record<string, unknown>, incoming: Record<string, unknown>, skip: ReadonlySet<string> = new Set()): Record<string, unknown> {
  const next: Record<string, unknown> = { ...local };
  for (const [field, value] of Object.entries(incoming)) {
    if (skip.has(field) || isBlank(value)) continue;
    const here = next[field];
    if (isBlank(here)) {
      next[field] = structuredClone(value);
    } else if (Array.isArray(here) && Array.isArray(value)) {
      next[field] = unionById(here, value);
    } else if (here && value && typeof here === 'object' && typeof value === 'object' && !Array.isArray(here) && !Array.isArray(value)) {
      next[field] = fillBlankDeep(here as Record<string, unknown>, value as Record<string, unknown>);
    }
  }
  return next;
}

const CARD_SKIP = new Set(['updatedAt', 'competitorCardId']);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeRosterBackup(
  local: RosterBackupSources,
  backup: RosterBackup,
  options: { now?: number; newerSchema?: boolean; normalize?: RosterNormalizer } = {},
): { next: RosterBackupSources; report: RosterMergeReport; changed: RosterMergeChanged } {
  const now = options.now ?? Date.now();
  const report: RosterMergeReport = {
    studentsAdded: 0,
    studentsFilled: 0,
    studentsUnchanged: 0,
    ambiguous: [],
    cardsAdded: 0,
    cardsFilled: 0,
    privateNotesAdded: 0,
    plansAdded: 0,
    inboxAdded: 0,
    coachItemsAdded: 0,
    newerSchema: Boolean(options.newerSchema),
  };
  const students = local.roster.students.map((row) => ({ ...row }));
  const usedIds = new Set(students.map((row) => row.id));
  /** Incoming roster id to local roster id. Ambiguous rows are not in here. */
  const idMap = new Map<string, string>();

  for (const incoming of backup.roster.students) {
    const found = matchStudent(students, incoming);
    if (found.kind === 'ambiguous') {
      report.ambiguous.push({ name: incoming.name, belt: incoming.belt, list: listOf(incoming), reason: found.reason, matches: found.matches });
      continue;
    }
    if (found.kind === 'match') {
      idMap.set(incoming.id, found.id);
      const index = students.findIndex((row) => row.id === found.id);
      const filled = fillStudent(students[index], incoming);
      if (same(filled, students[index])) report.studentsUnchanged += 1;
      else {
        students[index] = filled;
        report.studentsFilled += 1;
      }
      continue;
    }
    let id = incoming.id;
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${incoming.id}-${n}`)) n += 1;
      id = `${incoming.id}-${n}`;
    }
    usedIds.add(id);
    const added: BackupStudent = { ...incoming, id, checkedIn: false };
    students.push(added);
    idMap.set(incoming.id, id);
    report.studentsAdded += 1;
  }

  const plan = (here: Record<string, unknown>, there: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...here };
    for (const [incomingId, value] of Object.entries(there)) {
      const localId = idMap.get(incomingId);
      if (!localId || out[localId] !== undefined) continue;
      out[localId] = structuredClone(value);
      report.plansAdded += 1;
    }
    return out;
  };
  const roster = (options.normalize ?? lightNormalizeRoster)({
    version: 1,
    students,
    ready: plan(local.roster.ready, backup.roster.ready),
    gamePlans: plan(local.roster.gamePlans, backup.roster.gamePlans),
    competitionPlans: plan(local.roster.competitionPlans, backup.roster.competitionPlans),
  });

  const cards: Record<string, RosterCardRecordLike> = { ...local.cardFile.cards };
  for (const [incomingId, record] of Object.entries(backup.cards)) {
    const localId = idMap.get(incomingId);
    if (!localId) continue;
    const here = cards[localId];
    const linked = typeof record.competitorCardId === 'string' ? idMap.get(record.competitorCardId) ?? '' : '';
    if (!here) {
      const copy: RosterCardRecordLike = structuredClone(record);
      if (typeof record.competitorCardId === 'string') copy.competitorCardId = linked;
      cards[localId] = copy;
      report.cardsAdded += 1;
      continue;
    }
    const filled = fillBlankDeep(here, record, CARD_SKIP) as RosterCardRecordLike;
    if (!here.competitorCardId && linked) filled.competitorCardId = linked;
    if (!same(filled, here)) {
      cards[localId] = { ...filled, updatedAt: now };
      report.cardsFilled += 1;
    }
  }

  const privateNotes = { ...local.privateNotes };
  if (backup.scope === 'coach-private' && backup.privateNotes) {
    for (const [incomingId, text] of Object.entries(backup.privateNotes)) {
      const localId = idMap.get(incomingId);
      if (!localId || privateNotes[localId]) continue;
      privateNotes[localId] = text;
      report.privateNotesAdded += 1;
    }
  }

  const inbox = [...local.inbox];
  const seen = new Set(inbox.map((item) => item.packet.updateId));
  for (const item of backup.inbox) {
    if (seen.has(item.packet.updateId)) continue;
    seen.add(item.packet.updateId);
    const copy: CoachInboxItemLike = structuredClone(item);
    if (typeof item.rosterId === 'string') {
      const localId = idMap.get(item.rosterId);
      if (localId) copy.rosterId = localId;
      else delete copy.rosterId;
    }
    inbox.push(copy);
    report.inboxAdded += 1;
  }

  const cardFile: RosterCardFile = { ...local.cardFile, cards };
  if (!local.cardFile.settings && backup.cardSettings) cardFile.settings = structuredClone(backup.cardSettings);
  else if (local.cardFile.settings && backup.cardSettings) {
    cardFile.settings = fillBlankDeep(local.cardFile.settings, backup.cardSettings);
  }

  const merged = withoutBlockedPhotos({
    roster,
    cards: cardFile.cards,
    coachStores: mergeCoachStores(local.coachStores ?? emptyCoachStores(), backup.coachStores, idMap, report),
  });
  cardFile.cards = merged.cards;
  const coachStores = merged.coachStores ?? emptyCoachStores();
  if (merged.roster !== roster) roster.students = merged.roster.students;

  const changed = {
    roster: report.studentsAdded + report.studentsFilled + report.plansAdded > 0,
    cards: report.cardsAdded + report.cardsFilled > 0 || !same(cardFile.settings, local.cardFile.settings),
    privateNotes: report.privateNotesAdded > 0,
    inbox: report.inboxAdded > 0,
    coachStores: report.coachItemsAdded > 0,
  };
  return { next: { roster, cardFile, privateNotes, inbox, coachStores }, report, changed };
}

export type RosterMergeChanged = { roster: boolean; cards: boolean; privateNotes: boolean; inbox: boolean; coachStores: boolean };

function field(row: unknown, name: string): string {
  if (!row || typeof row !== 'object') return '';
  const value = (row as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Add rows from `incoming` whose key is not here yet, up to `cap` rows total.
 * Rows already here are never dropped to make room.
 */
function addMissing(here: unknown[], incoming: unknown[], keyOf: (row: unknown) => string, cap: number, map?: (row: unknown) => unknown | null): { rows: unknown[]; added: number } {
  const keys = new Set(here.map(keyOf).filter(Boolean));
  const rows = [...here];
  let added = 0;
  for (const row of incoming) {
    if (rows.length >= cap) break;
    const k = keyOf(row);
    if (!k || keys.has(k)) continue;
    const copy = map ? map(structuredClone(row)) : structuredClone(row);
    if (copy === null) continue;
    keys.add(k);
    rows.push(copy);
    added += 1;
  }
  return { rows, added };
}

function mergeCoachStores(
  local: CoachSyncStores,
  incoming: CoachSyncStores | undefined,
  idMap: ReadonlyMap<string, string>,
  report: RosterMergeReport,
): CoachSyncStores {
  if (!incoming) return local;
  const caps = COACH_STORE_CAPS;
  const notices = addMissing(local.studentInbox.notices, incoming.studentInbox.notices, (row) => {
    const eventId = field(row, 'eventId');
    return eventId ? `${field(row, 'studentId')}:${eventId}:${field(row, 'status')}` : '';
  }, caps.notices);
  const dismissed = addMissing(local.studentInbox.dismissed, incoming.studentInbox.dismissed, (row) => (typeof row === 'string' ? row : ''), caps.dismissed);
  const shares = addMissing(local.studentInbox.shares, incoming.studentInbox.shares, (row) => field(row, 'shareId'), caps.shares);
  const decided = addMissing(local.studentInbox.decided, incoming.studentInbox.decided, (row) => field(row, 'shareId'), caps.decided, (row) => {
    const copy = row as Record<string, unknown>;
    if (typeof copy.cardId === 'string') copy.cardId = idMap.get(copy.cardId) ?? null;
    return copy;
  });
  const photoReviews = addMissing(local.photoReviews, incoming.photoReviews, (row) => field((row as { submission?: unknown })?.submission, 'photoId'), caps.photoReviews, (row) => {
    const copy = row as Record<string, unknown>;
    const cardId = typeof copy.cardId === 'string' ? idMap.get(copy.cardId) : undefined;
    // A review for a card that did not come across (ambiguous) is left out.
    if (!cardId) return null;
    copy.cardId = cardId;
    return copy;
  });
  const cardSyncSent = addMissing(local.cardSyncSent, incoming.cardSyncSent, (row) => field(row, 'updateId'), caps.cardSyncSent);
  report.coachItemsAdded += notices.added + dismissed.added + shares.added + decided.added + photoReviews.added + cardSyncSent.added;
  return {
    studentInbox: { notices: notices.rows, dismissed: dismissed.rows as string[], shares: shares.rows, decided: decided.rows },
    photoReviews: photoReviews.rows,
    cardSyncSent: cardSyncSent.rows,
  };
}

export function formatRosterMergeReport(report: RosterMergeReport): string {
  const parts = [
    `${report.studentsAdded} added`,
    `${report.studentsFilled} filled in`,
    `${report.studentsUnchanged} already here`,
  ];
  if (report.cardsAdded || report.cardsFilled) parts.push(`${report.cardsAdded + report.cardsFilled} cards updated`);
  if (report.privateNotesAdded) parts.push(`${report.privateNotesAdded} private notes added`);
  if (report.inboxAdded) parts.push(`${report.inboxAdded} inbox items added`);
  if (report.coachItemsAdded) parts.push(`${report.coachItemsAdded} coach sync items added`);
  let text = parts.join(', ') + '.';
  if (report.ambiguous.length) {
    const names = report.ambiguous.slice(0, 4).map((row) => `${row.name} (${row.belt})`).join('; ');
    text += ` Skipped ${report.ambiguous.length} with more than one possible match: ${names}${report.ambiguous.length > 4 ? '…' : ''}. Nothing was changed for them.`;
  }
  if (report.newerSchema) text += ' This backup is from a newer Advantage. Some newer details may not show here yet.';
  return text;
}
