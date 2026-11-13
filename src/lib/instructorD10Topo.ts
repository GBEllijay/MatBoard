/**
 * 3D instructor D10: a pentagonal trapezohedron that TopoStage can draw.
 * Ten kite faces, each split into two coplanar triangles, in the same order
 * as instructorD10.ts. The student D8 octahedron in buildTopo is left alone.
 */
import type { ReliefScore } from '../preview/crystallineSweeps/geometry.ts';
import type { AxisId } from '../preview/assessmentRadar/model.ts';
import { TOPO_LEVEL, TOPO_R, TOPO_REVISION, type TopoFace, type TopoModel, type TopoMove, type TopoTile, type Vec } from '../preview/crystallineSweeps/topo.ts';
import { INSTRUCTOR_D10_FACES, type InstructorD10Scores } from './instructorD10.ts';
import { isAssessmentScore } from './studentAssessment.ts';

type Shared = { p: Vec; d: Vec };

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);

/** Ring radius and height before the solid is scaled to TOPO_R. */
export const D10_RING_R = TOPO_R * 0.92;
export const D10_RING_Y = TOPO_R * 0.28;

/**
 * Pole height that keeps a kite planar for the given ring.
 * Solved so [N, Nn[k], Ss[k], Nn[k+1]] has zero tetrahedron volume.
 */
export function d10PoleHeight(ringR = D10_RING_R, ringY = D10_RING_Y): number {
  const step = (2 * Math.PI) / 5;
  const half = step / 2;
  const nn0: Vec = [ringR, ringY, 0];
  const ss0: Vec = [ringR * Math.cos(half), -ringY, ringR * Math.sin(half)];
  const nn1: Vec = [ringR * Math.cos(step), ringY, ringR * Math.sin(step)];
  const volume = (poleY: number): number => {
    const north: Vec = [0, poleY, 0];
    return dot(cross(sub(nn0, north), sub(ss0, north)), sub(nn1, north));
  };
  const atZero = volume(0);
  const atOne = volume(1);
  const denom = atOne - atZero;
  if (Math.abs(denom) < 1e-12) return TOPO_R;
  return -atZero / denom;
}

export function kiteVolume(corners: readonly Vec[]): number {
  if (corners.length < 4) return 0;
  const [a, b, c, d] = corners;
  return dot(cross(sub(b!, a!), sub(c!, a!)), sub(d!, a!));
}

function outwardKite(vertices: Shared[], indices: number[]): number[] {
  const pts = indices.map((index) => vertices[index]!.p);
  const mid = scale(pts.reduce((acc, point) => add(acc, point), [0, 0, 0] as Vec), 1 / pts.length);
  const normal = cross(sub(pts[1]!, pts[0]!), sub(pts[2]!, pts[0]!));
  if (dot(normal, mid) < 0) return [indices[0]!, indices[3]!, indices[2]!, indices[1]!];
  return indices;
}

export function buildD10Topo(scores: InstructorD10Scores | null | undefined): TopoModel {
  const poleY = d10PoleHeight();
  const vert = (x: number, y: number, z: number): Shared => {
    const p: Vec = [x, y, z];
    return { p, d: p };
  };
  const north = vert(0, poleY, 0);
  const south = vert(0, -poleY, 0);
  const step = (2 * Math.PI) / 5;
  const northRing = Array.from({ length: 5 }, (_, k) =>
    vert(D10_RING_R * Math.cos(step * k), D10_RING_Y, D10_RING_R * Math.sin(step * k)),
  );
  const southRing = Array.from({ length: 5 }, (_, k) =>
    vert(D10_RING_R * Math.cos(step * k + step / 2), -D10_RING_Y, D10_RING_R * Math.sin(step * k + step / 2)),
  );
  const shared = [north, south, ...northRing, ...southRing];
  const farthest = Math.max(...shared.map((point) => len(point.p)));
  const fit = TOPO_R / farthest;
  for (const point of shared) {
    point.p = scale(point.p, fit);
    point.d = point.p;
  }
  const vertices = shared.map((point) => point.p);

  const faces: TopoFace[] = [];
  const tiles: TopoTile[] = [];
  const faceCorners: number[][] = [];

  const addFace = (faceIndex: number, corners: number[]) => {
    const faceDef = INSTRUCTOR_D10_FACES[faceIndex]!;
    const raw = scores?.[faceDef.id];
    const score = isAssessmentScore(raw) ? raw : null;
    const faceId = faceDef.id as AxisId;
    const move: TopoMove | null = score
      ? { id: faceDef.id, name: faceDef.label, subtype: 'score', faceId }
      : null;
    faces.push({
      id: faceId,
      name: faceDef.label,
      meaning: '',
      manualOnly: false,
      moves: move ? [move] : [],
    });
    faceCorners.push(corners);
    const kite = corners.map((index) => shared[index]!.p);
    const mid = scale(kite.reduce((acc, point) => add(acc, point), [0, 0, 0] as Vec), 1 / kite.length);
    const normal = cross(sub(kite[1]!, kite[0]!), sub(kite[2]!, kite[0]!));
    const unit = scale(normal, 1 / (len(normal) || 1));
    const outward = dot(unit, mid) >= 0 ? unit : scale(unit, -1);
    const offset = score == null ? null : TOPO_LEVEL[score as ReliefScore];
    const apex = offset == null ? null : add(mid, scale(outward, offset));
    const tris: [number, number, number][] = [
      [corners[0]!, corners[1]!, corners[2]!],
      [corners[0]!, corners[2]!, corners[3]!],
    ];
    for (const [ia, ib, ic] of tris) {
      tiles.push({
        index: tiles.length,
        faceIndex,
        faceId,
        tri: [shared[ia]!, shared[ib]!, shared[ic]!],
        move,
        offset,
        apex,
      });
    }
  };

  for (let k = 0; k < 5; k += 1) {
    const nn = (i: number) => 2 + (i % 5);
    const ss = (i: number) => 7 + (i % 5);
    addFace(2 * k, outwardKite(shared, [0, nn(k), ss(k), nn(k + 1)]));
    addFace(2 * k + 1, outwardKite(shared, [1, ss(k), nn(k + 1), ss(k + 1)]));
  }

  return {
    revision: TOPO_REVISION,
    vertices,
    faceCorners,
    faces,
    tiles,
    unmapped: [],
    matchesCitedLists: false,
  };
}
