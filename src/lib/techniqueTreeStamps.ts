/**
 * Edit times for the Technique Tree cloud sync.
 *
 * The tree archive and the glossary link list keep their own shapes. This
 * small side record remembers when each tree and each glossary link was last
 * changed or removed on this device, so two devices can merge per item:
 * the newest edit of a tree wins, links are a union, and a removal only wins
 * over a link or tree that is older than the removal.
 *
 * Storage key: `matboard.coach.techniqueTree.syncStamps.v1`
 */

import { isSyncTriggerSuppressed, noteLocalTreeChange } from './syncTrigger.ts';

export const TREE_STAMPS_STORAGE_KEY = 'matboard.coach.techniqueTree.syncStamps.v1';
/** Removals older than this many entries are forgotten, newest kept. */
export const TREE_TOMBSTONE_MAX = 200;

export type TreeStamps = {
  v: 1;
  trees: Record<string, number>;
  removedTrees: Record<string, number>;
  links: Record<string, number>;
  removedLinks: Record<string, number>;
};

type LinkLike = {
  from: { type: 'card'; cardId: string } | { type: 'tree'; treeId: string; nodeId: string };
  toCardId: string;
  relation: string;
};

export function glossaryLinkKey(link: LinkLike): string {
  const from = link.from.type === 'card' ? `card:${link.from.cardId}` : `tree:${link.from.treeId}:${link.from.nodeId}`;
  return `${from}|${link.toCardId}|${link.relation}`;
}

export function emptyTreeStamps(): TreeStamps {
  return { v: 1, trees: {}, removedTrees: {}, links: {}, removedLinks: {} };
}

function stampMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, at] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > 300) continue;
    if (typeof at === 'number' && Number.isFinite(at) && at > 0) out[key] = at;
  }
  return out;
}

export function trimTombstones(map: Record<string, number>, max = TREE_TOMBSTONE_MAX): Record<string, number> {
  const rows = Object.entries(map);
  if (rows.length <= max) return map;
  rows.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(rows.slice(0, max));
}

export function sanitizeTreeStamps(value: unknown): TreeStamps {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    v: 1,
    trees: stampMap(raw.trees),
    removedTrees: trimTombstones(stampMap(raw.removedTrees)),
    links: stampMap(raw.links),
    removedLinks: trimTombstones(stampMap(raw.removedLinks)),
  };
}

export function readTreeStamps(store: Pick<Storage, 'getItem'> | null = safeStorage()): TreeStamps {
  if (!store) return emptyTreeStamps();
  try {
    const raw = store.getItem(TREE_STAMPS_STORAGE_KEY);
    return raw ? sanitizeTreeStamps(JSON.parse(raw)) : emptyTreeStamps();
  } catch {
    return emptyTreeStamps();
  }
}

export function writeTreeStamps(stamps: TreeStamps, store: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  if (!store) return;
  try {
    store.setItem(TREE_STAMPS_STORAGE_KEY, JSON.stringify(stamps));
  } catch {
    /* stamps are a sync hint; the tree itself is already saved */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Pure: stamp trees that changed, appeared, or disappeared between two archives. */
export function diffTreeStamps(
  stamps: TreeStamps,
  previous: { trees?: { id: string }[] } | null,
  next: { trees: { id: string }[] },
  now: number,
): { stamps: TreeStamps; changed: boolean } {
  const before = new Map<string, string>();
  for (const tree of Array.isArray(previous?.trees) ? previous.trees : []) {
    if (tree && typeof tree.id === 'string') before.set(tree.id, JSON.stringify(tree));
  }
  const trees = { ...stamps.trees };
  const removedTrees = { ...stamps.removedTrees };
  let changed = false;
  const seen = new Set<string>();
  for (const tree of next.trees) {
    seen.add(tree.id);
    const was = before.get(tree.id);
    if (was === JSON.stringify(tree) && trees[tree.id]) continue;
    if (was !== undefined && was === JSON.stringify(tree)) {
      // Unchanged but never stamped (data from before cloud sync): give it a stamp of 1 so any real edit wins.
      trees[tree.id] = 1;
      continue;
    }
    trees[tree.id] = now;
    delete removedTrees[tree.id];
    changed = true;
  }
  for (const id of before.keys()) {
    if (seen.has(id)) continue;
    removedTrees[id] = now;
    delete trees[id];
    changed = true;
  }
  return { stamps: { ...stamps, trees, removedTrees: trimTombstones(removedTrees) }, changed };
}

/** Pure: stamp glossary links that were added or removed. */
export function diffLinkStamps(
  stamps: TreeStamps,
  previous: readonly LinkLike[],
  next: readonly LinkLike[],
  now: number,
): { stamps: TreeStamps; changed: boolean } {
  const before = new Set(previous.map(glossaryLinkKey));
  const after = new Set(next.map(glossaryLinkKey));
  const links = { ...stamps.links };
  const removedLinks = { ...stamps.removedLinks };
  let changed = false;
  for (const key of after) {
    if (before.has(key)) {
      if (!links[key]) links[key] = 1;
      continue;
    }
    links[key] = now;
    delete removedLinks[key];
    changed = true;
  }
  for (const key of before) {
    if (after.has(key)) continue;
    removedLinks[key] = now;
    delete links[key];
    changed = true;
  }
  return { stamps: { ...stamps, links, removedLinks: trimTombstones(removedLinks) }, changed };
}

/** Called by the tree store just before it writes. Skipped while a cloud copy is being applied. */
export function stampTreeArchive(previousRaw: string | null, next: { trees: { id: string }[] }, now = Date.now()): void {
  if (isSyncTriggerSuppressed()) return;
  const previous = parse(previousRaw) as { trees?: { id: string }[] } | null;
  const result = diffTreeStamps(readTreeStamps(), previous, next, now);
  writeTreeStamps(result.stamps);
  if (result.changed) noteLocalTreeChange();
}

/** Called by the glossary card store just before it writes. */
export function stampGlossaryLinks(previousRaw: string | null, next: readonly LinkLike[], now = Date.now()): void {
  if (isSyncTriggerSuppressed()) return;
  const previous = parse(previousRaw) as { links?: unknown } | null;
  const before = Array.isArray(previous?.links)
    ? (previous.links as unknown[]).filter((row): row is LinkLike => isLinkLike(row))
    : [];
  const result = diffLinkStamps(readTreeStamps(), before, next, now);
  writeTreeStamps(result.stamps);
  if (result.changed) noteLocalTreeChange();
}

function isLinkLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const from = row.from as Record<string, unknown> | undefined;
  if (!from || typeof row.toCardId !== 'string' || typeof row.relation !== 'string') return false;
  return (from.type === 'card' && typeof from.cardId === 'string') ||
    (from.type === 'tree' && typeof from.treeId === 'string' && typeof from.nodeId === 'string');
}
