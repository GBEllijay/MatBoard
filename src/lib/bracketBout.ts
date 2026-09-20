/** Wire a mock-bracket bout to the live Match scoreboard (same device, Phase 1 store). */

import { controllerFocusPath, type DisplayFocus } from './matchFocus';
import { dispatchMatch, getMatch, type OutcomeFlash, type Side } from './matchStore';
import {
  inferScoreReason,
  outcomeBanner,
  type BoutOutcomeKind,
  type MatchOutcome,
  type ScoreDecisionReason,
} from './outcomes';
import {
  getTournament,
  isBracketMatchId,
  roundLabel,
  scoreboardSideToBracket,
  seedPlaceholder,
  seedSlots,
  setMatchOutcome,
  slotId,
  slotName,
  type BracketMatchId,
  type MatchSide,
} from './tournamentStore';

export { scoreboardSideToBracket };

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

function flashFromOutcome(outcome: MatchOutcome): OutcomeFlash {
  const banner = outcomeBanner(outcome);
  return {
    kind: banner?.kind ?? 'win',
    side: outcome.side,
    at: Date.now(),
  };
}

export function declareMatchOutcome(
  side: Side,
  method: BoutOutcomeKind,
  options?: { reason?: ScoreDecisionReason; source?: MatchOutcome['source'] },
): boolean {
  const match = getMatch();
  const linked = linkedBracketMatchId(match.bracketMatchId);
  if (linked && match.outcomeFlash) return false;

  const source = options?.source ?? 'manual';
  const reason =
    method === 'score'
      ? (options?.reason ?? inferScoreReason(side, match.blue, match.white))
      : undefined;
  const outcome: MatchOutcome = {
    side,
    method,
    reason,
    source,
    at: Date.now(),
  };

  dispatchMatch({
    type: 'beginOutcome',
    flash: flashFromOutcome(outcome),
    outcome,
  });

  if (linked) {
    setMatchOutcome(linked, scoreboardSideToBracket(side), method, { toggle: false });
  }
  return true;
}

/** Phase 2 scoreboard Win / DQ — richer methods go through `declareMatchOutcome`. */
export function declareLinkedOutcome(side: Side, kind: 'win' | 'dq'): boolean {
  return declareMatchOutcome(side, kind === 'win' ? 'score' : 'dq');
}

export function roundDisplay(round: string, linked: boolean): string {
  if (!round) return linked ? 'Bout' : 'Round —';
  if (linked) return round;
  return `Round ${round}`;
}

export function visibleOutcomeBanner(match: {
  outcomeFlash: OutcomeFlash | null;
  outcome: MatchOutcome | null;
}): ReturnType<typeof outcomeBanner> {
  if (match.outcomeFlash) {
    const text =
      match.outcomeFlash.kind === 'win'
        ? 'Winner'
        : match.outcomeFlash.kind === 'dq'
          ? 'Disqualification'
          : 'T-loss';
    return { side: match.outcomeFlash.side, kind: match.outcomeFlash.kind, text };
  }
  return outcomeBanner(match.outcome);
}
