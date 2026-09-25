/** Gym competitor roster. On-device only — name + belt prefill Match and Mock Tournament. */

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

/** Weekend checklist items. Missing or false means Off. */
export const READY_ITEMS = [
  { id: 'medical', label: 'Medical forms on file' },
  { id: 'gi', label: 'Gi inspection passed' },
  { id: 'division', label: 'Division confirmed' },
  { id: 'travel', label: 'Travel / lodging booked' },
  { id: 'waiver', label: 'Waiver signed' },
  { id: 'weighIn', label: 'Weigh-in ready' },
] as const;

export type ReadyItemId = (typeof READY_ITEMS)[number]['id'];

export const READY_NOTE_MAX = NOTE_MAX;
export const READY_EXTRA_LABEL_MAX = 48;
export const READY_EXTRA_MAX = 3;

export type ReadyExtra = {
  id: string;
  label: string;
  /** Off until a coach turns it on. */
  on: boolean;
};

/** One competitor's tournament-weekend checklist. Not the roster Division or Check In fields. */
export type CompetitorReady = {
  flags: Record<ReadyItemId, boolean>;
  note: string;
  extras: ReadyExtra[];
};

export type RosterState = {
  version: 1;
  students: Student[];
  /** Keyed by competitor id. A missing id means every checklist item is off. */
  ready: Record<string, CompetitorReady>;
};

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

let state: RosterState = loadState();

let studentSeq = 0;

export function createStudentId(): string {
  studentSeq += 1;
  return `r-${Date.now().toString(36)}-${studentSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultRoster(): RosterState {
  return { version: 1, students: [], ready: {} };
}

export function emptyReadyFlags(): Record<ReadyItemId, boolean> {
  return {
    medical: false,
    gi: false,
    division: false,
    travel: false,
    waiver: false,
    weighIn: false,
  };
}

export function emptyReady(): CompetitorReady {
  return { flags: emptyReadyFlags(), note: '', extras: [] };
}

/** Saved checklist, or all off when this competitor has never been opened. */
export function competitorReady(studentId: string, roster: RosterState = getRoster()): CompetitorReady {
  return roster.ready[studentId] ?? emptyReady();
}

export function readyProgress(ready: CompetitorReady): { on: number; total: number; complete: boolean } {
  const flagOn = READY_ITEMS.filter((item) => ready.flags[item.id]).length;
  const extraOn = ready.extras.filter((item) => item.on).length;
  const total = READY_ITEMS.length + ready.extras.length;
  const on = flagOn + extraOn;
  return { on, total, complete: total > 0 && on === total };
}

/** Scan label for the competitor list. Complete lists read Ready. */
export function readyStatusLabel(ready: CompetitorReady): string {
  const progress = readyProgress(ready);
  if (progress.complete) return 'Ready';
  return `${progress.on} of ${progress.total} on`;
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

function readyIsBlank(ready: CompetitorReady): boolean {
  const flagsOff = READY_ITEMS.every((item) => !ready.flags[item.id]);
  return flagsOff && !ready.note && ready.extras.length === 0;
}

function normalizeReadyEntry(raw: unknown): CompetitorReady | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as { flags?: unknown; note?: unknown; extras?: unknown };
  const flags = emptyReadyFlags();
  if (row.flags && typeof row.flags === 'object') {
    const bag = row.flags as Record<string, unknown>;
    for (const item of READY_ITEMS) flags[item.id] = bag[item.id] === true;
  }
  const note = typeof row.note === 'string' ? row.note.trim().slice(0, READY_NOTE_MAX) : '';
  const extras: ReadyExtra[] = [];
  if (Array.isArray(row.extras)) {
    const seen = new Set<string>();
    for (const item of row.extras) {
      if (!item || typeof item !== 'object') continue;
      const extra = item as Partial<ReadyExtra>;
      const id = typeof extra.id === 'string' ? extra.id.trim() : '';
      const label =
        typeof extra.label === 'string' ? extra.label.trim().slice(0, READY_EXTRA_LABEL_MAX) : '';
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      extras.push({ id, label, on: extra.on === true });
      if (extras.length >= READY_EXTRA_MAX) break;
    }
  }
  const next = { flags, note, extras };
  return readyIsBlank(next) ? null : next;
}

function normalizeReadyMap(raw: unknown, studentIds: Set<string>): Record<string, CompetitorReady> {
  if (!raw || typeof raw !== 'object') return {};
  const ready: Record<string, CompetitorReady> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!studentIds.has(id)) continue;
    const next = normalizeReadyEntry(value);
    if (!next) continue;
    ready[id] = next;
  }
  return ready;
}

export function normalizeRoster(raw: unknown): RosterState {
  if (!raw || typeof raw !== 'object') return defaultRoster();
  const parsed = raw as Partial<RosterState> & { ready?: unknown };
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
    ready: normalizeReadyMap(parsed.ready, new Set(sorted.map((row) => row.id))),
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
    if (!raw) return defaultRoster();
    return normalizeRoster(JSON.parse(raw));
  } catch {
    return defaultRoster();
  }
}

function persist(next: RosterState): void {
  state = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((fn) => fn());
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

function commit(students: Student[], ready: Record<string, CompetitorReady> = state.ready): void {
  persist({ version: 1, students, ready });
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

function writeReady(studentId: string, next: CompetitorReady): void {
  if (!state.students.some((row) => row.id === studentId)) return;
  const ready = { ...state.ready };
  if (readyIsBlank(next)) delete ready[studentId];
  else ready[studentId] = next;
  commit(state.students, ready);
}

export function setReadyFlag(studentId: string, itemId: ReadyItemId, on: boolean): void {
  if (!READY_ITEMS.some((item) => item.id === itemId)) return;
  const current = competitorReady(studentId);
  writeReady(studentId, { ...current, flags: { ...current.flags, [itemId]: on } });
}

export function setReadyNote(studentId: string, note: string): void {
  const current = competitorReady(studentId);
  writeReady(studentId, { ...current, note: note.trim().slice(0, READY_NOTE_MAX) });
}

/** Custom row starts Off. Blank labels and a full list of extras are ignored. */
export function addReadyExtra(studentId: string, label: string): ReadyExtra | null {
  const clipped = label.trim().slice(0, READY_EXTRA_LABEL_MAX);
  if (!clipped || !state.students.some((row) => row.id === studentId)) return null;
  const current = competitorReady(studentId);
  if (current.extras.length >= READY_EXTRA_MAX) return null;
  const extra: ReadyExtra = { id: createStudentId(), label: clipped, on: false };
  writeReady(studentId, { ...current, extras: [...current.extras, extra] });
  return extra;
}

export function setReadyExtra(studentId: string, extraId: string, on: boolean): void {
  const current = competitorReady(studentId);
  if (!current.extras.some((item) => item.id === extraId)) return;
  writeReady(studentId, {
    ...current,
    extras: current.extras.map((item) => (item.id === extraId ? { ...item, on } : item)),
  });
}

export function removeReadyExtra(studentId: string, extraId: string): void {
  const current = competitorReady(studentId);
  if (!current.extras.some((item) => item.id === extraId)) return;
  writeReady(studentId, {
    ...current,
    extras: current.extras.filter((item) => item.id !== extraId),
  });
}

export function removeStudent(id: string): void {
  const ready = { ...state.ready };
  delete ready[id];
  commit(
    state.students.filter((row) => row.id !== id),
    ready,
  );
}

export function resetRoster(): void {
  persist(defaultRoster());
}

export function initRosterSync(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    listeners.forEach((fn) => fn());
  });
}
