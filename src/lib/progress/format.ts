/**
 * Read, write, and merge Student Edition progress files.
 * JSON text only. The gym Drive folder or email carries the file.
 * Advantage does not host it.
 */

import { asRecord } from '../plainValue.ts';
import { canonicalFundamentalsCatalogId } from './catalog.ts';
import {
  CALENDAR_KINDS,
  GAME_TAGS,
  PROGRESS_AMENDMENTS_MAX,
  PROGRESS_BELTS,
  PROGRESS_BODY_MAX,
  PROGRESS_CALENDAR_MAX,
  LICENSE_SOURCES,
  PROGRESS_CHECKLIST_MAX,
  PROGRESS_CHECKPOINTS_MAX,
  PROGRESS_CRITERIA_MAX,
  PROGRESS_EXAMPLE_MAX,
  PROGRESS_EXAMPLES_MAX,
  PROGRESS_FOCUS_MAX,
  PROGRESS_GOALS_MAX,
  PROGRESS_ID_MAX,
  PROGRESS_JOURNAL_MAX,
  PROGRESS_LEVELS_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_PACKET_KINDS,
  PROGRESS_SCHEMA_VERSION,
  PROGRESS_SYNOPSIS_MAX,
  type Amendment,
  type CoachSuggestion,
  type FundamentalsCatalog,
  type FundamentalsCategory,
  type FundamentalsItem,
  type LicenseSource,
  type RubricCheckpoint,
  type RubricCriterion,
  type RubricLevel,
  type CalendarEvent,
  type CalendarKind,
  type CoachFeedback,
  type CoachFeedbackPacket,
  type CoachPlan,
  type CoachPlanFocus,
  type CoachPlanPacket,
  type GameTag,
  type JournalEntry,
  type ProgressBelt,
  type ProgressMerge,
  type ProgressPacket,
  type ProgressParse,
  type StudentChecklistEntry,
  type StudentGoal,
  type StudentProfile,
  type StudentProgressReport,
  type StudentRubric,
  type TechniqueRef,
} from './types.ts';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BYTE_KEY = /blob|bytes|dataurl|base64|filebody|arraybuffer/i;

export const PROGRESS_CSV_HEADERS = [
  'Sheet',
  'Id',
  'Date',
  'Parent id',
  'Game',
  'Category',
  'Name',
  'Technique names',
  'Learned on',
  'Note',
  'Body',
  'Met',
  'Title',
  'Kind',
  'Belt',
  'Toward',
  'Criterion id',
  'Catalog item id',
] as const;

/** Shared criterion id. Coach notes can name it. Only the student file stores whether it is met. */
export function sharedCriterionId(belt: ProgressBelt, slug: string): string {
  const clean = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `rubric.${belt}.${clean || 'item'}`;
}

/** Shared checkpoint id. Checkpoints are the steps between levels. */
export function sharedCheckpointId(belt: ProgressBelt, slug: string): string {
  const clean = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `checkpoint.${belt}.${clean || 'item'}`;
}

export function progressHandoffFileName(packet: Pick<ProgressPacket, 'kind' | 'id' | 'updatedAt'>): string {
  const safe = packet.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, PROGRESS_ID_MAX) || 'item';
  return `advantage-handoff-${packet.kind}-${safe}-${packet.updatedAt}.json`;
}

export function exportProgressPacket(packet: ProgressPacket): string {
  if (packetCarriesBytes(packet)) throw new Error('A progress file cannot carry photos or videos.');
  return JSON.stringify(packet);
}

export function parseProgressPacket(text: string): ProgressParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not JSON.'] };
  }
  return parseProgressValue(raw);
}

/** schemaVersion 1 is the only readable shape. A newer file waits for a migration. */
export function parseProgressValue(raw: unknown): ProgressParse {
  const errors: string[] = [];
  if (packetCarriesBytes(raw)) errors.push('A progress file cannot carry photos or videos.');
  if (carriesStripeKey(raw)) errors.push('Belt progress uses checkpoints between levels.');
  const record = asRecord(raw);
  if (!record) return { ok: false, errors: ['A progress file must be a JSON object.'] };
  if (record.schemaVersion !== PROGRESS_SCHEMA_VERSION) {
    const seen = record.schemaVersion == null ? 'missing' : String(record.schemaVersion);
    errors.push(`schemaVersion ${seen} is not supported. This build reads version ${PROGRESS_SCHEMA_VERSION}.`);
  }
  const kind = record.kind;
  if (typeof kind !== 'string' || !(PROGRESS_PACKET_KINDS as readonly string[]).includes(kind)) {
    errors.push('Packet kind must be student-progress-report, coach-plan, or coach-feedback.');
  }
  const id = readId(record.id, 'Packet id', errors);
  const studentId = readId(record.studentId, 'Student id', errors);
  const updatedAt = readTime(record.updatedAt, 'updatedAt', errors);
  if (errors.length || (kind !== 'student-progress-report' && kind !== 'coach-plan' && kind !== 'coach-feedback')) {
    return { ok: false, errors };
  }
  if (kind === 'student-progress-report') {
    const value: StudentProgressReport = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      kind,
      id,
      studentId,
      updatedAt,
      profile: readProfile(record.profile, errors),
      rubric: readRubric(record.rubric, errors),
      checklist: readChecklist(record.checklist, errors),
      journal: readJournal(record.journal, errors),
      calendar: readCalendar(record.calendar, errors),
      goals: readGoals(record.goals, errors),
    };
    return errors.length ? { ok: false, errors } : { ok: true, value };
  }
  if (kind === 'coach-plan' || kind === 'coach-feedback') {
    if (carriesStudentMark(record)) errors.push('A coach file cannot set student marks, checkpoints, journal, or goals.');
  }
  if (kind === 'coach-plan') {
    const value: CoachPlanPacket = {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      kind,
      id,
      studentId,
      updatedAt,
      plan: readCoachPlan(record.plan, errors),
    };
    return errors.length ? { ok: false, errors } : { ok: true, value };
  }
  const value: CoachFeedbackPacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-feedback',
    id,
    studentId,
    updatedAt,
    feedback: readCoachFeedback(record.feedback, errors),
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * Bring an incoming progress report onto this device.
 * Journal cards stay. Amendments append. A filled field is not replaced.
 */
export function mergeStudentProgress(local: StudentProgressReport, incoming: StudentProgressReport): ProgressMerge {
  const report = structuredClone(local);
  const appendedAmendments: string[] = [];
  const addedJournal: string[] = [];
  const addedChecklist: string[] = [];
  const conflicts: string[] = [];
  if (local.studentId !== incoming.studentId) {
    conflicts.push('A progress file for a different student was left out.');
    return { report, appendedAmendments, addedJournal, addedChecklist, conflicts };
  }
  report.updatedAt = Math.max(local.updatedAt, incoming.updatedAt);
  if (profileText(local.profile) !== profileText(incoming.profile)) {
    conflicts.push('Profile on this device was kept.');
  }
  mergeRubric(report, incoming, conflicts);
  mergeChecklist(report, incoming, addedChecklist, conflicts);
  mergeGoals(report, incoming, conflicts);
  mergeJournal(report, incoming, addedJournal, appendedAmendments, conflicts);
  mergeCalendar(report, incoming, conflicts);
  return { report, appendedAmendments, addedJournal, addedChecklist, conflicts };
}

/**
 * Keep a coach plan or feedback file beside the student report.
 * The report that comes back is the student's copy. Marks, checkpoints, journal, and goals stay as they were.
 * The student can read the suggestion and later choose what to write on their own file.
 */
export function importCoachSuggestion(
  report: StudentProgressReport,
  packet: CoachPlanPacket | CoachFeedbackPacket,
): { report: StudentProgressReport; packet: CoachPlanPacket | CoachFeedbackPacket } {
  return { report: structuredClone(report), packet: structuredClone(packet) };
}

/**
 * A coach plan or feedback file is one snapshot of suggestions.
 * A newer updatedAt for the same id replaces that suggestion. An older file stays aside.
 * This does not write the student's rubric, journal, or goals.
 */
export function mergeCoachPacket<T extends CoachPlanPacket | CoachFeedbackPacket>(
  local: T | null,
  incoming: T,
): { packet: T; replaced: boolean; conflicts: string[] } {
  if (!local) return { packet: structuredClone(incoming), replaced: true, conflicts: [] };
  if (local.studentId !== incoming.studentId) {
    return {
      packet: structuredClone(local),
      replaced: false,
      conflicts: ['A coach file for a different student was left out.'],
    };
  }
  if (local.id === incoming.id && incoming.updatedAt < local.updatedAt) {
    return {
      packet: structuredClone(local),
      replaced: false,
      conflicts: ['An older coach file was left aside.'],
    };
  }
  return { packet: structuredClone(incoming), replaced: true, conflicts: [] };
}

/** Case-insensitive match on the card, later amendments, and technique names. */
export function searchJournal(journal: readonly JournalEntry[], query: string): JournalEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...journal];
  return journal.filter((entry) => journalHaystack(entry).includes(needle));
}

export function exportProgressCsv(packet: ProgressPacket): string {
  const lines = [PROGRESS_CSV_HEADERS.join(',')];
  if (packet.kind === 'student-progress-report') writeReportRows(lines, packet);
  if (packet.kind === 'coach-plan') writePlanRows(lines, packet);
  if (packet.kind === 'coach-feedback') writeFeedbackRows(lines, packet);
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function packetCarriesBytes(value: unknown): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (current instanceof Uint8Array || current instanceof ArrayBuffer) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (BYTE_KEY.test(key)) return true;
      if (typeof child === 'string' && child.startsWith('data:')) return true;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function journalHaystack(entry: JournalEntry): string {
  return [entry.body, ...entry.amendments.map((item) => item.body), ...entry.techniqueRefs.map((item) => item.name)]
    .join('\n')
    .toLowerCase();
}

function profileText(profile: StudentProfile): string {
  return [profile.id, profile.displayName, profile.gymName, profile.belt, profile.licenseSource, profile.startedOn].join('\n');
}

function mergeRubric(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  const levels = new Map(report.rubric.levels.map((level) => [level.id, level]));
  for (const level of incoming.rubric.levels) {
    const current = levels.get(level.id);
    if (!current) {
      report.rubric.levels.push(structuredClone(level));
      continue;
    }
    current.name = preferText(current.name, level.name, `Level ${level.id} name was kept.`, conflicts);
    if (current.belt !== level.belt) conflicts.push(`Level ${level.id} belt was kept.`);
    mergeCheckpoints(current, level, conflicts);
  }
}

function mergeCheckpoints(local: RubricLevel, incoming: RubricLevel, conflicts: string[]): void {
  const byId = new Map(local.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  for (const checkpoint of incoming.checkpoints) {
    const current = byId.get(checkpoint.id);
    if (!current) {
      local.checkpoints.push(structuredClone(checkpoint));
      continue;
    }
    current.name = preferText(current.name, checkpoint.name, `Checkpoint ${checkpoint.id} name was kept.`, conflicts);
    current.note = preferText(current.note, checkpoint.note, `Checkpoint ${checkpoint.id} note was kept.`, conflicts);
    current.met = preferMet(current.met, checkpoint.met, `Checkpoint ${checkpoint.id} mark was kept.`, conflicts);
    mergeCriteria(current, checkpoint, conflicts);
  }
}

function mergeCriteria(local: RubricCheckpoint, incoming: RubricCheckpoint, conflicts: string[]): void {
  const byId = new Map(local.criteria.map((criterion) => [criterion.id, criterion]));
  for (const criterion of incoming.criteria) {
    const current = byId.get(criterion.id);
    if (!current) {
      local.criteria.push(structuredClone(criterion));
      continue;
    }
    current.requirement = preferText(
      current.requirement,
      criterion.requirement,
      `Criterion ${criterion.id} requirement was kept.`,
      conflicts,
    );
    current.note = preferText(current.note, criterion.note, `Criterion ${criterion.id} note was kept.`, conflicts);
    current.met = preferMet(current.met, criterion.met, `Criterion ${criterion.id} mark was kept.`, conflicts);
    if (techniqueKey(current.techniqueRefs) !== techniqueKey(criterion.techniqueRefs)) {
      conflicts.push(`Criterion ${criterion.id} techniques were kept.`);
    }
  }
}

function mergeGoals(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  const byId = new Map(report.goals.map((goal) => [goal.id, goal]));
  for (const goal of incoming.goals) {
    const current = byId.get(goal.id);
    if (!current) {
      report.goals.push(structuredClone(goal));
      continue;
    }
    current.name = preferText(current.name, goal.name, `Goal ${goal.id} name was kept.`, conflicts);
    current.note = preferText(current.note, goal.note, `Goal ${goal.id} note was kept.`, conflicts);
    current.met = preferMet(current.met, goal.met, `Goal ${goal.id} mark was kept.`, conflicts);
  }
}

function mergeChecklist(
  report: StudentProgressReport,
  incoming: StudentProgressReport,
  added: string[],
  conflicts: string[],
): void {
  const byId = new Map(report.checklist.map((entry) => [entry.id, entry]));
  for (const entry of incoming.checklist) {
    const current = byId.get(entry.id);
    if (!current) {
      report.checklist.push(structuredClone(entry));
      added.push(entry.id);
      continue;
    }
    current.name = preferText(current.name, entry.name, `Checklist ${entry.id} name was kept.`, conflicts);
    current.displayName = preferText(
      current.displayName,
      entry.displayName,
      `Checklist ${entry.id} display name was kept.`,
      conflicts,
    );
    current.note = preferText(current.note, entry.note, `Checklist ${entry.id} note was kept.`, conflicts);
    current.learnedOn = preferText(current.learnedOn, entry.learnedOn, `Checklist ${entry.id} date was kept.`, conflicts);
    if (current.hidden !== entry.hidden) conflicts.push(`Checklist ${entry.id} visibility was kept.`);
    current.catalogItemId = preferText(
      current.catalogItemId,
      entry.catalogItemId,
      `Checklist ${entry.id} catalog link was kept.`,
      conflicts,
    );
    current.categoryId = preferText(current.categoryId, entry.categoryId, `Checklist ${entry.id} category was kept.`, conflicts);
    current.updatedAt = Math.max(current.updatedAt, entry.updatedAt);
  }
}

function mergeJournal(
  report: StudentProgressReport,
  incoming: StudentProgressReport,
  added: string[],
  appended: string[],
  conflicts: string[],
): void {
  const byId = new Map(report.journal.map((entry) => [entry.id, entry]));
  for (const entry of incoming.journal) {
    const current = byId.get(entry.id);
    if (!current) {
      report.journal.push(structuredClone(entry));
      added.push(entry.id);
      continue;
    }
    if (current.body !== entry.body || current.gameTag !== entry.gameTag || current.date !== entry.date) {
      conflicts.push(`Journal ${entry.id} was kept. Later notes append.`);
    }
    if (techniqueKey(current.techniqueRefs) !== techniqueKey(entry.techniqueRefs)) {
      conflicts.push(`Journal ${entry.id} technique names were kept.`);
    }
    for (const amendment of entry.amendments) {
      const prior = current.amendments.find((item) => item.id === amendment.id);
      if (!prior) {
        current.amendments.push(structuredClone(amendment));
        appended.push(amendment.id);
        continue;
      }
      if (prior.body !== amendment.body || prior.date !== amendment.date) {
        conflicts.push(`Amendment ${amendment.id} was kept.`);
      }
    }
    current.updatedAt = Math.max(current.updatedAt, entry.updatedAt);
  }
}

function mergeCalendar(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  const byId = new Map(report.calendar.map((event) => [event.id, event]));
  for (const event of incoming.calendar) {
    const current = byId.get(event.id);
    if (!current) {
      report.calendar.push(structuredClone(event));
      continue;
    }
    current.title = preferText(current.title, event.title, `Calendar ${event.id} title was kept.`, conflicts);
    current.note = preferText(current.note, event.note, `Calendar ${event.id} note was kept.`, conflicts);
    if (current.date !== event.date || current.kind !== event.kind) {
      conflicts.push(`Calendar ${event.id} day was kept.`);
    }
  }
}

function preferText(local: string, incoming: string, conflict: string, conflicts: string[]): string {
  if (!local.trim() && incoming.trim()) return incoming;
  if (local.trim() && incoming.trim() && local !== incoming) conflicts.push(conflict);
  return local;
}

function preferMet(local: boolean | null, incoming: boolean | null, conflict: string, conflicts: string[]): boolean | null {
  if (local == null && incoming != null) return incoming;
  if (local != null && incoming != null && local !== incoming) conflicts.push(conflict);
  return local;
}

function techniqueKey(refs: readonly TechniqueRef[]): string {
  return refs.map((ref) => `${ref.id}:${ref.name}`).join('|');
}

function readProfile(value: unknown, errors: string[]): StudentProfile {
  const record = asRecord(value);
  if (!record) {
    errors.push('Profile is missing.');
    return { id: '', displayName: '', gymName: '', belt: 'white', startedOn: '', licenseSource: '' };
  }
  return {
    id: readId(record.id, 'Profile id', errors),
    displayName: readString(record.displayName, 'Display name', PROGRESS_NAME_MAX, errors),
    gymName: readString(record.gymName, 'Gym name', PROGRESS_NAME_MAX, errors),
    belt: readBelt(record.belt, 'Profile belt', errors),
    startedOn: readDate(record.startedOn, 'Start date', errors, false),
    licenseSource: readLicenseSource(record.licenseSource, errors),
  };
}

function readRubric(value: unknown, errors: string[]): StudentRubric {
  const record = asRecord(value);
  if (!record) {
    errors.push('Rubric is missing.');
    return { id: '', levels: [] };
  }
  const levels = readList(record.levels, 'Rubric levels', PROGRESS_LEVELS_MAX, errors).map((row, index) =>
    readLevel(row, index, errors),
  );
  uniqueIds(levels.map((level) => level.id), 'Rubric level', errors);
  uniqueIds(
    levels.flatMap((level) => level.checkpoints.map((checkpoint) => checkpoint.id)),
    'Checkpoint',
    errors,
  );
  uniqueIds(
    levels.flatMap((level) => level.checkpoints.flatMap((checkpoint) => checkpoint.criteria.map((criterion) => criterion.id))),
    'Rubric criterion',
    errors,
  );
  return { id: readId(record.id, 'Rubric id', errors), levels };
}

function readLevel(value: unknown, index: number, errors: string[]): RubricLevel {
  const record = asRecord(value);
  const label = `Rubric level ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', name: '', belt: 'white', checkpoints: [] };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    belt: readBelt(record.belt, label, errors),
    checkpoints: readList(record.checkpoints, `${label} checkpoints`, PROGRESS_CHECKPOINTS_MAX, errors).map((row, checkpointIndex) =>
      readCheckpoint(row, `${label} checkpoint ${checkpointIndex + 1}`, errors),
    ),
  };
}

function readCheckpoint(value: unknown, label: string, errors: string[]): RubricCheckpoint {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', name: '', met: null, note: '', criteria: [] };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    met: readMet(record.met, label, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
    criteria: readList(record.criteria, `${label} criteria`, PROGRESS_CRITERIA_MAX, errors).map((row, index) =>
      readCriterion(row, `${label} criterion ${index + 1}`, errors),
    ),
  };
}

function readCriterion(value: unknown, label: string, errors: string[]): RubricCriterion {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', requirement: '', techniqueRefs: [], met: null, note: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    requirement: readString(record.requirement, `${label} requirement`, PROGRESS_NOTE_MAX, errors),
    techniqueRefs: readList(record.techniqueRefs, `${label} techniques`, 20, errors).map((row, index) =>
      readTechniqueRef(row, `${label} technique ${index + 1}`, errors),
    ),
    met: readMet(record.met, label, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
}

function readChecklist(value: unknown, errors: string[]): StudentChecklistEntry[] {
  const rows = readList(value, 'Checklist', PROGRESS_CHECKLIST_MAX, errors);
  const entries = rows.map((row, index) => readChecklistEntry(row, index, errors));
  uniqueIds(entries.map((entry) => entry.id), 'Checklist', errors);
  return entries;
}

function readChecklistEntry(value: unknown, index: number, errors: string[]): StudentChecklistEntry {
  const record = asRecord(value);
  const label = `Checklist item ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return {
      id: '',
      catalogItemId: '',
      categoryId: '',
      name: '',
      displayName: '',
      hidden: false,
      learnedOn: '',
      note: '',
      updatedAt: 0,
    };
  }
  const catalogItemId = readOptionalId(record.catalogItemId, `${label} catalog id`, errors);
  const categoryId = readOptionalId(record.categoryId, `${label} category id`, errors);
  return {
    id: readId(record.id, `${label} id`, errors),
    catalogItemId,
    categoryId,
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    displayName: readString(record.displayName, `${label} display name`, PROGRESS_NAME_MAX, errors),
    hidden: readFlag(record.hidden, `${label} hidden`, errors),
    learnedOn: readDate(record.learnedOn, `${label} learned on`, errors, false),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
    updatedAt: readTime(record.updatedAt, `${label} updatedAt`, errors),
  };
}

function readJournal(value: unknown, errors: string[]): JournalEntry[] {
  const rows = readList(value, 'Journal', PROGRESS_JOURNAL_MAX, errors);
  const entries = rows.map((row, index) => readJournalEntry(row, index, errors));
  uniqueIds(entries.map((entry) => entry.id), 'Journal', errors);
  return entries;
}

function readJournalEntry(value: unknown, index: number, errors: string[]): JournalEntry {
  const record = asRecord(value);
  const label = `Journal card ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return {
      id: '',
      date: '',
      gameTag: 'a',
      body: '',
      techniqueRefs: [],
      amendments: [],
      createdAt: 0,
      updatedAt: 0,
    };
  }
  const techniqueRefs = readList(record.techniqueRefs, `${label} techniques`, 20, errors).map((row, refIndex) =>
    readTechniqueRef(row, `${label} technique ${refIndex + 1}`, errors),
  );
  const amendments = readList(record.amendments, `${label} amendments`, PROGRESS_AMENDMENTS_MAX, errors).map((row, amendmentIndex) =>
    readAmendment(row, `${label} amendment ${amendmentIndex + 1}`, errors),
  );
  uniqueIds(amendments.map((item) => item.id), `${label} amendment`, errors);
  return {
    id: readId(record.id, `${label} id`, errors),
    date: readDate(record.date, `${label} date`, errors, true),
    gameTag: readGameTag(record.gameTag, label, errors),
    body: readString(record.body, `${label} text`, PROGRESS_BODY_MAX, errors),
    techniqueRefs,
    amendments,
    createdAt: readTime(record.createdAt, `${label} createdAt`, errors),
    updatedAt: readTime(record.updatedAt, `${label} updatedAt`, errors),
  };
}

function readTechniqueRef(value: unknown, label: string, errors: string[]): TechniqueRef {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', name: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
  };
}

function readAmendment(value: unknown, label: string, errors: string[]): Amendment {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', date: '', body: '', createdAt: 0 };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    date: readDate(record.date, `${label} date`, errors, true),
    body: readString(record.body, `${label} text`, PROGRESS_BODY_MAX, errors),
    createdAt: readTime(record.createdAt, `${label} createdAt`, errors),
  };
}

function readCalendar(value: unknown, errors: string[]): CalendarEvent[] {
  const rows = readList(value, 'Calendar', PROGRESS_CALENDAR_MAX, errors);
  const events = rows.map((row, index) => readCalendarEvent(row, index, errors));
  uniqueIds(events.map((event) => event.id), 'Calendar', errors);
  return events;
}

function readCalendarEvent(value: unknown, index: number, errors: string[]): CalendarEvent {
  const record = asRecord(value);
  const label = `Calendar event ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', date: '', title: '', kind: 'other', note: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    date: readDate(record.date, `${label} date`, errors, true),
    title: readString(record.title, `${label} title`, PROGRESS_NAME_MAX, errors),
    kind: readCalendarKind(record.kind, label, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
}

function readCoachPlan(value: unknown, errors: string[]): CoachPlan {
  const record = asRecord(value);
  if (!record) {
    errors.push('Coach plan is missing.');
    return { title: '', issuedOn: '', note: '', focus: [] };
  }
  const focus = readList(record.focus, 'Coach plan focus', PROGRESS_FOCUS_MAX, errors).map((row, index) =>
    readFocus(row, index, errors),
  );
  uniqueIds(focus.map((item) => item.id), 'Coach plan focus', errors);
  return {
    title: readString(record.title, 'Coach plan title', PROGRESS_NAME_MAX, errors),
    issuedOn: readDate(record.issuedOn, 'Coach plan date', errors, true),
    note: readString(record.note, 'Coach plan note', PROGRESS_NOTE_MAX, errors),
    focus,
  };
}

function readFocus(value: unknown, index: number, errors: string[]): CoachPlanFocus {
  const record = asRecord(value);
  const label = `Coach plan focus ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', criterionId: '', catalogItemId: '', name: '', note: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    criterionId: readOptionalId(record.criterionId, `${label} criterion id`, errors),
    catalogItemId: readOptionalId(record.catalogItemId, `${label} catalog id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
}

function readGoals(value: unknown, errors: string[]): StudentGoal[] {
  const rows = readList(value, 'Goals', PROGRESS_GOALS_MAX, errors);
  const goals = rows.map((row, index) => readGoal(row, index, errors));
  uniqueIds(goals.map((goal) => goal.id), 'Goal', errors);
  return goals;
}

function readGoal(value: unknown, index: number, errors: string[]): StudentGoal {
  const record = asRecord(value);
  const label = `Goal ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', name: '', note: '', met: null };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
    met: readMet(record.met, label, errors),
  };
}

function readCoachFeedback(value: unknown, errors: string[]): CoachFeedback {
  const record = asRecord(value);
  if (!record) {
    errors.push('Coach feedback is missing.');
    return { planId: '', issuedOn: '', synopsis: '', suggestions: [] };
  }
  const suggestions = readList(record.suggestions, 'Coach feedback suggestions', PROGRESS_CRITERIA_MAX, errors).map(
    (row, index) => readSuggestion(row, index, errors),
  );
  uniqueIds(suggestions.map((item) => item.id), 'Coach feedback suggestion', errors);
  return {
    planId: readOptionalId(record.planId, 'Coach feedback plan id', errors),
    issuedOn: readDate(record.issuedOn, 'Coach feedback date', errors, true),
    synopsis: readString(record.synopsis, 'Coach feedback synopsis', PROGRESS_SYNOPSIS_MAX, errors),
    suggestions,
  };
}

function readSuggestion(value: unknown, index: number, errors: string[]): CoachSuggestion {
  const record = asRecord(value);
  const label = `Coach suggestion ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', targetId: '', note: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    targetId: readOptionalId(record.targetId, `${label} target`, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
}

function readLicenseSource(value: unknown, errors: string[]): LicenseSource {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && (LICENSE_SOURCES as readonly string[]).includes(value)) return value as LicenseSource;
  errors.push('License source must be academy-member, pro-grant, additional, or blank.');
  return '';
}

function readBelt(value: unknown, label: string, errors: string[]): ProgressBelt {
  if (typeof value === 'string' && (PROGRESS_BELTS as readonly string[]).includes(value)) return value as ProgressBelt;
  errors.push(`${label} must be a known belt.`);
  return 'white';
}

function readGameTag(value: unknown, label: string, errors: string[]): GameTag {
  if (typeof value === 'string' && (GAME_TAGS as readonly string[]).includes(value)) return value as GameTag;
  errors.push(`${label} game tag must be a, b, or c.`);
  return 'a';
}

/** Names-only catalogs leave every examples list empty. A filled list is a worked checklist. */
export function parseFundamentalsCatalog(raw: unknown): { ok: true; value: FundamentalsCatalog } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const record = asRecord(raw);
  if (!record) return { ok: false, errors: ['Fundamentals catalog must be an object.'] };
  const categories = readList(record.categories, 'Catalog categories', 40, errors).map((row, index) =>
    readCatalogCategory(row, index, errors),
  );
  uniqueIds(categories.map((category) => category.id), 'Catalog category', errors);
  const itemIds = categories.flatMap((category) => category.items.map((item) => item.id));
  uniqueIds(itemIds, 'Catalog item', errors);
  const value: FundamentalsCatalog = {
    id: canonicalFundamentalsCatalogId(readId(record.id, 'Catalog id', errors)),
    title: readString(record.title, 'Catalog title', PROGRESS_NAME_MAX, errors),
    draft: record.draft === true,
    categories,
  };
  if (record.draft !== true && record.draft !== false) errors.push('Catalog draft must be true or false.');
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

function readCatalogCategory(value: unknown, index: number, errors: string[]): FundamentalsCategory {
  const record = asRecord(value);
  const label = `Catalog category ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', name: '', items: [] };
  }
  const items = readList(record.items, `${label} items`, PROGRESS_CHECKLIST_MAX, errors).map((row, itemIndex) =>
    readCatalogItem(row, `${label} item ${itemIndex + 1}`, errors),
  );
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    items,
  };
}

function readCatalogItem(value: unknown, label: string, errors: string[]): FundamentalsItem {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', name: '', examples: [] };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    examples: readExamples(record.examples, label, errors),
  };
}

function readExamples(value: unknown, label: string, errors: string[]): string[] {
  if (value == null) return [];
  const rows = readList(value, `${label} examples`, PROGRESS_EXAMPLES_MAX, errors);
  return rows.map((row, index) => readString(row, `${label} example ${index + 1}`, PROGRESS_EXAMPLE_MAX, errors));
}

function readCalendarKind(value: unknown, label: string, errors: string[]): CalendarKind {
  if (typeof value === 'string' && (CALENDAR_KINDS as readonly string[]).includes(value)) return value as CalendarKind;
  errors.push(`${label} kind must be class, training, promotion, note, or other.`);
  return 'other';
}

function readMet(value: unknown, label: string, errors: string[]): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  errors.push(`${label} mark must be true, false, or blank.`);
  return null;
}

function readId(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    errors.push(`${label} must be a stable id (letters, numbers, dot, hyphen, underscore).`);
    return '';
  }
  return value;
}

function readOptionalId(value: unknown, label: string, errors: string[]): string {
  if (value == null || value === '') return '';
  return readId(value, label, errors);
}

function readTime(value: unknown, label: string, errors: string[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a time in milliseconds.`);
    return 0;
  }
  return value;
}

function readDate(value: unknown, label: string, errors: string[], required: boolean): string {
  if (value == null || value === '') {
    if (required) errors.push(`${label} needs a date (YYYY-MM-DD).`);
    return '';
  }
  if (typeof value !== 'string' || !DATE_RE.test(value) || !realDay(value)) {
    errors.push(`${label} must be YYYY-MM-DD.`);
    return '';
  }
  return value;
}

function realDay(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function readFlag(value: unknown, label: string, errors: string[]): boolean {
  if (value == null || value === false) return false;
  if (value === true) return true;
  errors.push(`${label} must be true or false.`);
  return false;
}

function readString(value: unknown, label: string, max: number, errors: string[]): string {
  if (value == null) return '';
  if (typeof value !== 'string') {
    errors.push(`${label} must be text.`);
    return '';
  }
  if (value.startsWith('data:')) {
    errors.push(`${label} cannot carry a file.`);
    return '';
  }
  if (value.length > max) {
    errors.push(`${label} is longer than ${max} characters.`);
    return '';
  }
  return value;
}

function readList(value: unknown, label: string, max: number, errors: string[]): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list.`);
    return [];
  }
  if (value.length > max) errors.push(`${label} has more than ${max} rows.`);
  return value;
}

function uniqueIds(ids: string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) {
      if (id) errors.push(`${label} id ${id} is repeated.`);
      continue;
    }
    seen.add(id);
  }
}

function writeReportRows(lines: string[], packet: StudentProgressReport): void {
  lines.push(csvRow([
    'Profile',
    packet.profile.id,
    packet.profile.startedOn,
    packet.studentId,
    '',
    '',
    packet.profile.displayName,
    '',
    '',
    packet.profile.licenseSource,
    '',
    '',
    packet.profile.gymName,
    '',
    packet.profile.belt,
    '',
    '',
    '',
  ]));
  for (const level of packet.rubric.levels) {
    lines.push(csvRow([
      'Level',
      level.id,
      '',
      packet.rubric.id,
      '',
      '',
      level.name,
      '',
      '',
      '',
      '',
      '',
      level.name,
      '',
      level.belt,
      '',
      '',
      '',
    ]));
    for (const checkpoint of level.checkpoints) {
      lines.push(csvRow([
        'Checkpoint',
        checkpoint.id,
        '',
        level.id,
        '',
        '',
        checkpoint.name,
        '',
        '',
        checkpoint.note,
        '',
        metCell(checkpoint.met),
        level.name,
        '',
        level.belt,
        '',
        '',
        '',
      ]));
      for (const criterion of checkpoint.criteria) {
        lines.push(csvRow([
          'Criterion',
          criterion.id,
          '',
          checkpoint.id,
          '',
          '',
          '',
          criterion.techniqueRefs.map((ref) => ref.name).join('; '),
          '',
          criterion.note,
          criterion.requirement,
          metCell(criterion.met),
          level.name,
          '',
          level.belt,
          '',
          criterion.id,
          '',
        ]));
      }
    }
  }
  for (const goal of packet.goals) {
    lines.push(csvRow([
      'Goal',
      goal.id,
      '',
      packet.studentId,
      '',
      '',
      goal.name,
      '',
      '',
      goal.note,
      '',
      metCell(goal.met),
      '',
      '',
      '',
      '',
      '',
      '',
    ]));
  }
  for (const entry of packet.checklist) {
    lines.push(csvRow([
      'Checklist',
      entry.id,
      '',
      packet.studentId,
      '',
      entry.categoryId,
      entry.name,
      '',
      entry.learnedOn,
      entry.note,
      '',
      '',
      entry.displayName,
      entry.hidden ? 'hidden' : '',
      '',
      '',
      '',
      entry.catalogItemId,
    ]));
  }
  for (const entry of packet.journal) {
    lines.push(csvRow([
      'Journal',
      entry.id,
      entry.date,
      packet.studentId,
      entry.gameTag,
      '',
      '',
      entry.techniqueRefs.map((ref) => ref.name).join('; '),
      '',
      '',
      entry.body,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]));
    for (const amendment of entry.amendments) {
      lines.push(csvRow([
        'Amendment',
        amendment.id,
        amendment.date,
        entry.id,
        entry.gameTag,
        '',
        '',
        '',
        '',
        '',
        amendment.body,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]));
    }
  }
  for (const event of packet.calendar) {
    lines.push(csvRow([
      'Calendar',
      event.id,
      event.date,
      packet.studentId,
      '',
      '',
      event.title,
      '',
      '',
      event.note,
      '',
      '',
      event.title,
      event.kind,
      '',
      '',
      '',
      '',
    ]));
  }
}

function writePlanRows(lines: string[], packet: CoachPlanPacket): void {
  lines.push(csvRow([
    'Coach plan',
    packet.id,
    packet.plan.issuedOn,
    packet.studentId,
    '',
    '',
    packet.plan.title,
    '',
    '',
    packet.plan.note,
    '',
    '',
    packet.plan.title,
    packet.kind,
    '',
    '',
    '',
    '',
  ]));
  for (const focus of packet.plan.focus) {
    lines.push(csvRow([
      'Focus',
      focus.id,
      packet.plan.issuedOn,
      packet.id,
      '',
      '',
      focus.name,
      '',
      '',
      focus.note,
      '',
      '',
      packet.plan.title,
      packet.kind,
      '',
      '',
      focus.criterionId,
      focus.catalogItemId,
    ]));
  }
}

function writeFeedbackRows(lines: string[], packet: CoachFeedbackPacket): void {
  lines.push(csvRow([
    'Coach feedback',
    packet.id,
    packet.feedback.issuedOn,
    packet.studentId,
    '',
    '',
    '',
    '',
    '',
    '',
    packet.feedback.synopsis,
    '',
    '',
    packet.kind,
    '',
    '',
    '',
    packet.feedback.planId,
  ]));
  for (const suggestion of packet.feedback.suggestions) {
    lines.push(csvRow([
      'Suggestion',
      suggestion.id,
      packet.feedback.issuedOn,
      packet.id,
      '',
      '',
      '',
      '',
      '',
      suggestion.note,
      '',
      '',
      '',
      packet.kind,
      '',
      '',
      suggestion.targetId,
      '',
    ]));
  }
}

function metCell(met: boolean | null): string {
  if (met == null) return '';
  return met ? 'yes' : 'no';
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',');
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function carriesStripeKey(value: unknown): boolean {
  return carriesKey(value, (key) => key === 'stripe' || key === 'stripes' || key === 'levelKey');
}

function carriesStudentMark(value: unknown): boolean {
  return carriesKey(value, (key) => key === 'met' || key === 'journal' || key === 'rubric' || key === 'goals');
}

function carriesKey(value: unknown, match: (key: string) => boolean): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (match(key)) return true;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}
