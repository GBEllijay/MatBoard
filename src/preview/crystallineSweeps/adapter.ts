/**
 * Read-only Sweeps proof.
 * One catalog record per move. Scores, notes, and tree links stay beside it.
 * The preview technique-tree seed is not a curriculum source.
 * Nothing in this file writes storage.
 */

import { APPROVED_FUNDAMENTALS, AXES } from '../assessmentRadar/model.ts';
import { FUNDAMENTALS_CATALOG } from '../../lib/progress/catalog.ts';
import { asRecord } from '../../lib/plainValue.ts';
import { parseProgressPacket } from '../../lib/progress/format.ts';
import type { JournalEntry, StudentChecklistEntry, StudentProgressReport, WorkingNode } from '../../lib/progress/types.ts';
import { fundamentalLevelOf, type FundamentalLevel } from '../../lib/fundamentals.ts';
import { ASSESSMENT_STORAGE_KEY, isAssessmentScore, loadAssessments, type AssessmentEntry } from '../../lib/studentAssessment.ts';
import { STUDENT_EDITION_STORAGE_KEY, viewJournalEntry } from '../../lib/studentEdition.ts';
import { MAX_TREE_DEPTH, MAX_TREE_NODES, NOTES_MAX, TECHNIQUE_TREE_STORAGE_KEY, TITLE_MAX } from '../../lib/techniqueTreeStore.ts';
import { PREVIEW_STORAGE_KEY } from '../../lib/techniqueTreePreview.ts';
import { techniqueNodePath } from '../../lib/gamePlan.ts';
import { readWorkingGraph, workingTitleKey } from '../../lib/workingTechniques.ts';
import { LAYOUT_REVISION, type ReliefScore } from './geometry.ts';

export const CRYSTAL_PREVIEW_PATH = '/preview/crystalline-sweeps';

export const PREVIEW_BANNER =
  'Preview only. Nothing on this page is written to a student record, a check-in, or a technique tree.';

export const EXAMPLE_NOTE =
  'Tile height is temporary example data so every level can be seen. It is not this device’s checklist and not the Sweeps factor.';

/**
 * Fixed example relief, one of each level and one unrated move.
 * Keyed by catalog id so a reorder of the list does not renumber a move.
 */
export const EXAMPLE_RELIEF = {
  'sweep.scissor': 1,
  'sweep.hip-bump': 2,
  'sweep.pendulum': 3,
  'sweep.flower': 4,
  'sweep.tripod': 5,
  'sweep.butterfly': null,
} as const satisfies Record<string, ReliefScore | null>;

export type ScoreSource = 'absent' | 'not-started' | 'checklist-level';

export type CoachHit = {
  treeId: string;
  treeName: string;
  nodeId: string;
  title: string;
  notes: string;
  /** Actual ancestor titles, root first. Empty when this node is the root. */
  ancestors: string[];
  /** Actual child titles. Empty when the saved node has no steps. */
  children: string[];
  /** Saved links that name this node's slot. Empty when there are none. */
  links: string[];
  href: string;
};

export type WorkingHit = {
  nodeId: string;
  title: string;
  notes: string;
  /** Edges that already point at this node. */
  links: { relation: string; otherTitle: string }[];
  href: string;
};

export type CardHit = {
  cardId: string;
  date: string;
  note: string;
  href: string;
};

export type MoveRecord = {
  id: string;
  name: string;
  categoryId: 'sweeps';
  axisId: 'sweeps';
  /** Catalog example strings. This catalog leaves them empty, so there is no variation row. */
  variations: readonly string[];
  score: ReliefScore | null;
  scoreSource: ScoreSource;
  checklistNote: string;
  coachNodes: CoachHit[];
  workingNodes: WorkingHit[];
  cards: CardHit[];
};

export type FactorReading = {
  value: ReliefScore | null;
  date: string | null;
  entryId: string | null;
  /** True only when the saved check-in has its own Sweeps field. */
  fieldPresent: boolean;
  detail: string;
};

export type SweepsProof = {
  catalogItemCount: number;
  sweepsInCatalog: number;
  sweepsMapped: number;
  layoutRevision: typeof LAYOUT_REVISION;
  about: string;
  factor: FactorReading;
  moves: MoveRecord[];
  /** Saved coach-tree nodes whose title is Sweeps. Not the preview seed. */
  categoryNodes: CoachHit[];
  fundamentalsHref: string;
  /** True when a stored tree was deeper than the product cap and was not invented past it. */
  treeTruncated: boolean;
};

type Store = { getItem(key: string): string | null };

type RawNode = {
  id: string;
  slotId: string;
  title: string;
  notes: string;
  children: RawNode[];
};

type RawTree = {
  id: string;
  name: string;
  root: RawNode | null;
  links: { fromSlotId: string; toSlotId: string; relation: string; label: string }[];
};

const SWEEP_AXIS = 'sweeps' as const;

export function catalogItemCount(): number {
  return FUNDAMENTALS_CATALOG.categories.reduce((sum, category) => sum + category.items.length, 0);
}

export function tileRelief(mode: 'example' | 'saved', move: Pick<MoveRecord, 'id' | 'score'>): ReliefScore | null {
  if (mode === 'example') {
    const sample = EXAMPLE_RELIEF[move.id as keyof typeof EXAMPLE_RELIEF];
    return sample === undefined ? null : sample;
  }
  return move.score;
}

export function reliefWord(score: ReliefScore | null): string {
  if (score === 1) return 'Deep inward';
  if (score === 2) return 'Shallow inward';
  if (score === 3) return 'Flat';
  if (score === 4) return 'Raised';
  if (score === 5) return 'Tall outward';
  return 'Not rated';
}

export function readSweepsProof(store: Store, search = ''): SweepsProof {
  const catalog = FUNDAMENTALS_CATALOG.categories.find((category) => category.id === 'sweeps');
  const items = catalog?.items ?? [];
  const mapped = new Set<string>(
    APPROVED_FUNDAMENTALS.filter((row) => row.axis === SWEEP_AXIS).map((row) => row.id),
  );
  const moves = items.filter((item) => mapped.has(item.id));
  const report = readReport(store);
  const trees = readCoachTrees(store);
  const graph = report ? readWorkingGraph(report.working) : null;
  const entries = report?.journal ?? [];
  const truncated = trees.truncated;
  const categoryNodes = trees.trees.flatMap((tree) =>
    collect(tree)
      .filter((hit) => workingTitleKey(hit.node.title) === 'sweeps')
      .map((hit) => coachHit(tree, hit.node, hit.ancestors, search)),
  );
  return {
    catalogItemCount: catalogItemCount(),
    sweepsInCatalog: items.length,
    sweepsMapped: moves.length,
    layoutRevision: LAYOUT_REVISION,
    about: AXES.find((axis) => axis.id === SWEEP_AXIS)?.meaning ?? '',
    factor: readFactor(store),
    moves: moves.map((item) => {
      const checklist = report?.checklist.find(
        (entry) => entry.categoryId === 'sweeps' && entry.catalogItemId === item.id,
      );
      const scored = scoreOf(checklist);
      const workingNodes = (graph?.nodes ?? []).filter(
        (node) => node.fundamentalId === item.id || (checklist ? node.fundamentalId === checklist.id : false),
      );
      return {
        id: item.id,
        name: item.name,
        categoryId: 'sweeps',
        axisId: 'sweeps',
        variations: item.examples,
        score: scored.score,
        scoreSource: scored.source,
        checklistNote: checklist?.note.trim() ?? '',
        coachNodes: trees.trees.flatMap((tree) =>
          collect(tree)
            .filter((hit) => workingTitleKey(hit.node.title) === workingTitleKey(item.name))
            .map((hit) => coachHit(tree, hit.node, hit.ancestors, search)),
        ),
        workingNodes: workingNodes.map((node) => workingHit(node, graph?.nodes ?? [], graph?.edges ?? [], search)),
        cards: matchingCards(entries, item.id, checklist?.id ?? '', new Set(workingNodes.map((node) => node.id)), search),
      };
    }),
    categoryNodes,
    fundamentalsHref: withStudent('/student/fundamentals', search),
    treeTruncated: truncated,
  };
}

function scoreOf(entry: StudentChecklistEntry | undefined): { score: ReliefScore | null; source: ScoreSource } {
  if (!entry) return { score: null, source: 'absent' };
  const level = fundamentalLevelOf(entry);
  if (level === 0) return { score: null, source: 'not-started' };
  return { score: level as Exclude<FundamentalLevel, 0>, source: 'checklist-level' };
}

function readFactor(store: Store): FactorReading {
  const state = loadAssessments(store);
  const latest = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).at(-1);
  if (!latest) {
    return {
      value: null,
      date: null,
      entryId: null,
      fieldPresent: false,
      detail: 'No saved self-assessment on this device. Sweeps is not rated. That is not a score of 0 or 3.',
    };
  }
  return factorFromEntry(latest);
}

function factorFromEntry(entry: AssessmentEntry): FactorReading {
  const value = isAssessmentScore(entry.scores.sweeps) ? entry.scores.sweeps : null;
  if (value == null) {
    return {
      value: null,
      date: entry.date,
      entryId: entry.id,
      fieldPresent: false,
      detail: `Check-in ${entry.date} has no Sweeps field. Sweeps stays not rated. It is not copied from another area.`,
    };
  }
  return {
    value,
    date: entry.date,
    entryId: entry.id,
    fieldPresent: true,
    detail: `Check-in ${entry.date} stored Sweeps as ${value}. Move tiles do not reuse this number.`,
  };
}

function readReport(store: Store): StudentProgressReport | null {
  const raw = store.getItem(STUDENT_EDITION_STORAGE_KEY);
  if (!raw) return null;
  const parsed = parseProgressPacket(raw);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return null;
  return parsed.value;
}

function readCoachTrees(store: Store): { trees: RawTree[]; truncated: boolean } {
  const raw = store.getItem(TECHNIQUE_TREE_STORAGE_KEY);
  if (!raw || !raw.trim()) return { trees: [], truncated: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { trees: [], truncated: false };
  }
  const record = asRecord(parsed);
  if (!record || !Array.isArray(record.trees)) return { trees: [], truncated: false };
  let truncated = false;
  const trees: RawTree[] = [];
  for (const item of record.trees) {
    const tree = readTree(item);
    if (!tree) continue;
    if (tree.truncated) truncated = true;
    trees.push(tree.tree);
  }
  return { trees, truncated };
}

function readTree(value: unknown): { tree: RawTree; truncated: boolean } | null {
  const record = asRecord(value);
  if (!record || !textId(record.id)) return null;
  let truncated = false;
  let count = 0;
  const readNode = (node: unknown, depth: number): RawNode | null => {
    if (depth > MAX_TREE_DEPTH || count >= MAX_TREE_NODES) {
      truncated = true;
      return null;
    }
    const row = asRecord(node);
    if (!row || !textId(row.id)) return null;
    count += 1;
    const children: RawNode[] = [];
    if (Array.isArray(row.children)) {
      for (const child of row.children) {
        const next = readNode(child, depth + 1);
        if (next) children.push(next);
      }
    }
    return {
      id: row.id,
      slotId: textId(row.slotId) ? row.slotId : '',
      title: clip(row.title, TITLE_MAX),
      notes: clip(row.notes, NOTES_MAX),
      children,
    };
  };
  const links: RawTree['links'] = [];
  if (Array.isArray(record.links)) {
    for (const link of record.links) {
      const row = asRecord(link);
      if (!row || !textId(row.fromSlotId) || !textId(row.toSlotId)) continue;
      links.push({
        fromSlotId: row.fromSlotId,
        toSlotId: row.toSlotId,
        relation: clip(row.relation, 40),
        label: clip(row.label, TITLE_MAX),
      });
    }
  }
  return {
    tree: {
      id: record.id,
      name: clip(record.name, 80) || 'Technique Tree',
      root: readNode(record.root, 0),
      links,
    },
    truncated,
  };
}

function collect(tree: RawTree): { node: RawNode; ancestors: RawNode[] }[] {
  const rows: { node: RawNode; ancestors: RawNode[] }[] = [];
  const walk = (node: RawNode, ancestors: RawNode[]) => {
    rows.push({ node, ancestors });
    for (const child of node.children) walk(child, [...ancestors, node]);
  };
  if (tree.root) walk(tree.root, []);
  return rows;
}

function coachHit(tree: RawTree, node: RawNode, ancestors: RawNode[], _search: string): CoachHit {
  const bySlot = new Map<string, string>();
  for (const row of collect(tree)) if (row.node.slotId) bySlot.set(row.node.slotId, row.node.title);
  const extra = tree.links
    .filter((link) => link.fromSlotId === node.slotId || link.toSlotId === node.slotId)
    .map((link) => {
      const other = link.fromSlotId === node.slotId ? bySlot.get(link.toSlotId) : bySlot.get(link.fromSlotId);
      const name = other || link.label || 'Linked step';
      return link.relation ? `${link.relation}: ${name}` : name;
    });
  return {
    treeId: tree.id,
    treeName: tree.name,
    nodeId: node.id,
    title: node.title,
    notes: node.notes.trim(),
    ancestors: ancestors.map((item) => item.title).filter((title) => title.trim()),
    children: node.children.map((child) => child.title).filter((title) => title.trim()),
    links: extra,
    href: techniqueNodePath(tree.id, node.id),
  };
}

function workingHit(
  node: WorkingNode,
  nodes: readonly WorkingNode[],
  edges: readonly { fromId: string; toId: string; relation: string }[],
  search: string,
): WorkingHit {
  const titleOf = (id: string) => nodes.find((item) => item.id === id)?.title ?? 'Missing step';
  const links = edges
    .filter((edge) => edge.fromId === node.id || edge.toId === node.id)
    .map((edge) => ({
      relation: edge.relation,
      otherTitle: titleOf(edge.fromId === node.id ? edge.toId : edge.fromId),
    }));
  return {
    nodeId: node.id,
    title: node.title,
    notes: node.notes.trim(),
    links,
    href: withStudent(`/student/working?view=tree&node=${encodeURIComponent(node.id)}`, search),
  };
}

function matchingCards(
  journal: readonly JournalEntry[],
  catalogId: string,
  checklistId: string,
  workingIds: ReadonlySet<string>,
  search: string,
): CardHit[] {
  const hits: CardHit[] = [];
  for (const entry of journal) {
    const match = entry.techniqueRefs.find(
      (ref) => ref.id === catalogId || (checklistId !== '' && ref.id === checklistId) || (ref.workingId != null && workingIds.has(ref.workingId)),
    );
    if (!match) continue;
    hits.push({
      cardId: entry.id,
      date: entry.date,
      note: lineNote(entry, match.id, match.workingId),
      href: withStudent(`/student/cards/${encodeURIComponent(entry.id)}`, search),
    });
  }
  return hits.sort((a, b) => b.date.localeCompare(a.date) || b.cardId.localeCompare(a.cardId));
}

function lineNote(entry: JournalEntry, id: string, workingId: string | undefined): string {
  try {
    const view = viewJournalEntry(entry);
    const line = view.techniques.find((item) => item.id === id || (workingId != null && item.workingId === workingId));
    return line?.note?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Same student=1 rule as the student pages. Coach tree links do not use it. */
export function withStudent(path: string, search: string): string {
  const incoming = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (incoming.get('student') !== '1') return path;
  const hashAt = path.indexOf('#');
  const hash = hashAt >= 0 ? path.slice(hashAt) : '';
  const before = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const [pathname, query = ''] = before.split('?');
  const next = new URLSearchParams(query);
  next.set('student', '1');
  return `${pathname}?${next.toString()}${hash}`;
}

function textId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export const READ_ONLY_KEYS = [ASSESSMENT_STORAGE_KEY, STUDENT_EDITION_STORAGE_KEY, TECHNIQUE_TREE_STORAGE_KEY] as const;

/** The preview seed key is listed so a test can prove this reader never asks for it. */
export const IGNORED_PREVIEW_TREE_KEY = PREVIEW_STORAGE_KEY;
