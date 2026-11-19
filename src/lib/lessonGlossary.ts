/**
 * Glossary cards on the Daily Lesson Plan.
 *
 * When an instructor types a technique title, the lesson shows the glossary
 * card that move IS, using the same strict name rules as the Technique Tree
 * (moveIdentity.ts): same name ignoring case, accents, punctuation and extra
 * spaces; a glossary alias; or a plain plural. Nothing looser, so "Armbar
 * from guard" never shows the "Armbar from mount" card.
 *
 * A title that is not in the glossary can be added on the spot. The new card
 * goes into the coach's glossary (the same store and account sync as the
 * Technique Tree glossary cards) and the drill keeps a `glossaryCardId`, so
 * the connection survives later title edits. That id is saved on the lesson
 * plan through the normal lesson save, so a shared gym template is only
 * changed the way any other edit changes it (the instructor's own copy).
 *
 * Out of scope here: teaching diary, per-instructor add/link counts, and
 * competition tracking.
 */

import {
  addCustomGlossaryCard,
  buildGlossaryBaseCards,
  type AddCustomCardResult,
  type GlossaryBaseCard,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
} from './glossaryBaseCards.ts';
import { glossaryCardIdForName, moveKey } from './moveIdentity.ts';

export type LessonTechniqueLike = { title: string; glossaryCardId?: string | null };

export type LessonGlossaryMatch = {
  card: GlossaryBaseCard | null;
  /** linked: saved on the drill. auto: the title is this card's name. none: no card. */
  how: 'linked' | 'auto' | 'none';
};

let builtCache: GlossaryBaseCard[] | null = null;
function builtCards(): GlossaryBaseCard[] {
  if (!builtCache) builtCache = buildGlossaryBaseCards().cards;
  return builtCache;
}

function cardById(catalog: GlossaryBaseCatalog, id: string): GlossaryBaseCard | null {
  return catalog.cards.find((card) => card.id === id) ?? builtCards().find((card) => card.id === id) ?? null;
}

/**
 * The instructor-added card this name is, by the same strict rules
 * (name, alias, or plural). Ambiguous names match nothing.
 */
function customCardForName(catalog: GlossaryBaseCatalog, name: string): GlossaryBaseCard | null {
  const key = moveKey(name);
  if (!key) return null;
  let found: GlossaryBaseCard | null = null;
  for (const card of catalog.cards) {
    if (!card.custom) continue;
    const keys = [card.title, ...card.aliases].map(moveKey);
    if (!keys.includes(key)) continue;
    if (found && found.id !== card.id) return null;
    found = card;
  }
  return found;
}

/** The glossary card a lesson drill shows. */
export function lessonGlossaryMatch(tech: LessonTechniqueLike, catalog: GlossaryBaseCatalog): LessonGlossaryMatch {
  if (typeof tech.glossaryCardId === 'string' && tech.glossaryCardId) {
    const linked = cardById(catalog, tech.glossaryCardId);
    if (linked) return { card: linked, how: 'linked' };
  }
  const title = tech.title.trim();
  if (!title) return { card: null, how: 'none' };
  const builtInId = glossaryCardIdForName(title);
  if (builtInId) {
    const card = cardById(catalog, builtInId);
    if (card) return { card, how: 'auto' };
  }
  const custom = customCardForName(catalog, title);
  return custom ? { card: custom, how: 'auto' } : { card: null, how: 'none' };
}

/** True when the lesson should offer "Add to glossary" for this title. */
export function canOfferAddToGlossary(tech: LessonTechniqueLike, catalog: GlossaryBaseCatalog): boolean {
  if (!moveKey(tech.title.trim())) return false;
  return lessonGlossaryMatch(tech, catalog).card === null;
}

export type AddLessonGlossaryResult = AddCustomCardResult & {
  /** Patch for the lesson drill: connects it to the card. Null when nothing was added or found. */
  patch: { glossaryCardId: string } | null;
};

/**
 * Add a lesson title to the glossary, then connect it to the drill. If the
 * title already matches a card (for example it was added on another drill a
 * moment ago), connect to that card instead of adding a duplicate.
 */
export function addLessonTechniqueToGlossary(
  catalog: GlossaryBaseCatalog,
  input: { title: string; faceId: GlossaryBaseFaceId; definition?: string },
  now = Date.now(),
): AddLessonGlossaryResult {
  const already = lessonGlossaryMatch({ title: input.title }, catalog);
  if (already.card) {
    return { catalog, card: already.card, status: 'exists', patch: { glossaryCardId: already.card.id } };
  }
  const result = addCustomGlossaryCard(catalog, input, now);
  return { ...result, patch: result.card ? { glossaryCardId: result.card.id } : null };
}

/** The overall glossary (Technique Tree glossary panel), optionally opened on one card. */
export function lessonGlossaryHref(cardId?: string | null): string {
  return cardId ? `/technique-tree?card=${encodeURIComponent(cardId)}` : '/technique-tree?glossary=1';
}

