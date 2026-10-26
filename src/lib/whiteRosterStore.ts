/**
 * Advantage White match names. This phone only.
 * A name and a belt rank for the White scoreboard — not the Competitor Roster
 * (`matboard.roster.v1`) used by Coach, Pro, and Mock Tournament.
 *
 * Coach may later unlock or share this list. That handoff is not built here.
 * Do not merge these names into the Competitor Roster until that is decided.
 */

import { canonicalBelt, clipName, isKnownBelt } from './rosterStore.ts';

export const WHITE_ROSTER_STORAGE_KEY = 'matboard.whiteRoster.v1';

/** One saved scoreboard name. No gym, division, notes, or promotion date. */
export type WhiteMatchName = {
  id: string;
  name: string;
  belt: string;
};

export type WhiteRosterState = {
  version: 1;
  names: WhiteMatchName[];
};

/** Name and belt for a White scoreboard fill. Gym and division stay empty. */
export type WhiteMatchPrefill = {
  name: string;
  belt: string;
  gym: string;
  division: string;
};

const listeners = new Set<() => void>();
let idSeq = 0;
let state: WhiteRosterState = readState();

function createId(): string {
  idSeq += 1;
  return `w-${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortNames(names: WhiteMatchName[]): WhiteMatchName[] {
  return [...names].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function nameKey(name: string): string {
  return clipName(name).toLowerCase();
}

/** Keep id, name, and a known belt. Drop every other field. */
export function normalizeWhiteRoster(raw: unknown): WhiteRosterState {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const rows = record && Array.isArray(record.names) ? record.names : [];
  const names: WhiteMatchName[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    const name = clipName(typeof item.name === 'string' ? item.name : '');
    const belt = canonicalBelt(typeof item.belt === 'string' ? item.belt : '');
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || !name || !isKnownBelt(belt)) continue;
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push({ id, name, belt });
  }
  return { version: 1, names: sortNames(names) };
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(WHITE_ROSTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readState(): WhiteRosterState {
  try {
    const raw = readStorage();
    if (!raw) return { version: 1, names: [] };
    return normalizeWhiteRoster(JSON.parse(raw));
  } catch {
    return { version: 1, names: [] };
  }
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

function write(next: WhiteRosterState): void {
  state = { version: 1, names: sortNames(next.names) };
  try {
    if (typeof localStorage !== 'undefined') {
      if (state.names.length === 0) localStorage.removeItem(WHITE_ROSTER_STORAGE_KEY);
      else localStorage.setItem(WHITE_ROSTER_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* private mode or a full disk — the in-memory list still updates */
  }
  emit();
}

export function getWhiteRoster(): WhiteRosterState {
  return state;
}

export function subscribeWhiteRoster(fn: () => void): () => void {
  listeners.add(fn);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(fn);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WHITE_ROSTER_STORAGE_KEY && event.key !== null) return;
    state = readState();
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** Re-read this phone's save. Tests use this after writing the key directly. */
export function hydrateWhiteRoster(): void {
  state = readState();
  emit();
}

export function resetWhiteRoster(): void {
  write({ version: 1, names: [] });
}

export function findWhiteMatchName(names: WhiteMatchName[], name: string): WhiteMatchName | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return names.find((row) => nameKey(row.name) === key);
}

export function searchWhiteMatchNames(names: WhiteMatchName[], query: string): WhiteMatchName[] {
  const sorted = sortNames(names);
  const q = query.trim().toLowerCase();
  if (!q) return sorted;
  return sorted.filter((row) => {
    const name = row.name.toLowerCase();
    const belt = row.belt.toLowerCase();
    return name.includes(q) || belt.includes(q);
  });
}

export function whiteMatchPrefill(entry: WhiteMatchName): WhiteMatchPrefill {
  return { name: entry.name, belt: entry.belt, gym: '', division: '' };
}

/** Save a scoreboard name. The same name updates its belt instead of duplicating. */
export function addWhiteMatchName(name: string, belt: string): WhiteMatchName | null {
  const clipped = clipName(name);
  const rank = canonicalBelt(belt);
  if (!clipped || !isKnownBelt(rank)) return null;
  const existing = findWhiteMatchName(state.names, clipped);
  if (existing) {
    const next = { ...existing, name: clipped, belt: rank };
    write({ version: 1, names: state.names.map((row) => (row.id === existing.id ? next : row)) });
    return next;
  }
  const added: WhiteMatchName = { id: createId(), name: clipped, belt: rank };
  write({ version: 1, names: [...state.names, added] });
  return added;
}

/** Edit one saved name. A name already used by someone else is left unchanged. */
export function updateWhiteMatchName(id: string, name: string, belt: string): WhiteMatchName | null {
  const current = state.names.find((row) => row.id === id);
  if (!current) return null;
  const clipped = clipName(name);
  const rank = canonicalBelt(belt);
  if (!clipped || !isKnownBelt(rank)) return null;
  const clash = state.names.find((row) => row.id !== id && nameKey(row.name) === nameKey(clipped));
  if (clash) return null;
  const next = { id, name: clipped, belt: rank };
  write({ version: 1, names: state.names.map((row) => (row.id === id ? next : row)) });
  return next;
}

export function removeWhiteMatchName(id: string): void {
  if (!state.names.some((row) => row.id === id)) return;
  write({ version: 1, names: state.names.filter((row) => row.id !== id) });
}
