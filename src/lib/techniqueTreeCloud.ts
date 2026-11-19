/**
 * Device side of the Technique Tree cloud doc: read this device's trees and
 * glossary links into a TreeSyncDoc, and write a merged doc back.
 * Rules live in techniqueTreeSync.ts.
 */

import { GLOSSARY_BASE_STORAGE_KEY, sanitizeGlossaryBaseCatalog } from './glossaryBaseCards.ts';
import { suppressSyncTrigger } from './syncTrigger.ts';
import {
  DEFAULT_TREE_NAME,
  sanitizeArchive,
  TECHNIQUE_TREE_STORAGE_KEY,
  type TechniqueTreeDoc,
} from './techniqueTreeStore.ts';
import { glossaryLinkKey, readTreeStamps, writeTreeStamps } from './techniqueTreeStamps.ts';
import { sanitizeSyncCard, sanitizeSyncLink, sanitizeTreeSyncDoc, type TreeSyncDoc } from './techniqueTreeSync.ts';

type Store = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** A brand-new device starts with one empty, unnamed tree. That one is not worth uploading. */
function untouchedDefault(tree: TechniqueTreeDoc): boolean {
  return !tree.root && !tree.links?.length && tree.name === DEFAULT_TREE_NAME;
}

export function collectTreeDoc(store: Store | null, now = Date.now()): TreeSyncDoc {
  const stamps = store ? readTreeStamps(store) : readTreeStamps(null);
  const rawArchive = store ? parse(store.getItem(TECHNIQUE_TREE_STORAGE_KEY)) : null;
  const archive = rawArchive ? sanitizeArchive(rawArchive).archive : null;
  const trees = (archive?.trees ?? [])
    .filter((tree) => !untouchedDefault(tree))
    .map((tree) => ({ tree, at: stamps.trees[tree.id] || 1 }));
  const rawCatalog = store ? (parse(store.getItem(GLOSSARY_BASE_STORAGE_KEY)) as { links?: unknown; cards?: unknown } | null) : null;
  const links = (Array.isArray(rawCatalog?.links) ? rawCatalog.links : [])
    .map(sanitizeSyncLink)
    .filter((link): link is NonNullable<typeof link> => !!link)
    .map((link) => ({ link, at: stamps.links[glossaryLinkKey(link)] || 1 }));
  // Instructor-added glossary cards ride along. The built-in cards never upload.
  const cards = (Array.isArray(rawCatalog?.cards) ? rawCatalog.cards : [])
    .map(sanitizeSyncCard)
    .filter((card): card is NonNullable<typeof card> => !!card)
    .map((card) => ({ card, at: card.addedAt || 1 }));
  const latest = Math.max(
    0,
    ...trees.map((row) => row.at),
    ...links.map((row) => row.at),
    ...cards.map((row) => row.at),
    ...Object.values(stamps.removedTrees),
    ...Object.values(stamps.removedLinks),
  );
  const doc = sanitizeTreeSyncDoc({
    v: 1,
    updatedAt: latest > 1 ? latest : trees.length || links.length || cards.length ? now : 0,
    activeId: archive?.activeId ?? '',
    trees,
    removedTrees: stamps.removedTrees,
    links,
    removedLinks: stamps.removedLinks,
    cards,
  });
  return doc ?? { v: 1, updatedAt: 0, activeId: '', trees: [], removedTrees: {}, links: [], removedLinks: {}, cards: [] };
}

/** Write a merged doc onto this device. Existing local data is kept unless the merge removed it. */
export function applyTreeDoc(doc: TreeSyncDoc, store: Store | null): void {
  if (!store) return;
  const release = suppressSyncTrigger();
  try {
    const rawArchive = parse(store.getItem(TECHNIQUE_TREE_STORAGE_KEY));
    const local = rawArchive ? sanitizeArchive(rawArchive).archive : null;
    const trees = doc.trees.map((row) => row.tree);
    const keep = trees.length ? trees : (local?.trees ?? []).filter(untouchedDefault);
    if (keep.length || local) {
      const activeId =
        local && keep.some((tree) => tree.id === local.activeId) ? local.activeId : doc.activeId || keep[0]?.id || '';
      const next = sanitizeArchive({ version: 2, activeId, trees: keep }).archive;
      store.setItem(TECHNIQUE_TREE_STORAGE_KEY, JSON.stringify(next));
    }

    const rawCatalog = parse(store.getItem(GLOSSARY_BASE_STORAGE_KEY)) as Record<string, unknown> | null;
    const docCards = doc.cards ?? [];
    if (rawCatalog || doc.links.length || docCards.length) {
      // Cards first, so links to an instructor-added card from another device are kept.
      const localCards = Array.isArray(rawCatalog?.cards) ? (rawCatalog.cards as unknown[]) : [];
      const incoming = new Map(docCards.map((row) => [row.card.id, row.card]));
      const cards: unknown[] = localCards.map((card) => {
        const id = card && typeof card === 'object' ? (card as { id?: unknown }).id : undefined;
        if (typeof id !== 'string' || !incoming.has(id)) return card;
        const next = incoming.get(id);
        incoming.delete(id);
        const localAt = (card as { custom?: unknown; addedAt?: unknown }).custom === true
          ? Number((card as { addedAt?: unknown }).addedAt) || 0
          : Number.POSITIVE_INFINITY; // a built-in card with this id stays built-in
        return next && next.addedAt > localAt ? next : card;
      });
      for (const card of incoming.values()) cards.push(card);
      const catalog = sanitizeGlossaryBaseCatalog({ ...(rawCatalog ?? {}), cards, links: doc.links.map((row) => row.link) });
      store.setItem(GLOSSARY_BASE_STORAGE_KEY, JSON.stringify(catalog));
    }

    writeTreeStamps(
      {
        v: 1,
        trees: Object.fromEntries(doc.trees.map((row) => [row.tree.id, row.at])),
        removedTrees: doc.removedTrees,
        links: Object.fromEntries(doc.links.map((row) => [glossaryLinkKey(row.link), row.at])),
        removedLinks: doc.removedLinks,
      },
      store,
    );
  } finally {
    release();
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(TREE_CLOUD_EVENT));
  } catch {
    /* no window in tests */
  }
}

/** Fired after a cloud copy of the tree was written to this device. */
export const TREE_CLOUD_EVENT = 'matboard:technique-tree-cloud';
