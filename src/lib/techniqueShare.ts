/**
 * Intentional technique-tree interchange.
 * Coach trees stay nested on the coach phone. Student trees stay on the student file.
 * This file is the only thing that moves between them. Nothing is sent by itself.
 * Private notes, journals, profiles, licenses, and media are not included.
 */

import { asRecord } from './plainValue.ts';
import { parentGateOn } from './parentGate.ts';
import {
  TITLE_MAX,
  type TechniqueNode,
  type TechniqueTreeDoc,
  type TechniqueTreeLink,
} from './techniqueTreeStore.ts';
import {
  PROGRESS_NAME_MAX,
  type WorkingGraph,
  type WorkingNode,
  type WorkingNodeKind,
  type WorkingRelation,
} from './progress/types.ts';
import { emptyWorkingGraph, findWorkingByTitle, workingTitleKey } from './workingTechniques.ts';

export const TECHNIQUE_SHARE_KIND = 'advantage-technique-share';
export const TECHNIQUE_SHARE_VERSION = 1;
export const TECHNIQUE_SHARE_MAX_CHARS = 120_000;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const UNSAFE = /javascript\s*:|data\s*:|vbscript\s*:|<\s*script|https?:\/\//i;

export type TechniqueShareNode = {
  shareId: string;
  title: string;
  kind: WorkingNodeKind;
};

export type TechniqueShareEdge = {
  shareId: string;
  fromId: string;
  toId: string;
  relation: WorkingRelation;
  label: string;
};

export type TechniqueShareFile = {
  kind: typeof TECHNIQUE_SHARE_KIND;
  version: typeof TECHNIQUE_SHARE_VERSION;
  name: string;
  nodes: TechniqueShareNode[];
  edges: TechniqueShareEdge[];
};

export type ShareChoice = 'keep' | 'take' | 'skip' | 'use-local';

export type ShareConflict = {
  shareId: string;
  title: string;
  localTitle: string;
  /** same share id, different title */
  kind: 'title' | 'exact-title';
  localShareId: string;
};

export type SharePreview = {
  ok: true;
  file: TechniqueShareFile;
  add: TechniqueShareNode[];
  unchanged: TechniqueShareNode[];
  conflicts: ShareConflict[];
  edges: { edge: TechniqueShareEdge; state: 'new' | 'kept' }[];
};

export type ShareRead = { ok: true; file: TechniqueShareFile } | { ok: false; error: string };

export function readTechniqueShare(text: string): ShareRead {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Choose a technique share file.' };
  if (text.length > TECHNIQUE_SHARE_MAX_CHARS) return { ok: false, error: 'That file is too large to import.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a technique share file.' };
  }
  const record = asRecord(raw);
  if (!record || record.kind !== TECHNIQUE_SHARE_KIND) {
    return { ok: false, error: 'That file is not a technique share file.' };
  }
  if (record.version !== TECHNIQUE_SHARE_VERSION) {
    return { ok: false, error: 'This technique share file is a different version.' };
  }
  const name = cleanShareText(record.name, 80);
  if (!name) return { ok: false, error: 'The share file needs a name.' };
  if (!Array.isArray(record.nodes) || record.nodes.length > 200) {
    return { ok: false, error: 'The share file has no usable techniques.' };
  }
  if (record.edges !== undefined && !Array.isArray(record.edges)) {
    return { ok: false, error: 'The share file steps are not readable.' };
  }
  const nodes: TechniqueShareNode[] = [];
  const seen = new Set<string>();
  for (const item of record.nodes) {
    const row = asRecord(item);
    if (!row || !isShareId(row.shareId)) return { ok: false, error: 'A technique in that file has no stable id.' };
    if (seen.has(row.shareId)) return { ok: false, error: 'That file repeats a technique id.' };
    const title = cleanShareText(row.title, PROGRESS_NAME_MAX);
    if (!title) return { ok: false, error: 'A technique in that file has no title.' };
    if (UNSAFE.test(title)) return { ok: false, error: 'That file contains an unsafe link and was not imported.' };
    seen.add(row.shareId);
    nodes.push({ shareId: row.shareId, title, kind: row.kind === 'position' ? 'position' : 'technique' });
  }
  if (!nodes.length) return { ok: false, error: 'The share file has no usable techniques.' };
  const edges: TechniqueShareEdge[] = [];
  const edgeIds = new Set<string>();
  const list = Array.isArray(record.edges) ? record.edges : [];
  if (list.length > 400) return { ok: false, error: 'That file has too many steps.' };
  for (const item of list) {
    const row = asRecord(item);
    if (!row || !isShareId(row.shareId) || !isShareId(row.fromId) || !isShareId(row.toId)) {
      return { ok: false, error: 'A step in that file is not readable.' };
    }
    if (row.fromId === row.toId || !seen.has(row.fromId) || !seen.has(row.toId) || edgeIds.has(row.shareId)) {
      return { ok: false, error: 'A step in that file does not connect two techniques.' };
    }
    const relation: WorkingRelation = row.relation === 'defense' || row.relation === 'follow' ? row.relation : 'branch';
    const label = cleanShareText(row.label, PROGRESS_NAME_MAX);
    if (UNSAFE.test(label)) return { ok: false, error: 'That file contains an unsafe link and was not imported.' };
    edgeIds.add(row.shareId);
    edges.push({ shareId: row.shareId, fromId: row.fromId, toId: row.toId, relation, label });
  }
  return { ok: true, file: { kind: TECHNIQUE_SHARE_KIND, version: TECHNIQUE_SHARE_VERSION, name, nodes, edges } };
}

export function writeTechniqueShare(file: TechniqueShareFile): string {
  return JSON.stringify(file);
}

function cleanShareText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function isShareId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

function stableShareId(raw: string, salt: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '');
  if (cleaned && /^[A-Za-z0-9]/.test(cleaned) && cleaned.length <= 80) return cleaned;
  let hash = 2166136261;
  const source = `${salt}:${raw}`;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `s${(hash >>> 0).toString(16)}${salt}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 80);
}

function nodeShareId(node: WorkingNode): string {
  return node.shareId || node.id;
}

function knowsShareId(node: WorkingNode, shareId: string): boolean {
  return node.shareId === shareId || node.id === shareId || (node.aliases ?? []).includes(shareId);
}

/** Student export. Notes and fundamentals membership stay on this phone. */
export function shareFromWorking(graph: WorkingGraph, name: string): TechniqueShareFile {
  const nodes = graph.nodes.map((node) => ({
    shareId: nodeShareId(node),
    title: node.title,
    kind: node.kind,
  }));
  const ids = new Set(nodes.map((node) => node.shareId));
  const edges = graph.edges.flatMap((edge) => {
    const from = graph.nodes.find((node) => node.id === edge.fromId);
    const to = graph.nodes.find((node) => node.id === edge.toId);
    if (!from || !to) return [];
    const fromId = nodeShareId(from);
    const toId = nodeShareId(to);
    if (!ids.has(fromId) || !ids.has(toId)) return [];
    return [
      {
        shareId: edge.id,
        fromId,
        toId,
        relation: edge.relation,
        label: edge.label,
      },
    ];
  });
  return {
    kind: TECHNIQUE_SHARE_KIND,
    version: TECHNIQUE_SHARE_VERSION,
    name: cleanShareText(name, 80) || 'Technique tree',
    nodes,
    edges,
  };
}

/** Coach export. Nested steps become edges. Notes stay on this phone. */
export function shareFromCoachTree(doc: TechniqueTreeDoc): TechniqueShareFile {
  const nodes: TechniqueShareNode[] = [];
  const edges: TechniqueShareEdge[] = [];
  const walk = (node: TechniqueNode, parentShareId: string | null) => {
    const shareId = stableShareId(node.slotId, 'c');
    const title = node.title.trim().replace(/\s+/g, ' ').slice(0, PROGRESS_NAME_MAX) || 'Untitled';
    nodes.push({
      shareId,
      title,
      kind: node.kind === 'root' ? 'position' : 'technique',
    });
    if (parentShareId) {
      edges.push({
        shareId: stableShareId(`${parentShareId}>${shareId}:${node.kind}`, 'e'),
        fromId: parentShareId,
        toId: shareId,
        relation: node.kind === 'defense' ? 'defense' : 'branch',
        label: '',
      });
    }
    for (const child of node.children) walk(child, shareId);
  };
  if (doc.root) walk(doc.root, null);
  for (const link of doc.links ?? []) {
    edges.push({
      shareId: stableShareId(link.id, 'l'),
      fromId: stableShareId(link.fromSlotId, 'c'),
      toId: stableShareId(link.toSlotId, 'c'),
      relation: link.relation,
      label: link.label,
    });
  }
  return {
    kind: TECHNIQUE_SHARE_KIND,
    version: TECHNIQUE_SHARE_VERSION,
    name: cleanShareText(doc.name, 80) || 'Technique tree',
    nodes,
    edges,
  };
}

export function previewWorkingImport(graph: WorkingGraph, file: TechniqueShareFile): SharePreview {
  const add: TechniqueShareNode[] = [];
  const unchanged: TechniqueShareNode[] = [];
  const conflicts: ShareConflict[] = [];
  for (const node of file.nodes) {
    const byId = graph.nodes.find((item) => knowsShareId(item, node.shareId));
    if (byId) {
      if (byId.title !== node.title) {
        conflicts.push({
          shareId: node.shareId,
          title: node.title,
          localTitle: byId.title,
          kind: 'title',
          localShareId: nodeShareId(byId),
        });
      } else unchanged.push(node);
      continue;
    }
    const byTitle = findWorkingByTitle(graph, node.title);
    if (byTitle && !knowsShareId(byTitle, node.shareId)) {
      conflicts.push({
        shareId: node.shareId,
        title: node.title,
        localTitle: byTitle.title,
        kind: 'exact-title',
        localShareId: nodeShareId(byTitle),
      });
      continue;
    }
    add.push(node);
  }
  const edges = file.edges.map((edge) => ({
    edge,
    state: graph.edges.some((item) => item.id === edge.shareId) ? ('kept' as const) : ('new' as const),
  }));
  return { ok: true, file, add, unchanged, conflicts, edges };
}

function choiceFor(choices: ReadonlyMap<string, ShareChoice>, shareId: string, fallback: ShareChoice): ShareChoice {
  return choices.get(shareId) ?? fallback;
}

/** Apply an accepted share onto the student graph. Does not touch checklist levels or notes. */
export function applyWorkingImport(
  graph: WorkingGraph,
  file: TechniqueShareFile,
  choices: ReadonlyMap<string, ShareChoice> = new Map(),
  now = Date.now(),
): WorkingGraph {
  const preview = previewWorkingImport(graph, file);
  let nodes: WorkingNode[] = graph.nodes.map((node) => ({ ...node }));
  const remember = (node: WorkingNode, shareId: string): WorkingNode => {
    if (knowsShareId(node, shareId)) return node;
    const aliases = [...(node.aliases ?? []), shareId].slice(0, 8);
    return { ...node, aliases };
  };
  for (const conflict of preview.conflicts) {
    const choice = choiceFor(choices, conflict.shareId, conflict.kind === 'title' ? 'keep' : 'skip');
    if (conflict.kind === 'title') {
      if (choice === 'take') {
        nodes = nodes.map((node) =>
          knowsShareId(node, conflict.shareId) ? { ...node, title: conflict.title, updatedAt: now } : node,
        );
      }
      continue;
    }
    if (choice === 'use-local') {
      nodes = nodes.map((node) => (nodeShareId(node) === conflict.localShareId ? remember(node, conflict.shareId) : node));
    }
  }
  for (const node of preview.add) {
    if (nodes.some((item) => knowsShareId(item, node.shareId))) continue;
    const id = nodes.some((item) => item.id === node.shareId) ? `w${node.shareId}`.slice(0, 80) : node.shareId;
    nodes.push({
      id,
      shareId: node.shareId,
      title: node.title,
      notes: '',
      kind: node.kind,
      fundamentalId: '',
      createdAt: now,
      updatedAt: now,
    });
  }
  const idFor = (shareId: string): string | null => nodes.find((node) => knowsShareId(node, shareId))?.id ?? null;
  let edges = [...graph.edges];
  for (const edge of file.edges) {
    if (edges.some((item) => item.id === edge.shareId)) continue;
    const fromId = idFor(edge.fromId);
    const toId = idFor(edge.toId);
    if (!fromId || !toId || fromId === toId) continue;
    if (edges.some((item) => item.fromId === fromId && item.toId === toId && item.relation === edge.relation)) continue;
    edges.push({
      id: edge.shareId,
      fromId,
      toId,
      relation: edge.relation,
      label: edge.label,
    });
  }
  return { nodes, edges };
}

function flattenCoach(node: TechniqueNode | null, into: Map<string, TechniqueNode> = new Map()): Map<string, TechniqueNode> {
  if (!node) return into;
  into.set(stableShareId(node.slotId, 'c'), node);
  for (const child of node.children) flattenCoach(child, into);
  return into;
}

function cloneCoach(node: TechniqueNode): TechniqueNode {
  return { ...node, children: node.children.map(cloneCoach) };
}

function findCoachSlot(node: TechniqueNode | null, slotId: string): TechniqueNode | null {
  if (!node) return null;
  if (node.slotId === slotId) return node;
  for (const child of node.children) {
    const found = findCoachSlot(child, slotId);
    if (found) return found;
  }
  return null;
}

/**
 * Add the share onto the coach tree. Local steps, notes, and nodes that are
 * not in the file stay. Follow-ups and returns become links instead of copies.
 */
export function applyCoachImport(
  doc: TechniqueTreeDoc,
  file: TechniqueShareFile,
  choices: ReadonlyMap<string, ShareChoice> = new Map(),
): TechniqueTreeDoc {
  const existing = flattenCoach(doc.root);
  const redirect = new Map<string, string>();
  const added = new Set<string>();
  const titleUpdates = new Map<string, string>();
  for (const node of file.nodes) {
    const local = existing.get(node.shareId);
    if (local) {
      if (choiceFor(choices, node.shareId, 'keep') === 'take' && local.title !== node.title) {
        titleUpdates.set(local.slotId, node.title.slice(0, TITLE_MAX));
      }
      continue;
    }
    const same = [...existing.values()].find((item) => workingTitleKey(item.title) === workingTitleKey(node.title));
    if (same) {
      if (choiceFor(choices, node.shareId, 'skip') === 'use-local') {
        redirect.set(node.shareId, stableShareId(same.slotId, 'c'));
      }
      continue;
    }
    added.add(node.shareId);
  }
  const resolveShare = (id: string) => redirect.get(id) ?? id;
  const slotForShare = (shareId: string): string | null => {
    const key = resolveShare(shareId);
    const local = existing.get(key);
    if (local) return local.slotId;
    if (added.has(key)) return key;
    return null;
  };

  let root = doc.root ? cloneCoach(doc.root) : null;
  if (root) {
    const applyTitles = (node: TechniqueNode) => {
      const next = titleUpdates.get(node.slotId);
      if (next) node.title = next;
      node.children.forEach(applyTitles);
    };
    applyTitles(root);
  }

  const fresh = new Map<string, TechniqueNode>();
  for (const shareId of added) {
    const incoming = file.nodes.find((node) => node.shareId === shareId);
    if (!incoming) continue;
    fresh.set(shareId, {
      id: `node-${shareId}`.slice(0, 80),
      slotId: shareId,
      kind: 'branch',
      title: incoming.title.slice(0, TITLE_MAX),
      notes: '',
      collapsed: false,
      children: [],
    });
  }

  if (!root) {
    const incomingCount = new Map<string, number>();
    for (const edge of file.edges) {
      if (edge.relation === 'follow') continue;
      const to = resolveShare(edge.toId);
      if (!added.has(to)) continue;
      incomingCount.set(to, (incomingCount.get(to) ?? 0) + 1);
    }
    const rootId =
      file.nodes.find((node) => node.kind === 'position' && added.has(node.shareId) && !incomingCount.get(node.shareId))?.shareId ??
      [...added].find((id) => !incomingCount.get(id)) ??
      [...added][0];
    if (!rootId) return doc;
    const node = fresh.get(rootId);
    if (!node) return doc;
    node.kind = 'root';
    root = node;
    fresh.delete(rootId);
  }

  const parentOf = new Map<string, string>();
  const indexParents = (node: TechniqueNode, parent: string | null) => {
    if (parent) parentOf.set(node.slotId, parent);
    node.children.forEach((child) => indexParents(child, node.slotId));
  };
  indexParents(root, null);

  const wouldCycle = (fromSlot: string, toSlot: string): boolean => {
    let cursor: string | undefined = fromSlot;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === toSlot) return true;
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
    return false;
  };

  const links: TechniqueTreeLink[] = [...(doc.links ?? [])];
  const linkIds = new Set(links.map((link) => link.id));
  const placeEdge = (edge: TechniqueShareEdge): 'done' | 'wait' | 'drop' => {
    const fromSlot = slotForShare(edge.fromId);
    const toSlot = slotForShare(edge.toId);
    if (!fromSlot || !toSlot || fromSlot === toSlot) return 'drop';
    const fromNode = findCoachSlot(root, fromSlot);
    if (!fromNode) return fresh.has(resolveShare(edge.fromId)) ? 'wait' : 'drop';
    const toKey = resolveShare(edge.toId);
    const toNode = findCoachSlot(root, toSlot) ?? fresh.get(toKey) ?? null;
    if (!toNode) return 'drop';
    const alreadyChild = fromNode.children.some((child) => child.slotId === toSlot);
    const alreadyLinked = links.some(
      (link) => link.fromSlotId === fromSlot && link.toSlotId === toSlot && link.relation === edge.relation,
    );
    const canNest =
      edge.relation !== 'follow' &&
      toSlot !== root.slotId &&
      !parentOf.has(toSlot) &&
      !wouldCycle(fromSlot, toSlot) &&
      !alreadyChild;
    if (canNest) {
      toNode.kind = edge.relation === 'defense' ? 'defense' : 'branch';
      if (!alreadyChild) fromNode.children.push(toNode);
      parentOf.set(toSlot, fromSlot);
      fresh.delete(toKey);
      return 'done';
    }
    if (alreadyChild || alreadyLinked || linkIds.has(edge.shareId)) return 'done';
    linkIds.add(edge.shareId);
    links.push({
      id: edge.shareId,
      fromSlotId: fromSlot,
      toSlotId: toSlot,
      relation: edge.relation,
      label: edge.label.slice(0, TITLE_MAX),
    });
    return 'done';
  };
  let pending = [...file.edges];
  let guard = pending.length + 1;
  while (pending.length && guard > 0) {
    guard -= 1;
    const waiting: TechniqueShareEdge[] = [];
    let progressed = false;
    for (const edge of pending) {
      const result = placeEdge(edge);
      if (result === 'wait') waiting.push(edge);
      else progressed = true;
    }
    if (!progressed) {
      for (const edge of waiting) {
        const fromSlot = slotForShare(edge.fromId);
        const toSlot = slotForShare(edge.toId);
        if (!fromSlot || !toSlot || linkIds.has(edge.shareId)) continue;
        linkIds.add(edge.shareId);
        links.push({
          id: edge.shareId,
          fromSlotId: fromSlot,
          toSlotId: toSlot,
          relation: edge.relation,
          label: edge.label.slice(0, TITLE_MAX),
        });
      }
      break;
    }
    pending = waiting;
  }
  for (const node of fresh.values()) {
    if (findCoachSlot(root, node.slotId)) continue;
    node.kind = 'branch';
    root.children.push(node);
  }
  const next: TechniqueTreeDoc = { ...doc, root };
  if (links.length) next.links = links;
  else delete next.links;
  return next;
}

export function techniqueShareFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'technique-tree';
  return `advantage-technique-${slug}.json`;
}

export function downloadTechniqueShare(file: TechniqueShareFile): void {
  const blob = new Blob([writeTechniqueShare(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = techniqueShareFilename(file.name);
  link.click();
  URL.revokeObjectURL(url);
}

/** Preview a coach import using the same identity rules as the student graph. */
export function previewCoachImport(doc: TechniqueTreeDoc, file: TechniqueShareFile): SharePreview {
  const local = shareFromCoachTree(doc);
  const graph: WorkingGraph = {
    nodes: local.nodes.map((node) => ({
      id: node.shareId,
      shareId: node.shareId,
      title: node.title,
      notes: '',
      kind: node.kind,
      fundamentalId: '',
      createdAt: 0,
      updatedAt: 0,
    })),
    edges: local.edges.map((edge) => ({
      id: edge.shareId,
      fromId: edge.fromId,
      toId: edge.toId,
      relation: edge.relation,
      label: edge.label,
    })),
  };
  return previewWorkingImport(graph, file);
}

export function workingImportBlocked(storage: Pick<Storage, 'getItem'> | null): string {
  if (storage && parentGateOn(storage)) return 'Waiting for a parent to approve.';
  return '';
}

export function emptyShareGraph(): WorkingGraph {
  return emptyWorkingGraph();
}
