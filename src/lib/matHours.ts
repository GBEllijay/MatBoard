/**
 * Student mat hours. The student logs time on the mat on each journal card.
 * Personal tracking only: coach files and card shares never carry the journal,
 * so mat hours stay on the student's file, its backups, and the student's own
 * Advantage Cloud / Drive / OneDrive copy of that file.
 */
import { JOURNAL_MINUTES_MAX, type JournalEntry, type JournalSession } from './progress/types.ts';

export { JOURNAL_MINUTES_MAX };
export const JOURNAL_SESSION_LABELS: Record<JournalSession, string> = { class: 'Class', openMat: 'Open mat', misc: 'Miscellaneous', other: 'Other' };

/** "Other · Wrestling" when an Other session has text, else the plain label. */
export function sessionLabel(session: JournalSession, other = ''): string {
  return session === 'other' && other.trim() ? `Other · ${other.trim()}` : JOURNAL_SESSION_LABELS[session];
}

/** Time picker: every minute from 0 (untimed) to 12h; 10-minute marks are soft detents. */
export function matMinuteOptions(): { value: number; label: string; detent?: boolean }[] {
  return Array.from({ length: JOURNAL_MINUTES_MAX + 1 }, (_, value) => ({ value, label: value ? clockMatTime(value) : 'Untimed', detent: value > 0 && value % 10 === 0 }));
}

/** Log mat time only. 0, then every 15 minutes through 12h. Hour marks are the soft detents. */
export function matQuarterOptions(): { value: number; label: string; detent?: boolean }[] {
  const options: { value: number; label: string; detent?: boolean }[] = [];
  for (let value = 0; value <= JOURNAL_MINUTES_MAX; value += 15) {
    options.push({ value, label: value ? clockMatTime(value) : 'Untimed', detent: value > 0 && value % 60 === 0 });
  }
  return options;
}

/** Types offered on Log mat time. Other stays in the journal model and is not a choice here. */
export const MAT_LOG_SESSIONS = ['class', 'openMat', 'misc'] as const;

/** Short pill labels. `misc` is still the stored session. */
export const MAT_LOG_SESSION_LABELS: Record<(typeof MAT_LOG_SESSIONS)[number], string> = {
  class: 'Class',
  openMat: 'Open mat',
  misc: 'Misc',
};

/** Whole minutes from 0 to 720. Anything else is 0 (untimed). */
export function clampMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(JOURNAL_MINUTES_MAX, Math.round(value)));
}

/** Class or open mat. Older cards with no session read the class name. */
export function sessionOf(entry: Pick<JournalEntry, 'session' | 'body'>): JournalSession {
  if (entry.session) return entry.session;
  const line = entry.body.split('\n').find((row) => row.startsWith('Class:')) ?? '';
  return /open\s*-?\s*mat/i.test(line) ? 'openMat' : 'class';
}

/** "1h 30m", "45m", "2h". Empty for 0. */
export function formatMatTime(minutes: number): string {
  const total = clampMinutes(minutes);
  if (!total) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "h:mm" on the stepper. */
export function clockMatTime(minutes: number): string {
  const total = clampMinutes(minutes);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Hours with at most one decimal: 128.5, 2, 0.3. */
export function formatHours(minutes: number): string {
  const tenths = Math.round(minutes / 6);
  const text = (tenths / 10).toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

export type MatHoursTotal = {
  minutes: number;
  classMinutes: number;
  openMatMinutes: number;
  /** Miscellaneous and Other sessions. */
  otherMinutes: number;
  timed: number;
  untimed: number;
};

/** Derived from journal durations. Untimed cards count as 0. */
export function matHoursTotal(journal: readonly JournalEntry[]): MatHoursTotal {
  const total: MatHoursTotal = { minutes: 0, classMinutes: 0, openMatMinutes: 0, otherMinutes: 0, timed: 0, untimed: 0 };
  for (const entry of journal) {
    const minutes = clampMinutes(entry.minutes);
    if (!minutes) {
      total.untimed += 1;
      continue;
    }
    total.timed += 1;
    total.minutes += minutes;
    const kind = sessionOf(entry);
    if (kind === 'openMat') total.openMatMinutes += minutes;
    else if (kind === 'class') total.classMinutes += minutes;
    else total.otherMinutes += minutes;
  }
  return total;
}

/** "128.5 mat hours" / "1 mat hour". */
export function matHoursLabel(minutes: number): string {
  const hours = formatHours(minutes);
  return `${hours} mat ${hours === '1' ? 'hour' : 'hours'}`;
}

/** "Class 100 · Open mat 28.5", or empty when only one kind has time. */
export function matHoursSplit(total: MatHoursTotal): string {
  const parts = [
    total.classMinutes ? `Class ${formatHours(total.classMinutes)}` : '',
    total.openMatMinutes ? `Open mat ${formatHours(total.openMatMinutes)}` : '',
    total.otherMinutes ? `Other ${formatHours(total.otherMinutes)}` : '',
  ].filter(Boolean);
  return parts.length > 1 ? parts.join(' · ') : '';
}

/** Optional long view on tap: "5.3 days on the mat" or "1.2 years on the mat" (24h days). */
export function matHoursLongLabel(minutes: number): string {
  const days = minutes / 1440;
  if (days >= 365) return `${(days / 365).toFixed(2)} years on the mat`;
  return `${days.toFixed(1)} days on the mat`;
}
