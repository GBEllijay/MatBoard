/** Pinch-to-fit the Mock Tournament board. Scale 1 is readable; minScale fits the tree. */

export const MIN_SCALE_FLOOR = 0.2;
export const MAX_SCALE = 3;

export function fitScale(viewW: number, viewH: number, contentW: number, contentH: number): number {
  if (contentW <= 0 || contentH <= 0 || viewW <= 0 || viewH <= 0) return 1;
  return Math.min(viewW / contentW, viewH / contentH);
}

/** Smallest zoom that still shows the whole board. Never above 1 (that would force zoom-in). */
export function minScaleForView(viewW: number, viewH: number, contentW: number, contentH: number): number {
  const fit = fitScale(viewW, viewH, contentW, contentH);
  return Math.min(1, Math.max(MIN_SCALE_FLOOR, fit));
}

export function clampScale(scale: number, minScale: number, maxScale = MAX_SCALE): number {
  if (Number.isNaN(scale)) return minScale;
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return startScale;
  return startScale * (distance / startDistance);
}

/**
 * Scroll position that keeps one viewport point on the same diagram coordinate
 * after a scale change. `viewportOffset` is that point's distance from the
 * scroller's visible left or top.
 */
export function focalScroll(
  scroll: number,
  viewportOffset: number,
  oldScale: number,
  newScale: number,
): number {
  if (!(oldScale > 0) || !Number.isFinite(newScale)) return scroll;
  const content = (scroll + viewportOffset) / oldScale;
  return content * newScale - viewportOffset;
}

/** Page scale stays 1. Bracket pinch transforms the diagram; it does not zoom the layout viewport. */
export const TOURNAMENT_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';
