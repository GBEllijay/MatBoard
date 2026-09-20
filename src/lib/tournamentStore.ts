/** 16-person single-elim mock bracket. On-device only — no tournament server. */

import {
  isWinMethod,
  parseBoutOutcomeKind,
  type BoutOutcomeKind,
  type Side,
} from './outcomes';

export type { BoutOutcomeKind };

export const TOURNAMENT_SIZE = 16 as const;

export const MATCH_IDS = [
  'r16-0',
  'r16-1',
  'r16-2',
  'r16-3',
  'r16-4',
  'r16-5',
  'r16-6',
  'r16-7',
  'qf-0',
  'qf-1',
  'qf-2',
  'qf-3',
  'sf-0',
  'sf-1',
  'final-0',
] as const;

export type BracketMatchId = (typeof MATCH_IDS)[number];
export type MatchSide = 'a' | 'b';
export type SlotId = `${BracketMatchId}-${MatchSide}` | 'champion';

export type BoutResult = {
  winnerSide: MatchSide;
  kind: BoutOutcomeKind;
};

export type TournamentState = {
  version: 1;
  /** Reserved so Phase 2 can add an 8-person board without a new storage key. */
  size: typeof TOURNAMENT_SIZE;
  title: string;
  entries: Record<string, string>;
  results: Partial<Record<BracketMatchId, BoutResult>>;
  /** Most recent bout written from Scoreboard or bracket marks — one-level Undo. */
  lastOutcomeMatchId: BracketMatchId | null;
};

/**
 * Scoreboard ↔ bracket: live bout `MatchState.bracketMatchId` is one of `MATCH_IDS`.
 * Win / Sub / DQ / T-loss call `setMatchOutcome(id, side, kind, { toggle: false })`. Same on-device store.
 */
export const PHASE2_BOUT_LINK = {
  matchStateField: 'bracketMatchId',
  outcomes: ['score', 'submission', 'dq', 'tech'] as const,
  matchIds: MATCH_IDS,
  /** Bracket slot `a` (top) is Blue on the scoreboard; `b` is White. */
  scoreboardSides: { a: 'blue', b: 'white' } as const,
} as const;

export function scoreboardSideToBracket(side: Side): MatchSide {
  return side === 'blue' ? 'a' : 'b';
}

export const STORAGE_KEY = 'matboard.tournament.v1';

export const LEFT_R16 = ['r16-0', 'r16-1', 'r16-2', 'r16-3'] as const;
export const RIGHT_R16 = ['r16-4', 'r16-5', 'r16-6', 'r16-7'] as const;
export const LEFT_QF = ['qf-0', 'qf-1'] as const;
export const RIGHT_QF = ['qf-2', 'qf-3'] as const;

const NEXT_SLOT: Record<BracketMatchId, SlotId> = {
  'r16-0': 'qf-0-a',
  'r16-1': 'qf-0-b',
  'r16-2': 'qf-1-a',
  'r16-3': 'qf-1-b',
  'r16-4': 'qf-2-a',
  'r16-5': 'qf-2-b',
  'r16-6': 'qf-3-a',
  'r16-7': 'qf-3-b',
  'qf-0': 'sf-0-a',
  'qf-1': 'sf-0-b',
  'qf-2': 'sf-1-a',
  'qf-3': 'sf-1-b',
  'sf-0': 'final-0-a',
  'sf-1': 'final-0-b',
  'final-0': 'champion',
};

const ROUND_LABEL: Record<string, string> = {
  r16: 'Round of 16',
  qf: 'Quarterfinals',
  sf: 'Semifinals',
  final: 'Final',
};

const listeners = new Set<() => void>();
let state: TournamentState = loadState();

export function isBracketMatchId(value: unknown): value is BracketMatchId {
  return typeof value === 'string' && (MATCH_IDS as readonly string[]).includes(value);
}

export function slotId(matchId: BracketMatchId, side: MatchSide): SlotId {
  return `${matchId}-${side}`;
}

export function matchIdFromSlot(id: SlotId): BracketMatchId | null {
  if (id === 'champion') return 'final-0';
  const matchId = id.slice(0, id.lastIndexOf('-'));
  return isBracketMatchId(matchId) ? matchId : null;
}

export function sideFromSlot(id: SlotId): MatchSide | null {
  if (id === 'champion') return null;
  const side = id.slice(id.lastIndexOf('-') + 1);
  return side === 'a' || side === 'b' ? side : null;
}

export function otherSide(side: MatchSide): MatchSide {
  return side === 'a' ? 'b' : 'a';
}

export function nextSlot(matchId: BracketMatchId): SlotId {
  return NEXT_SLOT[matchId];
}

export function roundLabel(matchId: BracketMatchId): string {
  return ROUND_LABEL[matchId.split('-')[0] ?? ''] ?? matchId;
}

export function seedSlots(): SlotId[] {
  return [...LEFT_R16, ...RIGHT_R16].flatMap((id) => [slotId(id, 'a'), slotId(id, 'b')]);
}

export function slotName(current: TournamentState, id: SlotId | string): string {
  return current.entries[id] ?? '';
}

export function defaultTournament(): TournamentState {
  return {
    version: 1,
    size: TOURNAMENT_SIZE,
    title: '',
    entries: {},
    results: {},
    lastOutcomeMatchId: null,
  };
}

function normalizeResult(raw: unknown): BoutResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<BoutResult>;
  if (row.winnerSide !== 'a' && row.winnerSide !== 'b') return null;
  const kind = parseBoutOutcomeKind(row.kind);
  if (!kind) return null;
  return { winnerSide: row.winnerSide, kind };
}

function loadState(): TournamentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTournament();
    const parsed = JSON.parse(raw) as Partial<TournamentState>;
    const entries =
      parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
    const results: TournamentState['results'] = {};
    if (parsed.results && typeof parsed.results === 'object') {
      for (const id of MATCH_IDS) {
        const result = normalizeResult(parsed.results[id]);
        if (result) results[id] = result;
      }
    }
    const cleanEntries: Record<string, string> = {};
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value === 'string' && value.trim()) cleanEntries[key] = value;
    }
    return {
      version: 1,
      size: TOURNAMENT_SIZE,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      entries: cleanEntries,
      results,
      lastOutcomeMatchId: isBracketMatchId(parsed.lastOutcomeMatchId) ? parsed.lastOutcomeMatchId : null,
    };
  } catch {
    return defaultTournament();
  }
}

function clone(current: TournamentState): TournamentState {
  return {
    version: 1,
    size: TOURNAMENT_SIZE,
    title: current.title,
    entries: { ...current.entries },
    results: { ...current.results },
    lastOutcomeMatchId: current.lastOutcomeMatchId ?? null,
  };
}

function persist(next: TournamentState): void {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function getTournament(): TournamentState {
  return state;
}

export function subscribeTournament(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTournamentSync(): void {
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY) return;
    state = loadState();
    listeners.forEach((fn) => fn());
  });
}

function writeSlot(next: TournamentState, id: SlotId, name: string): void {
  const trimmed = name.trim();
  if (trimmed) next.entries[id] = name;
  else delete next.entries[id];
}

/** Re-apply a stored result so the next-round name stays in sync. */
function cascadeWinner(next: TournamentState, matchId: BracketMatchId, seen: Set<BracketMatchId>): void {
  if (seen.has(matchId)) return;
  seen.add(matchId);
  const result = next.results[matchId];
  const dest = NEXT_SLOT[matchId];
  if (!result) {
    writeSlot(next, dest, '');
    if (dest !== 'champion') {
      const child = matchIdFromSlot(dest);
      const side = sideFromSlot(dest);
      if (child && side && next.results[child]?.winnerSide === side) {
        delete next.results[child];
        cascadeWinner(next, child, seen);
      }
    }
    return;
  }
  writeSlot(next, dest, slotName(next, slotId(matchId, result.winnerSide)));
  if (dest !== 'champion') {
    const child = matchIdFromSlot(dest);
    if (child && next.results[child]) cascadeWinner(next, child, seen);
  }
}

export function applySlotName(current: TournamentState, id: SlotId, name: string): TournamentState {
  const next = clone(current);
  writeSlot(next, id, name);
  if (id === 'champion') return next;
  const matchId = matchIdFromSlot(id);
  const side = sideFromSlot(id);
  if (matchId && side && next.results[matchId]?.winnerSide === side) {
    cascadeWinner(next, matchId, new Set());
  }
  return next;
}

export function applyMatchOutcome(
  current: TournamentState,
  matchId: BracketMatchId,
  side: MatchSide,
  kind: BoutOutcomeKind,
  options?: { toggle?: boolean },
): TournamentState {
  const toggle = options?.toggle !== false;
  const next = clone(current);
  const existing = next.results[matchId];
  const winCall = isWinMethod(kind);
  const same =
    existing &&
    existing.kind === kind &&
    (winCall ? existing.winnerSide === side : existing.winnerSide === otherSide(side));
  if (same && toggle) {
    delete next.results[matchId];
    if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
  } else if (winCall) {
    next.results[matchId] = { winnerSide: side, kind };
    next.lastOutcomeMatchId = matchId;
  } else {
    next.results[matchId] = { winnerSide: otherSide(side), kind };
    next.lastOutcomeMatchId = matchId;
  }
  cascadeWinner(next, matchId, new Set());
  return next;
}

export function applyClearResult(current: TournamentState, matchId: BracketMatchId): TournamentState {
  if (!current.results[matchId]) return current;
  const next = clone(current);
  delete next.results[matchId];
  if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
  cascadeWinner(next, matchId, new Set());
  return next;
}

/**
 * Gym-owner undo: clear this bout’s result.
 * If the next-round slot was auto-filled from this winner and that later bout has no result yet,
 * the name is removed (same as Phase 1 cascade). If a later bout already has its own result,
 * or the next name was overwritten, those later slots stay put — this bout is unmarked only.
 */
export function applyUndoOutcome(current: TournamentState, matchId: BracketMatchId): TournamentState {
  const result = current.results[matchId];
  if (!result) return current;
  const dest = NEXT_SLOT[matchId];
  const winnerName = slotName(current, slotId(matchId, result.winnerSide));
  const destName = slotName(current, dest);
  const destWasAutoFilled = !destName || destName === winnerName;

  if (dest !== 'champion') {
    const child = matchIdFromSlot(dest);
    if (child && current.results[child]) {
      const next = clone(current);
      delete next.results[matchId];
      if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
      return next;
    }
  }

  if (!destWasAutoFilled) {
    const next = clone(current);
    delete next.results[matchId];
    if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
    return next;
  }

  return applyClearResult(current, matchId);
}

export type SlotMark = 'win' | 'dq' | 'tech' | 'advanced' | 'lost';

export function slotMark(
  result: BoutResult | undefined,
  side: MatchSide,
): SlotMark | null {
  if (!result) return null;
  if (result.winnerSide === side) {
    return isWinMethod(result.kind) ? 'win' : 'advanced';
  }
  if (result.kind === 'dq' || result.kind === 'tech') return result.kind;
  return 'lost';
}

export function setTournamentTitle(title: string): void {
  persist({ ...state, title });
}

export function setSlotName(id: SlotId, name: string): void {
  persist(applySlotName(state, id, name));
}

export function setMatchOutcome(
  matchId: BracketMatchId,
  side: MatchSide,
  kind: BoutOutcomeKind,
  options?: { toggle?: boolean },
): void {
  persist(applyMatchOutcome(state, matchId, side, kind, options));
}

export function clearMatchResult(matchId: BracketMatchId): void {
  persist(applyClearResult(state, matchId));
}

export function undoMatchOutcome(matchId: BracketMatchId): void {
  persist(applyUndoOutcome(state, matchId));
}

export function undoLastOutcome(): void {
  if (!state.lastOutcomeMatchId || !state.results[state.lastOutcomeMatchId]) return;
  persist(applyUndoOutcome(state, state.lastOutcomeMatchId));
}

export function canUndoLast(current: TournamentState = state): boolean {
  const id = current.lastOutcomeMatchId;
  return Boolean(id && current.results[id]);
}

export function resetTournament(): void {
  persist(defaultTournament());
}

export function seedPlaceholder(index: number): string {
  return `Competitor ${index + 1}`;
}
