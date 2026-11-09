/**
 * Geometry from the owner's assessment-d8 Topography file.
 * Faces and move ids come from the current catalog and factor map.
 * The file's lists were checked against that map; they are not copied in as a second source.
 * Demo heights are a hash. They are not student scores.
 */

import { APPROVED_FUNDAMENTALS, AXES, SHEET_AXIS_IDS, type AxisId } from '../assessmentRadar/model.ts';
import { FUNDAMENTALS_CATALOG } from '../../lib/progress/catalog.ts';
import type { ReliefScore } from './geometry.ts';
import { RELIEF_STEPS } from './geometry.ts';

export const TOPO_REVISION = 'd8-topography-r1';
/** Commit named in the original file. The live map is compared with it in tests. */
export const TOPO_CITED_COMMIT = '582d339';

export const TOPO_R = 1.55;
/**
 * Old extreme. On the linear scale, score 5 was +H and score 4 was +H/2.
 * The doubled scale keeps this H and multiplies it by RELIEF_STEPS.
 */
export const TOPO_H = (0.25 * TOPO_R * Math.SQRT2) / 4;

/** 3 is flat. 4 is 1.5H. 5 is 3.5H. 2 and 1 mirror 4 and 5. */
export const TOPO_LEVEL: Record<ReliefScore, number> = {
  1: RELIEF_STEPS[1] * TOPO_H,
  2: RELIEF_STEPS[2] * TOPO_H,
  3: RELIEF_STEPS[3] * TOPO_H,
  4: RELIEF_STEPS[4] * TOPO_H,
  5: RELIEF_STEPS[5] * TOPO_H,
};

export type FillMode = 'center' | 'edges';

const CITED_UNMAPPED = [
  'pos.standing',
  'move.breakfalls',
  'move.shrimp',
  'move.bridge',
  'move.technical-standup',
  'def.sprawl',
] as const;

export type Vec = [number, number, number];

export type TopoMove = {
  id: string;
  name: string;
  subtype: string;
  faceId: AxisId;
};

export type TopoFace = {
  id: AxisId;
  name: string;
  meaning: string;
  manualOnly: boolean;
  moves: TopoMove[];
};

type Shared = { p: Vec; d: Vec };

export type TopoTile = {
  index: number;
  faceIndex: number;
  faceId: AxisId;
  tri: [Shared, Shared, Shared];
  move: TopoMove | null;
  /** Null when the tile is blank or the move is unrated. Zero is a flat rated 3. */
  offset: number | null;
  apex: Vec | null;
};

export type TopoModel = {
  revision: typeof TOPO_REVISION;
  vertices: Vec[];
  faceCorners: number[][];
  faces: TopoFace[];
  tiles: TopoTile[];
  unmapped: { id: string; name: string }[];
  /** True when the live map still matches the ids cited from 582d339. */
  matchesCitedLists: boolean;
};

const lerp = (a: Vec, b: Vec, t: number): Vec => a.map((x, i) => x + (b[i] - x) * t) as Vec;

export function demoLevel(id: string): ReliefScore {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (1 + (hash % 5)) as ReliefScore;
}

export type TileTone = 'position' | 'defense' | 'submission' | 'pass';

/** Positions stay the original blue. Escapes and defense are orange, submissions red, passes and sweeps green. */
export function tileTone(id: string): TileTone {
  if (id.startsWith('sub.')) return 'submission';
  if (id.startsWith('escape.') || id.startsWith('def.')) return 'defense';
  if (id.startsWith('pass.') || id.startsWith('sweep.')) return 'pass';
  return 'position';
}

function catalogName(id: string): string {
  for (const category of FUNDAMENTALS_CATALOG.categories) {
    const item = category.items.find((row) => row.id === id);
    if (item) return item.name;
  }
  return '';
}

export function buildFaces(): { faces: TopoFace[]; unmapped: { id: string; name: string }[]; matchesCitedLists: boolean } {
  const approved = new Map<string, (typeof APPROVED_FUNDAMENTALS)[number]>(APPROVED_FUNDAMENTALS.map((row) => [row.id, row]));
  const faces: TopoFace[] = SHEET_AXIS_IDS.map((id) => {
    const axis = AXES.find((item) => item.id === id);
    const moves = APPROVED_FUNDAMENTALS.filter((row) => row.axis === id)
      .map((row) => ({
        id: row.id,
        name: catalogName(row.id),
        subtype: row.subtype,
        faceId: id,
      }))
      .filter((move) => move.name);
    return {
      id,
      name: axis?.label ?? id,
      meaning: axis?.meaning ?? '',
      manualOnly: axis?.manualOnly ?? false,
      moves,
    };
  });
  const unmapped = FUNDAMENTALS_CATALOG.categories.flatMap((category) =>
    category.items
      .filter((item) => !approved.has(item.id))
      .map((item) => ({ id: item.id, name: item.name })),
  );
  const cited = [...CITED_UNMAPPED];
  const matchesCitedLists =
    unmapped.map((item) => item.id).join() === cited.join() &&
    faces.reduce((sum, face) => sum + face.moves.length, 0) === APPROVED_FUNDAMENTALS.length;
  return { faces, unmapped, matchesCitedLists };
}

export function buildTopo(scoreFor: (moveId: string) => ReliefScore | null, fill: FillMode = 'center'): TopoModel {
  const { faces, unmapped, matchesCitedLists } = buildFaces();
  const vertices: Vec[] = [
    [TOPO_R, 0, 0],
    [-TOPO_R, 0, 0],
    [0, TOPO_R, 0],
    [0, -TOPO_R, 0],
    [0, 0, TOPO_R],
    [0, 0, -TOPO_R],
  ];
  const faceCorners: number[][] = [];
  for (const sx of [0, 1]) {
    for (const sy of [2, 3]) {
      for (const sz of [4, 5]) {
        const odd = (sx + sy - 2 + sz - 4) % 2;
        faceCorners.push(odd ? [sx, sz, sy] : [sx, sy, sz]);
      }
    }
  }
  const shared = new Map<string, Shared>();
  const vert = (p: Vec): Shared => {
    const key = p.map((x) => x.toFixed(4)).join();
    const found = shared.get(key);
    if (found) return found;
    const point = { p, d: p };
    shared.set(key, point);
    return point;
  };
  const tiles: TopoTile[] = [];
  faceCorners.forEach((corners, faceIndex) => {
    const face = faces[faceIndex];
    const count = face?.moves.length ?? 0;
    const n = Math.max(1, Math.ceil(Math.sqrt(count)));
    const [a, b, c] = corners.map((index) => vertices[index]);
    const pointAt = (i: number, j: number) => {
      const left = lerp(a, b, i / n);
      const right = lerp(a, c, i / n);
      return vert(i ? lerp(left, right, j / i) : a);
    };
    const list: [Shared, Shared, Shared][] = [];
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j <= i; j += 1) {
        list.push([pointAt(i, j), pointAt(i + 1, j), pointAt(i + 1, j + 1)]);
        if (j < i) list.push([pointAt(i, j), pointAt(i + 1, j + 1), pointAt(i, j + 1)]);
      }
    }
    const center = [a, b, c].reduce((sum, q) => sum.map((value, index) => value + q[index]) as Vec, [0, 0, 0] as Vec);
    const length = Math.hypot(...center) || 1;
    const normal = center.map((value) => value / length) as Vec;
    const centroid = center.map((value) => value / 3) as Vec;
    const ranked = list.map((tri, index) => {
      const mid = [0, 1, 2].map((axis) => (tri[0].p[axis] + tri[1].p[axis] + tri[2].p[axis]) / 3) as Vec;
      const dx = mid[0] - centroid[0];
      const dy = mid[1] - centroid[1];
      const dz = mid[2] - centroid[2];
      return { index, mid, distance: Math.hypot(dx, dy, dz), angle: Math.atan2(dy, dx) };
    });
    const byDistance = [...ranked].sort((left, right) => left.distance - right.distance || left.index - right.index);
    const ring = fill === 'center' ? byDistance : [...byDistance].reverse();
    const chosen = ring.slice(0, face?.moves.length ?? 0).sort((left, right) => left.angle - right.angle || left.index - right.index);
    const moveAt = new Map(chosen.map((row, index) => [row.index, face?.moves[index]]));
    list.forEach((tri, triIndex) => {
      const move = moveAt.get(triIndex) ?? null;
      const score = move ? scoreFor(move.id) : null;
      const offset = score == null ? null : TOPO_LEVEL[score];
      const mid = [0, 1, 2].map((axis) => (tri[0].p[axis] + tri[1].p[axis] + tri[2].p[axis]) / 3) as Vec;
      const apex = offset == null ? null : (mid.map((value, axis) => value + normal[axis] * offset) as Vec);
      tiles.push({
        index: tiles.length,
        faceIndex,
        faceId: face?.id ?? SHEET_AXIS_IDS[0],
        tri,
        move,
        offset,
        apex,
      });
    });
  });
  return { revision: TOPO_REVISION, vertices, faceCorners, faces, tiles, unmapped, matchesCitedLists };
}

export function topoWords(score: ReliefScore | null): string {
  if (score === 1) return 'deep inward';
  if (score === 2) return 'shallow inward';
  if (score === 3) return 'flat';
  if (score === 4) return 'raised';
  if (score === 5) return 'tall outward';
  return 'not rated';
}
