/**
 * One move, one identity.
 *
 * A Technique Tree step, a Technique Tree glossary base card, and a D8 index
 * card are the same move when their names match by one of these safe rules:
 *  - the same name, ignoring case, accents, and punctuation;
 *  - a glossary alias of that name ("Juji gatame" is "Armbar");
 *  - a plain plural ("Hip escapes" is "Hip escape").
 * Nothing else. A D8 line the glossary rolls a term up to is a different
 * move ("Armbar from guard" is never "Armbar from mount"), and a name that
 * starts the same is a different move.
 *
 * A step can also be linked to a glossary card by hand, or unlinked so it
 * never matches. That choice is saved on the step (`glossaryCardId`).
 */

import { GLOSSARY, type GlossaryTerm } from './glossary.ts';
import { termKey } from './indexCards.ts';

/** "hip-escapes" → "hip-escape". Leaves short words and "-ss" words ("cross", "pass") alone. */
export function singularKey(key: string): string {
  if (!key) return key;
  const parts = key.split('-');
  const last = parts[parts.length - 1];
  if (last.length > 3 && last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us') && !last.endsWith('is')) {
    parts[parts.length - 1] = last.slice(0, -1);
  }
  return parts.join('-');
}

/** Name key used for every identity match: case, accents, punctuation, and plural folded. */
export function moveKey(name: string | null | undefined): string {
  return name ? singularKey(termKey(name)) : '';
}

/** Glossary headwords and aliases only. Never the check-in roll-up line. Ambiguous names map to nothing. */
const TERM_BY_NAME: Map<string, GlossaryTerm | null> = (() => {
  const head = new Map<string, GlossaryTerm | null>();
  const alias = new Map<string, GlossaryTerm | null>();
  const put = (map: Map<string, GlossaryTerm | null>, name: string, term: GlossaryTerm) => {
    const key = moveKey(name);
    if (!key) return;
    const had = map.get(key);
    if (had === undefined) map.set(key, term);
    else if (had && had.key !== term.key) map.set(key, null);
  };
  for (const term of GLOSSARY) put(head, term.term, term);
  for (const term of GLOSSARY) for (const name of term.aliases) put(alias, name, term);
  const out = new Map(alias);
  for (const [key, term] of head) out.set(key, term);
  return out;
})();

const TERM_BY_KEY = new Map(GLOSSARY.map((term) => [term.key, term]));

/** The glossary term this name IS (headword, alias, or plural), or null. */
export function glossaryTermForName(name: string | null | undefined): GlossaryTerm | null {
  const key = moveKey(name);
  return key ? TERM_BY_NAME.get(key) ?? null : null;
}

export function glossaryCardIdForTerm(term: GlossaryTerm): string {
  return `gbase.${term.key}`;
}

/** Glossary base card id for a name, by the safe rules only. */
export function glossaryCardIdForName(name: string | null | undefined): string | null {
  const term = glossaryTermForName(name);
  return term ? glossaryCardIdForTerm(term) : null;
}

/** The glossary term behind a gbase.<key> card id. */
export function glossaryTermForCardId(cardId: string | null | undefined): GlossaryTerm | null {
  if (!cardId || !cardId.startsWith('gbase.')) return null;
  return TERM_BY_KEY.get(cardId.slice('gbase.'.length)) ?? null;
}

/** All names that mean this glossary term, as identity keys. */
export function glossaryNameKeys(term: GlossaryTerm): string[] {
  return [term.term, ...term.aliases].map(moveKey).filter(Boolean);
}

export type StepLike = { title: string; glossaryCardId?: string | null };

export type StepIdentity = {
  cardId: string | null;
  /** How the step got its glossary card. */
  how: 'linked' | 'auto' | 'unlinked' | 'none';
};

/** Which glossary card a tree step is. */
export function stepIdentity(step: StepLike): StepIdentity {
  if (step.glossaryCardId === null) return { cardId: null, how: 'unlinked' };
  if (typeof step.glossaryCardId === 'string' && glossaryTermForCardId(step.glossaryCardId)) {
    return { cardId: step.glossaryCardId, how: 'linked' };
  }
  const auto = glossaryCardIdForName(step.title);
  return auto ? { cardId: auto, how: 'auto' } : { cardId: null, how: 'none' };
}

/**
 * The name a step goes by everywhere else: the glossary headword when it is
 * linked by hand (so a step called "My guard pull" linked to "Pull guard"
 * reads as Pull guard on the D8), otherwise its own title.
 */
export function stepIdentityName(step: StepLike): string {
  const identity = stepIdentity(step);
  if (identity.how === 'linked') return glossaryTermForCardId(identity.cardId)?.term ?? step.title.trim();
  return step.title.trim();
}
