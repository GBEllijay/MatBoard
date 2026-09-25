/**
 * Coach page swipes. Clear horizontal intent only — short drags and diagonals stay as scroll.
 * Swipes that start on the screen edge are left to the browser (back / forward).
 *
 * Left (finger moves left): Daily Lesson Plan → Daily Training Videos → Technique Tree.
 * Right: the reverse.
 * Competitor Roster swipes right to Mock Tournament. Mock Tournament does not swipe back.
 */

export const SWIPE_MIN_PX = 80;
export const SWIPE_AXIS_RATIO = 1.75;
export const SWIPE_EDGE_PX = 28;

const CHAIN = ['/notes', '/techniques', '/technique-tree'] as const;

export function classifyCoachSwipe(dx: number, dy: number): 'left' | 'right' | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_MIN_PX) return null;
  if (absX < absY * SWIPE_AXIS_RATIO) return null;
  return dx < 0 ? 'left' : 'right';
}

/** True when the gesture starts in the browser back/forward edge. */
export function swipeStartsInBrowserEdge(x: number, width: number, edge = SWIPE_EDGE_PX): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= edge * 2) return false;
  return x < edge || x > width - edge;
}

const EDITABLE =
  'input, textarea, select, option, button, a, label, [contenteditable="true"], [role="dialog"], [data-coach-no-swipe]';

/** Text fields, controls, and open sheets keep their own gestures. */
export function swipeGestureBlocked(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined') return false;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(EDITABLE));
}

export function coachSwipeTarget(pathname: string, direction: 'left' | 'right'): string | null {
  if (pathname === '/roster') return direction === 'right' ? '/tournament' : null;
  const index = CHAIN.indexOf(pathname as (typeof CHAIN)[number]);
  if (index < 0) return null;
  const next = direction === 'left' ? index + 1 : index - 1;
  return CHAIN[next] ?? null;
}
