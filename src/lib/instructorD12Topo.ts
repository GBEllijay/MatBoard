/**
 * 3D instructor D12: a regular dodecahedron that TopoStage can draw.
 * Twelve pentagonal faces, 20 vertices, and 30 edges, in the same order
 * as instructorD12.ts. Each pentagon is split into three coplanar triangles.
 * The student D8 octahedron in buildTopo is left alone.
 */
import type { ReliefScore } from '../preview/crystallineSweeps/geometry.ts';
import type { AxisId } from '../preview/assessmentRadar/model.ts';
import { TOPO_LEVEL, TOPO_R, TOPO_REVISION, faceCentroid, type TopoFace, type TopoModel, type TopoMove, type TopoTile, type Vec } from '../preview/crystallineSweeps/topo.ts';
import { INSTRUCTOR_D12_FACES, type InstructorD12Scores } from './instructorD12.ts';
import { isAssessmentScore } from './studentAssessment.ts';

type Shared = { p: Vec; d: Vec };

const PHI = (1 + Math.sqrt(5)) / 2;
const INV = 1 / PHI;

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

/** Greatest distance from the face plane, as a fraction of an edge, for planarity checks. */
export function pentagonPlanarError(corners: readonly Vec[]): number {
  if (corners.length < 3) return 0;
  const [a, b, c] = corners;
  const normal = cross(sub(b!, a!), sub(c!, a!));
  const denom = len(normal) || 1;
  const edge = len(sub(b!, a!)) || 1;
  let worst = 0;
  for (const point of corners) {
    worst = Math.max(worst, Math.abs(dot(normal, sub(point, a!))) / denom);
  }
  return worst / edge;
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

function rotate(point: Vec, axis: Vec, angle: number): Vec {
  const axisLen = len(axis) || 1;
  const u = scale(axis, 1 / axisLen);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(point, c), scale(cross(u, point), s)), scale(u, dot(u, point) * (1 - c)));
}

function rawVertices(): Vec[] {
  const cube: Vec[] = [];
  for (const x of [-1, 1] as const) {
    for (const y of [-1, 1] as const) {
      for (const z of [-1, 1] as const) cube.push([x, y, z]);
    }
  }
  const rects: Vec[] = [];
  for (const y of [-INV, INV] as const) {
    for (const z of [-PHI, PHI] as const) rects.push([0, y, z]);
  }
  for (const x of [-INV, INV] as const) {
    for (const y of [-PHI, PHI] as const) rects.push([x, y, 0]);
  }
  for (const x of [-PHI, PHI] as const) {
    for (const z of [-INV, INV] as const) rects.push([x, 0, z]);
  }
  return [...cube, ...rects];
}

function pairDistances(points: readonly Vec[]): number[] {
  const distances: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      distances.push(len(sub(points[j]!, points[i]!)));
    }
  }
  distances.sort((a, b) => a - b);
  return distances;
}

function isFacePentagon(points: readonly Vec[], edge: number): boolean {
  if (points.length !== 5 || edge < 1e-6) return false;
  const distances = pairDistances(points);
  if (!nearly(distances[0]!, edge, 1e-5)) return false;
  const long = edge * PHI;
  let shortCount = 0;
  let longCount = 0;
  for (const distance of distances) {
    if (nearly(distance, edge, 1e-5)) shortCount += 1;
    else if (nearly(distance, long, 1e-5)) longCount += 1;
    else return false;
  }
  return shortCount === 5 && longCount === 5 && pentagonPlanarError(points) < 1e-6;
}

function orderPentagon(indices: number[], vertices: readonly Vec[]): number[] {
  const points = indices.map((index) => vertices[index]!);
  const edge = pairDistances(points)[0]!;
  const unused = new Set(indices);
  const cycle: number[] = [indices[0]!];
  unused.delete(indices[0]!);
  while (cycle.length < 5) {
    const current = cycle[cycle.length - 1]!;
    const previous = cycle.length > 1 ? cycle[cycle.length - 2] : null;
    let next: number | null = null;
    for (const candidate of unused) {
      if (previous === candidate) continue;
      if (!nearly(len(sub(vertices[candidate]!, vertices[current]!)), edge, 1e-5)) continue;
      next = candidate;
      break;
    }
    if (next == null) return indices;
    cycle.push(next);
    unused.delete(next);
  }
  const mid = faceCentroid(cycle.map((index) => vertices[index]!));
  const normal = cross(sub(vertices[cycle[1]!]!, vertices[cycle[0]!]!), sub(vertices[cycle[2]!]!, vertices[cycle[0]!]!));
  if (dot(normal, mid) < 0) {
    const [first, ...rest] = cycle;
    return [first!, ...rest.reverse()];
  }
  return cycle;
}

function discoverFaces(vertices: readonly Vec[]): number[][] {
  const faces: number[][] = [];
  const n = vertices.length;
  const edge = pairDistances(vertices)[0]!;
  for (let a = 0; a < n; a += 1) {
    for (let b = a + 1; b < n; b += 1) {
      for (let c = b + 1; c < n; c += 1) {
        for (let d = c + 1; d < n; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const pick = [a, b, c, d, e];
            if (!isFacePentagon(pick.map((index) => vertices[index]!), edge)) continue;
            faces.push(orderPentagon(pick, vertices));
          }
        }
      }
    }
  }
  return faces;
}

function applyRotation(vertices: Vec[], axis: Vec, angle: number): void {
  if (Math.abs(angle) < 1e-12 || len(axis) < 1e-12) return;
  for (let i = 0; i < vertices.length; i += 1) vertices[i] = rotate(vertices[i]!, axis, angle);
}

/**
 * Regular dodecahedron scaled to TOPO_R, with one face flat on top
 * (Public Speaking) and the last face on the bottom (Time Management).
 * The two rings of five are ordered clockwise around +Y.
 */
export function buildDodecahedron(): { vertices: Vec[]; faceCorners: number[][] } {
  const vertices = rawVertices();
  let faces = discoverFaces(vertices);
  if (faces.length !== 12) return { vertices, faceCorners: faces };

  const first = faces[0]!.map((index) => vertices[index]!);
  const topNormal = (() => {
    const mid = faceCentroid(first);
    const unit = scale(mid, 1 / (len(mid) || 1));
    return unit;
  })();
  const up: Vec = [0, 1, 0];
  const axis = cross(topNormal, up);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(topNormal, up))));
  if (len(axis) > 1e-8) applyRotation(vertices, axis, angle);
  else if (dot(topNormal, up) < 0) applyRotation(vertices, [1, 0, 0], Math.PI);

  const topCorners = faces[0]!.map((index) => vertices[index]!);
  const topMid = faceCentroid(topCorners);
  const spoke = sub(topCorners[0]!, topMid);
  const yaw = Math.atan2(spoke[2], spoke[0]);
  applyRotation(vertices, [0, 1, 0], -yaw);

  faces = faces.map((corners) => orderPentagon(corners, vertices));
  const ranked = faces.map((corners) => {
    const mid = faceCentroid(corners.map((index) => vertices[index]!));
    return { corners, y: mid[1], angle: Math.atan2(mid[2], mid[0]) };
  });
  ranked.sort((a, b) => {
    const layer = (y: number) => (y > 0.8 ? 0 : y > 0 ? 1 : y > -0.8 ? 2 : 3);
    const la = layer(a.y);
    const lb = layer(b.y);
    if (la !== lb) return la - lb;
    return a.angle - b.angle;
  });

  const farthest = Math.max(...vertices.map((point) => len(point)));
  const fit = TOPO_R / (farthest || 1);
  const fitted = vertices.map((point) => scale(point, fit));
  return { vertices: fitted, faceCorners: ranked.map((row) => row.corners) };
}

export function buildD12Topo(scores: InstructorD12Scores | null | undefined): TopoModel {
  const mesh = buildDodecahedron();
  const shared: Shared[] = mesh.vertices.map((point) => ({ p: point, d: point }));
  const faces: TopoFace[] = [];
  const tiles: TopoTile[] = [];
  const faceCorners = mesh.faceCorners;

  const addFace = (faceIndex: number, corners: number[]) => {
    const faceDef = INSTRUCTOR_D12_FACES[faceIndex]!;
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
    const points = corners.map((index) => shared[index]!.p);
    const mid = faceCentroid(points);
    const normal = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!));
    const unit = scale(normal, 1 / (len(normal) || 1));
    const outward = dot(unit, mid) >= 0 ? unit : scale(unit, -1);
    const offset = score == null ? null : TOPO_LEVEL[score as ReliefScore];
    const apex = offset == null ? null : add(mid, scale(outward, offset));
    const tris: [number, number, number][] = [
      [corners[0]!, corners[1]!, corners[2]!],
      [corners[0]!, corners[2]!, corners[3]!],
      [corners[0]!, corners[3]!, corners[4]!],
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

  faceCorners.forEach((corners, faceIndex) => addFace(faceIndex, corners));

  return {
    revision: TOPO_REVISION,
    vertices: mesh.vertices,
    faceCorners,
    faces,
    tiles,
    unmapped: [],
    matchesCitedLists: false,
  };
}
