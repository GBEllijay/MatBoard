/**
 * Display map from a saved check-in onto the approved 8-area octagon.
 * Nothing here reads or writes storage.
 * Guard and Escapes keep their old stored ids.
 * Sweeps is read only from its own field. A day saved before that field exists stays unrated.
 */
import { AXES, SHEET_AXIS_IDS, type AxisId } from '../preview/assessmentRadar/model.ts';
import { isAssessmentScore, type AssessmentScores } from './studentAssessment.ts';

/** Stored field for each approved area. Sweeps has no older name to borrow. */
const LEGACY_SOURCE: Record<AxisId, keyof AssessmentScores> = {
  'guard-control': 'guard',
  passing: 'passing',
  sweeps: 'sweeps',
  takedowns: 'takedowns',
  'escapes-defense': 'escapes',
  submissions: 'submissions',
  conditioning: 'conditioning',
  mindset: 'mindset',
};

export type ShapeAxisReading = {
  id: AxisId;
  label: string;
  /** Null means not yet rated. Never a made-up number. */
  value: number | null;
};

export const SHAPE_CATEGORY_ORDER = SHEET_AXIS_IDS;

export function shapeAxesFromLegacy(scores: Partial<AssessmentScores> | null | undefined): ShapeAxisReading[] {
  return SHEET_AXIS_IDS.map((id) => {
    const axis = AXES.find((item) => item.id === id);
    const label = axis?.label ?? id;
    if (!scores) return { id, label, value: null };
    const raw = scores[LEGACY_SOURCE[id]];
    return { id, label, value: isAssessmentScore(raw) ? raw : null };
  });
}

export function shapeAxisValues(scores: Partial<AssessmentScores> | null | undefined): (number | null)[] {
  return shapeAxesFromLegacy(scores).map((axis) => axis.value);
}

export function shapeAxisLabel(scores: Partial<AssessmentScores> | null | undefined): string {
  const axes = shapeAxesFromLegacy(scores);
  if (!axes.some((axis) => axis.value != null)) return 'Self-assessment shape. No saved ratings yet.';
  const bits = axes
    .map((axis) => (axis.value == null ? `${axis.label} not rated` : `${axis.label} ${axis.value}`))
    .join(', ');
  return `Self-assessment shape, ${bits}`;
}
