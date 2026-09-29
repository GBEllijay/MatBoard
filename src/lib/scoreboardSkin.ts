/**
 * Match scoreboard skins. Mock-Tournament is the default.
 * The controller skin switcher offers Mock-Tournament and Old School.
 * LIGHT and KIDS stay reserved. Kids' Scoreboards paints the bracket, not this skin.
 *
 * Old School is locked to the silver-ring flip board: red cards on the left,
 * blue cards on the right, large points, smaller advantages and penalties,
 * matte black wedge. No white center cards and no black plastic hooks.
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
} as const;

export type ScoreboardSkinId = (typeof SCOREBOARD_SKIN)[keyof typeof SCOREBOARD_SKIN];

/** Match display and the controller start on Mock-Tournament until the coach picks another skin. */
export const DEFAULT_SCOREBOARD_SKIN: ScoreboardSkinId = SCOREBOARD_SKIN.MOCK_TOURNAMENT;

/** Internal label only. The switcher shows the shorter "Mock-Tournament". */
export const MOCK_TOURNAMENT_SKIN_NAME = 'Mock-Tournament Skin';

export const OLD_SCHOOL_SKIN_NAME = 'Old School';

/** Skins the controller can select. Reserved ids stay out of the switcher. */
export const SELECTABLE_SCOREBOARD_SKINS = [
  { id: SCOREBOARD_SKIN.MOCK_TOURNAMENT, label: 'Mock-Tournament' },
  { id: SCOREBOARD_SKIN.OLD_SCHOOL, label: OLD_SCHOOL_SKIN_NAME },
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

/** Flip-card faces. Points and advantages use two cards; penalties use one. */
export function flapDigits(value: number, count: number): string[] {
  const width = count === 1 ? 1 : 2;
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return String(safe).padStart(width, '0').slice(-width).split('');
}
