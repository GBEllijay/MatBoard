/**
 * Behind-the-scenes term source for autocomplete.
 * There is no glossary page. Nothing here is a student-facing list.
 *
 * The merged ~385-term list (Kingz 188 + Digitsu techniques and positions)
 * is not in this repo. This adapter uses names already stored here:
 * the owner-approved fundamentals catalog, plus live D8 index-card names.
 * It does not invent definitions, and it does not copy an outside glossary.
 * Spelling differences that already exist between those two lists are aliases.
 */

import { subfactorById } from '../preview/d8Subfactors/model.ts';
import { d8Catalog } from '../indexCards/catalog.ts';
import { ageIllegalTechniques } from './studentBenchmarks.ts';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { termKey, type IndexFaceId } from './indexCards.ts';
import type { StudentProgressReport } from './progress/types.ts';

/** Shown in review notes and tests. Not rendered in the app. */
export const GLOSSARY_SOURCE_LIMIT =
  'The merged ~385-term list is not in this repo. Suggestions use the owner-approved fundamentals catalog and the live D8 index-card names only.';

const TECHNIQUE_FACES = new Set<IndexFaceId>([
  'guard-control',
  'passing',
  'sweeps',
  'takedowns',
  'escapes-defense',
  'submissions',
]);

/**
 * Movement has no D8 face. Conditioning is a manual score, not a technique list,
 * so breakfalls and the other movement names sit on Escapes/Defense until reviewed.
 */
const FACE_BY_CATEGORY: Record<string, IndexFaceId> = {
  positions: 'guard-control',
  sweeps: 'sweeps',
  escapes: 'escapes-defense',
  passes: 'passing',
  submissions: 'submissions',
  takedowns: 'takedowns',
  movement: 'escapes-defense',
  defense: 'escapes-defense',
};

export type GlossaryTerm = {
  /** Fundamentals id when this name is on that list. Otherwise the D8 id. */
  id: string;
  /** Spelling inserted into the field. This is the index-card name when those differ. */
  name: string;
  faceId: IndexFaceId;
  /** Set when a live index card already uses this term. */
  cardId: string | null;
  aliases: string[];
  sources: Array<'fundamentals' | 'd8'>;
  catalogCategory?: string;
};

export type GlossaryReviewNote = {
  id: string;
  name: string;
  note: string;
};

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function addAlias(term: GlossaryTerm, raw: string | undefined): void {
  const name = raw ? cleanLabel(raw) : '';
  if (!name || termKey(name) === termKey(term.name)) return;
  if (term.aliases.some((alias) => termKey(alias) === termKey(name))) return;
  term.aliases.push(name);
}

function buildGlossary(): GlossaryTerm[] {
  const byKey = new Map<string, GlossaryTerm>();
  const byId = new Map<string, GlossaryTerm>();

  for (const category of FUNDAMENTALS_CATALOG.categories) {
    const faceId = FACE_BY_CATEGORY[category.id];
    if (!faceId) continue;
    for (const item of category.items) {
      const term: GlossaryTerm = {
        id: item.id,
        name: cleanLabel(item.name),
        faceId,
        cardId: null,
        aliases: [],
        sources: ['fundamentals'],
        catalogCategory: category.id,
      };
      byKey.set(termKey(term.name), term);
      byId.set(term.id, term);
    }
  }

  for (const line of d8Catalog()) {
    if (!TECHNIQUE_FACES.has(line.faceId)) continue;
    const sub = subfactorById(line.id);
    const existing = byId.get(line.id) ?? byKey.get(termKey(line.name));
    if (existing) {
      existing.cardId = line.id;
      existing.faceId = line.faceId;
      if (!existing.sources.includes('d8')) existing.sources.push('d8');
      if (termKey(existing.name) !== termKey(line.name)) {
        const previous = existing.name;
        existing.name = cleanLabel(line.name);
        addAlias(existing, previous);
        byKey.set(termKey(existing.name), existing);
      }
      addAlias(existing, line.tile);
      addAlias(existing, sub?.glossary);
      continue;
    }
    const term: GlossaryTerm = {
      id: line.id,
      name: cleanLabel(line.name),
      faceId: line.faceId,
      cardId: line.id,
      aliases: [],
      sources: ['d8'],
    };
    addAlias(term, sub?.glossary);
    addAlias(term, line.tile);
    byKey.set(termKey(term.name), term);
    byId.set(term.id, term);
  }

  return [...new Map([...byId.values()].map((term) => [term.id, term])).values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
}

let cached: readonly GlossaryTerm[] | null = null;

export function glossaryTerms(): readonly GlossaryTerm[] {
  if (!cached) cached = buildGlossary();
  return cached;
}

export function glossaryTermById(id: string): GlossaryTerm | null {
  return glossaryTerms().find((term) => term.id === id || term.cardId === id) ?? null;
}

/** Names the current profile should not be offered, using the existing age policy. */
export function hiddenGlossaryTerms(report: StudentProgressReport): { ids: string[]; names: string[] } {
  const rows = ageIllegalTechniques(report);
  return {
    ids: rows.map((row) => row.catalogId).filter((id) => id.length > 0),
    names: rows.map((row) => row.name),
  };
}

function noteFor(terms: readonly GlossaryTerm[], id: string, note: string, into: GlossaryReviewNote[]): void {
  const term = terms.find((item) => item.id === id || item.cardId === id);
  if (!term) return;
  into.push({ id: term.id, name: term.name, note });
}

/**
 * Entries worth a human pass before this is used for real.
 * Not shown in the product.
 */
export function glossaryReviewNotes(terms: readonly GlossaryTerm[] = glossaryTerms()): GlossaryReviewNote[] {
  const notes: GlossaryReviewNote[] = [];
  notes.push({
    id: 'source',
    name: 'Term source',
    note: GLOSSARY_SOURCE_LIMIT,
  });
  noteFor(
    terms,
    'sub.rear-naked-choke',
    'Two ids in the app name this choke: fundamentals sub.rear-naked-choke and the D8 card sub.rnc. Autocomplete keeps one suggestion and opens the D8 card.',
    notes,
  );
  noteFor(
    terms,
    'move.shrimp',
    'Shrimp is both a movement fundamental (move.shrimp) and an escape card (escape.shrimp). One suggestion opens the escape card.',
    notes,
  );
  noteFor(
    terms,
    'sub.triangle',
    'The fundamentals list says “Triangle”. The live index card says “Triangle choke”. The inserted spelling is the card name so the existing card link matches. “Triangle” stays an alias.',
    notes,
  );
  noteFor(
    terms,
    'sub.armbar-mount',
    'The D8 line’s glossary headword is “Armbar”, and it is attached only to Armbar from mount. “Armbar from guard” is a separate fundamentals name, so a short “armbar” offers both.',
    notes,
  );
  noteFor(
    terms,
    'pass.smash',
    'Smash Pass and Pressure Pass are both proposed D8 lines, and each definition describes the other. They are not in the owner-approved fundamentals catalog.',
    notes,
  );
  noteFor(
    terms,
    'move.bridge',
    '“Bridge” (movement) and “Bridge and Roll” (D8 escape) are separate suggestions. Easy to pick the wrong one.',
    notes,
  );
  noteFor(
    terms,
    'move.technical-standup',
    'Canonical name is “Technical lift/stand-up”. Awkward spelling, and it is filed on Escapes/Defense because there is no movement face.',
    notes,
  );
  noteFor(
    terms,
    'sub.straight-ankle-lock',
    'Age-gated. Hidden when this profile’s existing policy says the straight ankle lock is illegal. The name is still in the source.',
    notes,
  );
  noteFor(
    terms,
    'sub.wrist-lock',
    'Age-gated for kids by the existing wrist-lock policy. Hidden in that case. The name is still in the source.',
    notes,
  );
  noteFor(
    terms,
    'td.osoto',
    'Spelled “Osoto gari” on the D8 list. Not in the owner-approved fundamentals catalog. Worth a spelling check (O-soto gari).',
    notes,
  );
  const mount = subfactorById('pos.mount');
  if (mount?.definition && /Top sit/.test(mount.definition)) {
    notes.push({
      id: 'pos.mount',
      name: mount.label,
      note: `D8 definition says “${mount.definition}”. The grammar is off, and the sentence is narrower than the position. Autocomplete does not show definitions.`,
    });
  }
  const americana = subfactorById('sub.americana');
  if (americana?.definition) {
    notes.push({
      id: 'sub.americana',
      name: americana.label,
      note: `D8 definition says “${americana.definition}”. That is a shorthand, not shown in autocomplete.`,
    });
  }
  const noted = new Set(notes.map((item) => item.id));
  for (const term of terms) {
    if (noted.has(term.id)) continue;
    if (term.sources.length === 1 && term.sources[0] === 'd8') {
      notes.push({
        id: term.id,
        name: term.name,
        note: 'Proposed D8 line. Not in the owner-approved fundamentals catalog.',
      });
      noted.add(term.id);
    }
  }
  for (const term of terms) {
    if (noted.has(term.id) || term.catalogCategory !== 'movement') continue;
    notes.push({
      id: term.id,
      name: term.name,
      note: 'Movement name. Filed on Escapes/Defense so it does not land on the manual Conditioning face.',
    });
  }
  return notes;
}
