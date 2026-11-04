import { roundChoiceLabel } from './matchRound.ts';

/**
 * Scoreboard line for Round. An empty field is omitted — no "Round —" or "Bout" placeholder.
 * A typed "Round 1" is not doubled. Semifinal, Final, and Quarterfinal stay as named rounds.
 */
const NAMED_ROUND = /^(?:semi[\s-]?final|quarter[\s-]?final|final)s?$/i;

export function roundDisplay(round: string, linked: boolean): string {
  const value = round.trim();
  if (!value) return '';
  const known = roundChoiceLabel(value);
  if (known) return known;
  if (linked) return value;
  const body = value.replace(/^(?:round\s+)+/i, '').trim();
  if (!body) return 'Round';
  if (NAMED_ROUND.test(body)) return body;
  return `Round ${body}`;
}
