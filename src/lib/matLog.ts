/**
 * One shared mat hour log: the student journal. Quick-add, calendar "trained"
 * marks and full journal cards all write journal entries, so the journal,
 * calendar, streak and mat hours total read the same records. Same day + same
 * session from any entry point updates the existing record instead of adding
 * a second one, so nothing double-counts.
 */
import { addJournalEntry } from './studentEdition.ts';
import { clampMinutes, sessionOf } from './matHours.ts';
import type { JournalEntry, JournalSession, StudentProgressReport } from './progress/types.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isSession(entry: JournalEntry): boolean {
  return !entry.hiatus;
}

/** The record a day + session already has: a matching session, else an untimed, untyped mark. */
export function findSessionRecord(journal: readonly JournalEntry[], date: string, session: JournalSession): JournalEntry | undefined {
  const day = journal.filter((entry) => entry.date === date && isSession(entry));
  return (
    day.find((entry) => sessionOf(entry) === session) ??
    day.find((entry) => !entry.session && !entry.minutes)
  );
}

/** Quick-add: log time for a day + session. Updates the existing record if one exists. */
export function logMatTime(
  report: StudentProgressReport,
  input: { date: string; session: JournalSession; minutes: number; sessionOther?: string },
  now = Date.now(),
): StudentProgressReport {
  if (!DATE_RE.test(input.date)) throw new Error('Date must be YYYY-MM-DD.');
  const minutes = clampMinutes(input.minutes);
  if (!minutes) throw new Error('Pick a duration.');
  const existing = findSessionRecord(report.journal, input.date, input.session);
  if (existing) {
    return {
      ...report,
      journal: report.journal.map((entry) => (entry.id === existing.id ? { ...entry, minutes, session: input.session, ...(input.session === 'other' && input.sessionOther?.trim() ? { sessionOther: input.sessionOther.trim().slice(0, 80) } : {}), updatedAt: now } : entry)),
      updatedAt: now,
    };
  }
  return addJournalEntry(
    report,
    { date: input.date, className: '', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: '', session: input.session, sessionOther: input.sessionOther, minutes },
    now,
  );
}

/** Calendar "trained" mark: a session with no time yet. No-op when the day already has a session. */
export function markTrained(report: StudentProgressReport, date: string, now = Date.now()): StudentProgressReport {
  if (!DATE_RE.test(date)) throw new Error('Date must be YYYY-MM-DD.');
  if (report.journal.some((entry) => entry.date === date && isSession(entry))) return report;
  return addJournalEntry(report, { date, className: '', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: '' }, now);
}

/** Untimed session records on a day (calendar marks or old cards waiting for a time). */
export function untimedOn(journal: readonly JournalEntry[], date: string): JournalEntry[] {
  return journal.filter((entry) => entry.date === date && isSession(entry) && !entry.minutes);
}
