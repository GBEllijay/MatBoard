/**
 * Readers for the coach → student sync packets added after rank and
 * competition: belt progress (benchmarks) and coach assessments.
 * Pure functions with no storage, so the Pages Function can share them.
 *
 * The coach never sets the student's own marks: the status key is
 * `coachStatus`, and `met`, `checklist`, `rubric`, `journal`, and `goals`
 * are refused by the callers before these run.
 */

import {
  COACH_BENCHMARK_STATUSES,
  type CoachAssessment,
  type CoachBeltProgress,
  type CoachBenchmarkStatus,
  type CoachBenchmarkView,
  type CoachNote,
} from './types.ts';

/** Same ids as ASSESSMENT_AREAS in studentAssessment.ts. A test keeps them equal. */
export const SYNC_ASSESSMENT_AREA_IDS = [
  'guard',
  'passing',
  'takedowns',
  'escapes',
  'submissions',
  'conditioning',
  'mindset',
] as const;

export const SYNC_BELTS = [
  'white',
  'blue',
  'purple',
  'brown',
  'black',
  'grey',
  'yellow',
  'orange',
  'green',
  'coral',
  'redWhite',
  'red',
] as const;

export const SYNC_NOTE_MAX = 500;
export const SYNC_NAME_MAX = 80;
export const SYNC_BENCHMARK_MAX = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export function realSyncDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isStatus(value: unknown): value is CoachBenchmarkStatus {
  return typeof value === 'string' && (COACH_BENCHMARK_STATUSES as readonly string[]).includes(value);
}

export function readCoachBeltProgress(raw: unknown, errors: string[]): CoachBeltProgress {
  const empty: CoachBeltProgress = { belt: 'white', issuedOn: '1970-01-01', note: '', benchmarks: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('Belt progress is missing.');
    return empty;
  }
  const row = raw as Record<string, unknown>;
  const belt = typeof row.belt === 'string' && (SYNC_BELTS as readonly string[]).includes(row.belt) ? row.belt : '';
  if (!belt) errors.push('Belt progress needs a known belt.');
  if (!realSyncDay(row.issuedOn)) errors.push('Belt progress needs a real date.');
  if (typeof row.note === 'string' && row.note.trim().length > SYNC_NOTE_MAX) errors.push('The coach note is too long.');
  const benchmarks: CoachBenchmarkView[] = [];
  if (!Array.isArray(row.benchmarks) || row.benchmarks.length === 0) {
    errors.push('Belt progress needs at least one benchmark.');
  } else if (row.benchmarks.length > SYNC_BENCHMARK_MAX) {
    errors.push(`Belt progress can carry up to ${SYNC_BENCHMARK_MAX} benchmarks.`);
  } else {
    const seen = new Set<string>();
    for (const item of row.benchmarks) {
      const mark = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      const targetId = typeof mark?.targetId === 'string' ? mark.targetId.trim() : '';
      const name = text(mark?.name, SYNC_NAME_MAX);
      if (!mark || !TARGET_RE.test(targetId) || !name || !isStatus(mark.coachStatus)) {
        errors.push('Each benchmark needs an id, a name, and a coach status of not-yet, working, or ready.');
        break;
      }
      if (seen.has(targetId)) continue;
      seen.add(targetId);
      benchmarks.push({ targetId, name, coachStatus: mark.coachStatus, note: text(mark.note, SYNC_NOTE_MAX) });
    }
  }
  return {
    belt: belt || 'white',
    issuedOn: realSyncDay(row.issuedOn) ? row.issuedOn : empty.issuedOn,
    note: text(row.note, SYNC_NOTE_MAX),
    benchmarks,
  };
}

export function readCoachAssessment(raw: unknown, errors: string[]): CoachAssessment {
  const empty: CoachAssessment = { date: '1970-01-01', note: '', scores: {}, strengths: '', weaknesses: '' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('The coach assessment is missing.');
    return empty;
  }
  const row = raw as Record<string, unknown>;
  if (!realSyncDay(row.date)) errors.push('The coach assessment needs a real date.');
  for (const key of ['note', 'strengths', 'weaknesses'] as const) {
    if (typeof row[key] === 'string' && (row[key] as string).trim().length > SYNC_NOTE_MAX) {
      errors.push('A coach assessment note is too long.');
    }
  }
  const scores: Record<string, number> = {};
  const rawScores = row.scores && typeof row.scores === 'object' && !Array.isArray(row.scores)
    ? (row.scores as Record<string, unknown>)
    : null;
  if (!rawScores) {
    errors.push('The coach assessment needs scores.');
  } else {
    for (const [key, value] of Object.entries(rawScores)) {
      if (!(SYNC_ASSESSMENT_AREA_IDS as readonly string[]).includes(key)) continue;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
        errors.push('Coach assessment scores run 1 to 5.');
        break;
      }
      scores[key] = value;
    }
    if (!Object.keys(scores).length) errors.push('The coach assessment needs at least one score.');
  }
  return {
    date: realSyncDay(row.date) ? row.date : empty.date,
    note: text(row.note, SYNC_NOTE_MAX),
    scores,
    strengths: text(row.strengths, SYNC_NOTE_MAX),
    weaknesses: text(row.weaknesses, SYNC_NOTE_MAX),
  };
}

export const COACH_NOTE_MAX = 1000;

export function readCoachNote(raw: unknown, errors: string[]): CoachNote {
  const empty: CoachNote = { issuedOn: '1970-01-01', journalDate: '', note: '' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('The coach note is missing.');
    return empty;
  }
  const row = raw as Record<string, unknown>;
  if (!realSyncDay(row.issuedOn)) errors.push('The coach note needs a real date.');
  const journalDate = typeof row.journalDate === 'string' ? row.journalDate.trim() : '';
  if (journalDate && !realSyncDay(journalDate)) errors.push('The journal date must be a real YYYY-MM-DD date.');
  const note = typeof row.note === 'string' ? row.note.trim() : '';
  if (!note) errors.push('Write a note before sending.');
  if (note.length > COACH_NOTE_MAX) errors.push(`A coach note can be up to ${COACH_NOTE_MAX} characters.`);
  return {
    issuedOn: realSyncDay(row.issuedOn) ? row.issuedOn : empty.issuedOn,
    journalDate: realSyncDay(journalDate) ? journalDate : '',
    note: note.slice(0, COACH_NOTE_MAX),
  };
}
