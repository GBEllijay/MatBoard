/**
 * The core D8 glossary. Read-only. Every term sits on one of the eight D8 faces.
 * Students never edit this list. Their own names, faces, and new moves live in
 * the index-card file and the additions pool, and the student's version wins on their screen.
 */
import { GLOSSARY_ROWS, type GlossaryRow } from './glossaryData.ts';
import { INDEX_FACE_IDS, isIndexFaceId, termKey, type IndexFaceId } from './indexCards.ts';

export type GlossaryTerm = GlossaryRow & { key: string };

/** Face names as the glossary and the diamond print them. There is no "Other". */
export const GLOSSARY_FACE_LABELS: Record<IndexFaceId, string> = {
  'guard-control': 'Guard/Control',
  passing: 'Passing',
  sweeps: 'Sweeps',
  takedowns: 'Takedowns',
  'escapes-defense': 'Escapes/Defense',
  submissions: 'Submissions',
  conditioning: 'Conditioning',
  mindset: 'Mindset',
};

/** A legacy or imported move with no D8 face. It is not on the diamond and has no glossary tag. */
export const OTHER_FACE = 'other';
export type CardFaceId = IndexFaceId | typeof OTHER_FACE;

export const GLOSSARY: readonly GlossaryTerm[] = GLOSSARY_ROWS.map((row) => ({ ...row, key: termKey(row.term) }));

type Hit = { term: GlossaryTerm; rank: number };

/** Headword first, then aliases, then the exact check-in wording a term scores. */
const BY_KEY: Map<string, GlossaryTerm> = (() => {
  const map = new Map<string, Hit>();
  const put = (name: string, term: GlossaryTerm, rank: number) => {
    const key = termKey(name);
    if (!key) return;
    const prior = map.get(key);
    if (!prior || prior.rank > rank) map.set(key, { term, rank });
  };
  for (const term of GLOSSARY) {
    put(term.term, term, 0);
    for (const alias of term.aliases) put(alias, term, 1);
    if (term.subFactor) put(term.subFactor, term, 2);
  }
  return new Map([...map].map(([key, hit]) => [key, hit.term]));
})();

export function faceLabel(faceId: string): string {
  return isIndexFaceId(faceId) ? GLOSSARY_FACE_LABELS[faceId] : 'Other';
}

export function glossaryFaces(): readonly IndexFaceId[] {
  return INDEX_FACE_IDS;
}

/** The glossary term for a name, alias, or check-in line. Null when it is not in the core glossary. */
export function glossaryTerm(name: string | null | undefined): GlossaryTerm | null {
  if (!name) return null;
  return BY_KEY.get(termKey(name)) ?? null;
}

/** First of several names that resolves. */
export function glossaryTermFor(names: readonly (string | null | undefined)[]): GlossaryTerm | null {
  for (const name of names) {
    const term = glossaryTerm(name);
    if (term) return term;
  }
  return null;
}

export type GlossaryTag = {
  term: GlossaryTerm;
  /** False when the student keeps this move on a different face than the glossary. That is allowed. */
  sameFace: boolean;
};

/**
 * The glossary tag shown on a card. A move with no D8 face ("Other") never gets one,
 * even when its name is a glossary word.
 */
export function glossaryTag(names: readonly (string | null | undefined)[], faceId: string | null | undefined): GlossaryTag | null {
  if (!faceId || !isIndexFaceId(faceId)) return null;
  const term = glossaryTermFor(names);
  if (!term) return null;
  return { term, sameFace: term.faceId === faceId };
}

export type Suggestion = {
  name: string;
  faceId: IndexFaceId;
  /** The glossary headword, when the match came from the core list. */
  term: string | null;
  /** Alias or check-in line that matched, when it is not the headword. */
  matched: string | null;
  source: 'glossary' | 'mine';
};

export type ExtraName = { name: string; faceId: IndexFaceId };

function scoreName(name: string, query: string): number {
  const key = termKey(name).replace(/-/g, ' ');
  if (!key) return -1;
  if (key === query) return 0;
  if (key.startsWith(query)) return 1;
  if (key.split(' ').some((word) => word.startsWith(query))) return 2;
  if (query.length >= 3 && key.includes(query)) return 3;
  return -1;
}

/**
 * Typeahead over the core glossary and the student's own additions.
 * Headword matches come before alias matches. Short queries only match from a word start.
 */
export function searchGlossary(raw: string, extra: readonly ExtraName[] = [], limit = 6): Suggestion[] {
  const query = termKey(raw).replace(/-/g, ' ');
  if (!query) return [];
  const hits: { suggestion: Suggestion; score: number; order: number }[] = [];
  const seen = new Set<string>();
  GLOSSARY.forEach((term, order) => {
    let best = scoreName(term.term, query);
    let matched: string | null = null;
    for (const alias of term.aliases) {
      const score = scoreName(alias, query);
      if (score >= 0 && (best < 0 || score + 0.5 < best)) {
        best = score + 0.5;
        matched = alias;
      }
    }
    if (best < 0) return;
    seen.add(term.key);
    hits.push({ suggestion: { name: term.term, faceId: term.faceId, term: term.term, matched, source: 'glossary' }, score: best, order });
  });
  extra.forEach((row, index) => {
    const key = termKey(row.name);
    if (!key || seen.has(key) || BY_KEY.has(key)) return;
    const score = scoreName(row.name, query);
    if (score < 0) return;
    seen.add(key);
    hits.push({ suggestion: { name: row.name, faceId: row.faceId, term: null, matched: null, source: 'mine' }, score: score + 0.25, order: GLOSSARY.length + index });
  });
  return hits
    .sort((left, right) => left.score - right.score || left.suggestion.name.length - right.suggestion.name.length || left.order - right.order)
    .slice(0, limit)
    .map((hit) => hit.suggestion);
}
