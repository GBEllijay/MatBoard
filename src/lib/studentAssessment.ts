/**
 * Self-assessment on this phone. Separate from the progress file, same idea as
 * scouting cards: the student owns it, and Advantage does not host it.
 */

import type { StudentProgressReport } from './progress/types.ts';
import { PROGRESS_NOTE_MAX } from './progress/types.ts';
import { beginAppStudentSave, endAppStudentSave } from './studentDemo.ts';
import { beltLevel } from './studentTools.ts';

export const ASSESSMENT_STORAGE_KEY = 'matboard.studentEdition.assessment.v1';
export const ASSESSMENT_MAX = 400;

/**
 * The seven faces every saved check-in has had since the first version.
 * A stored day must have all seven to load. Use ASSESSMENT_FORM_AREAS for the
 * eight faces a student rates, saves, sees on the chart, and exports.
 */
export const ASSESSMENT_AREAS = [
  { id: 'guard', label: 'Guard' },
  { id: 'passing', label: 'Passing' },
  { id: 'takedowns', label: 'Takedowns' },
  { id: 'escapes', label: 'Escapes' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'mindset', label: 'Mindset' },
] as const;

/**
 * The eight D8 faces, in check-in form order. Labels on this list are the approved names.
 * Stored ids stay guard and escapes so an older file still loads.
 * Sweeps is a full face: a new check-in needs it, and a new day carries it over.
 * A day saved before Sweeps existed still loads with Sweeps unrated, not a copy of Passing.
 */
export const ASSESSMENT_FORM_AREAS = [
  { id: 'guard', label: 'Guard/Control' },
  { id: 'passing', label: 'Passing' },
  { id: 'sweeps', label: 'Sweeps' },
  { id: 'takedowns', label: 'Takedowns' },
  { id: 'escapes', label: 'Escapes/Defense' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'mindset', label: 'Mindset' },
] as const;

/**
 * Personal goals for the technique-based check-in.
 * Generic mode rates Mindset as one face and does not score these lines.
 * A missing line is unscored. It is not a zero, and it is not required to save.
 */
export const MINDSET_GOALS = [
  { id: 'calm-focused', label: "I've formed a routine and habit that keeps me calm and focused" },
  { id: 'intentional-roll', label: 'I was intentional with my decisions throughout the roll' },
  { id: 'game-plan', label: 'I drilled with my game plan in mind' },
  { id: 'prepared', label: "I've done everything I could to be prepared for my challenge" },
  { id: 'coach-instructions', label: "I listened to and followed my coach's instructions" },
  { id: 'open-mind', label: 'I approach training with an open mind, ready to receive new information' },
] as const;

/**
 * Context under the generic Conditioning face.
 * Stamina, power, and flexibility are named there. They are not separate ratings.
 * A missing older line is unscored. It is not a zero, and it is not required to save.
 * None of these lines is a promotion benchmark.
 */
export const CONDITIONING_ITEMS = [
  { id: 'warmup', label: 'Warm-up difficulty — ability to complete the warm-up' },
  { id: 'recovery', label: 'Recovery time — tracked only, no benchmark' },
  { id: 'speed', label: 'Speed' },
  { id: 'stamina', label: 'Stamina during live rolls' },
  { id: 'power', label: 'Power' },
  { id: 'flexibility', label: 'Flexibility' },
] as const;

export type AssessmentAreaId = (typeof ASSESSMENT_AREAS)[number]['id'];
/** One of the eight D8 faces, Sweeps included. */
export type AssessmentFaceId = (typeof ASSESSMENT_FORM_AREAS)[number]['id'];
export type MindsetGoalId = (typeof MINDSET_GOALS)[number]['id'];
export type ConditioningItemId = (typeof CONDITIONING_ITEMS)[number]['id'];
export type AssessmentScore = 1 | 2 | 3 | 4 | 5;
/**
 * Sweeps is typed optional only so a day saved before that face existed still loads.
 * Every new save stores all eight.
 */
export type AssessmentScores = Record<AssessmentAreaId, AssessmentScore> & {
  sweeps?: AssessmentScore;
};
export type MindsetGoalScores = Partial<Record<MindsetGoalId, AssessmentScore>>;
export type ConditioningItemScores = Partial<Record<ConditioningItemId, AssessmentScore>>;

/**
 * A face the student rated directly on the generic check-in.
 * Legacy sub-lines stay stored. They no longer cover that face.
 */
export type DirectFaces = {
  conditioning?: true;
  mindset?: true;
};

export type AssessmentEntry = {
  id: string;
  date: string;
  note: string;
  scores: AssessmentScores;
  /** Present only when at least one Mindset goal was scored. Older days omit it. */
  mindsetGoals?: MindsetGoalScores;
  /** Present only when at least one Conditioning item was scored. Older days omit it. */
  conditioningItems?: ConditioningItemScores;
  /** Omitted until the student rates that face on the generic check-in. */
  directFaces?: DirectFaces;
};

export type AssessmentState = {
  entries: AssessmentEntry[];
};

export type AssessmentDraft = {
  date: string;
  note: string;
  scores: Partial<AssessmentScores>;
  /**
   * Omit a key to leave that saved day's lines alone.
   * Pass an object, including an empty one, to replace them.
   */
  mindsetGoals?: MindsetGoalScores;
  conditioningItems?: ConditioningItemScores;
  directFaces?: DirectFaces;
};

export type AssessmentCheckpointLink = {
  areaId: AssessmentFaceId;
  checkpointId: string;
  checkpointName: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AREA_IDS = ASSESSMENT_AREAS.map((area) => area.id);
const FACE_IDS = ASSESSMENT_FORM_AREAS.map((area) => area.id);

/** Words on a belt checkpoint that belong to a self-rating. Whole words only. */
const AREA_WORDS: Record<AssessmentFaceId, readonly string[]> = {
  guard: ['guard'],
  passing: ['passing', 'passes', 'pass'],
  sweeps: ['sweep', 'sweeps'],
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

/** Average of the eight faces. A day saved before Sweeps existed averages the faces it has. */
export function assessmentAverage(scores: AssessmentScores): number {
  const rated = FACE_IDS.map((id) => scores[id]).filter(isAssessmentScore);
  if (!rated.length) return 0;
  return Math.round((rated.reduce((sum, value) => sum + value, 0) / rated.length) * 10) / 10;
}

/** Oldest first, for the trend line. */
export function assessmentTrend(entries: readonly AssessmentEntry[]): { date: string; average: number }[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((entry) => ({ date: entry.date, average: assessmentAverage(displayedAssessmentScores(entry)) }));
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
  beginAppStudentSave();
  try {
    storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(clean));
  } finally {
    endAppStudentSave();
  }
  return loadAssessments(storage);
}

/**
 * Short names under the generic Conditioning face.
 * The three lines are context, not a second set of ratings.
 */
export function conditioningContextText(): string {
  const short: Record<(typeof CONDITIONING_ITEMS)[number]['id'], string> = {
    warmup: 'Warm-up',
    recovery: 'Recovery',
    speed: 'Speed',
    stamina: 'Stamina',
    power: 'power',
    flexibility: 'flexibility',
  };
  const names = (['stamina', 'power', 'flexibility'] as const).flatMap((id) =>
    CONDITIONING_ITEMS.some((item) => item.id === id) ? [short[id]] : [],
  );
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]}.`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')}, and ${last}.`;
}

/**
 * One number per face for the check-in.
 * Legacy sub-lines average into Conditioning or Mindset until that face is rated directly.
 * The stored face score and the lines themselves are left as saved.
 */
export function displayedAssessmentScores(
  entry: Pick<AssessmentEntry, 'scores' | 'mindsetGoals' | 'conditioningItems' | 'directFaces'>,
): AssessmentScores {
  const scores: AssessmentScores = { ...entry.scores };
  if (!entry.directFaces?.mindset) {
    const averaged = mindsetScoreFromGoals(entry.mindsetGoals);
    if (averaged) scores.mindset = averaged;
  }
  if (!entry.directFaces?.conditioning) {
    const averaged = conditioningScoreFromItems(entry.conditioningItems);
    if (averaged) scores.conditioning = averaged;
  }
  return scores;
}

/**
 * One check-in per date. Saving the same day again replaces that day. Face scores are the numbers passed in.
 * All eight faces are required. The one exception: re-saving a day that was stored before Sweeps
 * existed may leave Sweeps unrated, so a note or goal edit on that old day still saves.
 */
export function saveAssessment(state: AssessmentState, draft: AssessmentDraft, now = Date.now()): AssessmentState {
  const date = requireDate(draft.date);
  const note = cleanNote(draft.note);
  const existing = state.entries.find((entry) => entry.date === date);
  const mindsetGoals = resolveLines(MINDSET_GOALS, existing?.mindsetGoals, draft, 'mindsetGoals');
  const conditioningItems = resolveLines(CONDITIONING_ITEMS, existing?.conditioningItems, draft, 'conditioningItems');
  const directFaces = resolveDirect(existing?.directFaces, draft);
  const olderDayWithoutSweeps = Boolean(existing) && !isAssessmentScore(existing?.scores.sweeps);
  const scores = requireScores(draft.scores, olderDayWithoutSweeps);
  const nextEntry: AssessmentEntry = {
    id: existing?.id ?? newId(now),
    date,
    note,
    scores,
  };
  if (hasLineScore(MINDSET_GOALS, mindsetGoals)) nextEntry.mindsetGoals = mindsetGoals;
  if (hasLineScore(CONDITIONING_ITEMS, conditioningItems)) nextEntry.conditioningItems = conditioningItems;
  if (directFaces) nextEntry.directFaces = directFaces;
  const entries = existing
    ? state.entries.map((entry) => (entry.date === date ? nextEntry : entry))
    : [...state.entries, nextEntry];
  return normalizeState({ entries });
}

/** Goals saved on this date. A day with none, including an older file, comes back empty. */
export function mindsetGoalsForDate(entries: readonly AssessmentEntry[], date: string): MindsetGoalScores {
  return { ...(entries.find((entry) => entry.date === date)?.mindsetGoals ?? {}) };
}

/** Conditioning lines saved on this date. A day with none, including an older file, comes back empty. */
export function conditioningItemsForDate(entries: readonly AssessmentEntry[], date: string): ConditioningItemScores {
  return { ...(entries.find((entry) => entry.date === date)?.conditioningItems ?? {}) };
}

/**
 * Average of the lines that were actually scored, rounded to the 1–5 category score.
 * Unscored lines are left out. None scored means that category stays as it was saved.
 */
export function mindsetScoreFromGoals(goals: MindsetGoalScores | undefined): AssessmentScore | null {
  return lineScore(MINDSET_GOALS, goals);
}

export function conditioningScoreFromItems(items: ConditioningItemScores | undefined): AssessmentScore | null {
  return lineScore(CONDITIONING_ITEMS, items);
}

export function mindsetGoalLines(goals: MindsetGoalScores | undefined): string[] {
  return lineText(MINDSET_GOALS, goals);
}

export function conditioningItemLines(items: ConditioningItemScores | undefined): string[] {
  return lineText(CONDITIONING_ITEMS, items);
}

export function removeAssessment(state: AssessmentState, id: string): AssessmentState {
  return normalizeState({ entries: state.entries.filter((entry) => entry.id !== id) });
}

/**
 * A saved check-in for this date is the record.
 * Today, with no check-in yet, starts from the most recent check-in saved before today,
 * so all eight faces, Sweeps included, carry over. A face that check-in lacks (or every
 * face, when there is none) starts from the fundamentals tracker.
 * Any other empty date stays blank, so today's levels are not written onto the past.
 * Nothing here writes storage. The student still saves the day they want kept.
 */
export function assessmentDraftScores(
  entries: readonly AssessmentEntry[],
  date: string,
  today: string,
  tracker: Partial<AssessmentScores>,
): Partial<AssessmentScores> {
  const saved = entries.find((entry) => entry.date === date);
  if (saved) return { ...saved.scores };
  if (date !== today) return {};
  const previous = latestBefore(entries, date);
  const carried: Partial<AssessmentScores> = previous ? displayedAssessmentScores(previous) : {};
  const next: Partial<AssessmentScores> = {};
  for (const id of FACE_IDS) {
    const value = isAssessmentScore(carried[id]) ? carried[id] : tracker[id];
    if (isAssessmentScore(value)) next[id] = value;
  }
  return next;
}

/** The latest check-in dated before this date, or null. */
export function latestAssessmentBefore(entries: readonly AssessmentEntry[], date: string): AssessmentEntry | null {
  return latestBefore(entries, date);
}

function latestBefore(entries: readonly AssessmentEntry[], date: string): AssessmentEntry | null {
  let best: AssessmentEntry | null = null;
  for (const entry of entries) {
    if (entry.date >= date) continue;
    if (!best || entry.date > best.date || (entry.date === best.date && entry.id > best.id)) best = entry;
  }
  return best;
}

/** The open draft wins. With nothing typed, the chart uses the saved day, then the latest day. */
export function assessmentChartScores(
  draft: Partial<AssessmentScores>,
  savedOnDate: AssessmentScores | undefined,
  latest: AssessmentScores | undefined,
): Partial<AssessmentScores> | null {
  if (FACE_IDS.some((id) => isAssessmentScore(draft[id]))) return draft;
  return savedOnDate ?? latest ?? null;
}

/**
 * Checkpoints on the belt the student wears. An area links only when that
 * belt's rubric uses one of the area's words. Later belts are not a fallback,
 * so a white belt does not open a blue checkpoint.
 */
export function checkpointLinks(report: StudentProgressReport): AssessmentCheckpointLink[] {
  const current = beltLevel(report, report.profile.belt);
  if (!current) return [];
  const links: AssessmentCheckpointLink[] = [];
  for (const area of ASSESSMENT_FORM_AREAS) {
    const hit = current.checkpoints.find((row) => nameHits(row.name, AREA_WORDS[area.id]));
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

/** All eight faces, in form order. `sweepsMayStayBlank` is only for re-saving a day stored before Sweeps. */
function requireScores(scores: Partial<AssessmentScores>, sweepsMayStayBlank = false): AssessmentScores {
  const next = {} as AssessmentScores;
  for (const id of FACE_IDS) {
    const value = scores[id];
    if (id === 'sweeps' && sweepsMayStayBlank && value === undefined) continue;
    if (!isScore(value)) throw new Error(`Rate ${labelFor(id)} from 1 to 5.`);
    next[id] = value;
  }
  return next;
}

function labelFor(id: AssessmentFaceId): string {
  return ASSESSMENT_FORM_AREAS.find((area) => area.id === id)?.label ?? id;
}

/**
 * The original seven ratings must be present for a stored day to load.
 * Sweeps loads when stored. A day saved before Sweeps existed loads with it unrated.
 */
function storedScores(raw: unknown): AssessmentScores | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const next = {} as AssessmentScores;
  for (const id of AREA_IDS) {
    if (!isScore(row[id])) return null;
    next[id] = row[id];
  }
  if (Object.prototype.hasOwnProperty.call(row, 'sweeps') && isScore(row.sweeps)) next.sweeps = row.sweeps;
  return next;
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
  const scores = storedScores(row.scores);
  if (!scores) return null;
  const entry: AssessmentEntry = {
    id: row.id.trim().slice(0, 80),
    date: row.date,
    note: row.note.trim().slice(0, PROGRESS_NOTE_MAX),
    scores,
  };
  const mindsetGoals = readLines(MINDSET_GOALS, row.mindsetGoals);
  if (hasLineScore(MINDSET_GOALS, mindsetGoals)) entry.mindsetGoals = mindsetGoals;
  const conditioningItems = readLines(CONDITIONING_ITEMS, row.conditioningItems);
  if (hasLineScore(CONDITIONING_ITEMS, conditioningItems)) entry.conditioningItems = conditioningItems;
  const directFaces = readDirect(row.directFaces);
  if (directFaces) entry.directFaces = directFaces;
  return entry;
}

type LineDef<Id extends string> = readonly { id: Id; label: string }[];
type LineScores<Id extends string> = Partial<Record<Id, AssessmentScore>>;

function lineScore<Id extends string>(lines: LineDef<Id>, values: LineScores<Id> | undefined): AssessmentScore | null {
  if (!values) return null;
  const scored = lines.map((line) => values[line.id]).filter(isAssessmentScore);
  if (!scored.length) return null;
  const rounded = Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
  return isAssessmentScore(rounded) ? rounded : null;
}

function lineText<Id extends string>(lines: LineDef<Id>, values: LineScores<Id> | undefined): string[] {
  if (!values) return [];
  return lines.flatMap((line) => {
    const value = values[line.id];
    return isAssessmentScore(value) ? [`${line.label}: ${value}`] : [];
  });
}

function resolveDirect(saved: DirectFaces | undefined, draft: AssessmentDraft): DirectFaces | undefined {
  if (!Object.prototype.hasOwnProperty.call(draft, 'directFaces')) return readDirect(saved);
  return readDirect(draft.directFaces);
}

function readDirect(raw: unknown): DirectFaces | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const next: DirectFaces = {};
  if (row.conditioning === true) next.conditioning = true;
  if (row.mindset === true) next.mindset = true;
  return next.conditioning || next.mindset ? next : undefined;
}

function resolveLines<Id extends string>(
  lines: LineDef<Id>,
  saved: LineScores<Id> | undefined,
  draft: AssessmentDraft,
  key: 'mindsetGoals' | 'conditioningItems',
): LineScores<Id> {
  if (!Object.prototype.hasOwnProperty.call(draft, key)) return { ...(saved ?? {}) };
  return requireLines(lines, draft[key], key === 'mindsetGoals' ? 'Mindset goals are not valid.' : 'Conditioning items are not valid.');
}

function requireLines<Id extends string>(lines: LineDef<Id>, raw: unknown, invalid: string): LineScores<Id> {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(invalid);
  const row = raw as Record<string, unknown>;
  const next: LineScores<Id> = {};
  for (const line of lines) {
    if (!Object.prototype.hasOwnProperty.call(row, line.id)) continue;
    const value = row[line.id];
    if (!isScore(value)) throw new Error(`Rate ${line.label} from 1 to 5.`);
    next[line.id] = value;
  }
  return next;
}

/** A bad or missing list does not drop the check-in. Unscored and invalid lines are left out. */
function readLines<Id extends string>(lines: LineDef<Id>, raw: unknown): LineScores<Id> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const next: LineScores<Id> = {};
  for (const line of lines) {
    const value = row[line.id];
    if (isScore(value)) next[line.id] = value;
  }
  return next;
}

function hasLineScore<Id extends string>(lines: LineDef<Id>, values: LineScores<Id>): boolean {
  return lines.some((line) => isScore(values[line.id]));
}

function newId(now: number): string {
  return `assess.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}
