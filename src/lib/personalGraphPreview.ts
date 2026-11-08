/**
 * Isolated example for the personal technique cloud preview.
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

export type CloudCategory = 'guard' | 'legs' | 'dominant' | 'dynamic' | 'standing' | 'passing';

export type PreviewNode = {
  id: string;
  title: string;
  kind: PreviewKind;
  /** A place the example map can start. Other positions are the same node when a path returns. */
  base: boolean;
  /** Cloud position. Not a row in a flowchart. */
  x: number;
  y: number;
  z: number;
  category: CloudCategory;
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

export type CloudPose = {
  yaw: number;
  pitch: number;
  zoom: number;
  flat: boolean;
};

export type PlacedNode = {
  id: string;
  x: number;
  y: number;
  depth: number;
  r: number;
};

export const PREVIEW_RELATION_LABEL: Record<PreviewRelation, string> = {
  branch: 'Branch',
  defense: 'Defense',
  follow: 'Follow-up',
  transition: 'Transition',
};

export const CLOUD_CATEGORIES: readonly { id: CloudCategory; label: string; color: string }[] = [
  { id: 'guard', label: 'Guard', color: '#22d3ee' },
  { id: 'legs', label: 'Leg Entanglements', color: '#f0b429' },
  { id: 'dominant', label: 'Dominant Positions', color: '#7eb6ff' },
  { id: 'dynamic', label: 'Dynamic Positions', color: '#e7c56a' },
  { id: 'standing', label: 'Standing and Takedowns', color: '#9ae6ff' },
  { id: 'passing', label: 'Guard Passing', color: '#5eead4' },
];

/** A slight turn so the first view reads as a cloud, not a spinning animation. */
export const RESET_POSE: CloudPose = { yaw: 0.55, pitch: 0.28, zoom: 1, flat: false };

const TAP_PX = 8;

const NODES: readonly PreviewNode[] = [
  { id: 'p-closed', title: 'Closed guard', kind: 'position', base: true, x: -0.18, y: 0.62, z: 0.28, category: 'guard', goal: 'none', practiceMinutes: 0 },
  { id: 't-hip', title: 'Hip bump sweep', kind: 'technique', base: false, x: -0.62, y: 0.34, z: 0.18, category: 'guard', goal: 'coach-interval', practiceMinutes: 40 },
  { id: 't-flower', title: 'Flower sweep', kind: 'technique', base: false, x: -0.28, y: 0.86, z: -0.22, category: 'guard', goal: 'personal', practiceMinutes: 15 },
  { id: 't-collar', title: 'Cross-collar choke', kind: 'technique', base: false, x: 0.08, y: 0.48, z: 0.55, category: 'guard', goal: 'coach-interval', practiceMinutes: 10 },
  { id: 't-post', title: 'Posture and frame', kind: 'technique', base: false, x: -0.72, y: 0.08, z: 0.36, category: 'guard', goal: 'none', practiceMinutes: 18 },
  { id: 't-tri', title: 'Triangle', kind: 'technique', base: false, x: -0.36, y: 0.12, z: -0.58, category: 'legs', goal: 'none', practiceMinutes: 15 },
  { id: 't-arm', title: 'Armbar', kind: 'technique', base: false, x: -0.58, y: -0.28, z: -0.32, category: 'legs', goal: 'none', practiceMinutes: 8 },
  { id: 'p-mount', title: 'Mount', kind: 'position', base: false, x: 0.06, y: -0.72, z: 0.18, category: 'dominant', goal: 'none', practiceMinutes: 0 },
  { id: 'p-side', title: 'Side control', kind: 'position', base: false, x: 0.42, y: -0.36, z: 0.52, category: 'dominant', goal: 'none', practiceMinutes: 0 },
  { id: 't-head', title: 'Front headlock', kind: 'technique', base: false, x: 0.66, y: 0.22, z: -0.28, category: 'dynamic', goal: 'none', practiceMinutes: 0 },
  { id: 't-guill', title: 'Guillotine', kind: 'technique', base: false, x: 0.28, y: -0.08, z: -0.74, category: 'dynamic', goal: 'none', practiceMinutes: 0 },
  { id: 'p-sprawl', title: 'Sprawl', kind: 'position', base: true, x: 0.7, y: 0.55, z: 0.12, category: 'standing', goal: 'none', practiceMinutes: 0 },
  { id: 't-uchi', title: 'Uchi Mata from Sprawl', kind: 'technique', base: false, x: 0.86, y: 0.08, z: 0.32, category: 'standing', goal: 'personal', practiceMinutes: 25 },
  { id: 't-ankle', title: 'Ankle pick', kind: 'technique', base: false, x: 0.48, y: 0.4, z: -0.42, category: 'standing', goal: 'personal', practiceMinutes: 12 },
  { id: 't-knee', title: 'Knee cut', kind: 'technique', base: false, x: 0.16, y: -0.16, z: 0.7, category: 'passing', goal: 'none', practiceMinutes: 20 },
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

export function categoryColor(id: CloudCategory): string {
  return CLOUD_CATEGORIES.find((item) => item.id === id)?.color ?? '#22d3ee';
}

export function categoryLabel(id: CloudCategory): string {
  return CLOUD_CATEGORIES.find((item) => item.id === id)?.label ?? id;
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

export function directNodeIds(id: string): string[] {
  const found = new Set<string>();
  for (const edge of EDGES) {
    if (edge.fromId === id) found.add(edge.toId);
    if (edge.toId === id) found.add(edge.fromId);
  }
  return [...found];
}

/** A short press selects. A longer drag rotates. There is no automatic spin. */
export function gestureIntent(distancePx: number): 'tap' | 'rotate' {
  return distancePx > TAP_PX ? 'rotate' : 'tap';
}

export function rotatePose(pose: CloudPose, dx: number, dy: number): CloudPose {
  return {
    ...pose,
    flat: false,
    yaw: pose.yaw + dx * 0.008,
    pitch: Math.max(-1.05, Math.min(1.05, pose.pitch + dy * 0.006)),
  };
}

export function zoomPose(pose: CloudPose, factor: number): CloudPose {
  return { ...pose, zoom: Math.min(2.6, Math.max(0.55, pose.zoom * factor)) };
}

/** Turn the cloud until this node faces the viewer. Does not copy the node. */
export function poseFacing(node: PreviewNode, pose: CloudPose): CloudPose {
  const yaw = Math.atan2(node.x, node.z || 0.001);
  const depth = Math.hypot(node.x, node.z);
  const pitch = Math.max(-1.05, Math.min(1.05, Math.atan2(node.y, depth || 0.001)));
  return { ...pose, yaw, pitch, flat: false };
}

function rotated(node: PreviewNode, pose: CloudPose): { x: number; y: number; z: number } {
  const z0 = pose.flat ? 0 : node.z;
  const yaw = pose.flat ? 0 : pose.yaw;
  const pitch = pose.flat ? 0 : pose.pitch;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = node.x * cosY + z0 * sinY;
  const z1 = -node.x * sinY + z0 * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return {
    x: x1,
    y: node.y * cosP - z1 * sinP,
    z: node.y * sinP + z1 * cosP,
  };
}

/** Screen points for the current turn. Back nodes come first so front nodes receive the tap. */
export function projectNodes(viewport: { width: number; height: number }, pose: CloudPose, pad = 36): PlacedNode[] {
  const span = Math.max(1, Math.min(viewport.width, viewport.height) - pad * 2);
  const scale = (span / 2.5) * pose.zoom;
  return NODES.map((node) => {
    const point = rotated(node, pose);
    const persp = 2.8 / (2.8 - point.z * 0.9);
    const r = Math.max(15, Math.min(27, 16 * persp * Math.sqrt(pose.zoom)));
    return {
      id: node.id,
      x: viewport.width / 2 + point.x * persp * scale,
      y: viewport.height / 2 + point.y * persp * scale,
      depth: point.z,
      r,
    };
  }).sort((a, b) => a.depth - b.depth);
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
