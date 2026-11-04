/**
 * Week-based training streak. A week (Monday–Sunday) counts when the student
 * logs at least `target` sessions (2 or 3, default 2). Hiatus weeks pause the
 * streak instead of breaking it. The current week never breaks it while it is
 * still in progress. Deliberately weekly so nothing nudges daily training.
 */
import type { JournalEntry } from './progress/types.ts';

export const STREAK_TARGETS = [2, 3] as const;
export type StreakTarget = (typeof STREAK_TARGETS)[number];
export const STREAK_TARGET_KEY = 'matboard.student.streakTarget.v1';
const WEEKS_MAX = 520;

export function readStreakTarget(storage: Pick<Storage, 'getItem'> | null): StreakTarget {
  return storage?.getItem(STREAK_TARGET_KEY) === '3' ? 3 : 2;
}

export function saveStreakTarget(storage: Pick<Storage, 'setItem'>, target: StreakTarget): void {
  storage.setItem(STREAK_TARGET_KEY, String(target === 3 ? 3 : 2));
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the week holding `day`, as YYYY-MM-DD. */
export function weekStart(day: string): string {
  const date = parse(day);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return iso(date);
}

function addDays(day: string, days: number): string {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

/** A card is a session unless it only marks a break. */
export function isSession(entry: JournalEntry): boolean {
  return !entry.hiatus;
}

export type StreakView = {
  weeks: number;
  target: StreakTarget;
  thisWeek: number;
  /** True when this week is covered by a break. */
  paused: boolean;
};

export function trainingStreak(journal: readonly JournalEntry[], today: string, target: StreakTarget = 2): StreakView {
  const counts = new Map<string, number>();
  const breaks: { start: string; end: string }[] = [];
  for (const entry of journal) {
    if (entry.hiatus) breaks.push({ start: entry.hiatus.start || entry.date, end: entry.hiatus.end || today });
    if (!isSession(entry) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
    const week = weekStart(entry.date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const onBreak = (week: string) => {
    const end = addDays(week, 6);
    return breaks.some((row) => row.start <= end && row.end >= week);
  };
  const current = weekStart(today);
  const thisWeek = counts.get(current) ?? 0;
  let weeks = thisWeek >= target ? 1 : 0;
  let week = addDays(current, -7);
  for (let i = 0; i < WEEKS_MAX; i += 1) {
    if ((counts.get(week) ?? 0) >= target) weeks += 1;
    else if (!onBreak(week)) break;
    week = addDays(week, -7);
  }
  return { weeks, target, thisWeek, paused: thisWeek < target && onBreak(current) };
}

/** "3-week streak", with copy that never asks for daily training. */
/** "Training streak: 3 weeks" (digits; 0 → "0 weeks", 1 → "1 week"). */
export function streakLabel(view: Pick<StreakView, 'weeks'>): string {
  const n = Math.max(0, Math.floor(view.weeks || 0));
  return `Training streak: ${n} ${n === 1 ? 'week' : 'weeks'}`;
}

export function streakWeekLine(view: StreakView): string {
  if (view.paused) return 'On a break — your streak is paused, not lost.';
  const done = Math.min(view.thisWeek, view.target);
  return `This week: ${done} of ${view.target} sessions${view.thisWeek >= view.target ? ' — week counted. Rest is training too.' : ''}`;
}
