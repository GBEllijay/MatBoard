/**
 * Phone band-figure rules for the scoreboard cheer and the DQ walk-off.
 * Desktop (1440) keeps the measured slot and the speech bubble. These helpers
 * only change widths under 600px.
 */

/** Viewports at or below this width use the phone figure. Matches `@media (max-width: 599px)`. */
export const BAND_FIGURE_PHONE_MAX_PX = 599;

/**
 * Phone figure width. Wide enough that the face reads, narrow enough that the
 * banner can keep the rest of the row.
 */
export const PHONE_BAND_FIGURE_WIDTH_PX = 106;

/** Shared cutout canvas, width / height. */
export const BAND_FIGURE_ASPECT = 845 / 1200;

export function isPhoneBand(viewportWidth: number): boolean {
  return viewportWidth <= BAND_FIGURE_PHONE_MAX_PX;
}

/** The board cheer bubble repeats the splash. It stays on the desktop board and in the bracket corner. */
export function boardCheerShowsBubble(viewportWidth: number): boolean {
  return !isPhoneBand(viewportWidth);
}

export type AxisBox = { left: number; top: number; right: number; bottom: number };

/** Right edge of the clock band, feet on the band bottom, fixed phone width. */
export function phoneBandFigureBox(display: AxisBox, bandBottom: number): AxisBox & { width: number; height: number } {
  const width = PHONE_BAND_FIGURE_WIDTH_PX;
  const height = width / BAND_FIGURE_ASPECT;
  const right = display.right;
  const left = right - width;
  return { left, top: bandBottom - height, right, bottom: bandBottom, width, height };
}

/**
 * Space held on the splash line while a phone figure is up.
 * Zero on the desktop board and the moment the figure leaves.
 */
export function splashFigureGutter(viewportWidth: number, figureWidth: number, figureShowing: boolean): number {
  if (!figureShowing || !isPhoneBand(viewportWidth) || !(figureWidth > 0)) return 0;
  return Math.ceil(figureWidth);
}
