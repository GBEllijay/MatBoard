/**
 * The student's additions pool. Separate from the core glossary and never written into it.
 * A row is a move the student added that the glossary does not have, a glossary move they
 * renamed, or a glossary move they keep on a different face. Rows count repeats, so a later
 * review can merge the common ones into the core glossary.
 * One key per student on this phone (the profile switcher swaps every matboard.studentEdition. key).
 */
import { glossaryTerm } from './glossary.ts';
import { isIndexFaceId, termKey, type IndexFaceId } from './indexCards.ts';

export const GLOSSARY_ADDITIONS_KEY = 'matboard.studentEdition.glossaryAdditions.v1';

export type AdditionKind = 'new' | 'renamed' | 'recategorized';

export type GlossaryAddition = {
  /** kind:name-key:face. One row per distinct suggestion. */
  id: string;
  kind: AdditionKind;
  name: string;
  faceId: IndexFaceId;
  /** Glossary headword this row is about, for renamed and recategorized rows. */
  glossaryTerm?: string;
  glossaryFaceId?: IndexFaceId;
  count: number;
  firstAt: number;
  lastAt: number;
};

export type AdditionsPool = {
  version: 1;
  additions: GlossaryAddition[];
};

const MAX_ROWS = 400;
const NAME_MAX = 80;

type MemoryStore = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyAdditions(): AdditionsPool {
  return { version: 1, additions: [] };
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) : '';
}

function cleanRow(value: unknown): GlossaryAddition | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<GlossaryAddition>;
  const kind = row.kind === 'new' || row.kind === 'renamed' || row.kind === 'recategorized' ? row.kind : null;
  const name = cleanName(row.name);
  const faceId = typeof row.faceId === 'string' && isIndexFaceId(row.faceId) ? row.faceId : null;
  if (!kind || !name || !faceId) return null;
  const count = typeof row.count === 'number' && row.count >= 1 ? Math.floor(row.count) : 1;
  const firstAt = typeof row.firstAt === 'number' && Number.isFinite(row.firstAt) ? row.firstAt : 0;
  const lastAt = typeof row.lastAt === 'number' && Number.isFinite(row.lastAt) ? row.lastAt : firstAt;
  const clean: GlossaryAddition = { id: additionId(kind, name, faceId), kind, name, faceId, count, firstAt, lastAt };
  const term = cleanName(row.glossaryTerm);
  if (term) clean.glossaryTerm = term;
  if (typeof row.glossaryFaceId === 'string' && isIndexFaceId(row.glossaryFaceId)) clean.glossaryFaceId = row.glossaryFaceId;
  return clean;
}

function normalize(value: unknown): AdditionsPool {
  const rows = value && typeof value === 'object' && Array.isArray((value as { additions?: unknown }).additions)
    ? (value as { additions: unknown[] }).additions
    : [];
  const seen = new Set<string>();
  const additions: GlossaryAddition[] = [];
  for (const raw of rows) {
    const row = cleanRow(raw);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    additions.push(row);
    if (additions.length >= MAX_ROWS) break;
  }
  return { version: 1, additions };
}

export function additionId(kind: AdditionKind, name: string, faceId: IndexFaceId): string {
  return `${kind}:${termKey(name)}:${faceId}`;
}

export function loadAdditions(storage: Pick<Storage, 'getItem'>): AdditionsPool {
  try {
    const raw = storage.getItem(GLOSSARY_ADDITIONS_KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyAdditions();
  } catch {
    return emptyAdditions();
  }
}

export function writeAdditions(storage: MemoryStore, pool: AdditionsPool): AdditionsPool {
  const clean = normalize(pool);
  storage.setItem(GLOSSARY_ADDITIONS_KEY, JSON.stringify(clean));
  return clean;
}

export type AdditionInput = {
  name: string;
  faceId: IndexFaceId;
  /** The glossary name the move started as, when the student renamed or moved a glossary move. */
  from?: string | null;
  now?: number;
};

/**
 * What the pool should record for one save, or null when nothing differs from the glossary.
 * A glossary word on its glossary face is already core. A new name is "new" (or "renamed"
 * when it replaced a glossary move). A glossary word on another face is "recategorized".
 */
export function classifyAddition(input: AdditionInput): Omit<GlossaryAddition, 'id' | 'count' | 'firstAt' | 'lastAt'> | null {
  const name = cleanName(input.name);
  if (!name || !isIndexFaceId(input.faceId)) return null;
  const known = glossaryTerm(name);
  if (known) {
    if (known.faceId === input.faceId) return null;
    return { kind: 'recategorized', name, faceId: input.faceId, glossaryTerm: known.term, glossaryFaceId: known.faceId };
  }
  const origin = input.from ? glossaryTerm(input.from) : null;
  if (origin) return { kind: 'renamed', name, faceId: input.faceId, glossaryTerm: origin.term, glossaryFaceId: origin.faceId };
  return { kind: 'new', name, faceId: input.faceId };
}

export function recordAddition(pool: AdditionsPool, input: AdditionInput): AdditionsPool {
  const row = classifyAddition(input);
  if (!row) return pool;
  const now = input.now ?? Date.now();
  const id = additionId(row.kind, row.name, row.faceId);
  const prior = pool.additions.find((item) => item.id === id);
  const next: GlossaryAddition = prior
    ? { ...prior, ...row, id, count: prior.count + 1, lastAt: now }
    : { ...row, id, count: 1, firstAt: now, lastAt: now };
  return normalize({ version: 1, additions: [next, ...pool.additions.filter((item) => item.id !== id)] });
}

/** Most repeated first, then most recent. */
export function additionsForReview(pool: AdditionsPool): GlossaryAddition[] {
  return [...pool.additions].sort((left, right) => right.count - left.count || right.lastAt - left.lastAt || left.name.localeCompare(right.name));
}

/** Names this student added, offered back in their own typeahead. */
export function myMoveNames(pool: AdditionsPool): { name: string; faceId: IndexFaceId }[] {
  return pool.additions.filter((row) => row.kind !== 'recategorized').map((row) => ({ name: row.name, faceId: row.faceId }));
}

export type MergedAddition = {
  kind: AdditionKind;
  name: string;
  faceId: IndexFaceId;
  glossaryTerm?: string;
  /** How many pools (students) have this row. */
  students: number;
  /** Total saves across those pools. */
  count: number;
  lastAt: number;
};

/** Combine several students' pools for review. Same kind, name, and face is one row. */
export function mergeAdditionPools(pools: readonly AdditionsPool[]): MergedAddition[] {
  const rows = new Map<string, MergedAddition>();
  for (const pool of pools) {
    for (const row of normalize(pool).additions) {
      const prior = rows.get(row.id);
      if (prior) {
        prior.students += 1;
        prior.count += row.count;
        prior.lastAt = Math.max(prior.lastAt, row.lastAt);
      } else {
        rows.set(row.id, {
          kind: row.kind,
          name: row.name,
          faceId: row.faceId,
          glossaryTerm: row.glossaryTerm,
          students: 1,
          count: row.count,
          lastAt: row.lastAt,
        });
      }
    }
  }
  return [...rows.values()].sort((left, right) => right.students - left.students || right.count - left.count || left.name.localeCompare(right.name));
}

/** Rows enough students share to propose for the core glossary. Nothing merges by itself. */
export function promotionCandidates(merged: readonly MergedAddition[], minStudents = 3): MergedAddition[] {
  return merged.filter((row) => row.students >= minStudents);
}

function csvCell(value: string | number | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isoDay(at: number): string {
  return at > 0 ? new Date(at).toISOString().slice(0, 10) : '';
}

/** One CSV for the glossary review. Faces use the glossary's own names. */
export function additionsCsv(pool: AdditionsPool, faceName: (id: IndexFaceId) => string): string {
  const header = 'name,d8_face,kind,count,glossary_term,glossary_face,first_added,last_added';
  const lines = additionsForReview(pool).map((row) =>
    [
      row.name,
      faceName(row.faceId),
      row.kind,
      row.count,
      row.glossaryTerm ?? '',
      row.glossaryFaceId ? faceName(row.glossaryFaceId) : '',
      isoDay(row.firstAt),
      isoDay(row.lastAt),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}
