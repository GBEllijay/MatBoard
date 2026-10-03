/**
 * Match scoreboard skins. Mock-Tournament is the default.
 * Advantage White Live Bout is Mock-Tournament only — no skin picker.
 * Basic Coach bracket bouts (Score from Mock Tournament) use that same White board.
 * The Pro tournament suite (`from=suite`) keeps Mock-Tournament, Quick Result, and Old School.
 * A linked bout that is not basic Coach — Coach Unlimited, which is Pro-unlocked —
 * also keeps the stored skin. Master Carlos is not a skin; the Pro suite owns him.
 * Quick Result is that same tournament board with Win and DQ under each gym name.
 * LIGHT and KIDS stay reserved.
 * Kids' Scoreboards paints the Pro bracket, not this skin.
 */

import { withSuiteFrom } from './productNames.ts';

/**
 * Old School matches the owner's tabletop flip boards: large points cards,
 * smaller advantage and penalty cards, red against blue, matte black frame.
 */

export const SCOREBOARD_SKIN = {
  /** Approved tournament-photo eyedrop, tuned for TV. */
  MOCK_TOURNAMENT: 'MOCK_TOURNAMENT',
  /** Reserved. Not built. */
  LIGHT: 'LIGHT',
  /** Reserved. Not built. */
  KIDS: 'KIDS',
  /** Mechanical flip-card points, advantages, and penalties. */
  OLD_SCHOOL: 'OLD_SCHOOL',
  /** Tournament board with Win and DQ under each gym name. Pro skin picker only. */
  QUICK_RESULT: 'QUICK_RESULT',
} as const;

export type ScoreboardSkinId = (typeof SCOREBOARD_SKIN)[keyof typeof SCOREBOARD_SKIN];

/** Match display and the controller start on Mock-Tournament until the coach picks another skin. */
export const DEFAULT_SCOREBOARD_SKIN: ScoreboardSkinId = SCOREBOARD_SKIN.MOCK_TOURNAMENT;

/** Internal label only. The switcher shows the shorter "Mock-Tournament". */
export const MOCK_TOURNAMENT_SKIN_NAME = 'Mock-Tournament Skin';

export const OLD_SCHOOL_SKIN_NAME = 'Old School';

/** Switcher label. Keep this exact. */
export const QUICK_RESULT_SKIN_NAME = 'Quick Result';

/** Skins the controller can select. Reserved ids stay out of the switcher. White never shows this list. */
export const SELECTABLE_SCOREBOARD_SKINS = [
  { id: SCOREBOARD_SKIN.MOCK_TOURNAMENT, label: 'Mock-Tournament' },
  { id: SCOREBOARD_SKIN.OLD_SCHOOL, label: OLD_SCHOOL_SKIN_NAME },
  { id: SCOREBOARD_SKIN.QUICK_RESULT, label: QUICK_RESULT_SKIN_NAME },
] as const;

/** Mock-Tournament colors. CSS tokens mirror these. Penalty is Pantone 200 so gym TVs keep a primary red. */
export const MOCK_TOURNAMENT_COLORS = {
  POINTS_BG: '#4AAF45',
  ADVANTAGE_BG: '#FC9C36',
  /** Pantone 200 C. Chromatic red so gym TVs do not shift the pad toward orange. */
  PENALTY_BG: '#C8102E',
  ATHLETE_BLUE_BAR: '#223BCA',
  SCREEN_BG: '#2728B5',
  ATHLETE_LIGHT_BAR: '#F8F9FC',
  DIGIT: '#FFFFFF',
} as const;

const SKIN_CLASS: Record<ScoreboardSkinId, string> = {
  [SCOREBOARD_SKIN.MOCK_TOURNAMENT]: 'scoreboard-skin--mock-tournament',
  /* Light and Kids match skins keep the default board. Kids brackets use kidsScoreboard.ts. */
  [SCOREBOARD_SKIN.LIGHT]: 'scoreboard-skin--mock-tournament',
  [SCOREBOARD_SKIN.KIDS]: 'scoreboard-skin--mock-tournament',
  [SCOREBOARD_SKIN.OLD_SCHOOL]: 'scoreboard-skin--old-school',
  /* Same painted board as Mock-Tournament. Win and DQ are the only addition. */
  [SCOREBOARD_SKIN.QUICK_RESULT]: 'scoreboard-skin--mock-tournament',
};

export function isSelectableScoreboardSkin(value: unknown): value is ScoreboardSkinId {
  return SELECTABLE_SCOREBOARD_SKINS.some((skin) => skin.id === value);
}

/** Unknown or reserved ids fall back to Mock-Tournament. */
export function parseScoreboardSkin(value: unknown): ScoreboardSkinId {
  return isSelectableScoreboardSkin(value) ? value : DEFAULT_SCOREBOARD_SKIN;
}

/** Class hook for the active skin. */
export function scoreboardSkinClass(skin: ScoreboardSkinId = DEFAULT_SCOREBOARD_SKIN): string {
  return SKIN_CLASS[skin] ?? SKIN_CLASS[DEFAULT_SCOREBOARD_SKIN];
}

/** Query flag on a basic Coach bracket bout so a cast display paints the White board. */
export const COACH_WHITE_BOARD_PARAM = 'board';
export const COACH_WHITE_BOARD_VALUE = 'white';

export function isCoachWhiteBoardSearch(search: URLSearchParams): boolean {
  return search.get(COACH_WHITE_BOARD_PARAM) === COACH_WHITE_BOARD_VALUE;
}

/**
 * Basic Coach Score from the bracket uses the Advantage White board.
 * `board=white` is that same choice on the URL, so a display that does not
 * share this device's unlock still paints White. Coach Unlimited (Pro unlock,
 * no flag) keeps its linked-bout skin. Pro suite never uses this board.
 */
export function coachLinkedWhiteBoard(
  fromSuite: boolean,
  linkedBout: boolean,
  basicCoach: boolean,
  whiteBoardSearch: boolean,
): boolean {
  if (fromSuite || !linkedBout) return false;
  return basicCoach || whiteBoardSearch;
}

/** Keep `board=white` on links opened from a basic Coach bracket bout. */
export function withCoachWhiteBoard(path: string, whiteBoard: boolean): string {
  if (!whiteBoard) return path;
  const hashAt = path.indexOf('#');
  const hash = hashAt >= 0 ? path.slice(hashAt) : '';
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const queryAt = base.indexOf('?');
  const pathname = queryAt >= 0 ? base.slice(0, queryAt) : base;
  const params = new URLSearchParams(queryAt >= 0 ? base.slice(queryAt + 1) : '');
  params.set(COACH_WHITE_BOARD_PARAM, COACH_WHITE_BOARD_VALUE);
  return `${pathname}?${params.toString()}${hash}`;
}

/** Suite origin and the basic-Coach White board, on scoreboard and controller links. */
export function withMatchOrigin(
  path: string,
  origin: { fromSuite: boolean; whiteBoard: boolean },
): string {
  return withCoachWhiteBoard(withSuiteFrom(path, origin.fromSuite), origin.whiteBoard && !origin.fromSuite);
}

/**
 * Plain Advantage White Live Bout: no suite flag and no linked bracket bout.
 * A basic Coach linked bout uses that same plain board.
 * Pro suite and a Coach Unlimited linked bout keep the stored skin.
 */
export function isPlainWhiteScoreboard(
  fromSuite: boolean,
  linkedBout: boolean,
  coachWhiteBoard = false,
): boolean {
  if (fromSuite) return false;
  if (!linkedBout) return true;
  return coachWhiteBoard;
}

/** Skin the White, Coach, or suite board should paint. White never follows a stored skin pick. */
export function visibleScoreboardSkin(
  skin: ScoreboardSkinId,
  fromSuite: boolean,
  linkedBout: boolean,
  coachWhiteBoard = false,
): ScoreboardSkinId {
  return isPlainWhiteScoreboard(fromSuite, linkedBout, coachWhiteBoard) ? DEFAULT_SCOREBOARD_SKIN : skin;
}

/**
 * Old School flip faces.
 * Points stay two cards. Advantages and penalties are one card each —
 * advantages never need a tens place on this board.
 */
export const OLD_SCHOOL_FLAP_PLACES = {
  points: 2,
  advantages: 1,
  disadvantages: 1,
} as const;

/**
 * Flip-card faces.
 * One card shows the ones digit, the way a single mechanical wheel rolls:
 * 9 stays 9, 10 reads as 0, 12 as 2. Two cards show the last two digits.
 * Scoring itself is unchanged; this is only the painted face.
 */
export function flapDigits(value: number, count: number): string[] {
  const width = count === 1 ? 1 : 2;
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return String(safe).padStart(width, '0').slice(-width).split('');
}
