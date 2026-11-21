/**
 * 3D instructor D12: a regular dodecahedron that TopoStage can draw.
 * Twelve pentagonal faces, 20 vertices, and 30 edges, in the same order
 * as instructorD12.ts. Each pentagon is fanned from its center into five
 * equal coplanar triangles, and each slice then follows the D8 barycentric
 * split (n×n, 5n² tiles on a face). The student D8 octahedron in buildTopo
 * is left alone.
 */
import type { ReliefScore } from '../preview/crystallineSweeps/geometry.ts';
import type { AxisId } from '../preview/assessmentRadar/model.ts';
import { TOPO_LEVEL, TOPO_R, TOPO_REVISION, faceCentroid, type TopoFace, type TopoModel, type TopoMove, type TopoTile, type Vec } from '../preview/crystallineSweeps/topo.ts';
import { INSTRUCTOR_D12_FACES, type InstructorD12Scores } from './instructorD12.ts';
import { isAssessmentScore } from './studentAssessment.ts';
import {
  d12CardsInPlaceOrder,
  d12CardsOnFace,
  d12FaceRelief,
  type D12ShapeMetric,
  type InstructorD12Card,
} from './instructorD12Cards.ts';

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

/**
 * Five pizza-slice triangles fan from the face center. Each slice then
 * splits with the same n×n barycentric rule as the student D8, so a face
 * holds 5n² tiles: 5, then 20, 45, 80, 125, and so on.
 */
export const D12_FACE_SLICES = 5;
/** Smallest split a face uses: one tile per slice, five tiles on the face. */
export const D12_FACE_GRID_MIN = 1;
/**
 * Browser-safety clamp only (18×18 × 5 = 1,620 tiles on one face). Not a product cap.
 * An instructor adding cards one at a time will not reach this.
 */
export const D12_FACE_GRID_SAFE = 18;

/** Tiles a face can show at the safety clamp: 5 × 18 × 18. */
export const D12_FACE_TILE_SAFE = D12_FACE_SLICES * D12_FACE_GRID_SAFE * D12_FACE_GRID_SAFE;

/**
 * Rows per slice for a card count. Up to 5 cards is n=1 (5 tiles), 6–20 is
 * n=2 (20), 21–45 is n=3 (45), 46–80 is n=4 (80), then the face keeps
 * subdividing at square-number crossings of 5n².
 */
export function d12FaceGridSize(count: number): number {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const n = Math.max(D12_FACE_GRID_MIN, Math.ceil(Math.sqrt(safe / D12_FACE_SLICES)));
  return Math.min(D12_FACE_GRID_SAFE, n);
}

/** Tiles a face can show for a card count: 5n², starting at 5. */
export function d12FaceTileCap(count: number): number {
  const n = d12FaceGridSize(count);
  return D12_FACE_SLICES * n * n;
}

const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function tileMid(tri: [Shared, Shared, Shared]): Vec {
  return [
    (tri[0].p[0] + tri[1].p[0] + tri[2].p[0]) / 3,
    (tri[0].p[1] + tri[1].p[1] + tri[2].p[1]) / 3,
    (tri[0].p[2] + tri[1].p[2] + tri[2].p[2]) / 3,
  ];
}

function vertAt(shared: Map<string, Shared>, point: Vec): Shared {
  const key = point.map((value) => value.toFixed(5)).join();
  const found = shared.get(key);
  if (found) return found;
  const entry = { p: point, d: point };
  shared.set(key, entry);
  return entry;
}

/** n×n barycentric split of one pizza slice, apex first, same winding as the D8. */
function subdivideSlice(apex: Vec, left: Vec, right: Vec, n: number, vert: (point: Vec) => Shared): [Shared, Shared, Shared][] {
  const pointAt = (i: number, j: number): Shared => {
    const alongLeft = lerp(apex, left, i / n);
    const alongRight = lerp(apex, right, i / n);
    return vert(i ? lerp(alongLeft, alongRight, j / i) : apex);
  };
  const list: [Shared, Shared, Shared][] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      list.push([pointAt(i, j), pointAt(i + 1, j), pointAt(i + 1, j + 1)]);
      if (j < i) list.push([pointAt(i, j), pointAt(i + 1, j + 1), pointAt(i, j + 1)]);
    }
  }
  return list;
}

function faceOutward(points: readonly Vec[]): { mid: Vec; outward: Vec } {
  const mid = faceCentroid(points);
  const normal = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!));
  const unit = scale(normal, 1 / (len(normal) || 1));
  const outward = dot(unit, mid) >= 0 ? unit : scale(unit, -1);
  return { mid, outward };
}

function rankFaceTiles<T extends { tri: [Shared, Shared, Shared]; index: number }>(
  items: readonly T[],
  mid: Vec,
): T[] {
  return [...items].sort((left, right) => {
    const leftMid = tileMid(left.tri);
    const rightMid = tileMid(right.tri);
    const leftDistance = Math.hypot(leftMid[0] - mid[0], leftMid[1] - mid[1], leftMid[2] - mid[2]);
    const rightDistance = Math.hypot(rightMid[0] - mid[0], rightMid[1] - mid[1], rightMid[2] - mid[2]);
    const leftAngle = Math.atan2(leftMid[1] - mid[1], leftMid[0] - mid[0]);
    const rightAngle = Math.atan2(rightMid[1] - mid[1], rightMid[0] - mid[0]);
    return leftDistance - rightDistance || leftAngle - rightAngle || left.index - right.index;
  });
}

function reliefFor(card: InstructorD12Card | null | undefined): { offset: number | null; score: ReliefScore | null } {
  if (!card || !isAssessmentScore(card.rating)) return { offset: null, score: null };
  return { offset: TOPO_LEVEL[card.rating as ReliefScore], score: card.rating as ReliefScore };
}

export type D12TopoOptions = {
  cards?: readonly InstructorD12Card[];
  /** Rows per slice on one face. Without it, a face splits just enough for its cards. */
  gridFor?: (faceIndex: number) => number;
};

export function buildD12Topo(scores: InstructorD12Scores | null | undefined, options?: D12TopoOptions): TopoModel {
  const mesh = buildDodecahedron();
  const vertShare = new Map<string, Shared>();
  const faces: TopoFace[] = [];
  const tiles: TopoTile[] = [];
  const faceCorners = mesh.faceCorners;
  const allCards = options?.cards ?? [];
  // Check-in `scores` stay separate; tile heights come from card ratings only.
  void scores;

  const addFace = (faceIndex: number, corners: number[]) => {
    const faceDef = INSTRUCTOR_D12_FACES[faceIndex]!;
    const faceId = faceDef.id as AxisId;
    const mine = d12CardsInPlaceOrder(d12CardsOnFace(allCards, faceDef.id));
    const asked = options?.gridFor?.(faceIndex);
    const raw =
      asked != null && Number.isFinite(asked)
        ? Math.max(D12_FACE_GRID_MIN, Math.round(asked))
        : d12FaceGridSize(mine.length);
    const n = Math.min(D12_FACE_GRID_SAFE, raw);
    const points = corners.map((index) => mesh.vertices[index]!);
    const { mid, outward } = faceOutward(points);
    const vert = (point: Vec) => vertAt(vertShare, point);
    const list: [Shared, Shared, Shared][] = [];
    for (let slice = 0; slice < D12_FACE_SLICES; slice += 1) {
      list.push(...subdivideSlice(mid, points[slice]!, points[(slice + 1) % D12_FACE_SLICES]!, n, vert));
    }
    const ranked = rankFaceTiles(
      list.map((tri, index) => ({ tri, index })),
      mid,
    );
    const placed = mine.slice(0, list.length);
    const moveAt = new Map<number, { move: TopoMove; card: InstructorD12Card }>();
    const moves: TopoMove[] = [];
    placed.forEach((card, index) => {
      const slot = ranked[index];
      if (!slot) return;
      const move: TopoMove = { id: card.id, name: card.name, subtype: 'card', faceId };
      moves.push(move);
      moveAt.set(slot.index, { move, card });
    });
    faces.push({
      id: faceId,
      name: faceDef.label,
      meaning: '',
      manualOnly: false,
      moves,
    });
    list.forEach((tri, triIndex) => {
      const found = moveAt.get(triIndex);
      const { offset } = reliefFor(found?.card);
      const centroid = tileMid(tri);
      const apex = offset == null ? null : add(centroid, scale(outward, offset));
      tiles.push({
        index: tiles.length,
        faceIndex,
        faceId,
        tri,
        move: found?.move ?? null,
        offset,
        apex,
      });
    });
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

/**
 * Paint cards onto the face's existing triangles, at most one per tile.
 * The mesh is not resized here. Extra cards are not given a new row.
 * `shown` should already be in place order, closest tiles first.
 */
export function showOnD12Face(model: TopoModel, faceIndex: number, shown: readonly InstructorD12Card[]): void {
  const face = model.faces[faceIndex];
  const tiles = model.tiles.filter((tile) => tile.faceIndex === faceIndex);
  if (!face || !tiles.length) return;
  const corners = model.faceCorners[faceIndex]!.map((index) => model.vertices[index]!);
  const { mid, outward } = faceOutward(corners);
  const ranked = rankFaceTiles(tiles, mid);
  const capped = shown.slice(0, ranked.length);
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
    const { offset } = reliefFor(card);
    tile.offset = offset;
    const centroid = tileMid(tile.tri);
    tile.apex = offset == null ? null : add(centroid, scale(outward, offset));
  });
}


/**
 * Paint every tile on a face to the selected shape metric. Card labels stay
 * where they were. This does not read or write storage.
 */
export function applyD12ShapeMetric(
  model: TopoModel,
  metric: D12ShapeMetric,
  cards: readonly InstructorD12Card[],
  scores: InstructorD12Scores | null | undefined,
): void {
  for (let faceIndex = 0; faceIndex < model.faces.length; faceIndex += 1) {
    const faceDef = INSTRUCTOR_D12_FACES[faceIndex];
    if (!faceDef) continue;
    const relief = d12FaceRelief(faceDef.id, metric, cards, scores);
    const offset = relief == null ? null : TOPO_LEVEL[relief as ReliefScore];
    const tiles = model.tiles.filter((tile) => tile.faceIndex === faceIndex);
    if (!tiles.length) continue;
    const corners = model.faceCorners[faceIndex]!.map((index) => model.vertices[index]!);
    const { outward } = faceOutward(corners);
    for (const tile of tiles) {
      tile.offset = offset;
      const centroid = tileMid(tile.tri);
      tile.apex = offset == null ? null : add(centroid, scale(outward, offset));
    }
  }
}

/** Put a new card on one empty tile. The other tiles stay where they are. Unrated has no relief. */
export function placeOnEmptyD12Slot(model: TopoModel, tileIndex: number, card: InstructorD12Card): boolean {
  const tile = model.tiles[tileIndex];
  if (!tile || tile.move) return false;
  const move: TopoMove = { id: card.id, name: card.name, subtype: 'added', faceId: tile.faceId };
  tile.move = move;
  const face = model.faces[tile.faceIndex];
  face.moves = [...face.moves, move];
  const corners = model.faceCorners[tile.faceIndex]!.map((index) => model.vertices[index]!);
  const { outward } = faceOutward(corners);
  const { offset } = reliefFor(card);
  tile.offset = offset;
  const centroid = tileMid(tile.tri);
  tile.apex = offset == null ? null : add(centroid, scale(outward, offset));
  return true;
}

export type D12FaceSlot = {
  tileIndex: number;
  moveId: string | null;
  label: string | null;
  /** Percent across the face, left to right. */
  x: number;
  /** Percent down the face. */
  y: number;
  /** Ring from the face center, 0 first. */
  row: number;
  /** Rows per slice on this face: 1 or more. */
  grid: number;
};

/** Flat map of one pentagon. Filled cards stay near the middle. Empty tiles stay farther out. */
export function d12FaceSlots(model: TopoModel, faceIndex: number): D12FaceSlot[] {
  const corners = model.faceCorners[faceIndex];
  if (!corners) return [];
  const points = corners.map((index) => model.vertices[index]!);
  const mid = faceCentroid(points);
  const u = scale(sub(points[0]!, mid), 1 / (len(sub(points[0]!, mid)) || 1));
  const outwardGuess = cross(u, sub(points[1]!, mid));
  const v = scale(outwardGuess, 1 / (len(outwardGuess) || 1));
  const onFace = model.tiles.filter((tile) => tile.faceIndex === faceIndex);
  const grid = Math.max(1, Math.round(Math.sqrt(onFace.length / D12_FACE_SLICES)));
  const raw = onFace.map((tile) => {
    const centroid = tileMid(tile.tri);
    const rel = sub(centroid, mid);
    const distance = len(rel);
    const row = Math.min(grid - 1, Math.max(0, Math.floor((distance / ((len(sub(points[0]!, mid)) || 1) + 1e-9)) * grid)));
    return { tile, x: dot(rel, u), y: dot(rel, v), row, distance };
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
    row: item.row,
    grid,
  }));
}

