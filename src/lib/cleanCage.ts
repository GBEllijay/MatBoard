/**
 * Direction A clean cage, shared by the profile Shape radar and the
 * opponent spider. The spider used to plot the original seven stored
 * areas, so the web closed as a heptagon and Sweeps had no vertex.
 * This octagon always has eight axes. A missing score stays off the
 * shape. It is not drawn as zero.
 *
 * Lengths are viewBox units. The same drawing scales from a phone card
 * to a TV. The frame is thinner than the 11-unit mockup so the live
 * label size still fits a 390px card.
 */

import type { AssessmentScores } from './studentAssessment.ts';
import { shapeAxesFromLegacy } from './shapeAxes.ts';

export const CAGE_VB = 220;
export const CAGE_CX = 110;
export const CAGE_CY = 110;
/** Centerline of the padded rim. */
export const CAGE_OUTER = 86;
/** Mockup A uses 11. Thinned so the live labels keep the phone card. */
export const CAGE_FRAME = 7;
/** Thin fence. The mesh tile matches this band. */
export const CAGE_FENCE = 4.6;
export const CAGE_TILE = CAGE_FENCE;
export const CAGE_MAT = CAGE_OUTER - CAGE_FRAME / 2 - CAGE_FENCE;
export const CAGE_DATA = CAGE_MAT - 4;
export const CAGE_LOGO = 15;
export const CAGE_POST = 4.2;
export const CAGE_AXES = 8;

export const CAGE_ME = '#6ea8ff';
export const CAGE_ME_FILL = '#004eba';
export const CAGE_ME_FILL_PROFILE = 0.36;
export const CAGE_ME_FILL_OVERLAY = 0.28;
export const CAGE_OPPONENT = '#ff8a3d';
export const CAGE_OPPONENT_FILL_OPACITY = 0.22;
export const CAGE_WIRE = '#8a93a2';
export const CAGE_WIRE_WIDTH = 0.4;
export const CAGE_WIRE_OPACITY = 0.38;

export function isCageScore(value: number | null | undefined): value is number {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** Always eight axes. A short list does not become a heptagon. */
export function eightValues(values: readonly (number | null)[] | null | undefined): (number | null)[] {
  return Array.from({ length: CAGE_AXES }, (_, index) => (isCageScore(values?.[index]) ? values[index] : null));
}

export function cagePoint(index: number, value: number, radius = CAGE_DATA): { x: number; y: number } {
  const theta = -Math.PI / 2 + (index * 2 * Math.PI) / CAGE_AXES;
  const span = (value / 5) * radius;
  return {
    x: CAGE_CX + Math.cos(theta) * span,
    y: CAGE_CY + Math.sin(theta) * span,
  };
}

export function octagonAt(radius: number): { x: number; y: number }[] {
  return Array.from({ length: CAGE_AXES }, (_, index) => cagePoint(index, 5, radius));
}

export function formatCagePoints(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

export function octagonPath(radius: number): string {
  const ring = octagonAt(radius);
  return `M ${ring.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')} Z`;
}

/** Closed shape, or null when any axis is unrated. */
export function cageSeriesPoints(values: readonly (number | null)[]): { x: number; y: number }[] | null {
  const eight = eightValues(values);
  if (!eight.every(isCageScore)) return null;
  return eight.map((value, index) => cagePoint(index, value));
}

/** Rated runs walking clockwise. A gap is skipped, not filled with the center. */
export function cageRuns(values: readonly (number | null)[]): number[][] {
  const eight = eightValues(values);
  const rated = eight.map((value) => value != null);
  if (!rated.some(Boolean)) return [];
  if (rated.every(Boolean)) return [eight.map((_, index) => index)];
  const firstGap = rated.findIndex((value) => !value);
  const runs: number[][] = [];
  let index = (firstGap + 1) % CAGE_AXES;
  let seen = 0;
  while (seen < CAGE_AXES) {
    if (!rated[index]) {
      index = (index + 1) % CAGE_AXES;
      seen += 1;
      continue;
    }
    const run: number[] = [];
    while (rated[index] && run.length < CAGE_AXES) {
      run.push(index);
      index = (index + 1) % CAGE_AXES;
      seen += 1;
    }
    runs.push(run);
  }
  return runs;
}

export function fencePaths(tile = CAGE_TILE): { a: string; b: string } {
  const t = tile;
  return {
    a: `M-1,1 L1,-1 M0,${t} L${t},0 M${t - 1},${t + 1} L${t + 1},${t - 1}`,
    b: `M-1,${t - 1} L1,${t + 1} M0,0 L${t},${t} M${t - 1},-1 L${t + 1},1`,
  };
}

/** Accessible name for the opponent spider. Eight official labels, including an unrated Sweeps. */
export function scoutCageLabel(
  opponentName: string,
  mine: Partial<AssessmentScores> | null,
  theirs: Partial<AssessmentScores> | null,
): string {
  const described = (name: string, scores: Partial<AssessmentScores>) => {
    const bits = shapeAxesFromLegacy(scores)
      .map((axis) => (axis.value == null ? `${axis.label} not rated` : `${axis.label} ${axis.value}`))
      .join(', ');
    return { name, bits };
  };
  const rows = [mine ? described('Me', mine) : null, theirs ? described(opponentName, theirs) : null].filter(
    (row): row is { name: string; bits: string } => row != null,
  );
  if (rows.length === 2) return `Me versus ${opponentName}. ${rows.map((row) => `${row.name}: ${row.bits}`).join('. ')}`;
  if (rows.length === 1) {
    const only = rows[0];
    if (only.name === 'Me') return `Me versus ${opponentName}. Me: ${only.bits}`;
    return `${only.name} shape, ${only.bits}`;
  }
  return `${opponentName} has no ratings`;
}
