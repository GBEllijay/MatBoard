/**
 * Coach Technique Tree. Every tree stays on this phone — no cloud.
 *
 * Storage key: `matboard.coach.techniqueTree.v1`
 * A stored `version: 1` single tree is wrapped into this archive the first time it is read.
 *
 * ```json
 * {
 *   "version": 2,
 *   "activeId": "tree-…",
 *   "trees": [
 *     {
 *       "id": "tree-…",
 *       "name": "Technique Tree",
 *       "root": {
 *         "id": "node-…",
 *         "slotId": "slot-…",
 *         "kind": "root",
 *         "title": "Closed guard",
 *         "notes": "",
 *         "collapsed": false,
 *         "children": [
 *           {
 *             "id": "node-…",
 *             "slotId": "slot-…",
 *             "kind": "branch",
 *             "title": "Triangle",
 *             "notes": "",
 *             "collapsed": false,
 *             "children": []
 *           },
 *           {
 *             "id": "node-…",
 *             "slotId": "slot-…",
 *             "kind": "defense",
 *             "title": "Posture up",
 *             "notes": "",
 *             "collapsed": false,
 *             "children": []
 *           }
 *         ]
 *       }
 *     }
 *   ]
 * }
 * ```
 *
 * `kind` is `root` on the base, `branch` for an attack/progression, or `defense`
 * for a defense/counter under the same parent. `slotId` is a stable hook for a
 * later Daily Lesson Plan or Daily Training Videos link. This screen does not use it.
 */

import { isStorageQuotaError } from './storageQuota.ts';

export const TECHNIQUE_TREE_STORAGE_KEY = 'matboard.coach.techniqueTree.v1';
export const DEFAULT_TREE_NAME = 'Technique Tree';
export const TREE_NAME_MAX = 80;
export const TITLE_MAX = 120;
export const NOTES_MAX = 400;
/** Root plus every step under it. */
export const MAX_TREE_NODES = 40;
/** Root is depth 0. A node at this depth cannot grow children. */
export const MAX_TREE_DEPTH = 8;
/** Adding another tree stops here. Stored trees above the cap are kept. */
export const MAX_TREES = 20;

export type TreeNodeKind = 'root' | 'branch' | 'defense';
export type TreeChildKind = 'branch' | 'defense';

export type TechniqueNode = {
  id: string;
  /**
   * Stable hook for a later Daily Lesson Plan / Daily Training Videos link.
   * Unused by this screen.
   */
  slotId: string;
  kind: TreeNodeKind;
  title: string;
  notes: string;
  collapsed: boolean;
  children: TechniqueNode[];
};

export type TechniqueTreeDoc = {
  id: string;
  name: string;
  root: TechniqueNode | null;
};

export type TechniqueTreeArchive = {
  version: 2;
  activeId: string;
  trees: TechniqueTreeDoc[];
};

export type AddTreeStatus = 'added' | 'full' | 'open';

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function clampTreeName(value: unknown): string {
  const text = clampText(value, TREE_NAME_MAX).trim();
  return text || DEFAULT_TREE_NAME;
}

export function emptyTree(name = DEFAULT_TREE_NAME): TechniqueTreeDoc {
  return { id: createId('tree'), name: clampTreeName(name), root: null };
}

export function freshArchive(): TechniqueTreeArchive {
  const tree = emptyTree();
  return { version: 2, activeId: tree.id, trees: [tree] };
}

export function activeTree(archive: TechniqueTreeArchive): TechniqueTreeDoc {
  return archive.trees.find((tree) => tree.id === archive.activeId) ?? archive.trees[0];
}

export function createNode(kind: TreeNodeKind): TechniqueNode {
  return {
    id: createId('node'),
    slotId: createId('slot'),
    kind,
    title: '',
    notes: '',
    collapsed: false,
    children: [],
  };
}

export function countNodes(node: TechniqueNode | null): number {
  if (!node) return 0;
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

export function descendantCount(node: TechniqueNode): number {
  return node.children.reduce((sum, child) => sum + 1 + descendantCount(child), 0);
}

export function treeHasContent(doc: TechniqueTreeDoc): boolean {
  return doc.root !== null;
}

type FoundNode = { node: TechniqueNode; depth: number };

export function findNode(node: TechniqueNode | null, id: string, depth = 0): FoundNode | null {
  if (!node) return null;
  if (node.id === id) return { node, depth };
  for (const child of node.children) {
    const found = findNode(child, id, depth + 1);
    if (found) return found;
  }
  return null;
}

function revealAt(node: TechniqueNode, id: string): TechniqueNode | null {
  if (node.id === id) return node;
  let found = false;
  const children = node.children.map((child) => {
    const next = revealAt(child, id);
    if (!next) return child;
    found = true;
    return next;
  });
  if (!found) return null;
  if (!node.collapsed && children.every((child, index) => child === node.children[index])) return node;
  return { ...node, collapsed: false, children };
}

/** Opens collapsed ancestors so a linked step can be seen. Same doc when nothing changes. */
export function revealNode(doc: TechniqueTreeDoc, id: string): TechniqueTreeDoc {
  if (!doc.root) return doc;
  const root = revealAt(doc.root, id);
  if (!root || root === doc.root) return doc;
  return { ...doc, root };
}

export function canAddChild(doc: TechniqueTreeDoc, parentId: string): boolean {
  if (!doc.root) return false;
  if (countNodes(doc.root) >= MAX_TREE_NODES) return false;
  const found = findNode(doc.root, parentId);
  if (!found) return false;
  return found.depth < MAX_TREE_DEPTH;
}

function updateAt(
  node: TechniqueNode,
  id: string,
  change: (node: TechniqueNode) => TechniqueNode,
): TechniqueNode {
  if (node.id === id) return change(node);
  let changed = false;
  const children = node.children.map((child) => {
    const next = updateAt(child, id, change);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function removeAt(node: TechniqueNode, id: string): TechniqueNode | null {
  if (node.id === id) return null;
  let changed = false;
  const children: TechniqueNode[] = [];
  for (const child of node.children) {
    const next = removeAt(child, id);
    if (next !== child) changed = true;
    if (next) children.push(next);
  }
  if (!changed) return node;
  return {
    ...node,
    children,
    collapsed: children.length === 0 ? false : node.collapsed,
  };
}

export function setRoot(doc: TechniqueTreeDoc, title: string, notes: string): TechniqueTreeDoc {
  if (doc.root) return updateNode(doc, doc.root.id, { title, notes });
  const root = createNode('root');
  return {
    ...doc,
    root: {
      ...root,
      title: clampText(title, TITLE_MAX),
      notes: clampText(notes, NOTES_MAX),
    },
  };
}

export function renameTree(doc: TechniqueTreeDoc, name: string): TechniqueTreeDoc {
  const next = clampTreeName(name);
  if (next === doc.name) return doc;
  return { ...doc, name: next };
}

export function updateNode(
  doc: TechniqueTreeDoc,
  id: string,
  patch: { title?: string; notes?: string; collapsed?: boolean },
): TechniqueTreeDoc {
  if (!doc.root) return doc;
  const root = updateAt(doc.root, id, (node) => {
    const title = patch.title !== undefined ? clampText(patch.title, TITLE_MAX) : node.title;
    const notes = patch.notes !== undefined ? clampText(patch.notes, NOTES_MAX) : node.notes;
    const collapsed =
      patch.collapsed !== undefined ? (node.children.length > 0 ? patch.collapsed : false) : node.collapsed;
    if (title === node.title && notes === node.notes && collapsed === node.collapsed) return node;
    return { ...node, title, notes, collapsed };
  });
  return root === doc.root ? doc : { ...doc, root };
}

export function toggleCollapsed(doc: TechniqueTreeDoc, id: string): TechniqueTreeDoc {
  if (!doc.root) return doc;
  const found = findNode(doc.root, id);
  if (!found || found.node.children.length === 0) return doc;
  return updateNode(doc, id, { collapsed: !found.node.collapsed });
}

export function addChild(
  doc: TechniqueTreeDoc,
  parentId: string,
  kind: TreeChildKind,
): { doc: TechniqueTreeDoc; id: string | null } {
  if (!canAddChild(doc, parentId) || !doc.root) return { doc, id: null };
  const child = createNode(kind);
  const root = updateAt(doc.root, parentId, (node) => ({
    ...node,
    collapsed: false,
    children: [...node.children, child],
  }));
  return { doc: { ...doc, root }, id: child.id };
}

export function removeNode(doc: TechniqueTreeDoc, id: string): TechniqueTreeDoc {
  if (!doc.root) return doc;
  const root = removeAt(doc.root, id);
  return root === doc.root ? doc : { ...doc, root };
}

type SanitizeNode = { node: TechniqueNode | null; repaired: boolean };

function freshId(prefix: string, raw: unknown, seen: Set<string>): { id: string; repaired: boolean } {
  const text = typeof raw === 'string' ? raw.trim().slice(0, 80) : '';
  if (text && !seen.has(text)) {
    seen.add(text);
    return { id: text, repaired: false };
  }
  const id = createId(prefix);
  seen.add(id);
  return { id, repaired: true };
}

function sanitizeNode(
  value: unknown,
  depth: number,
  role: 'root' | 'child',
  ids: Set<string>,
  slots: Set<string>,
  budget: { left: number },
): SanitizeNode {
  if (budget.left <= 0 || depth > MAX_TREE_DEPTH) return { node: null, repaired: true };
  const raw = asRecord(value);
  let repaired = !raw;
  budget.left -= 1;

  const id = freshId('node', raw?.id, ids);
  const slot = freshId('slot', raw?.slotId, slots);
  if (id.repaired || slot.repaired) repaired = true;

  let kind: TreeNodeKind;
  if (role === 'root') {
    kind = 'root';
    if (raw?.kind !== 'root') repaired = true;
  } else if (raw?.kind === 'defense') {
    kind = 'defense';
  } else {
    kind = 'branch';
    if (raw?.kind !== 'branch') repaired = true;
  }

  const title = clampText(raw?.title, TITLE_MAX);
  const notes = clampText(raw?.notes, NOTES_MAX);
  if (typeof raw?.title !== 'string' && raw?.title !== undefined) repaired = true;
  if (typeof raw?.notes !== 'string' && raw?.notes !== undefined) repaired = true;
  if (typeof raw?.title === 'string' && raw.title.length > TITLE_MAX) repaired = true;
  if (typeof raw?.notes === 'string' && raw.notes.length > NOTES_MAX) repaired = true;

  const children: TechniqueNode[] = [];
  const rawChildren = Array.isArray(raw?.children) ? raw.children : [];
  if (raw && !Array.isArray(raw.children)) repaired = true;
  if (depth >= MAX_TREE_DEPTH && rawChildren.length > 0) repaired = true;
  if (depth < MAX_TREE_DEPTH) {
    for (const child of rawChildren) {
      const sanitized = sanitizeNode(child, depth + 1, 'child', ids, slots, budget);
      if (sanitized.repaired) repaired = true;
      if (sanitized.node) children.push(sanitized.node);
      else repaired = true;
    }
  }

  let collapsed = raw?.collapsed === true;
  if (raw && typeof raw.collapsed !== 'boolean' && raw.collapsed !== undefined) repaired = true;
  if (collapsed && children.length === 0) {
    collapsed = false;
    repaired = true;
  }

  return {
    node: {
      id: id.id,
      slotId: slot.id,
      kind,
      title,
      notes,
      collapsed,
      children,
    },
    repaired,
  };
}

function sanitizeTreeDoc(
  value: unknown,
  treeIds: Set<string>,
  nodeIds: Set<string>,
  slotIds: Set<string>,
): { doc: TechniqueTreeDoc; repaired: boolean } {
  const raw = asRecord(value);
  let repaired = !raw;
  const id = freshId('tree', raw?.id, treeIds);
  if (id.repaired) repaired = true;
  const name = clampTreeName(raw?.name);
  if (!raw || raw.name !== name) repaired = true;

  if (!raw || raw.root == null) {
    return { doc: { id: id.id, name, root: null }, repaired };
  }

  const budget = { left: MAX_TREE_NODES };
  const sanitized = sanitizeNode(raw.root, 0, 'root', nodeIds, slotIds, budget);
  if (sanitized.repaired || !sanitized.node) repaired = true;
  return { doc: { id: id.id, name, root: sanitized.node }, repaired };
}

export function sanitizeArchive(value: unknown): { archive: TechniqueTreeArchive; repaired: boolean } {
  const raw = asRecord(value);
  if (!raw) return { archive: freshArchive(), repaired: true };

  const treeIds = new Set<string>();
  const nodeIds = new Set<string>();
  const slotIds = new Set<string>();

  if (raw.version === 2 || Array.isArray(raw.trees)) {
    let repaired = raw.version !== 2 || !Array.isArray(raw.trees);
    const trees: TechniqueTreeDoc[] = [];
    const list = Array.isArray(raw.trees) ? raw.trees : [];
    for (const item of list) {
      const sanitized = sanitizeTreeDoc(item, treeIds, nodeIds, slotIds);
      if (sanitized.repaired) repaired = true;
      trees.push(sanitized.doc);
    }
    if (trees.length === 0) {
      trees.push(emptyTree());
      repaired = true;
    }
    const requested = typeof raw.activeId === 'string' ? raw.activeId : '';
    const activeId = trees.some((tree) => tree.id === requested) ? requested : trees[0].id;
    if (activeId !== requested) repaired = true;
    return { archive: { version: 2, activeId, trees }, repaired };
  }

  const single = sanitizeTreeDoc(raw, treeIds, nodeIds, slotIds);
  return {
    archive: { version: 2, activeId: single.doc.id, trees: [single.doc] },
    repaired: true,
  };
}

function writeArchive(archive: TechniqueTreeArchive): { saved: boolean; quota: boolean } {
  try {
    localStorage.setItem(TECHNIQUE_TREE_STORAGE_KEY, JSON.stringify(archive));
    return { saved: true, quota: false };
  } catch (error) {
    return { saved: false, quota: isStorageQuotaError(error) };
  }
}

export function loadTechniqueArchive(): TechniqueTreeArchive {
  try {
    const raw = localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return freshArchive();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const { archive, repaired } = sanitizeArchive(parsed);
    if (repaired) writeArchive(archive);
    return archive;
  } catch {
    return freshArchive();
  }
}

export function saveTechniqueArchive(
  archive: TechniqueTreeArchive,
): { archive: TechniqueTreeArchive; saved: boolean; quota: boolean } {
  const clean = sanitizeArchive(archive).archive;
  const write = writeArchive(clean);
  return { archive: clean, saved: write.saved, quota: write.quota };
}

export function loadTechniqueTree(): TechniqueTreeDoc {
  return activeTree(loadTechniqueArchive());
}

export function saveTechniqueTree(doc: TechniqueTreeDoc): { doc: TechniqueTreeDoc; saved: boolean } {
  const saved = saveTechniqueArchive(updateActive(loadTechniqueArchive(), doc));
  return { doc: activeTree(saved.archive), saved: saved.saved };
}

export function updateActive(archive: TechniqueTreeArchive, doc: TechniqueTreeDoc): TechniqueTreeArchive {
  const current = activeTree(archive);
  const next: TechniqueTreeDoc = {
    id: current.id,
    name: clampTreeName(doc.name),
    root: doc.root,
  };
  return {
    ...archive,
    trees: archive.trees.map((tree) => (tree.id === current.id ? next : tree)),
  };
}

function nextDefaultName(trees: TechniqueTreeDoc[]): string {
  const names = new Set(trees.map((tree) => tree.name));
  if (!names.has(DEFAULT_TREE_NAME)) return DEFAULT_TREE_NAME;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${DEFAULT_TREE_NAME} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
  return DEFAULT_TREE_NAME;
}

/** Keep every saved tree. A fresh empty tree opens only when the open one already has a base. */
export function addTree(archive: TechniqueTreeArchive): { archive: TechniqueTreeArchive; status: AddTreeStatus } {
  const active = activeTree(archive);
  if (!active.root) return { archive, status: 'open' };
  if (archive.trees.length >= MAX_TREES) return { archive, status: 'full' };
  const tree = emptyTree(nextDefaultName(archive.trees));
  return {
    archive: { ...archive, activeId: tree.id, trees: [...archive.trees, tree] },
    status: 'added',
  };
}

export function selectTree(archive: TechniqueTreeArchive, id: string): TechniqueTreeArchive {
  if (!archive.trees.some((tree) => tree.id === id) || archive.activeId === id) return archive;
  return { ...archive, activeId: id };
}

/** Removes one tree. The caller confirms first. The last delete leaves a blank tree so the screen can start again. */
export function deleteTree(archive: TechniqueTreeArchive, id: string): TechniqueTreeArchive {
  const index = archive.trees.findIndex((tree) => tree.id === id);
  if (index < 0) return archive;
  const trees = archive.trees.filter((tree) => tree.id !== id);
  if (trees.length === 0) return freshArchive();
  const fallback = archive.trees[index - 1]?.id ?? trees[0].id;
  const activeId = id === archive.activeId ? fallback : archive.activeId;
  return {
    version: 2,
    activeId: trees.some((tree) => tree.id === activeId) ? activeId : trees[0].id,
    trees,
  };
}
