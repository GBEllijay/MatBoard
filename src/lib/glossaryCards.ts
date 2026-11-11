/**
 * Open the existing index card for a suggested term, or create one with the shared card file.
 * Catalog cards are not copied. A second request for the same name returns the same id.
 * A glossary move the student renamed (their additions pool says so) opens the renamed card.
 */

import { d8Catalog } from '../indexCards/catalog.ts';
import type { GlossaryAddition } from './glossaryAdditions.ts';
import type { GlossaryTerm } from './glossaryMatch.ts';
import {
  NEUTRAL_RATING,
  emptyIndexCards,
  termIdFor,
  termKey,
  withCustomCard,
  type CatalogLine,
  type IndexCardFile,
} from './indexCards.ts';

export type GlossaryCardResult =
  | { id: string; created: false; file: IndexCardFile }
  | { id: string; created: true; file: IndexCardFile }
  | { error: 'blank' | 'duplicate'; faceLabel?: string };

function existingCard(
  term: GlossaryTerm,
  catalog: readonly CatalogLine[],
  file: IndexCardFile,
  additions: readonly Pick<GlossaryAddition, 'kind' | 'name' | 'glossaryTerm'>[],
): string | null {
  const names = [term.cardId, term.name, ...term.aliases];
  for (const name of names) {
    if (!name) continue;
    const id = termIdFor(catalog, file, name);
    if (id) return id;
  }
  if (term.source !== 'glossary') return null;
  const key = termKey(term.name);
  for (const row of additions) {
    if (row.kind !== 'renamed' || !row.glossaryTerm || termKey(row.glossaryTerm) !== key) continue;
    const id = termIdFor(catalog, file, row.name);
    if (id) return id;
  }
  return null;
}

export function resolveGlossaryCard(
  term: GlossaryTerm,
  catalog: readonly CatalogLine[] = d8Catalog(),
  file: IndexCardFile = emptyIndexCards(),
  additions: readonly Pick<GlossaryAddition, 'kind' | 'name' | 'glossaryTerm'>[] = [],
): GlossaryCardResult {
  const existing = existingCard(term, catalog, file, additions);
  if (existing) return { id: existing, created: false, file };
  const saved = withCustomCard(catalog, file, term.faceId, term.name, NEUTRAL_RATING);
  if ('error' in saved) {
    const again = termIdFor(catalog, file, term.name);
    if (again) return { id: again, created: false, file };
    return saved;
  }
  return { id: saved.id, created: true, file: saved.file };
}
