/**
 * Optional grandmaster cheer on the match scoreboard.
 * Pro suite only (`from=suite`). Coach and Coach Unlimited never show it.
 * Off by default. It appears only after the bout is over: a recorded win
 * (including a referee-decision win, once that call is wired), or a point
 * total that was crossed during the match. A live score never brings it out.
 * Kids' Scoreboards finals still celebrate a bracket champion on their own
 * and do not use this gate. That overlay is Pro suite only as well.
 */

import { KIDS_WIN_CHEER, kidsPointsLine, kidsWinLines } from './kidsScoreboard.ts';
import { isGrandmasterId, type GrandmasterId } from './grandmasters.ts';
import type { MatchOutcome, Side } from './outcomes.ts';

/** Grandmaster cheer on the match scoreboard and its controller. Pro suite only. */
export function grandmasterOnScoreboard(fromSuite: boolean): boolean {
  return fromSuite;
}

export const DEFAULT_GRANDMASTER_POINTS_THRESHOLD = 10;
export const GRANDMASTER_THRESHOLD_MIN = 1;
export const GRANDMASTER_THRESHOLD_MAX = 98;

/** Previous save key for this block. Read once, then the match is stored under `grandmaster`. */
export const LEGACY_GRANDMASTER_PREFS_KEY = 'carlos' as const;

export type GrandmasterCelebrationPrefs = {
  /** Master switch. Off means no grandmaster cheer from a match win or a point threshold. */
  enabled: boolean;
  /** Slide in at match end when this match has a winner (not a DQ). */
  onWin: boolean;
  /** Slide in at match end when a competitor's points went over `pointsThreshold`. */
  onPoints: boolean;
  /** At match end, the grandmaster appears when points are greater than this number. */
  pointsThreshold: number;
  /** Master on screen for `cheerKey`. Null until a cheer has been picked. */
  masterId: GrandmasterId | null;
  /** Identity of the cheer that owns `masterId`. */
  cheerKey: string | null;
  /** Advances when a bout is reset so the next cheer is a new pick. */
  boutSerial: number;
};

export const DEFAULT_GRANDMASTER_PREFS: GrandmasterCelebrationPrefs = {
  enabled: false,
  onWin: true,
  onPoints: true,
  pointsThreshold: DEFAULT_GRANDMASTER_POINTS_THRESHOLD,
  masterId: null,
  cheerKey: null,
  boutSerial: 0,
};

export type GrandmasterMatchView = {
  show: boolean;
  lines: readonly string[];
};

const FALLBACK_NAME: Record<Side, string> = {
  blue: 'Competitor 1',
  white: 'Competitor 2',
};

export function parseGrandmasterThreshold(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < GRANDMASTER_THRESHOLD_MIN || n > GRANDMASTER_THRESHOLD_MAX) {
    return DEFAULT_GRANDMASTER_POINTS_THRESHOLD;
  }
  return n;
}

function parseBoutSerial(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return 0;
  return n;
}

export function parseGrandmasterPrefs(raw: unknown): GrandmasterCelebrationPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_GRANDMASTER_PREFS };
  const row = raw as Record<string, unknown>;
  const cheerKey = typeof row.cheerKey === 'string' && row.cheerKey ? row.cheerKey : null;
  return {
    enabled: row.enabled === true,
    onWin: row.onWin !== false,
    onPoints: row.onPoints !== false,
    pointsThreshold: parseGrandmasterThreshold(row.pointsThreshold),
    masterId: isGrandmasterId(row.masterId) ? row.masterId : null,
    cheerKey,
    boutSerial: parseBoutSerial(row.boutSerial),
  };
}

/**
 * Cheer prefs from a stored match. The current key wins. A save that only has
 * the previous key is read once so a switch that was on stays on.
 */
export function grandmasterPrefsFromStored(stored: unknown): GrandmasterCelebrationPrefs {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_GRANDMASTER_PREFS };
  const row = stored as Record<string, unknown>;
  if (row.grandmaster != null) return parseGrandmasterPrefs(row.grandmaster);
  return parseGrandmasterPrefs(row[LEGACY_GRANDMASTER_PREFS_KEY]);
}

/** Stable id for the cheer on this bout. A reset advances the serial, which starts a new pick. */
export function grandmasterCheerKey(boutSerial: number): string {
  return `bout:${boutSerial}`;
}

export function advanceGrandmasterBout(prefs: GrandmasterCelebrationPrefs): GrandmasterCelebrationPrefs {
  return {
    ...prefs,
    boutSerial: prefs.boutSerial + 1,
    cheerKey: null,
  };
}

function competitorName(side: Side, blueName: string, whiteName: string): string {
  const raw = (side === 'blue' ? blueName : whiteName).trim();
  return raw || FALLBACK_NAME[side];
}

function pointsSide(bluePoints: number, whitePoints: number, threshold: number): Side | 'tie' | null {
  const blueOver = bluePoints > threshold;
  const whiteOver = whitePoints > threshold;
  if (blueOver && whiteOver) {
    if (bluePoints === whitePoints) return 'tie';
    return bluePoints > whitePoints ? 'blue' : 'white';
  }
  if (blueOver) return 'blue';
  if (whiteOver) return 'white';
  return null;
}

/**
 * Match-end signal for this scoreboard celebration.
 * True when the clock has stopped at 0:00, or a win/DQ is already recorded
 * (a submission can end the bout before the timer). A running or paused
 * clock with time left is still mid-match.
 * Kids' Scoreboards finals do not use this. They wait for a champion.
 */
export function grandmasterMatchComplete(input: {
  running: boolean;
  remainingMs: number;
  outcome: MatchOutcome | null;
}): boolean {
  if (input.outcome) return true;
  return !input.running && input.remainingMs <= 0;
}

/**
 * Outcome shape for a referee-decision win.
 * Display already asks for a referee when the clock ends tied (`needsRefDecision`).
 * Awarding that win is not built yet — do not add that UI here. When it exists,
 * pass the winning side as `refDecisionSide` into `matchGrandmasterView` with the bout
 * complete, or record this outcome. The grandmaster then uses the same match-end win cheer.
 * Ignored while the bout is still running. Finals do not use this hook.
 */
export function refereeDecisionWin(side: Side, at = 0): MatchOutcome {
  return {
    call: 'win',
    method: 'decision',
    side,
    source: 'manual',
    at,
  };
}

function grandmasterOutcome(input: {
  outcome: MatchOutcome | null;
  matchComplete: boolean;
  refDecisionSide?: Side | null;
}): MatchOutcome | null {
  if (input.outcome) return input.outcome;
  if (!input.matchComplete) return null;
  if (input.refDecisionSide === 'blue' || input.refDecisionSide === 'white') {
    return refereeDecisionWin(input.refDecisionSide);
  }
  return null;
}

/**
 * What the scoreboard should say. A win wins over a points cheer.
 * Hidden whenever the master switch is off.
 * Points require the bout to be over (`matchComplete`, or a result already recorded).
 * Crossing the threshold mid-match stays quiet.
 * `refDecisionSide` uses the win cheer, and only after the bout is over.
 */
export function matchGrandmasterView(input: {
  prefs: GrandmasterCelebrationPrefs;
  outcome: MatchOutcome | null;
  blueName: string;
  whiteName: string;
  bluePoints: number;
  whitePoints: number;
  /** Clock at 0:00, or a result already recorded. See `grandmasterMatchComplete`. */
  matchComplete: boolean;
  /**
   * Reserved for a referee-decision win that is not already in `outcome`.
   * Honored only when `matchComplete` is true. See `refereeDecisionWin`.
   */
  refDecisionSide?: Side | null;
}): GrandmasterMatchView {
  const hidden: GrandmasterMatchView = { show: false, lines: [] };
  if (!input.prefs.enabled) return hidden;
  // A disqualification has its own reaction. Points on that athlete are not a cheer.
  if (input.outcome?.call === 'dq') return hidden;

  const outcome = grandmasterOutcome(input);

  if (input.prefs.onWin && outcome?.call === 'win') {
    const side = outcome.side;
    const winnerPoints = side === 'blue' ? input.bluePoints : input.whitePoints;
    const loserPoints = side === 'blue' ? input.whitePoints : input.bluePoints;
    return {
      show: true,
      lines: kidsWinLines(
        competitorName(side, input.blueName, input.whiteName),
        kidsPointsLine({ winner: winnerPoints, loser: loserPoints }),
      ),
    };
  }

  const ended = input.matchComplete || input.outcome != null;
  if (!ended || !input.prefs.onPoints) return hidden;
  const over = pointsSide(input.bluePoints, input.whitePoints, input.prefs.pointsThreshold);
  if (!over) return hidden;

  if (over === 'tie') {
    return {
      show: true,
      lines: [
        KIDS_WIN_CHEER,
        `${competitorName('blue', input.blueName, input.whiteName)} & ${competitorName('white', input.blueName, input.whiteName)}`,
        String(input.bluePoints),
      ],
    };
  }

  const points = over === 'blue' ? input.bluePoints : input.whitePoints;
  return {
    show: true,
    lines: kidsWinLines(competitorName(over, input.blueName, input.whiteName), String(points)),
  };
}
