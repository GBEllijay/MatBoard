/**
 * My rank on this device. The current belt is profile.belt.
 * Stripe slots are tapeCount and tapeDates. The progress file rejects a stripes key.
 */

import { highDatesForCount } from './blackBeltDegrees.ts';
import {
  BLACK_DEGREE_MAX,
  FINAL_RANK_BELTS,
  PROGRESS_ID_MAX,
  PROGRESS_LINEAGE_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_RANK_HISTORY_MAX,
  RANK_BELTS,
  RANK_TAPE_MAX,
  type HighDegreeDates,
  type ProgressBelt,
  type RankBelt,
  type RankHistory,
  type RankTapeDates,
  type StudentProgressReport,
  type StudentRank,
} from './progress/types.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BELT_NAMES: Record<ProgressBelt, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
  grey: 'Grey',
  yellow: 'Yellow',
  orange: 'Orange',
  green: 'Green',
  coral: 'Coral',
  redWhite: 'Red and white',
  red: 'Red',
};

export function isRankBelt(belt: string): belt is RankBelt {
  return (RANK_BELTS as readonly string[]).includes(belt) || (FINAL_RANK_BELTS as readonly string[]).includes(belt);
}

/** White through brown keep 4 stripes. A black belt keeps 6 degrees in the same count. */
export function maxStripes(belt: ProgressBelt): number {
  return belt === 'black' ? BLACK_DEGREE_MAX : RANK_TAPE_MAX;
}

export function emptyTapeDates(): RankTapeDates {
  return ['', '', '', ''];
}

/** A real stripe date, or empty when the stripe was saved without one. */
export function stripeDateText(date: string | null | undefined): string {
  const trimmed = (date ?? '').trim();
  return isIsoDate(trimmed) ? trimmed : '';
}

/**
 * One stripe on a report. Slot order is 1 to 4.
 * A dated stripe keeps its date. An undated stripe is named with no date after it.
 */
export function stripeReportLine(slot: number, date: string | null | undefined): string {
  const when = stripeDateText(date);
  return when ? `Stripe ${slot}: ${when}` : `Stripe ${slot}`;
}

/** Older files can omit tape dates. The stripe count still stands. A black-belt 5 or 6 is kept. */
export function normalizeStoredRank(rank: Partial<StudentRank> | null | undefined): StudentRank {
  const source = rank ?? {};
  const tapeCount = clampTapeCount(source.tapeCount, BLACK_DEGREE_MAX);
  const history = dedupeRankHistory((source.history ?? []).map((row) => cloneHistory(row)));
  const next: StudentRank = {
    tapeCount,
    awardedOn: typeof source.awardedOn === 'string' ? source.awardedOn : '',
    tapeDates: datesForCount(source.tapeDates ?? [], tapeCount),
    history,
    lineage: [...(source.lineage ?? [])],
  };
  const high = highDatesForCount(source.highDegreeDates, tapeCount);
  if (high) next.highDegreeDates = high;
  if (source.instructorBars) next.instructorBars = true;
  if (typeof source.instructorBarsOn === 'string' && source.instructorBarsOn) next.instructorBarsOn = source.instructorBarsOn;
  if (source.pictureNote) next.pictureNote = source.pictureNote;
  if (source.pictureCount) next.pictureCount = source.pictureCount;
  if (source.pictures) next.pictures = source.pictures.map((picture) => ({ ...picture }));
  return next;
}

export type StripeCountAction = 'add' | 'remove' | 'trim';

/**
 * What the stripe control does. Slot is 1 to 4.
 * An empty stripe adds through that slot. The last stripe comes off.
 * A stripe before the last one drops the stripes after it.
 */
export function stripeCountControl(
  slot: number,
  tapeCount: number,
  label: string,
  noun = 'stripes',
): { action: StripeCountAction; name: string } {
  if (slot === tapeCount) return { action: 'remove', name: `Take off ${label}` };
  if (slot < tapeCount) return { action: 'trim', name: `Drop ${noun} after ${label}` };
  return { action: 'add', name: `Add ${label}` };
}

export function emptyRank(): StudentRank {
  return { tapeCount: 0, awardedOn: '', tapeDates: emptyTapeDates(), history: [], lineage: [] };
}

export type LadderRung = {
  belt: RankBelt;
  label: string;
  current: boolean;
  reached: boolean;
  awardedOn: string;
  tapeCount: number;
  tapeDates: RankTapeDates;
  highDegreeDates?: HighDegreeDates;
  instructorBars: boolean;
  instructorBarsOn: string;
  historyId: string;
};

export function slotDate(dates: readonly string[], high: readonly string[] | undefined, index: number): string {
  if (index < RANK_TAPE_MAX) return stripeDateText(dates[index]);
  return stripeDateText(high?.[index - RANK_TAPE_MAX]);
}

/** White at the top, then blue, purple, brown, and black. */
export function ladderRungs(report: StudentProgressReport): LadderRung[] {
  const rank = rankOf(report);
  const current = report.profile.belt;
  const currentIndex = (RANK_BELTS as readonly string[]).includes(current)
    ? RANK_BELTS.indexOf(current as (typeof RANK_BELTS)[number])
    : (FINAL_RANK_BELTS as readonly string[]).includes(current)
      ? RANK_BELTS.length
      : -1;
  const historyByBelt = new Map<RankBelt, RankHistory>();
  for (const row of rank.history) historyByBelt.set(row.belt, row);
  return RANK_BELTS.map((belt, index) => {
    const label = BELT_NAMES[belt];
    if (belt === current) {
      return {
        belt,
        label,
        current: true,
        reached: true,
        awardedOn: rank.awardedOn,
        tapeCount: rank.tapeCount,
        tapeDates: copyDates(rank.tapeDates),
        highDegreeDates: rank.highDegreeDates ? ([...rank.highDegreeDates] as HighDegreeDates) : undefined,
        instructorBars: Boolean(rank.instructorBars),
        instructorBarsOn: rank.instructorBarsOn ?? '',
        historyId: '',
      };
    }
    const past = historyByBelt.get(belt);
    const reached = currentIndex >= 0 && index < currentIndex;
    if (past) {
      return {
        belt,
        label,
        current: false,
        reached: true,
        awardedOn: past.awardedOn,
        tapeCount: past.tapeCount,
        tapeDates: copyDates(past.tapeDates),
        highDegreeDates: past.highDegreeDates ? ([...past.highDegreeDates] as HighDegreeDates) : undefined,
        instructorBars: Boolean(past.instructorBars),
        instructorBarsOn: past.instructorBarsOn ?? '',
        historyId: past.id,
      };
    }
    return {
      belt,
      label,
      current: false,
      reached,
      awardedOn: '',
      tapeCount: 0,
      tapeDates: emptyTapeDates(),
      instructorBars: false,
      instructorBarsOn: '',
      historyId: '',
    };
  });
}

/** The rank on the report, or an empty one when an older file omitted it. */
export function rankOf(report: StudentProgressReport): StudentRank {
  const rank = report.rank ?? emptyRank();
  return {
    ...rank,
    lineage: rank.lineage ?? [],
    tapeDates: copyDates(rank.tapeDates),
    history: dedupeRankHistory(rank.history),
  };
}

export function rankBeltLabel(belt: ProgressBelt): string {
  return BELT_NAMES[belt];
}

export type RankMark = { date: string; label: string };

/** Dates the calendar reads. These are not copied into calendar events. */
export function rankMarks(report: StudentProgressReport): RankMark[] {
  const rank = rankOf(report);
  const marks: RankMark[] = [];
  pushMarks(marks, report.profile.belt, rank.awardedOn, rank.tapeCount, rank.tapeDates, rank.highDegreeDates);
  for (const row of rank.history) {
    pushMarks(marks, row.belt, row.awardedOn, row.tapeCount, row.tapeDates, row.highDegreeDates);
  }
  return marks;
}

export function rankMarksOnDate(report: StudentProgressReport, iso: string): RankMark[] {
  return rankMarks(report).filter((mark) => mark.date === iso);
}

/**
 * Set the belt the student wears. profile.belt is the only current belt.
 * A previous adult belt is kept on the history list when it had a date, a stripe, or instructor bars.
 * Selecting that belt again puts the saved degrees, stripes, bars, and dates back on it.
 * The same promotion (belt, degree or stripe count, and awarded date) is not logged twice.
 * Moving off a kids belt keeps the stripes already tapped.
 */
export function setRankBelt(report: StudentProgressReport, belt: ProgressBelt, now = Date.now()): StudentProgressReport {
  if (report.profile.belt === belt) return report;
  const current = rankOf(report);
  if (!isRankBelt(report.profile.belt)) {
    return touch(report, { ...current }, belt, now);
  }
  let history = current.history;
  if (beltHasSavedState(current, report.profile.belt)) {
    history = rememberPromotion(history, archiveCurrent(current, report.profile.belt, now));
  }
  if (!isRankBelt(belt)) return touch(report, blankWornRank(current, history), belt, now);
  const saved = takeLatestBelt(history, belt);
  if (saved) return touch(report, applyHistoryRow(current, saved.row, saved.history), belt, now);
  return touch(report, blankWornRank(current, history), belt, now);
}

/**
 * One row per promotion. The key is the belt, the degree or stripe count, and the awarded date.
 * A later copy of that same promotion replaces the earlier one.
 */
export function dedupeRankHistory(history: readonly RankHistory[]): RankHistory[] {
  if (history.length < 2) return [...history];
  const seen = new Set<string>();
  const kept: RankHistory[] = [];
  let dropped = false;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const row = history[index];
    if (!row) continue;
    const key = promotionKey(row);
    if (seen.has(key)) {
      dropped = true;
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  if (!dropped) return [...history];
  kept.reverse();
  return kept;
}

/** Tap a stripe slot. The same slot again removes that stripe and the ones after it. */
export function setRankTapeCount(report: StudentProgressReport, count: number, now = Date.now()): StudentProgressReport {
  const max = maxStripes(report.profile.belt);
  if (!Number.isInteger(count) || count < 0 || count > max) {
    throw new Error(report.profile.belt === 'black' ? 'Degrees are 0 to 6.' : 'Stripes are 0 to 4.');
  }
  const rank = rankOf(report);
  if (rank.tapeCount === count) return report;
  const next: StudentRank = { ...rank, tapeCount: count, tapeDates: datesForCount(rank.tapeDates, count) };
  const high = highDatesForCount(rank.highDegreeDates, count);
  if (high) next.highDegreeDates = high;
  else delete next.highDegreeDates;
  return touch(report, next, report.profile.belt, now);
}

export function setRankAwardedOn(report: StudentProgressReport, date: string, now = Date.now()): StudentProgressReport {
  const awardedOn = cleanDate(date);
  const rank = rankOf(report);
  if (rank.awardedOn === awardedOn) return report;
  return touch(report, { ...rank, awardedOn }, report.profile.belt, now);
}

export function setRankTapeDate(
  report: StudentProgressReport,
  index: number,
  date: string,
  now = Date.now(),
): StudentProgressReport {
  const max = maxStripes(report.profile.belt);
  if (!Number.isInteger(index) || index < 0 || index >= max) {
    throw new Error(report.profile.belt === 'black' ? 'Degrees are 0 to 6.' : 'Stripes are 0 to 4.');
  }
  const rank = rankOf(report);
  if (index >= rank.tapeCount) throw new Error('That stripe is not on the belt yet.');
  const awarded = cleanDate(date);
  if (slotDate(rank.tapeDates, rank.highDegreeDates, index) === awarded) return report;
  return touch(report, writeSlotDate(rank, index, awarded), report.profile.belt, now);
}

/**
 * One instructor per entry.
 * A stored string, or one entry that still has line breaks, splits into the list.
 * Names are kept in order. Nothing is joined back into a single field.
 */
export function expandLineage(lines: readonly string[]): string[] {
  const names: string[] = [];
  for (const line of lines) {
    for (const part of line.split(/\r?\n/)) {
      const name = part.trim().slice(0, PROGRESS_NOTE_MAX);
      if (name) names.push(name);
    }
  }
  return names.slice(0, PROGRESS_LINEAGE_MAX);
}

export function setRankLineage(report: StudentProgressReport, lines: readonly string[], now = Date.now()): StudentProgressReport {
  const lineage = expandLineage(lines);
  const rank = rankOf(report);
  const prior = rank.lineage ?? [];
  if (prior.length === lineage.length && prior.every((line, index) => line === lineage[index])) return report;
  return touch(report, { ...rank, lineage }, report.profile.belt, now);
}

export function setRankHistoryAwardedOn(
  report: StudentProgressReport,
  id: string,
  date: string,
  now = Date.now(),
): StudentProgressReport {
  const awardedOn = cleanDate(date);
  const rank = rankOf(report);
  if (!rank.history.some((row) => row.id === id)) return report;
  const history = rank.history.map((row) => (row.id === id ? { ...row, awardedOn } : row));
  if (rank.history.some((row) => row.id === id && row.awardedOn === awardedOn)) return report;
  return touch(report, { ...rank, history }, report.profile.belt, now);
}

export function setRankHistoryTapeDate(
  report: StudentProgressReport,
  id: string,
  index: number,
  date: string,
  now = Date.now(),
): StudentProgressReport {
  const rank = rankOf(report);
  const row = rank.history.find((item) => item.id === id);
  if (!row) return report;
  const max = maxStripes(row.belt);
  if (!Number.isInteger(index) || index < 0 || index >= max) {
    throw new Error(row.belt === 'black' ? 'Degrees are 0 to 6.' : 'Stripes are 0 to 4.');
  }
  if (index >= row.tapeCount) throw new Error('That stripe is not on the belt yet.');
  const awarded = cleanDate(date);
  if (slotDate(row.tapeDates, row.highDegreeDates, index) === awarded) return report;
  const written = writeSlotDate(row, index, awarded);
  const history = rank.history.map((item) => (item.id === id ? { ...item, ...written, id: item.id, belt: item.belt } : item));
  return touch(report, { ...rank, history }, report.profile.belt, now);
}

/** Optional instructor bars. Not a degree. Off leaves the date in place. */
export function setInstructorBars(report: StudentProgressReport, on: boolean, now = Date.now()): StudentProgressReport {
  const rank = rankOf(report);
  if (report.profile.belt === 'black') {
    if (Boolean(rank.instructorBars) === on) return report;
    return touch(report, applyBars(rank, on), report.profile.belt, now);
  }
  const index = lastBlackIndex(rank.history);
  if (index < 0) return report;
  if (Boolean(rank.history[index]?.instructorBars) === on) return report;
  const history = rank.history.map((row, slot) => (slot === index ? applyBars(row, on) : row));
  const next = applyBars({ ...rank, history }, on);
  return touch(report, next, report.profile.belt, now);
}

export function setInstructorBarsOn(report: StudentProgressReport, date: string, now = Date.now()): StudentProgressReport {
  const awarded = cleanDate(date);
  const rank = rankOf(report);
  if (report.profile.belt === 'black') {
    if ((rank.instructorBarsOn ?? '') === awarded) return report;
    return touch(report, applyBarsDate(rank, awarded), report.profile.belt, now);
  }
  const index = lastBlackIndex(rank.history);
  if (index < 0) return report;
  if ((rank.history[index]?.instructorBarsOn ?? '') === awarded) return report;
  const history = rank.history.map((row, slot) => (slot === index ? applyBarsDate(row, awarded) : row));
  return touch(report, applyBarsDate({ ...rank, history }, awarded), report.profile.belt, now);
}

/** The instructor-bar switch the black belt row shows. */
export function instructorBarsOf(report: StudentProgressReport): { on: boolean; date: string } {
  const rank = rankOf(report);
  if (report.profile.belt === 'black') return { on: Boolean(rank.instructorBars), date: rank.instructorBarsOn ?? '' };
  const index = lastBlackIndex(rank.history);
  if (index >= 0) {
    const row = rank.history[index];
    return { on: Boolean(row?.instructorBars), date: row?.instructorBarsOn ?? '' };
  }
  return { on: false, date: '' };
}

export function removeRankHistory(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  const rank = rankOf(report);
  if (!rank.history.some((row) => row.id === id)) return report;
  return touch(
    report,
    { ...rank, history: rank.history.filter((row) => row.id !== id) },
    report.profile.belt,
    now,
  );
}

function pushMarks(
  marks: RankMark[],
  belt: ProgressBelt,
  awardedOn: string,
  tapeCount: number,
  tapeDates: readonly string[],
  high?: readonly string[],
): void {
  const name = BELT_NAMES[belt];
  if (isIsoDate(awardedOn)) marks.push({ date: awardedOn, label: `${name} belt` });
  const noun = belt === 'black' ? 'degree' : 'stripe';
  for (let index = 0; index < tapeCount; index += 1) {
    const date = slotDate(tapeDates, high, index);
    if (isIsoDate(date)) marks.push({ date, label: `${name} ${noun} ${index + 1}` });
  }
}

function rankHasMark(rank: StudentRank): boolean {
  return (
    Boolean(rank.awardedOn) ||
    rank.tapeCount > 0 ||
    rank.tapeDates.some((date) => date.trim()) ||
    Boolean(rank.highDegreeDates?.some((date) => date.trim()))
  );
}

/** Instructor bars are saved with a black belt even when no degree or date is filled in yet. */
function beltHasSavedState(rank: StudentRank, belt: RankBelt): boolean {
  if (rankHasMark(rank)) return true;
  return belt === 'black' && (rank.instructorBars === true || Boolean(rank.instructorBarsOn));
}

function promotionKey(row: Pick<RankHistory, 'belt' | 'tapeCount' | 'awardedOn'>): string {
  return `${row.belt}\0${row.tapeCount}\0${row.awardedOn}`;
}

function rememberPromotion(history: readonly RankHistory[], row: RankHistory): RankHistory[] {
  const key = promotionKey(row);
  const index = history.findIndex((item) => promotionKey(item) === key);
  if (index >= 0) {
    const prior = history[index];
    if (!prior) return [...history];
    const kept: RankHistory = { ...row, id: prior.id };
    return history.map((item, slot) => (slot === index ? kept : item));
  }
  if (history.length >= PROGRESS_RANK_HISTORY_MAX) throw new Error('The promotion history is full.');
  return [...history, row];
}

function takeLatestBelt(
  history: readonly RankHistory[],
  belt: RankBelt,
): { row: RankHistory; history: RankHistory[] } | null {
  let index = -1;
  history.forEach((row, slot) => {
    if (row.belt === belt) index = slot;
  });
  if (index < 0) return null;
  const row = history[index];
  if (!row) return null;
  return { row, history: history.filter((_, slot) => slot !== index) };
}

function blankWornRank(current: StudentRank, history: RankHistory[]): StudentRank {
  const next: StudentRank = { ...current, tapeCount: 0, awardedOn: '', tapeDates: emptyTapeDates(), history };
  delete next.highDegreeDates;
  delete next.instructorBars;
  delete next.instructorBarsOn;
  return next;
}

function applyHistoryRow(current: StudentRank, row: RankHistory, history: RankHistory[]): StudentRank {
  const next: StudentRank = {
    ...current,
    tapeCount: row.tapeCount,
    awardedOn: row.awardedOn,
    tapeDates: copyDates(row.tapeDates),
    history,
  };
  delete next.highDegreeDates;
  delete next.instructorBars;
  delete next.instructorBarsOn;
  const high = highDatesForCount(row.highDegreeDates, row.tapeCount);
  if (high) next.highDegreeDates = high;
  if (row.instructorBars) next.instructorBars = true;
  if (row.instructorBarsOn) next.instructorBarsOn = row.instructorBarsOn;
  return next;
}

function datesForCount(dates: readonly string[] | null | undefined, count: number): RankTapeDates {
  const next = emptyTapeDates();
  const source = dates ?? [];
  const kept = Math.min(count, RANK_TAPE_MAX);
  for (let index = 0; index < kept; index += 1) next[index] = stripeDateText(source[index]);
  return next;
}

function writeSlotDate<T extends { tapeDates: RankTapeDates; highDegreeDates?: HighDegreeDates }>(
  source: T,
  index: number,
  awarded: string,
): T {
  if (index < RANK_TAPE_MAX) {
    const tapeDates = copyDates(source.tapeDates);
    tapeDates[index] = awarded;
    return { ...source, tapeDates };
  }
  const high = highDatesForCount(source.highDegreeDates, BLACK_DEGREE_MAX) ?? (['', ''] as HighDegreeDates);
  high[index - RANK_TAPE_MAX] = awarded;
  return { ...source, highDegreeDates: high };
}

function archiveCurrent(rank: StudentRank, belt: RankBelt, now: number): RankHistory {
  const row: RankHistory = {
    id: newId('rank', now),
    belt,
    awardedOn: rank.awardedOn,
    tapeCount: rank.tapeCount,
    tapeDates: copyDates(rank.tapeDates),
  };
  if (belt === 'black') {
    const high = highDatesForCount(rank.highDegreeDates, rank.tapeCount);
    if (high) row.highDegreeDates = high;
    if (rank.instructorBars) row.instructorBars = true;
    if (rank.instructorBarsOn) row.instructorBarsOn = rank.instructorBarsOn;
  }
  return row;
}

function lastBlackIndex(history: readonly RankHistory[]): number {
  let found = -1;
  history.forEach((row, index) => {
    if (row.belt === 'black') found = index;
  });
  return found;
}

function applyBars<T extends { instructorBars?: boolean }>(source: T, on: boolean): T {
  const next = { ...source };
  if (on) next.instructorBars = true;
  else delete next.instructorBars;
  return next;
}

function applyBarsDate<T extends { instructorBarsOn?: string }>(source: T, date: string): T {
  const next = { ...source };
  if (date) next.instructorBarsOn = date;
  else delete next.instructorBarsOn;
  return next;
}

function copyDates(dates: readonly string[] | null | undefined): RankTapeDates {
  return datesForCount(dates, RANK_TAPE_MAX);
}

function clampTapeCount(value: unknown, max = RANK_TAPE_MAX): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return 0;
  return Math.min(max, value);
}

function cleanDate(date: string): string {
  const trimmed = date.trim();
  if (!trimmed) return '';
  if (!isIsoDate(trimmed)) throw new Error('Date must be YYYY-MM-DD.');
  return trimmed;
}

function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function touch(
  report: StudentProgressReport,
  rank: StudentRank,
  belt: ProgressBelt,
  now: number,
): StudentProgressReport {
  return {
    ...report,
    updatedAt: now,
    profile: { ...report.profile, belt },
    rank: rankFields(rank),
  };
}

function rankFields(rank: StudentRank): StudentRank {
  const next: StudentRank = {
    tapeCount: rank.tapeCount,
    awardedOn: rank.awardedOn,
    tapeDates: copyDates(rank.tapeDates),
    history: rank.history.map((row) => cloneHistory(row)),
    lineage: [...(rank.lineage ?? [])],
  };
  const high = highDatesForCount(rank.highDegreeDates, rank.tapeCount);
  if (high) next.highDegreeDates = high;
  if (rank.instructorBars) next.instructorBars = true;
  if (rank.instructorBarsOn) next.instructorBarsOn = rank.instructorBarsOn;
  if (rank.pictureNote) next.pictureNote = rank.pictureNote;
  if (rank.pictureCount) next.pictureCount = rank.pictureCount;
  if (rank.pictures) next.pictures = rank.pictures.map((picture) => ({ ...picture }));
  return next;
}

function cloneHistory(row: RankHistory): RankHistory {
  const max = row.belt === 'black' ? BLACK_DEGREE_MAX : RANK_TAPE_MAX;
  const tapeCount = clampTapeCount(row.tapeCount, max);
  const next: RankHistory = {
    id: row.id,
    belt: row.belt,
    awardedOn: typeof row.awardedOn === 'string' ? row.awardedOn : '',
    tapeCount,
    tapeDates: datesForCount(row.tapeDates ?? [], tapeCount),
  };
  if (row.belt === 'black') {
    const high = highDatesForCount(row.highDegreeDates, tapeCount);
    if (high) next.highDegreeDates = high;
    if (row.instructorBars) next.instructorBars = true;
    if (row.instructorBarsOn) next.instructorBarsOn = row.instructorBarsOn;
  }
  return next;
}

function newId(prefix: string, now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${now.toString(36)}.${rand}`.slice(0, PROGRESS_ID_MAX);
}

/**
 * Kids belts live on beltBook. These helpers do not write profile.belt or adult stripes.
 * Adult degrees stay on setRankTapeCount.
 */
export {
  addClassDot,
  ageWarning,
  beltModeOf,
  classesPerTapeOf,
  currentKidsBelt,
  guideOf,
  ibjjfAge,
  kidsLadder,
  kidsRankOf,
  kidsTemplateOf,
  removeClassDot,
  removeKidsHistory,
  setBeltMode,
  setBirthYear,
  setClassesPerTape,
  setKidsAwardedOn,
  setKidsBelt,
  setKidsHistoryAwardedOn,
  setKidsTapeCount,
  setKidsTapeDate,
  setTapeGuide,
  showAdultPrompt,
  timeGuideText,
} from './beltBook.ts';
