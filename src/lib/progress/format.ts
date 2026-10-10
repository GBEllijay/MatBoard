/**
 * Read, write, and merge Student Edition progress files.
 * JSON text only. The gym Drive folder or email carries the file.
 * Advantage does not host it.
 */

import { asRecord } from '../plainValue.ts';
import {
  CALENDAR_KINDS,
  GAME_TAGS,
  PROGRESS_AMENDMENTS_MAX,
  PROGRESS_BELTS,
  PROGRESS_BODY_MAX,
  PROGRESS_CALENDAR_MAX,
  PROGRESS_CHECKLIST_MAX,
  PROGRESS_CRITERIA_MAX,
  PROGRESS_EXAMPLE_MAX,
  PROGRESS_EXAMPLES_MAX,
  PROGRESS_FOCUS_MAX,
  PROGRESS_ID_MAX,
  PROGRESS_JOURNAL_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_PACKET_KINDS,
  PROGRESS_SCHEMA_VERSION,
  PROGRESS_SYNOPSIS_MAX,
  type Amendment,
  type FundamentalsCatalog,
  type FundamentalsCategory,
  type FundamentalsItem,
  type CalendarEvent,
  type CalendarKind,
  type CoachFeedback,
  type CoachFeedbackNote,
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
  type StudentCriterionMark,
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

/** Shared rubric id. Coach and student files match on this, not on the label. */
export function sharedCriterionId(belt: ProgressBelt, slug: string): string {
  const clean = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `rubric.${belt}.${clean || 'item'}`;
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
    };
    return errors.length ? { ok: false, errors } : { ok: true, value };
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
  mergeJournal(report, incoming, addedJournal, appendedAmendments, conflicts);
  mergeCalendar(report, incoming, conflicts);
  return { report, appendedAmendments, addedJournal, addedChecklist, conflicts };
}

/**
 * A coach plan or feedback file is one snapshot.
 * A newer updatedAt for the same id replaces it. An older file stays aside.
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
  return [profile.id, profile.displayName, profile.gymName, profile.beltLevel.belt, profile.beltLevel.levelKey, profile.startedOn].join('\n');
}

function mergeRubric(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  const byId = new Map(report.rubric.criteria.map((mark) => [mark.criterionId, mark]));
  for (const mark of incoming.rubric.criteria) {
    const current = byId.get(mark.criterionId);
    if (!current) {
      report.rubric.criteria.push(structuredClone(mark));
      continue;
    }
    current.label = preferText(current.label, mark.label, `Rubric ${mark.criterionId} label was kept.`, conflicts);
    current.category = preferText(current.category, mark.category, `Rubric ${mark.criterionId} category was kept.`, conflicts);
    current.note = preferText(current.note, mark.note, `Rubric ${mark.criterionId} note was kept.`, conflicts);
    current.met = preferMet(current.met, mark.met, `Rubric ${mark.criterionId} mark was kept.`, conflicts);
  }
  if (report.rubric.toward !== incoming.rubric.toward && incoming.rubric.toward && report.rubric.toward) {
    conflicts.push('Rubric target on this device was kept.');
  } else if (!report.rubric.toward) {
    report.rubric.toward = incoming.rubric.toward;
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
    current.note = preferText(current.note, entry.note, `Checklist ${entry.id} note was kept.`, conflicts);
    current.learnedOn = preferText(current.learnedOn, entry.learnedOn, `Checklist ${entry.id} date was kept.`, conflicts);
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
    return { id: '', displayName: '', gymName: '', beltLevel: { belt: 'white', levelKey: '' }, startedOn: '' };
  }
  return {
    id: readId(record.id, 'Profile id', errors),
    displayName: readString(record.displayName, 'Display name', PROGRESS_NAME_MAX, errors),
    gymName: readString(record.gymName, 'Gym name', PROGRESS_NAME_MAX, errors),
    beltLevel: readBeltLevel(record.beltLevel, 'Profile belt', errors),
    startedOn: readDate(record.startedOn, 'Start date', errors, false),
  };
}

function readRubric(value: unknown, errors: string[]): StudentRubric {
  const record = asRecord(value);
  if (!record) {
    errors.push('Rubric is missing.');
    return { id: '', beltLevel: { belt: 'white', levelKey: '' }, toward: '', criteria: [] };
  }
  const rows = readList(record.criteria, 'Rubric criteria', PROGRESS_CRITERIA_MAX, errors);
  const criteria = rows.map((row, index) => readMark(row, index, errors));
  uniqueIds(criteria.map((mark) => mark.criterionId), 'Rubric criterion', errors);
  return {
    id: readId(record.id, 'Rubric id', errors),
    beltLevel: readBeltLevel(record.beltLevel, 'Rubric belt', errors),
    toward: readString(record.toward, 'Rubric target', PROGRESS_NAME_MAX, errors),
    criteria,
  };
}

function readMark(value: unknown, index: number, errors: string[]): StudentCriterionMark {
  const record = asRecord(value);
  const label = `Rubric criterion ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { criterionId: '', label: '', category: '', met: null, note: '' };
  }
  return {
    criterionId: readId(record.criterionId, `${label} id`, errors),
    label: readString(record.label, `${label} label`, PROGRESS_NAME_MAX, errors),
    category: readString(record.category, `${label} category`, PROGRESS_NAME_MAX, errors),
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
    return { id: '', catalogItemId: '', categoryId: '', name: '', learnedOn: '', note: '', updatedAt: 0 };
  }
  const catalogItemId = readOptionalId(record.catalogItemId, `${label} catalog id`, errors);
  const categoryId = readOptionalId(record.categoryId, `${label} category id`, errors);
  return {
    id: readId(record.id, `${label} id`, errors),
    catalogItemId,
    categoryId,
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
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

function readCoachFeedback(value: unknown, errors: string[]): CoachFeedback {
  const record = asRecord(value);
  if (!record) {
    errors.push('Coach feedback is missing.');
    return { planId: '', issuedOn: '', synopsis: '', criteria: [] };
  }
  const criteria = readList(record.criteria, 'Coach feedback criteria', PROGRESS_CRITERIA_MAX, errors).map((row, index) =>
    readFeedbackNote(row, index, errors),
  );
  uniqueIds(criteria.map((item) => item.criterionId).filter(Boolean), 'Coach feedback criterion', errors);
  return {
    planId: readOptionalId(record.planId, 'Coach feedback plan id', errors),
    issuedOn: readDate(record.issuedOn, 'Coach feedback date', errors, true),
    synopsis: readString(record.synopsis, 'Coach feedback synopsis', PROGRESS_SYNOPSIS_MAX, errors),
    criteria,
  };
}

function readFeedbackNote(value: unknown, index: number, errors: string[]): CoachFeedbackNote {
  const record = asRecord(value);
  const label = `Coach feedback criterion ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { criterionId: '', note: '', met: null };
  }
  return {
    criterionId: readId(record.criterionId, `${label} id`, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
    met: readMet(record.met, label, errors),
  };
}

function readBeltLevel(value: unknown, label: string, errors: string[]): { belt: ProgressBelt; levelKey: string } {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} is missing.`);
    return { belt: 'white', levelKey: '' };
  }
  return {
    belt: readBelt(record.belt, label, errors),
    levelKey: readString(record.levelKey, `${label} level`, PROGRESS_NAME_MAX, errors),
  };
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
    id: readId(record.id, 'Catalog id', errors),
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
    packet.profile.beltLevel.levelKey,
    '',
    '',
    packet.profile.gymName,
    '',
    packet.profile.beltLevel.belt,
    '',
    '',
    '',
  ]));
  for (const mark of packet.rubric.criteria) {
    lines.push(csvRow([
      'Rubric',
      packet.rubric.id,
      '',
      packet.studentId,
      '',
      mark.category,
      mark.label,
      '',
      '',
      mark.note,
      '',
      metCell(mark.met),
      packet.rubric.toward,
      '',
      packet.rubric.beltLevel.belt,
      packet.rubric.toward,
      mark.criterionId,
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
      '',
      '',
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
  for (const mark of packet.feedback.criteria) {
    lines.push(csvRow([
      'Feedback mark',
      mark.criterionId,
      packet.feedback.issuedOn,
      packet.id,
      '',
      '',
      '',
      '',
      '',
      mark.note,
      '',
      metCell(mark.met),
      '',
      packet.kind,
      '',
      '',
      mark.criterionId,
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
