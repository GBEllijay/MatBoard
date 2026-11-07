/**
 * One technique identity per student.
 * The working list and the technique tree are views of `report.working`.
 * An edge points at an existing node. It does not copy that node.
 * A cycle stops on the path that already showed the node.
 */

import { asRecord } from './plainValue.ts';
import {
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  type WorkingEdge,
  type WorkingGraph,
  type WorkingNode,
  type WorkingNodeKind,
  type WorkingRelation,
} from './progress/types.ts';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_DEPTH = 8;
const MAX_FRAMES = 48;

export const WORKING_RELATIONS: readonly { id: WorkingRelation; label: string }[] = [
  { id: 'branch', label: 'Branch' },
  { id: 'defense', label: 'Defense' },
  { id: 'follow', label: 'Follow-up' },
];

export function workingTitleKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function emptyWorkingGraph(): WorkingGraph {
  return { nodes: [], edges: [] };
}

export function readWorkingGraph(value: unknown): WorkingGraph | null {
  if (value == null) return null;
  const record = asRecord(value);
  if (!record) return emptyWorkingGraph();
  const nodes: WorkingNode[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record.nodes)) {
    for (const item of record.nodes) {
      const node = readNode(item);
      if (!node || seen.has(node.id) || nodes.length >= MAX_NODES) continue;
      seen.add(node.id);
      nodes.push(node);
    }
  }
  const edges: WorkingEdge[] = [];
  const edgeIds = new Set<string>();
  if (Array.isArray(record.edges)) {
    for (const item of record.edges) {
      const edge = readEdge(item, seen);
      if (!edge || edgeIds.has(edge.id) || edges.length >= MAX_EDGES) continue;
      if (edges.some((row) => row.fromId === edge.fromId && row.toId === edge.toId && row.relation === edge.relation)) continue;
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  }
  return { nodes, edges };
}

function readNode(value: unknown): WorkingNode | null {
  const record = asRecord(value);
  if (!record || !isId(record.id)) return null;
  const title = clip(record.title, PROGRESS_NAME_MAX);
  if (!title) return null;
  const kind: WorkingNodeKind = record.kind === 'position' ? 'position' : 'technique';
  const createdAt = timeOf(record.createdAt);
  const updatedAt = timeOf(record.updatedAt) || createdAt;
  return {
    id: record.id,
    title,
    notes: clip(record.notes, PROGRESS_NOTE_MAX),
    kind,
    fundamentalId: isId(record.fundamentalId) ? record.fundamentalId : '',
    createdAt,
    updatedAt,
  };
}

function readEdge(value: unknown, nodes: ReadonlySet<string>): WorkingEdge | null {
  const record = asRecord(value);
  if (!record || !isId(record.id) || !isId(record.fromId) || !isId(record.toId)) return null;
  if (record.fromId === record.toId) return null;
  if (!nodes.has(record.fromId) || !nodes.has(record.toId)) return null;
  const relation: WorkingRelation =
    record.relation === 'defense' || record.relation === 'follow' || record.relation === 'branch' ? record.relation : 'branch';
  return { id: record.id, fromId: record.fromId, toId: record.toId, relation, label: clip(record.label, PROGRESS_NAME_MAX) };
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function timeOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function newWorkingId(prefix: string, now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${now.toString(36)}${rand}`.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
}

export function findWorkingNode(graph: WorkingGraph, id: string): WorkingNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function findWorkingByTitle(graph: WorkingGraph, title: string): WorkingNode | null {
  const key = workingTitleKey(title);
  if (!key) return null;
  return graph.nodes.find((node) => workingTitleKey(node.title) === key) ?? null;
}

export function adoptWorkingNode(
  graph: WorkingGraph,
  input: { title: string; kind?: WorkingNodeKind; fundamentalId?: string; now?: number; id?: string },
): { graph: WorkingGraph; node: WorkingNode; created: boolean } {
  const title = clip(input.title, PROGRESS_NAME_MAX);
  if (!title) throw new Error('Type a technique name.');
  const now = input.now ?? Date.now();
  const existing = findWorkingByTitle(graph, title);
  if (existing) {
    if (input.fundamentalId && !existing.fundamentalId && isId(input.fundamentalId)) {
      const node = { ...existing, fundamentalId: input.fundamentalId, updatedAt: now };
      return { graph: replaceNode(graph, node), node, created: false };
    }
    return { graph, node: existing, created: false };
  }
  if (graph.nodes.length >= MAX_NODES) throw new Error('This list is full.');
  let id = input.id && isId(input.id) && !findWorkingNode(graph, input.id) ? input.id : newWorkingId('w', now);
  while (findWorkingNode(graph, id)) id = newWorkingId('w', now + 1);
  const node: WorkingNode = {
    id,
    title,
    notes: '',
    kind: input.kind === 'position' ? 'position' : 'technique',
    fundamentalId: input.fundamentalId && isId(input.fundamentalId) ? input.fundamentalId : '',
    createdAt: now,
    updatedAt: now,
  };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, node, created: true };
}

export function renameWorkingNode(graph: WorkingGraph, id: string, title: string, now = Date.now()): WorkingGraph {
  const node = findWorkingNode(graph, id);
  const nextTitle = clip(title, PROGRESS_NAME_MAX);
  if (!node || !nextTitle || nextTitle === node.title) return graph;
  const clash = graph.nodes.find((item) => item.id !== id && workingTitleKey(item.title) === workingTitleKey(nextTitle));
  if (clash) throw new Error(`${clash.title} is already on your list.`);
  return replaceNode(graph, { ...node, title: nextTitle, updatedAt: now });
}

export function setWorkingNotes(graph: WorkingGraph, id: string, notes: string, now = Date.now()): WorkingGraph {
  const node = findWorkingNode(graph, id);
  if (!node) return graph;
  const next = clip(notes, PROGRESS_NOTE_MAX);
  if (next === node.notes) return graph;
  return replaceNode(graph, { ...node, notes: next, updatedAt: now });
}

export function setWorkingFundamental(graph: WorkingGraph, id: string, fundamentalId: string, now = Date.now()): WorkingGraph {
  const node = findWorkingNode(graph, id);
  if (!node) return graph;
  const next = fundamentalId && isId(fundamentalId) ? fundamentalId : '';
  if (next === node.fundamentalId) return graph;
  return replaceNode(graph, { ...node, fundamentalId: next, updatedAt: now });
}

export type ConnectResult =
  | { ok: true; graph: WorkingGraph; edge: WorkingEdge; created: boolean }
  | { ok: false; reason: 'missing' | 'self' | 'full' };

/** Point one existing node at another. A repeated relation is the same edge. */
export function connectWorkingNodes(
  graph: WorkingGraph,
  input: { fromId: string; toId: string; relation: WorkingRelation; label?: string; now?: number; id?: string },
): ConnectResult {
  if (!findWorkingNode(graph, input.fromId) || !findWorkingNode(graph, input.toId)) return { ok: false, reason: 'missing' };
  if (input.fromId === input.toId) return { ok: false, reason: 'self' };
  const relation: WorkingRelation =
    input.relation === 'defense' || input.relation === 'follow' || input.relation === 'branch' ? input.relation : 'branch';
  const existing = graph.edges.find((edge) => edge.fromId === input.fromId && edge.toId === input.toId && edge.relation === relation);
  if (existing) return { ok: true, graph, edge: existing, created: false };
  if (graph.edges.length >= MAX_EDGES) return { ok: false, reason: 'full' };
  const edge: WorkingEdge = {
    id: input.id && isId(input.id) ? input.id : newWorkingId('e', input.now ?? Date.now()),
    fromId: input.fromId,
    toId: input.toId,
    relation,
    label: clip(input.label, PROGRESS_NAME_MAX),
  };
  return { ok: true, edge, created: true, graph: { ...graph, edges: [...graph.edges, edge] } };
}

export function unlinkWorkingEdge(graph: WorkingGraph, edgeId: string): WorkingGraph {
  if (!graph.edges.some((edge) => edge.id === edgeId)) return graph;
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

/** Drop one node and the steps that touch it. Other techniques stay. */
export function removeWorkingNode(graph: WorkingGraph, id: string): WorkingGraph {
  if (!findWorkingNode(graph, id)) return graph;
  return {
    nodes: graph.nodes.filter((node) => node.id !== id),
    edges: graph.edges.filter((edge) => edge.fromId !== id && edge.toId !== id),
  };
}

export type TreeStep = {
  edge: WorkingEdge;
  next: TreeFrame;
};

export type TreeFrame = {
  node: WorkingNode;
  cycle: boolean;
  truncated: boolean;
  steps: TreeStep[];
};

/** Walk out from a node. A node already on this path is a return, not another copy. */
export function treeFrom(graph: WorkingGraph, rootId: string): TreeFrame | null {
  const root = findWorkingNode(graph, rootId);
  if (!root) return null;
  const budget = { left: MAX_FRAMES };
  return frame(graph, root, [], budget);
}

function frame(graph: WorkingGraph, node: WorkingNode, path: readonly string[], budget: { left: number }): TreeFrame {
  budget.left -= 1;
  if (path.includes(node.id)) return { node, cycle: true, truncated: false, steps: [] };
  if (budget.left <= 0 || path.length >= MAX_DEPTH) return { node, cycle: false, truncated: true, steps: [] };
  const steps = graph.edges
    .filter((edge) => edge.fromId === node.id)
    .flatMap((edge) => {
      const target = findWorkingNode(graph, edge.toId);
      if (!target) return [];
      return [{ edge, next: frame(graph, target, [...path, node.id], budget) }];
    });
  return { node, cycle: false, truncated: false, steps };
}

/** Nodes a reader can start from. A loop with no outside start still shows its oldest technique. */
export function workingRoots(graph: WorkingGraph): WorkingNode[] {
  const incoming = new Set(graph.edges.map((edge) => edge.toId));
  const roots = graph.nodes.filter((node) => !incoming.has(node.id));
  const seen = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (seen.has(id) || path.includes(id)) return;
    seen.add(id);
    for (const edge of graph.edges) if (edge.fromId === id) visit(edge.toId, [...path, id]);
  };
  for (const root of roots) visit(root.id, []);
  const hidden = graph.nodes.filter((node) => !seen.has(node.id)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const node of hidden) {
    if (seen.has(node.id)) continue;
    roots.push(node);
    visit(node.id, []);
  }
  return roots;
}

export function relationLabel(relation: WorkingRelation): string {
  return WORKING_RELATIONS.find((item) => item.id === relation)?.label ?? 'Branch';
}

function replaceNode(graph: WorkingGraph, node: WorkingNode): WorkingGraph {
  return { ...graph, nodes: graph.nodes.map((item) => (item.id === node.id ? node : item)) };
}
