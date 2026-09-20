/** Shared bout outcomes for live Match and Mock Tournament. */

export type Side = 'blue' | 'white';

export type OutcomeCall = 'win' | 'dq';

/** How a Win was awarded. */
export const WIN_METHODS = ['submission', 'points', 'decision'] as const;
export type WinMethod = (typeof WIN_METHODS)[number];

/** Why a DQ was issued. */
export const DQ_REASONS = ['technical', 'medical'] as const;
export type DqReason = (typeof DQ_REASONS)[number];

/** Why a Points win was awarded on the clock (auto or inferred from the board). */
export const SCORE_DECISION_REASONS = ['points', 'advantages', 'penalties'] as const;
export type ScoreDecisionReason = (typeof SCORE_DECISION_REASONS)[number];

export type WinOutcome = {
  call: 'win';
  method: WinMethod;
  /** Present when method is points and we know the board reason. */
  scoreReason?: ScoreDecisionReason;
};

export type DqOutcome = {
  call: 'dq';
  reason: DqReason;
};

export type BoutOutcome = WinOutcome | DqOutcome;

export type ScoreLine = {
  points: number;
  advantages: number;
  disadvantages: number;
};

export type ClockEndVerdict =
  | { kind: 'winner'; side: Side; reason: ScoreDecisionReason }
  | { kind: 'ref' };

export type MatchOutcomeSource = 'auto' | 'manual';

export type MatchOutcome = BoutOutcome & {
  /** Winner for a Win call; the penalized side for DQ. */
  side: Side;
  source: MatchOutcomeSource;
  at: number;
};

export const WIN_METHOD_LABELS: Record<WinMethod, string> = {
  submission: 'Submission',
  points: 'Points',
  decision: 'Decision',
};

export const WIN_METHOD_HINTS: Record<WinMethod, string> = {
  submission: 'Tap out',
  points: 'Scoreboard decision',
  decision: 'Referee decision',
};

export const DQ_REASON_LABELS: Record<DqReason, string> = {
  technical: 'Technical',
  medical: 'Medical',
};

export const DQ_REASON_HINTS: Record<DqReason, string> = {
  technical: 'Rules or conduct',
  medical: 'Can’t continue',
};

export const SCORE_REASON_LABELS: Record<ScoreDecisionReason, string> = {
  points: 'By points',
  advantages: 'By advantages',
  penalties: 'By penalties',
};

export function isWinMethod(value: unknown): value is WinMethod {
  return value === 'submission' || value === 'points' || value === 'decision';
}

export function isDqReason(value: unknown): value is DqReason {
  return value === 'technical' || value === 'medical';
}

export function isScoreDecisionReason(value: unknown): value is ScoreDecisionReason {
  return value === 'points' || value === 'advantages' || value === 'penalties';
}

/**
 * Map stored / legacy values into the Win/DQ shape.
 * Older boards used `win`/`score`, bare `submission`, generic `dq`, and `tech` (T-loss).
 */
export function parseBoutOutcome(raw: unknown): BoutOutcome | null {
  if (typeof raw === 'string') return parseLegacyKind(raw);
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.call === 'win') {
    const method = isWinMethod(row.method) ? row.method : 'points';
    const scoreReason =
      method === 'points' && isScoreDecisionReason(row.scoreReason)
        ? row.scoreReason
        : method === 'points' && isScoreDecisionReason(row.reason)
          ? row.reason
          : undefined;
    return scoreReason ? { call: 'win', method, scoreReason } : { call: 'win', method };
  }
  if (row.call === 'dq') {
    const reason = isDqReason(row.reason) ? row.reason : isDqReason(row.dqReason) ? row.dqReason : 'technical';
    return { call: 'dq', reason };
  }
  return parseLegacyKind(row.kind ?? row.method);
}

function parseLegacyKind(kind: unknown): BoutOutcome | null {
  if (kind === 'win' || kind === 'score' || kind === 'points') return { call: 'win', method: 'points' };
  if (kind === 'submission') return { call: 'win', method: 'submission' };
  if (kind === 'decision') return { call: 'win', method: 'decision' };
  if (kind === 'dq') return { call: 'dq', reason: 'technical' };
  if (kind === 'tech' || kind === 'technical') return { call: 'dq', reason: 'technical' };
  if (kind === 'medical') return { call: 'dq', reason: 'medical' };
  return null;
}

/** @deprecated Use parseBoutOutcome. Kept for older tests / comments. */
export function parseBoutOutcomeKind(value: unknown): BoutOutcome | null {
  return parseBoutOutcome(value);
}

export function isWinCall(outcome: BoutOutcome | null | undefined): outcome is WinOutcome {
  return outcome?.call === 'win';
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
  const row = raw as Record<string, unknown>;
  const side: Side | null = row.side === 'blue' || row.side === 'white' ? row.side : null;
  if (!side) return null;
  const pick = parseBoutOutcome(row);
  if (!pick) return null;
  const scoreReason =
    pick.call === 'win' && pick.method === 'points'
      ? (pick.scoreReason ?? (isScoreDecisionReason(row.scoreReason) ? row.scoreReason : isScoreDecisionReason(row.reason) ? row.reason : undefined))
      : undefined;
  const source: MatchOutcomeSource = row.source === 'auto' ? 'auto' : 'manual';
  const at = Number.isFinite(row.at) ? Number(row.at) : Date.now();
  if (pick.call === 'win') {
    return scoreReason
      ? { side, source, at, call: 'win', method: pick.method, scoreReason }
      : { side, source, at, call: 'win', method: pick.method };
  }
  return { side, source, at, call: 'dq', reason: pick.reason };
}

export function outcomeBanner(
  outcome: Pick<MatchOutcome, 'side' | 'call'> | null,
): { side: Side; kind: 'win' | 'dq'; text: string } | null {
  if (!outcome) return null;
  if (outcome.call === 'win') {
    return { side: outcome.side, kind: 'win', text: 'Winner' };
  }
  return { side: outcome.side, kind: 'dq', text: 'Disqualification' };
}

export function outcomeSubtitle(outcome: MatchOutcome | null): string | null {
  if (!outcome) return null;
  if (outcome.call === 'win') {
    if (outcome.method === 'points' && outcome.scoreReason) return SCORE_REASON_LABELS[outcome.scoreReason];
    return WIN_METHOD_LABELS[outcome.method];
  }
  return DQ_REASON_LABELS[outcome.reason];
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

export function autoPointsOutcome(side: Side, scoreReason: ScoreDecisionReason, at = Date.now()): MatchOutcome {
  return {
    side,
    call: 'win',
    method: 'points',
    scoreReason,
    source: 'auto',
    at,
  };
}
