/** Wire a mock-bracket bout to the live Match scoreboard (same device, Phase 1 store). */

import { controllerFocusPath, type DisplayFocus } from './matchFocus';
import { rosterGymForName } from './rosterStore';
import { dispatchMatch, getMatch, type OutcomeFlash, type Side } from './matchStore';
import {
  inferScoreReason,
  outcomeBanner,
  type BoutOutcome,
  type MatchOutcome,
} from './outcomes';
import {
  getTournament,
  isBracketMatchId,
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

/** Brief center splash on the Display before returning to the board / tree. */
export const BOUT_FLASH_MS = 2600;
export const BOUT_FLASH_MS_REDUCED = 500;

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
  const blueName = boutCompetitorName(matchId, 'a');
  const whiteName = boutCompetitorName(matchId, 'b');
  dispatchMatch({
    type: 'loadBracketBout',
    matchId,
    blueName,
    whiteName,
    blueGym: rosterGymForName(slotName(tournament, slotId(matchId, 'a'))),
    whiteGym: rosterGymForName(slotName(tournament, slotId(matchId, 'b'))),
    round: '',
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
  return {
    kind: outcome.call,
    side: outcome.side,
    at: Date.now(),
  };
}

export function declareMatchOutcome(
  side: Side,
  pick: BoutOutcome,
  options?: { source?: MatchOutcome['source'] },
): boolean {
  const match = getMatch();
  const linked = linkedBracketMatchId(match.bracketMatchId);
  if (linked && match.outcomeFlash) return false;

  const source = options?.source ?? 'manual';
  const at = Date.now();
  const outcome: MatchOutcome =
    pick.call === 'win'
      ? {
          side,
          call: 'win',
          method: pick.method,
          scoreReason:
            pick.method === 'points'
              ? (pick.scoreReason ?? inferScoreReason(side, match.blue, match.white))
              : undefined,
          source,
          at,
        }
      : { side, call: 'dq', reason: pick.reason, source, at };

  dispatchMatch({
    type: 'beginOutcome',
    flash: flashFromOutcome(outcome),
    outcome,
  });

  if (linked) {
    const stored: BoutOutcome =
      outcome.call === 'win'
        ? { call: 'win', method: outcome.method, scoreReason: outcome.scoreReason }
        : { call: 'dq', reason: outcome.reason };
    setMatchOutcome(linked, scoreboardSideToBracket(side), stored, { toggle: false });
  }
  return true;
}

export function visibleOutcomeBanner(match: {
  outcomeFlash: OutcomeFlash | null;
  outcome: MatchOutcome | null;
}): ReturnType<typeof outcomeBanner> {
  if (match.outcomeFlash) {
    return {
      side: match.outcomeFlash.side,
      kind: match.outcomeFlash.kind,
      text: match.outcomeFlash.kind === 'win' ? 'Winner' : 'Disqualification',
    };
  }
  return outcomeBanner(match.outcome);
}
