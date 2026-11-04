/**
 * Medals on the student card: the three most recent podium finishes from the
 * Results the student records (competition.results). The results model has no
 * explicit place field, so the place is read from the recorded matches:
 * - every recorded match a win → gold (1st);
 * - one loss, and it is the last match recorded, after at least one win →
 *   bronze (3rd) when that match or the last bracket round says "semi", otherwise silver (2nd).
 * Anything else is not a podium the record can show, so it gets no medal.
 */
import type { CompetitionMatch, CompetitionResult, StudentCompetition } from './progress/types.ts';

export type MedalKind = 'gold' | 'silver' | 'bronze';
export const MEDAL_PLACE: Record<MedalKind, string> = { gold: '1st', silver: '2nd', bronze: '3rd' };
export const MEDAL_LABEL: Record<MedalKind, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
export const CARD_MEDALS_MAX = 3;

export type CardMedal = {
  kind: MedalKind;
  place: string;
  resultId: string;
  name: string;
  division: string;
  /** YYYY-MM-DD, or empty when nothing recorded a date. */
  date: string;
  matches: CompetitionMatch[];
};

export function medalOf(result: CompetitionResult): MedalKind | null {
  const matches = result.matches;
  if (!matches.length) return null;
  const wins = matches.filter((m) => m.result === 'win').length;
  const losses = matches.filter((m) => m.result === 'loss').length;
  if (wins === matches.length) return 'gold';
  const last = matches[matches.length - 1];
  if (losses === 1 && wins >= 1 && last.result === 'loss' && wins + losses === matches.length) {
    const round = result.bracket.length ? result.bracket[result.bracket.length - 1].round : '';
    return /semi/i.test(`${last.note} ${round}`) ? 'bronze' : 'silver';
  }
  return null;
}

function resultDate(result: CompetitionResult, competition: Pick<StudentCompetition, 'tournaments'>): string {
  const dates = result.matches.map((m) => m.date ?? '').filter(Boolean).sort();
  if (dates.length) return dates[dates.length - 1];
  return competition.tournaments.find((t) => t.id && t.id === result.tournamentId)?.date ?? '';
}

/** Most recent first, at most three. Undated results count as entered order (newest last in the list). */
export function recentMedals(competition: Pick<StudentCompetition, 'results' | 'tournaments'> | undefined | null): CardMedal[] {
  if (!competition) return [];
  const rows = competition.results
    .map((result, index) => ({ result, index, kind: medalOf(result), date: resultDate(result, competition) }))
    .filter((row): row is typeof row & { kind: MedalKind } => row.kind !== null);
  rows.sort((a, b) => (a.date === b.date ? b.index - a.index : a.date && b.date ? (a.date < b.date ? 1 : -1) : a.date ? -1 : 1));
  return rows.slice(0, CARD_MEDALS_MAX).map(({ result, kind, date }) => ({
    kind,
    place: MEDAL_PLACE[kind],
    resultId: result.id,
    name: result.tournamentName,
    division: result.division,
    date,
    matches: result.matches,
  }));
}
