/** Wire a mock-bracket bout to the live Match scoreboard (same device, Phase 1 store). */

import { controllerFocusPath, type DisplayFocus } from './matchFocus';
import { dispatchMatch, getMatch, type Side } from './matchStore';
import {
  getTournament,
  isBracketMatchId,
  roundLabel,
  seedPlaceholder,
  seedSlots,
  setMatchOutcome,
  slotId,
  slotName,
  type BracketMatchId,
  type MatchSide,
} from './tournamentStore';

/** Brief Winner / Disqualification hold on the Display before returning to the tree. */
export const BOUT_FLASH_MS = 1700;
export const BOUT_FLASH_MS_REDUCED = 400;

export function flashDurationMs(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? BOUT_FLASH_MS_REDUCED
      : BOUT_FLASH_MS;
  } catch {
    return BOUT_FLASH_MS;
  }
}

export function linkedBracketMatchId(value: string | null | undefined): BracketMatchId | null {
  return isBracketMatchId(value) ? value : null;
}

export function scoreboardSideToBracket(side: Side): MatchSide {
  return side === 'blue' ? 'a' : 'b';
}

export function boutCompetitorName(matchId: BracketMatchId, side: MatchSide): string {
  const tournament = getTournament();
  const name = slotName(tournament, slotId(matchId, side)).trim();
  if (name) return name;
  const index = seedSlots().indexOf(slotId(matchId, side));
  if (index >= 0) return seedPlaceholder(index);
  return side === 'a' ? 'Competitor 1' : 'Competitor 2';
}

export function unlinkBracketBout(): void {
  dispatchMatch({ type: 'setBracketMatchId', value: null });
  dispatchMatch({ type: 'setOutcomeFlash', value: null });
}

export function openBracketBout(matchId: BracketMatchId): void {
  const tournament = getTournament();
  dispatchMatch({
    type: 'loadBracketBout',
    matchId,
    blueName: boutCompetitorName(matchId, 'a'),
    whiteName: boutCompetitorName(matchId, 'b'),
    round: roundLabel(matchId),
    division: tournament.title.trim(),
  });
}

export function syncBoutFromQuery(bout: string | null): void {
  if (!isBracketMatchId(bout)) return;
  if (getMatch().bracketMatchId === bout) return;
  openBracketBout(bout);
}

export function scoreboardPath(matchId?: BracketMatchId | null): string {
  return isBracketMatchId(matchId) ? `/match?bout=${matchId}` : '/match';
}

export function controllerPath(matchId?: BracketMatchId | null, focus?: DisplayFocus): string {
  const base = controllerFocusPath(focus);
  if (!isBracketMatchId(matchId)) return base;
  return `${base}${base.includes('?') ? '&' : '?'}bout=${matchId}`;
}

export function declareLinkedOutcome(side: Side, kind: 'win' | 'dq'): boolean {
  const match = getMatch();
  const matchId = linkedBracketMatchId(match.bracketMatchId);
  if (!matchId || match.outcomeFlash) return false;
  setMatchOutcome(matchId, scoreboardSideToBracket(side), kind, { toggle: false });
  dispatchMatch({
    type: 'beginBracketOutcome',
    flash: { kind, side, at: Date.now() },
  });
  return true;
}

export function roundDisplay(round: string, linked: boolean): string {
  if (!round) return linked ? 'Bout' : 'Round —';
  if (linked) return round;
  return `Round ${round}`;
}
