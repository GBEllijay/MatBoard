/**
 * Isolated example for the personal technique map preview.
 * These names are an illustration. They are not belt requirements,
 * not a student's record, and not written to the student file.
 * The live working tree is still the nested list on /student/working.
 */

export const PERSONAL_GRAPH_PREVIEW_PATH = '/preview/personal-graph';

export const PERSONAL_GRAPH_PREVIEW_BANNER =
  'Preview only — example curriculum. Not your techniques, not belt requirements, and not a record of what anyone has learned.';

export type PreviewKind = 'position' | 'technique';

/** `transition` is drawn only in this preview. The live list uses branch, defense, and follow. */
export type PreviewRelation = 'branch' | 'defense' | 'follow' | 'transition';

export type PreviewGoal = 'none' | 'personal' | 'coach-interval';

export type PreviewNode = {
  id: string;
  title: string;
  kind: PreviewKind;
  /** A place the example map can start. Other positions are the same node when a path returns. */
  base: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  category: string;
  goal: PreviewGoal;
  /** Minutes in the illustration. Logging time is not mastery and not a finished benchmark. */
  practiceMinutes: number;
};

export type PreviewEdge = {
  id: string;
  fromId: string;
  toId: string;
  relation: PreviewRelation;
  label: string;
};

export type GraphView = { x: number; y: number; scale: number };

export const PREVIEW_RELATION_LABEL: Record<PreviewRelation, string> = {
  branch: 'Branch',
  defense: 'Defense',
  follow: 'Follow-up',
  transition: 'Transition',
};

const NODES: readonly PreviewNode[] = [
  { id: 'p-closed', title: 'Closed guard', kind: 'position', base: true, x: 20, y: 20, w: 170, h: 58, category: 'Guard', goal: 'none', practiceMinutes: 0 },
  { id: 'p-side', title: 'Side control', kind: 'position', base: false, x: 340, y: 20, w: 160, h: 58, category: 'Top pin', goal: 'none', practiceMinutes: 0 },
  { id: 'p-sprawl', title: 'Sprawl', kind: 'position', base: true, x: 660, y: 20, w: 160, h: 58, category: 'Standing', goal: 'none', practiceMinutes: 0 },
  { id: 't-hip', title: 'Hip bump sweep', kind: 'technique', base: false, x: 20, y: 140, w: 150, h: 52, category: 'Sweep', goal: 'coach-interval', practiceMinutes: 40 },
  { id: 't-flower', title: 'Flower sweep', kind: 'technique', base: false, x: 190, y: 140, w: 150, h: 52, category: 'Sweep', goal: 'personal', practiceMinutes: 15 },
  { id: 't-knee', title: 'Knee cut', kind: 'technique', base: false, x: 370, y: 140, w: 140, h: 52, category: 'Pass', goal: 'none', practiceMinutes: 20 },
  { id: 't-uchi', title: 'Uchi Mata from Sprawl', kind: 'technique', base: false, x: 620, y: 140, w: 200, h: 52, category: 'Throw', goal: 'personal', practiceMinutes: 25 },
  { id: 't-tri', title: 'Triangle', kind: 'technique', base: false, x: 20, y: 250, w: 140, h: 52, category: 'Submission', goal: 'none', practiceMinutes: 15 },
  { id: 't-collar', title: 'Cross-collar choke', kind: 'technique', base: false, x: 190, y: 250, w: 180, h: 52, category: 'Submission', goal: 'coach-interval', practiceMinutes: 10 },
  { id: 't-ankle', title: 'Ankle pick', kind: 'technique', base: false, x: 400, y: 250, w: 140, h: 52, category: 'Takedown', goal: 'personal', practiceMinutes: 12 },
  { id: 't-head', title: 'Front headlock', kind: 'technique', base: false, x: 680, y: 250, w: 160, h: 52, category: 'Front head', goal: 'none', practiceMinutes: 0 },
  { id: 't-arm', title: 'Armbar', kind: 'technique', base: false, x: 20, y: 370, w: 140, h: 52, category: 'Submission', goal: 'none', practiceMinutes: 8 },
  { id: 't-post', title: 'Posture and frame', kind: 'technique', base: false, x: 180, y: 370, w: 180, h: 52, category: 'Defense', goal: 'none', practiceMinutes: 18 },
  { id: 't-guill', title: 'Guillotine', kind: 'technique', base: false, x: 680, y: 370, w: 150, h: 52, category: 'Submission', goal: 'none', practiceMinutes: 0 },
  { id: 'p-mount', title: 'Mount', kind: 'position', base: false, x: 340, y: 500, w: 160, h: 58, category: 'Top pin', goal: 'none', practiceMinutes: 0 },
];

const EDGES: readonly PreviewEdge[] = [
  { id: 'e-hip', fromId: 'p-closed', toId: 't-hip', relation: 'branch', label: 'sweep' },
  { id: 'e-hip-mount', fromId: 't-hip', toId: 'p-mount', relation: 'follow', label: 'come on top' },
  { id: 'e-flower', fromId: 'p-closed', toId: 't-flower', relation: 'branch', label: 'other sweep' },
  { id: 'e-flower-mount', fromId: 't-flower', toId: 'p-mount', relation: 'follow', label: 'same mount' },
  { id: 'e-tri', fromId: 'p-closed', toId: 't-tri', relation: 'branch', label: 'attack' },
  { id: 'e-arm', fromId: 't-tri', toId: 't-arm', relation: 'follow', label: 'overhook' },
  { id: 'e-post', fromId: 't-tri', toId: 't-post', relation: 'defense', label: 'they posture' },
  { id: 'e-post-back', fromId: 't-post', toId: 'p-closed', relation: 'follow', label: 'back to guard' },
  { id: 'e-collar', fromId: 'p-closed', toId: 't-collar', relation: 'branch', label: 'choke' },
  { id: 'e-knee', fromId: 'p-closed', toId: 't-knee', relation: 'transition', label: 'open and cut' },
  { id: 'e-side', fromId: 't-knee', toId: 'p-side', relation: 'follow', label: 'pass' },
  { id: 'e-climb', fromId: 'p-side', toId: 'p-mount', relation: 'follow', label: 'climb' },
  { id: 'e-uchi', fromId: 'p-sprawl', toId: 't-uchi', relation: 'branch', label: 'throw' },
  { id: 'e-ankle', fromId: 't-uchi', toId: 't-ankle', relation: 'defense', label: 'defended' },
  { id: 'e-ankle-guard', fromId: 't-ankle', toId: 'p-closed', relation: 'follow', label: 'step behind' },
  { id: 'e-head', fromId: 'p-sprawl', toId: 't-head', relation: 'branch', label: 'snap down' },
  { id: 'e-guill', fromId: 't-head', toId: 't-guill', relation: 'follow', label: 'front choke' },
  { id: 'e-guill-out', fromId: 't-guill', toId: 'p-sprawl', relation: 'defense', label: 'circle out' },
  { id: 'e-stand', fromId: 'p-side', toId: 'p-sprawl', relation: 'transition', label: 'they stand' },
];

export function exampleNodes(): readonly PreviewNode[] {
  return NODES;
}

export function exampleEdges(): readonly PreviewEdge[] {
  return EDGES;
}

export function exampleNode(id: string): PreviewNode | null {
  return NODES.find((node) => node.id === id) ?? null;
}

export function basePositions(): readonly PreviewNode[] {
  return NODES.filter((node) => node.base);
}

/** Positions or techniques that more than one step arrives at. Each id is still one node. */
export function sharedArrivals(): { id: string; arrivals: number }[] {
  const counts = new Map<string, number>();
  for (const edge of EDGES) counts.set(edge.toId, (counts.get(edge.toId) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, arrivals]) => ({ id, arrivals }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function graphBounds(nodes: readonly PreviewNode[] = NODES): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Scale and pan so every bubble sits inside the viewport, including on a narrow phone. */
export function fitView(viewport: { width: number; height: number }, pad = 20, nodes: readonly PreviewNode[] = NODES): GraphView {
  const bounds = graphBounds(nodes);
  const availW = Math.max(1, viewport.width - pad * 2);
  const availH = Math.max(1, viewport.height - pad * 2);
  const scale = Math.min(availW / bounds.width, availH / bounds.height);
  return {
    scale,
    x: (viewport.width - bounds.width * scale) / 2 - bounds.minX * scale,
    y: (viewport.height - bounds.height * scale) / 2 - bounds.minY * scale,
  };
}

export function zoomAt(view: GraphView, anchorX: number, anchorY: number, nextScale: number): GraphView {
  const scale = Math.min(2.4, Math.max(0.18, nextScale));
  const worldX = (anchorX - view.x) / view.scale;
  const worldY = (anchorY - view.y) / view.scale;
  return { scale, x: anchorX - worldX * scale, y: anchorY - worldY * scale };
}

export function centerNode(
  viewport: { width: number; height: number },
  node: PreviewNode,
  scale = 1,
): GraphView {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return { scale, x: viewport.width / 2 - cx * scale, y: viewport.height / 2 - cy * scale };
}

export function goalCaption(goal: PreviewGoal): string {
  if (goal === 'personal') return 'Example personal goal. Optional. Not shared.';
  if (goal === 'coach-interval') return 'Example of a blue → purple interval. Not a stripe, and not completed.';
  return 'No goal on this example.';
}

export function practiceCaption(minutes: number): string {
  if (minutes <= 0) return 'No practice time in this example.';
  return `${minutes} min logged in this example. Time logged is not mastery and does not finish a benchmark.`;
}
