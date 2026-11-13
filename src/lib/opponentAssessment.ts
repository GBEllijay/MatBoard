/**
 * Opponent ratings use the same eight faces as the daily check-in, with no sub-items.
 * Sweeps is a full face: a card is complete only with all eight rated.
 * A card saved before Sweeps existed still loads with Sweeps blank, and its seven
 * rated faces still compare and draw.
 * A higher score for the student is favored. An equal score is even.
 * A lower score is a disadvantage. Areas missing on either side are left out.
 */

import {
  ASSESSMENT_FORM_AREAS,
  isAssessmentScore,
  type AssessmentAreaId,
  type AssessmentScore,
  type AssessmentScores,
} from './studentAssessment.ts';

export type ScoutAreaId = AssessmentAreaId | 'sweeps';
export type AreaRatings = Partial<Record<ScoutAreaId, AssessmentScore>>;
export type AreaBalance = 'favored' | 'even' | 'disadvantage';

export type AreaMatchup = {
  id: ScoutAreaId;
  label: string;
  mine: AssessmentScore;
  theirs: AssessmentScore;
  balance: AreaBalance;
};

/** The eight faces, in the same order and with the same labels as the daily check-in. */
export const MATCHUP_AREAS: readonly { id: ScoutAreaId; label: string }[] = ASSESSMENT_FORM_AREAS;

export function cleanRatings(value: unknown): AreaRatings {
  if (!value || typeof value !== 'object') return {};
  const row = value as Record<string, unknown>;
  const ratings: AreaRatings = {};
  for (const area of MATCHUP_AREAS) {
    const raw = row[area.id];
    const score = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (isAssessmentScore(score)) ratings[area.id] = score;
  }
  return ratings;
}

/** All eight faces rated, Sweeps included. */
export function isCompleteRatings(ratings: AreaRatings | null | undefined): ratings is AssessmentScores {
  if (!ratings) return false;
  return MATCHUP_AREAS.every((area) => isAssessmentScore(ratings[area.id]));
}

/**
 * Enough to draw an opponent's shape: all eight, or a card saved before Sweeps
 * existed that has the other seven. Its Sweeps vertex stays unrated.
 */
export function isDrawableRatings(ratings: AreaRatings | null | undefined): ratings is AssessmentScores {
  if (!ratings) return false;
  return MATCHUP_AREAS.every((area) => area.id === 'sweeps' || isAssessmentScore(ratings[area.id]));
}

export function compareToOpponent(mine: AreaRatings | null | undefined, theirs: AreaRatings | null | undefined): AreaMatchup[] {
  const rows: AreaMatchup[] = [];
  for (const area of MATCHUP_AREAS) {
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
