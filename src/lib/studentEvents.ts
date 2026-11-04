/**
 * Student → coach events. One narrow kind only: a tournament registration.
 *
 * Everything else in the sync layer is one way, coach to student. This is the
 * single exception the owner allowed. It fires only when the student actually
 * registers for or enters a tournament (status becomes "entered"); a tournament
 * the student is only considering never sends. The payload is the event name,
 * date, optional division and status. No journal text, notes, goals, location,
 * weights or links ever leave the phone in this event.
 *
 * On the coach side it is a dismissible notice on the student's roster card and
 * any linked competitor card. It never changes roster or competitor data.
 */
import type { StudentProgressReport, StudentTournament } from './progress/types.ts';

export const TOURNAMENT_REGISTRATION_KIND = 'student-tournament-registration';
export const TOURNAMENT_REGISTRATION_STATUSES = ['entered'] as const;
export type TournamentRegistrationStatus = (typeof TOURNAMENT_REGISTRATION_STATUSES)[number];

export type TournamentRegistrationEvent = {
  kind: typeof TOURNAMENT_REGISTRATION_KIND;
  v: 1;
  eventId: string;
  studentId: string;
  eventName: string;
  date: string;
  division: string;
  status: TournamentRegistrationStatus;
  sentAt: number;
};

const EVENT_KEYS = new Set(['kind', 'v', 'eventId', 'studentId', 'eventName', 'date', 'division', 'status', 'sentAt']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const REGISTRATION_NAME_MAX = 80;
export const REGISTRATION_DIVISION_MAX = 80;

function realDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Strict reader, used by the server and the coach. Any key outside the five
 * payload fields (and the envelope) is refused, so journal contents cannot ride along.
 */
export function readTournamentRegistration(value: unknown): TournamentRegistrationEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !EVENT_KEYS.has(key))) return null;
  if (row.kind !== TOURNAMENT_REGISTRATION_KIND || row.v !== 1) return null;
  const { eventId, studentId, eventName, date, division, status, sentAt } = row;
  if (typeof eventId !== 'string' || !ID_RE.test(eventId)) return null;
  if (typeof studentId !== 'string' || !ID_RE.test(studentId)) return null;
  if (typeof eventName !== 'string' || !eventName.trim() || eventName.length > REGISTRATION_NAME_MAX) return null;
  if (typeof date !== 'string' || !realDate(date)) return null;
  if (typeof division !== 'string' || division.length > REGISTRATION_DIVISION_MAX) return null;
  if (!(TOURNAMENT_REGISTRATION_STATUSES as readonly unknown[]).includes(status)) return null;
  if (typeof sentAt !== 'number' || !Number.isFinite(sentAt) || sentAt < 0) return null;
  return {
    kind: TOURNAMENT_REGISTRATION_KIND,
    v: 1,
    eventId,
    studentId,
    eventName: eventName.trim(),
    date,
    division: division.trim(),
    status: status as TournamentRegistrationStatus,
    sentAt,
  };
}

function eventIdFor(tournament: Pick<StudentTournament, 'id'>): string {
  const slug = tournament.id.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 70);
  return `treg-${slug}`;
}

/** Build the event from a tournament the student entered. Only the allowed fields are copied. */
export function buildTournamentRegistration(
  studentId: string,
  tournament: Pick<StudentTournament, 'id' | 'name' | 'date' | 'division' | 'status'>,
  now = Date.now(),
): TournamentRegistrationEvent | null {
  if (tournament.status !== 'entered') return null;
  return readTournamentRegistration({
    kind: TOURNAMENT_REGISTRATION_KIND,
    v: 1,
    eventId: eventIdFor(tournament),
    studentId,
    eventName: tournament.name.slice(0, REGISTRATION_NAME_MAX),
    date: tournament.date,
    division: (tournament.division ?? '').slice(0, REGISTRATION_DIVISION_MAX),
    status: 'entered',
    sentAt: now,
  });
}

/**
 * Tournaments that became "entered" between two saves of the student file:
 * newly added as entered, or switched from considering to entered. Unchanged,
 * considering, or removed tournaments give nothing.
 */
export function newTournamentRegistrations(
  before: StudentProgressReport,
  after: StudentProgressReport,
  now = Date.now(),
): TournamentRegistrationEvent[] {
  const studentId = after.studentId ?? '';
  if (!studentId) return [];
  const earlier = new Map((before.competition?.tournaments ?? []).map((row) => [row.id, row.status]));
  const out: TournamentRegistrationEvent[] = [];
  for (const tournament of after.competition?.tournaments ?? []) {
    if (tournament.status !== 'entered' || earlier.get(tournament.id) === 'entered') continue;
    const event = buildTournamentRegistration(studentId, tournament, now);
    if (event) out.push(event);
  }
  return out;
}

export function tournamentRegistrationFile(event: TournamentRegistrationEvent): { name: string; json: string } {
  return { name: `advantage-handoff-${event.kind}-${event.eventId}.json`, json: JSON.stringify(event, null, 2) };
}

/* ------------------------------ student outbox ----------------------------- */

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const STUDENT_OUTBOX_KEY = 'matboard.studentEdition.coachOutbox.v1';
export const STUDENT_OUTBOX_EVENT = 'matboard-student-outbox';
export type OutboxItem = { event: TournamentRegistrationEvent; sent: boolean };
const OUTBOX_MAX = 30;

export function readStudentOutbox(storage: Pick<Store, 'getItem'>): OutboxItem[] {
  try {
    const raw = JSON.parse(storage.getItem(STUDENT_OUTBOX_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((row) => {
      const event = readTournamentRegistration((row as { event?: unknown })?.event);
      return event ? [{ event, sent: (row as { sent?: unknown }).sent === true }] : [];
    });
  } catch {
    return [];
  }
}

function writeOutbox(storage: Store, items: OutboxItem[]): void {
  storage.setItem(STUDENT_OUTBOX_KEY, JSON.stringify(items.slice(-OUTBOX_MAX)));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STUDENT_OUTBOX_EVENT));
}

/** Queue events (a repeat registration for the same tournament replaces the unsent one). */
export function queueStudentEvents(storage: Store, events: TournamentRegistrationEvent[]): OutboxItem[] {
  if (!events.length) return readStudentOutbox(storage);
  const ids = new Set(events.map((event) => event.eventId));
  const next = [...readStudentOutbox(storage).filter((row) => !ids.has(row.event.eventId)), ...events.map((event) => ({ event, sent: false }))];
  writeOutbox(storage, next);
  return next;
}

export function markStudentEventSent(storage: Store, eventId: string): void {
  writeOutbox(storage, readStudentOutbox(storage).map((row) => (row.event.eventId === eventId ? { ...row, sent: true } : row)));
}
