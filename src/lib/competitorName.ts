import type { Side } from './outcomes.ts';

/** Scoreboard fallback: Blue (top) is Competitor 1, White (bottom) is Competitor 2. */
export function defaultCompetitorName(side: Side): string {
  return side === 'blue' ? 'Competitor 1' : 'Competitor 2';
}

/** Empty or whitespace names fall back to the side's default. Other values are kept as typed. */
export function resolvedCompetitorName(side: Side, value: string): string {
  return value.trim() ? value : defaultCompetitorName(side);
}
