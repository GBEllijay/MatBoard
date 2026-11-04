/**
 * Student to coach. A narrow channel, separate from the coach's one-way updates.
 *
 * Three kinds, each with a fixed list of fields:
 * - `card-share`: Upload for coach approval to add to student card. Profile and
 *   card fields only. Never the journal, notes, goals, or the move-permission
 *   toggles (wrist locks, leg locks, and the rest stay on the student's profile).
 * - `registration`: the student entered a tournament (status Entered). Event name,
 *   date, division if entered, and status. Considering never sends.
 * - `competitor-info`: competitor fields the student added. Division, weight class,
 *   and Gi/No-Gi. It waits on the coach's side as a pending update.
 *
 * Coach side: everything lands in an inbox. Nothing is added or changed until a
 * coach acts. Only the head coach (owner, or an Instructors seat) approves a new
 * student card. Approval adds it to the Student Roster. A merge into an existing
 * coach card fills blanks only. Coach fields always win.
 *
 * Transport: the same Cloud or file path as coach updates. Advantage Cloud and
 * the academy Drive upload for these packets arrive with the sync layer. Today
 * the student saves a file the coach imports.
 */

import { beltModeOf, currentKidsBelt } from './beltBook.ts';
import { promotionDates } from './rosterCard.ts';
import type { StudentProgressReport, StudentTournament, TrainingStyle } from './progress/types.ts';

export const STUDENT_TO_COACH_KIND = 'student-to-coach';
export const SHARE_CARD_LABEL = 'Upload for coach approval to add to student card';
export const STUDENT_OUTBOX_KEY = 'matboard.studentEdition.coachOutbox.v1';
export const COACH_INBOX_KEY = 'matboard.rosterCard.inbox.v1';
export const STUDENT_TO_COACH_EVENT = 'matboard-student-to-coach';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_MAX = 80;
const PHOTO_MAX = 400_000;

export type SharedCard = {
  displayName: string;
  gymName: string;
  startedOn: string;
  system: 'adult' | 'kids';
  /** Adult belt id or kids belt id. */
  belt: string;
  beltLabel: string;
  stripes: number;
  beltAchievedOn: string;
  lastStripeOn: string;
  trainingStyle: TrainingStyle | '';
  /** Compact photo data URL, or empty. Always pending head coach approval on arrival. */
  photo: string;
};

export type RegistrationEvent = {
  tournamentId: string;
  event: string;
  date: string;
  division: string;
  status: 'entered';
};

export type CompetitorInfo = {
  division: string;
  weightClass: string;
  trainingStyle: TrainingStyle | '';
};

type Base = { kind: typeof STUDENT_TO_COACH_KIND; version: 1; updateId: string; studentId: string; issuedAt: number };

export type StudentToCoachPacket = Base &
  (
    | { type: 'card-share'; card: SharedCard }
    | { type: 'registration'; registration: RegistrationEvent }
    | { type: 'competitor-info'; competitor: CompetitorInfo }
  );

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function clip(value: unknown, max = TEXT_MAX): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function style(value: unknown): TrainingStyle | '' {
  return value === 'gi' || value === 'nogi' || value === 'both' ? value : '';
}

function newId(prefix: string, now: number): string {
  return `${prefix}.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function base(studentId: string, now: number, prefix: string): Base {
  return { kind: STUDENT_TO_COACH_KIND, version: 1, updateId: newId(prefix, now), studentId, issuedAt: now };
}

// ---------- Student side ----------

/**
 * The share option shows only when the gym has Pro, Plus Cloud, or a Drive/OneDrive folder.
 * The student's phone knows that from the gym QR pathway: an academy folder (made from a
 * Pro account's connected folder) or a Plus Cloud license.
 */
export function gymShareAvailable(input: { academyFolder: boolean; cloudLicense: boolean; gymPro?: boolean }): boolean {
  return input.academyFolder || input.cloudLicense || input.gymPro === true;
}

/** Kids system, or a birth year under 18. */
export function isMinor(report: Pick<StudentProgressReport, 'beltBook'>, today = new Date()): boolean {
  if (beltModeOf(report as StudentProgressReport) === 'kids') return true;
  const year = report.beltBook?.birthYear;
  return typeof year === 'number' && today.getFullYear() - year < 18;
}

/** Card and profile fields only. Built field by field, so nothing else can ride along. */
export function sharedCardFromReport(report: StudentProgressReport, photo: string | null): SharedCard {
  const kids = beltModeOf(report) === 'kids';
  const dates = promotionDates(report);
  const belt = kids ? currentKidsBelt(report).beltId : report.profile.belt;
  const src = photo && photo.startsWith('data:image/') && photo.length <= PHOTO_MAX ? photo : '';
  return {
    displayName: clip(report.profile.displayName),
    gymName: clip(report.profile.gymName),
    startedOn: DATE_RE.test(report.profile.startedOn) ? report.profile.startedOn : '',
    system: kids ? 'kids' : 'adult',
    belt,
    beltLabel: dates.beltLabel,
    stripes: dates.stripes,
    beltAchievedOn: dates.beltAchievedOn,
    lastStripeOn: dates.lastStripeOn,
    trainingStyle: style(report.profile.trainingStyle),
    photo: src,
  };
}

export type ShareResult =
  | { ok: true; packet: StudentToCoachPacket }
  | { ok: false; held: 'parent'; error: string }
  | { ok: false; held?: undefined; error: string };

/**
 * Build the card upload. A minor with the parent toggle on needs a parent first:
 * nothing leaves the phone until `parentApproved` is true.
 */
export function buildCardShare(
  report: StudentProgressReport,
  photo: string | null,
  gate: { parentToggle: boolean; parentApproved: boolean },
  now = Date.now(),
): ShareResult {
  if (!report.studentId) return { ok: false, error: 'Save your profile first.' };
  const card = sharedCardFromReport(report, photo);
  if (!card.displayName) return { ok: false, error: 'Add your name first.' };
  if (gate.parentToggle && isMinor(report) && !gate.parentApproved) {
    return { ok: false, held: 'parent', error: 'A parent approves this before it goes to your coach.' };
  }
  return { ok: true, packet: { ...base(report.studentId, now, 'share'), type: 'card-share', card } };
}

function entered(tournament: StudentTournament | undefined): boolean {
  return tournament?.status === 'entered';
}

/**
 * Registration events between two saves of the student file. A tournament sends
 * once, when it is added as Entered or changes from Considering to Entered.
 * Considering never sends. Journal contents are never read.
 */
export function registrationEvents(before: StudentProgressReport, after: StudentProgressReport, now = Date.now()): StudentToCoachPacket[] {
  if (!after.studentId) return [];
  const old = new Map((before.competition?.tournaments ?? []).map((row) => [row.id, row]));
  const out: StudentToCoachPacket[] = [];
  for (const row of after.competition?.tournaments ?? []) {
    if (!entered(row) || entered(old.get(row.id))) continue;
    out.push({
      ...base(after.studentId, now, 'reg'),
      type: 'registration',
      registration: {
        tournamentId: clip(row.id),
        event: clip(row.name),
        date: DATE_RE.test(row.date) ? row.date : '',
        division: clip(row.division),
        status: 'entered',
      },
    });
  }
  return out;
}

export function buildCompetitorInfo(
  report: StudentProgressReport,
  info: { division: string; weightClass: string; trainingStyle?: TrainingStyle | '' },
  now = Date.now(),
): StudentToCoachPacket | null {
  if (!report.studentId) return null;
  const competitor: CompetitorInfo = {
    division: clip(info.division),
    weightClass: clip(info.weightClass),
    trainingStyle: style(info.trainingStyle ?? report.profile.trainingStyle),
  };
  if (!competitor.division && !competitor.weightClass && !competitor.trainingStyle) return null;
  return { ...base(report.studentId, now, 'comp'), type: 'competitor-info', competitor };
}

/** Packets waiting to reach the coach. Sent over Cloud when ready, or saved as a file. */
export type StudentOutbox = { items: { packet: StudentToCoachPacket; state: 'queued' | 'sent' }[] };

export function readStudentOutbox(storage: Pick<MemoryStore, 'getItem'> | null | undefined): StudentOutbox {
  try {
    const parsed = JSON.parse(storage?.getItem(STUDENT_OUTBOX_KEY) ?? '{}') as Partial<StudentOutbox>;
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((row) => ({ packet: parseStudentToCoach(row?.packet), state: row?.state === 'sent' ? ('sent' as const) : ('queued' as const) }))
      .filter((row): row is StudentOutbox['items'][number] => Boolean(row.packet));
    return { items };
  } catch {
    return { items: [] };
  }
}

export function queueForCoach(storage: MemoryStore, packets: readonly StudentToCoachPacket[]): StudentOutbox {
  const outbox = readStudentOutbox(storage);
  if (!packets.length) return outbox;
  const next = { items: [...outbox.items, ...packets.map((packet) => ({ packet, state: 'queued' as const }))].slice(-100) };
  storage.setItem(STUDENT_OUTBOX_KEY, JSON.stringify(next));
  return next;
}

export function markSent(storage: MemoryStore, ids: readonly string[]): void {
  const outbox = readStudentOutbox(storage);
  const set = new Set(ids);
  storage.setItem(
    STUDENT_OUTBOX_KEY,
    JSON.stringify({ items: outbox.items.map((row) => (set.has(row.packet.updateId) ? { ...row, state: 'sent' } : row)) }),
  );
}

// ---------- Parse (both sides) ----------

export function parseStudentToCoach(value: unknown): StudentToCoachPacket | null {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.kind !== STUDENT_TO_COACH_KIND || row.version !== 1) return null;
  const updateId = clip(row.updateId);
  const studentId = clip(row.studentId);
  if (!updateId || !studentId || typeof row.issuedAt !== 'number') return null;
  const head: Base = { kind: STUDENT_TO_COACH_KIND, version: 1, updateId, studentId, issuedAt: row.issuedAt };
  if (row.type === 'card-share') {
    const c = (row.card ?? {}) as Record<string, unknown>;
    const displayName = clip(c.displayName);
    if (!displayName) return null;
    const photo = typeof c.photo === 'string' && c.photo.startsWith('data:image/') && c.photo.length <= PHOTO_MAX ? c.photo : '';
    return {
      ...head,
      type: 'card-share',
      card: {
        displayName,
        gymName: clip(c.gymName),
        startedOn: typeof c.startedOn === 'string' && DATE_RE.test(c.startedOn) ? c.startedOn : '',
        system: c.system === 'kids' ? 'kids' : 'adult',
        belt: clip(c.belt, 40),
        beltLabel: clip(c.beltLabel, 40),
        stripes: typeof c.stripes === 'number' && c.stripes >= 0 ? Math.min(12, Math.floor(c.stripes)) : 0,
        beltAchievedOn: typeof c.beltAchievedOn === 'string' && DATE_RE.test(c.beltAchievedOn) ? c.beltAchievedOn : '',
        lastStripeOn: typeof c.lastStripeOn === 'string' && DATE_RE.test(c.lastStripeOn) ? c.lastStripeOn : '',
        trainingStyle: style(c.trainingStyle),
        photo,
      },
    };
  }
  if (row.type === 'registration') {
    const r = (row.registration ?? {}) as Record<string, unknown>;
    const event = clip(r.event);
    if (!event || r.status !== 'entered') return null;
    return {
      ...head,
      type: 'registration',
      registration: {
        tournamentId: clip(r.tournamentId),
        event,
        date: typeof r.date === 'string' && DATE_RE.test(r.date) ? r.date : '',
        division: clip(r.division),
        status: 'entered',
      },
    };
  }
  if (row.type === 'competitor-info') {
    const c = (row.competitor ?? {}) as Record<string, unknown>;
    return {
      ...head,
      type: 'competitor-info',
      competitor: { division: clip(c.division), weightClass: clip(c.weightClass), trainingStyle: style(c.trainingStyle) },
    };
  }
  return null;
}

/** A file can hold one packet or a list. */
export function parseStudentToCoachFile(text: string): StudentToCoachPacket[] {
  try {
    const raw = JSON.parse(text) as unknown;
    const rows = Array.isArray(raw) ? raw : [raw];
    return rows.map((row) => parseStudentToCoach(row)).filter((row): row is StudentToCoachPacket => Boolean(row));
  } catch {
    return [];
  }
}

// ---------- Coach side ----------

export type CoachInboxItem = {
  packet: StudentToCoachPacket;
  status: 'pending' | 'approved' | 'merged' | 'dismissed' | 'applied';
  receivedAt: number;
  decidedAt?: number;
  /** Roster card it landed on, once decided. */
  rosterId?: string;
};

export type CoachInbox = { items: CoachInboxItem[] };

export function readCoachInbox(storage: Pick<MemoryStore, 'getItem'> | null | undefined): CoachInbox {
  try {
    const parsed = JSON.parse(storage?.getItem(COACH_INBOX_KEY) ?? '{}') as Partial<CoachInbox>;
    const items: CoachInboxItem[] = [];
    for (const row of Array.isArray(parsed.items) ? parsed.items : []) {
      const packet = parseStudentToCoach(row?.packet);
      if (!packet) continue;
      const status = row.status;
      if (status !== 'pending' && status !== 'approved' && status !== 'merged' && status !== 'dismissed' && status !== 'applied') continue;
      items.push({
        packet,
        status,
        receivedAt: Number(row.receivedAt) || 0,
        ...(typeof row.decidedAt === 'number' ? { decidedAt: row.decidedAt } : {}),
        ...(typeof row.rosterId === 'string' ? { rosterId: row.rosterId } : {}),
      });
    }
    return { items };
  } catch {
    return { items: [] };
  }
}

export function writeCoachInbox(storage: MemoryStore, inbox: CoachInbox): void {
  storage.setItem(COACH_INBOX_KEY, JSON.stringify({ items: inbox.items.slice(-300) }));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
    window.dispatchEvent(new Event(STUDENT_TO_COACH_EVENT));
  }
}

/** Every packet waits as pending. A known update id is never replaced. */
export function receiveForCoach(inbox: CoachInbox, packets: readonly StudentToCoachPacket[], now = Date.now()): { inbox: CoachInbox; added: number } {
  const known = new Set(inbox.items.map((row) => row.packet.updateId));
  const fresh = packets.filter((packet) => !known.has(packet.updateId));
  if (!fresh.length) return { inbox, added: 0 };
  return { inbox: { items: [...inbox.items, ...fresh.map((packet) => ({ packet, status: 'pending' as const, receivedAt: now }))] }, added: fresh.length };
}

/** New student cards waiting for the head coach. */
export function pendingNewCards(inbox: CoachInbox): CoachInboxItem[] {
  return inbox.items.filter((row) => row.status === 'pending' && row.packet.type === 'card-share');
}

/** Registered and competitor-info notices for one linked student. */
export function pendingNotices(inbox: CoachInbox, studentId: string): CoachInboxItem[] {
  if (!studentId) return [];
  return inbox.items.filter((row) => row.status === 'pending' && row.packet.type !== 'card-share' && row.packet.studentId === studentId);
}

export function registrationNoticeText(event: RegistrationEvent): string {
  const day = event.date ? `, ${event.date}` : '';
  return `Registered: ${event.event}${day}`;
}

/**
 * Head coach only: the owner (no seat), or an Instructors seat (head instructor).
 * Coach, assistant coach, and program director seats can see the inbox but not approve.
 */
export function canApproveNewCards(seat: { presetId?: string | null } | null): boolean {
  if (!seat) return true;
  return seat.presetId === 'instructors';
}

export function decideItem(inbox: CoachInbox, updateId: string, status: CoachInboxItem['status'], rosterId?: string, now = Date.now()): CoachInbox {
  return {
    items: inbox.items.map((row) =>
      row.packet.updateId === updateId && row.status === 'pending'
        ? { ...row, status, decidedAt: now, ...(rosterId ? { rosterId } : {}) }
        : row,
    ),
  };
}
