/**
 * Match the word being typed to move names.
 * The pool is the core D8 glossary (src/lib/glossary.ts, PR 500), plus the student's own
 * moves: names in their additions pool and names on their own index cards.
 * Prefix, alias, and a light spelling fold (case, spaces, and hyphens ignored, one edit).
 * The caller waits and asks for at least three characters. This module also refuses shorter queries.
 * Nothing here is a screen, and nothing leaves the phone.
 */

import { d8Catalog } from '../indexCards/catalog.ts';
import { GLOSSARY, GLOSSARY_FACE_LABELS, glossaryTerm, glossaryTermFor, type GlossaryTerm as CoreTerm } from './glossary.ts';
import { emptyIndexCards, isIndexFaceId, termIdFor, termKey, type CatalogLine, type IndexCardFile, type IndexFaceId } from './indexCards.ts';
import { ageIllegalTechniques } from './studentBenchmarks.ts';
import type { StudentProgressReport } from './progress/types.ts';

export const GLOSSARY_MIN_CHARS = 3;
export const GLOSSARY_DEBOUNCE_MS = 350;
export const GLOSSARY_MATCH_LIMIT = 6;

/** One name the field can offer. */
export type GlossaryTerm = {
  /** `gl.<key>` for a core glossary headword, `mine.<key>` for the student's own move. */
  id: string;
  /** Spelling inserted into the field. The glossary headword, or the student's own name. */
  name: string;
  faceId: IndexFaceId;
  /** The live D8 line this term is, when it is one. Same mapping as the glossary tag on a card. */
  cardId: string | null;
  aliases: readonly string[];
  /** Check-in wording a core term scores (from the glossary). Not shown, not used to pick a card. */
  subFactor: string;
  source: 'glossary' | 'mine';
};

export type GlossaryMatchVia = 'name' | 'alias' | 'fuzzy';

export type GlossaryMatch = {
  term: GlossaryTerm;
  score: number;
  via: GlossaryMatchVia;
  matchedOn: string;
};

export type ExtraName = { name: string; faceId: IndexFaceId };

export type GlossaryMatchOptions = {
  limit?: number;
  blockedIds?: readonly string[];
  blockedNames?: readonly string[];
  /** Replace the whole pool. Tests use this. */
  terms?: readonly GlossaryTerm[];
  /** The student's own names, offered after the core glossary. */
  extra?: readonly ExtraName[];
};

export type GlossarySpan = {
  start: number;
  end: number;
  query: string;
};

export type ActiveGlossary = GlossarySpan & {
  matches: GlossaryMatch[];
};

type IndexedName = { name: string; key: string; compact: string; alias: boolean };
type IndexedTerm = { term: GlossaryTerm; names: IndexedName[]; blockKeys: string[] };

function compactKey(value: string): string {
  return termKey(value).replace(/-/g, '');
}

function indexName(name: string, alias: boolean): IndexedName | null {
  const key = termKey(name);
  const compact = key.replace(/-/g, '');
  return key && compact ? { name, key, compact, alias } : null;
}

function indexTerm(term: GlossaryTerm): IndexedTerm {
  const names: IndexedName[] = [];
  const seen = new Set<string>();
  for (const [name, alias] of [[term.name, false] as const, ...term.aliases.map((value) => [value, true] as const)]) {
    const row = indexName(name, alias);
    if (!row || seen.has(row.key)) continue;
    seen.add(row.key);
    names.push(row);
  }
  return { term, names, blockKeys: names.map((row) => row.key) };
}

/**
 * The D8 line for each glossary headword, read the same way PR 500 tags a card:
 * a line's name or tile resolves to a glossary term, and that term is the line.
 */
let lineByTerm: Map<string, string> | null = null;
function linesByTerm(): Map<string, string> {
  if (lineByTerm) return lineByTerm;
  const map = new Map<string, string>();
  for (const line of d8Catalog()) {
    const term = glossaryTermFor([line.name, line.tile]);
    if (term && !map.has(term.key)) map.set(term.key, line.id);
  }
  lineByTerm = map;
  return map;
}

function lineFor(core: CoreTerm, catalog: readonly CatalogLine[]): string | null {
  const tagged = linesByTerm().get(core.key);
  if (tagged) return tagged;
  const empty = emptyIndexCards();
  for (const name of [core.term, ...core.aliases]) {
    if (!name) continue;
    const id = termIdFor(catalog, empty, name);
    if (id) return id;
  }
  return null;
}

function fromCore(core: CoreTerm, catalog: readonly CatalogLine[]): GlossaryTerm {
  return {
    id: `gl.${core.key}`,
    name: core.term,
    faceId: core.faceId,
    cardId: lineFor(core, catalog),
    aliases: core.aliases,
    subFactor: core.subFactor,
    source: 'glossary',
  };
}

let coreIndex: readonly IndexedTerm[] | null = null;

/** The core glossary, indexed once. Every glossary row is here, none dropped. */
function coreIndexed(): readonly IndexedTerm[] {
  if (!coreIndex) {
    const catalog = d8Catalog();
    coreIndex = GLOSSARY.map((core) => indexTerm(fromCore(core, catalog)));
  }
  return coreIndex;
}

/** The core suggestion pool: one entry per PR 500 glossary term. */
export function glossaryTerms(): readonly GlossaryTerm[] {
  return coreIndexed().map((row) => row.term);
}

/** A core glossary term by headword, alias, D8 line id, or `gl.` id. */
export function glossaryTermById(nameOrId: string): GlossaryTerm | null {
  const raw = nameOrId.trim();
  const byId = glossaryTerms().find((term) => term.id === raw || term.cardId === raw);
  if (byId) return byId;
  const core = glossaryTerm(raw);
  return core ? glossaryTerms().find((term) => term.id === `gl.${core.key}`) ?? null : null;
}

/**
 * The student's own names that the glossary does not already have:
 * their additions pool (new and renamed moves) and their own index cards (custom or renamed).
 */
export function myGlossaryNames(additions: readonly ExtraName[], file: IndexCardFile = emptyIndexCards()): ExtraName[] {
  const out: ExtraName[] = [];
  const seen = new Set<string>();
  const add = (name: string | undefined, faceId: string) => {
    if (!isIndexFaceId(faceId)) return;
    const clean = (name ?? '').trim().replace(/\s+/g, ' ');
    const key = termKey(clean);
    if (!key || seen.has(key) || glossaryTerm(clean)) return;
    seen.add(key);
    out.push({ name: clean, faceId });
  };
  for (const row of additions) add(row.name, row.faceId);
  for (const card of file.cards) {
    if (card.userName) add(card.userName, card.userFace ?? card.faceId);
    if (card.id.startsWith('term.')) add(card.name, card.faceId);
  }
  return out;
}

const extraCache = new Map<string, IndexedTerm>();

function indexExtra(row: ExtraName): IndexedTerm {
  const cacheKey = `${row.faceId}:${row.name}`;
  const hit = extraCache.get(cacheKey);
  if (hit) return hit;
  const indexed = indexTerm({
    id: `mine.${termKey(row.name)}`,
    name: row.name,
    faceId: row.faceId,
    cardId: null,
    aliases: [],
    subFactor: '',
    source: 'mine',
  });
  if (extraCache.size > 500) extraCache.clear();
  extraCache.set(cacheKey, indexed);
  return indexed;
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return false;
  if (left.length < 5 || right.length < 5) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.slice(0, 3) !== right.slice(0, 3)) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length === right.length) {
      i += 1;
      j += 1;
    } else if (left.length > right.length) i += 1;
    else j += 1;
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits === 1;
}

function scoreName(queryKey: string, queryCompact: string, row: IndexedName): { score: number; via: GlossaryMatchVia } | null {
  const { key, compact, alias } = row;
  if (key === queryKey || compact === queryCompact) return { score: alias ? 95 : 100, via: alias ? 'alias' : 'name' };
  if (key.startsWith(queryKey) || compact.startsWith(queryCompact)) return { score: alias ? 75 : 82, via: alias ? 'alias' : 'name' };
  if (editDistanceAtMostOne(compact, queryCompact)) return { score: 40, via: 'fuzzy' };
  return null;
}

function blocked(row: IndexedTerm, ids: ReadonlySet<string>, names: ReadonlySet<string>): boolean {
  const { term } = row;
  if (ids.has(term.id) || (term.cardId != null && ids.has(term.cardId))) return true;
  return row.blockKeys.some((key) => names.has(key));
}

export function matchGlossary(query: string, options: GlossaryMatchOptions = {}): GlossaryMatch[] {
  const folded = query.trim().replace(/\s+/g, ' ');
  const queryCompact = compactKey(folded);
  if (queryCompact.length < GLOSSARY_MIN_CHARS) return [];
  const queryKey = termKey(folded);
  const ids = new Set(options.blockedIds ?? []);
  const names = new Set((options.blockedNames ?? []).map((name) => termKey(name)));
  const pool: readonly IndexedTerm[] = options.terms
    ? options.terms.map(indexTerm)
    : [...coreIndexed(), ...(options.extra ?? []).filter((row) => !glossaryTerm(row.name)).map(indexExtra)];
  const hits: GlossaryMatch[] = [];
  const seen = new Set<string>();
  for (const row of pool) {
    if (seen.has(row.term.id) || blocked(row, ids, names)) continue;
    let best: { score: number; via: GlossaryMatchVia; matchedOn: string } | null = null;
    for (const candidate of row.names) {
      const scored = scoreName(queryKey, queryCompact, candidate);
      if (!scored) continue;
      if (!best || scored.score > best.score) best = { ...scored, matchedOn: candidate.name };
    }
    if (!best) continue;
    seen.add(row.term.id);
    // The student's own names sit just behind a core name with the same score.
    const score = row.term.source === 'mine' ? best.score - 1 : best.score;
    hits.push({ term: row.term, score, via: best.via, matchedOn: best.matchedOn });
  }
  hits.sort(
    (left, right) =>
      right.score - left.score ||
      left.term.name.length - right.term.name.length ||
      left.term.name.localeCompare(right.term.name, undefined, { sensitivity: 'base' }),
  );
  return hits.slice(0, options.limit ?? GLOSSARY_MATCH_LIMIT);
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9'’/-]/.test(char);
}

/** Suffixes of the word at the caret, longest first. A trailing space means the word is finished. */
export function glossaryQuerySpans(text: string, caret: number): GlossarySpan[] {
  const at = Math.max(0, Math.min(caret, text.length));
  if (at > 0 && /\s/.test(text[at - 1] ?? '')) return [];
  let end = at;
  while (end < text.length && isWordChar(text[end] ?? '')) end += 1;
  let wordStart = at;
  while (wordStart > 0 && isWordChar(text[wordStart - 1] ?? '')) wordStart -= 1;
  const starts = [wordStart];
  let cursor = wordStart;
  for (let extra = 0; extra < 3; extra += 1) {
    if (cursor < 2 || text[cursor - 1] !== ' ') break;
    let previous = cursor - 1;
    while (previous > 0 && isWordChar(text[previous - 1] ?? '')) previous -= 1;
    if (previous === cursor - 1) break;
    starts.push(previous);
    cursor = previous;
  }
  return starts
    .slice()
    .reverse()
    .map((start) => ({ start, end, query: text.slice(start, end).replace(/\s+/g, ' ').trim() }))
    .filter((span) => span.query.length > 0);
}

export function activeGlossaryQuery(text: string, caret: number, options: GlossaryMatchOptions = {}): ActiveGlossary | null {
  for (const span of glossaryQuerySpans(text, caret)) {
    const matches = matchGlossary(span.query, options);
    if (matches.length) return { ...span, matches };
  }
  return null;
}

/** Replace the matched span with the canonical name. Surrounding words stay. */
export function insertGlossaryTerm(text: string, span: Pick<GlossarySpan, 'start' | 'end'>, canonical: string): { text: string; caret: number } {
  const name = canonical.trim().replace(/\s+/g, ' ');
  return {
    text: `${text.slice(0, span.start)}${name}${text.slice(span.end)}`,
    caret: span.start + name.length,
  };
}

export function glossaryFaceLabel(faceId: IndexFaceId): string {
  return GLOSSARY_FACE_LABELS[faceId] ?? faceId;
}

/** Glossary headwords each age-policy rule covers, beyond the rule's own name. Headwords only, so Kimura (alias "Double wristlock") stays. */
const POLICY_TERMS: Record<string, RegExp> = {
  straightAnkleLock: /^straight ankle lock$/i,
  wristLocks: /^wrist ?lock$/i,
  heelHooks: /^heel hook$/i,
  legLocks: /^(leg lock|straight ankle lock|heel hook|knee ?bar|toe hold|calf slicer|estima lock)$/i,
};

/** Names the current profile should not be offered, using the existing age policy. */
export function hiddenGlossaryTerms(report: StudentProgressReport): { ids: string[]; names: string[] } {
  const rows = ageIllegalTechniques(report);
  const ids = rows.map((row) => row.catalogId).filter((id) => id.length > 0);
  const names = new Set(rows.map((row) => row.name));
  for (const row of rows) {
    const pattern = POLICY_TERMS[row.policy];
    if (!pattern) continue;
    for (const term of GLOSSARY) {
      if (pattern.test(term.term)) names.add(term.term);
    }
  }
  return { ids, names: [...names] };
}
