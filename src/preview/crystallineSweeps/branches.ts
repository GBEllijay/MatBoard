/**
 * Internal technique-tree branches for the D8.
 * Each branch runs from one pyramid tip, through the inside of the diamond, to a pyramid tip on another face.
 * Pure math only. TopoStage rotates and projects the points with the same camera as the faces.
 */
import { catalogNameFor, demoCard, pointToSegment } from './demoLinks.ts';
import { TOPO_R, type TopoModel, type TopoTile, type Vec } from './topo.ts';

export const BRANCH_SAMPLE_NOTE = 'Example branches from the preview technique tree. Not a saved technique tree.';
/** Segments per arc. Short enough to sort cleanly between faces, few enough for a phone. */
export const BRANCH_SEGMENTS = 16;
/** How far the arc's control point is pulled from the chord midpoint toward the center. 1 puts it on the center. */
export const BRANCH_PULL = 0.9;
/** Front-face fill alpha while x-ray is on. */
export const XRAY_FRONT_ALPHA = 0.12;
/** Screen pixels a tap may miss a branch by and still pick it. */
export const BRANCH_TAP_PX = 14;

export type D8Branch = {
  id: string;
  from: number;
  to: number;
  fromName: string;
  toName: string;
};

/** Example graph: the same "leads to" rows the preview drill-down uses. */
const SAMPLE_SOURCES = [
  'Closed guard',
  'Scissor sweep',
  'Hip bump sweep',
  'Flower sweep',
  'Pendulum sweep',
  'Mount',
  'Armbar',
  'X-guard',
  'Elevator sweep',
  'Back control',
];

export type TreeEdge = { from: string; to: string };

export function sampleTreeEdges(): TreeEdge[] {
  const edges: TreeEdge[] = [];
  for (const from of SAMPLE_SOURCES) {
    for (const to of demoCard(from).outgoing) edges.push({ from, to });
  }
  return edges;
}

/**
 * Tree edges whose two techniques sit on different faces of this model.
 * Same-face edges stay on the surface, so they are left out. A pair is kept once, in its first direction.
 */
export function branchesFromTree(model: TopoModel, edges: readonly TreeEdge[] = sampleTreeEdges()): D8Branch[] {
  const byName = new Map<string, TopoTile>();
  for (const tile of model.tiles) {
    if (tile.move && !byName.has(tile.move.name.toLowerCase())) byName.set(tile.move.name.toLowerCase(), tile);
  }
  const find = (name: string) => byName.get(name.toLowerCase()) ?? byName.get((catalogNameFor(name) ?? '').toLowerCase());
  const seen = new Set<string>();
  const out: D8Branch[] = [];
  for (const edge of edges) {
    const a = find(edge.from);
    const b = find(edge.to);
    if (!a?.move || !b?.move || a.faceIndex === b.faceIndex) continue;
    const key = a.index < b.index ? `${a.index}:${b.index}` : `${b.index}:${a.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${a.move.id}->${b.move.id}`, from: a.index, to: b.index, fromName: a.move.name, toName: b.move.name });
  }
  return out;
}

/** The pyramid tip of a tile, with relief applied the same way the faces draw it. Flat tiles use their center. */
export function tileTip(tile: TopoTile, relief: number): Vec {
  const raw = tile.tri;
  const mid: Vec = [
    (raw[0].p[0] + raw[1].p[0] + raw[2].p[0]) / 3,
    (raw[0].p[1] + raw[1].p[1] + raw[2].p[1]) / 3,
    (raw[0].p[2] + raw[1].p[2] + raw[2].p[2]) / 3,
  ];
  if (!tile.apex) return mid;
  return [
    mid[0] + (tile.apex[0] - mid[0]) * relief,
    mid[1] + (tile.apex[1] - mid[1]) * relief,
    mid[2] + (tile.apex[2] - mid[2]) * relief,
  ];
}

/** Quadratic control point: the chord midpoint pulled toward the origin. */
export function arcControl(a: Vec, b: Vec, pull = BRANCH_PULL): Vec {
  const k = 1 - pull;
  return [((a[0] + b[0]) / 2) * k, ((a[1] + b[1]) / 2) * k, ((a[2] + b[2]) / 2) * k];
}

/**
 * Points along the arc, flat [x, y, z, x, y, z, ...], segments + 1 points.
 * Written into `out` when it is big enough, so a caller can reuse one buffer.
 */
export function arcPoints(a: Vec, b: Vec, segments = BRANCH_SEGMENTS, pull = BRANCH_PULL, out?: Float64Array): Float64Array {
  const count = Math.max(1, Math.floor(segments));
  const buffer = out && out.length >= (count + 1) * 3 ? out : new Float64Array((count + 1) * 3);
  const c = arcControl(a, b, pull);
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const u = 1 - t;
    const wa = u * u;
    const wc = 2 * u * t;
    const wb = t * t;
    buffer[i * 3] = wa * a[0] + wc * c[0] + wb * b[0];
    buffer[i * 3 + 1] = wa * a[1] + wc * c[1] + wb * b[1];
    buffer[i * 3 + 2] = wa * a[2] + wc * c[2] + wb * b[2];
  }
  return buffer;
}

/** Arc points for every branch on the model, computed once per model or relief change. */
export function branchArcs(model: TopoModel, branches: readonly D8Branch[], relief: number, segments = BRANCH_SEGMENTS): Float64Array[] {
  return branches.map((branch) => {
    const from = model.tiles[branch.from];
    const to = model.tiles[branch.to];
    if (!from || !to) return new Float64Array(0);
    return arcPoints(tileTip(from, relief), tileTip(to, relief), segments);
  });
}

/** Depth used in the painter's sort: the mean z of a segment's two rotated ends, the same rule as faces. */
export function segmentDepth(za: number, zb: number): number {
  return (za + zb) / 2;
}

/** 0 at the far side of the diamond, 1 at the near side. Drives line brightness and width. */
export function proximity(z: number, radius = TOPO_R): number {
  const value = (z + radius) / (2 * radius);
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function branchStroke(z: number, chosen: boolean): { alpha: number; width: number } {
  const near = proximity(z);
  return { alpha: chosen ? 0.6 + 0.4 * near : 0.25 + 0.7 * near, width: (chosen ? 2.2 : 1) + 2.4 * near };
}

/** Swap the alpha of an rgba() fill. Other colors pass through. */
export function withAlpha(fill: string, alpha: number): string {
  return /^rgba\(/.test(fill) ? fill.replace(/,\s*[\d.]+\)$/, `,${alpha})`) : fill;
}

export type BranchHit = { branch: number; a: [number, number]; b: [number, number] };

/** Nearest branch to a tap, within tolerance. -1 when nothing is close. */
export function hitBranch(point: [number, number], hits: readonly BranchHit[], tolerance = BRANCH_TAP_PX): number {
  let best = -1;
  let bestDist = tolerance;
  for (const hit of hits) {
    const dist = pointToSegment(point, hit.a, hit.b);
    if (dist <= bestDist) {
      bestDist = dist;
      best = hit.branch;
    }
  }
  return best;
}

/** Tapping the shown branch again clears it. Tapping a different one picks it. Empty space clears. */
export function nextBranchSelection(current: number, hit: number): number {
  if (hit < 0) return -1;
  return hit === current ? -1 : hit;
}
