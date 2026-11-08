/**
 * Fictional self and opponent scores for the overlay experiment.
 * Same eight factors and the six real Sweeps catalog moves.
 * A higher number is only a higher example score, not a prediction.
 */

import { SHEET_AXIS_IDS, type AxisId } from '../assessmentRadar/model.ts';
import type { ReliefScore } from './geometry.ts';

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
