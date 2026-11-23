import { WHITE_BOARD_FROM } from './productNames.ts';

const STORAGE_KEY = 'matboard.tvTip.v1';

/** Large enough to be a laptop / HDMI station — not a phone, even in landscape. */
export function tvStationQuery(): string {
  return '(min-width: 900px) and (min-height: 560px)';
}

export function tvTipDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTvTip(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

const WHITE_BOARD_PATHS = new Set(['/match', '/training', '/match/control', '/training/control']);

/** The TV tip covers the clock on White scoreboard/timer displays. Hide it there. */
export function tvTipHiddenOnWhiteBoard(pathname: string, from: string | null): boolean {
  return from === WHITE_BOARD_FROM && WHITE_BOARD_PATHS.has(pathname);
}
