import { roundChoiceLabel } from './matchRound.ts';

/** Scoreboard line for Round. An empty field is omitted — no "Round —" or "Bout" placeholder. */
export function roundDisplay(round: string, linked: boolean): string {
  const value = round.trim();
  if (!value) return '';
  const known = roundChoiceLabel(value);
  if (known) return known;
  if (linked) return value;
  return `Round ${value}`;
}
