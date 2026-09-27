/** Match scoreboard skins. Mock-Tournament is the default. No picker in the UI yet. */

export const SCOREBOARD_SKIN = {
  /** Approved tournament-photo eyedrop, tuned for TV. */
  MOCK_TOURNAMENT: 'MOCK_TOURNAMENT',
  /** Reserved. Not built. */
  LIGHT: 'LIGHT',
  /** Reserved. Not built. */
  KIDS: 'KIDS',
} as const;

export type ScoreboardSkinId = (typeof SCOREBOARD_SKIN)[keyof typeof SCOREBOARD_SKIN];

/** What Match display and the Match controller render until a picker exists. */
export const DEFAULT_SCOREBOARD_SKIN: ScoreboardSkinId = SCOREBOARD_SKIN.MOCK_TOURNAMENT;

/** Internal label only. Do not show this string in the product UI. */
export const MOCK_TOURNAMENT_SKIN_NAME = 'Mock-Tournament Skin';

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
  /* Light and Kids have no stylesheet yet, so they keep the default skin. */
  [SCOREBOARD_SKIN.LIGHT]: 'scoreboard-skin--mock-tournament',
  [SCOREBOARD_SKIN.KIDS]: 'scoreboard-skin--mock-tournament',
};

/** Class hook for the active skin. Pass a future id here when a picker exists. */
export function scoreboardSkinClass(skin: ScoreboardSkinId = DEFAULT_SCOREBOARD_SKIN): string {
  return SKIN_CLASS[skin];
}
