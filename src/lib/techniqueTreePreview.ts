/**
 * Preview-only fundamentals index.
 * Storage key is separate from the live coach Technique Tree.
 * Shared index ids connect a lesson attach, a journal rating, class mat time, and belt coverage.
 * Class mat time follows the live rule: one Class row per student per day, replaced in place.
 */

import { clampMinutes } from './matHours.ts';
import { asRecord, clampText } from './plainValue.ts';

export const PREVIEW_STORAGE_KEY = 'matboard.preview.techniqueFundamentals.v1';
export const TECHNIQUE_TREE_PREVIEW_PATH = '/preview/technique-tree';
export const TECHNIQUE_TREE_PREVIEW_BANNER =
  'Preview only — not live curriculum. Draft for owner review.';
export const PREVIEW_LESSON_DATE = '2026-11-05';

const NAME_MAX = 80;
const NOTE_MAX = 400;
const OPEN_NOTE_MAX = 80;
const ID_MAX = 80;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type EntryKind = 'position' | 'core' | 'variation';
export type MoveKind = 'core' | 'variation';
export type JournalRating = 1 | 2 | 3 | 4 | 5;
export type BeltId = 'kids-grey' | 'kids-yellow' | 'white' | 'blue' | 'purple';
export type MatKind = 'class' | 'openMat';
export type PreviewView = 'lesson' | 'journal' | 'class' | 'belts' | 'index';

export type IndexEntry = {
  id: string;
  name: string;
  kind: EntryKind;
  /** Position hubs this move sprouts from. Empty on a position. */
  positionIds: string[];
  /** Core move a variation hangs from. Null on positions and core moves. */
  parentId: string | null;
};

export type LessonLine = {
  id: string;
  indexId: string;
  fundamentals: boolean;
  addedAt: string;
  /** Class day. A Class mat-time log on this date counts toward this index entry. */
  date: string;
};

export type MatLog = {
  id: string;
  studentId: string;
  date: string;
  kind: MatKind;
  minutes: number;
  /** Open mat only, and only when the student names a technique. Class logs stay null. */
  indexId: string | null;
  /** Open mat attribution requires this note. Blank is a wash. */
  note: string;
};

export type JournalLine = {
  id: string;
  studentId: string;
  indexId: string;
  rating: JournalRating;
  note: string;
  loggedAt: string;
};

export type BeltRequirement = {
  belt: BeltId;
  label: string;
  /** Index ids that count as fundamentals for this belt. */
  indexIds: string[];
};

export type PreviewStudent = {
  id: string;
  name: string;
  belt: BeltId;
};

export type PreviewState = {
  version: 1;
  /** Day the lesson screen is planning. New attaches land on this date. */
  lessonDate: string;
  entries: IndexEntry[];
  lessons: LessonLine[];
  journal: JournalLine[];
  matLogs: MatLog[];
  belts: BeltRequirement[];
  students: PreviewStudent[];
};

export const RATING_WORDS: Record<JournalRating, string> = {
  1: 'Poorly',
  2: 'A little',
  3: 'Okay',
  4: 'Well',
  5: 'Really well',
};

export const PREVIEW_VIEWS: readonly { id: PreviewView; label: string }[] = [
  { id: 'lesson', label: 'Lesson' },
  { id: 'journal', label: 'Journal' },
  { id: 'class', label: 'Class' },
  { id: 'belts', label: 'Belts' },
  { id: 'index', label: 'Index' },
];

const SEED: PreviewState = {
  version: 1,
  lessonDate: PREVIEW_LESSON_DATE,
  entries: [
    position('pos-mount', 'Mount'),
    position('pos-closed', 'Closed guard'),
    position('pos-side', 'Side control'),
    position('pos-back', 'Back control'),
    position('pos-half', 'Half guard'),
    position('pos-stand', 'Standing'),
    position('pos-open', 'Open guard'),
    position('pos-knee', 'Knee on belly'),
    core('core-armbar', 'Armbar', ['pos-mount', 'pos-closed', 'pos-side']),
    variation('var-armbar-spin', 'Spinning armbar', 'core-armbar', ['pos-mount']),
    variation('var-armbar-mounted', 'Mounted armbar', 'core-armbar', ['pos-mount']),
    variation('var-armbar-closed', 'Armbar from closed guard', 'core-armbar', ['pos-closed']),
    core('core-cross', 'Cross-collar choke', ['pos-mount']),
    variation('var-cross-palm', 'Palm-up cross collar', 'core-cross', ['pos-mount']),
    core('core-americana', 'Americana', ['pos-mount', 'pos-side']),
    variation('var-americana-high', 'Americana from high mount', 'core-americana', ['pos-mount']),
    core('core-triangle', 'Triangle', ['pos-closed']),
    variation('var-triangle-arm', 'Triangle-armbar combination', 'core-triangle', ['pos-closed']),
    core('core-scissor', 'Scissor sweep', ['pos-closed']),
    variation('var-scissor-collar', 'Collar-and-sleeve scissor sweep', 'core-scissor', ['pos-closed']),
    core('core-kimura', 'Kimura', ['pos-closed', 'pos-side']),
    variation('var-kimura-guard', 'Kimura from closed guard', 'core-kimura', ['pos-closed']),
    core('core-rnc', 'Rear naked choke', ['pos-back']),
    variation('var-rnc-short', 'Short choke', 'core-rnc', ['pos-back']),
    core('core-bow', 'Bow and arrow choke', ['pos-back']),
    variation('var-bow-pants', 'Bow and arrow with the pants grip', 'core-bow', ['pos-back']),
    core('core-knee-slice', 'Knee slice', ['pos-half', 'pos-open']),
    variation('var-knee-under', 'Underhook knee slice', 'core-knee-slice', ['pos-half']),
    core('core-hip-bump', 'Hip bump sweep', ['pos-closed']),
    variation('var-hip-kimura', 'Hip bump to kimura', 'core-hip-bump', ['pos-closed']),
    core('core-arm-drag', 'Arm drag', ['pos-stand']),
    variation('var-arm-drag-back', 'Arm drag to the back', 'core-arm-drag', ['pos-stand']),
    core('core-escape', 'Elbow-knee escape', ['pos-mount', 'pos-side']),
    variation('var-escape-mount', 'Elbow-knee from mount', 'core-escape', ['pos-mount']),
    variation('var-escape-side', 'Elbow-knee from side control', 'core-escape', ['pos-side']),
  ],
  lessons: [
    { id: 'lesson-armbar', indexId: 'core-armbar', fundamentals: true, addedAt: '2026-11-05T15:00:00.000Z', date: PREVIEW_LESSON_DATE },
    { id: 'lesson-spin', indexId: 'var-armbar-spin', fundamentals: false, addedAt: '2026-11-05T15:05:00.000Z', date: PREVIEW_LESSON_DATE },
    { id: 'lesson-escape', indexId: 'core-escape', fundamentals: true, addedAt: '2026-11-05T15:10:00.000Z', date: PREVIEW_LESSON_DATE },
  ],
  matLogs: [
    mat('mat-maya-class', 'stu-maya', PREVIEW_LESSON_DATE, 'class', 90, null, ''),
    mat('mat-maya-open', 'stu-maya', '2026-11-06', 'openMat', 60, null, ''),
    mat('mat-luis-class', 'stu-luis', PREVIEW_LESSON_DATE, 'class', 75, null, ''),
    mat('mat-luis-open', 'stu-luis', '2026-11-07', 'openMat', 45, 'var-armbar-spin', 'Spinning armbar entries'),
  ],
  journal: [
    line('j-maya-arm-1', 'stu-maya', 'core-armbar', 2, 'Lost the grip on the way over.', '2026-10-02T17:00:00.000Z'),
    line('j-maya-arm-2', 'stu-maya', 'core-armbar', 4, 'Finished from mount.', '2026-10-21T17:00:00.000Z'),
    line('j-maya-scissor', 'stu-maya', 'core-scissor', 3, '', '2026-10-21T17:10:00.000Z'),
    line('j-maya-escape', 'stu-maya', 'core-escape', 2, 'Still late on the frame.', '2026-10-28T17:00:00.000Z'),
    line('j-luis-arm', 'stu-luis', 'core-armbar', 5, '', '2026-09-12T17:00:00.000Z'),
    line('j-luis-cross', 'stu-luis', 'core-cross', 4, '', '2026-09-12T17:05:00.000Z'),
    line('j-luis-americana', 'stu-luis', 'core-americana', 4, '', '2026-09-14T17:00:00.000Z'),
    line('j-luis-scissor', 'stu-luis', 'core-scissor', 5, '', '2026-09-14T17:05:00.000Z'),
    line('j-luis-escape', 'stu-luis', 'core-escape', 4, '', '2026-09-16T17:00:00.000Z'),
    line('j-luis-rnc', 'stu-luis', 'core-rnc', 3, '', '2026-09-16T17:05:00.000Z'),
    line('j-luis-triangle', 'stu-luis', 'core-triangle', 5, 'Caught it off the posture break.', '2026-10-18T17:00:00.000Z'),
    line('j-luis-kimura', 'stu-luis', 'core-kimura', 3, '', '2026-10-18T17:08:00.000Z'),
    line('j-luis-bow', 'stu-luis', 'core-bow', 4, '', '2026-10-25T17:00:00.000Z'),
    line('j-luis-hip', 'stu-luis', 'core-hip-bump', 2, '', '2026-10-25T17:06:00.000Z'),
    line('j-luis-spin', 'stu-luis', 'var-armbar-spin', 4, '', '2026-11-01T17:00:00.000Z'),
    line('j-priya-tri', 'stu-priya', 'var-triangle-arm', 5, '', '2026-10-04T17:00:00.000Z'),
    line('j-priya-palm', 'stu-priya', 'var-cross-palm', 4, '', '2026-10-04T17:06:00.000Z'),
    line('j-priya-high', 'stu-priya', 'var-americana-high', 3, '', '2026-10-11T17:00:00.000Z'),
    line('j-priya-short', 'stu-priya', 'var-rnc-short', 5, '', '2026-10-11T17:06:00.000Z'),
    line('j-priya-hip', 'stu-priya', 'var-hip-kimura', 4, '', '2026-10-30T17:00:00.000Z'),
    line('j-priya-arm', 'stu-priya', 'core-armbar', 5, '', '2026-08-02T17:00:00.000Z'),
    line('j-priya-cross', 'stu-priya', 'core-cross', 5, '', '2026-08-02T17:04:00.000Z'),
    line('j-priya-americana', 'stu-priya', 'core-americana', 4, '', '2026-08-02T17:08:00.000Z'),
    line('j-priya-scissor', 'stu-priya', 'core-scissor', 5, '', '2026-08-08T17:00:00.000Z'),
    line('j-priya-escape', 'stu-priya', 'core-escape', 5, '', '2026-08-08T17:04:00.000Z'),
    line('j-priya-rnc', 'stu-priya', 'core-rnc', 5, '', '2026-08-08T17:08:00.000Z'),
  ],
  belts: [
    { belt: 'kids-grey', label: 'Kids · Grey', indexIds: ['core-escape', 'core-armbar', 'core-scissor'] },
    { belt: 'kids-yellow', label: 'Kids · Yellow', indexIds: ['core-americana', 'core-cross', 'core-rnc'] },
    {
      belt: 'white',
      label: 'White',
      indexIds: ['core-armbar', 'core-cross', 'core-americana', 'core-scissor', 'core-escape', 'core-rnc'],
    },
    {
      belt: 'blue',
      label: 'Blue',
      indexIds: [
        'core-triangle',
        'core-kimura',
        'core-knee-slice',
        'core-bow',
        'core-hip-bump',
        'core-arm-drag',
        'var-armbar-spin',
        'var-armbar-mounted',
      ],
    },
    {
      belt: 'purple',
      label: 'Purple',
      indexIds: [
        'var-triangle-arm',
        'var-cross-palm',
        'var-americana-high',
        'var-rnc-short',
        'var-knee-under',
        'var-hip-kimura',
      ],
    },
  ],
  students: [
    { id: 'stu-maya', name: 'Maya Chen', belt: 'white' },
    { id: 'stu-luis', name: 'Luis Ortega', belt: 'blue' },
    { id: 'stu-priya', name: 'Priya Shah', belt: 'purple' },
  ],
};

function position(id: string, name: string): IndexEntry {
  return { id, name, kind: 'position', positionIds: [], parentId: null };
}

function core(id: string, name: string, positionIds: string[]): IndexEntry {
  return { id, name, kind: 'core', positionIds, parentId: null };
}

function variation(id: string, name: string, parentId: string, positionIds: string[]): IndexEntry {
  return { id, name, kind: 'variation', positionIds, parentId };
}

function line(
  id: string,
  studentId: string,
  indexId: string,
  rating: JournalRating,
  note: string,
  loggedAt: string,
): JournalLine {
  return { id, studentId, indexId, rating, note, loggedAt };
}

function mat(
  id: string,
  studentId: string,
  date: string,
  kind: MatKind,
  minutes: number,
  indexId: string | null,
  note: string,
): MatLog {
  return { id, studentId, date, kind, minutes, indexId, note };
}

let idSeq = 0;

function createPreviewId(prefix: string): string {
  idSeq += 1;
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${idSeq.toString(36)}-${rand}`;
}

export function seedPreview(): PreviewState {
  return structuredClone(SEED);
}

export function normalizeTechniqueName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTechniqueName(value: string): string {
  return normalizeTechniqueName(value).replace(/ /g, '');
}

function scoreName(name: string, needle: string, packed: string): number {
  const norm = normalizeTechniqueName(name);
  const tight = norm.replace(/ /g, '');
  if (norm === needle) return 5;
  if (tight === packed) return 4;
  if (norm.startsWith(needle)) return 3;
  if (norm.includes(needle)) return 2;
  if (packed.length >= 3 && tight.includes(packed)) return 1;
  return 0;
}

/** Type-ahead over the shared index. Blank input matches nothing. Exact names rank first. */
export function matchIndex(entries: readonly IndexEntry[], query: string): IndexEntry[] {
  const needle = normalizeTechniqueName(query);
  const packed = needle.replace(/ /g, '');
  if (!needle) return [];
  return entries
    .map((entry) => ({ entry, score: scoreName(entry.name, needle, packed) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.entry.name.localeCompare(b.entry.name) || a.entry.id.localeCompare(b.entry.id),
    )
    .map((row) => row.entry);
}

export function positionHubs(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries.filter((entry) => entry.kind === 'position');
}

export function coreMoves(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries.filter((entry) => entry.kind === 'core');
}

export function findEntry(entries: readonly IndexEntry[], id: string): IndexEntry | null {
  return entries.find((entry) => entry.id === id) ?? null;
}

/** Core moves that sprout from a position, including a core that only has a variation on that hub. */
export function coresOnPosition(entries: readonly IndexEntry[], positionId: string): IndexEntry[] {
  const parentIds = new Set(
    entries
      .filter((entry) => entry.kind === 'variation' && entry.positionIds.includes(positionId))
      .map((entry) => entry.parentId)
      .filter((id): id is string => Boolean(id)),
  );
  return entries.filter(
    (entry) => entry.kind === 'core' && (entry.positionIds.includes(positionId) || parentIds.has(entry.id)),
  );
}

export function variationsOf(
  entries: readonly IndexEntry[],
  parentId: string,
  positionId?: string,
): IndexEntry[] {
  return entries.filter(
    (entry) =>
      entry.kind === 'variation' &&
      entry.parentId === parentId &&
      (!positionId || entry.positionIds.includes(positionId)),
  );
}

export function entryContext(entries: readonly IndexEntry[], entry: IndexEntry): string {
  if (entry.kind === 'position') return 'Position hub';
  const where = entry.positionIds
    .map((id) => findEntry(entries, id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(', ');
  if (entry.kind === 'core') return where ? `Core move · ${where}` : 'Core move';
  const parent = entry.parentId ? findEntry(entries, entry.parentId)?.name : '';
  const lead = parent ? `Variation of ${parent}` : 'Variation';
  return where ? `${lead} · ${where}` : lead;
}

export function ratingWord(rating: number): string {
  return isJournalRating(rating) ? RATING_WORDS[rating] : '';
}

export function isJournalRating(value: number): value is JournalRating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function meanRating(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type NewEntryInput = {
  name: string;
  kind: MoveKind;
  positionId: string;
  parentId?: string | null;
  id?: string;
};

export type SaveEntryResult =
  | { ok: true; state: PreviewState; entry: IndexEntry }
  | { ok: false; reason: 'blank' | 'duplicate' | 'missing-position' | 'missing-parent' | 'bad-parent' };

export function saveIndexEntry(state: PreviewState, input: NewEntryInput): SaveEntryResult {
  const name = clampText(input.name, NAME_MAX).trim().replace(/\s+/g, ' ');
  if (!normalizeTechniqueName(name)) return { ok: false, reason: 'blank' };
  const position = state.entries.find((entry) => entry.id === input.positionId && entry.kind === 'position');
  if (!position) return { ok: false, reason: 'missing-position' };
  const packed = compactTechniqueName(name);
  if (state.entries.some((entry) => compactTechniqueName(entry.name) === packed)) {
    return { ok: false, reason: 'duplicate' };
  }

  let parentId: string | null = null;
  if (input.kind === 'variation') {
    const parent = input.parentId ? findEntry(state.entries, input.parentId) : null;
    if (!parent) return { ok: false, reason: 'missing-parent' };
    if (parent.kind !== 'core') return { ok: false, reason: 'bad-parent' };
    parentId = parent.id;
  }

  const entry: IndexEntry = {
    id: uniqueId(state.entries, input.id, input.kind === 'core' ? 'core' : 'var'),
    name,
    kind: input.kind,
    positionIds: [position.id],
    parentId,
  };
  return { ok: true, entry, state: { ...state, entries: [...state.entries, entry] } };
}

function uniqueId(entries: readonly { id: string }[], requested: string | undefined, prefix: string): string {
  const taken = new Set(entries.map((entry) => entry.id));
  let id = clampText(requested, ID_MAX).trim() || createPreviewId(prefix);
  while (taken.has(id)) id = createPreviewId(prefix);
  return id;
}

export type AttachLessonResult =
  | { ok: true; state: PreviewState; line: LessonLine }
  | { ok: false; reason: 'unknown' | 'not-a-move' };

export function attachLesson(
  state: PreviewState,
  input: { indexId: string; fundamentals: boolean; id?: string; addedAt?: string },
): AttachLessonResult {
  const entry = findEntry(state.entries, input.indexId);
  if (!entry) return { ok: false, reason: 'unknown' };
  if (entry.kind === 'position') return { ok: false, reason: 'not-a-move' };
  const existing = state.lessons.find((lesson) => lesson.indexId === entry.id);
  if (existing) {
    const line: LessonLine = { ...existing, fundamentals: input.fundamentals };
    return {
      ok: true,
      line,
      state: {
        ...state,
        lessons: state.lessons.map((lesson) => (lesson.id === existing.id ? line : lesson)),
      },
    };
  }
  const line: LessonLine = {
    id: uniqueId(state.lessons, input.id, 'lesson'),
    indexId: entry.id,
    fundamentals: input.fundamentals,
    addedAt: input.addedAt ?? new Date().toISOString(),
    date: state.lessonDate,
  };
  return { ok: true, line, state: { ...state, lessons: [...state.lessons, line] } };
}

export function setLessonFundamentals(state: PreviewState, lessonId: string, fundamentals: boolean): PreviewState {
  return {
    ...state,
    lessons: state.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, fundamentals } : lesson)),
  };
}

export function removeLesson(state: PreviewState, lessonId: string): PreviewState {
  return { ...state, lessons: state.lessons.filter((lesson) => lesson.id !== lessonId) };
}

/** Move this class's lesson lines onto a new day. Other dates stay put. */
export function setLessonDate(state: PreviewState, date: string): PreviewState {
  if (!ISO_DATE.test(date)) return state;
  const previous = state.lessonDate;
  return {
    ...state,
    lessonDate: date,
    lessons: state.lessons.map((lesson) => (lesson.date === previous ? { ...lesson, date } : lesson)),
  };
}

export type TagPositionResult =
  | { ok: true; state: PreviewState; entry: IndexEntry; added: boolean }
  | { ok: false; reason: 'unknown' | 'not-a-move' | 'missing-position' };

/** Coach tag: this move also sprouts from a position hub. */
export function tagPosition(state: PreviewState, indexId: string, positionId: string): TagPositionResult {
  const entry = findEntry(state.entries, indexId);
  if (!entry) return { ok: false, reason: 'unknown' };
  if (entry.kind === 'position') return { ok: false, reason: 'not-a-move' };
  const hub = findEntry(state.entries, positionId);
  if (!hub || hub.kind !== 'position') return { ok: false, reason: 'missing-position' };
  if (entry.positionIds.includes(hub.id)) return { ok: true, state, entry, added: false };
  const next: IndexEntry = { ...entry, positionIds: [...entry.positionIds, hub.id] };
  return { ok: true, entry: next, added: true, state: replaceEntry(state, next) };
}

export type TagVariationResult =
  | { ok: true; state: PreviewState; entry: IndexEntry }
  | { ok: false; reason: 'unknown' | 'not-a-move' | 'missing-parent' | 'bad-parent' | 'has-children' };

/** Coach tag: this move hangs off a core. A core with its own variations stays a core. */
export function tagAsVariation(state: PreviewState, indexId: string, parentId: string): TagVariationResult {
  const entry = findEntry(state.entries, indexId);
  if (!entry) return { ok: false, reason: 'unknown' };
  if (entry.kind === 'position') return { ok: false, reason: 'not-a-move' };
  const parent = findEntry(state.entries, parentId);
  if (!parent) return { ok: false, reason: 'missing-parent' };
  if (parent.kind !== 'core' || parent.id === entry.id) return { ok: false, reason: 'bad-parent' };
  if (state.entries.some((item) => item.parentId === entry.id)) return { ok: false, reason: 'has-children' };
  const next: IndexEntry = { ...entry, kind: 'variation', parentId: parent.id };
  return { ok: true, entry: next, state: replaceEntry(state, next) };
}

function replaceEntry(state: PreviewState, next: IndexEntry): PreviewState {
  return { ...state, entries: state.entries.map((entry) => (entry.id === next.id ? next : entry)) };
}

export type LogMatResult =
  | { ok: true; state: PreviewState; log: MatLog; replaced: boolean }
  | { ok: false; reason: 'bad-date' | 'bad-minutes' | 'unknown-student' | 'unknown-index' | 'not-a-move' };

/**
 * One Class row per student per day, same as live mat hours. Logging that day again
 * replaces the minutes. Open mat is its own row and does not count toward a technique
 * unless `note` names the work and `indexId` is that technique.
 */
export function logPreviewMatTime(
  state: PreviewState,
  input: {
    studentId: string;
    date: string;
    kind: MatKind;
    minutes: number;
    indexId?: string | null;
    note?: string;
    id?: string;
  },
): LogMatResult {
  if (!ISO_DATE.test(input.date)) return { ok: false, reason: 'bad-date' };
  const minutes = clampMinutes(input.minutes);
  if (!minutes) return { ok: false, reason: 'bad-minutes' };
  if (!state.students.some((student) => student.id === input.studentId)) {
    return { ok: false, reason: 'unknown-student' };
  }

  let indexId: string | null = null;
  let note = '';
  if (input.kind === 'openMat') {
    note = clampText(input.note, OPEN_NOTE_MAX).trim();
    const rawId = clampText(input.indexId, ID_MAX).trim();
    if (rawId) {
      const entry = findEntry(state.entries, rawId);
      if (!entry) return { ok: false, reason: 'unknown-index' };
      if (entry.kind === 'position') return { ok: false, reason: 'not-a-move' };
      indexId = entry.id;
    }
  }

  const existing = state.matLogs.find(
    (log) => log.studentId === input.studentId && log.date === input.date && log.kind === input.kind,
  );
  const log: MatLog = {
    id: existing?.id ?? uniqueId(state.matLogs, input.id, input.kind === 'class' ? 'class' : 'open'),
    studentId: input.studentId,
    date: input.date,
    kind: input.kind,
    minutes,
    indexId,
    note,
  };
  return {
    ok: true,
    log,
    replaced: Boolean(existing),
    state: {
      ...state,
      matLogs: existing
        ? state.matLogs.map((item) => (item.id === existing.id ? log : item))
        : [...state.matLogs, log],
    },
  };
}

export type AttributedTime = {
  classMinutes: number;
  openMatMinutes: number;
  minutes: number;
};

/** Class minutes on a day the move was taught, plus open mat only when the note names that move. */
export function attributedMinutes(state: PreviewState, studentId: string, indexId: string): AttributedTime {
  const classDates = new Set(state.lessons.filter((lesson) => lesson.indexId === indexId).map((lesson) => lesson.date));
  let classMinutes = 0;
  let openMatMinutes = 0;
  const seenClass = new Set<string>();
  const seenOpen = new Set<string>();
  for (const log of state.matLogs) {
    if (log.studentId !== studentId) continue;
    if (log.kind === 'class') {
      if (!classDates.has(log.date) || seenClass.has(log.date)) continue;
      seenClass.add(log.date);
      classMinutes += log.minutes;
      continue;
    }
    if (log.indexId !== indexId || !log.note.trim() || seenOpen.has(log.date)) continue;
    seenOpen.add(log.date);
    openMatMinutes += log.minutes;
  }
  return { classMinutes, openMatMinutes, minutes: classMinutes + openMatMinutes };
}

export type LessonStudentTrack = {
  studentId: string;
  name: string;
  beltLabel: string;
  rating: JournalRating | null;
  average: number | null;
  ratingCount: number;
  classMinutes: number;
  openMatMinutes: number;
  minutes: number;
  inClass: boolean;
};

export type LessonMoveTrack = {
  indexId: string;
  name: string;
  students: LessonStudentTrack[];
  inClassCount: number;
  ratedCount: number;
};

/** Instructor view of one class day: who was there, their rating, and attributed minutes. */
export function lessonTracking(state: PreviewState, date = state.lessonDate): { date: string; moves: LessonMoveTrack[] } {
  const seen = new Set<string>();
  const moves: LessonMoveTrack[] = [];
  for (const lesson of state.lessons) {
    if (lesson.date !== date || seen.has(lesson.indexId)) continue;
    const entry = findEntry(state.entries, lesson.indexId);
    if (!entry) continue;
    seen.add(entry.id);
    const students = state.students.map((student) => {
      const ratings = state.journal.filter((item) => item.studentId === student.id && item.indexId === entry.id);
      const latest = latestLog(ratings);
      const time = attributedMinutes(state, student.id, entry.id);
      return {
        studentId: student.id,
        name: student.name,
        beltLabel: state.belts.find((belt) => belt.belt === student.belt)?.label ?? student.belt,
        rating: latest?.rating ?? null,
        average: meanRating(ratings.map((item) => item.rating)),
        ratingCount: ratings.length,
        classMinutes: time.classMinutes,
        openMatMinutes: time.openMatMinutes,
        minutes: time.minutes,
        inClass: time.classMinutes > 0,
      };
    });
    moves.push({
      indexId: entry.id,
      name: entry.name,
      students,
      inClassCount: students.filter((student) => student.inClass).length,
      ratedCount: students.filter((student) => student.rating != null).length,
    });
  }
  return { date, moves };
}

export function fundamentalsChecklist(state: PreviewState): IndexEntry[] {
  const seen = new Set<string>();
  const list: IndexEntry[] = [];
  for (const lesson of state.lessons) {
    if (!lesson.fundamentals || seen.has(lesson.indexId)) continue;
    const entry = findEntry(state.entries, lesson.indexId);
    if (!entry) continue;
    seen.add(entry.id);
    list.push(entry);
  }
  return list;
}

export type LogJournalResult =
  | { ok: true; state: PreviewState; line: JournalLine }
  | { ok: false; reason: 'bad-rating' | 'unknown-index' | 'unknown-student' | 'not-a-move' };

export function logJournal(
  state: PreviewState,
  input: {
    studentId: string;
    indexId: string;
    rating: number;
    note?: string;
    id?: string;
    loggedAt?: string;
  },
): LogJournalResult {
  if (!isJournalRating(input.rating)) return { ok: false, reason: 'bad-rating' };
  if (!state.students.some((student) => student.id === input.studentId)) {
    return { ok: false, reason: 'unknown-student' };
  }
  const entry = findEntry(state.entries, input.indexId);
  if (!entry) return { ok: false, reason: 'unknown-index' };
  if (entry.kind === 'position') return { ok: false, reason: 'not-a-move' };
  const journalLine: JournalLine = {
    id: uniqueId(state.journal, input.id, 'journal'),
    studentId: input.studentId,
    indexId: entry.id,
    rating: input.rating,
    note: clampText(input.note, NOTE_MAX).trim(),
    loggedAt: input.loggedAt ?? new Date().toISOString(),
  };
  return { ok: true, line: journalLine, state: { ...state, journal: [...state.journal, journalLine] } };
}

export function removeJournal(state: PreviewState, journalId: string): PreviewState {
  return { ...state, journal: state.journal.filter((entry) => entry.id !== journalId) };
}

export type CoverageRow = {
  indexId: string;
  name: string;
  kind: EntryKind;
  logged: boolean;
  count: number;
  average: number | null;
  latest: JournalRating | null;
  latestAt: string | null;
  onFundamentalsList: boolean;
  classMinutes: number;
  openMatMinutes: number;
  minutes: number;
};

export type BeltCoverage = {
  studentId: string;
  studentName: string;
  belt: BeltId;
  beltLabel: string;
  currentBelt: boolean;
  rows: CoverageRow[];
  logged: number;
  total: number;
  gaps: CoverageRow[];
  /** Mean of each logged move's average, so one move does not outweigh another. */
  average: number | null;
};

export function beltCoverage(state: PreviewState, studentId: string, belt: BeltId): BeltCoverage | null {
  const student = state.students.find((item) => item.id === studentId);
  const requirement = state.belts.find((item) => item.belt === belt);
  if (!student || !requirement) return null;
  const checklist = new Set(
    state.lessons.filter((lesson) => lesson.fundamentals).map((lesson) => lesson.indexId),
  );
  const rows = requirement.indexIds.flatMap((indexId) => {
    const entry = findEntry(state.entries, indexId);
    if (!entry || entry.kind === 'position') return [];
    const logs = state.journal.filter((item) => item.studentId === student.id && item.indexId === entry.id);
    const latest = latestLog(logs);
    const row: CoverageRow = {
      indexId: entry.id,
      name: entry.name,
      kind: entry.kind,
      logged: logs.length > 0,
      count: logs.length,
      average: meanRating(logs.map((item) => item.rating)),
      latest: latest?.rating ?? null,
      latestAt: latest?.loggedAt ?? null,
      onFundamentalsList: checklist.has(entry.id),
      ...attributedMinutes(state, student.id, entry.id),
    };
    return [row];
  });
  const loggedRows = rows.filter((row) => row.logged);
  const gaps = rows.filter((row) => !row.logged);
  return {
    studentId: student.id,
    studentName: student.name,
    belt: requirement.belt,
    beltLabel: requirement.label,
    currentBelt: student.belt === requirement.belt,
    rows,
    logged: loggedRows.length,
    total: rows.length,
    gaps,
    average: meanRating(loggedRows.flatMap((row) => (row.average == null ? [] : [row.average]))),
  };
}

function latestLog(logs: readonly JournalLine[]): JournalLine | null {
  let best: JournalLine | null = null;
  let bestAt = -1;
  logs.forEach((entry, index) => {
    if (!best || entry.loggedAt > best.loggedAt || (entry.loggedAt === best.loggedAt && index > bestAt)) {
      best = entry;
      bestAt = index;
    }
  });
  return best;
}

export function previewView(value: string | null): PreviewView {
  return PREVIEW_VIEWS.some((view) => view.id === value) ? (value as PreviewView) : 'lesson';
}

/** Short press on the corner mark. A direct preview link returns to the public product list. */
export function previewBackTarget(from: string | null): string {
  if (from === 'tools') return '/coaching-tools';
  if (from === 'unlimited') return '/coach-unlimited';
  return '/products';
}

export function previewEntryPath(from: 'tools' | 'unlimited'): string {
  return `${TECHNIQUE_TREE_PREVIEW_PATH}?from=${from}`;
}

export function formatRatingAverage(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(1);
}

type PreviewStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadPreviewState(storage: Pick<Storage, 'getItem'> | null): PreviewState {
  if (!storage) return seedPreview();
  try {
    const raw = storage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) return seedPreview();
    return sanitizePreview(JSON.parse(raw) as unknown) ?? seedPreview();
  } catch {
    return seedPreview();
  }
}

export function savePreviewState(storage: PreviewStorage | null, state: PreviewState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function sanitizePreview(value: unknown): PreviewState | null {
  const record = asRecord(value);
  if (!record || record.version !== 1) return null;
  const seed = seedPreview();
  const entries = sanitizeList(record.entries, sanitizeEntry);
  const lessons = sanitizeList(record.lessons, sanitizeLesson);
  const journal = sanitizeList(record.journal, sanitizeJournal);
  const matLogs = sanitizeList(record.matLogs, sanitizeMatLog);
  const belts = sanitizeList(record.belts, sanitizeBelt);
  const students = sanitizeList(record.students, sanitizeStudent);
  if (entries.length === 0) return null;
  const lessonDate = isoDate(record.lessonDate) || lessons[0]?.date || seed.lessonDate;
  return {
    version: 1,
    lessonDate,
    entries,
    lessons,
    journal,
    matLogs,
    belts: belts.length ? belts : seed.belts,
    students: students.length ? students : seed.students,
  };
}

function sanitizeList<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const next = read(item);
    return next ? [next] : [];
  });
}

function sanitizeEntry(value: unknown): IndexEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = clampText(record.id, ID_MAX).trim();
  const name = clampText(record.name, NAME_MAX).trim();
  if (!id || !name || !isEntryKind(record.kind)) return null;
  const positionIds = Array.isArray(record.positionIds)
    ? record.positionIds.flatMap((item) => {
        const next = clampText(item, ID_MAX).trim();
        return next ? [next] : [];
      })
    : [];
  const parentRaw = clampText(record.parentId, ID_MAX).trim();
  if (record.kind === 'position') return { id, name, kind: 'position', positionIds: [], parentId: null };
  if (record.kind === 'core') return { id, name, kind: 'core', positionIds, parentId: null };
  if (!parentRaw) return null;
  return { id, name, kind: 'variation', positionIds, parentId: parentRaw };
}

function sanitizeLesson(value: unknown): LessonLine | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = clampText(record.id, ID_MAX).trim();
  const indexId = clampText(record.indexId, ID_MAX).trim();
  const addedAt = clampText(record.addedAt, 40).trim();
  if (!id || !indexId) return null;
  return {
    id,
    indexId,
    fundamentals: record.fundamentals === true,
    addedAt: addedAt || '2026-11-05T00:00:00.000Z',
    date: isoDate(record.date) || PREVIEW_LESSON_DATE,
  };
}

function sanitizeMatLog(value: unknown): MatLog | null {
  const record = asRecord(value);
  if (!record || (record.kind !== 'class' && record.kind !== 'openMat')) return null;
  const id = clampText(record.id, ID_MAX).trim();
  const studentId = clampText(record.studentId, ID_MAX).trim();
  const date = isoDate(record.date);
  const minutes = clampMinutes(record.minutes);
  if (!id || !studentId || !date || !minutes) return null;
  const indexId = clampText(record.indexId, ID_MAX).trim();
  return {
    id,
    studentId,
    date,
    kind: record.kind,
    minutes,
    indexId: record.kind === 'openMat' && indexId ? indexId : null,
    note: record.kind === 'openMat' ? clampText(record.note, OPEN_NOTE_MAX).trim() : '',
  };
}

function isoDate(value: unknown): string {
  const text = clampText(value, 10).trim();
  return ISO_DATE.test(text) ? text : '';
}

function sanitizeJournal(value: unknown): JournalLine | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = clampText(record.id, ID_MAX).trim();
  const studentId = clampText(record.studentId, ID_MAX).trim();
  const indexId = clampText(record.indexId, ID_MAX).trim();
  const rating = typeof record.rating === 'number' ? record.rating : Number.NaN;
  if (!id || !studentId || !indexId || !isJournalRating(rating)) return null;
  return {
    id,
    studentId,
    indexId,
    rating,
    note: clampText(record.note, NOTE_MAX).trim(),
    loggedAt: clampText(record.loggedAt, 40).trim() || '2026-11-05T00:00:00.000Z',
  };
}

function sanitizeBelt(value: unknown): BeltRequirement | null {
  const record = asRecord(value);
  if (!record || !isBeltId(record.belt)) return null;
  const label = clampText(record.label, 40).trim();
  const indexIds = Array.isArray(record.indexIds)
    ? record.indexIds.flatMap((item) => {
        const next = clampText(item, ID_MAX).trim();
        return next ? [next] : [];
      })
    : [];
  if (!label || indexIds.length === 0) return null;
  return { belt: record.belt, label, indexIds };
}

function sanitizeStudent(value: unknown): PreviewStudent | null {
  const record = asRecord(value);
  if (!record || !isBeltId(record.belt)) return null;
  const id = clampText(record.id, ID_MAX).trim();
  const name = clampText(record.name, NAME_MAX).trim();
  if (!id || !name) return null;
  return { id, name, belt: record.belt };
}

function isEntryKind(value: unknown): value is EntryKind {
  return value === 'position' || value === 'core' || value === 'variation';
}

function isBeltId(value: unknown): value is BeltId {
  return value === 'kids-grey' || value === 'kids-yellow' || value === 'white' || value === 'blue' || value === 'purple';
}
