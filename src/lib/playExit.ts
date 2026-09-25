/** Public home. A long press on the corner Advantage mark always lands here. */
export const PLAY_EXIT_HOME = '/';

/**
 * Same delay as score-box holds (`useHoldPress` default).
 * Longer than the folder-row mouse drag (140ms) so an ordinary click stays a back tap.
 */
export const PLAY_EXIT_HOLD_MS = 480;

/** Short press keeps `to`. Long press replaces it with home. */
export function playExitDestination(to: string, held: boolean): string {
  return held ? PLAY_EXIT_HOME : to;
}

/**
 * Parent `onExit` handlers leave fullscreen and then open `to`.
 * Use them for a short press, and for a long press only when `to` is already home.
 */
export function playExitKeepsParentExit(to: string, held: boolean): boolean {
  return playExitDestination(to, held) === to;
}

/** Accessible name. Home when that is the only destination. */
export function playExitLabel(to: string): string {
  return to === PLAY_EXIT_HOME ? 'Home' : 'Back. Hold for Home.';
}
