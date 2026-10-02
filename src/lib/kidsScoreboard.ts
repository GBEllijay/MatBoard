/**
 * Kids' Scoreboards — device-local bracket TV mode on the Pro suite board.
 * Coach and Coach Unlimited mock tournaments stay on the plain Bright/Dark tree.
 * The existing tree stays. A skin is only a wallpaper behind frosted name bubbles.
 * Grand Master Carlos is a win overlay, never a live-match graphic.
 */

import { displayBoutName, slotName, type BoutPoints, type TournamentState } from './tournamentStore.ts';

export const KIDS_SCOREBOARDS_NAME = "Kids' Scoreboards";
/** Footer control on Brackets. Same on/off and wallpaper chips as Kids' Scoreboards. */
export const KIDS_BRACKETS_SKINS_LABEL = 'Kids Brackets Skins';
export const KIDS_WIN_CHEER = 'Bom trabalho!';
export const KIDS_MODE_KEY = 'matboard.kidsScoreboard.v1';
export const CARLOS_ASSET = '/assets/kids/carlos.webp';

export const KIDS_SKINS = [
  { id: 'dinos', label: 'Dinos' },
  { id: 'unicorns', label: 'Stars & unicorns' },
  { id: 'robots', label: 'Robots' },
  { id: 'space', label: 'Space' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'superheroes', label: 'Superheroes' },
] as const;

export type KidsSkinId = (typeof KIDS_SKINS)[number]['id'];

export type KidsScoreboardPrefs = {
  enabled: boolean;
  skin: KidsSkinId;
};

const DEFAULT_PREFS: KidsScoreboardPrefs = { enabled: false, skin: 'dinos' };

const listeners = new Set<() => void>();
let snapshot: KidsScoreboardPrefs = DEFAULT_PREFS;
let snapshotRaw: string | null = null;

function parsePrefs(raw: string | null): KidsScoreboardPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown; skin?: unknown };
    const next: KidsScoreboardPrefs = {
      enabled: parsed.enabled === true,
      skin: isSkin(parsed.skin) ? parsed.skin : DEFAULT_PREFS.skin,
    };
    if (next.enabled === DEFAULT_PREFS.enabled && next.skin === DEFAULT_PREFS.skin) return DEFAULT_PREFS;
    return next;
  } catch {
    return DEFAULT_PREFS;
  }
}

function isSkin(value: unknown): value is KidsSkinId {
  return KIDS_SKINS.some((skin) => skin.id === value);
}

function readPrefs(): KidsScoreboardPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KIDS_MODE_KEY);
  } catch {
    raw = null;
  }
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  snapshot = parsePrefs(raw);
  return snapshot;
}

function writePrefs(prefs: KidsScoreboardPrefs): void {
  const raw = JSON.stringify(prefs);
  snapshot = prefs;
  snapshotRaw = raw;
  try {
    localStorage.setItem(KIDS_MODE_KEY, raw);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function getKidsScoreboard(): KidsScoreboardPrefs {
  return readPrefs();
}

export function subscribeKidsScoreboard(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setKidsEnabled(enabled: boolean): void {
  writePrefs({ ...readPrefs(), enabled });
}

export function setKidsSkin(skin: KidsSkinId): void {
  writePrefs({ ...readPrefs(), skin });
}

/** Kids wallpaper and bracket Carlos belong on the Pro suite board only. */
export function kidsBracketChromeOn(fromSuite: boolean, enabled: boolean): boolean {
  return fromSuite && enabled;
}

export function kidsSkinLabel(skin: KidsSkinId): string {
  return KIDS_SKINS.find((row) => row.id === skin)?.label ?? KIDS_SKINS[0].label;
}

export function kidsWallpaperPath(skin: KidsSkinId): string {
  return `/assets/kids/${skin}.webp`;
}

/**
 * Carlos only after the championship bout has a winner. A stored champion name
 * wins; otherwise the finalist's slot name or the same placeholder the card
 * already shows. A live bout (no final result, no champion) keeps him off.
 */
export function kidsResolvedChampion(board: TournamentState): string {
  const stored = slotName(board, 'champion').trim();
  if (stored) return stored;
  const result = board.results['final-0'];
  if (!result) return '';
  return displayBoutName(board, 'final-0', result.winnerSide);
}

/** Carlos only after a champion is decided. A live bout keeps him off the tree. */
export function kidsShowWin(enabled: boolean, championName: string): boolean {
  return enabled && championName.trim().length > 0;
}

export function kidsWinState(
  enabled: boolean,
  board: TournamentState,
): { show: boolean; name: string; scoreLine: string | null } {
  const name = kidsResolvedChampion(board);
  return {
    show: kidsShowWin(enabled, name),
    name,
    scoreLine: name ? kidsPointsLine(board.results['final-0']?.points) : null,
  };
}

/** Visible speech: "Bom trabalho!" plus the winner and the scoreboard points. */
export function kidsWinLines(name: string, scoreLine: string | null): readonly string[] {
  const lines = [KIDS_WIN_CHEER];
  const who = name.trim();
  if (who) lines.push(who);
  if (scoreLine) lines.push(scoreLine);
  return lines;
}

/** "12-0" when the scoreboard stored the final. Missing points stay blank. */
export function kidsPointsLine(points: BoutPoints | null | undefined): string | null {
  if (!points) return null;
  if (!Number.isInteger(points.winner) || !Number.isInteger(points.loser)) return null;
  if (points.winner < 0 || points.loser < 0 || points.winner > 99 || points.loser > 99) return null;
  return `${points.winner}-${points.loser}`;
}

export function kidsLiveLine(input: {
  title: string;
  blueName: string;
  whiteName: string;
  bluePoints: number;
  whitePoints: number;
}): string {
  const blue = input.blueName.trim() || 'Competitor 1';
  const white = input.whiteName.trim() || 'Competitor 2';
  const subject = input.title.trim() || `${blue} vs ${white}`;
  return `${subject} ${input.bluePoints} - ${input.whitePoints}`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KIDS_MODE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
