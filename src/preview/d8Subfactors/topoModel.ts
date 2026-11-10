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
