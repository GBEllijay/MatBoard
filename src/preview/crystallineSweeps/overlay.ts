/**
 * Fictional self and opponent scores for the overlay experiment.
 * Same eight factors and the six real Sweeps catalog moves.
 * A higher number is only a higher example score, not a prediction.
 */

import { isAssessmentScore, type AssessmentScores } from '../../lib/studentAssessment.ts';
import type { AreaRatings } from '../../lib/opponentAssessment.ts';
import { SHEET_AXIS_IDS, type AxisId } from '../assessmentRadar/model.ts';
import type { ReliefScore } from './geometry.ts';

const AREA_AXIS = {
  guard: 'guard-control',
  passing: 'passing',
  sweeps: 'sweeps',
  takedowns: 'takedowns',
  escapes: 'escapes-defense',
  submissions: 'submissions',
  conditioning: 'conditioning',
  mindset: 'mindset',
} as const satisfies Record<string, AxisId>;

export type CompareFactors = {
  self: Partial<Record<AxisId, ReliefScore>>;
  opponent: Partial<Record<AxisId, ReliefScore>>;
};

/** Map a scouting card or a self-assessment onto the eight diamond faces. Blank areas stay off. */
export function factorsFromRatings(
  ratings: AreaRatings | Partial<AssessmentScores> | null | undefined,
): Partial<Record<AxisId, ReliefScore>> {
  const out: Partial<Record<AxisId, ReliefScore>> = {};
  if (!ratings) return out;
  const row = ratings as Partial<Record<keyof typeof AREA_AXIS, unknown>>;
  for (const area of Object.keys(AREA_AXIS) as (keyof typeof AREA_AXIS)[]) {
    const score = row[area];
    if (isAssessmentScore(score)) out[AREA_AXIS[area]] = score;
  }
  return out;
}

export const EXAMPLE_SELF_FACTORS = {
  'guard-control': 5,
  passing: 2,
  sweeps: 4,
  takedowns: 1,
  'escapes-defense': 3,
  submissions: 5,
  conditioning: 2,
  mindset: 4,
} as const satisfies Record<AxisId, ReliefScore>;

export const EXAMPLE_OPPONENT_FACTORS = {
  'guard-control': 2,
  passing: 5,
  sweeps: 1,
  takedowns: 4,
  'escapes-defense': 5,
  submissions: 2,
  conditioning: 4,
  mindset: 1,
} as const satisfies Record<AxisId, ReliefScore>;

/** The six Sweeps names already in the catalog. Not a new requirement list. */
export const EXAMPLE_SELF_SWEEPS = {
  'sweep.scissor': 5,
  'sweep.hip-bump': 2,
  'sweep.pendulum': 3,
  'sweep.flower': 1,
  'sweep.tripod': 4,
  'sweep.butterfly': 2,
} as const satisfies Record<string, ReliefScore>;

export const EXAMPLE_OPPONENT_SWEEPS = {
  'sweep.scissor': 1,
  'sweep.hip-bump': 4,
  'sweep.pendulum': 5,
  'sweep.flower': 3,
  'sweep.tripod': 2,
  'sweep.butterfly': 5,
} as const satisfies Record<string, ReliefScore>;

export function exampleCompare(self: ReliefScore, opponent: ReliefScore): string {
  if (self === opponent) return 'Same example score';
  if (self > opponent) return 'Example self is higher';
  return 'Example opponent is higher';
}

export function factorComparisons(): { id: AxisId; self: ReliefScore; opponent: ReliefScore; note: string }[] {
  return SHEET_AXIS_IDS.map((id) => ({
    id,
    self: EXAMPLE_SELF_FACTORS[id],
    opponent: EXAMPLE_OPPONENT_FACTORS[id],
    note: exampleCompare(EXAMPLE_SELF_FACTORS[id], EXAMPLE_OPPONENT_FACTORS[id]),
  }));
}
