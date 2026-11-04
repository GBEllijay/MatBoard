/**
 * Coach → student sync layer for linked roster cards.
 *
 * One generic, typed path for every coach update. It extends the rank (#371)
 * and competition (#372) inbox instead of adding a second system:
 *  - kinds: rank, competition, belt progress, coach assessment (accept or
 *    dismiss card), and the gym logo (optional "Update?" prompt).
 *  - one way only: coach to student. The student decides each update once.
 *  - accepted belt progress and coach assessments land in a coach overlay
 *    beside the student's own data. The student's checklist, rubric,
 *    benchmark marks, and self-assessment are never written.
 *  - only linked gym-account cards (Student Roster or a linked Competitor
 *    card) can send. Guests never. Assistant coach and program director seats
 *    never. A card with coach sync off sends nothing by any route.
 *  - transport order: Advantage Cloud inbox, the gym's own Google Drive /
 *    OneDrive folder, then a file the student imports. A lapsed cloud stops
 *    only the cloud route; the folder and the file keep working.
 */

import {
  COACH_INBOX_KINDS,
  COACH_UPDATE_EVENT,
  createUpdateId,
  isCoachInboxPacket,
  queueCoachUpdate,
  readUpdateLedger,
  rosterBeltToProgress,
  writeUpdateLedger,
  type CoachInboxPacket,
  type UpdateLedger,
} from './coachRankUpdate.ts';
import type { HandoffFolder } from './driveHandoff.ts';
import { base64UrlToBytes } from './entitlementToken.ts';
import { exportProgressPacket, parseProgressPacket, progressHandoffFileName } from './progress/format.ts';
import { SYNC_ASSESSMENT_AREA_IDS } from './progress/syncPackets.ts';
import { addJournalAmendment, addJournalEntry } from './studentEdition.ts';
import {
  PROGRESS_SCHEMA_VERSION,
  type CoachAssessment,
  type CoachAssessmentPacket,
  type CoachBeltProgress,
  type CoachBeltProgressPacket,
  type CoachBenchmarkStatus,
  type CoachGymBrand,
  type CoachGymLogoPacket,
  type CoachNote,
  type CoachNotePacket,
  type StudentProgressReport,
} from './progress/types.ts';
import type { Student } from './rosterStore.ts';
import { receiveGymLogo } from './studentGymMark.ts';
import { holdForParent, parentGateOn } from './parentGate.ts';
import { deliverRankUpdate, type InboxDelivery } from './studentInboxClient.ts';

export const SYNC_PACKET_KINDS = [...COACH_INBOX_KINDS, 'coach-gym-logo-update'] as const;
export type SyncPacketKind = (typeof SYNC_PACKET_KINDS)[number];
export type SyncPacket = CoachInboxPacket | CoachGymLogoPacket;

export const COACH_OVERLAY_KEY = 'matboard.studentEdition.coachOverlay.v1';
const OVERLAY_ASSESSMENT_MAX = 200;
const OVERLAY_NOTE_MAX = 200;
const LEDGER_MAX = 200;

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/* ------------------------------------------------------------------ */
/* Who is sending                                                      */
/* ------------------------------------------------------------------ */

/**
 * owner: the license owner, or a device with no license token (local only).
 * head: an Instructors seat. coach: a Coach seat.
 * assistant: Assistant coach or Program director seats. They never send.
 */
export type SyncActor = 'owner' | 'head' | 'coach' | 'assistant';

export function syncActorFromClaims(claims: { src?: unknown; tier?: unknown; preset?: unknown } | null): SyncActor {
  if (!claims) return 'owner';
  const seat = claims.src === 'seat' || claims.tier === 'seat';
  if (!seat) return 'owner';
  if (claims.preset === 'instructors') return 'head';
  if (claims.preset === 'coach') return 'coach';
  return 'assistant';
}

export function syncActorFromToken(token: string | null | undefined): SyncActor {
  const parts = (token ?? '').trim().split('.');
  if (parts.length < 2 || !parts[1]) return 'owner';
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as Record<string, unknown>;
    return syncActorFromClaims(payload);
  } catch {
    // An unreadable token is not trusted as an owner.
    return 'assistant';
  }
}

export function canSendCoachSync(actor: SyncActor): boolean {
  return actor === 'owner' || actor === 'head' || actor === 'coach';
}

/* ------------------------------------------------------------------ */
/* Per-card gate                                                       */
/* ------------------------------------------------------------------ */

export type SyncGate =
  | 'send'
  | 'unlinked'
  | 'guest'
  | 'sync-off'
  | 'assistant';

type GateCard = Pick<Student, 'linkedStudentId' | 'guestId' | 'coachSync'>;

/** Off on any card for this student turns sync off for every card of that student. */
export function coachSyncOffFor(roster: readonly GateCard[], linkedStudentId: string | undefined): boolean {
  if (!linkedStudentId) return false;
  return roster.some((card) => card.linkedStudentId === linkedStudentId && card.coachSync === 'off');
}

export function syncSendGate(card: GateCard, actor: SyncActor, roster: readonly GateCard[] = []): SyncGate {
  if (card.guestId) return 'guest';
  if (!card.linkedStudentId) return 'unlinked';
  if (card.coachSync === 'off' || coachSyncOffFor(roster, card.linkedStudentId)) return 'sync-off';
  if (!canSendCoachSync(actor)) return 'assistant';
  return 'send';
}

export const SYNC_GATE_COPY: Record<Exclude<SyncGate, 'send'>, string> = {
  unlinked: 'Link this card to a student ID first.',
  guest: 'A guest is not an Advantage student and is never sent updates.',
  'sync-off': 'Coach sync is off for this student. Nothing is sent.',
  assistant: 'Assistant coaches cannot send updates to students.',
};

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function syncUpdateId(prefix: string, now: number): string {
  return createUpdateId(now).replace(/^rank-/, `${prefix}-`);
}

function validated<T extends SyncPacket>(packet: T): { ok: true; packet: T } | { ok: false; error: string } {
  let text: string;
  try {
    text = exportProgressPacket(packet);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'That update could not be saved.' };
  }
  const parsed = parseProgressPacket(text);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? 'That update could not be saved.' };
  return { ok: true, packet: parsed.value as T };
}

export function buildCoachBeltProgressUpdate(input: {
  studentId: string;
  belt: string;
  issuedOn: string;
  note?: string;
  benchmarks: { targetId: string; name: string; coachStatus: CoachBenchmarkStatus; note?: string }[];
  gym?: CoachGymBrand;
  now?: number;
  updateId?: string;
}): { ok: true; packet: CoachBeltProgressPacket } | { ok: false; error: string } {
  const belt = rosterBeltToProgress(input.belt) ?? input.belt;
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? syncUpdateId('belt', now);
  const beltProgress: CoachBeltProgress = {
    belt,
    issuedOn: input.issuedOn,
    note: (input.note ?? '').trim(),
    benchmarks: input.benchmarks.map((mark) => ({
      targetId: mark.targetId,
      name: mark.name,
      coachStatus: mark.coachStatus,
      note: (mark.note ?? '').trim(),
    })),
  };
  const packet: CoachBeltProgressPacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-belt-progress-update',
    id: updateId,
    studentId: input.studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    beltProgress,
  };
  if (input.gym) packet.gym = input.gym;
  return validated(packet);
}

export function buildCoachAssessmentUpdate(input: {
  studentId: string;
  date: string;
  scores: Record<string, number>;
  strengths?: string;
  weaknesses?: string;
  note?: string;
  gym?: CoachGymBrand;
  now?: number;
  updateId?: string;
}): { ok: true; packet: CoachAssessmentPacket } | { ok: false; error: string } {
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? syncUpdateId('assess', now);
  const assessment: CoachAssessment = {
    date: input.date,
    note: (input.note ?? '').trim(),
    scores: { ...input.scores },
    strengths: (input.strengths ?? '').trim(),
    weaknesses: (input.weaknesses ?? '').trim(),
  };
  const packet: CoachAssessmentPacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-assessment-update',
    id: updateId,
    studentId: input.studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    assessment,
  };
  if (input.gym) packet.gym = input.gym;
  return validated(packet);
}

/**
 * A coach note. Only built when the coach presses Send; nothing creates one
 * automatically. `journalDate` is optional and defaults to `issuedOn`.
 */
export function buildCoachNoteUpdate(input: {
  studentId: string;
  note: string;
  issuedOn: string;
  journalDate?: string;
  gym?: CoachGymBrand;
  now?: number;
  updateId?: string;
}): { ok: true; packet: CoachNotePacket } | { ok: false; error: string } {
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? syncUpdateId('note', now);
  const coachNote: CoachNote = {
    issuedOn: input.issuedOn,
    journalDate: (input.journalDate ?? '').trim(),
    note: input.note.trim(),
  };
  const packet: CoachNotePacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-note-update',
    id: updateId,
    studentId: input.studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    coachNote,
  };
  if (input.gym) packet.gym = input.gym;
  return validated(packet);
}

/* ------------------------------------------------------------------ */
/* Gym logo source (gallery master)                                    */
/* ------------------------------------------------------------------ */

/**
 * Where the coach's master gym logo comes from. Draft PR #388 adds a
 * gallery master slot with `getGymLogo()`. Until it merges, the stub below
 * reads the existing Media Console logo and versions it by content.
 */
export type GymLogoMaster = { dataUrl: string; version: number; gymName?: string };
export type GymLogoSource = { getGymLogo(): GymLogoMaster | null };

export const GYM_LOGO_MASTER_VERSION_KEY = 'matboard.gymLogo.masterVersion.v1';

function textHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Version a logo by content: the same bytes keep the same version, new bytes
 * get the current time. Latest wins on the student side.
 */
export function versionGymLogo(storage: MemoryStore, dataUrl: string, now = Date.now()): number {
  const hash = `${textHash(dataUrl)}-${dataUrl.length}`;
  try {
    const raw = storage.getItem(GYM_LOGO_MASTER_VERSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as { hash?: unknown; version?: unknown }) : null;
    if (parsed && parsed.hash === hash && typeof parsed.version === 'number') return parsed.version;
    const previous = parsed && typeof parsed.version === 'number' ? parsed.version : 0;
    const version = Math.max(now, previous + 1);
    storage.setItem(GYM_LOGO_MASTER_VERSION_KEY, JSON.stringify({ hash, version }));
    return version;
  } catch {
    return now;
  }
}

export function stubGymLogoSource(
  readLogo: () => string | null,
  storage: MemoryStore,
  gymName = '',
  now: () => number = Date.now,
): GymLogoSource {
  return {
    getGymLogo() {
      const dataUrl = readLogo();
      if (!dataUrl) return null;
      return { dataUrl, version: versionGymLogo(storage, dataUrl, now()), gymName };
    },
  };
}

export function buildCoachGymLogoUpdate(input: {
  studentId: string;
  master: GymLogoMaster;
  now?: number;
  updateId?: string;
}): { ok: true; packet: CoachGymLogoPacket } | { ok: false; error: string } {
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? syncUpdateId('logo', now);
  const packet: CoachGymLogoPacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-gym-logo-update',
    id: updateId,
    studentId: input.studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    gymLogo: { logoVersion: input.master.version },
    gym: { name: (input.master.gymName ?? '').trim().slice(0, 80), logo: input.master.dataUrl },
  };
  return validated(packet);
}

/* ------------------------------------------------------------------ */
/* Student side: coach overlay                                         */
/* ------------------------------------------------------------------ */

export type CoachOverlayAssessment = CoachAssessment & { updateId: string; gymName: string; cardLook?: string };
export type CoachOverlayBelt = CoachBeltProgress & { updateId: string };
/** An accepted coach note, shown under Suggestions from coach. */
export type CoachOverlayNote = { updateId: string; issuedOn: string; journalDate: string; note: string; gymName: string; cardLook?: string };

/** Coach views beside the student's own data. Never merged into it. */
export type CoachOverlay = {
  version: 1;
  assessments: CoachOverlayAssessment[];
  /** Latest accepted coach view per belt. */
  beltProgress: Record<string, CoachOverlayBelt>;
  /** Accepted coach notes, oldest first. Older saves omit this. */
  notes: CoachOverlayNote[];
};

export function emptyCoachOverlay(): CoachOverlay {
  return { version: 1, assessments: [], beltProgress: {}, notes: [] };
}

export function readCoachOverlay(storage: Pick<MemoryStore, 'getItem'>): CoachOverlay {
  try {
    const raw = storage.getItem(COACH_OVERLAY_KEY);
    if (!raw) return emptyCoachOverlay();
    const parsed = JSON.parse(raw) as Partial<CoachOverlay>;
    if (parsed.version !== 1) return emptyCoachOverlay();
    return {
      version: 1,
      assessments: Array.isArray(parsed.assessments) ? parsed.assessments.slice(-OVERLAY_ASSESSMENT_MAX) : [],
      beltProgress:
        parsed.beltProgress && typeof parsed.beltProgress === 'object' && !Array.isArray(parsed.beltProgress)
          ? parsed.beltProgress
          : {},
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(-OVERLAY_NOTE_MAX) : [],
    };
  } catch {
    return emptyCoachOverlay();
  }
}

export function writeCoachOverlay(storage: MemoryStore, overlay: CoachOverlay): void {
  storage.setItem(COACH_OVERLAY_KEY, JSON.stringify(overlay));
}

function decided(ledger: UpdateLedger, updateId: string): boolean {
  return ledger.accepted.includes(updateId) || ledger.dismissed.includes(updateId);
}

export const COACH_NOTE_LABEL = 'From coach';

/** The coach-labeled block added to the journal. */
export function coachNoteBlock(packet: CoachNotePacket): string {
  const who = packet.gym?.name?.trim() ? `${COACH_NOTE_LABEL} (${packet.gym.name.trim()})` : COACH_NOTE_LABEL;
  return `${who}: ${packet.coachNote.note}`;
}

/** The journal day a coach note lands on. */
export function coachNoteDay(packet: CoachNotePacket): string {
  return packet.coachNote.journalDate || packet.coachNote.issuedOn;
}

/**
 * Append a coach note to the student's journal for its day. The student's own
 * entry text is never replaced: the note goes on as an added block. With no
 * entry that day, a new "Coach note" entry is added.
 */
export function appendCoachNoteToJournal(
  report: StudentProgressReport,
  packet: CoachNotePacket,
  now = Date.now(),
): StudentProgressReport {
  const day = coachNoteDay(packet);
  const block = coachNoteBlock(packet);
  const existing = report.journal
    .filter((entry) => entry.date === day)
    .sort((left, right) => left.createdAt - right.createdAt)[0];
  if (existing) return addJournalAmendment(report, existing.id, block, day, now);
  return addJournalEntry(
    report,
    { date: day, className: 'Coach note', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: block },
    now,
  );
}

/**
 * Accept belt progress, a coach assessment, or a coach note. Belt progress and
 * assessments change only the overlay and the ledger; the report comes back
 * untouched. A coach note also appends a labeled block to the journal (never
 * replacing the student's text) and lands under Suggestions from coach.
 */
export function acceptCoachSyncUpdate(
  report: StudentProgressReport,
  packet: CoachBeltProgressPacket | CoachAssessmentPacket | CoachNotePacket,
  ledger: UpdateLedger,
  overlay: CoachOverlay,
  now = Date.now(),
): { report: StudentProgressReport; ledger: UpdateLedger; overlay: CoachOverlay; applied: boolean } {
  if (packet.studentId !== report.studentId || decided(ledger, packet.updateId)) {
    return { report, ledger, overlay, applied: false };
  }
  let next: CoachOverlay;
  let nextReport = report;
  if (packet.kind === 'coach-note-update') {
    nextReport = appendCoachNoteToJournal(report, packet, now);
    const entry: CoachOverlayNote = {
      updateId: packet.updateId,
      issuedOn: packet.coachNote.issuedOn,
      journalDate: coachNoteDay(packet),
      note: packet.coachNote.note,
      gymName: packet.gym?.name ?? '',
      ...(packet.gym?.cardLook ? { cardLook: packet.gym.cardLook } : {}),
    };
    next = { ...overlay, notes: [...(overlay.notes ?? []), entry].slice(-OVERLAY_NOTE_MAX) };
  } else if (packet.kind === 'coach-belt-progress-update') {
    const current = overlay.beltProgress[packet.beltProgress.belt];
    const newer = !current || current.issuedOn <= packet.beltProgress.issuedOn;
    next = newer
      ? {
          ...overlay,
          beltProgress: {
            ...overlay.beltProgress,
            [packet.beltProgress.belt]: { ...packet.beltProgress, updateId: packet.updateId },
          },
        }
      : overlay;
  } else {
    const entry: CoachOverlayAssessment = {
      ...packet.assessment,
      updateId: packet.updateId,
      gymName: packet.gym?.name ?? '',
      ...(packet.gym?.cardLook ? { cardLook: packet.gym.cardLook } : {}),
    };
    const assessments = [...overlay.assessments, entry]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-OVERLAY_ASSESSMENT_MAX);
    next = { ...overlay, assessments };
  }
  return {
    report: nextReport,
    ledger: { ...ledger, accepted: [...ledger.accepted, packet.updateId].slice(-LEDGER_MAX) },
    overlay: next,
    applied: true,
  };
}

/** Coach trend: one point per accepted coach assessment, by date. */
export function coachAssessmentTrend(overlay: CoachOverlay): { date: string; average: number }[] {
  return overlay.assessments.map((entry) => {
    const values = SYNC_ASSESSMENT_AREA_IDS.map((id) => entry.scores[id]).filter(
      (value): value is number => typeof value === 'number',
    );
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return { date: entry.date, average: Math.round(average * 10) / 10 };
  });
}

const STATUS_LABEL: Record<CoachBenchmarkStatus, string> = {
  'not-yet': 'Not yet',
  working: 'Working on it',
  ready: 'Ready',
};

export function coachSyncSentence(packet: CoachBeltProgressPacket | CoachAssessmentPacket | CoachNotePacket): string {
  if (packet.kind === 'coach-note-update') {
    return `Coach note for your journal on ${coachNoteDay(packet)}. Accept adds it under your own entry; your words stay as written.`;
  }
  if (packet.kind === 'coach-belt-progress-update') {
    const ready = packet.beltProgress.benchmarks.filter((mark) => mark.coachStatus === 'ready').length;
    return `Coach shared belt progress: ${ready} of ${packet.beltProgress.benchmarks.length} benchmarks ready.`;
  }
  const strengths = packet.assessment.strengths ? ` Strengths: ${packet.assessment.strengths}.` : '';
  const weaknesses = packet.assessment.weaknesses ? ` Work on: ${packet.assessment.weaknesses}.` : '';
  return `Coach assessment from ${packet.assessment.date}.${strengths}${weaknesses}`;
}

export function coachStatusLabel(status: CoachBenchmarkStatus): string {
  return STATUS_LABEL[status];
}

/* ------------------------------------------------------------------ */
/* Receiving: cloud inbox items, folder files, and imported files      */
/* ------------------------------------------------------------------ */

export type SyncReceive = 'queued' | 'logo-started' | 'logo-prompt' | 'parent-hold' | 'ignored';

/** Fired when a packet starts waiting for a parent. */
export const PARENT_GATE_EVENT = 'matboard-parent-gate';

/**
 * One packet from any route. Coach updates wait in the accept queue.
 * A gym logo never blocks: it starts showing for a student who has no
 * choice yet, otherwise it raises the optional "Update?" prompt.
 */
export function receiveSyncPacket(
  storage: MemoryStore,
  raw: unknown,
  expectStudentId?: string | null,
  options: { parentApproved?: boolean } = {},
): SyncReceive {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const parsed = parseProgressPacket(text);
  if (!parsed.ok) return 'ignored';
  const packet = parsed.value;
  if (expectStudentId && packet.studentId !== expectStudentId) return 'ignored';
  if (!isCoachInboxPacket(packet) && packet.kind !== 'coach-gym-logo-update') return 'ignored';
  if (isCoachInboxPacket(packet) && decided(readUpdateLedger(storage), packet.updateId)) return 'ignored';
  // Parent approvals: one gate for every kind, before the student sees anything.
  if (!options.parentApproved && parentGateOn(storage)) {
    const held = holdForParent(storage, { route: 'sync', raw: text });
    if (held === 'declined') return 'ignored';
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(PARENT_GATE_EVENT));
    }
    return 'parent-hold';
  }
  if (packet.kind === 'coach-gym-logo-update') {
    const result = receiveGymLogo(
      { logoVersion: packet.gymLogo.logoVersion, dataUrl: packet.gym.logo, gymName: packet.gym.name },
      storage,
    );
    if (result !== 'ignored' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(COACH_UPDATE_EVENT));
    }
    return result === 'started' ? 'logo-started' : result === 'prompt' ? 'logo-prompt' : 'ignored';
  }
  if (!isCoachInboxPacket(packet)) return 'ignored';
  const ledger = readUpdateLedger(storage);
  if (decided(ledger, packet.updateId)) return 'ignored';
  queueCoachUpdate(storage, packet);
  return 'queued';
}

/** File fallback: the same JSON the cloud inbox stores. */
export function syncPacketFile(packet: SyncPacket): { name: string; json: string } {
  return { name: progressHandoffFileName(packet), json: exportProgressPacket(packet) };
}

/** Gym drive route: write one packet into the gym's Google Drive or OneDrive folder. */
export async function sendSyncPacketToFolder(folder: HandoffFolder, packet: SyncPacket): Promise<string> {
  const file = syncPacketFile(packet);
  await folder.writeText(file.name, file.json);
  return file.name;
}

/** Student side of the gym drive route. Reads only this student's sync files. */
export async function takeSyncPacketsFromFolder(
  folder: HandoffFolder,
  storage: MemoryStore,
  studentId: string,
): Promise<SyncReceive[]> {
  const files = await folder.readTexts();
  const results: SyncReceive[] = [];
  const prefixes = SYNC_PACKET_KINDS.map((kind) => `advantage-handoff-${kind}-`);
  for (const file of files) {
    if (!file.name.endsWith('.json') || !prefixes.some((prefix) => file.name.startsWith(prefix))) continue;
    results.push(receiveSyncPacket(storage, file.text, studentId));
  }
  return results;
}

/** Record a decision without changing the report. Used after accept or dismiss. */
export function recordSyncDecision(storage: MemoryStore, ledger: UpdateLedger): void {
  writeUpdateLedger(storage, ledger);
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

export type SyncDelivery = InboxDelivery | { mode: 'blocked'; gate: Exclude<SyncGate, 'send'>; reason: string };

/**
 * Every coach → student send goes through here. A blocked gate sends nothing:
 * no cloud call, no gym folder file, and no download.
 */
export async function deliverSyncPacket(
  packet: SyncPacket,
  gate: SyncGate,
  options: {
    deliver?: (packet: SyncPacket) => Promise<InboxDelivery>;
    folder?: HandoffFolder | null;
  } = {},
): Promise<SyncDelivery | { mode: 'folder'; name: string }> {
  if (gate !== 'send') return { mode: 'blocked', gate, reason: SYNC_GATE_COPY[gate] };
  const delivery = await (options.deliver ?? ((item: SyncPacket) => deliverRankUpdate(item)))(packet);
  if (delivery.mode === 'cloud' || !options.folder) return delivery;
  // Cloud is off or lapsed: try the gym's own Drive / OneDrive folder before a download.
  try {
    const name = await sendSyncPacketToFolder(options.folder, packet);
    return { mode: 'folder', name };
  } catch {
    return delivery;
  }
}
