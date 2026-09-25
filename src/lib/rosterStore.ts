/**
 * Gym competitor roster. On-device only — name + belt prefill Match and Mock Tournament.
 * Game plans live on this same save, keyed by competitor id.
 */

import {
  emptyGamePlan,
  normalizeGamePlan,
  normalizeGamePlanMap,
  withGameAudit,
  withGameLink,
  withGameLinkFlag,
  withGameNotes,
  withoutGameLink,
  type CompetitorGamePlan,
  type GameAudit,
  type GameLayerSection,
  type GameLinkFlag,
  type GameSection,
} from './gamePlan.ts';

export const STORAGE_KEY = 'matboard.roster.v1';
export const NOTE_MAX = 160;
export const NAME_MAX = 80;
export const GYM_MAX = 80;
export const DIVISION_MAX = 80;
export const BELT_MAX = 40;

export const ADULT_BELTS = ['White', 'Blue', 'Purple', 'Brown', 'Black'] as const;
export const KIDS_BELTS = ['Grey', 'Yellow', 'Orange', 'Green'] as const;
export const BELT_CHOICES = [...ADULT_BELTS, ...KIDS_BELTS] as const;

export type Student = {
  id: string;
  name: string;
  belt: string;
  /** Bout division, such as Adult Blue or Kids Gi. Optional. Stays on the roster card. */
  division: string;
  /** School or academy. Optional. Shown on the scoreboard and brackets. */
  gym: string;
  lastPromotion: string;
  note: string;
  /** Present today for the in-house tournament. Off until someone checks them in. */
  checkedIn: boolean;
};

export type RosterState = {
  version: 1;
  students: Student[];
  /**
   * Keyed by competitor id. A missing id means no game plan yet.
   * Other maps on this save (such as a weekend checklist) are left in place.
   */
  gamePlans: Record<string, CompetitorGamePlan>;
};

const ROSTER_OWNED_KEYS = new Set(['version', 'students', 'gamePlans']);

/** Name, belt, optional gym, and optional division. Notes and promotion dates stay on the roster card. */
export type RosterPrefill = {
  name: string;
  belt: string;
  gym: string;
  division: string;
};

export type StudentDraft = {
  name: string;
  belt: string;
  division: string;
  gym: string;
  lastPromotion: string;
  note: string;
};

const listeners = new Set<() => void>();

/** Keys this module does not own, kept across a game-plan write. */
let siblings: Record<string, unknown> = {};

let state: RosterState = loadState();

let studentSeq = 0;

export function createStudentId(): string {
  studentSeq += 1;
  return `r-${Date.now().toString(36)}-${studentSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultRoster(): RosterState {
  return { version: 1, students: [], gamePlans: {} };
}

/** Sibling maps on the roster JSON, such as a checklist stored beside game plans. */
export function rosterSiblings(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const siblings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ROSTER_OWNED_KEYS.has(key)) continue;
    siblings[key] = value;
  }
  return siblings;
}

export function rosterSavePayload(roster: RosterState, extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, ...roster };
}

/** Drop one competitor from a sibling checklist map when the roster card is removed. */
export function dropSiblingCompetitor(extra: Record<string, unknown>, id: string): Record<string, unknown> {
  const ready = extra.ready;
  if (!ready || typeof ready !== 'object' || Array.isArray(ready)) return extra;
  if (!(id in (ready as Record<string, unknown>))) return extra;
  const next = { ...(ready as Record<string, unknown>) };
  delete next[id];
  return { ...extra, ready: next };
}

export function emptyDraft(): StudentDraft {
  return { name: '', belt: '', division: '', gym: '', lastPromotion: '', note: '' };
}

export function draftFromStudent(student: Student): StudentDraft {
  return {
    name: student.name,
    belt: student.belt,
    division: student.division,
    gym: student.gym,
    lastPromotion: student.lastPromotion,
    note: student.note,
  };
}

const BELT_ALIAS_CANONICAL: Record<string, string> = {
  white: 'White',
  whitebelt: 'White',
  wb: 'White',
  blue: 'Blue',
  bluebelt: 'Blue',
  purple: 'Purple',
  purplebelt: 'Purple',
  brown: 'Brown',
  brownbelt: 'Brown',
  black: 'Black',
  blackbelt: 'Black',
  bb: 'Black',
  coral: 'Coral',
  coralbelt: 'Coral',
  grey: 'Grey',
  greybelt: 'Grey',
  gray: 'Grey',
  graybelt: 'Grey',
  yellow: 'Yellow',
  yellowbelt: 'Yellow',
  orange: 'Orange',
  orangebelt: 'Orange',
  green: 'Green',
  greenbelt: 'Green',
};

function beltLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function isKnownBelt(value: string): boolean {
  const key = value.trim().toLowerCase();
  return BELT_CHOICES.some((belt) => belt.toLowerCase() === key);
}

export function canonicalBelt(value: string): string {
  const trimmed = value.trim().slice(0, BELT_MAX);
  if (!trimmed) return '';
  const known = BELT_CHOICES.find((belt) => belt.toLowerCase() === trimmed.toLowerCase());
  if (known) return known;
  return BELT_ALIAS_CANONICAL[beltLookupKey(trimmed)] ?? trimmed;
}

/** CSS key for RankChip — known belts color the chip; aliases (gray, BB) resolve first. */
export function beltChipKey(value: string): string {
  const canonical = canonicalBelt(value);
  return isKnownBelt(canonical) ? canonical.toLowerCase() : 'custom';
}

export function normalizeDate(value: string): string {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export function formatPromotion(value: string): string {
  if (!normalizeDate(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function clipName(value: string): string {
  return value.normalize('NFC').trim().slice(0, NAME_MAX);
}

export function clipGym(value: string): string {
  return value.normalize('NFC').trim().slice(0, GYM_MAX);
}

export function clipDivision(value: string): string {
  return value.normalize('NFC').trim().slice(0, DIVISION_MAX);
}

export function clipNote(value: string): string {
  return value.trim().slice(0, NOTE_MAX);
}

/** Yes, true, or 1 count as checked in. Anything else, including a blank, stays off. */
export function parseCheckedIn(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  const key = value.trim().toLowerCase();
  return key === 'yes' || key === 'y' || key === 'true' || key === '1' || key === 'checked' || key === 'checked in';
}

export function formatCheckedIn(checkedIn: boolean): string {
  return checkedIn ? 'Yes' : 'No';
}

export function studentFromInput(
  input: Partial<StudentDraft> & { id?: string; checkedIn?: unknown },
): Student | null {
  const name = clipName(input.name ?? '');
  const belt = canonicalBelt(input.belt ?? '');
  if (!name || !belt) return null;
  return {
    id: input.id && input.id.trim() ? input.id.trim() : createStudentId(),
    name,
    belt,
    division: clipDivision(input.division ?? ''),
    gym: clipGym(input.gym ?? ''),
    lastPromotion: normalizeDate(input.lastPromotion ?? ''),
    note: clipNote(input.note ?? ''),
    checkedIn: parseCheckedIn(input.checkedIn),
  };
}

export function canPrefill(student: Pick<Student, 'name' | 'belt'>): boolean {
  return Boolean(student.name.trim() && student.belt.trim());
}

export function prefillFields(
  student: Pick<Student, 'name' | 'belt' | 'gym' | 'division' | 'note' | 'lastPromotion'>,
): RosterPrefill | null {
  const name = clipName(student.name);
  const belt = canonicalBelt(student.belt);
  if (!name || !belt) return null;
  return { name, belt, gym: clipGym(student.gym), division: clipDivision(student.division) };
}

/** Gym or academy saved on the roster card for this exact name. Empty when none. */
export function rosterGymForName(name: string, students: Student[] = getRoster().students): string {
  return findStudentByName(students, name)?.gym ?? '';
}

export function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function searchStudents(students: Student[], query: string): Student[] {
  const eligible = sortStudents(students.filter(canPrefill));
  const q = query.trim().toLowerCase();
  if (!q) return eligible;
  return eligible
    .map((student) => {
      const name = student.name.toLowerCase();
      const belt = student.belt.toLowerCase();
      const division = student.division.toLowerCase();
      let score = 0;
      if (name === q) score = 4;
      else if (name.startsWith(q)) score = 3;
      else if (name.includes(q)) score = 2;
      else if (belt.startsWith(q) || belt.includes(q)) score = 1;
      else if (division.startsWith(q) || division.includes(q)) score = 1;
      else return null;
      return { student, score };
    })
    .filter((row): row is { student: Student; score: number } => row != null)
    .sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name, undefined, { sensitivity: 'base' }))
    .map((row) => row.student);
}

export function findStudentByName(students: Student[], name: string): Student | undefined {
  const key = clipName(name).toLowerCase();
  if (!key) return undefined;
  return students.find((row) => clipName(row.name).toLowerCase() === key);
}

/** Typed name for a bracket/match. Optionally append a new local roster card. */
export function confirmManualCompetitor(
  name: string,
  options: { addToRoster: boolean; belt?: string },
): RosterPrefill | null {
  const clipped = clipName(name);
  if (!clipped) return null;

  const existing = findStudentByName(state.students, clipped);
  if (existing) {
    return prefillFields(existing) ?? {
      name: existing.name,
      belt: existing.belt,
      gym: existing.gym,
      division: existing.division,
    };
  }

  const belt = canonicalBelt(options.belt ?? '');
  if (options.addToRoster) {
    if (!belt) return null;
    const added = addStudent({ name: clipped, belt, division: '', gym: '', lastPromotion: '', note: '' });
    return added
      ? { name: added.name, belt: added.belt, gym: added.gym, division: added.division }
      : null;
  }

  return { name: clipped, belt, gym: '', division: '' };
}

export function normalizeStudent(raw: unknown): Student | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<Student>;
  return studentFromInput({
    id: typeof row.id === 'string' ? row.id : undefined,
    name: typeof row.name === 'string' ? row.name : '',
    belt: typeof row.belt === 'string' ? row.belt : '',
    division: typeof row.division === 'string' ? row.division : '',
    gym: typeof row.gym === 'string' ? row.gym : '',
    lastPromotion: typeof row.lastPromotion === 'string' ? row.lastPromotion : '',
    note: typeof row.note === 'string' ? row.note : '',
    checkedIn: row.checkedIn,
  });
}

export function normalizeRoster(raw: unknown): RosterState {
  if (!raw || typeof raw !== 'object') return defaultRoster();
  const parsed = raw as Partial<RosterState>;
  if (!Array.isArray(parsed.students)) return defaultRoster();
  const seen = new Set<string>();
  const students: Student[] = [];
  for (const item of parsed.students) {
    const next = normalizeStudent(item);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    students.push(next);
  }
  const sorted = sortStudents(students);
  return {
    version: 1,
    students: sorted,
    gamePlans: normalizeGamePlanMap(parsed.gamePlans, new Set(sorted.map((row) => row.id))),
  };
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function loadState(): RosterState {
  try {
    const raw = readStorage();
    if (!raw) {
      siblings = {};
      return defaultRoster();
    }
    const parsed: unknown = JSON.parse(raw);
    siblings = rosterSiblings(parsed);
    return normalizeRoster(parsed);
  } catch {
    siblings = {};
    return defaultRoster();
  }
}

function persist(next: RosterState): void {
  state = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rosterSavePayload(state, siblings)));
    }
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

function commit(students: Student[], gamePlans: Record<string, CompetitorGamePlan> = state.gamePlans): void {
  persist({ version: 1, students, gamePlans });
}

function writeGamePlan(studentId: string, plan: CompetitorGamePlan): void {
  if (!state.students.some((row) => row.id === studentId)) return;
  const clean = normalizeGamePlan(plan);
  const gamePlans = { ...state.gamePlans };
  if (clean) gamePlans[studentId] = clean;
  else delete gamePlans[studentId];
  commit(state.students, gamePlans);
}

export function getRoster(): RosterState {
  return state;
}

export function subscribeRoster(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function addStudent(draft: StudentDraft): Student | null {
  const next = studentFromInput(draft);
  if (!next) return null;
  commit(sortStudents([...state.students, next]));
  return next;
}

/** Append already-validated cards in one write. Used by CSV import. */
export function addStudents(students: Student[]): Student[] {
  if (!students.length) return [];
  commit(sortStudents([...state.students, ...students]));
  return students;
}

export function updateStudent(id: string, draft: Partial<StudentDraft>): Student | null {
  const current = state.students.find((row) => row.id === id);
  if (!current) return null;
  const next = studentFromInput({
    id: current.id,
    name: draft.name ?? current.name,
    belt: draft.belt ?? current.belt,
    division: draft.division ?? current.division,
    gym: draft.gym ?? current.gym,
    lastPromotion: draft.lastPromotion ?? current.lastPromotion,
    note: draft.note ?? current.note,
    checkedIn: current.checkedIn,
  });
  if (!next) return null;
  commit(sortStudents(state.students.map((row) => (row.id === id ? next : row))));
  return next;
}

export function setCheckedIn(id: string, checkedIn: boolean): Student | null {
  const current = state.students.find((row) => row.id === id);
  if (!current) return null;
  const next = { ...current, checkedIn };
  commit(state.students.map((row) => (row.id === id ? next : row)));
  return next;
}

export function removeStudent(id: string): void {
  siblings = dropSiblingCompetitor(siblings, id);
  const gamePlans = { ...state.gamePlans };
  delete gamePlans[id];
  commit(
    state.students.filter((row) => row.id !== id),
    gamePlans,
  );
}

export function resetRoster(): void {
  siblings = {};
  persist(defaultRoster());
}

export function competitorGamePlan(studentId: string, roster: RosterState = getRoster()): CompetitorGamePlan {
  return roster.gamePlans[studentId] ?? emptyGamePlan();
}

export function setGameNotes(studentId: string, section: GameSection, notes: string): void {
  writeGamePlan(studentId, withGameNotes(competitorGamePlan(studentId), section, notes));
}

export function setGameAudit(studentId: string, section: GameLayerSection, audit: GameAudit | ''): void {
  writeGamePlan(studentId, withGameAudit(competitorGamePlan(studentId), section, audit));
}

/** Attaches a tree step. Notes are left as they are. A missing id is ignored. */
export function addGameLink(
  studentId: string,
  section: GameSection,
  link: { treeId: string; nodeId: string },
): void {
  const current = competitorGamePlan(studentId);
  const next = withGameLink(current, section, link);
  if (next === current) return;
  writeGamePlan(studentId, next);
}

export function setGameLinkFlag(
  studentId: string,
  section: GameSection,
  treeId: string,
  nodeId: string,
  flag: GameLinkFlag | '',
): void {
  const current = competitorGamePlan(studentId);
  const next = withGameLinkFlag(current, section, treeId, nodeId, flag);
  if (next === current) return;
  writeGamePlan(studentId, next);
}

export function removeGameLink(studentId: string, section: GameSection, treeId: string, nodeId: string): void {
  const current = competitorGamePlan(studentId);
  const next = withoutGameLink(current, section, treeId, nodeId);
  if (next === current) return;
  writeGamePlan(studentId, next);
}

export function initRosterSync(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    listeners.forEach((fn) => fn());
  });
}
