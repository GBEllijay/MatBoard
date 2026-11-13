/**
 * Flat, printable picture of the D8 diamond for the self-assessment PDF and print sheet.
 * The live D8 is an octahedron: eight faces, one per area. From straight on you see a
 * diamond cut into four triangles; turn it over and you see the other four.
 * Face placement follows the D8 mesh corners (+x/-x, +y/-y, +z/-z in SHEET_AXIS_IDS order),
 * so faces that share an edge on the D8 share an edge here too.
 * Nothing here reads or writes storage.
 */

import { shapeAxesFromLegacy, type ShapeAxisReading } from './shapeAxes.ts';
import type { AssessmentScores } from './studentAssessment.ts';

export type DiamondSide = 'front' | 'back';
/** Quadrant of the flat diamond, in screen terms (y grows downward). */
export type DiamondQuadrant = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

export type DiamondFace = {
  side: DiamondSide;
  quadrant: DiamondQuadrant;
  axis: ShapeAxisReading;
};

/**
 * Index into SHEET_AXIS_IDS for each quadrant.
 * Front looks down +z: +x right, +y up. Back is the D8 turned over left-to-right, so +x shows on the left.
 */
export const DIAMOND_LAYOUT: Record<DiamondSide, Record<DiamondQuadrant, number>> = {
  // guard-control (+x+y+z), sweeps (+x-y+z), escapes-defense (-x+y+z), conditioning (-x-y+z)
  front: { 'top-right': 0, 'bottom-right': 2, 'top-left': 4, 'bottom-left': 6 },
  // passing (+x+y-z), takedowns (+x-y-z), submissions (-x+y-z), mindset (-x-y-z)
  back: { 'top-left': 1, 'bottom-left': 3, 'top-right': 5, 'bottom-right': 7 },
};

export const DIAMOND_QUADRANTS: readonly DiamondQuadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export function diamondFaces(scores: Partial<AssessmentScores> | null | undefined): DiamondFace[] {
  const axes = shapeAxesFromLegacy(scores);
  const faces: DiamondFace[] = [];
  for (const side of ['front', 'back'] as const) {
    for (const quadrant of DIAMOND_QUADRANTS) {
      const axis = axes[DIAMOND_LAYOUT[side][quadrant]];
      if (axis) faces.push({ side, quadrant, axis });
    }
  }
  return faces;
}

type Point = { x: number; y: number };

/** Triangle for one quadrant: center, then the two diamond tips it touches. Screen coordinates. */
export function quadrantTriangle(center: Point, radius: number, quadrant: DiamondQuadrant): [Point, Point, Point] {
  const top = { x: center.x, y: center.y - radius };
  const bottom = { x: center.x, y: center.y + radius };
  const left = { x: center.x - radius, y: center.y };
  const right = { x: center.x + radius, y: center.y };
  switch (quadrant) {
    case 'top-right':
      return [center, top, right];
    case 'bottom-right':
      return [center, right, bottom];
    case 'top-left':
      return [center, left, top];
    default:
      return [center, bottom, left];
  }
}

export function triangleCentroid(tri: readonly Point[]): Point {
  return { x: (tri[0]!.x + tri[1]!.x + tri[2]!.x) / 3, y: (tri[0]!.y + tri[1]!.y + tri[2]!.y) / 3 };
}

/** Fill strength for a score. Darker is higher. Unrated is null, never a made-up number. */
export function diamondShade(value: number | null): number | null {
  if (value == null) return null;
  return 0.16 + ((Math.min(5, Math.max(1, value)) - 1) / 4) * 0.74;
}

/** Plain sentence for screen readers and the PDF legend. */
export function diamondSummary(scores: Partial<AssessmentScores> | null | undefined): string {
  const faces = diamondFaces(scores);
  if (!faces.some((face) => face.axis.value != null)) return 'Diamond. No saved ratings yet.';
  const bits = (side: DiamondSide) =>
    faces
      .filter((face) => face.side === side)
      .map((face) => `${face.axis.label} ${face.axis.value ?? 'not rated'}`)
      .join(', ');
  return `Diamond, front: ${bits('front')}. Back: ${bits('back')}.`;
}
