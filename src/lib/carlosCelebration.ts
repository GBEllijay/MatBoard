/**
 * Optional Master Carlos on the match scoreboard.
 * Off by default. Kids' Scoreboards still celebrates a bracket champion on its own.
 * These triggers are for every training match, including before a final.
 */

import { KIDS_WIN_CHEER, kidsPointsLine, kidsWinLines } from './kidsScoreboard.ts';
import type { MatchOutcome, Side } from './outcomes.ts';

export const DEFAULT_CARLOS_POINTS_THRESHOLD = 10;
export const CARLOS_THRESHOLD_MIN = 1;
export const CARLOS_THRESHOLD_MAX = 98;

export type CarlosCelebrationPrefs = {
  /** Master switch. Off means no Carlos from a match win or a point threshold. */
  enabled: boolean;
  /** Slide in when this match has a winner (not a DQ). */
  onWin: boolean;
  /** Slide in when a competitor's points go over `pointsThreshold`. */
  onPoints: boolean;
  /** Carlos appears when points are greater than this number. */
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
 * What the scoreboard should say. A win wins over a points cheer.
 * Hidden whenever the master switch is off, including after a championship-style win.
 */
export function matchCarlosView(input: {
  prefs: CarlosCelebrationPrefs;
  outcome: MatchOutcome | null;
  blueName: string;
  whiteName: string;
  bluePoints: number;
  whitePoints: number;
}): CarlosMatchView {
  const hidden: CarlosMatchView = { show: false, lines: [] };
  if (!input.prefs.enabled) return hidden;

  if (input.prefs.onWin && input.outcome?.call === 'win') {
    const side = input.outcome.side;
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

  if (!input.prefs.onPoints) return hidden;
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
