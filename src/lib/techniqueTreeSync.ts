/**
 * Technique Tree cloud document, shared by the browser and /api/login/sync.
 *
 * What syncs: the coach's own trees (`matboard.coach.techniqueTree.v1`) and
 * the links they added between glossary base cards
 * (`matboard.coach.techniqueTree.glossaryBase.v1`). The 245 built-in cards
 * are not uploaded; every device rebuilds them from the glossary.
 *
 * Where: one JSON object per signed-in account,
 * `accounts/{accountId}/account-sync/technique-tree.json`, in the same bucket
 * as the other account-sync docs. It is never written into a student or
 * family-profile doc and never read by a roster, so nothing flows from an
 * instructor to a student.
 *
 * Merge rules (same on device and server, so both converge):
 *  - Trees: union by tree id. When both sides have the same tree, the side
 *    with the newer edit time for that tree wins (whole tree).
 *  - Glossary links: union by source + target + relation.
 *  - Removals: a removed tree or link is remembered with its removal time.
 *    It stays removed unless the other side edited or re-added it later.
 *  - Nothing else is ever deleted by a merge.
 */

import { sanitizeArchive, MAX_TREES, TITLE_MAX, type TechniqueTreeDoc } from './techniqueTreeStore.ts';
import { glossaryLinkKey, trimTombstones, TREE_TOMBSTONE_MAX } from './techniqueTreeStamps.ts';

/** Same shape as GlossaryBaseLink in glossaryBaseCards.ts, kept here so the server does not load the glossary. */
export type GlossaryBaseLinkSource =
  | { type: 'card'; cardId: string }
  | { type: 'tree'; treeId: string; nodeId: string; slotId: string; title: string };
export type GlossaryBaseLink = {
  id: string;
  from: GlossaryBaseLinkSource;
  toCardId: string;
  relation: 'branch' | 'defense' | 'follow';
  label: string;
};

/** Two devices can each hold the full cap of trees, so a merged doc may carry both sets. */
export const TREE_SYNC_MAX_TREES = MAX_TREES * 2;
export const TREE_SYNC_MAX_LINKS = 2000;
export const TREE_SYNC_MAX_BYTES = 1_200_000;

export type TreeSyncRow = { tree: TechniqueTreeDoc; at: number };
export type TreeSyncLinkRow = { link: GlossaryBaseLink; at: number };

export type TreeSyncDoc = {
  v: 1;
  updatedAt: number;
  activeId: string;
  trees: TreeSyncRow[];
  removedTrees: Record<string, number>;
  links: TreeSyncLinkRow[];
  removedLinks: Record<string, number>;
};

export function emptyTreeSyncDoc(): TreeSyncDoc {
  return { v: 1, updatedAt: 0, activeId: '', trees: [], removedTrees: {}, links: [], removedLinks: {} };
}

export function treeSyncDocIsEmpty(doc: TreeSyncDoc | null | undefined): boolean {
  if (!doc) return true;
  return (
    doc.trees.length === 0 &&
    doc.links.length === 0 &&
    Object.keys(doc.removedTrees).length === 0 &&
    Object.keys(doc.removedLinks).length === 0
  );
}

function stamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function tombstones(value: unknown): Record<string, number> {
  const raw = record(value);
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [key, at] of Object.entries(raw)) {
    const time = stamp(at);
    if (key && key.length <= 300 && time) out[key] = time;
  }
  return trimTombstones(out, TREE_TOMBSTONE_MAX);
}

/** Clean one tree with the same rules the device uses. Returns null for junk. */
export function sanitizeSyncTree(value: unknown): TechniqueTreeDoc | null {
  const raw = record(value);
  const id = text(raw?.id, 80);
  if (!raw || !id) return null;
  const { archive } = sanitizeArchive({ version: 2, activeId: id, trees: [raw] });
  const tree = archive.trees[0];
  return tree && tree.id === id ? tree : null;
}

const CARD_ID_RE = /^gbase\.[a-z0-9-]{1,100}$/;

function sanitizeSource(value: unknown): GlossaryBaseLinkSource | null {
  const raw = record(value);
  if (!raw) return null;
  if (raw.type === 'card') {
    const cardId = text(raw.cardId, 120);
    return CARD_ID_RE.test(cardId) ? { type: 'card', cardId } : null;
  }
  if (raw.type === 'tree') {
    const treeId = text(raw.treeId, 80);
    const nodeId = text(raw.nodeId, 80);
    const slotId = text(raw.slotId, 80);
    if (!treeId || !nodeId || !slotId) return null;
    return { type: 'tree', treeId, nodeId, slotId, title: text(raw.title, TITLE_MAX) };
  }
  return null;
}

export function sanitizeSyncLink(value: unknown): GlossaryBaseLink | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, 80);
  const from = sanitizeSource(raw.from);
  const toCardId = text(raw.toCardId, 120);
  const relation = raw.relation === 'defense' || raw.relation === 'follow' || raw.relation === 'branch' ? raw.relation : null;
  if (!id || !from || !relation || !CARD_ID_RE.test(toCardId)) return null;
  if (from.type === 'card' && from.cardId === toCardId) return null;
  return { id, from, toCardId, relation, label: text(raw.label, TITLE_MAX) };
}

/** Server and device both run this on anything they did not build themselves. */
export function sanitizeTreeSyncDoc(raw: unknown): TreeSyncDoc | null {
  const row = record(raw);
  if (!row) return null;
  const trees: TreeSyncRow[] = [];
  const treeIds = new Set<string>();
  for (const item of Array.isArray(row.trees) ? row.trees : []) {
    if (trees.length >= TREE_SYNC_MAX_TREES) break;
    const entry = record(item);
    const tree = sanitizeSyncTree(entry?.tree);
    if (!tree || treeIds.has(tree.id)) continue;
    treeIds.add(tree.id);
    trees.push({ tree, at: stamp(entry?.at) || 1 });
  }
  const links: TreeSyncLinkRow[] = [];
  const linkKeys = new Set<string>();
  for (const item of Array.isArray(row.links) ? row.links : []) {
    if (links.length >= TREE_SYNC_MAX_LINKS) break;
    const entry = record(item);
    const link = sanitizeSyncLink(entry?.link);
    if (!link) continue;
    const key = glossaryLinkKey(link);
    if (linkKeys.has(key)) continue;
    linkKeys.add(key);
    links.push({ link, at: stamp(entry?.at) || 1 });
  }
  const activeId = text(row.activeId, 80);
  return {
    v: 1,
    updatedAt: stamp(row.updatedAt),
    activeId: treeIds.has(activeId) ? activeId : trees[0]?.tree.id ?? '',
    trees,
    removedTrees: tombstones(row.removedTrees),
    links,
    removedLinks: tombstones(row.removedLinks),
  };
}

function maxMap(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [key, at] of Object.entries(b)) out[key] = Math.max(out[key] ?? 0, at);
  return out;
}

function newer<T>(left: { at: number; value: T } | undefined, right: { at: number; value: T }): boolean {
  if (!left) return true;
  if (right.at !== left.at) return right.at > left.at;
  // Same edit time on two devices: pick the same side everywhere.
  return JSON.stringify(right.value) > JSON.stringify(left.value);
}

/** Merge two tree docs by the rules at the top of this file. Pure. */
export function mergeTreeDocs(a: TreeSyncDoc | null, b: TreeSyncDoc | null): TreeSyncDoc {
  const left = a ?? emptyTreeSyncDoc();
  const right = b ?? emptyTreeSyncDoc();
  const removedTrees = maxMap(left.removedTrees, right.removedTrees);
  const removedLinks = maxMap(left.removedLinks, right.removedLinks);

  const order: string[] = [];
  const bestTree = new Map<string, { at: number; value: TechniqueTreeDoc }>();
  for (const row of [...left.trees, ...right.trees]) {
    if (!bestTree.has(row.tree.id)) order.push(row.tree.id);
    const candidate = { at: row.at, value: row.tree };
    if (newer(bestTree.get(row.tree.id), candidate)) bestTree.set(row.tree.id, candidate);
  }
  const trees: TreeSyncRow[] = [];
  for (const id of order) {
    const best = bestTree.get(id);
    if (!best) continue;
    if ((removedTrees[id] ?? 0) >= best.at) continue;
    delete removedTrees[id];
    trees.push({ tree: best.value, at: best.at });
  }

  const linkOrder: string[] = [];
  const bestLink = new Map<string, { at: number; value: GlossaryBaseLink }>();
  for (const row of [...left.links, ...right.links]) {
    const key = glossaryLinkKey(row.link);
    if (!bestLink.has(key)) linkOrder.push(key);
    const candidate = { at: row.at, value: row.link };
    if (newer(bestLink.get(key), candidate)) bestLink.set(key, candidate);
  }
  const links: TreeSyncLinkRow[] = [];
  const linkIds = new Set<string>();
  for (const key of linkOrder) {
    const best = bestLink.get(key);
    if (!best) continue;
    if ((removedLinks[key] ?? 0) >= best.at) continue;
    delete removedLinks[key];
    let link = best.value;
    if (linkIds.has(link.id)) link = { ...link, id: `${link.id}-${linkIds.size}`.slice(0, 80) };
    linkIds.add(link.id);
    links.push({ link, at: best.at });
  }

  const ids = new Set(trees.map((row) => row.tree.id));
  const activeId = ids.has(left.activeId) ? left.activeId : ids.has(right.activeId) ? right.activeId : trees[0]?.tree.id ?? '';
  return {
    v: 1,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    activeId,
    trees: trees.slice(0, TREE_SYNC_MAX_TREES),
    removedTrees: trimTombstones(removedTrees, TREE_TOMBSTONE_MAX),
    links: links.slice(0, TREE_SYNC_MAX_LINKS),
    removedLinks: trimTombstones(removedLinks, TREE_TOMBSTONE_MAX),
  };
}

function contentKey(doc: TreeSyncDoc | null): string {
  if (!doc) return '';
  const sorted = (map: Record<string, number>) => Object.entries(map).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return JSON.stringify({
    trees: [...doc.trees].sort((x, y) => (x.tree.id < y.tree.id ? -1 : 1)),
    links: [...doc.links].map((row) => [glossaryLinkKey(row.link), row.at, row.link]).sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    removedTrees: sorted(doc.removedTrees),
    removedLinks: sorted(doc.removedLinks),
  });
}

/** True when two docs hold the same trees, links, and removals (edit times included). */
export function sameTreeContent(a: TreeSyncDoc | null, b: TreeSyncDoc | null): boolean {
  if (treeSyncDocIsEmpty(a) && treeSyncDocIsEmpty(b)) return true;
  return contentKey(a) === contentKey(b);
}
