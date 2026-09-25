/** Single-elim brackets. Coach mock stays 2–16. Pro suite saves up to 64. On-device only. */

import {
  isWinCall,
  parseBoutOutcome,
  type BoutOutcome,
  type DqReason,
  type Side,
  type WinMethod,
} from './outcomes.ts';

export type { BoutOutcome, DqReason, WinMethod };

/** Default board size. Coach mock and a fresh Pro board both start here. */
export const TOURNAMENT_SIZE = 16 as const;
export const MIN_COMPETITORS = 2;
/** Coach / Mock Tournament cap. */
export const COACH_MAX_COMPETITORS = 16;
/** Pro In-House Tournament Management Suite cap. */
export const PRO_MAX_COMPETITORS = 64;
/** Storage ceiling. Coach UI passes COACH_MAX_COMPETITORS when it changes size. */
export const MAX_COMPETITORS = PRO_MAX_COMPETITORS;
export const SIZE_PRESETS = [2, 4, 8, 16] as const;
export const PRO_SIZE_PRESETS = [2, 4, 8, 16, 32, 64] as const;
export const BRACKET_NAME_MAX = 80;

export type TreeSize = 2 | 4 | 8 | 16 | 32 | 64;
export type RoundPrefix = 'r64' | 'r32' | 'r16' | 'qf' | 'sf' | 'final';
export type BracketMatchId = `${RoundPrefix}-${number}`;
export type MatchSide = 'a' | 'b';
export type SlotId = `${BracketMatchId}-${MatchSide}` | 'champion';

const ROUND_SPEC: readonly { prefix: RoundPrefix; count: number; next: RoundPrefix | null }[] = [
  { prefix: 'r64', count: 32, next: 'r32' },
  { prefix: 'r32', count: 16, next: 'r16' },
  { prefix: 'r16', count: 8, next: 'qf' },
  { prefix: 'qf', count: 4, next: 'sf' },
  { prefix: 'sf', count: 2, next: 'final' },
  { prefix: 'final', count: 1, next: null },
];

export const MATCH_IDS: readonly BracketMatchId[] = ROUND_SPEC.flatMap((round) =>
  Array.from({ length: round.count }, (_, index) => `${round.prefix}-${index}` as BracketMatchId),
);

const MATCH_ID_SET = new Set<string>(MATCH_IDS);

function buildNextSlot(): Record<string, SlotId> {
  const next: Record<string, SlotId> = {};
  for (const round of ROUND_SPEC) {
    for (let index = 0; index < round.count; index += 1) {
      const id = `${round.prefix}-${index}`;
      if (!round.next) {
        next[id] = 'champion';
        continue;
      }
      const side: MatchSide = index % 2 === 0 ? 'a' : 'b';
      next[id] = `${round.next}-${Math.floor(index / 2)}-${side}`;
    }
  }
  return next;
}

export type BoutResult = {
  winnerSide: MatchSide;
} & BoutOutcome;

export type TournamentState = {
  version: 1;
  /** Competitor count (2–64). Tree size is the next power of 2; extra slots are byes. */
  size: number;
  title: string;
  entries: Record<string, string>;
  results: Partial<Record<BracketMatchId, BoutResult>>;
  /** Most recent bout written from Scoreboard or bracket marks — one-level Undo. */
  lastOutcomeMatchId: BracketMatchId | null;
};

export type SavedBracket = {
  id: string;
  name: string;
  updatedAt: number;
  board: TournamentState;
};

export type TournamentLibrary = {
  version: 2;
  activeId: string;
  saved: SavedBracket[];
};

/**
 * Scoreboard ↔ bracket: live bout `MatchState.bracketMatchId` is one of `MATCH_IDS`
 * that exist on the active tree. Win (Submission / Points / Decision) and DQ
 * (Technical / Medical) call `setMatchOutcome(id, side, pick, { toggle: false })`.
 * Same on-device store.
 */
export const PHASE2_BOUT_LINK = {
  matchStateField: 'bracketMatchId',
  winMethods: ['submission', 'points', 'decision'] as const,
  dqReasons: ['technical', 'medical'] as const,
  matchIds: MATCH_IDS,
  /** Bracket slot `a` (top) is Blue on the scoreboard; `b` is White. */
  scoreboardSides: { a: 'blue', b: 'white' } as const,
} as const;

/**
 * Owner cloud sync of named brackets is intentionally out of this version.
 * Coach mock stays at 16. Pro suite boards save up to 64 on this device.
 * Cloud sync of those named division brackets comes later.
 */
export const OWNER_BRACKET_CLOUD = {
  status: 'planned' as const,
  coachSaves: 'local-only',
  ownerSaves: 'local-only',
  next: 'cloud sync of named brackets; Pro already saves up to 64 locally',
};

export function scoreboardSideToBracket(side: Side): MatchSide {
  return side === 'blue' ? 'a' : 'b';
}

export const STORAGE_KEY = 'matboard.tournament.v1';

const NEXT_SLOT: Record<string, SlotId> = buildNextSlot();

const ROUND_LABEL: Record<RoundPrefix, string> = {
  r64: 'Round of 64',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarterfinals',
  sf: 'Semifinals',
  final: 'Final',
};

const ROUND_ORDER: readonly RoundPrefix[] = ['r64', 'r32', 'r16', 'qf', 'sf', 'final'];

const listeners = new Set<() => void>();
let library: TournamentLibrary = loadLibrary();
let bracketSeq = 0;

export function maxCompetitors(proUnlocked: boolean): number {
  return proUnlocked ? PRO_MAX_COMPETITORS : COACH_MAX_COMPETITORS;
}

export function sizePresets(proUnlocked: boolean): readonly number[] {
  return proUnlocked ? PRO_SIZE_PRESETS : SIZE_PRESETS;
}

export function clampCompetitorCount(value: number, max = PRO_MAX_COMPETITORS): number {
  if (!Number.isFinite(value)) return TOURNAMENT_SIZE;
  const ceiling = Math.min(PRO_MAX_COMPETITORS, Math.max(MIN_COMPETITORS, max));
  return Math.min(ceiling, Math.max(MIN_COMPETITORS, Math.round(value)));
}

export function treeSizeFor(count: number): TreeSize {
  const n = clampCompetitorCount(count);
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  if (n <= 16) return 16;
  if (n <= 32) return 32;
  return 64;
}

export function byeCountFor(count: number): number {
  const n = clampCompetitorCount(count);
  return treeSizeFor(n) - n;
}

export function firstRoundPrefix(tree: TreeSize): RoundPrefix {
  if (tree === 64) return 'r64';
  if (tree === 32) return 'r32';
  if (tree === 16) return 'r16';
  if (tree === 8) return 'qf';
  if (tree === 4) return 'sf';
  return 'final';
}

export function matchesInRound(prefix: RoundPrefix): number {
  if (prefix === 'r64') return 32;
  if (prefix === 'r32') return 16;
  if (prefix === 'r16') return 8;
  if (prefix === 'qf') return 4;
  if (prefix === 'sf') return 2;
  return 1;
}

export function roundMatchIds(prefix: RoundPrefix): BracketMatchId[] {
  const count = matchesInRound(prefix);
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}` as BracketMatchId);
}

export function firstRoundMatchIds(tree: TreeSize): BracketMatchId[] {
  return roundMatchIds(firstRoundPrefix(tree));
}

export function matchIdsForTree(tree: TreeSize): BracketMatchId[] {
  const start = ROUND_ORDER.indexOf(firstRoundPrefix(tree));
  return ROUND_ORDER.slice(start).flatMap((prefix) => roundMatchIds(prefix));
}

export function matchIdsForSize(count: number): BracketMatchId[] {
  return matchIdsForTree(treeSizeFor(count));
}

export function visibleRoundPrefixes(tree: TreeSize): RoundPrefix[] {
  return ROUND_ORDER.slice(ROUND_ORDER.indexOf(firstRoundPrefix(tree)));
}

export function leftRoundIds(prefix: RoundPrefix): BracketMatchId[] {
  if (prefix === 'final') return [];
  const ids = roundMatchIds(prefix);
  return ids.slice(0, ids.length / 2);
}

export function rightRoundIds(prefix: RoundPrefix): BracketMatchId[] {
  if (prefix === 'final') return [];
  const ids = roundMatchIds(prefix);
  return ids.slice(ids.length / 2);
}

export function isKnownMatchId(value: unknown): value is BracketMatchId {
  return typeof value === 'string' && MATCH_ID_SET.has(value);
}

export function isBracketMatchId(value: unknown): value is BracketMatchId {
  if (!isKnownMatchId(value)) return false;
  return matchIdsForSize(getTournament().size).includes(value);
}

export function slotId(matchId: BracketMatchId, side: MatchSide): SlotId {
  return `${matchId}-${side}`;
}

export function matchIdFromSlot(id: SlotId): BracketMatchId | null {
  if (id === 'champion') return 'final-0';
  const matchId = id.slice(0, id.lastIndexOf('-'));
  return isKnownMatchId(matchId) ? matchId : null;
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
  return ROUND_LABEL[matchId.split('-')[0] as RoundPrefix] ?? matchId;
}

export function firstRoundLabel(count: number): string {
  return ROUND_LABEL[firstRoundPrefix(treeSizeFor(count))];
}

export function bracketRoundLine(current: TournamentState): string {
  const n = clampCompetitorCount(current.size);
  const round = firstRoundLabel(n);
  const byes = byeCountFor(n);
  const people = `${n} competitor${n === 1 ? '' : 's'}`;
  if (!byes) return `${round} · ${people}`;
  return `${round} · ${people} · ${byes} ${byes === 1 ? 'bye' : 'byes'}`;
}

export function firstRoundSlots(tree: TreeSize): SlotId[] {
  return firstRoundMatchIds(tree).flatMap((id) => [slotId(id, 'a'), slotId(id, 'b')]);
}

export function byeSlotIds(count: number): SlotId[] {
  const n = clampCompetitorCount(count);
  const byes = byeCountFor(n);
  if (!byes) return [];
  const matches = firstRoundMatchIds(treeSizeFor(n));
  return matches.slice(matches.length - byes).map((id) => slotId(id, 'b'));
}

export function isByeSlot(current: TournamentState, id: SlotId | string): boolean {
  return byeSlotIds(current.size).includes(id as SlotId);
}

export function matchHasBye(current: TournamentState, matchId: BracketMatchId): boolean {
  return isByeSlot(current, slotId(matchId, 'a')) || isByeSlot(current, slotId(matchId, 'b'));
}

export function seedSlots(current: TournamentState = getTournament()): SlotId[] {
  return firstRoundSlots(treeSizeFor(current.size)).filter((id) => !isByeSlot(current, id));
}

export function slotName(current: TournamentState, id: SlotId | string): string {
  return current.entries[id] ?? '';
}

export function defaultTournament(size: number = TOURNAMENT_SIZE): TournamentState {
  return {
    version: 1,
    size: clampCompetitorCount(size),
    title: '',
    entries: {},
    results: {},
    lastOutcomeMatchId: null,
  };
}

function createBracketId(): string {
  bracketSeq += 1;
  return `b-${Date.now().toString(36)}-${bracketSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function displayBracketName(row: SavedBracket): string {
  return row.name.trim() || row.board.title.trim() || 'Untitled';
}

export function defaultSavedBracket(): SavedBracket {
  return {
    id: 'bracket-1',
    name: '',
    updatedAt: 0,
    board: defaultTournament(),
  };
}

export function defaultLibrary(): TournamentLibrary {
  const first = defaultSavedBracket();
  return { version: 2, activeId: first.id, saved: [first] };
}

function normalizeResult(raw: unknown): BoutResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.winnerSide !== 'a' && row.winnerSide !== 'b') return null;
  const pick = parseBoutOutcome(row);
  if (!pick) return null;
  return { winnerSide: row.winnerSide, ...pick };
}

function validSlotKeys(size: number): Set<string> {
  const keys = new Set<string>(['champion']);
  for (const id of matchIdsForSize(size)) {
    keys.add(slotId(id, 'a'));
    keys.add(slotId(id, 'b'));
  }
  return keys;
}

export function normalizeBoard(raw: unknown): TournamentState {
  if (!raw || typeof raw !== 'object') return defaultTournament();
  const parsed = raw as Partial<TournamentState> & { results?: Record<string, unknown> };
  const size = clampCompetitorCount(typeof parsed.size === 'number' ? parsed.size : TOURNAMENT_SIZE);
  const allowedMatches = new Set(matchIdsForSize(size));
  const allowedSlots = validSlotKeys(size);
  const entries: Record<string, string> = {};
  if (parsed.entries && typeof parsed.entries === 'object') {
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (!allowedSlots.has(key)) continue;
      if (typeof value === 'string' && value.trim()) entries[key] = value;
    }
  }
  const results: TournamentState['results'] = {};
  if (parsed.results && typeof parsed.results === 'object') {
    for (const id of MATCH_IDS) {
      if (!allowedMatches.has(id)) continue;
      const result = normalizeResult(parsed.results[id]);
      if (result) results[id] = result;
    }
  }
  const last = parsed.lastOutcomeMatchId;
  const board: TournamentState = {
    version: 1,
    size,
    title: typeof parsed.title === 'string' ? parsed.title : '',
    entries,
    results,
    lastOutcomeMatchId: isKnownMatchId(last) && allowedMatches.has(last) ? last : null,
  };
  return advanceByes(board);
}

function normalizeSavedRow(raw: unknown, fallbackId: string): SavedBracket | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<SavedBracket>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : fallbackId;
  const name = typeof row.name === 'string' ? row.name.trim().slice(0, BRACKET_NAME_MAX) : '';
  const updatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
  return {
    id,
    name,
    updatedAt,
    board: normalizeBoard(row.board),
  };
}

export function normalizeLibrary(raw: unknown): TournamentLibrary {
  if (!raw || typeof raw !== 'object') return defaultLibrary();
  const parsed = raw as Partial<TournamentLibrary> & Partial<TournamentState>;
  if (Array.isArray(parsed.saved)) {
    const saved: SavedBracket[] = [];
    const seen = new Set<string>();
    parsed.saved.forEach((row, index) => {
      const next = normalizeSavedRow(row, `bracket-${index + 1}`);
      if (!next || seen.has(next.id)) return;
      seen.add(next.id);
      saved.push(next);
    });
    if (!saved.length) return defaultLibrary();
    const activeId =
      typeof parsed.activeId === 'string' && saved.some((row) => row.id === parsed.activeId)
        ? parsed.activeId
        : saved[0].id;
    return { version: 2, activeId, saved };
  }
  const board = normalizeBoard(parsed);
  const name = board.title.trim().slice(0, BRACKET_NAME_MAX);
  return {
    version: 2,
    activeId: 'bracket-1',
    saved: [{ id: 'bracket-1', name, updatedAt: 0, board }],
  };
}

function loadLibrary(): TournamentLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLibrary();
    return normalizeLibrary(JSON.parse(raw) as unknown);
  } catch {
    return defaultLibrary();
  }
}

function clone(current: TournamentState): TournamentState {
  return {
    version: 1,
    size: clampCompetitorCount(current.size),
    title: current.title,
    entries: { ...current.entries },
    results: { ...current.results },
    lastOutcomeMatchId: current.lastOutcomeMatchId ?? null,
  };
}

function persistLibrary(next: TournamentLibrary): void {
  library = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

function activeRow(lib: TournamentLibrary = library): SavedBracket {
  return lib.saved.find((row) => row.id === lib.activeId) ?? lib.saved[0] ?? defaultSavedBracket();
}

function replaceActiveBoard(lib: TournamentLibrary, board: TournamentState): TournamentLibrary {
  const id = activeRow(lib).id;
  return {
    version: 2,
    activeId: lib.activeId === id ? lib.activeId : id,
    saved: lib.saved.map((row) =>
      row.id === id ? { ...row, board, updatedAt: Date.now() } : row,
    ),
  };
}

function patchActive(updater: (board: TournamentState) => TournamentState): void {
  persistLibrary(replaceActiveBoard(library, updater(getTournament())));
}

export function getTournament(): TournamentState {
  return activeRow().board;
}

export function getLibrary(): TournamentLibrary {
  return library;
}

export function subscribeTournament(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTournamentSync(): void {
  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY) return;
    library = loadLibrary();
    listeners.forEach((fn) => fn());
  });
}

function writeSlot(next: TournamentState, id: SlotId, name: string): void {
  if (isByeSlot(next, id)) {
    delete next.entries[id];
    return;
  }
  const trimmed = name.trim();
  if (trimmed) next.entries[id] = name;
  else delete next.entries[id];
}

function livingSideOfByeMatch(current: TournamentState, matchId: BracketMatchId): MatchSide | null {
  const aBye = isByeSlot(current, slotId(matchId, 'a'));
  const bBye = isByeSlot(current, slotId(matchId, 'b'));
  if (aBye === bBye) return null;
  return aBye ? 'b' : 'a';
}

/** Fill the next-round name when a first-round slot is a bye. */
export function advanceByes(current: TournamentState): TournamentState {
  const next = current;
  for (const matchId of firstRoundMatchIds(treeSizeFor(next.size))) {
    if (next.results[matchId]) continue;
    const living = livingSideOfByeMatch(next, matchId);
    if (!living) continue;
    const dest = NEXT_SLOT[matchId];
    if (dest !== 'champion') {
      const child = matchIdFromSlot(dest);
      if (child && next.results[child]) continue;
    }
    writeSlot(next, dest, slotName(next, slotId(matchId, living)));
    if (dest !== 'champion') {
      const child = matchIdFromSlot(dest);
      const side = sideFromSlot(dest);
      if (child && side && next.results[child]?.winnerSide === side) {
        cascadeWinner(next, child, new Set());
      }
    }
  }
  return next;
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
  return advanceByes(next);
}

export function applyMatchOutcome(
  current: TournamentState,
  matchId: BracketMatchId,
  side: MatchSide,
  pick: BoutOutcome,
  options?: { toggle?: boolean },
): TournamentState {
  if (!matchIdsForSize(current.size).includes(matchId) || matchHasBye(current, matchId)) {
    return current;
  }
  const toggle = options?.toggle !== false;
  const next = clone(current);
  const existing = next.results[matchId];
  const same =
    existing &&
    existing.call === pick.call &&
    (pick.call === 'win'
      ? existing.call === 'win' && existing.method === pick.method && existing.winnerSide === side
      : existing.call === 'dq' && existing.reason === pick.reason && existing.winnerSide === otherSide(side));
  if (same && toggle) {
    delete next.results[matchId];
    if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
  } else if (pick.call === 'win') {
    next.results[matchId] = {
      winnerSide: side,
      call: 'win',
      method: pick.method,
      ...(pick.scoreReason ? { scoreReason: pick.scoreReason } : {}),
    };
    next.lastOutcomeMatchId = matchId;
  } else {
    next.results[matchId] = { winnerSide: otherSide(side), call: 'dq', reason: pick.reason };
    next.lastOutcomeMatchId = matchId;
  }
  cascadeWinner(next, matchId, new Set());
  return advanceByes(next);
}

export function applyClearResult(current: TournamentState, matchId: BracketMatchId): TournamentState {
  if (!current.results[matchId]) return current;
  const next = clone(current);
  delete next.results[matchId];
  if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
  cascadeWinner(next, matchId, new Set());
  return advanceByes(next);
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
      return advanceByes(next);
    }
  }

  if (!destWasAutoFilled) {
    const next = clone(current);
    delete next.results[matchId];
    if (next.lastOutcomeMatchId === matchId) next.lastOutcomeMatchId = null;
    return advanceByes(next);
  }

  return applyClearResult(current, matchId);
}

export function applyCompetitorCount(
  current: TournamentState,
  size: number,
  max = PRO_MAX_COMPETITORS,
): TournamentState {
  const nextSize = clampCompetitorCount(size, max);
  if (nextSize === clampCompetitorCount(current.size, max) && nextSize === current.size) return current;
  const names = seedSlots(current).map((id) => slotName(current, id));
  const next = defaultTournament(nextSize);
  next.title = current.title;
  const dest = seedSlots(next);
  names.forEach((name, index) => {
    if (index < dest.length && name.trim()) writeSlot(next, dest[index], name);
  });
  return advanceByes(next);
}

export function applyRenameBracket(
  lib: TournamentLibrary,
  id: string,
  name: string,
): TournamentLibrary {
  const trimmed = name.trim().slice(0, BRACKET_NAME_MAX);
  if (!lib.saved.some((row) => row.id === id)) return lib;
  return {
    version: 2,
    activeId: lib.activeId,
    saved: lib.saved.map((row) =>
      row.id === id ? { ...row, name: trimmed, updatedAt: Date.now() } : row,
    ),
  };
}

export function applySwitchBracket(lib: TournamentLibrary, id: string): TournamentLibrary {
  if (lib.activeId === id || !lib.saved.some((row) => row.id === id)) return lib;
  return { version: 2, activeId: id, saved: lib.saved };
}

export function applyNewBracket(lib: TournamentLibrary, size?: number): TournamentLibrary {
  const id = createBracketId();
  const board = defaultTournament(size ?? activeRow(lib).board.size);
  const row: SavedBracket = { id, name: '', updatedAt: Date.now(), board };
  return { version: 2, activeId: id, saved: [...lib.saved, row] };
}

export function applyDeleteBracket(lib: TournamentLibrary, id: string): TournamentLibrary {
  if (lib.saved.length <= 1) return lib;
  const saved = lib.saved.filter((row) => row.id !== id);
  if (saved.length === lib.saved.length) return lib;
  const activeId = lib.activeId === id ? saved[0].id : lib.activeId;
  return { version: 2, activeId, saved };
}

export type SlotMark = 'win' | 'dq' | 'advanced' | 'lost';

export function slotMark(
  result: BoutResult | undefined,
  side: MatchSide,
): SlotMark | null {
  if (!result) return null;
  if (result.winnerSide === side) {
    return isWinCall(result) ? 'win' : 'advanced';
  }
  if (result.call === 'dq') return 'dq';
  return 'lost';
}

export function setTournamentTitle(title: string): void {
  patchActive((board) => ({ ...clone(board), title }));
}

export function setSlotName(id: SlotId, name: string): void {
  patchActive((board) => applySlotName(board, id, name));
}

export function setMatchOutcome(
  matchId: BracketMatchId,
  side: MatchSide,
  pick: BoutOutcome,
  options?: { toggle?: boolean },
): void {
  patchActive((board) => applyMatchOutcome(board, matchId, side, pick, options));
}

export function clearMatchResult(matchId: BracketMatchId): void {
  patchActive((board) => applyClearResult(board, matchId));
}

export function undoMatchOutcome(matchId: BracketMatchId): void {
  patchActive((board) => applyUndoOutcome(board, matchId));
}

export function undoLastOutcome(): void {
  const board = getTournament();
  if (!board.lastOutcomeMatchId || !board.results[board.lastOutcomeMatchId]) return;
  patchActive((current) => applyUndoOutcome(current, current.lastOutcomeMatchId!));
}

export function canUndoLast(current: TournamentState = getTournament()): boolean {
  const id = current.lastOutcomeMatchId;
  return Boolean(id && current.results[id]);
}

export function resetTournament(): void {
  patchActive((board) => {
    const next = defaultTournament(board.size);
    next.title = '';
    return next;
  });
}

export function setCompetitorCount(size: number, max = PRO_MAX_COMPETITORS): void {
  patchActive((board) => applyCompetitorCount(board, size, max));
}

export function renameActiveBracket(name: string): void {
  const trimmed = name.trim().slice(0, BRACKET_NAME_MAX);
  persistLibrary(applyRenameBracket(library, library.activeId, trimmed));
  if (trimmed && !getTournament().title.trim()) {
    patchActive((board) => ({ ...clone(board), title: trimmed }));
  }
}

export function switchBracket(id: string): void {
  persistLibrary(applySwitchBracket(library, id));
}

export function newBracket(size?: number): void {
  persistLibrary(applyNewBracket(library, size));
}

export function deleteBracket(id: string): void {
  persistLibrary(applyDeleteBracket(library, id));
}

export function seedPlaceholder(index: number): string {
  return `Competitor ${index + 1}`;
}

export function bracketHasCompetitors(current: TournamentState): boolean {
  return seedSlots(current).some((id) => slotName(current, id).trim());
}

export function bracketHasContent(current: TournamentState): boolean {
  if (current.title.trim()) return true;
  if (Object.values(current.entries).some((name) => name.trim())) return true;
  return Object.keys(current.results).length > 0;
}
