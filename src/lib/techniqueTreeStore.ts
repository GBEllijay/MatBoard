/**
 * Coach Technique Tree. One on-device tree — no cloud, no multi-tree archive.
 *
 * Storage key: `matboard.coach.techniqueTree.v1`
 *
 * ```json
 * {
 *   "version": 1,
 *   "name": "Technique Tree",
 *   "root": {
 *     "id": "node-…",
 *     "slotId": "slot-…",
 *     "kind": "root",
 *     "title": "Closed guard",
 *     "notes": "",
 *     "collapsed": false,
 *     "children": [
 *       {
 *         "id": "node-…",
 *         "slotId": "slot-…",
 *         "kind": "branch",
 *         "title": "Triangle",
 *         "notes": "",
 *         "collapsed": false,
 *         "children": []
 *       },
 *       {
 *         "id": "node-…",
 *         "slotId": "slot-…",
 *         "kind": "defense",
 *         "title": "Posture up",
 *         "notes": "",
 *         "collapsed": false,
 *         "children": []
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * `kind` is `root` on the base, `branch` for an attack/progression, or `defense`
 * for a defense/counter under the same parent. `slotId` is a stable hook for a
 * later Daily Lesson Plan or Daily Training Videos link. This screen does not use it.
 */

export const TECHNIQUE_TREE_STORAGE_KEY = 'matboard.coach.techniqueTree.v1';
export const DEFAULT_TREE_NAME = 'Technique Tree';
export const TREE_NAME_MAX = 80;
export const TITLE_MAX = 120;
export const NOTES_MAX = 400;
/** Root plus every step under it. */
export const MAX_TREE_NODES = 40;
/** Root is depth 0. A node at this depth cannot grow children. */
export const MAX_TREE_DEPTH = 8;

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
  version: 1;
  name: string;
  root: TechniqueNode | null;
};

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

export function emptyTree(): TechniqueTreeDoc {
  return { version: 1, name: DEFAULT_TREE_NAME, root: null };
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

export function sanitizeTree(value: unknown): { doc: TechniqueTreeDoc; repaired: boolean } {
  const raw = asRecord(value);
  if (!raw) return { doc: emptyTree(), repaired: true };

  let repaired = raw.version !== 1;
  const name = clampTreeName(raw.name);
  if (raw.name !== name) repaired = true;

  if (raw.root == null) {
    return { doc: { version: 1, name, root: null }, repaired };
  }

  const budget = { left: MAX_TREE_NODES };
  const sanitized = sanitizeNode(raw.root, 0, 'root', new Set(), new Set(), budget);
  if (sanitized.repaired) repaired = true;
  return { doc: { version: 1, name, root: sanitized.node }, repaired };
}

function writeTree(doc: TechniqueTreeDoc): boolean {
  try {
    localStorage.setItem(TECHNIQUE_TREE_STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function loadTechniqueTree(): TechniqueTreeDoc {
  try {
    const raw = localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return emptyTree();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const { doc, repaired } = sanitizeTree(parsed);
    if (repaired) writeTree(doc);
    return doc;
  } catch {
    return emptyTree();
  }
}

export function saveTechniqueTree(doc: TechniqueTreeDoc): { doc: TechniqueTreeDoc; saved: boolean } {
  const clean = sanitizeTree(doc).doc;
  return { doc: clean, saved: writeTree(clean) };
}
