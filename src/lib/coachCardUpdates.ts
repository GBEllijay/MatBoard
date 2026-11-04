/**
 * Coach Clipboard updates for the student's card. One-way, coach to student.
 *
 * Two kinds go out, and only when the coach taps a Send button:
 * - `note`: the coach's Training notes & suggestions for one training day.
 *   Accepting appends a coach-labeled note to that day's journal card and fills
 *   Suggestions from coach. It never replaces what the student wrote.
 * - `assessment`: one saved coach assessment. Accepting adds it to the student's
 *   coach view on their card, next to their own self-assessment.
 *
 * Private coach notes have no field here. A packet cannot carry them.
 * Nothing in this file sends on its own. The sync adapter delivers a packet the
 * coach built on purpose, over Advantage Cloud when it is ready, or as a file.
 *
 * Student side: an update waits until the student accepts or dismisses it.
 * When the parent gate is on, it is held until a parent approves it first.
 * The same update id is decided once, so a second copy never overwrites.
 * The student's own edits to Suggestions from coach stay on the student's phone.
 */

import { addJournalAmendment, addJournalEntry } from './studentEdition.ts';
import {
  ASSESSMENT_AREAS,
  isAssessmentScore,
  type AssessmentEntry,
  type AssessmentScores,
} from './studentAssessment.ts';
import { PROGRESS_NOTE_MAX, type StudentProgressReport } from './progress/types.ts';

export const COACH_CARD_INBOX_KEY = 'matboard.studentEdition.coachCard.v1';
export const COACH_CARD_EVENT = 'matboard-coach-card';
export const COACH_CARD_PACKET_KIND = 'coach-card-update' as const;
/** Prefix on the journal note a coach sends. The student's text is never touched. */
export const COACH_JOURNAL_LABEL = 'From coach';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_MAX = 200;

export type CoachCardNote = { day: string; text: string };

export type CoachCardPacket = {
  kind: typeof COACH_CARD_PACKET_KIND;
  version: 1;
  updateId: string;
  /** The Student Edition id the roster card is linked to. */
  studentId: string;
  issuedAt: number;
  coachName?: string;
  gymName?: string;
} & (
  | { type: 'note'; note: CoachCardNote }
  | { type: 'assessment'; assessment: AssessmentEntry }
);

export type CoachCardStatus = 'held-parent' | 'pending' | 'accepted' | 'dismissed';

export type CoachCardItem = {
  packet: CoachCardPacket;
  status: CoachCardStatus;
  receivedAt: number;
  decidedAt?: number;
};

export type CoachCardInbox = {
  items: CoachCardItem[];
  /**
   * The student's own copy of Suggestions from coach. Never sent anywhere.
   * `basedOn` is the update id it was edited from.
   */
  ownSuggestions?: { text: string; basedOn: string; editedAt: number };
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function emptyCoachCardInbox(): CoachCardInbox {
  return { items: [] };
}

function newUpdateId(now: number): string {
  return `card.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function cleanScores(value: unknown): AssessmentScores | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const out = {} as AssessmentScores;
  for (const area of ASSESSMENT_AREAS) {
    const score = row[area.id];
    if (!isAssessmentScore(score)) return null;
    out[area.id] = score;
  }
  return out;
}

/**
 * Build a note update. The input is only the sendable Training notes & suggestions text.
 * Private coach notes are not a parameter, so they cannot ride along.
 */
export function buildCoachNoteUpdate(input: {
  studentId: string;
  day: string;
  text: string;
  coachName?: string;
  gymName?: string;
  now?: number;
}): { ok: true; packet: CoachCardPacket } | { ok: false; error: string } {
  const studentId = input.studentId.trim();
  if (!studentId) return { ok: false, error: 'Link this roster card to the student first.' };
  if (!DATE_RE.test(input.day)) return { ok: false, error: 'Pick the training day.' };
  const text = input.text.trim().slice(0, PROGRESS_NOTE_MAX);
  if (!text) return { ok: false, error: 'Write a training note first.' };
  const now = input.now ?? Date.now();
  return {
    ok: true,
    packet: {
      kind: COACH_CARD_PACKET_KIND,
      version: 1,
      type: 'note',
      updateId: newUpdateId(now),
      studentId,
      issuedAt: now,
      ...(input.coachName ? { coachName: input.coachName.slice(0, 80) } : {}),
      ...(input.gymName ? { gymName: input.gymName.slice(0, 80) } : {}),
      note: { day: input.day, text },
    },
  };
}

/** Build an assessment update from one saved coach assessment. */
export function buildCoachAssessmentUpdate(input: {
  studentId: string;
  assessment: AssessmentEntry;
  coachName?: string;
  gymName?: string;
  now?: number;
}): { ok: true; packet: CoachCardPacket } | { ok: false; error: string } {
  const studentId = input.studentId.trim();
  if (!studentId) return { ok: false, error: 'Link this roster card to the student first.' };
  const scores = cleanScores(input.assessment.scores);
  if (!scores || !DATE_RE.test(input.assessment.date)) return { ok: false, error: 'This assessment is not complete.' };
  const now = input.now ?? Date.now();
  return {
    ok: true,
    packet: {
      kind: COACH_CARD_PACKET_KIND,
      version: 1,
      type: 'assessment',
      updateId: newUpdateId(now),
      studentId,
      issuedAt: now,
      ...(input.coachName ? { coachName: input.coachName.slice(0, 80) } : {}),
      ...(input.gymName ? { gymName: input.gymName.slice(0, 80) } : {}),
      assessment: {
        id: input.assessment.id,
        date: input.assessment.date,
        note: (input.assessment.note ?? '').slice(0, PROGRESS_NOTE_MAX),
        scores,
      },
    },
  };
}

/** Read a packet from a file or the cloud inbox. Unknown fields are dropped. */
export function parseCoachCardPacket(value: unknown): CoachCardPacket | null {
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
  if (row.kind !== COACH_CARD_PACKET_KIND || row.version !== 1) return null;
  if (typeof row.updateId !== 'string' || !row.updateId) return null;
  if (typeof row.studentId !== 'string' || !row.studentId) return null;
  if (typeof row.issuedAt !== 'number' || !Number.isFinite(row.issuedAt)) return null;
  const base = {
    kind: COACH_CARD_PACKET_KIND,
    version: 1 as const,
    updateId: row.updateId.slice(0, 80),
    studentId: row.studentId.slice(0, 80),
    issuedAt: row.issuedAt,
    ...(typeof row.coachName === 'string' && row.coachName ? { coachName: row.coachName.slice(0, 80) } : {}),
    ...(typeof row.gymName === 'string' && row.gymName ? { gymName: row.gymName.slice(0, 80) } : {}),
  };
  if (row.type === 'note') {
    const note = row.note as Record<string, unknown> | undefined;
    const day = typeof note?.day === 'string' ? note.day : '';
    const text = typeof note?.text === 'string' ? note.text.trim().slice(0, PROGRESS_NOTE_MAX) : '';
    if (!DATE_RE.test(day) || !text) return null;
    return { ...base, type: 'note', note: { day, text } };
  }
  if (row.type === 'assessment') {
    const entry = row.assessment as Record<string, unknown> | undefined;
    const scores = cleanScores(entry?.scores);
    const date = typeof entry?.date === 'string' ? entry.date : '';
    if (!scores || !DATE_RE.test(date)) return null;
    return {
      ...base,
      type: 'assessment',
      assessment: {
        id: typeof entry?.id === 'string' && entry.id ? entry.id.slice(0, 80) : `coach.${row.updateId}`,
        date,
        note: typeof entry?.note === 'string' ? entry.note.slice(0, PROGRESS_NOTE_MAX) : '',
        scores,
      },
    };
  }
  return null;
}

/**
 * The student's phone receives an update. A known update id is never replaced.
 * With the parent gate on, it waits for a parent before the student sees Accept.
 */
export function receiveCoachCardUpdate(
  inbox: CoachCardInbox,
  packet: CoachCardPacket,
  options: { parentGate: boolean; now?: number },
): { inbox: CoachCardInbox; added: boolean } {
  if (inbox.items.some((item) => item.packet.updateId === packet.updateId)) return { inbox, added: false };
  const item: CoachCardItem = {
    packet,
    status: options.parentGate ? 'held-parent' : 'pending',
    receivedAt: options.now ?? Date.now(),
  };
  return { inbox: { ...inbox, items: [...inbox.items, item].slice(-ITEM_MAX) }, added: true };
}

/** A parent lets a held update through. The student still has to accept it. */
export function parentApproveCoachCardUpdate(inbox: CoachCardInbox, updateId: string): CoachCardInbox {
  let changed = false;
  const items = inbox.items.map((item) => {
    if (item.packet.updateId !== updateId || item.status !== 'held-parent') return item;
    changed = true;
    return { ...item, status: 'pending' as const };
  });
  return changed ? { ...inbox, items } : inbox;
}

/** Updates the student can act on now. Held updates are not shown as pending. */
export function pendingCoachCardUpdates(inbox: CoachCardInbox, studentId: string): CoachCardItem[] {
  return inbox.items.filter((item) => item.status === 'pending' && item.packet.studentId === studentId);
}

export function heldCoachCardUpdates(inbox: CoachCardInbox, studentId: string): CoachCardItem[] {
  return inbox.items.filter((item) => item.status === 'held-parent' && item.packet.studentId === studentId);
}

/** Text on the journal card. Labeled so it is never mistaken for the student's own words. */
export function coachJournalText(packet: Pick<CoachCardPacket, 'coachName'>, text: string): string {
  const who = packet.coachName?.trim() ? `${COACH_JOURNAL_LABEL} (${packet.coachName.trim()})` : COACH_JOURNAL_LABEL;
  return `${who}: ${text.trim()}`;
}

/**
 * Accept one pending update. A note is appended to that day's journal card as a
 * dated coach note. With no card that day, a new coach card is added. Card text,
 * techniques, and earlier notes stay exactly as the student saved them.
 */
export function acceptCoachCardUpdate(
  inbox: CoachCardInbox,
  report: StudentProgressReport,
  updateId: string,
  now = Date.now(),
): { inbox: CoachCardInbox; report: StudentProgressReport; applied: boolean } {
  const item = inbox.items.find((row) => row.packet.updateId === updateId);
  if (!item || item.status !== 'pending' || item.packet.studentId !== report.studentId) {
    return { inbox, report, applied: false };
  }
  let next = report;
  if (item.packet.type === 'note') {
    const { day, text } = item.packet.note;
    const body = coachJournalText(item.packet, text);
    const sameDay = report.journal.filter((entry) => entry.date === day).sort((a, b) => a.createdAt - b.createdAt);
    const target = sameDay[sameDay.length - 1];
    next = target
      ? addJournalAmendment(report, target.id, body, day, now)
      : addJournalEntry(
          report,
          { date: day, className: 'Coach note', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: body },
          now,
        );
  }
  const items = inbox.items.map((row) =>
    row.packet.updateId === updateId ? { ...row, status: 'accepted' as const, decidedAt: now } : row,
  );
  return { inbox: { ...inbox, items }, report: next, applied: true };
}

export function dismissCoachCardUpdate(inbox: CoachCardInbox, updateId: string, now = Date.now()): CoachCardInbox {
  let changed = false;
  const items = inbox.items.map((row) => {
    if (row.packet.updateId !== updateId || (row.status !== 'pending' && row.status !== 'held-parent')) return row;
    changed = true;
    return { ...row, status: 'dismissed' as const, decidedAt: now };
  });
  return changed ? { ...inbox, items } : inbox;
}

export type LatestCoachNote = { updateId: string; day: string; text: string; coachName: string; acceptedAt: number };

/**
 * Latest from coach: the newest note the student accepted. Pending, held, and
 * dismissed notes do not count. Null when there is none.
 */
export function latestAcceptedCoachNote(inbox: CoachCardInbox, studentId?: string): LatestCoachNote | null {
  let best: LatestCoachNote | null = null;
  let bestIssued = -Infinity;
  for (const item of inbox.items) {
    if (item.status !== 'accepted' || item.packet.type !== 'note') continue;
    if (studentId && item.packet.studentId !== studentId) continue;
    if (item.packet.issuedAt <= bestIssued) continue;
    bestIssued = item.packet.issuedAt;
    best = {
      updateId: item.packet.updateId,
      day: item.packet.note.day,
      text: item.packet.note.text,
      coachName: item.packet.coachName ?? '',
      acceptedAt: item.decidedAt ?? item.receivedAt,
    };
  }
  return best;
}

/** Coach assessments the student accepted, oldest first. Feeds the coach view and trend. */
export function acceptedCoachAssessments(inbox: CoachCardInbox, studentId?: string): AssessmentEntry[] {
  return inbox.items
    .filter((item) => item.status === 'accepted' && item.packet.type === 'assessment')
    .filter((item) => !studentId || item.packet.studentId === studentId)
    .map((item) => (item.packet.type === 'assessment' ? item.packet.assessment : null))
    .filter((row): row is AssessmentEntry => Boolean(row))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Suggestions from coach on the student's card.
 * The student's own copy wins when they edited it. Their edit never flows back.
 */
export function suggestionsFromCoach(inbox: CoachCardInbox, studentId?: string): {
  latest: LatestCoachNote | null;
  text: string;
  edited: boolean;
} {
  const latest = latestAcceptedCoachNote(inbox, studentId);
  const own = inbox.ownSuggestions;
  if (own && own.text.trim()) return { latest, text: own.text, edited: true };
  return { latest, text: latest?.text ?? '', edited: false };
}

/** The student edits their own copy. Stored on this phone only. */
export function setOwnSuggestions(inbox: CoachCardInbox, text: string, now = Date.now()): CoachCardInbox {
  const clean = text.slice(0, PROGRESS_NOTE_MAX);
  const latest = latestAcceptedCoachNote(inbox);
  if (!clean.trim()) {
    const { ownSuggestions: _drop, ...rest } = inbox;
    return rest;
  }
  return { ...inbox, ownSuggestions: { text: clean, basedOn: latest?.updateId ?? '', editedAt: now } };
}

export function readCoachCardInbox(storage: Pick<MemoryStore, 'getItem'> | null | undefined): CoachCardInbox {
  if (!storage) return emptyCoachCardInbox();
  try {
    const raw = storage.getItem(COACH_CARD_INBOX_KEY);
    if (!raw) return emptyCoachCardInbox();
    const parsed = JSON.parse(raw) as Partial<CoachCardInbox>;
    const items: CoachCardItem[] = [];
    for (const row of Array.isArray(parsed.items) ? parsed.items : []) {
      const packet = parseCoachCardPacket(row?.packet);
      const status = row?.status;
      if (!packet) continue;
      if (status !== 'held-parent' && status !== 'pending' && status !== 'accepted' && status !== 'dismissed') continue;
      items.push({
        packet,
        status,
        receivedAt: typeof row.receivedAt === 'number' ? row.receivedAt : 0,
        ...(typeof row.decidedAt === 'number' ? { decidedAt: row.decidedAt } : {}),
      });
    }
    const own = parsed.ownSuggestions;
    return {
      items,
      ...(own && typeof own.text === 'string'
        ? { ownSuggestions: { text: own.text, basedOn: String(own.basedOn ?? ''), editedAt: Number(own.editedAt) || 0 } }
        : {}),
    };
  } catch {
    return emptyCoachCardInbox();
  }
}

export function writeCoachCardInbox(storage: MemoryStore, inbox: CoachCardInbox): void {
  storage.setItem(COACH_CARD_INBOX_KEY, JSON.stringify(inbox));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
    window.dispatchEvent(new Event(COACH_CARD_EVENT));
  }
}

/** Parent gate for coach updates on this phone. Off unless a parent turned it on. */
export const COACH_CARD_PARENT_GATE_KEY = 'matboard.studentEdition.coachCardParentGate.v1';

export function readCoachCardParentGate(storage: Pick<MemoryStore, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(COACH_CARD_PARENT_GATE_KEY) === 'on';
  } catch {
    return false;
  }
}
