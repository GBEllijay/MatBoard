/**
 * Preview fixture for the technique cloud.
 * This is not the canonical fundamentals module. A separate fundamentals change
 * owns the eight axes. This file reuses a starter-catalog id only when that
 * catalog already names the same technique. New ids start with `req.`.
 *
 * One id is one node. Back control, X-guard, and Knee bar are shared by every
 * branch that names them. They are not copied.
 *
 * When that fundamentals change lands, reconcile by id, not by copying nodes:
 * - req.recover-guard-side is not escape.side-control.
 * - req.armbar, req.armbar-guard, and req.armbar-back are three nodes.
 * - req.kneebar, req.x-guard, req.calf-slicer, req.toe-hold, req.heel-hook,
 *   req.elevator-sweep, and req.double-lapel have no starter-catalog id yet.
 * - Conditioning and Mindset stay personal. This fixture adds none of them.
 * - Submission defense is only Escapes/Defense.
 */

import type { WorkingGraph, WorkingNode, WorkingRelation } from '../../lib/progress/types.ts';
import type { CloudPreview, CloudTechnique } from './model.ts';

export const SUGGESTED_HEADING = 'Suggested minimum technical requirements';

export const SUGGESTED_NOTE =
  'Suggested minimum technical requirements. These are suggestions, not a curriculum or a promotion mandate. Custom benchmarks stay yours. Nothing is marked learned.';

export type SuggestedAxis =
  | 'guard-control'
  | 'passing'
  | 'sweeps'
  | 'takedowns'
  | 'escapes-defense'
  | 'submissions';

export type SuggestedBelt = 'white' | 'blue' | 'purple' | 'brown';
export type SuggestedRole = 'requirement' | 'choice' | 'extension' | 'transition';

export type SuggestedItem = {
  id: string;
  title: string;
  belt: SuggestedBelt;
  axis: SuggestedAxis;
  role: SuggestedRole;
  kind: 'position' | 'technique';
  requirementKey: string;
  catalogId: string | null;
};

type Link = { fromId: string; toId: string; relation: WorkingRelation };

const STAMP = 1;

function item(
  id: string,
  title: string,
  belt: SuggestedBelt,
  axis: SuggestedAxis,
  role: SuggestedRole,
  kind: SuggestedItem['kind'],
  requirementKey = id,
  catalogId: string | null = null,
): SuggestedItem {
  return { id, title, belt, axis, role, kind, requirementKey, catalogId };
}

/** Eighteen suggestion nodes, then the choices, transitions, and extensions. */
export function suggestedItems(): SuggestedItem[] {
  return [
    item('pos.closed-guard', 'Closed guard', 'white', 'guard-control', 'requirement', 'position', 'pos.closed-guard', 'pos.closed-guard'),
    item('pos.side-control', 'Side control', 'white', 'guard-control', 'requirement', 'position', 'pos.side-control', 'pos.side-control'),
    item('pos.mount', 'Mount', 'white', 'guard-control', 'requirement', 'position', 'pos.mount', 'pos.mount'),
    item('pos.back-control', 'Back control', 'white', 'guard-control', 'requirement', 'position', 'pos.back-control', 'pos.back-control'),
    item('escape.back', 'Escape back control', 'white', 'escapes-defense', 'requirement', 'technique', 'escape.back', 'escape.back'),
    item('req.recover-guard-side', 'Recover guard from side control', 'white', 'escapes-defense', 'requirement', 'technique'),
    item('sweep.scissor', 'Scissor sweep', 'white', 'sweeps', 'requirement', 'technique', 'sweep.scissor', 'sweep.scissor'),
    item('req.hold-positions', 'Hold mount, side control, and back', 'white', 'guard-control', 'requirement', 'technique'),
    item('req.submission-mount', 'Submission from mount', 'white', 'submissions', 'requirement', 'technique'),
    item('req.mount-side-finishes', 'Mount and side control with connected finishes', 'blue', 'submissions', 'requirement', 'technique'),
    item('req.back-finish', 'Take, keep, and finish the back against resistance', 'blue', 'submissions', 'requirement', 'technique'),
    item('sweep.pendulum', 'Pendulum sweep', 'blue', 'sweeps', 'requirement', 'technique', 'sweep.pendulum', 'sweep.pendulum'),
    item('req.technical-mount', 'Technical mount and mount transitions', 'purple', 'guard-control', 'requirement', 'technique'),
    item('req.deep-half', 'Deep half guard', 'purple', 'guard-control', 'requirement', 'position'),
    item('req.s-mount-armbar', 'S-mount armbar', 'purple', 'submissions', 'requirement', 'technique'),
    item('req.x-guard', 'X-guard', 'brown', 'guard-control', 'requirement', 'position'),
    item('req.kneebar', 'Knee bar', 'brown', 'submissions', 'requirement', 'technique'),
    item('req.fifty-fifty', '50/50', 'brown', 'guard-control', 'requirement', 'position'),
    item('sub.americana', 'Americana', 'white', 'submissions', 'choice', 'technique', 'req.submission-mount', 'sub.americana'),
    item('req.armbar', 'Armbar', 'white', 'submissions', 'choice', 'technique', 'req.submission-mount'),
    item('req.cross-collar', 'Cross-collar choke', 'white', 'submissions', 'choice', 'technique', 'req.submission-mount'),
    item('req.collar-choke', 'Collar choke', 'blue', 'submissions', 'choice', 'technique', 'req.back-finish'),
    item('sub.rear-naked-choke', 'Rear naked choke', 'blue', 'submissions', 'choice', 'technique', 'req.back-finish', 'sub.rear-naked-choke'),
    item('req.armbar-back', 'Armbar from back', 'blue', 'submissions', 'choice', 'technique', 'req.back-finish'),
    item('req.armbar-guard', 'Armbar from the guard', 'blue', 'submissions', 'extension', 'technique'),
    item('req.double-lapel', 'Double lapel choke', 'blue', 'submissions', 'extension', 'technique'),
    item('req.maintain-mount', 'Maintain mount', 'white', 'guard-control', 'transition', 'technique'),
    item('req.maintain-side', 'Maintain side control', 'white', 'guard-control', 'transition', 'technique'),
    item('req.maintain-back', 'Maintain back control', 'white', 'guard-control', 'transition', 'technique'),
    item('req.submit-side', 'Submit from side control', 'white', 'submissions', 'transition', 'technique'),
    item('req.submit-back', 'Submit from back control', 'blue', 'submissions', 'transition', 'technique'),
    item('req.elevator-sweep', 'Elevator sweep', 'brown', 'sweeps', 'extension', 'technique'),
    item('req.calf-slicer', 'Calf slicer', 'brown', 'submissions', 'extension', 'technique'),
    item('req.toe-hold', 'Toe hold', 'brown', 'submissions', 'extension', 'technique'),
    item('req.heel-hook', 'Heel hook', 'brown', 'submissions', 'extension', 'technique'),
  ];
}

const BASELINE: Array<{ key: string; title: string }> = [
  { key: 'pos.closed-guard', title: 'Closed guard' },
  { key: 'pos.side-control', title: 'Side control' },
  { key: 'pos.mount', title: 'Mount' },
  { key: 'pos.back-control', title: 'Back control' },
  { key: 'escape.back', title: 'Escape back control' },
  { key: 'req.recover-guard-side', title: 'Recover guard from side control' },
  { key: 'sweep.scissor', title: 'Scissor sweep' },
  { key: 'req.hold-positions', title: 'Hold mount, side control, and back' },
  { key: 'req.submission-mount', title: 'Submission from mount' },
  { key: 'req.mount-side-finishes', title: 'Mount and side control with connected finishes' },
  { key: 'req.back-finish', title: 'Take, keep, and finish the back against resistance' },
  { key: 'sweep.pendulum', title: 'Pendulum sweep' },
  { key: 'req.technical-mount', title: 'Technical mount and mount transitions' },
  { key: 'req.deep-half', title: 'Deep half guard' },
  { key: 'req.s-mount-armbar', title: 'S-mount armbar' },
  { key: 'req.x-guard', title: 'X-guard' },
  { key: 'req.kneebar', title: 'Knee bar' },
  { key: 'req.fifty-fifty', title: '50/50' },
];

export function baselineRequirements(): { key: string; title: string }[] {
  return BASELINE.map((row) => ({ ...row }));
}

function link(fromId: string, toId: string, relation: WorkingRelation = 'branch'): Link {
  return { fromId, toId, relation };
}

/** Owner-chosen links. A cycle is allowed. An edge is not a promotion rule. */
export function suggestedLinks(): Link[] {
  return [
    link('req.kneebar', 'req.calf-slicer'),
    link('req.calf-slicer', 'req.toe-hold'),
    link('req.toe-hold', 'req.heel-hook'),
    link('req.fifty-fifty', 'req.kneebar'),
    link('req.kneebar', 'req.x-guard'),
    link('req.x-guard', 'req.elevator-sweep'),
    link('req.elevator-sweep', 'pos.back-control'),
    link('pos.back-control', 'sub.rear-naked-choke'),
    link('pos.back-control', 'req.double-lapel'),
    link('pos.back-control', 'req.armbar-back'),
    link('pos.back-control', 'escape.back', 'defense'),
    link('pos.closed-guard', 'sweep.scissor'),
    link('sweep.scissor', 'pos.mount'),
    link('pos.mount', 'req.hold-positions'),
    link('req.hold-positions', 'pos.mount'),
    link('req.hold-positions', 'pos.side-control'),
    link('req.hold-positions', 'pos.back-control'),
    link('pos.side-control', 'req.recover-guard-side'),
    link('pos.mount', 'sub.americana'),
    link('pos.mount', 'req.armbar'),
    link('pos.mount', 'req.cross-collar'),
    link('pos.mount', 'req.maintain-mount'),
    link('req.maintain-mount', 'req.submission-mount'),
    link('req.submission-mount', 'sub.americana'),
    link('req.submission-mount', 'req.armbar'),
    link('req.submission-mount', 'req.cross-collar'),
    link('req.maintain-mount', 'sub.americana'),
    link('req.maintain-mount', 'req.armbar'),
    link('req.maintain-mount', 'req.cross-collar'),
    link('pos.back-control', 'req.maintain-back'),
    link('req.maintain-back', 'req.submit-back'),
    link('req.submit-back', 'req.back-finish'),
    link('req.back-finish', 'req.collar-choke'),
    link('req.back-finish', 'sub.rear-naked-choke'),
    link('req.back-finish', 'req.armbar-back'),
    link('pos.side-control', 'req.maintain-side'),
    link('req.maintain-side', 'req.submit-side'),
    link('req.submit-side', 'req.mount-side-finishes'),
    link('req.submission-mount', 'req.mount-side-finishes'),
    link('sweep.pendulum', 'req.armbar'),
    link('sweep.pendulum', 'pos.mount'),
    link('sweep.pendulum', 'req.armbar-guard'),
    link('pos.mount', 'req.technical-mount'),
    link('req.technical-mount', 'req.maintain-mount'),
    link('req.technical-mount', 'sub.americana'),
    link('req.technical-mount', 'req.armbar'),
    link('req.technical-mount', 'req.cross-collar'),
    link('req.deep-half', 'req.x-guard'),
    link('req.x-guard', 'req.kneebar'),
    link('req.deep-half', 'req.kneebar'),
    link('pos.mount', 'req.s-mount-armbar'),
  ];
}

function nodeFrom(row: SuggestedItem): WorkingNode {
  const note =
    row.role === 'extension'
      ? 'Owner-chosen extension. Not an extra belt requirement. Not marked learned.'
      : row.role === 'choice'
        ? 'One choice inside a suggestion. Not marked learned.'
        : row.role === 'transition'
          ? 'Pass-through on this preview. Not an extra belt requirement. Not marked learned.'
          : `${row.belt} suggestion. Not marked learned.`;
  return {
    id: row.id,
    title: row.title,
    notes: note,
    kind: row.kind,
    fundamentalId: row.catalogId ?? row.id,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

export function suggestedGraph(): WorkingGraph {
  const rows = suggestedItems();
  const nodes = rows.map(nodeFrom);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = suggestedLinks()
    .filter((row) => ids.has(row.fromId) && ids.has(row.toId) && row.fromId !== row.toId)
    .map((row) => ({
      id: `req.edge.${row.fromId}.${row.toId}.${row.relation}`,
      fromId: row.fromId,
      toId: row.toId,
      relation: row.relation,
      label: '',
    }));
  return { nodes, edges };
}

export function brownRequirements(): { key: string; title: string }[] {
  return baselineRequirements().filter((row) => ['req.x-guard', 'req.kneebar', 'req.fifty-fifty'].includes(row.key));
}

export function legLockChain(): Array<[string, string]> {
  return [
    ['req.kneebar', 'req.calf-slicer'],
    ['req.calf-slicer', 'req.toe-hold'],
    ['req.toe-hold', 'req.heel-hook'],
  ];
}

/** True when following edges returns to a node already on the path. */
export function graphHasCycle(graph: WorkingGraph): boolean {
  const next = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = next.get(edge.fromId) ?? [];
    list.push(edge.toId);
    next.set(edge.fromId, list);
  }
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const child of next.get(id) ?? []) {
      if (visit(child)) return true;
    }
    visiting.delete(id);
    return false;
  };
  return graph.nodes.some((node) => visit(node.id));
}

function slug(title: string): string {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || 'custom';
}

/** A new preview node. Copies the graph. Does not write a student file or mark anything learned. */
export function addPreviewTechnique(
  graph: WorkingGraph,
  input: { title: string; parentId?: string },
): WorkingGraph {
  const title = input.title.trim().replace(/\s+/g, ' ');
  if (!title) return graph;
  const existing = graph.nodes.find((node) => node.title.toLowerCase() === title.toLowerCase());
  if (existing) return graph;
  const id = `req.custom.${slug(title)}`;
  if (graph.nodes.some((node) => node.id === id)) return graph;
  const node: WorkingNode = {
    id,
    title,
    notes: 'Custom benchmark on this preview. Not marked learned.',
    kind: 'technique',
    fundamentalId: id,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  const parent = input.parentId && graph.nodes.some((row) => row.id === input.parentId) ? input.parentId : '';
  const edges = parent
    ? [
        ...graph.edges,
        {
          id: `req.edge.${parent}.${id}.branch`,
          fromId: parent,
          toId: id,
          relation: 'branch' as const,
          label: '',
        },
      ]
    : graph.edges;
  return { nodes: [...graph.nodes, node], edges };
}

const PLACED: Record<string, { x: number; y: number }> = {
  'pos.closed-guard': { x: 12, y: 12 },
  'sweep.scissor': { x: 176, y: 12 },
  'pos.mount': { x: 176, y: 88 },
  'pos.side-control': { x: 12, y: 88 },
  'req.hold-positions': { x: 176, y: 164 },
  'pos.back-control': { x: 12, y: 164 },
  'escape.back': { x: 12, y: 240 },
  'req.recover-guard-side': { x: 176, y: 240 },
  'req.maintain-mount': { x: 176, y: 316 },
  'req.maintain-side': { x: 12, y: 316 },
  'req.submission-mount': { x: 176, y: 392 },
  'req.submit-side': { x: 12, y: 392 },
  'sub.americana': { x: 12, y: 468 },
  'req.armbar': { x: 176, y: 468 },
  'req.cross-collar': { x: 12, y: 544 },
  'req.armbar-guard': { x: 176, y: 544 },
  'sweep.pendulum': { x: 12, y: 620 },
  'req.technical-mount': { x: 176, y: 620 },
  'req.maintain-back': { x: 12, y: 696 },
  'req.submit-back': { x: 176, y: 696 },
  'req.back-finish': { x: 12, y: 772 },
  'req.mount-side-finishes': { x: 176, y: 772 },
  'sub.rear-naked-choke': { x: 12, y: 848 },
  'req.double-lapel': { x: 176, y: 848 },
  'req.armbar-back': { x: 12, y: 924 },
  'req.collar-choke': { x: 176, y: 924 },
  'req.s-mount-armbar': { x: 12, y: 1000 },
  'req.deep-half': { x: 176, y: 1000 },
  'req.fifty-fifty': { x: 12, y: 1076 },
  'req.kneebar': { x: 176, y: 1076 },
  'req.x-guard': { x: 12, y: 1152 },
  'req.elevator-sweep': { x: 176, y: 1152 },
  'req.calf-slicer': { x: 12, y: 1228 },
  'req.toe-hold': { x: 176, y: 1228 },
  'req.heel-hook': { x: 12, y: 1304 },
};

export function layoutSuggested(graph: WorkingGraph = suggestedGraph()): Record<string, { x: number; y: number }> {
  const points: Record<string, { x: number; y: number }> = { ...PLACED };
  const missing = graph.nodes.filter((node) => !points[node.id]);
  missing.forEach((node, index) => {
    points[node.id] = { x: 12 + (index % 2) * 164, y: 1380 + Math.floor(index / 2) * 76 };
  });
  return points;
}

export function suggestedCloud(): CloudPreview {
  const graph = suggestedGraph();
  const byId = new Map(suggestedItems().map((row) => [row.id, row]));
  const techniques: CloudTechnique[] = graph.nodes.map((node) => {
    const row = byId.get(node.id);
    return {
      id: node.id,
      title: node.title,
      notes: node.notes,
      classOrigin: row ? `${row.belt} · ${row.axis}` : '',
      videos: [],
      journalCards: [],
    };
  });
  return {
    source: 'suggested',
    techniques,
    edges: graph.edges.map((edge) => ({ id: edge.id, fromId: edge.fromId, toId: edge.toId })),
    note: SUGGESTED_NOTE,
  };
}
