/**
 * Optional Master Carlos on the match scoreboard.
 * Pro suite only (`from=suite`). Coach and Coach Unlimited never show him.
 * Off by default. He appears only after the bout is over: a recorded win
 * (including a referee-decision win, once that call is wired), or a point
 * total that was crossed during the match. A live score never brings him out.
 * Kids' Scoreboards finals still celebrate a bracket champion on their own
 * and do not use this gate. That overlay is Pro suite only as well.
 */

import { KIDS_WIN_CHEER, kidsPointsLine, kidsWinLines } from './kidsScoreboard.ts';
import type { MatchOutcome, Side } from './outcomes.ts';

/** Master Carlos on the match scoreboard and its controller. Pro suite only. */
export function masterCarlosOnScoreboard(fromSuite: boolean): boolean {
  return fromSuite;
}

export const DEFAULT_CARLOS_POINTS_THRESHOLD = 10;
export const CARLOS_THRESHOLD_MIN = 1;
export const CARLOS_THRESHOLD_MAX = 98;

export type CarlosCelebrationPrefs = {
  /** Master switch. Off means no Carlos from a match win or a point threshold. */
  enabled: boolean;
  /** Slide in at match end when this match has a winner (not a DQ). */
  onWin: boolean;
  /** Slide in at match end when a competitor's points went over `pointsThreshold`. */
  onPoints: boolean;
  /** At match end, Carlos appears when points are greater than this number. */
  pointsThreshold: number;
};

export const DEFAULT_CARLOS_PREFS: CarlosCelebrationPrefs = {
  enabled: false,
  onWin: true,
  onPoints: true,
  pointsThreshold: DEFAULT_CARLOS_POINTS_THRESHOLD,
};

export type CarlosMatchView = {
  show: boolean;
  lines: readonly string[];
};

const FALLBACK_NAME: Record<Side, string> = {
  blue: 'Competitor 1',
  white: 'Competitor 2',
};

export function parseCarlosThreshold(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < CARLOS_THRESHOLD_MIN || n > CARLOS_THRESHOLD_MAX) {
    return DEFAULT_CARLOS_POINTS_THRESHOLD;
  }
  return n;
}

export function parseCarlosPrefs(raw: unknown): CarlosCelebrationPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CARLOS_PREFS };
  const row = raw as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    onWin: row.onWin !== false,
    onPoints: row.onPoints !== false,
    pointsThreshold: parseCarlosThreshold(row.pointsThreshold),
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
export function carlosMatchComplete(input: {
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
 * pass the winning side as `refDecisionSide` into `matchCarlosView` with the bout
 * complete, or record this outcome. Carlos then uses the same match-end win cheer.
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

function carlosOutcome(input: {
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
export function matchCarlosView(input: {
  prefs: CarlosCelebrationPrefs;
  outcome: MatchOutcome | null;
  blueName: string;
  whiteName: string;
  bluePoints: number;
  whitePoints: number;
  /** Clock at 0:00, or a result already recorded. See `carlosMatchComplete`. */
  matchComplete: boolean;
  /**
   * Reserved for a referee-decision win that is not already in `outcome`.
   * Honored only when `matchComplete` is true. See `refereeDecisionWin`.
   */
  refDecisionSide?: Side | null;
}): CarlosMatchView {
  const hidden: CarlosMatchView = { show: false, lines: [] };
  if (!input.prefs.enabled) return hidden;

  const outcome = carlosOutcome(input);

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
