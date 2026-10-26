/**
 * IBJJF-style time at black belt. One table, so a year can be edited in one place.
 * Plain black is degree 0 and is not a row. Degrees 1 to 6 stay on the black belt.
 * 7th and 8th are coral. 9th is solid red.
 * These are guideline minimums. The student's instructor or federation decides.
 * Instructor bars are not in this table. They are not a rank and they do not change a year.
 */

import type { HighDegreeDates, ProgressBelt } from './progress/types.ts';

export type DegreeAppearance = 'black' | 'red-black' | 'red-white' | 'red';

export type BlackDegreeRule = {
  /** 1 through 9. */
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** Minimum years at the previous rank. Plain black is the previous rank for 1st degree. */
  yearsAtPrevious: number;
  /** Cumulative years as a black belt when this degree is reached. 9th degree is 48 or more. */
  cumulativeYears: number;
  /** True only for 9th degree. */
  cumulativeAtLeast: boolean;
  appearance: DegreeAppearance;
  /** "1st degree". */
  label: string;
  /** What the belt looks like. */
  beltLabel: string;
};

export const BLACK_DEGREE_TABLE: readonly BlackDegreeRule[] = [
  { degree: 1, yearsAtPrevious: 3, cumulativeYears: 3, cumulativeAtLeast: false, appearance: 'black', label: '1st degree', beltLabel: 'Black' },
  { degree: 2, yearsAtPrevious: 3, cumulativeYears: 6, cumulativeAtLeast: false, appearance: 'black', label: '2nd degree', beltLabel: 'Black' },
  { degree: 3, yearsAtPrevious: 3, cumulativeYears: 9, cumulativeAtLeast: false, appearance: 'black', label: '3rd degree', beltLabel: 'Black' },
  { degree: 4, yearsAtPrevious: 5, cumulativeYears: 14, cumulativeAtLeast: false, appearance: 'black', label: '4th degree', beltLabel: 'Black' },
  { degree: 5, yearsAtPrevious: 5, cumulativeYears: 19, cumulativeAtLeast: false, appearance: 'black', label: '5th degree', beltLabel: 'Black' },
  { degree: 6, yearsAtPrevious: 5, cumulativeYears: 24, cumulativeAtLeast: false, appearance: 'black', label: '6th degree', beltLabel: 'Black' },
  { degree: 7, yearsAtPrevious: 7, cumulativeYears: 31, cumulativeAtLeast: false, appearance: 'red-black', label: '7th degree', beltLabel: 'Coral, red and black' },
  { degree: 8, yearsAtPrevious: 7, cumulativeYears: 38, cumulativeAtLeast: false, appearance: 'red-white', label: '8th degree', beltLabel: 'Coral, red and white' },
  { degree: 9, yearsAtPrevious: 10, cumulativeYears: 48, cumulativeAtLeast: true, appearance: 'red', label: '9th degree', beltLabel: 'Red' },
];

export const DEGREE_GUIDELINE = 'These are guideline minimums. Your instructor or federation decides.';

/** Caption under the degree tiles on My rank. */
export const DEGREE_TILE_CAPTION =
  'Years are guideline minimums, counted since your black belt. Your instructor or federation decides when a degree is awarded.';

export const INSTRUCTOR_BARS_LABEL = 'Instructor bars (some schools award these at about 2 years)';

export const INSTRUCTOR_BARS_NOTE = 'Some schools award instructor bars at about 2 years.';

/**
 * Coral and red show once the student is wearing a black belt or a rank past it.
 * A black belt kept only in history stays on the ladder and does not open Coral.
 */
export function coralRanksUnlocked(belt: ProgressBelt): boolean {
  return belt === 'black' || belt === 'coral' || belt === 'redWhite' || belt === 'red';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function degreeRule(degree: number): BlackDegreeRule | null {
  return BLACK_DEGREE_TABLE.find((row) => row.degree === degree) ?? null;
}

/** The next degree after the one the student wears. Degree 0 is plain black. Degree 9 has no next step. */
export function nextDegreeRule(degree: number): BlackDegreeRule | null {
  if (!Number.isInteger(degree) || degree < 0) return null;
  return degreeRule(degree + 1);
}

export function finalRankRules(): readonly BlackDegreeRule[] {
  return BLACK_DEGREE_TABLE.filter((row) => row.degree >= 7);
}

/** Degree on the belt the student wears. Null on white through brown and on kids belts. */
export function wornDegree(belt: ProgressBelt, tapeCount: number): number | null {
  if (belt === 'black') {
    if (!Number.isInteger(tapeCount) || tapeCount < 0) return 0;
    return Math.min(6, tapeCount);
  }
  if (belt === 'coral') return 7;
  if (belt === 'redWhite') return 8;
  if (belt === 'red') return 9;
  return null;
}

export function isPostBlackBelt(belt: ProgressBelt): boolean {
  return belt === 'black' || belt === 'coral' || belt === 'redWhite' || belt === 'red';
}

/** "Black" at degree 0, otherwise the table label ("3rd degree"). */
export function degreeLabel(degree: number): string {
  if (degree <= 0) return 'Black';
  return degreeRule(degree)?.label ?? `${degree}th degree`;
}

/** The rank the years are spent at. Degree 0 is the black belt itself. */
export function yearsAtName(degree: number): string {
  if (degree <= 0) return 'black belt';
  return degreeLabel(degree);
}

export function cumulativeText(rule: BlackDegreeRule): string {
  const years = rule.cumulativeAtLeast ? `${rule.cumulativeYears}+` : String(rule.cumulativeYears);
  return `${years} years as a black belt`;
}

export function degreeHeadline(belt: ProgressBelt, tapeCount: number): string {
  const degree = wornDegree(belt, tapeCount);
  if (degree == null) return '';
  const rule = degreeRule(degree);
  if (!rule || degree <= 6) {
    return degree <= 0 ? 'Black belt' : `Black · ${degreeLabel(degree)}`;
  }
  return `${rule.label} · ${rule.beltLabel}`;
}

export type RankDateSource = {
  belt: string;
  awardedOn: string;
  tapeCount: number;
  tapeDates: readonly string[];
  highDegreeDates?: readonly string[];
  history?: readonly {
    belt: string;
    awardedOn: string;
    tapeCount: number;
    tapeDates: readonly string[];
    highDegreeDates?: readonly string[];
  }[];
};

function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function pushBeltDates(
  dates: string[],
  belt: string,
  awardedOn: string,
  tapeCount: number,
  tapeDates: readonly string[],
  high: readonly string[] | undefined,
): void {
  if (belt !== 'black' && belt !== 'coral' && belt !== 'redWhite' && belt !== 'red') return;
  if (isIsoDate(awardedOn)) dates.push(awardedOn);
  if (belt !== 'black') return;
  const count = Math.max(0, Math.min(6, tapeCount));
  for (let index = 0; index < Math.min(count, 4); index += 1) {
    const date = tapeDates[index] ?? '';
    if (isIsoDate(date)) dates.push(date);
  }
  const extra = Math.max(0, count - 4);
  for (let index = 0; index < extra; index += 1) {
    const date = high?.[index] ?? '';
    if (isIsoDate(date)) dates.push(date);
  }
}

/** Promotion dates that count as time as a black belt. Colored-belt dates are not included. */
export function blackBeltPromotionDates(source: RankDateSource): string[] {
  const dates: string[] = [];
  pushBeltDates(dates, source.belt, source.awardedOn, source.tapeCount, source.tapeDates, source.highDegreeDates);
  for (const row of source.history ?? []) {
    pushBeltDates(dates, row.belt, row.awardedOn, row.tapeCount, row.tapeDates, row.highDegreeDates);
  }
  return dates;
}

export function earliestDate(dates: readonly string[]): string {
  return dates.reduce((soonest, date) => (soonest === '' || date < soonest ? date : soonest), '');
}

export type ElapsedTime = { years: number; months: number };

/** Whole years and leftover months from `fromIso` to `todayIso`. A future date is 0 years 0 months. */
export function yearsAndMonths(fromIso: string, todayIso: string): ElapsedTime | null {
  if (!isIsoDate(fromIso) || !isIsoDate(todayIso)) return null;
  if (todayIso < fromIso) return { years: 0, months: 0 };
  const [fromYear, fromMonth, fromDay] = fromIso.split('-').map(Number);
  const [toYear, toMonth, toDay] = todayIso.split('-').map(Number);
  let years = toYear - fromYear;
  let months = toMonth - fromMonth;
  if (toDay < fromDay) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: 0, months: 0 };
  return { years, months };
}

export type BlackBeltClock = { earliest: string; years: number; months: number };

export function blackBeltClock(source: RankDateSource, todayIso: string): BlackBeltClock | null {
  const earliest = earliestDate(blackBeltPromotionDates(source));
  if (!earliest) return null;
  const elapsed = yearsAndMonths(earliest, todayIso);
  if (!elapsed) return null;
  return { earliest, years: elapsed.years, months: elapsed.months };
}

export function timeSoFarText(clock: ElapsedTime): string {
  const years = clock.years === 1 ? '1 year' : `${clock.years} years`;
  const months = clock.months === 1 ? '1 month' : `${clock.months} months`;
  return `${years} ${months} so far`;
}

export function instructorBarsLine(on: boolean, date: string): string {
  const state = on ? 'Instructor bars: on.' : 'Instructor bars: off.';
  return isIsoDate(date) ? `${state} Date ${date}.` : state;
}

export function appearanceFor(belt: ProgressBelt): DegreeAppearance | null {
  if (belt === 'black') return 'black';
  if (belt === 'coral') return 'red-black';
  if (belt === 'redWhite') return 'red-white';
  if (belt === 'red') return 'red';
  return null;
}

export function emptyHighDegreeDates(): HighDegreeDates {
  return ['', ''];
}

/** Keep degree 5 and 6 dates that are still on the belt. Degree 4 and under omit the field. */
export function highDatesForCount(dates: readonly string[] | null | undefined, count: number): HighDegreeDates | undefined {
  if (count <= 4) return undefined;
  const next = emptyHighDegreeDates();
  const source = dates ?? [];
  const extra = Math.min(2, count - 4);
  for (let index = 0; index < extra; index += 1) {
    const value = (source[index] ?? '').trim();
    next[index] = isIsoDate(value) ? value : '';
  }
  return next;
}
