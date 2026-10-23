/**
 * Opponent ratings use the same seven areas and 1–5 scale as self-assessment.
 * A higher score for the student is favored. An equal score is even.
 * A lower score is a disadvantage. Areas missing on either side are left out.
 */

import {
  ASSESSMENT_AREAS,
  isAssessmentScore,
  type AssessmentAreaId,
  type AssessmentScore,
  type AssessmentScores,
} from './studentAssessment.ts';

export type AreaRatings = Partial<Record<AssessmentAreaId, AssessmentScore>>;
export type AreaBalance = 'favored' | 'even' | 'disadvantage';

export type AreaMatchup = {
  id: AssessmentAreaId;
  label: string;
  mine: AssessmentScore;
  theirs: AssessmentScore;
  balance: AreaBalance;
};

export function cleanRatings(value: unknown): AreaRatings {
  if (!value || typeof value !== 'object') return {};
  const row = value as Record<string, unknown>;
  const ratings: AreaRatings = {};
  for (const area of ASSESSMENT_AREAS) {
    const raw = row[area.id];
    const score = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (isAssessmentScore(score)) ratings[area.id] = score;
  }
  return ratings;
}

export function isCompleteRatings(ratings: AreaRatings | null | undefined): ratings is AssessmentScores {
  if (!ratings) return false;
  return ASSESSMENT_AREAS.every((area) => isAssessmentScore(ratings[area.id]));
}

export function compareToOpponent(mine: AreaRatings | null | undefined, theirs: AreaRatings | null | undefined): AreaMatchup[] {
  const rows: AreaMatchup[] = [];
  for (const area of ASSESSMENT_AREAS) {
    const mineScore = mine?.[area.id];
    const theirScore = theirs?.[area.id];
    if (!isAssessmentScore(mineScore) || !isAssessmentScore(theirScore)) continue;
    const balance: AreaBalance = mineScore > theirScore ? 'favored' : mineScore < theirScore ? 'disadvantage' : 'even';
    rows.push({ id: area.id, label: area.label, mine: mineScore, theirs: theirScore, balance });
  }
  return rows;
}

export function matchupLabels(rows: readonly AreaMatchup[]): Record<AreaBalance, string[]> {
  return {
    favored: rows.filter((row) => row.balance === 'favored').map((row) => row.label),
    even: rows.filter((row) => row.balance === 'even').map((row) => row.label),
    disadvantage: rows.filter((row) => row.balance === 'disadvantage').map((row) => row.label),
  };
}

export function matchupLine(labels: readonly string[]): string {
  return labels.length ? labels.join(', ') : 'None';
}
