/**
 * Display map from a saved 7-area check-in onto the approved 8-area octagon.
 * Nothing here reads or writes storage. A saved day stays as it was saved.
 * Sweeps has no stored value, so it stays unrated. Passing is not copied in.
 */
import { AXES, SHEET_AXIS_IDS, type AxisId } from '../preview/assessmentRadar/model.ts';
import { isAssessmentScore, type AssessmentScores } from './studentAssessment.ts';

/** Old check-in field for each approved area. Sweeps has none. */
const LEGACY_SOURCE: Record<AxisId, keyof AssessmentScores | null> = {
  'guard-control': 'guard',
  passing: 'passing',
  sweeps: null,
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
    const source = LEGACY_SOURCE[id];
    if (!scores || source == null) return { id, label, value: null };
    const raw = scores[source];
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
