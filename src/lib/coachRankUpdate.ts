/**
 * One-way coach rank update.
 * The coach records a belt, stripe count, and promotion date.
 * The student accepts or dismisses it. Accept writes My rank and one journal card.
 * Dismiss leaves the student file alone. The same update id is decided once.
 * This never writes checklist marks. The student owns that list.
 */

import { canonicalBelt } from './rosterStore.ts';
import { addJournalEntry, viewJournalEntry } from './studentEdition.ts';
import { isRankBelt, rankBeltLabel, setRankAwardedOn, setRankBelt, setRankTapeCount, setRankTapeDate } from './studentRank.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import {
  PROGRESS_NOTE_MAX,
  PROGRESS_SCHEMA_VERSION,
  type CoachAssessmentPacket,
  type CoachBeltProgressPacket,
  type CoachNotePacket,
  type CoachCompetitionUpdatePacket,
  type CoachGymBrand,
  type CoachRankUpdatePacket,
  type ProgressBelt,
  type StudentProgressReport,
} from './progress/types.ts';
import type { Student } from './rosterStore.ts';

export const COACH_UPDATE_LEDGER_KEY = 'matboard.studentEdition.coachUpdateLedger.v1';
export const COACH_INBOX_QUEUE_KEY = 'matboard.studentEdition.coachInbox.v1';
export const COACH_UPDATE_EVENT = 'matboard-coach-update';

const LEDGER_MAX = 200;

const ROSTER_BELT_TO_PROGRESS: Record<string, ProgressBelt> = {
  White: 'white',
  Blue: 'blue',
  Purple: 'purple',
  Brown: 'brown',
  Black: 'black',
  Grey: 'grey',
  Yellow: 'yellow',
  Orange: 'orange',
  Green: 'green',
  Coral: 'coral',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type UpdateLedger = {
  accepted: string[];
  dismissed: string[];
};

export type CoachInboxPacket =
  | CoachRankUpdatePacket
  | CoachCompetitionUpdatePacket
  | CoachBeltProgressPacket
  | CoachAssessmentPacket
  | CoachNotePacket;

/** Every coach → student kind the inbox queue keeps. */
export const COACH_INBOX_KINDS = [
  'coach-rank-update',
  'coach-competition-update',
  'coach-belt-progress-update',
  'coach-assessment-update',
  'coach-note-update',
] as const;

export function isCoachInboxPacket(value: { kind: string }): value is CoachInboxPacket {
  return (COACH_INBOX_KINDS as readonly string[]).includes(value.kind);
}

export function rosterBeltToProgress(belt: string): ProgressBelt | null {
  const canonical = canonicalBelt(belt);
  return ROSTER_BELT_TO_PROGRESS[canonical] ?? null;
}

export function shortPromotionDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || !day) return iso;
  return `${month} ${day}`;
}

/** The line on the accept card and in the journal. */
export function rankUpdateSentence(packet: Pick<CoachRankUpdatePacket, 'rankUpdate'>): string {
  const belt = rankBeltLabel(packet.rankUpdate.belt);
  const when = shortPromotionDate(packet.rankUpdate.promotionDate);
  const count = packet.rankUpdate.stripeCount;
  if (count <= 0) return `Coach recorded ${belt} belt on ${when}.`;
  const mark = packet.rankUpdate.belt === 'black' ? 'degree' : 'stripe';
  return `Coach recorded ${belt} belt, ${mark} ${count} on ${when}.`;
}

export function createUpdateId(now = Date.now()): string {
  const noise = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(4, '0');
  return `rank-${now.toString(36)}-${noise}`;
}

export function rankFieldsChanged(
  before: Pick<Student, 'belt' | 'lastPromotion' | 'stripes'>,
  after: Pick<Student, 'belt' | 'lastPromotion' | 'stripes'>,
): boolean {
  return (
    before.belt !== after.belt ||
    before.lastPromotion !== after.lastPromotion ||
    (before.stripes ?? 0) !== (after.stripes ?? 0)
  );
}

/** Unlinked cards never offer a send. A linked card offers one only after a real change. */
export function rankSendOffer(
  before: Pick<Student, 'belt' | 'lastPromotion' | 'stripes' | 'linkedStudentId'>,
  after: Pick<Student, 'belt' | 'lastPromotion' | 'stripes' | 'linkedStudentId'>,
): 'send' | 'noop' {
  if (!after.linkedStudentId) return 'noop';
  if (!rankFieldsChanged(before, after)) return 'noop';
  return 'send';
}

export function buildCoachRankUpdate(input: {
  studentId: string;
  belt: string;
  stripeCount: number;
  promotionDate: string;
  note?: string;
  gym?: CoachGymBrand;
  now?: number;
  updateId?: string;
}): { ok: true; packet: CoachRankUpdatePacket } | { ok: false; error: string } {
  const belt = rosterBeltToProgress(input.belt);
  if (!belt) return { ok: false, error: 'This belt cannot be sent as a rank update.' };
  if (!input.promotionDate.trim()) return { ok: false, error: 'Add a promotion date before sending.' };
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? createUpdateId(now);
  const note = (input.note ?? '').trim().slice(0, PROGRESS_NOTE_MAX);
  const packet: CoachRankUpdatePacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-rank-update',
    id: updateId,
    studentId: input.studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    rankUpdate: {
      belt,
      stripeCount: input.stripeCount,
      promotionDate: input.promotionDate,
      note,
    },
  };
  if (input.gym?.name || input.gym?.logo) packet.gym = input.gym;
  const parsed = parseProgressPacket(exportProgressPacket(packet));
  if (!parsed.ok || parsed.value.kind !== 'coach-rank-update') {
    const detail = parsed.ok ? 'Rank update could not be read back.' : parsed.errors.join(' ');
    return { ok: false, error: detail };
  }
  return { ok: true, packet: parsed.value };
}

export function emptyUpdateLedger(): UpdateLedger {
  return { accepted: [], dismissed: [] };
}

function clipIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim() || seen.has(value)) continue;
    seen.add(value);
    ids.push(value.trim());
  }
  return ids.slice(-LEDGER_MAX);
}

export function readUpdateLedger(storage: Pick<MemoryStore, 'getItem'>): UpdateLedger {
  try {
    const raw = storage.getItem(COACH_UPDATE_LEDGER_KEY);
    if (!raw) return emptyUpdateLedger();
    const parsed = JSON.parse(raw) as { accepted?: unknown; dismissed?: unknown };
    return { accepted: clipIds(parsed.accepted), dismissed: clipIds(parsed.dismissed) };
  } catch {
    return emptyUpdateLedger();
  }
}

export function writeUpdateLedger(storage: MemoryStore, ledger: UpdateLedger): void {
  storage.setItem(
    COACH_UPDATE_LEDGER_KEY,
    JSON.stringify({ accepted: clipIds(ledger.accepted), dismissed: clipIds(ledger.dismissed) }),
  );
}

function notifyCoachUpdate(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COACH_UPDATE_EVENT));
}

export function readCoachQueue(storage: Pick<MemoryStore, 'getItem'>): CoachInboxPacket[] {
  try {
    const raw = storage.getItem(COACH_INBOX_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const packets: CoachInboxPacket[] = [];
    for (const item of parsed) {
      const check = parseProgressPacket(JSON.stringify(item));
      if (!check.ok) continue;
      if (isCoachInboxPacket(check.value)) packets.push(check.value);
    }
    return packets;
  } catch {
    return [];
  }
}

export function writeCoachQueue(storage: MemoryStore, packets: readonly CoachInboxPacket[]): void {
  storage.setItem(COACH_INBOX_QUEUE_KEY, JSON.stringify(packets));
  notifyCoachUpdate();
}

export function queueCoachUpdate(storage: MemoryStore, packet: CoachInboxPacket): void {
  const ledger = readUpdateLedger(storage);
  if (ledger.accepted.includes(packet.updateId) || ledger.dismissed.includes(packet.updateId)) return;
  const current = readCoachQueue(storage);
  if (current.some((item) => item.updateId === packet.updateId)) return;
  writeCoachQueue(storage, [...current, packet]);
}

export function removeQueuedUpdate(storage: MemoryStore, updateId: string): void {
  const current = readCoachQueue(storage);
  writeCoachQueue(
    storage,
    current.filter((item) => item.updateId !== updateId),
  );
}

function seen(ledger: UpdateLedger, updateId: string): boolean {
  return ledger.accepted.includes(updateId) || ledger.dismissed.includes(updateId);
}

function applyRank(report: StudentProgressReport, packet: CoachRankUpdatePacket, now: number): StudentProgressReport {
  let next = report;
  if (next.profile.belt !== packet.rankUpdate.belt) {
    next = setRankBelt(next, packet.rankUpdate.belt, now);
  }
  if (!isRankBelt(next.profile.belt)) return next;
  const count = packet.rankUpdate.stripeCount;
  next = setRankTapeCount(next, count, now);
  if (count === 0) return setRankAwardedOn(next, packet.rankUpdate.promotionDate, now);
  next = setRankTapeDate(next, count - 1, packet.rankUpdate.promotionDate, now);
  if (report.profile.belt !== packet.rankUpdate.belt) {
    next = setRankAwardedOn(next, packet.rankUpdate.promotionDate, now);
  }
  return next;
}

export function acceptCoachRankUpdate(
  report: StudentProgressReport,
  packet: CoachRankUpdatePacket,
  ledger: UpdateLedger,
  now = Date.now(),
): { report: StudentProgressReport; ledger: UpdateLedger; applied: boolean } {
  if (packet.studentId !== report.studentId || seen(ledger, packet.updateId)) {
    return { report, ledger, applied: false };
  }
  let next = applyRank(report, packet, now);
  const sentence = rankUpdateSentence(packet);
  const notes = packet.rankUpdate.note ? `${sentence}\n${packet.rankUpdate.note}` : sentence;
  next = addJournalEntry(
    next,
    {
      date: packet.rankUpdate.promotionDate,
      className: 'Promotion',
      gameTag: '',
      techniques: [],
      partners: '',
      drills: '',
      rolls: '',
      notes,
    },
    now,
  );
  if (!next.profile.gymName.trim() && packet.gym?.name) {
    next = { ...next, profile: { ...next.profile, gymName: packet.gym.name } };
  }
  return {
    report: next,
    ledger: { ...ledger, accepted: [...ledger.accepted, packet.updateId].slice(-LEDGER_MAX) },
    applied: true,
  };
}

export function dismissCoachRankUpdate(
  report: StudentProgressReport,
  packet: CoachInboxPacket,
  ledger: UpdateLedger,
): { report: StudentProgressReport; ledger: UpdateLedger; applied: boolean } {
  if (packet.studentId !== report.studentId || seen(ledger, packet.updateId)) {
    return { report, ledger, applied: false };
  }
  return {
    report,
    ledger: { ...ledger, dismissed: [...ledger.dismissed, packet.updateId].slice(-LEDGER_MAX) },
    applied: true,
  };
}

/** Journal text after accept, for tests and the card. */
export function latestJournalNotes(report: StudentProgressReport): string {
  const entry = report.journal[report.journal.length - 1];
  return entry ? viewJournalEntry(entry).notes : '';
}
