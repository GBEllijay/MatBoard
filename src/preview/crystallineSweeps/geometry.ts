/**
 * Deterministic Sweeps tiles. Boundary vertices stay fixed.
 * Only a rated tile's centroid apex moves on the normal.
 * Curved relief reuses these vertices; it does not build a second mesh.
 */

export const LAYOUT_REVISION = 'sweeps-hex-r1';
export const HEX_RADIUS = 1;
/** H is this fraction of the tile's own base radius. Modest on purpose. */
export const HEIGHT_RATIO = 0.5;

export type ReliefScore = 1 | 2 | 3 | 4 | 5;

/**
 * One height table for pointed and curved relief.
 * Steps are counted from the old linear scale, where one step was H/2 and score 5 was H.
 * Score 4 is 3 steps (1.5H). Score 5 is 7 steps (3.5H). Score 3 stays flat.
 */
export const RELIEF_STEPS: Record<ReliefScore, number> = {
  1: -3.5,
  2: -1.5,
  3: 0,
  4: 1.5,
  5: 3.5,
};

export type Vec3 = { x: number; y: number; z: number };

export type SweepLayout = {
  revision: typeof LAYOUT_REVISION;
  /** Index 0 is the shared center. Indexes 1..6 are the hexagon rim, in order. */
  vertices: Vec3[];
  tiles: { id: string; vertexIndices: [number, number, number] }[];
};

export type Facet = {
  tileId: string;
  index: 0 | 1 | 2;
  /** [boundary A, boundary B, apex]. The A–B edge is a shared boundary. */
  corners: [Vec3, Vec3, Vec3];
};

export type TileMesh = {
  id: string;
  boundary: [Vec3, Vec3, Vec3];
  centroid: Vec3;
  score: ReliefScore | null;
  /** Null when the move has no score. Zero is the flat score 3, not an empty score. */
  apex: Vec3 | null;
  height: number | null;
  facets: [Facet, Facet, Facet] | null;
};

export type CurveEdge = { from: Vec3; control: Vec3; to: Vec3 };

export type FacetCurve = {
  base: [Vec3, Vec3];
  toApex: [CurveEdge, CurveEdge];
};

const TAU_STEP = Math.PI / 3;

export function buildSweepLayout(ids: readonly string[]): SweepLayout {
  const vertices: Vec3[] = [{ x: 0, y: 0, z: 0 }];
  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + i * TAU_STEP;
    vertices.push({ x: HEX_RADIUS * Math.cos(angle), y: HEX_RADIUS * Math.sin(angle), z: 0 });
  }
  const tiles = ids.slice(0, 6).map((id, index) => {
    const rim = index + 1;
    const next = index === 5 ? 1 : rim + 1;
    return { id, vertexIndices: [rim, next, 0] as [number, number, number] };
  });
  return { revision: LAYOUT_REVISION, vertices, tiles };
}

export function tileVertices(layout: SweepLayout, indexes: readonly number[]): Vec3[] {
  return indexes.map((index) => layout.vertices[index]);
}

export function centroidOf(points: readonly Vec3[]): Vec3 {
  const n = points.length || 1;
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / n, y: sum.y + point.y / n, z: sum.z + point.z / n }),
    { x: 0, y: 0, z: 0 },
  );
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/** Same cap for every tile in this regular partition. */
export function heightCap(layout: SweepLayout): number {
  const first = layout.tiles[0];
  if (!first) return 0;
  const boundary = tileVertices(layout, first.vertexIndices);
  const centroid = centroidOf(boundary);
  const base = Math.max(...boundary.map((point) => distance(centroid, point)));
  return base * HEIGHT_RATIO;
}

export function reliefOffset(score: ReliefScore | null, cap: number): number | null {
  if (score == null) return null;
  return RELIEF_STEPS[score] * cap;
}

export function buildTileMesh(layout: SweepLayout, id: string, score: ReliefScore | null): TileMesh | null {
  const tile = layout.tiles.find((item) => item.id === id);
  if (!tile) return null;
  const boundary = tileVertices(layout, tile.vertexIndices) as [Vec3, Vec3, Vec3];
  const centroid = centroidOf(boundary);
  const height = reliefOffset(score, heightCap(layout));
  if (height == null) {
    return { id, boundary, centroid, score, apex: null, height: null, facets: null };
  }
  const apex = { x: centroid.x, y: centroid.y, z: centroid.z + height };
  const [a, b, c] = boundary;
  const facet = (index: 0 | 1 | 2, p: Vec3, q: Vec3): Facet => ({
    tileId: id,
    index,
    corners: [p, q, apex],
  });
  return {
    id,
    boundary,
    centroid,
    score,
    apex,
    height,
    facets: [facet(0, a, b), facet(1, b, c), facet(2, c, a)],
  };
}

/**
 * Bow the two apex edges inward. The apex and the shared boundary stay put.
 * A flat score (height 0) stays straight, so curved and pointed agree on 3.
 */
export function facetCurve(facet: Facet): FacetCurve {
  const [a, b, apex] = facet.corners;
  const flat = Math.abs(a.z - apex.z) < 1e-9 && Math.abs(b.z - apex.z) < 1e-9;
  const face = centroidOf(facet.corners);
  const boundaryZ = (a.z + b.z) / 2;
  const bow = (from: Vec3, to: Vec3): Vec3 => {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    if (flat) return mid;
    return {
      x: mid.x + (face.x - mid.x) * 0.55,
      y: mid.y + (face.y - mid.y) * 0.55,
      z: mid.z + (boundaryZ - mid.z) * 0.35,
    };
  };
  return {
    base: [a, b],
    toApex: [
      { from: b, control: bow(b, apex), to: apex },
      { from: apex, control: bow(apex, a), to: a },
    ],
  };
}

/** Points the camera must keep on screen, including both spike directions. */
export function fitEnvelope(layout: SweepLayout): Vec3[] {
  const cap = heightCap(layout);
  const points = layout.vertices.map((point) => ({ ...point }));
  for (const tile of layout.tiles) {
    const center = centroidOf(tileVertices(layout, tile.vertexIndices));
    points.push(
      { x: center.x, y: center.y, z: RELIEF_STEPS[5] * cap },
      { x: center.x, y: center.y, z: RELIEF_STEPS[1] * cap },
    );
  }
  return points;
}
