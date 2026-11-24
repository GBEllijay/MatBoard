/**
 * Advantage White Bracket Roster. This device only.
 * Separate from the Coach/Pro Competitor Roster (`matboard.roster.v1`).
 * Named "Bracket Roster" on purpose. The White scoreboard name picker reads
 * this list. If this roster is empty, saved Match names (`matboard.whiteRoster.v1`)
 * are copied in once; that old key is left in place.
 */

import { WHITE_BOARD_FROM } from './productNames.ts';
import { clipName } from './rosterStore.ts';
import { fillCheckedInBracket, getTournament, newBracket, bracketHasContent, WHITE_MAX_COMPETITORS } from './tournamentStore.ts';
import { getWhiteRoster } from './whiteRosterStore.ts';

export const BRACKET_ROSTER_STORAGE_KEY = 'matboard.bracketRoster.v1';
/** Set after a one-time copy of Match names into an empty Bracket Roster. */
export const WHITE_MATCH_NAMES_IMPORT_KEY = 'matboard.bracketRoster.importedWhiteRoster.v1';
export const BRACKET_ROSTER_MAX = 1000;
export const BRACKET_ROSTER_CSV_HEADERS = ['name', 'gym', 'weight', 'division', 'age', 'rank'] as const;
export const BRACKET_ROSTER_SAMPLE_PATH = '/samples/bracket-roster-sample.csv';
export const WHITE_BRACKET_ROSTER_PATH = '/white/bracket-roster';
export const WHITE_BRACKETS_PATH = '/white/brackets?from=white';
export { WHITE_BOARD_FROM };

export type BracketRosterEntry = {
  id: string;
  name: string;
  gym: string;
  weight: string;
  division: string;
  age: string;
  rank: string;
};

export type BracketRosterState = {
  version: 1;
  entries: BracketRosterEntry[];
};

export type BracketRosterCsvResult = {
  entries: BracketRosterEntry[];
  skipped: number;
  truncated: number;
  error?: string;
};

const listeners = new Set<() => void>();
let idSeq = 0;
let state: BracketRosterState = readState();

function createId(): string {
  idSeq += 1;
  return `br-${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clipField(value: string, max = 80): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function nameKey(name: string): string {
  return clipName(name).toLowerCase();
}

export function emptyEntry(): Omit<BracketRosterEntry, 'id'> {
  return { name: '', gym: '', weight: '', division: '', age: '', rank: '' };
}

export function normalizeBracketRoster(raw: unknown): BracketRosterState {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const rows = record && Array.isArray(record.entries) ? record.entries : [];
  const entries: BracketRosterEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    const name = clipName(typeof item.name === 'string' ? item.name : '');
    if (!name) continue;
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createId();
    entries.push({
      id,
      name,
      gym: clipField(typeof item.gym === 'string' ? item.gym : ''),
      weight: clipField(typeof item.weight === 'string' ? item.weight : '', 24),
      division: clipField(typeof item.division === 'string' ? item.division : '', 40),
      age: clipField(typeof item.age === 'string' ? item.age : '', 8),
      rank: clipField(typeof item.rank === 'string' ? item.rank : '', 24),
    });
    if (entries.length >= BRACKET_ROSTER_MAX) break;
  }
  return { version: 1, entries };
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(BRACKET_ROSTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readState(): BracketRosterState {
  try {
    const raw = readStorage();
    if (!raw) return { version: 1, entries: [] };
    return normalizeBracketRoster(JSON.parse(raw));
  } catch {
    return { version: 1, entries: [] };
  }
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

function write(next: BracketRosterState): void {
  state = normalizeBracketRoster(next);
  try {
    if (typeof localStorage !== 'undefined') {
      if (state.entries.length === 0) localStorage.removeItem(BRACKET_ROSTER_STORAGE_KEY);
      else localStorage.setItem(BRACKET_ROSTER_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* private mode or a full disk — the in-memory list still updates */
  }
  emit();
}

export function getBracketRoster(): BracketRosterState {
  return state;
}

export function subscribeBracketRoster(fn: () => void): () => void {
  listeners.add(fn);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(fn);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== BRACKET_ROSTER_STORAGE_KEY && event.key !== null) return;
    state = readState();
    emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function addBracketRosterEntry(input: Omit<BracketRosterEntry, 'id'>): BracketRosterEntry | null {
  const name = clipName(input.name);
  if (!name) return null;
  const key = nameKey(name);
  if (state.entries.some((entry) => nameKey(entry.name) === key)) return null;
  if (state.entries.length >= BRACKET_ROSTER_MAX) return null;
  const saved: BracketRosterEntry = {
    id: createId(),
    name,
    gym: clipField(input.gym),
    weight: clipField(input.weight, 24),
    division: clipField(input.division, 40),
    age: clipField(input.age, 8),
    rank: clipField(input.rank, 24),
  };
  write({ version: 1, entries: [...state.entries, saved] });
  return saved;
}

export function updateBracketRosterEntry(id: string, input: Omit<BracketRosterEntry, 'id'>): BracketRosterEntry | null {
  const name = clipName(input.name);
  if (!name) return null;
  const key = nameKey(name);
  const current = state.entries.find((entry) => entry.id === id);
  if (!current) return null;
  if (state.entries.some((entry) => entry.id !== id && nameKey(entry.name) === key)) return null;
  const saved: BracketRosterEntry = {
    id,
    name,
    gym: clipField(input.gym),
    weight: clipField(input.weight, 24),
    division: clipField(input.division, 40),
    age: clipField(input.age, 8),
    rank: clipField(input.rank, 24),
  };
  write({
    version: 1,
    entries: state.entries.map((entry) => (entry.id === id ? saved : entry)),
  });
  return saved;
}

export function removeBracketRosterEntry(id: string): void {
  write({ version: 1, entries: state.entries.filter((entry) => entry.id !== id) });
}

export function replaceBracketRoster(entries: BracketRosterEntry[]): BracketRosterState {
  write({ version: 1, entries });
  return state;
}

export function clearBracketRoster(): void {
  write({ version: 1, entries: [] });
}

/** RFC-style CSV cell. Quotes only when needed. */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function formatBracketRosterCsv(entries: readonly BracketRosterEntry[]): string {
  const lines = [
    BRACKET_ROSTER_CSV_HEADERS.join(','),
    ...entries.map((entry) =>
      [entry.name, entry.gym, entry.weight, entry.division, entry.age, entry.rank].map(csvEscape).join(','),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function headerIndex(headers: string[], name: string): number {
  return headers.findIndex((header) => header === name);
}

/**
 * Parse a Bracket Roster CSV. Header row must be
 * name,gym,weight,division,age,rank (case-insensitive, any order).
 * Extra columns are ignored. Rows without a name are skipped.
 * A list longer than BRACKET_ROSTER_MAX (a safety ceiling) is truncated.
 */
export function parseBracketRosterCsv(raw: string): BracketRosterCsvResult {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { entries: [], skipped: 0, truncated: 0, error: 'The file is empty.' };
  const lines = text.split('\n').map((line) => line.trimEnd()).filter((line) => line && line !== 'sep=,');
  if (!lines.length) return { entries: [], skipped: 0, truncated: 0, error: 'The file is empty.' };
  const headers = splitCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const required = [...BRACKET_ROSTER_CSV_HEADERS];
  if (required.some((name) => headerIndex(headers, name) < 0)) {
    return {
      entries: [],
      skipped: 0,
      truncated: 0,
      error: 'The first row must be name,gym,weight,division,age,rank.',
    };
  }
  const entries: BracketRosterEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let truncated = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const name = clipName(cells[headerIndex(headers, 'name')] ?? '');
    if (!name) {
      skipped += 1;
      continue;
    }
    const key = nameKey(name);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    if (entries.length >= BRACKET_ROSTER_MAX) {
      truncated += 1;
      continue;
    }
    seen.add(key);
    const field = (column: (typeof BRACKET_ROSTER_CSV_HEADERS)[number], max: number) =>
      clipField(cells[headerIndex(headers, column)] ?? '', max);
    entries.push({
      id: createId(),
      name,
      gym: field('gym', 80),
      weight: field('weight', 24),
      division: field('division', 40),
      age: field('age', 8),
      rank: field('rank', 24),
    });
  }
  return { entries, skipped, truncated };
}

/** Seed the on-device tournament board from this roster. Returns how many names were placed. */
export function seedWhiteBracketFromRoster(
  max = WHITE_MAX_COMPETITORS,
  options?: { newBoard?: boolean },
): number {
  const names = state.entries.map((entry) => entry.name).filter(Boolean);
  if (names.length < 2) return 0;
  if (options?.newBoard !== false && bracketHasContent(getTournament())) newBracket();
  // The roster can hold many names. A White bracket still tops out at WHITE_MAX_COMPETITORS.
  const cap = Math.min(WHITE_MAX_COMPETITORS, Math.max(2, Math.round(max) || WHITE_MAX_COMPETITORS));
  return fillCheckedInBracket(names, cap, cap);
}

export function findBracketRosterName(entries: readonly BracketRosterEntry[], name: string): BracketRosterEntry | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return entries.find((entry) => nameKey(entry.name) === key);
}

export function searchBracketRoster(entries: readonly BracketRosterEntry[], query: string): BracketRosterEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((entry) => {
    const name = entry.name.toLowerCase();
    const rank = entry.rank.toLowerCase();
    const gym = entry.gym.toLowerCase();
    return name.includes(q) || rank.includes(q) || gym.includes(q);
  });
}

/** Name, belt/rank, gym, and division for a White scoreboard fill. */
export function bracketRosterPrefill(entry: BracketRosterEntry): {
  name: string;
  belt: string;
  gym: string;
  division: string;
} {
  return { name: entry.name, belt: entry.rank, gym: entry.gym, division: entry.division };
}

/**
 * Save a name to the Bracket Roster. The same name updates its rank instead of
 * duplicating, and leaves gym, weight, division, and age alone.
 */
export function upsertBracketRosterName(name: string, rank: string): BracketRosterEntry | null {
  const clipped = clipName(name);
  if (!clipped) return null;
  const nextRank = clipField(rank, 24);
  const existing = findBracketRosterName(state.entries, clipped);
  if (existing) {
    return updateBracketRosterEntry(existing.id, {
      name: existing.name,
      gym: existing.gym,
      weight: existing.weight,
      division: existing.division,
      age: existing.age,
      rank: nextRank || existing.rank,
    });
  }
  return addBracketRosterEntry({
    name: clipped,
    gym: '',
    weight: '',
    division: '',
    age: '',
    rank: nextRank,
  });
}

function importFlagSet(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(WHITE_MATCH_NAMES_IMPORT_KEY) === '1';
  } catch {
    return false;
  }
}

function setImportFlag(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(WHITE_MATCH_NAMES_IMPORT_KEY, '1');
  } catch {
    /* private mode or a full disk */
  }
}

/**
 * If the Bracket Roster is empty, copy saved Match names in once.
 * Leaves `matboard.whiteRoster.v1` in place. Does not run again after the flag is set,
 * even if the Bracket Roster is later cleared.
 */
export function importWhiteMatchNamesOnce(): number {
  if (state.entries.length > 0) return 0;
  if (importFlagSet()) return 0;
  const names = getWhiteRoster().names;
  if (!names.length) return 0;
  const entries: BracketRosterEntry[] = names.slice(0, BRACKET_ROSTER_MAX).map((row) => ({
    id: createId(),
    name: row.name,
    gym: '',
    weight: '',
    division: '',
    age: '',
    rank: clipField(row.belt, 24),
  }));
  write({ version: 1, entries });
  setImportFlag();
  return entries.length;
}

/** Reset in-memory state in tests. */
export function resetBracketRosterForTests(): void {
  state = { version: 1, entries: [] };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BRACKET_ROSTER_STORAGE_KEY);
      localStorage.removeItem(WHITE_MATCH_NAMES_IMPORT_KEY);
    }
  } catch {
    /* ignore */
  }
  emit();
}
