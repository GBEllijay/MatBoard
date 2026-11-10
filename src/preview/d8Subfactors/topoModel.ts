/**
 * Diamond mesh for six sub-factors on every face.
 * The corner order matches buildTopo. This file does not change that builder.
 */

import type { ReliefScore } from '../crystallineSweeps/geometry.ts';
import { SHEET_AXIS_IDS } from '../assessmentRadar/model.ts';
import { TOPO_LEVEL, TOPO_R, TOPO_REVISION, type TopoModel, type TopoMove, type Vec } from '../crystallineSweeps/topo.ts';
import type { FaceModel } from './model.ts';

type Shared = { p: Vec; d: Vec };

const lerp = (a: Vec, b: Vec, t: number): Vec => a.map((value, index) => value + (b[index] - value) * t) as Vec;

function faceNormal(vertices: Vec[], corners: number[]): Vec {
  const [a, b, c] = corners.map((index) => vertices[index]);
  const center = [a, b, c].reduce((sum, point) => sum.map((value, index) => value + point[index]) as Vec, [0, 0, 0] as Vec);
  const length = Math.hypot(...center) || 1;
  return center.map((value) => value / length) as Vec;
}

function tileMid(tri: [Shared, Shared, Shared]): Vec {
  return [0, 1, 2].map((axis) => (tri[0].p[axis] + tri[1].p[axis] + tri[2].p[axis]) / 3) as Vec;
}

export function applySubfactorScore(model: TopoModel, id: string, score: ReliefScore): void {
  const tile = model.tiles.find((item) => item.move?.id === id);
  if (!tile) return;
  const normal = faceNormal(model.vertices, model.faceCorners[tile.faceIndex]);
  const mid = tileMid(tile.tri);
  const offset = TOPO_LEVEL[score];
  tile.offset = offset;
  tile.apex = mid.map((value, axis) => value + normal[axis] * offset) as Vec;
}

/** One octahedron. Each face carries exactly the moves it is given. Heights come from scoreFor. */
export function buildSubfactorTopo(
  faces: readonly FaceModel[],
  scoreFor: (id: string) => ReliefScore | null,
): TopoModel {
  const topoFaces = faces.map((face) => ({
    id: face.id,
    name: face.label,
    meaning: '',
    manualOnly: !face.proposed,
    moves: face.subfactors.map(
      (line): TopoMove => ({
        id: line.id,
        name: line.tile,
        subtype: face.proposed ? 'proposed' : 'check-in',
        faceId: face.id,
      }),
    ),
  }));
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
    const key = p.map((value) => value.toFixed(4)).join();
    const found = shared.get(key);
    if (found) return found;
    const point = { p, d: p };
    shared.set(key, point);
    return point;
  };
  const tiles: TopoModel['tiles'] = [];
  faceCorners.forEach((corners, faceIndex) => {
    const face = topoFaces[faceIndex];
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
    const center = [a, b, c].reduce((sum, point) => sum.map((value, index) => value + point[index]) as Vec, [0, 0, 0] as Vec);
    const centroid = center.map((value) => value / 3) as Vec;
    const ranked = list.map((tri, index) => {
      const mid = tileMid(tri);
      return {
        index,
        distance: Math.hypot(mid[0] - centroid[0], mid[1] - centroid[1], mid[2] - centroid[2]),
        angle: Math.atan2(mid[1] - centroid[1], mid[0] - centroid[0]),
      };
    });
    const byDistance = [...ranked].sort((left, right) => left.distance - right.distance || left.index - right.index);
    const chosen = byDistance.slice(0, count).sort((left, right) => left.angle - right.angle || left.index - right.index);
    const moveAt = new Map(chosen.map((row, index) => [row.index, face?.moves[index]]));
    const normal = faceNormal(vertices, corners);
    list.forEach((tri, triIndex) => {
      const move = moveAt.get(triIndex) ?? null;
      const score = move ? scoreFor(move.id) : null;
      const offset = score == null ? null : TOPO_LEVEL[score];
      const mid = tileMid(tri);
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
  return {
    revision: TOPO_REVISION,
    vertices,
    faceCorners,
    faces: topoFaces,
    tiles,
    unmapped: [],
    matchesCitedLists: false,
  };
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (vector: Vec): Vec => {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

export type FaceSlot = {
  tileIndex: number;
  moveId: string | null;
  label: string | null;
  /** Percent across the face, left to right. */
  x: number;
  /** Percent down the face. */
  y: number;
};

/** Flat map of one face. Empty corners stay on the far tiles. Filled lines stay near the middle. */
export function faceSlots(model: TopoModel, faceIndex: number): FaceSlot[] {
  const corners = model.faceCorners[faceIndex];
  if (!corners) return [];
  const [a, b, c] = corners.map((index) => model.vertices[index]);
  const u = norm(sub(b, a));
  const ac = sub(c, a);
  const along = dot(ac, u);
  const v = norm(sub(ac, [u[0] * along, u[1] * along, u[2] * along]));
  const raw = model.tiles
    .filter((tile) => tile.faceIndex === faceIndex)
    .map((tile) => {
      const mid: Vec = [
        (tile.tri[0].p[0] + tile.tri[1].p[0] + tile.tri[2].p[0]) / 3,
        (tile.tri[0].p[1] + tile.tri[1].p[1] + tile.tri[2].p[1]) / 3,
        (tile.tri[0].p[2] + tile.tri[1].p[2] + tile.tri[2].p[2]) / 3,
      ];
      const rel = sub(mid, a);
      return { tile, x: dot(rel, u), y: dot(rel, v) };
    });
  if (!raw.length) return [];
  const minX = Math.min(...raw.map((item) => item.x));
  const maxX = Math.max(...raw.map((item) => item.x));
  const minY = Math.min(...raw.map((item) => item.y));
  const maxY = Math.max(...raw.map((item) => item.y));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return raw.map((item) => ({
    tileIndex: item.tile.index,
    moveId: item.tile.move?.id ?? null,
    label: item.tile.move?.name ?? null,
    x: 16 + ((item.x - minX) / spanX) * 68,
    y: 14 + ((maxY - item.y) / spanY) * 72,
  }));
}

const tileMidpoint = (tile: TopoModel['tiles'][number]): Vec =>
  [0, 1, 2].map((axis) => (tile.tri[0].p[axis] + tile.tri[1].p[axis] + tile.tri[2].p[axis]) / 3) as Vec;

/**
 * Paint at most nine cards onto the face's existing triangles.
 * The mesh stays a 3×3. Extra cards are not given a new row.
 * `shown` should already be the strongest cards, closest tiles first.
 */
export function showOnDiamond(
  model: TopoModel,
  faceIndex: number,
  shown: readonly { id: string; name: string; rating: ReliefScore }[],
): void {
  const face = model.faces[faceIndex];
  const tiles = model.tiles.filter((tile) => tile.faceIndex === faceIndex);
  if (!face || !tiles.length) return;
  const corners = model.faceCorners[faceIndex].map((index) => model.vertices[index]);
  const centroid: Vec = [0, 1, 2].map((axis) => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3) as Vec;
  const ranked = [...tiles].sort((left, right) => {
    const leftMid = tileMidpoint(left);
    const rightMid = tileMidpoint(right);
    const leftDistance = Math.hypot(leftMid[0] - centroid[0], leftMid[1] - centroid[1], leftMid[2] - centroid[2]);
    const rightDistance = Math.hypot(rightMid[0] - centroid[0], rightMid[1] - centroid[1], rightMid[2] - centroid[2]);
    return leftDistance - rightDistance || left.index - right.index;
  });
  const capped = shown.slice(0, Math.min(9, ranked.length));
  const moves: TopoMove[] = capped.map((card) => ({
    id: card.id,
    name: card.name,
    subtype: 'card',
    faceId: face.id,
  }));
  face.moves = moves;
  for (const tile of tiles) {
    tile.move = null;
    tile.offset = null;
    tile.apex = null;
  }
  capped.forEach((card, index) => {
    const tile = ranked[index];
    if (!tile) return;
    tile.move = moves[index] ?? null;
    applySubfactorScore(model, card.id, card.rating);
  });
}

/** Put a new line on one empty tile. The other tiles stay where they are. Rating 3 is flat. */
export function placeOnEmptySlot(model: TopoModel, tileIndex: number, id: string, label: string): boolean {
  const tile = model.tiles[tileIndex];
  if (!tile || tile.move) return false;
  const move: TopoMove = { id, name: label, subtype: 'added', faceId: tile.faceId };
  tile.move = move;
  const face = model.faces[tile.faceIndex];
  face.moves = [...face.moves, move];
  applySubfactorScore(model, id, 3);
  return true;
}
