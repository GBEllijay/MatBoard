/**
 * My rank on this device. The current belt is profile.belt.
 * Stripe slots are tapeCount and tapeDates. The progress file rejects a stripes key.
 */

import {
  PROGRESS_ID_MAX,
  PROGRESS_LINEAGE_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_RANK_HISTORY_MAX,
  RANK_BELTS,
  RANK_TAPE_MAX,
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
};

export function isRankBelt(belt: string): belt is RankBelt {
  return (RANK_BELTS as readonly string[]).includes(belt);
}

export function emptyTapeDates(): RankTapeDates {
  return ['', '', '', ''];
}

export type StripeCountAction = 'add' | 'remove' | 'trim';

/**
 * What the stripe control does. Slot is 1 to 4.
 * An empty stripe adds through that slot. The last stripe comes off.
 * A stripe before the last one drops the stripes after it.
 */
export function stripeCountControl(slot: number, tapeCount: number, label: string): { action: StripeCountAction; name: string } {
  if (slot === tapeCount) return { action: 'remove', name: `Take off ${label}` };
  if (slot < tapeCount) return { action: 'trim', name: `Drop stripes after ${label}` };
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
  historyId: string;
};

/** White at the top, then blue, purple, brown, and black. */
export function ladderRungs(report: StudentProgressReport): LadderRung[] {
  const rank = rankOf(report);
  const current = report.profile.belt;
  const currentIndex = isRankBelt(current) ? RANK_BELTS.indexOf(current) : -1;
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
      historyId: '',
    };
  });
}

/** The rank on the report, or an empty one when an older file omitted it. */
export function rankOf(report: StudentProgressReport): StudentRank {
  const rank = report.rank ?? emptyRank();
  return { ...rank, lineage: rank.lineage ?? [], tapeDates: copyDates(rank.tapeDates) };
}

export function rankBeltLabel(belt: ProgressBelt): string {
  return BELT_NAMES[belt];
}

export type RankMark = { date: string; label: string };

/** Dates the calendar reads. These are not copied into calendar events. */
export function rankMarks(report: StudentProgressReport): RankMark[] {
  const rank = rankOf(report);
  const marks: RankMark[] = [];
  pushMarks(marks, report.profile.belt, rank.awardedOn, rank.tapeCount, rank.tapeDates);
  for (const row of rank.history) {
    pushMarks(marks, row.belt, row.awardedOn, row.tapeCount, row.tapeDates);
  }
  return marks;
}

export function rankMarksOnDate(report: StudentProgressReport, iso: string): RankMark[] {
  return rankMarks(report).filter((mark) => mark.date === iso);
}

/**
 * Set the belt the student wears. profile.belt is the only current belt.
 * A previous adult belt is kept on the history list when it had a date or a stripe.
 * Moving off a kids belt keeps the stripes already tapped.
 */
export function setRankBelt(report: StudentProgressReport, belt: ProgressBelt, now = Date.now()): StudentProgressReport {
  if (report.profile.belt === belt) return report;
  const current = rankOf(report);
  if (!isRankBelt(report.profile.belt)) {
    return touch(report, { ...current }, belt, now);
  }
  let history = current.history;
  if (rankHasMark(current)) {
    if (history.length >= PROGRESS_RANK_HISTORY_MAX) throw new Error('The promotion history is full.');
    history = [
      ...history,
      {
        id: newId('rank', now),
        belt: report.profile.belt,
        awardedOn: current.awardedOn,
        tapeCount: current.tapeCount,
        tapeDates: copyDates(current.tapeDates),
      },
    ];
  }
  return touch(
    report,
    { ...current, tapeCount: 0, awardedOn: '', tapeDates: emptyTapeDates(), history },
    belt,
    now,
  );
}

/** Tap a stripe slot. The same slot again removes that stripe and the ones after it. */
export function setRankTapeCount(report: StudentProgressReport, count: number, now = Date.now()): StudentProgressReport {
  if (!Number.isInteger(count) || count < 0 || count > RANK_TAPE_MAX) throw new Error('Stripes are 0 to 4.');
  const rank = rankOf(report);
  if (rank.tapeCount === count) return report;
  return touch(report, { ...rank, tapeCount: count, tapeDates: datesForCount(rank.tapeDates, count) }, report.profile.belt, now);
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
  if (!Number.isInteger(index) || index < 0 || index >= RANK_TAPE_MAX) throw new Error('Stripes are 0 to 4.');
  const rank = rankOf(report);
  if (index >= rank.tapeCount) throw new Error('That stripe is not on the belt yet.');
  const awarded = cleanDate(date);
  if (rank.tapeDates[index] === awarded) return report;
  const tapeDates = copyDates(rank.tapeDates);
  tapeDates[index] = awarded;
  return touch(report, { ...rank, tapeDates }, report.profile.belt, now);
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
  if (!Number.isInteger(index) || index < 0 || index >= RANK_TAPE_MAX) throw new Error('Stripes are 0 to 4.');
  const rank = rankOf(report);
  const row = rank.history.find((item) => item.id === id);
  if (!row) return report;
  if (index >= row.tapeCount) throw new Error('That stripe is not on the belt yet.');
  const awarded = cleanDate(date);
  if (row.tapeDates[index] === awarded) return report;
  const tapeDates = copyDates(row.tapeDates);
  tapeDates[index] = awarded;
  const history = rank.history.map((item) => (item.id === id ? { ...item, tapeDates } : item));
  return touch(report, { ...rank, history }, report.profile.belt, now);
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
): void {
  const name = BELT_NAMES[belt];
  if (isIsoDate(awardedOn)) marks.push({ date: awardedOn, label: `${name} belt` });
  for (let index = 0; index < tapeCount && index < tapeDates.length; index += 1) {
    const date = tapeDates[index] ?? '';
    if (isIsoDate(date)) marks.push({ date, label: `${name} stripe ${index + 1}` });
  }
}

function rankHasMark(rank: StudentRank): boolean {
  return Boolean(rank.awardedOn) || rank.tapeCount > 0 || rank.tapeDates.some((date) => date.trim());
}

function datesForCount(dates: readonly string[], count: number): RankTapeDates {
  const next = emptyTapeDates();
  for (let index = 0; index < count; index += 1) next[index] = dates[index] ?? '';
  return next;
}

function copyDates(dates: readonly string[]): RankTapeDates {
  return datesForCount(dates, RANK_TAPE_MAX);
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
  if (rank.pictureNote) next.pictureNote = rank.pictureNote;
  if (rank.pictureCount) next.pictureCount = rank.pictureCount;
  if (rank.pictures) next.pictures = rank.pictures.map((picture) => ({ ...picture }));
  return next;
}

function cloneHistory(row: RankHistory): RankHistory {
  return { ...row, tapeDates: copyDates(row.tapeDates) };
}

function newId(prefix: string, now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${now.toString(36)}.${rand}`.slice(0, PROGRESS_ID_MAX);
}
