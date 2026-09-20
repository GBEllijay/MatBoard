/** Shared bout outcomes for live Match and Mock Tournament. */

export type Side = 'blue' | 'white';

/** How a bout ended. Tree Win is a score decision; Sub / DQ / T-loss stay distinct. */
export const BOUT_OUTCOME_KINDS = ['score', 'submission', 'dq', 'tech'] as const;
export type BoutOutcomeKind = (typeof BOUT_OUTCOME_KINDS)[number];

/** Why a score decision was awarded (clock-end auto, or inferred from the board). */
export const SCORE_DECISION_REASONS = ['points', 'advantages', 'penalties'] as const;
export type ScoreDecisionReason = (typeof SCORE_DECISION_REASONS)[number];

export type ScoreLine = {
  points: number;
  advantages: number;
  disadvantages: number;
};

export type ClockEndVerdict =
  | { kind: 'winner'; side: Side; reason: ScoreDecisionReason }
  | { kind: 'ref' };

export type MatchOutcomeSource = 'auto' | 'manual';

export type MatchOutcome = {
  /** Winner for score/submission; the penalized side for DQ / T-loss. */
  side: Side;
  method: BoutOutcomeKind;
  reason?: ScoreDecisionReason;
  source: MatchOutcomeSource;
  at: number;
};

export const SCORE_REASON_LABELS: Record<ScoreDecisionReason, string> = {
  points: 'By points',
  advantages: 'By advantages',
  penalties: 'By penalties',
};

export const OUTCOME_METHOD_LABELS: Record<BoutOutcomeKind, string> = {
  score: 'Win',
  submission: 'Submission',
  dq: 'DQ',
  tech: 'T-loss',
};

export function isBoutOutcomeKind(value: unknown): value is BoutOutcomeKind {
  return value === 'score' || value === 'submission' || value === 'dq' || value === 'tech';
}

/** Older brackets stored generic wins as `win`. */
export function parseBoutOutcomeKind(value: unknown): BoutOutcomeKind | null {
  if (value === 'win') return 'score';
  return isBoutOutcomeKind(value) ? value : null;
}

export function isWinMethod(kind: BoutOutcomeKind): boolean {
  return kind === 'score' || kind === 'submission';
}

export function boardIsEmpty(blue: ScoreLine, white: ScoreLine): boolean {
  return (
    blue.points === 0 &&
    white.points === 0 &&
    blue.advantages === 0 &&
    white.advantages === 0 &&
    blue.disadvantages === 0 &&
    white.disadvantages === 0
  );
}

/**
 * Clock-end winner: points, then advantages, then fewer penalties.
 * Empty board or a full tie is a referee decision — do not invent a winner.
 */
export function decideClockEnd(blue: ScoreLine, white: ScoreLine): ClockEndVerdict {
  if (boardIsEmpty(blue, white)) return { kind: 'ref' };
  if (blue.points !== white.points) {
    return { kind: 'winner', side: blue.points > white.points ? 'blue' : 'white', reason: 'points' };
  }
  if (blue.advantages !== white.advantages) {
    return {
      kind: 'winner',
      side: blue.advantages > white.advantages ? 'blue' : 'white',
      reason: 'advantages',
    };
  }
  if (blue.disadvantages !== white.disadvantages) {
    return {
      kind: 'winner',
      side: blue.disadvantages < white.disadvantages ? 'blue' : 'white',
      reason: 'penalties',
    };
  }
  return { kind: 'ref' };
}

export function parseMatchOutcome(raw: unknown): MatchOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<MatchOutcome>;
  if (row.side !== 'blue' && row.side !== 'white') return null;
  const method = parseBoutOutcomeKind(row.method);
  if (!method) return null;
  const reason =
    row.reason === 'points' || row.reason === 'advantages' || row.reason === 'penalties'
      ? row.reason
      : undefined;
  return {
    side: row.side,
    method,
    reason: method === 'score' ? reason : undefined,
    source: row.source === 'auto' ? 'auto' : 'manual',
    at: Number.isFinite(row.at) ? Number(row.at) : Date.now(),
  };
}

export function outcomeBanner(
  outcome: Pick<MatchOutcome, 'side' | 'method'> | null,
): { side: Side; kind: 'win' | 'dq' | 'tech'; text: string } | null {
  if (!outcome) return null;
  if (isWinMethod(outcome.method)) {
    return { side: outcome.side, kind: 'win', text: 'Winner' };
  }
  if (outcome.method === 'dq') {
    return { side: outcome.side, kind: 'dq', text: 'Disqualification' };
  }
  return { side: outcome.side, kind: 'tech', text: 'T-loss' };
}

export function needsRefDecision(match: {
  autoAnnounce: boolean;
  remainingMs: number;
  running: boolean;
  outcome: MatchOutcome | null;
  blue: ScoreLine;
  white: ScoreLine;
}): boolean {
  if (!match.autoAnnounce || match.running || match.remainingMs > 0 || match.outcome) return false;
  return decideClockEnd(match.blue, match.white).kind === 'ref';
}

export function inferScoreReason(side: Side, blue: ScoreLine, white: ScoreLine): ScoreDecisionReason | undefined {
  const verdict = decideClockEnd(blue, white);
  if (verdict.kind === 'winner' && verdict.side === side) return verdict.reason;
  return undefined;
}
