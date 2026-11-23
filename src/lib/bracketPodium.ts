import {
  isThreePersonBracket,
  otherSide,
  slotId,
  slotName,
  type BracketMatchId,
  type TournamentState,
} from './tournamentStore.ts';

export type PodiumPlaces = {
  first: string;
  second: string;
  /** IBJJF-style double bronze when both semi losers are known; one name otherwise. */
  third: string[];
};

function competitorName(current: TournamentState, matchId: BracketMatchId, side: 'a' | 'b'): string {
  return slotName(current, slotId(matchId, side)).trim();
}

function winnerName(current: TournamentState, matchId: BracketMatchId): string {
  const result = current.results[matchId];
  if (!result) return '';
  return competitorName(current, matchId, result.winnerSide);
}

function loserName(current: TournamentState, matchId: BracketMatchId): string {
  const result = current.results[matchId];
  if (!result) return '';
  return competitorName(current, matchId, otherSide(result.winnerSide));
}

function pushUnique(names: string[], name: string, excluded: Set<string>): void {
  if (!name || excluded.has(name) || names.includes(name)) return;
  names.push(name);
}

/**
 * 1st is the champion (or the finals winner if the champion slot is empty).
 * 2nd is the finals loser. 3rd comes from semi losers: both bronze medalists
 * on a standard tree, or the consolation loser on a 3-person bracket.
 */
export function podiumPlaces(current: TournamentState): PodiumPlaces {
  const first = slotName(current, 'champion').trim() || winnerName(current, 'final-0');
  const secondRaw = loserName(current, 'final-0');
  const second = secondRaw && secondRaw !== first ? secondRaw : '';
  const excluded = new Set([first, second].filter(Boolean));
  const third: string[] = [];
  if (isThreePersonBracket(current)) {
    pushUnique(third, loserName(current, 'sf-1'), excluded);
  } else {
    pushUnique(third, loserName(current, 'sf-0'), excluded);
    pushUnique(third, loserName(current, 'sf-1'), excluded);
  }
  return { first, second, third };
}
