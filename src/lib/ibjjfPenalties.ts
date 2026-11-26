import { clamp } from './format.ts';

export type PenaltyLadder = 'adult' | 'kids';

export const ADULT_PENALTY_DQ = 4;
export const KIDS_PENALTY_DQ = 6;

const KIDS_DIVISION_RE =
  /\b(kids?|pee[- ]?wee|mighty[- ]?mite|infantil|infanto[- ]?juvenil|pre[- ]?teen|youth|junior|u-?1[0-5]|under[- ]?15)\b/i;
const ADULT_OR_JUVENILE_RE = /\b(adult|adults|master|masters|juvenile)\b/i;

export function isKidsPenaltyLadder(input: {
  kidsRules?: boolean;
  division?: string;
  skin?: string;
  kidsBracketActive?: boolean;
}): boolean {
  if (input.kidsRules) return true;
  if (input.skin === 'kids-arcade' || input.skin === 'kids-sticker') return true;
  const division = input.division?.trim() ?? '';
  if (division) {
    if (KIDS_DIVISION_RE.test(division)) return true;
    if (ADULT_OR_JUVENILE_RE.test(division)) return false;
  }
  return Boolean(input.kidsBracketActive);
}

export function penaltyLadderFor(input: {
  kidsRules?: boolean;
  division?: string;
  skin?: string;
  kidsBracketActive?: boolean;
}): PenaltyLadder {
  return isKidsPenaltyLadder(input) ? 'kids' : 'adult';
}

export function penaltyDqThreshold(ladder: PenaltyLadder): number {
  return ladder === 'kids' ? KIDS_PENALTY_DQ : ADULT_PENALTY_DQ;
}

export type PenaltyStepResult = {
  penalties: number;
  opponentPoints: number;
  opponentAdvantages: number;
  triggerDq: boolean;
  clearAutoDq: boolean;
};

/**
 * IBJJF Rule Book v6.1 Art. 7.2 escalating penalty ladder:
 * - Adult / Juvenile (16+): 1st marked; 2nd -> +1 adv to opponent; 3rd -> +2 pts; 4th -> DQ.
 * - Kids (under 15): 1st marked; 2nd -> +1 adv; 3rd, 4th, 5th -> +2 pts each; 6th -> DQ.
 * Stepping down (-1) reverses each step's award and clears an auto-DQ when dropping below DQ.
 */
export function applyPenaltyDelta(input: {
  ladder: PenaltyLadder;
  currentPenalties: number;
  opponentPoints: number;
  opponentAdvantages: number;
  delta: number;
  maxPoints?: number;
  maxAdvantages?: number;
}): PenaltyStepResult {
  const dqAt = penaltyDqThreshold(input.ladder);
  const maxPoints = input.maxPoints ?? 99;
  const maxAdvantages = input.maxAdvantages ?? 99;
  const current = clamp(Math.round(input.currentPenalties), 0, 9);
  const ceiling = input.delta < 0 ? Math.max(dqAt, current) : dqAt;
  const next = clamp(current + Math.round(input.delta), 0, ceiling);

  let oppPoints = input.opponentPoints;
  let oppAdvantages = input.opponentAdvantages;
  let triggerDq = false;
  let clearAutoDq = false;

  if (next > current) {
    for (let step = current + 1; step <= next; step += 1) {
      if (step === 2) {
        oppAdvantages = clamp(oppAdvantages + 1, 0, maxAdvantages);
      } else if (step === 3) {
        oppPoints = clamp(oppPoints + 2, 0, maxPoints);
      } else if (step === 4) {
        if (input.ladder === 'adult') {
          triggerDq = true;
        } else {
          oppPoints = clamp(oppPoints + 2, 0, maxPoints);
        }
      } else if (step === 5 && input.ladder === 'kids') {
        oppPoints = clamp(oppPoints + 2, 0, maxPoints);
      } else if (step === 6 && input.ladder === 'kids') {
        triggerDq = true;
      }
    }
  } else if (next < current) {
    for (let step = current; step > next; step -= 1) {
      if (step === 2) {
        oppAdvantages = clamp(oppAdvantages - 1, 0, maxAdvantages);
      } else if (step === 3) {
        oppPoints = clamp(oppPoints - 2, 0, maxPoints);
      } else if (step === 4) {
        if (input.ladder === 'adult') {
          clearAutoDq = true;
        } else {
          oppPoints = clamp(oppPoints - 2, 0, maxPoints);
        }
      } else if (step === 5 && input.ladder === 'kids') {
        oppPoints = clamp(oppPoints - 2, 0, maxPoints);
      } else if (step === 6 && input.ladder === 'kids') {
        clearAutoDq = true;
      }
    }
  }

  return {
    penalties: next,
    opponentPoints: oppPoints,
    opponentAdvantages: oppAdvantages,
    triggerDq,
    clearAutoDq,
  };
}
