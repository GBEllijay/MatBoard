/**
 * Isolated assessment-sphere preview.
 * Scores and trees are fictional examples. They do not read or write a student record.
 * Conditioning and Mindset are personal benchmarks, not technique trees.
 */

export const SPHERE_PATH = '/preview/assessment-sphere';

export const SPHERE_NOTE =
  'Preview only. The 1–5 marks are fictional examples, not your progress. Nothing is saved.';

export const DRAG_THRESHOLD_PX = 12;

export type AreaKind = 'technique' | 'benchmark';

export type DemoNode = { id: string; title: string };

export type DemoTree = { base: DemoNode; children: DemoNode[] };

export type BenchmarkExample = { title: string; detail: string };

export type AssessmentArea = {
  id: string;
  title: string;
  kind: AreaKind;
  /** Fictional 1–5 example. Not a stored self-assessment. */
  exampleScore: 1 | 2 | 3 | 4 | 5;
  tree: DemoTree | null;
  benchmark: BenchmarkExample | null;
};

export const ASSESSMENT_AREAS: readonly AssessmentArea[] = [
  {
    id: 'guard-control',
    title: 'Guard/Control',
    kind: 'technique',
    exampleScore: 3,
    tree: { base: { id: 'demo.closed-guard', title: 'Closed guard' }, children: [{ id: 'demo.scissor', title: 'Scissor sweep' }] },
    benchmark: null,
  },
  {
    id: 'passing',
    title: 'Passing',
    kind: 'technique',
    exampleScore: 2,
    tree: { base: { id: 'demo.closed-guard-pass', title: 'Closed guard' }, children: [{ id: 'demo.pass-side', title: 'Pass to side control' }] },
    benchmark: null,
  },
  {
    id: 'sweeps',
    title: 'Sweeps',
    kind: 'technique',
    exampleScore: 4,
    tree: { base: { id: 'demo.closed-guard-sweep', title: 'Closed guard' }, children: [{ id: 'demo.scissor-sweep', title: 'Scissor sweep' }] },
    benchmark: null,
  },
  {
    id: 'takedowns',
    title: 'Takedowns',
    kind: 'technique',
    exampleScore: 2,
    tree: { base: { id: 'demo.standing', title: 'Standing' }, children: [{ id: 'demo.double-leg', title: 'Double leg' }] },
    benchmark: null,
  },
  {
    id: 'escapes-defense',
    title: 'Escapes/Defense',
    kind: 'technique',
    exampleScore: 3,
    tree: { base: { id: 'demo.mount-escape', title: 'Mount' }, children: [{ id: 'demo.escape-mount', title: 'Escape mount' }] },
    benchmark: null,
  },
  {
    id: 'submissions',
    title: 'Submissions',
    kind: 'technique',
    exampleScore: 4,
    tree: {
      base: { id: 'demo.mount', title: 'Mount' },
      children: [
        { id: 'demo.americana', title: 'Americana' },
        { id: 'demo.armbar', title: 'Armbar' },
        { id: 'demo.cross-collar', title: 'Cross-collar choke' },
      ],
    },
    benchmark: null,
  },
  {
    id: 'conditioning',
    title: 'Conditioning',
    kind: 'benchmark',
    exampleScore: 4,
    tree: null,
    benchmark: { title: 'Example benchmark', detail: 'Fictional example: 20 sit-ups in a round. Not a technique, and not your record.' },
  },
  {
    id: 'mindset',
    title: 'Mindset',
    kind: 'benchmark',
    exampleScore: 2,
    tree: null,
    benchmark: { title: 'Example benchmark', detail: 'Fictional example: stay calm in a bad round. Not a technique, and not your record.' },
  },
] as const;

export type SpherePoint = { x: number; y: number; z: number };

export function areaDirection(index: number, count = ASSESSMENT_AREAS.length): SpherePoint {
  const y = 1 - (2 * (index + 0.5)) / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
}

export function rotatePoint(point: SpherePoint, yaw: number, pitch: number): SpherePoint {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = point.x * cosY + point.z * sinY;
  const z1 = -point.x * sinY + point.z * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return { x: x1, y: point.y * cosP - z1 * sinP, z: point.y * sinP + z1 * cosP };
}

export type ProjectedArea = {
  id: string;
  x: number;
  y: number;
  depth: number;
  occluded: boolean;
};

export function projectArea(index: number, yaw: number, pitch: number, size: number): ProjectedArea {
  const turned = rotatePoint(areaDirection(index), yaw, pitch);
  const perspective = 1.35 / (2.15 - turned.z);
  const area = ASSESSMENT_AREAS[index];
  return {
    id: area?.id ?? String(index),
    x: size / 2 + turned.x * size * 0.36 * perspective,
    y: size / 2 - turned.y * size * 0.36 * perspective,
    depth: turned.z,
    occluded: turned.z < 0.08,
  };
}

export function pointerIntent(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): 'orbit' | 'tap' {
  return Math.hypot(dx, dy) > threshold ? 'orbit' : 'tap';
}

export function areaById(id: string): AssessmentArea | null {
  return ASSESSMENT_AREAS.find((area) => area.id === id) ?? null;
}

export function demoEdges(area: AssessmentArea): Array<[string, string]> {
  if (!area.tree) return [];
  return area.tree.children.map((child) => [area.tree!.base.title, child.title]);
}
