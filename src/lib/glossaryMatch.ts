/**
 * Match the word being typed to glossary terms.
 * Prefix, alias, and a light spelling fold (spaces and hyphens ignored, one edit).
 * The caller waits and asks for at least three characters. This module also refuses shorter queries.
 */

import { termKey, type IndexFaceId } from './indexCards.ts';
import { glossaryTerms, type GlossaryTerm } from './glossarySource.ts';

export const GLOSSARY_MIN_CHARS = 3;
export const GLOSSARY_DEBOUNCE_MS = 350;
export const GLOSSARY_MATCH_LIMIT = 6;

export type GlossaryMatchVia = 'name' | 'alias' | 'fuzzy';

export type GlossaryMatch = {
  term: GlossaryTerm;
  score: number;
  via: GlossaryMatchVia;
  matchedOn: string;
};

export type GlossaryMatchOptions = {
  limit?: number;
  blockedIds?: readonly string[];
  blockedNames?: readonly string[];
  terms?: readonly GlossaryTerm[];
};

export type GlossarySpan = {
  start: number;
  end: number;
  query: string;
};

export type ActiveGlossary = GlossarySpan & {
  matches: GlossaryMatch[];
};

function compactKey(value: string): string {
  return termKey(value).replace(/-/g, '');
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

function scoreName(queryKey: string, queryCompact: string, name: string, alias: boolean): { score: number; via: GlossaryMatchVia } | null {
  const key = termKey(name);
  const compact = compactKey(name);
  if (!key || !compact) return null;
  if (key === queryKey || compact === queryCompact) return { score: alias ? 95 : 100, via: alias ? 'alias' : 'name' };
  if (key.startsWith(queryKey) || compact.startsWith(queryCompact)) return { score: alias ? 75 : 82, via: alias ? 'alias' : 'name' };
  if (editDistanceAtMostOne(compact, queryCompact)) return { score: 40, via: 'fuzzy' };
  return null;
}

function blocked(term: GlossaryTerm, ids: ReadonlySet<string>, names: ReadonlySet<string>): boolean {
  if (ids.has(term.id) || (term.cardId != null && ids.has(term.cardId))) return true;
  if (names.has(termKey(term.name))) return true;
  return term.aliases.some((alias) => names.has(termKey(alias)));
}

export function matchGlossary(query: string, options: GlossaryMatchOptions = {}): GlossaryMatch[] {
  const folded = query.trim().replace(/\s+/g, ' ');
  const queryCompact = compactKey(folded);
  if (queryCompact.length < GLOSSARY_MIN_CHARS) return [];
  const queryKey = termKey(folded);
  const ids = new Set(options.blockedIds ?? []);
  const names = new Set((options.blockedNames ?? []).map((name) => termKey(name)));
  const hits: GlossaryMatch[] = [];
  for (const term of options.terms ?? glossaryTerms()) {
    if (blocked(term, ids, names)) continue;
    const namesToScore: Array<{ name: string; alias: boolean }> = [
      { name: term.name, alias: false },
      ...term.aliases.map((name) => ({ name, alias: true })),
    ];
    let best: { score: number; via: GlossaryMatchVia; matchedOn: string } | null = null;
    for (const candidate of namesToScore) {
      const scored = scoreName(queryKey, queryCompact, candidate.name, candidate.alias);
      if (!scored) continue;
      if (!best || scored.score > best.score) best = { ...scored, matchedOn: candidate.name };
    }
    if (!best) continue;
    const chosen = best;
    hits.push({ term, score: chosen.score, via: chosen.via, matchedOn: chosen.matchedOn });
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
  switch (faceId) {
    case 'guard-control':
      return 'Guard/Control';
    case 'passing':
      return 'Passing';
    case 'sweeps':
      return 'Sweeps';
    case 'takedowns':
      return 'Takedowns';
    case 'escapes-defense':
      return 'Escapes/Defense';
    case 'submissions':
      return 'Submissions';
    case 'conditioning':
      return 'Conditioning';
    case 'mindset':
      return 'Mindset';
    default:
      return faceId;
  }
}
