/**
 * Round Timer fullscreen on phones.
 *
 * The Pro and Media hubs open the Round Timer on its controller
 * (/training/control). That page had no Fullscreen chip, and its gold
 * "Rounds" chip always opened a separate popup window. On an Android phone
 * (and in the home-screen app) that popup is just another browser tab with
 * the status bar showing, so there was no way to get a fullscreen timer.
 *
 * On a touch device or in the installed app, tapping "Rounds" now opens the
 * rounds display in this same window and asks for fullscreen inside that tap.
 * A desktop browser (mouse, regular tab) keeps the popup for the gym TV.
 */

export type RoundsDeviceEnv = {
  /** `(pointer: coarse)`: phone or tablet finger input. */
  coarsePointer: boolean;
  /** Home-screen app: `(display-mode: standalone)` or `(display-mode: fullscreen)`. */
  installedApp: boolean;
};

export type RoundsChipAction = 'fullscreen-here' | 'popup';

export function roundsChipAction(env: RoundsDeviceEnv): RoundsChipAction {
  return env.coarsePointer || env.installedApp ? 'fullscreen-here' : 'popup';
}

export function readRoundsDeviceEnv(win: Pick<Window, 'matchMedia'> | undefined = globalThis.window): RoundsDeviceEnv {
  if (!win || typeof win.matchMedia !== 'function') return { coarsePointer: false, installedApp: false };
  const matches = (query: string) => {
    try {
      return win.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  return {
    coarsePointer: matches('(pointer: coarse)'),
    installedApp: matches('(display-mode: standalone)') || matches('(display-mode: fullscreen)'),
  };
}

/** Rounds display path, keeping the Pro / Media suite origin. */
export function roundsDisplayPath(fromSuite: boolean): string {
  return fromSuite ? '/training?from=suite' : '/training';
}

/**
 * Router state the controller passes along. The rounds display asks for
 * fullscreen again on arrival if the tap's request did not stick (still inside
 * the same tap's activation window).
 */
export const ROUNDS_FULLSCREEN_STATE = { roundsFullscreen: true } as const;

export function wantsRoundsFullscreen(state: unknown): boolean {
  return Boolean(state && typeof state === 'object' && (state as { roundsFullscreen?: unknown }).roundsFullscreen === true);
}
