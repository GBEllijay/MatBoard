/**
 * Read, write, and merge Student Edition progress files.
 * JSON text only. The gym Drive folder or email carries the file.
 * Advantage does not host it.
 */

import { mergeBeltBooks, readBeltBook } from '../beltBook.ts';
import { splitCombinedDivision } from '../divisionFields.ts';
import { fundamentalLevelOf, isFundamentalLevel } from '../fundamentals.ts';
import { highDatesForCount } from '../blackBeltDegrees.ts';
import { expandLineage, stripeDateText } from '../studentRank.ts';
import { asRecord } from '../plainValue.ts';
import { canonicalFundamentalsCatalogId } from './catalog.ts';
import { emptyCompetition, seedGamesFromJournal } from './competition.ts';
import {
  CALENDAR_KINDS,
  CALENDAR_REPEATS,
  GAME_TAGS,
  PROGRESS_AMENDMENTS_MAX,
  PROGRESS_BELTS,
  PROGRESS_BODY_MAX,
  PROGRESS_CALENDAR_MAX,
  LICENSE_SOURCES,
  PROGRESS_CHECKLIST_MAX,
  PROGRESS_CLIP_URL_MAX,
  PROGRESS_CLIPS_MAX,
  PROGRESS_CHECKPOINTS_MAX,
  PROGRESS_CRITERIA_MAX,
  PROGRESS_EXAMPLE_MAX,
  PROGRESS_EXAMPLES_MAX,
  PROGRESS_FOCUS_MAX,
  PROGRESS_GOALS_MAX,
  PROGRESS_ID_MAX,
  PROGRESS_JOURNAL_MAX,
  PROGRESS_LEVELS_MAX,
  RANK_EXPORT_BUDGET,
  RANK_PHOTO_MAX_CHARS,
  MATCH_METHODS,
  MATCH_RESULTS,
  PROGRESS_BRACKET_NOTES_MAX,
  PROGRESS_MATCHES_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_RANK_HISTORY_MAX,
  PROGRESS_RESULTS_MAX,
  PROGRESS_PACKET_KINDS,
  BLACK_DEGREE_MAX,
  FINAL_RANK_BELTS,
  RANK_BELTS,
  RANK_TAPE_MAX,
  PROGRESS_SCHEMA_VERSION,
  PROGRESS_SCHEMA_VERSIONS,
  PROGRESS_SEQUENCE_MAX,
  PROGRESS_SYNOPSIS_MAX,
  PROGRESS_TOURNAMENT_GOALS_MAX,
  PROGRESS_TOURNAMENTS_MAX,
  PROGRESS_WEIGH_INS_MAX,
  PROGRESS_WEIGHT_MAX,
  TOURNAMENT_STATUSES,
  WEIGHT_UNITS,
  type Amendment,
  type CoachSuggestion,
  type BracketNote,
  type CompetitionGame,
  type CompetitionGames,
  type CompetitionMatch,
  type CompetitionResult,
  type MatchMethod,
  type MatchResult,
  type FundamentalsCatalog,
  type FundamentalsCategory,
  type FundamentalsItem,
  type LicenseSource,
  type RubricCheckpoint,
  type RubricCriterion,
  type RubricLevel,
  type CalendarEvent,
  type CalendarKind,
  type CalendarRepeat,
  type CoachFeedback,
  type CoachFeedbackPacket,
  type CoachPlan,
  type CoachPlanFocus,
  type CoachPlanPacket,
  type GameTag,
  type JournalClip,
  type JournalEntry,
  type ProgressBelt,
  type ProgressMerge,
  type HighDegreeDates,
  type RankBelt,
  type RankHistory,
  type RankPicture,
  type RankTapeDates,
  type ProgressPacket,
  type ProgressParse,
  type StudentChecklistEntry,
  type StudentCompetition,
  type StudentGoal,
  type StudentProfile,
  type StudentProgressReport,
  type StudentRank,
  type StudentRubric,
  type StudentTournament,
  type TechniqueRef,
  type TournamentGoal,
  type TournamentStatus,
  type WeighIn,
  type WeightUnit,
} from './types.ts';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BYTE_KEY = /blob|bytes|dataurl|base64|filebody|arraybuffer/i;

function supportedSchema(value: unknown): boolean {
  return typeof value === 'number' && (PROGRESS_SCHEMA_VERSIONS as readonly number[]).includes(value);
}

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
  'Proficiency',
  'Weight class',
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
  const ready = packet.kind === 'student-progress-report' ? fitRankPictures(packet) : packet;
  if (packetCarriesBytes(ready)) throw new Error('A progress file cannot carry photos or videos.');
  return JSON.stringify(ready);
}

/**
 * Keep promotion photos that fit in the export budget.
 * Photos past the budget stay off the file, and pictureNote says how many.
 */
export function fitRankPictures(report: StudentProgressReport): StudentProgressReport {
  if (!report.rank) return report;
  const incoming = report.rank.pictures ?? [];
  if (!incoming.length) return report;
  const kept: RankPicture[] = [];
  let used = 0;
  let skipped = 0;
  for (const picture of incoming) {
    if (rankImageFits(picture.image) && used + picture.image.length <= RANK_EXPORT_BUDGET) {
      kept.push({ ...picture });
      used += picture.image.length;
      continue;
    }
    skipped += 1;
  }
  const rank: StudentRank = { ...report.rank };
  if (kept.length) {
    rank.pictures = kept;
    rank.pictureCount = kept.length;
  } else {
    delete rank.pictures;
    delete rank.pictureCount;
  }
  if (skipped) {
    rank.pictureNote = `${skipped} promotion ${skipped === 1 ? 'photo' : 'photos'} stayed on this phone.`;
  }
  return { ...report, rank };
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

/** Version 1 and version 2 both import. Anything else is left unread. */
export function parseProgressValue(raw: unknown): ProgressParse {
  const errors: string[] = [];
  if (packetCarriesBytes(raw)) errors.push('A progress file cannot carry photos or videos.');
  if (carriesStripeKey(raw)) errors.push('Belt progress uses checkpoints between levels.');
  const record = asRecord(raw);
  if (!record) return { ok: false, errors: ['A progress file must be a JSON object.'] };
  if (!supportedSchema(record.schemaVersion)) {
    const seen = record.schemaVersion == null ? 'missing' : String(record.schemaVersion);
    errors.push(
      `schemaVersion ${seen} is not supported. This build reads version ${PROGRESS_SCHEMA_VERSIONS.join(' and version ')}.`,
    );
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
    const clips = readClips(record.clips, errors);
    if (clips) value.clips = clips;
    value.competition = readCompetition(record, value.journal, errors);
    const rank = readRank(record.rank, value.profile.belt, errors);
    if (rank) value.rank = rank;
    const beltBook = readBeltBook(record.beltBook);
    errors.push(...beltBook.errors);
    if (beltBook.book) value.beltBook = beltBook.book;
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
  mergeClips(report, incoming, conflicts);
  mergeCompetition(report, incoming, conflicts);
  mergeRank(report, incoming, conflicts);
  const beltBook = mergeBeltBooks(report.beltBook, incoming.beltBook);
  if (beltBook.book) report.beltBook = beltBook.book;
  conflicts.push(...beltBook.conflicts);
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

/** Case-insensitive match on a clip description and its URL. */
export function searchJournalClips(clips: readonly JournalClip[], query: string): JournalClip[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...clips];
  return clips.filter((clip) => `${clip.description}\n${clip.note}\n${clip.url}`.toLowerCase().includes(needle));
}

export function exportProgressCsv(packet: ProgressPacket): string {
  const lines = [PROGRESS_CSV_HEADERS.join(',')];
  if (packet.kind === 'student-progress-report') writeReportRows(lines, packet);
  if (packet.kind === 'coach-plan') writePlanRows(lines, packet);
  if (packet.kind === 'coach-feedback') writeFeedbackRows(lines, packet);
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function packetCarriesBytes(value: unknown): boolean {
  const stack: { value: unknown; path: string[] }[] = [{ value, path: [] }];
  const seen = new Set<object>();
  while (stack.length) {
    const frame = stack.pop();
    if (!frame) continue;
    const current = frame.value;
    if (!current || typeof current !== 'object') continue;
    if (current instanceof Uint8Array || current instanceof ArrayBuffer) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (BYTE_KEY.test(key)) return true;
      if (typeof child === 'string' && child.startsWith('data:')) {
        if (allowsRankImage(frame.path, key, child)) continue;
        return true;
      }
      if (child && typeof child === 'object') stack.push({ value: child, path: [...frame.path, key] });
    }
  }
  return false;
}

function allowsRankImage(path: readonly string[], key: string, value: string): boolean {
  if (key !== 'image') return false;
  if (!path.includes('rank') || !path.includes('pictures')) return false;
  return rankImageFits(value);
}

function rankImageFits(value: string): boolean {
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value) && value.length <= RANK_PHOTO_MAX_CHARS;
}

/** Label on a journal technique row, the saved card, and search. */
export function techniqueDrilledLabel(index: number): string {
  return `Technique drilled #${index + 1}`;
}

function journalHaystack(entry: JournalEntry): string {
  const drilled = entry.techniqueRefs
    .filter((item) => item.name.trim())
    .map((item, index) => `${techniqueDrilledLabel(index)}: ${item.name}`);
  return [entry.body, ...drilled, ...entry.amendments.map((item) => item.body), ...entry.techniqueRefs.map((item) => item.name)]
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
    if (entry.level > current.level) current.level = entry.level;
    else if (entry.level < current.level) conflicts.push(`Checklist ${entry.id} proficiency was kept.`);
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

function mergeClips(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  if (!incoming.clips) return;
  if (!report.clips) {
    report.clips = incoming.clips.map((clip) => structuredClone(clip));
    return;
  }
  const byId = new Map(report.clips.map((clip) => [clip.id, clip]));
  for (const clip of incoming.clips) {
    const current = byId.get(clip.id);
    if (!current) {
      const added = structuredClone(clip);
      report.clips.push(added);
      byId.set(clip.id, added);
      continue;
    }
    current.url = preferText(current.url, clip.url, `Clip ${clip.id} link was kept.`, conflicts);
    current.description = preferText(
      current.description,
      clip.description,
      `Clip ${clip.id} note was kept.`,
      conflicts,
    );
    current.note = preferText(current.note ?? '', clip.note ?? '', `Clip ${clip.id} text was kept.`, conflicts);
    current.updatedAt = Math.max(current.updatedAt, clip.updatedAt);
  }
}

function mergeRank(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  if (!incoming.rank) return;
  if (!report.rank) {
    report.rank = stripRankPictures(structuredClone(incoming.rank));
    return;
  }
  const local = report.rank;
  const next = incoming.rank;
  local.lineage = mergeLineage(local.lineage, next.lineage, conflicts);
  if (!local.pictureNote && next.pictureNote) local.pictureNote = next.pictureNote;
  delete local.pictures;
  local.awardedOn = preferText(local.awardedOn, next.awardedOn, 'Rank date was kept.', conflicts);
  if (local.tapeCount !== next.tapeCount) {
    if (local.tapeCount === 0 && next.tapeCount > 0) local.tapeCount = next.tapeCount;
    else conflicts.push('Rank tape count was kept.');
  }
  for (let index = 0; index < local.tapeCount; index += 1) {
    local.tapeDates[index] = preferText(
      local.tapeDates[index] ?? '',
      next.tapeDates[index] ?? '',
      `Rank tape ${index + 1} date was kept.`,
      conflicts,
    );
  }
  for (let index = local.tapeCount; index < RANK_TAPE_MAX; index += 1) local.tapeDates[index] = '';
  const byId = new Map(local.history.map((row) => [row.id, row]));
  for (const row of next.history) {
    const current = byId.get(row.id);
    if (!current) {
      local.history.push(structuredClone(row));
      continue;
    }
    if (current.belt !== row.belt) conflicts.push(`Rank history ${row.id} belt was kept.`);
    current.awardedOn = preferText(current.awardedOn, row.awardedOn, `Rank history ${row.id} date was kept.`, conflicts);
    if (current.tapeCount !== row.tapeCount) {
      if (current.tapeCount === 0 && row.tapeCount > 0) current.tapeCount = row.tapeCount;
      else conflicts.push(`Rank history ${row.id} tape count was kept.`);
    }
    for (let index = 0; index < current.tapeCount; index += 1) {
      current.tapeDates[index] = preferText(
        current.tapeDates[index] ?? '',
        row.tapeDates[index] ?? '',
        `Rank history ${row.id} tape ${index + 1} date was kept.`,
        conflicts,
      );
    }
    for (let index = current.tapeCount; index < RANK_TAPE_MAX; index += 1) current.tapeDates[index] = '';
  }
}

function mergeLineage(local: string[] | undefined, incoming: string[] | undefined, conflicts: string[]): string[] | undefined {
  const kept = (local ?? []).map((line) => line.trim()).filter(Boolean);
  const next = (incoming ?? []).map((line) => line.trim()).filter(Boolean);
  if (!kept.length && next.length) return next;
  if (kept.length && next.length && kept.join('\n') !== next.join('\n')) conflicts.push('Lineage was kept.');
  return local;
}

function stripRankPictures(rank: StudentRank): StudentRank {
  if (!rank.pictures) return rank;
  const next = { ...rank };
  delete next.pictures;
  return next;
}

function mergeCompetition(report: StudentProgressReport, incoming: StudentProgressReport, conflicts: string[]): void {
  if (!incoming.competition) return;
  if (!report.competition) {
    report.competition = structuredClone(incoming.competition);
    return;
  }
  const local = report.competition;
  const next = incoming.competition;
  for (const tag of GAME_TAGS) {
    local.games[tag].techniques = preferText(
      local.games[tag].techniques,
      next.games[tag].techniques,
      `${tag.toUpperCase()} game techniques were kept.`,
      conflicts,
    );
    local.games[tag].notes = preferText(
      local.games[tag].notes,
      next.games[tag].notes,
      `${tag.toUpperCase()} game notes were kept.`,
      conflicts,
    );
  }
  const byId = new Map(local.tournaments.map((tournament) => [tournament.id, tournament]));
  for (const tournament of next.tournaments) {
    const current = byId.get(tournament.id);
    if (!current) {
      local.tournaments.push(structuredClone(tournament));
      continue;
    }
    current.name = preferText(current.name, tournament.name, `Tournament ${tournament.id} name was kept.`, conflicts);
    current.location = preferText(
      current.location,
      tournament.location,
      `Tournament ${tournament.id} location was kept.`,
      conflicts,
    );
    current.division = preferText(
      current.division,
      tournament.division,
      `Tournament ${tournament.id} division was kept.`,
      conflicts,
    );
    current.weightClass = preferText(
      current.weightClass ?? '',
      tournament.weightClass ?? '',
      `Tournament ${tournament.id} weight class was kept.`,
      conflicts,
    );
    current.link = preferText(current.link, tournament.link, `Tournament ${tournament.id} link was kept.`, conflicts);
    current.deadline = preferText(
      current.deadline,
      tournament.deadline,
      `Tournament ${tournament.id} deadline was kept.`,
      conflicts,
    );
    if (current.date !== tournament.date) conflicts.push(`Tournament ${tournament.id} date was kept.`);
    if (current.status !== tournament.status) conflicts.push(`Tournament ${tournament.id} status was kept.`);
    current.targetWeight = preferWeight(
      current.targetWeight,
      tournament.targetWeight,
      `Tournament ${tournament.id} target weight was kept.`,
      conflicts,
    );
    if (current.targetWeight != null && tournament.targetWeight != null && current.targetUnit !== tournament.targetUnit) {
      conflicts.push(`Tournament ${tournament.id} target unit was kept.`);
    } else if (current.targetWeight == null && tournament.targetWeight != null) {
      current.targetUnit = tournament.targetUnit;
    }
    mergeTournamentGoals(current, tournament, conflicts);
  }
  const weighById = new Map(local.weighIns.map((row) => [row.id, row]));
  for (const weighIn of next.weighIns) {
    const current = weighById.get(weighIn.id);
    if (!current) {
      local.weighIns.push(structuredClone(weighIn));
      continue;
    }
    if (current.date !== weighIn.date || current.weight !== weighIn.weight || current.unit !== weighIn.unit) {
      conflicts.push(`Weigh-in ${weighIn.id} was kept.`);
    }
    current.note = preferText(current.note, weighIn.note, `Weigh-in ${weighIn.id} note was kept.`, conflicts);
  }
  const previousGoal = local.goalWeight ?? null;
  local.goalWeight = preferWeight(previousGoal, next.goalWeight ?? null, 'Goal weight was kept.', conflicts);
  if (previousGoal != null && (next.goalWeight ?? null) != null && (local.goalUnit ?? 'lb') !== (next.goalUnit ?? 'lb')) {
    conflicts.push('Goal weight unit was kept.');
  } else if (previousGoal == null && (next.goalWeight ?? null) != null) {
    local.goalUnit = next.goalUnit === 'kg' ? 'kg' : 'lb';
  }
  local.weighDate = preferText(local.weighDate ?? '', next.weighDate ?? '', 'Weigh-in date was kept.', conflicts);
  const resultById = new Map(local.results.map((result) => [result.id, result]));
  for (const result of next.results) {
    const current = resultById.get(result.id);
    if (!current) {
      local.results.push(structuredClone(result));
      continue;
    }
    current.tournamentName = preferText(
      current.tournamentName,
      result.tournamentName,
      `Result ${result.id} tournament was kept.`,
      conflicts,
    );
    current.division = preferText(current.division, result.division, `Result ${result.id} division was kept.`, conflicts);
    if (current.tournamentId !== result.tournamentId) conflicts.push(`Result ${result.id} tournament link was kept.`);
    if (current.bracketPhoto !== result.bracketPhoto && !current.bracketPhoto && result.bracketPhoto) {
      current.bracketPhoto = true;
    }
    mergeMatches(current, result, conflicts);
    mergeBracket(current, result, conflicts);
  }
}

function mergeMatches(local: CompetitionResult, incoming: CompetitionResult, conflicts: string[]): void {
  const byId = new Map(local.matches.map((match) => [match.id, match]));
  for (const match of incoming.matches) {
    const current = byId.get(match.id);
    if (!current) {
      local.matches.push(structuredClone(match));
      continue;
    }
    current.opponent = preferText(current.opponent, match.opponent, `Match ${match.id} opponent was kept.`, conflicts);
    current.note = preferText(current.note, match.note, `Match ${match.id} note was kept.`, conflicts);
    if (current.result !== match.result) conflicts.push(`Match ${match.id} result was kept.`);
    if (current.method !== match.method) conflicts.push(`Match ${match.id} method was kept.`);
    if (!current.date && match.date) current.date = match.date;
    else if (current.date && match.date && current.date !== match.date) conflicts.push(`Match ${match.id} date was kept.`);
  }
}

function mergeBracket(local: CompetitionResult, incoming: CompetitionResult, conflicts: string[]): void {
  const byId = new Map(local.bracket.map((note) => [note.id, note]));
  for (const note of incoming.bracket) {
    const current = byId.get(note.id);
    if (!current) {
      local.bracket.push(structuredClone(note));
      continue;
    }
    current.round = preferText(current.round, note.round, `Bracket ${note.id} round was kept.`, conflicts);
    current.name = preferText(current.name, note.name, `Bracket ${note.id} name was kept.`, conflicts);
  }
}

function mergeTournamentGoals(local: StudentTournament, incoming: StudentTournament, conflicts: string[]): void {
  const byId = new Map(local.goals.map((goal) => [goal.id, goal]));
  for (const goal of incoming.goals) {
    const current = byId.get(goal.id);
    if (!current) {
      local.goals.push(structuredClone(goal));
      continue;
    }
    current.name = preferText(current.name, goal.name, `Tournament goal ${goal.id} name was kept.`, conflicts);
    current.note = preferText(current.note, goal.note, `Tournament goal ${goal.id} note was kept.`, conflicts);
    current.met = preferMet(current.met, goal.met, `Tournament goal ${goal.id} mark was kept.`, conflicts);
  }
}

function preferWeight(local: number | null, incoming: number | null, conflict: string, conflicts: string[]): number | null {
  if (local == null && incoming != null) return incoming;
  if (local != null && incoming != null && local !== incoming) conflicts.push(conflict);
  return local;
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
    if (!current.time && event.time) current.time = event.time;
    else if (current.time && event.time && current.time !== event.time) conflicts.push(`Calendar ${event.id} time was kept.`);
    if (!current.repeat && event.repeat) current.repeat = event.repeat;
    else if (current.repeat && event.repeat && current.repeat !== event.repeat) {
      conflicts.push(`Calendar ${event.id} repeat was kept.`);
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
      level: 0,
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
    level: readFundamentalLevel(record.level, record.learnedOn, `${label} proficiency`, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
    updatedAt: readTime(record.updatedAt, `${label} updatedAt`, errors),
  };
}

function readClips(value: unknown, errors: string[]): JournalClip[] | undefined {
  if (value == null) return undefined;
  const rows = readList(value, 'Clips', PROGRESS_CLIPS_MAX, errors);
  const clips = rows.map((row, index) => readClip(row, index, errors));
  uniqueIds(clips.map((clip) => clip.id), 'Clip', errors);
  return clips;
}

function readRank(value: unknown, belt: ProgressBelt, errors: string[]): StudentRank | undefined {
  if (value == null) return undefined;
  const record = asRecord(value);
  if (!record) {
    errors.push('Rank must be an object.');
    return undefined;
  }
  const max = belt === 'black' ? BLACK_DEGREE_MAX : RANK_TAPE_MAX;
  const tapeCount = readTapeCount(record.tapeCount, 'Rank tape count', errors, max);
  const tapeDates = readTapeDates(record.tapeDates, 'Rank tape dates', errors, max);
  const rank: StudentRank = {
    tapeCount,
    awardedOn: readDate(record.awardedOn, 'Rank awarded on', errors, false),
    tapeDates: maskTapeDates(tapeDates.dates, tapeCount),
    history: readRankHistory(record.history, errors),
  };
  const high = highDatesForCount(readOptionalHigh(record.highDegreeDates, 'Rank degree dates', errors) ?? tapeDates.extra, tapeCount);
  if (high) rank.highDegreeDates = high;
  readInstructor(record, rank, errors, 'Rank');
  if (Object.prototype.hasOwnProperty.call(record, 'lineage')) rank.lineage = readLineage(record.lineage, errors);
  if (typeof record.pictureNote === 'string') {
    rank.pictureNote = readString(record.pictureNote, 'Rank photo note', PROGRESS_NOTE_MAX, errors);
  }
  if (typeof record.pictureCount === 'number' && Number.isInteger(record.pictureCount) && record.pictureCount >= 0) {
    rank.pictureCount = record.pictureCount;
  }
  const pictures = readRankPictures(record.pictures, errors);
  if (pictures.length) {
    const fitted = fitRankPictures({ ...blankPictureReport(), rank: { ...rank, pictures } });
    if (fitted.rank?.pictures) rank.pictures = fitted.rank.pictures;
    if (fitted.rank?.pictureNote) rank.pictureNote = fitted.rank.pictureNote;
    if (fitted.rank?.pictureCount) rank.pictureCount = fitted.rank.pictureCount;
  }
  return rank;
}

function blankPictureReport(): StudentProgressReport {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'student-progress-report',
    id: 'rank-photos',
    studentId: 'rank-photos',
    updatedAt: 0,
    profile: { id: 'rank-photos', displayName: '', gymName: '', belt: 'white', startedOn: '', licenseSource: '' },
    rubric: { id: 'rank-photos', levels: [] },
    checklist: [],
    journal: [],
    calendar: [],
    goals: [],
  };
}

function readLineage(value: unknown, errors: string[]): string[] {
  if (typeof value === 'string') return expandLineage([value]);
  if (!Array.isArray(value)) {
    if (value != null) errors.push('Lineage must be a list.');
    return [];
  }
  const pieces: string[] = [];
  value.forEach((row, index) => {
    if (typeof row !== 'string') {
      errors.push(`Lineage ${index + 1} must be text.`);
      return;
    }
    pieces.push(row);
  });
  return expandLineage(pieces);
}

function readRankPictures(value: unknown, errors: string[]): RankPicture[] {
  if (value == null) return [];
  const rows = readList(value, 'Rank photos', 80, errors);
  const pictures: RankPicture[] = [];
  rows.forEach((row, index) => {
    const picture = readRankPicture(row, index, errors);
    if (picture) pictures.push(picture);
  });
  return pictures;
}

function readRankPicture(value: unknown, index: number, errors: string[]): RankPicture | null {
  const record = asRecord(value);
  const label = `Rank photo ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return null;
  }
  const image = typeof record.image === 'string' ? record.image : '';
  if (!rankImageFits(image)) {
    errors.push(`${label} must be a compressed image.`);
    return null;
  }
  const pictureBelt = readRankBelt(record.belt, `${label} belt`, errors);
  const picture: RankPicture = { belt: pictureBelt, image };
  if (record.tapeIndex != null && record.tapeIndex !== '') {
    const tapeMax = pictureBelt === 'black' ? BLACK_DEGREE_MAX : RANK_TAPE_MAX;
    const tapeIndex = readTapeCount(record.tapeIndex, `${label} tape`, errors, tapeMax);
    if (tapeIndex >= tapeMax) errors.push(pictureBelt === 'black' ? `${label} tape must be 0 to 5.` : `${label} tape must be 0 to 3.`);
    else picture.tapeIndex = tapeIndex;
  }
  return picture;
}

function readRankHistory(value: unknown, errors: string[]): RankHistory[] {
  const rows = readList(value, 'Rank history', PROGRESS_RANK_HISTORY_MAX, errors);
  const history = rows.map((row, index) => readRankHistoryRow(row, index, errors));
  uniqueIds(history.map((row) => row.id), 'Rank history', errors);
  return history;
}

function readRankHistoryRow(value: unknown, index: number, errors: string[]): RankHistory {
  const record = asRecord(value);
  const label = `Rank history ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', belt: 'white', awardedOn: '', tapeCount: 0, tapeDates: blankTapeDates() };
  }
  const belt = readRankBelt(record.belt, `${label} belt`, errors);
  const max = belt === 'black' ? BLACK_DEGREE_MAX : RANK_TAPE_MAX;
  const tapeCount = readTapeCount(record.tapeCount, `${label} tape count`, errors, max);
  const tapeDates = readTapeDates(record.tapeDates, `${label} tape dates`, errors, max);
  const row: RankHistory = {
    id: readId(record.id, `${label} id`, errors),
    belt,
    awardedOn: readDate(record.awardedOn, `${label} date`, errors, false),
    tapeCount,
    tapeDates: maskTapeDates(tapeDates.dates, tapeCount),
  };
  const high = highDatesForCount(readOptionalHigh(record.highDegreeDates, `${label} degree dates`, errors) ?? tapeDates.extra, tapeCount);
  if (belt === 'black' && high) row.highDegreeDates = high;
  readInstructor(record, row, errors, label);
  return row;
}

function readRankBelt(value: unknown, label: string, errors: string[]): RankBelt {
  if (typeof value === 'string' && ((RANK_BELTS as readonly string[]).includes(value) || (FINAL_RANK_BELTS as readonly string[]).includes(value))) {
    return value as RankBelt;
  }
  errors.push(`${label} must be white, blue, purple, brown, or black.`);
  return 'white';
}

function readTapeCount(value: unknown, label: string, errors: string[], max = RANK_TAPE_MAX): number {
  if (value == null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    errors.push(`${label} must be a whole number from 0 to ${max}.`);
    return 0;
  }
  return value;
}

function readTapeDates(
  value: unknown,
  label: string,
  errors: string[],
  max = RANK_TAPE_MAX,
): { dates: RankTapeDates; extra?: HighDegreeDates } {
  const dates = blankTapeDates();
  if (value == null) return { dates };
  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list.`);
    return { dates };
  }
  if (value.length > max) errors.push(max === RANK_TAPE_MAX ? `${label} has more than 4 dates.` : `${label} has more than ${max} dates.`);
  for (let index = 0; index < Math.min(value.length, RANK_TAPE_MAX); index += 1) {
    dates[index] = readOptionalStripeDate(value[index]);
  }
  if (max <= RANK_TAPE_MAX || value.length <= RANK_TAPE_MAX) return { dates };
  const extra: HighDegreeDates = ['', ''];
  for (let index = 0; index < Math.min(2, value.length - RANK_TAPE_MAX); index += 1) {
    extra[index] = readOptionalStripeDate(value[RANK_TAPE_MAX + index]);
  }
  return { dates, extra };
}

function readOptionalHigh(value: unknown, label: string, errors: string[]): HighDegreeDates | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list.`);
    return undefined;
  }
  if (value.length > 2) errors.push(`${label} has more than 2 dates.`);
  const dates: HighDegreeDates = ['', ''];
  for (let index = 0; index < Math.min(2, value.length); index += 1) dates[index] = readOptionalStripeDate(value[index]);
  return dates;
}

function readInstructor(
  record: Record<string, unknown>,
  target: { instructorBars?: boolean; instructorBarsOn?: string },
  errors: string[],
  label: string,
): void {
  if (record.instructorBars === true) target.instructorBars = true;
  else if (record.instructorBars != null && record.instructorBars !== false) {
    errors.push(`${label} instructor bars must be true or false.`);
  }
  if (record.instructorBarsOn == null || record.instructorBarsOn === '') return;
  const date = readDate(record.instructorBarsOn, `${label} instructor bars date`, errors, false);
  if (date) target.instructorBarsOn = date;
}

/** A stripe date is optional. Blank, missing, or unreadable values stay empty and still count. */
function readOptionalStripeDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !DATE_RE.test(value) || !realDay(value)) return '';
  return value;
}

function blankTapeDates(): RankTapeDates {
  return ['', '', '', ''];
}

function maskTapeDates(dates: RankTapeDates, tapeCount: number): RankTapeDates {
  const next = blankTapeDates();
  const kept = Math.min(tapeCount, RANK_TAPE_MAX);
  for (let index = 0; index < kept; index += 1) next[index] = dates[index] ?? '';
  return next;
}

function readClip(value: unknown, index: number, errors: string[]): JournalClip {
  const record = asRecord(value);
  const label = `Clip ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', url: '', description: '', note: '', createdAt: 0, updatedAt: 0 };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    url: readHttpUrl(record.url, `${label} link`, errors),
    description: readString(record.description, `${label} note`, PROGRESS_NOTE_MAX, errors),
    note: readString(record.note, `${label} text`, PROGRESS_NOTE_MAX, errors),
    createdAt: readTime(record.createdAt, `${label} createdAt`, errors),
    updatedAt: readTime(record.updatedAt, `${label} updatedAt`, errors),
  };
}

function readHttpUrl(value: unknown, label: string, errors: string[]): string {
  const text = readString(value, label, PROGRESS_CLIP_URL_MAX, errors).trim();
  if (!text) {
    errors.push(`${label} needs an http or https link.`);
    return '';
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    errors.push(`${label} must be an http or https link.`);
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push(`${label} must be an http or https link.`);
    return '';
  }
  return text;
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
  const event: CalendarEvent = {
    id: readId(record.id, `${label} id`, errors),
    date: readDate(record.date, `${label} date`, errors, true),
    title: readString(record.title, `${label} title`, PROGRESS_NAME_MAX, errors),
    kind: readCalendarKind(record.kind, label, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
  const time = readOptionalClock(record.time);
  const repeat = readOptionalRepeat(record.repeat);
  if (time) event.time = time;
  if (repeat) event.repeat = repeat;
  return event;
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

function readCompetition(
  record: Record<string, unknown>,
  journal: JournalEntry[],
  errors: string[],
): StudentCompetition {
  if (!Object.prototype.hasOwnProperty.call(record, 'competition') || record.competition == null) {
    return { ...emptyCompetition(), games: seedGamesFromJournal(journal) };
  }
  const competition = asRecord(record.competition);
  if (!competition) {
    errors.push('Competition must be an object.');
    return emptyCompetition();
  }
  const tournaments = readTournaments(competition.tournaments, errors);
  const weighIns = readWeighIns(competition.weighIns, errors);
  const results = readResults(competition.results, errors);
  return {
    games: readGames(competition.games, errors),
    tournaments,
    weighIns,
    results,
    weightUnit: readWeightUnit(competition.weightUnit, 'Weight unit', errors),
    goalWeight: readOptionalWeight(competition.goalWeight, 'Goal weight', errors),
    goalUnit: readWeightUnit(competition.goalUnit, 'Goal weight unit', errors),
    weighDate: readDate(competition.weighDate, 'Competition weigh-in date', errors, false),
  };
}

function readGames(value: unknown, errors: string[]): CompetitionGames {
  const record = asRecord(value);
  if (value != null && !record) errors.push('Competition games must be an object.');
  return {
    a: readGame(record?.a, 'A game', errors),
    b: readGame(record?.b, 'B game', errors),
    c: readGame(record?.c, 'C game', errors),
  };
}

function readGame(value: unknown, label: string, errors: string[]): CompetitionGame {
  const record = asRecord(value);
  if (value != null && !record) {
    errors.push(`${label} must be an object.`);
    return { techniques: '', notes: '' };
  }
  return {
    techniques: readString(record?.techniques, `${label} techniques`, PROGRESS_SEQUENCE_MAX, errors),
    notes: readString(record?.notes, `${label} notes`, PROGRESS_NOTE_MAX, errors),
  };
}

function readTournaments(value: unknown, errors: string[]): StudentTournament[] {
  const rows = readList(value, 'Tournaments', PROGRESS_TOURNAMENTS_MAX, errors);
  const tournaments = rows.map((row, index) => readTournament(row, index, errors));
  uniqueIds(tournaments.map((tournament) => tournament.id), 'Tournament', errors);
  uniqueIds(
    tournaments.flatMap((tournament) => tournament.goals.map((goal) => goal.id)),
    'Tournament goal',
    errors,
  );
  return tournaments;
}

function readTournament(value: unknown, index: number, errors: string[]): StudentTournament {
  const record = asRecord(value);
  const label = `Tournament ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return {
      id: '',
      name: '',
      date: '',
      location: '',
      division: '',
      weightClass: '',
      deadline: '',
      link: '',
      status: 'considering',
      targetWeight: null,
      targetUnit: 'lb',
      goals: [],
    };
  }
  const divisionText = readString(record.division, `${label} division`, PROGRESS_NAME_MAX, errors);
  const legacyDivision = !Object.prototype.hasOwnProperty.call(record, 'weightClass');
  const separated = legacyDivision
    ? splitCombinedDivision(divisionText)
    : { division: divisionText, weightClass: readString(record.weightClass, `${label} weight class`, PROGRESS_NAME_MAX, errors) };
  return {
    id: readId(record.id, `${label} id`, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
    date: readDate(record.date, `${label} date`, errors, true),
    location: readString(record.location, `${label} location`, PROGRESS_NOTE_MAX, errors),
    division: separated.division,
    weightClass: separated.weightClass,
    deadline: readDate(record.deadline, `${label} deadline`, errors, false),
    link: readOptionalHttpUrl(record.link, `${label} link`, errors),
    status: readTournamentStatus(record.status, label, errors),
    targetWeight: readOptionalWeight(record.targetWeight, `${label} target weight`, errors),
    targetUnit: readWeightUnit(record.targetUnit, `${label} target unit`, errors),
    goals: readTournamentGoals(record.goals, label, errors),
  };
}

function readTournamentGoals(value: unknown, label: string, errors: string[]): TournamentGoal[] {
  const rows = readList(value, `${label} goals`, PROGRESS_TOURNAMENT_GOALS_MAX, errors);
  return rows.map((row, index) => readTournamentGoal(row, `${label} goal ${index + 1}`, errors));
}

function readTournamentGoal(value: unknown, label: string, errors: string[]): TournamentGoal {
  const record = asRecord(value);
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

function readWeighIns(value: unknown, errors: string[]): WeighIn[] {
  const rows = readList(value, 'Weigh-ins', PROGRESS_WEIGH_INS_MAX, errors);
  const weighIns = rows.map((row, index) => readWeighIn(row, index, errors));
  uniqueIds(weighIns.map((row) => row.id), 'Weigh-in', errors);
  return weighIns;
}

function readWeighIn(value: unknown, index: number, errors: string[]): WeighIn {
  const record = asRecord(value);
  const label = `Weigh-in ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', date: '', weight: 0, unit: 'lb', note: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    date: readDate(record.date, `${label} date`, errors, true),
    weight: readRequiredWeight(record.weight, `${label} weight`, errors),
    unit: readWeightUnit(record.unit, `${label} unit`, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
}

function readResults(value: unknown, errors: string[]): CompetitionResult[] {
  const rows = readList(value, 'Results', PROGRESS_RESULTS_MAX, errors);
  const results = rows.map((row, index) => readResult(row, index, errors));
  uniqueIds(results.map((result) => result.id), 'Result', errors);
  uniqueIds(
    results.flatMap((result) => result.matches.map((match) => match.id)),
    'Match',
    errors,
  );
  uniqueIds(
    results.flatMap((result) => result.bracket.map((note) => note.id)),
    'Bracket note',
    errors,
  );
  return results;
}

function readResult(value: unknown, index: number, errors: string[]): CompetitionResult {
  const record = asRecord(value);
  const label = `Result ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', tournamentId: '', tournamentName: '', division: '', matches: [], bracket: [], bracketPhoto: false };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    tournamentId: readOptionalId(record.tournamentId, `${label} tournament id`, errors),
    tournamentName: readString(record.tournamentName, `${label} tournament`, PROGRESS_NAME_MAX, errors),
    division: readString(record.division, `${label} division`, PROGRESS_NAME_MAX, errors),
    matches: readMatches(record.matches, label, errors),
    bracket: readBracket(record.bracket, label, errors),
    bracketPhoto: readFlag(record.bracketPhoto, `${label} bracket photo`, errors),
  };
}

function readMatches(value: unknown, label: string, errors: string[]): CompetitionMatch[] {
  const rows = readList(value, `${label} matches`, PROGRESS_MATCHES_MAX, errors);
  return rows.map((row, index) => readMatch(row, `${label} match ${index + 1}`, errors));
}

function readMatch(value: unknown, label: string, errors: string[]): CompetitionMatch {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', opponent: '', result: 'loss', method: '', note: '' };
  }
  const match: CompetitionMatch = {
    id: readId(record.id, `${label} id`, errors),
    opponent: readString(record.opponent, `${label} opponent`, PROGRESS_NAME_MAX, errors),
    result: readMatchResult(record.result, label, errors),
    method: readMatchMethod(record.method, label, errors),
    note: readString(record.note, `${label} note`, PROGRESS_NOTE_MAX, errors),
  };
  const date = readOptionalDay(record.date);
  if (date) match.date = date;
  return match;
}

function readBracket(value: unknown, label: string, errors: string[]): BracketNote[] {
  const rows = readList(value, `${label} bracket`, PROGRESS_BRACKET_NOTES_MAX, errors);
  return rows.map((row, index) => readBracketNote(row, `${label} bracket ${index + 1}`, errors));
}

function readBracketNote(value: unknown, label: string, errors: string[]): BracketNote {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return { id: '', round: '', name: '' };
  }
  return {
    id: readId(record.id, `${label} id`, errors),
    round: readString(record.round, `${label} round`, PROGRESS_NAME_MAX, errors),
    name: readString(record.name, `${label} name`, PROGRESS_NAME_MAX, errors),
  };
}

function readMatchResult(value: unknown, label: string, errors: string[]): MatchResult {
  if (typeof value === 'string' && (MATCH_RESULTS as readonly string[]).includes(value)) return value as MatchResult;
  errors.push(`${label} result must be win, loss, or draw.`);
  return 'loss';
}

function readMatchMethod(value: unknown, label: string, errors: string[]): MatchMethod {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && (MATCH_METHODS as readonly string[]).includes(value)) return value as MatchMethod;
  errors.push(`${label} method must be points, sub, advantage, dq, or blank.`);
  return '';
}

function readTournamentStatus(value: unknown, label: string, errors: string[]): TournamentStatus {
  if (typeof value === 'string' && (TOURNAMENT_STATUSES as readonly string[]).includes(value)) return value as TournamentStatus;
  errors.push(`${label} status must be entered or considering.`);
  return 'considering';
}

function readWeightUnit(value: unknown, label: string, errors: string[]): WeightUnit {
  if (value == null || value === '') return 'lb';
  if (typeof value === 'string' && (WEIGHT_UNITS as readonly string[]).includes(value)) return value as WeightUnit;
  errors.push(`${label} must be lb or kg.`);
  return 'lb';
}

function readOptionalWeight(value: unknown, label: string, errors: string[]): number | null {
  if (value == null || value === '') return null;
  return readRequiredWeight(value, label, errors);
}

function readRequiredWeight(value: unknown, label: string, errors: string[]): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number <= 0 || number > PROGRESS_WEIGHT_MAX) {
    errors.push(`${label} must be a weight above 0.`);
    return 0;
  }
  return Math.round(number * 10) / 10;
}

function readOptionalHttpUrl(value: unknown, label: string, errors: string[]): string {
  if (value == null || value === '') return '';
  return readHttpUrl(value, label, errors);
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

function readGameTag(value: unknown, label: string, errors: string[]): GameTag | '' {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && (GAME_TAGS as readonly string[]).includes(value)) return value as GameTag;
  errors.push(`${label} game tag must be a, b, c, or blank.`);
  return '';
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

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A blank or older file has no clock. A bad clock is dropped so the rest of the file still opens. */
function readOptionalClock(value: unknown): string {
  if (typeof value !== 'string') return '';
  return CLOCK_RE.test(value) ? value : '';
}

/** Blank, missing, or `none` stays off the object. Anything else that is not a repeat is ignored. */
function readOptionalRepeat(value: unknown): CalendarEvent['repeat'] | undefined {
  if (typeof value !== 'string' || value === '' || value === 'none') return undefined;
  if ((CALENDAR_REPEATS as readonly string[]).includes(value)) return value as Exclude<CalendarRepeat, 'none'>;
  return undefined;
}

/** A blank or older match has no date. A bad date is dropped so the match itself still opens. */
function readOptionalDay(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  if (!DATE_RE.test(value) || !realDay(value)) return '';
  return value;
}

function readCalendarKind(value: unknown, label: string, errors: string[]): CalendarKind {
  if (typeof value === 'string' && (CALENDAR_KINDS as readonly string[]).includes(value)) return value as CalendarKind;
  errors.push(`${label} kind must be class, training, promotion, note, or other.`);
  return 'other';
}

function readFundamentalLevel(
  value: unknown,
  learnedOn: unknown,
  label: string,
  errors: string[],
): 0 | 1 | 2 | 3 | 4 | 5 {
  if (value == null || value === '') return fundamentalLevelOf({ learnedOn });
  if (isFundamentalLevel(value)) return value;
  errors.push(`${label} must be a whole number from 0 to 5.`);
  return 0;
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
      String(fundamentalLevelOf(entry)),
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
  for (const clip of packet.clips ?? []) {
    lines.push(csvRow([
      'Clip',
      clip.id,
      '',
      packet.studentId,
      '',
      '',
      clip.description,
      '',
      '',
      clip.note,
      clip.url,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]));
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
      event.time ?? '',
      event.repeat ?? '',
      '',
      '',
    ]));
  }
  writeRankRows(lines, packet);
  const competition = packet.competition;
  if (!competition) return;
  for (const tag of GAME_TAGS) {
    const game = competition.games[tag];
    if (!game.techniques.trim() && !game.notes.trim()) continue;
    lines.push(csvRow([
      'Game',
      tag,
      '',
      packet.studentId,
      tag,
      '',
      `${tag.toUpperCase()} game`,
      game.techniques,
      '',
      game.notes,
      '',
      '',
      `${tag.toUpperCase()} game`,
      '',
      '',
      '',
      '',
      '',
    ]));
  }
  for (const tournament of competition.tournaments) {
    const target = tournament.targetWeight == null ? '' : `${tournament.targetWeight} ${tournament.targetUnit}`;
    lines.push(csvRow([
      'Tournament',
      tournament.id,
      tournament.date,
      packet.studentId,
      '',
      tournament.division,
      tournament.name,
      '',
      tournament.deadline,
      tournament.location,
      tournament.link,
      '',
      tournament.name,
      tournament.status,
      '',
      target,
      '',
      '',
      '',
      tournament.weightClass ?? '',
    ]));
    for (const goal of tournament.goals) {
      lines.push(csvRow([
        'Tournament goal',
        goal.id,
        tournament.date,
        tournament.id,
        '',
        '',
        goal.name,
        '',
        '',
        goal.note,
        '',
        metCell(goal.met),
        tournament.name,
        '',
        '',
        '',
        '',
        '',
      ]));
    }
  }
  for (const result of competition.results) {
    lines.push(csvRow([
      'Result',
      result.id,
      '',
      packet.studentId,
      '',
      result.division,
      result.tournamentName,
      '',
      '',
      result.bracketPhoto ? 'bracket photo on the student phone' : '',
      '',
      '',
      result.tournamentName,
      '',
      '',
      result.tournamentId,
      '',
      '',
    ]));
    for (const match of result.matches) {
      lines.push(csvRow([
        'Match',
        match.id,
        match.date ?? '',
        result.id,
        match.result,
        match.method,
        match.opponent,
        '',
        '',
        match.note,
        '',
        '',
        result.tournamentName,
        '',
        '',
        '',
        '',
        '',
      ]));
    }
    for (const note of result.bracket) {
      lines.push(csvRow([
        'Bracket',
        note.id,
        '',
        result.id,
        '',
        note.round,
        note.name,
        '',
        '',
        '',
        '',
        '',
        result.tournamentName,
        '',
        '',
        '',
        '',
        '',
      ]));
    }
  }
  for (const weighIn of competition.weighIns) {
    lines.push(csvRow([
      'Weigh-in',
      weighIn.id,
      weighIn.date,
      packet.studentId,
      '',
      '',
      String(weighIn.weight),
      '',
      '',
      weighIn.note,
      '',
      '',
      '',
      weighIn.unit,
      '',
      '',
      '',
      '',
    ]));
  }
  if (competition.goalWeight != null || (competition.weighDate ?? '').trim()) {
    const goal = competition.goalWeight == null ? '' : `${competition.goalWeight} ${competition.goalUnit === 'kg' ? 'kg' : 'lb'}`;
    lines.push(csvRow([
      'Weight chart',
      packet.studentId,
      competition.weighDate ?? '',
      packet.studentId,
      '',
      '',
      'Goal weight',
      '',
      '',
      goal,
      '',
      '',
      '',
      '',
      goal,
      '',
      '',
      '',
    ]));
  }
}

function writeRankRows(lines: string[], packet: StudentProgressReport): void {
  if (!packet.rank) return;
  lines.push(rankCsvRow('Rank', packet.studentId, packet.profile.belt, packet.rank, packet.studentId, packet.rank.pictureNote ?? ''));
  for (const row of packet.rank.history) {
    lines.push(rankCsvRow('Rank history', row.id, row.belt, row, packet.studentId, ''));
  }
  for (const [index, name] of (packet.rank.lineage ?? []).entries()) {
    lines.push(csvRow([
      'Lineage',
      String(index + 1),
      '',
      packet.studentId,
      '',
      '',
      name,
      '',
      '',
      '',
      '',
      '',
      name,
      String(index + 1),
      '',
      '',
      '',
      '',
    ]));
  }
}

function rankCsvRow(
  sheet: string,
  id: string,
  belt: string,
  rank: { awardedOn: string; tapeCount: number; tapeDates: readonly string[]; highDegreeDates?: readonly string[] },
  parentId: string,
  note: string,
): string {
  const dates = [...(rank.tapeDates ?? []), ...(rank.highDegreeDates ?? [])]
    .slice(0, rank.tapeCount)
    .map((date, index) => {
      const when = stripeDateText(date);
      return when ? `${index + 1} ${when}` : '';
    })
    .filter(Boolean)
    .join('; ');
  return csvRow([
    sheet,
    id,
    rank.awardedOn,
    parentId,
    '',
    '',
    belt,
    dates,
    '',
    note,
    '',
    '',
    sheet === 'Rank' ? 'Current rank' : belt,
    String(rank.tapeCount),
    belt,
    '',
    '',
    '',
  ]);
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

function csvRow(cells: readonly string[]): string {
  const width = PROGRESS_CSV_HEADERS.length;
  const padded = [...cells];
  while (padded.length < width) padded.push('');
  return padded.map((cell) => csvCell(cell ?? '')).join(',');
}

/** Read a progress spreadsheet. Rows are aligned to the header by column name. */
export function parseProgressCsv(text: string): { headers: string[]; rows: string[][] } | { error: string } {
  const table = parseCsvTable(text);
  if (!table.length) return { error: 'This spreadsheet is empty.' };
  const headers = table[0].map((cell) => cell.trim());
  if (headers[0] !== 'Sheet') return { error: 'This spreadsheet is not a Student Edition progress file.' };
  const width = headers.length;
  const rows = table.slice(1).map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push('');
    return padded;
  });
  return { headers, rows };
}

/**
 * Copy Fundamentals levels from a progress spreadsheet onto this report.
 * A file from before the Proficiency column has no level to apply. Levels already stored stay.
 */
export function applyProgressCsv(
  report: StudentProgressReport,
  text: string,
): { report: StudentProgressReport; error: string } {
  const parsed = parseProgressCsv(text);
  if ('error' in parsed) return { report, error: parsed.error };
  const column = (name: string) => parsed.headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  const sheetAt = column('Sheet');
  const idAt = column('Id');
  const proficiencyAt = column('Proficiency');
  if (sheetAt < 0 || idAt < 0) return { report, error: 'This spreadsheet is not a Student Edition progress file.' };
  if (proficiencyAt < 0) return { report, error: '' };
  const next = structuredClone(report);
  for (const row of parsed.rows) {
    if ((row[sheetAt] ?? '').trim() !== 'Checklist') continue;
    const id = (row[idAt] ?? '').trim();
    const raw = (row[proficiencyAt] ?? '').trim();
    if (!id || !raw) continue;
    const level = Number(raw);
    if (!isFundamentalLevel(level)) continue;
    const entry = next.checklist.find((item) => item.id === id);
    if (entry) entry.level = level;
  }
  return { report: next, error: '' };
}

function parseCsvTable(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < src.length; index += 1) {
    const char = src[index];
    if (quoted) {
      if (char === '"') {
        if (src[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
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
