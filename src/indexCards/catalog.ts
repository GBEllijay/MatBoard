/**
 * The live D8 catalog. Names come from the same face list as the diamond.
 * Definitions on that list are not shown. A card is the name, the journal, and a rating.
 */

import { FACES } from '../preview/d8Subfactors/model.ts';
import { isIndexFaceId, type CatalogLine } from '../lib/indexCards.ts';

let cached: CatalogLine[] | null = null;

export function d8Catalog(): CatalogLine[] {
  if (cached) return cached;
  const lines: CatalogLine[] = [];
  for (const face of FACES) {
    if (!isIndexFaceId(face.id)) continue;
    for (const line of face.subfactors) {
      lines.push({
        id: line.id,
        faceId: face.id,
        faceLabel: face.label,
        name: line.label,
        tile: line.tile,
      });
    }
  }
  cached = lines;
  return lines;
}
