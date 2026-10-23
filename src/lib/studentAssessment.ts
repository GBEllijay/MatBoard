/**
 * Self-assessment on this phone. Separate from the progress file, same idea as
 * scouting cards: the student owns it, and Advantage does not host it.
 */

import type { StudentProgressReport } from './progress/types.ts';
import { PROGRESS_NOTE_MAX } from './progress/types.ts';
import { beltLevel } from './studentTools.ts';

export const ASSESSMENT_STORAGE_KEY = 'matboard.studentEdition.assessment.v1';
export const ASSESSMENT_MAX = 400;

export const ASSESSMENT_AREAS = [
  { id: 'guard', label: 'Guard' },
  { id: 'passing', label: 'Passing' },
  { id: 'takedowns', label: 'Takedowns' },
  { id: 'escapes', label: 'Escapes' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'mindset', label: 'Mindset' },
] as const;

export type AssessmentAreaId = (typeof ASSESSMENT_AREAS)[number]['id'];
export type AssessmentScore = 1 | 2 | 3 | 4 | 5;
export type AssessmentScores = Record<AssessmentAreaId, AssessmentScore>;

export type AssessmentEntry = {
  id: string;
  date: string;
  note: string;
  scores: AssessmentScores;
};

export type AssessmentState = {
  entries: AssessmentEntry[];
};

export type AssessmentDraft = {
  date: string;
  note: string;
  scores: Partial<Record<AssessmentAreaId, number>>;
};

export type AssessmentCheckpointLink = {
  areaId: AssessmentAreaId;
  checkpointId: string;
  checkpointName: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AREA_IDS = ASSESSMENT_AREAS.map((area) => area.id);

/** Words on a belt checkpoint that belong to a self-rating. Whole words only. */
const AREA_WORDS: Record<AssessmentAreaId, readonly string[]> = {
  guard: ['guard'],
  passing: ['passing', 'passes', 'pass'],
  takedowns: ['takedown', 'takedowns'],
  escapes: ['escape', 'escapes'],
  submissions: ['submission', 'submissions', 'choke', 'chokes'],
  conditioning: ['conditioning'],
  mindset: ['mindset'],
};

type MemoryStore = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyAssessments(): AssessmentState {
  return { entries: [] };
}

export function assessmentAverage(scores: AssessmentScores): number {
  const total = AREA_IDS.reduce((sum, id) => sum + scores[id], 0);
  return Math.round((total / AREA_IDS.length) * 10) / 10;
}

/** Oldest first, for the trend line. */
export function assessmentTrend(entries: readonly AssessmentEntry[]): { date: string; average: number }[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((entry) => ({ date: entry.date, average: assessmentAverage(entry.scores) }));
}

export function loadAssessments(storage: Pick<Storage, 'getItem'>): AssessmentState {
  try {
    const raw = storage.getItem(ASSESSMENT_STORAGE_KEY);
    if (!raw) return emptyAssessments();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyAssessments();
  }
}

export function writeAssessments(storage: MemoryStore, state: AssessmentState): AssessmentState {
  const clean = normalizeState(state);
  storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(clean));
  return loadAssessments(storage);
}

/** One check-in per date. Saving the same day again replaces that day. */
export function saveAssessment(state: AssessmentState, draft: AssessmentDraft, now = Date.now()): AssessmentState {
  const date = requireDate(draft.date);
  const note = cleanNote(draft.note);
  const scores = requireScores(draft.scores);
  const existing = state.entries.find((entry) => entry.date === date);
  const nextEntry: AssessmentEntry = existing
    ? { ...existing, note, scores }
    : { id: newId(now), date, note, scores };
  const entries = existing
    ? state.entries.map((entry) => (entry.date === date ? nextEntry : entry))
    : [...state.entries, nextEntry];
  return normalizeState({ entries });
}

export function removeAssessment(state: AssessmentState, id: string): AssessmentState {
  return normalizeState({ entries: state.entries.filter((entry) => entry.id !== id) });
}

/**
 * Current belt first, then the rest of the rubric. An area links only when a
 * checkpoint name uses one of that area's words.
 */
export function checkpointLinks(report: StudentProgressReport): AssessmentCheckpointLink[] {
  const current = beltLevel(report, report.profile.belt);
  const rest = report.rubric.levels.filter((level) => level !== current);
  const levels = current ? [current, ...rest] : rest;
  const links: AssessmentCheckpointLink[] = [];
  for (const area of ASSESSMENT_AREAS) {
    const hit = levels
      .flatMap((level) => level.checkpoints)
      .find((row) => nameHits(row.name, AREA_WORDS[area.id]));
    if (!hit) continue;
    links.push({ areaId: area.id, checkpointId: hit.id, checkpointName: hit.name });
  }
  return links;
}

function nameHits(name: string, words: readonly string[]): boolean {
  const tokens = name
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((word) => tokens.includes(word));
}

function requireScores(scores: Partial<Record<AssessmentAreaId, number>>): AssessmentScores {
  const next = {} as AssessmentScores;
  for (const id of AREA_IDS) {
    const value = scores[id];
    if (!isScore(value)) throw new Error(`Rate ${labelFor(id)} from 1 to 5.`);
    next[id] = value;
  }
  return next;
}

function labelFor(id: AssessmentAreaId): string {
  return ASSESSMENT_AREAS.find((area) => area.id === id)?.label ?? id;
}

export function isAssessmentScore(value: unknown): value is AssessmentScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isScore(value: unknown): value is AssessmentScore {
  return isAssessmentScore(value);
}

function requireDate(value: string): string {
  const date = value.trim();
  if (!DATE_RE.test(date)) throw new Error('Date must be YYYY-MM-DD.');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error('Date must be YYYY-MM-DD.');
  }
  return date;
}

function cleanNote(value: string): string {
  const note = value.trim();
  if (note.length > PROGRESS_NOTE_MAX) throw new Error('Note is too long.');
  return note;
}

function normalizeState(raw: unknown): AssessmentState {
  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
  const kept: AssessmentEntry[] = [];
  for (const row of entries) {
    const entry = normalizeEntry(row);
    if (!entry) continue;
    const sameDay = kept.findIndex((item) => item.date === entry.date);
    if (sameDay >= 0) kept[sameDay] = entry;
    else kept.push(entry);
  }
  kept.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  if (kept.length > ASSESSMENT_MAX) {
    kept.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return { entries: kept.slice(kept.length - ASSESSMENT_MAX).sort((a, b) => b.date.localeCompare(a.date)) };
  }
  return { entries: kept };
}

function normalizeEntry(raw: unknown): AssessmentEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<AssessmentEntry>;
  if (typeof row.id !== 'string' || !row.id.trim()) return null;
  if (typeof row.date !== 'string' || !DATE_RE.test(row.date)) return null;
  if (typeof row.note !== 'string') return null;
  try {
    const scores = requireScores((row.scores ?? {}) as Partial<Record<AssessmentAreaId, number>>);
    return { id: row.id.trim().slice(0, 80), date: row.date, note: row.note.trim().slice(0, PROGRESS_NOTE_MAX), scores };
  } catch {
    return null;
  }
}

function newId(now: number): string {
  return `assess.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}
