/**
 * Open the existing index card for a glossary term, or create one with the shared card file.
 * Catalog cards are not copied. A second request for the same name returns the same id.
 */

import { d8Catalog } from '../indexCards/catalog.ts';
import {
  NEUTRAL_RATING,
  emptyIndexCards,
  termIdFor,
  withCustomCard,
  type CatalogLine,
  type IndexCardFile,
} from './indexCards.ts';
import type { GlossaryTerm } from './glossarySource.ts';

export type GlossaryCardResult =
  | { id: string; created: false; file: IndexCardFile }
  | { id: string; created: true; file: IndexCardFile }
  | { error: 'blank' | 'duplicate'; faceLabel?: string };

export function resolveGlossaryCard(
  term: GlossaryTerm,
  catalog: readonly CatalogLine[] = d8Catalog(),
  file: IndexCardFile = emptyIndexCards(),
): GlossaryCardResult {
  const existing =
    (term.cardId ? termIdFor(catalog, file, term.cardId) : null) ??
    termIdFor(catalog, file, term.name) ??
    termIdFor(catalog, file, term.id);
  if (existing) return { id: existing, created: false, file };
  const saved = withCustomCard(catalog, file, term.faceId, term.name, NEUTRAL_RATING);
  if ('error' in saved) {
    const again = termIdFor(catalog, file, term.name);
    if (again) return { id: again, created: false, file };
    return saved;
  }
  return { id: saved.id, created: true, file: saved.file };
}
