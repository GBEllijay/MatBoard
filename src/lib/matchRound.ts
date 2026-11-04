import { treeSizeFor, visibleRoundPrefixes, type BracketMatchId, type RoundPrefix } from './tournamentStore.ts';

/** Scoreboard round menu. Values are what the match stores. Labels are what the coach sees. */
export const MATCH_ROUND_OPTIONS = [
  { value: '1', label: 'Round 1' },
  { value: '2', label: 'Round 2' },
  { value: '3', label: 'Round 3' },
  { value: 'Quarterfinal', label: 'Quarterfinal' },
  { value: 'Semifinal', label: 'Semifinal' },
  { value: 'Final', label: 'Final' },
  { value: 'Third place', label: 'Third place' },
  { value: 'Superfight', label: 'Superfight' },
] as const;

export type MatchRoundValue = (typeof MATCH_ROUND_OPTIONS)[number]['value'];

const EARLY_ROUNDS: readonly RoundPrefix[] = ['r64', 'r32', 'r16'];

const SAVED_ROUND: Record<string, MatchRoundValue> = {
  '1': '1',
  'round 1': '1',
  '2': '2',
  'round 2': '2',
  '3': '3',
  'round 3': '3',
  quarterfinal: 'Quarterfinal',
  quarterfinals: 'Quarterfinal',
  qf: 'Quarterfinal',
  semifinal: 'Semifinal',
  semifinals: 'Semifinal',
  'semi-final': 'Semifinal',
  'semi-finals': 'Semifinal',
  sf: 'Semifinal',
  final: 'Final',
  finals: 'Final',
  'third place': 'Third place',
  '3rd place': 'Third place',
  'third-place': 'Third place',
  superfight: 'Superfight',
  'super fight': 'Superfight',
};

export function roundChoiceLabel(value: string): string | null {
  const found = MATCH_ROUND_OPTIONS.find((option) => option.value === value);
  return found ? found.label : null;
}

/**
 * Map a saved free-text round onto the menu when the words are clear.
 * Anything else is kept so a coach's own label is not deleted.
 */
export function canonicalRoundValue(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  return SAVED_ROUND[text.toLowerCase().replace(/\s+/g, ' ')] ?? text;
}

export function isListedRound(value: string): boolean {
  return value === '' || MATCH_ROUND_OPTIONS.some((option) => option.value === value);
}

/**
 * Fill the scoreboard round from the bracket slot.
 * Early rounds become Round 1, 2, or 3 by position in this bracket.
 * Quarterfinal, semifinal, and final keep those names.
 */
export function roundFromBracket(matchId: BracketMatchId, size: number): MatchRoundValue {
  const prefix = matchId.split('-')[0] as RoundPrefix;
  if (prefix === 'qf') return 'Quarterfinal';
  if (prefix === 'sf') return 'Semifinal';
  if (prefix === 'final') return 'Final';
  const early = visibleRoundPrefixes(treeSizeFor(size)).filter((item) => EARLY_ROUNDS.includes(item));
  const index = early.indexOf(prefix);
  if (index === 1) return '2';
  if (index === 2) return '3';
  return '1';
}

/** Division, weight, and round the way the competition-update packet names them. */
export function scoreboardCompetitionFields(match: {
  round: string;
  division: string;
  weight: string;
  bracketMatchId?: string | null;
}): { division: string; weightClass: string; round: string } {
  return {
    division: match.division.trim(),
    weightClass: match.weight.trim(),
    round: roundChoiceLabel(match.round.trim()) ?? match.round.trim(),
  };
}
