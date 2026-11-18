/**
 * The shared Close control closes the sheet on pointerup. On a phone, the
 * leftover click then lands on the page behind it. Media Console treats a tap
 * as "open the setup menu" when slides are loaded, so that leftover click
 * would open the menu again unless this window ignores it.
 *
 * The pinned account button sits in the same top-right corner as Close, so
 * the same window also has to ignore taps on that button.
 */
export const OPTIONS_REOPEN_GUARD_MS = 400;
export const SHEET_CLOSE_GUARD_CLASS = 'is-sheet-close-guard';

type GuardBody = {
  classList: {
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  };
};

let lastClosedAt = 0;
let guardTimer: ReturnType<typeof setTimeout> | undefined;

export function optionsReopenBlocked(
  closedAt: number,
  now: number,
  windowMs = OPTIONS_REOPEN_GUARD_MS,
): boolean {
  if (closedAt <= 0) return false;
  const elapsed = now - closedAt;
  return elapsed >= 0 && elapsed < windowMs;
}

export function lastOptionsClosedAt(): number {
  return lastClosedAt;
}

export function accountButtonBlocked(
  now = Date.now(),
  body?: GuardBody | null,
): boolean {
  const target =
    body !== undefined ? body : typeof document !== 'undefined' ? document.body : null;
  if (target && 'classList' in target && target.classList.contains(SHEET_CLOSE_GUARD_CLASS)) {
    return true;
  }
  return optionsReopenBlocked(lastClosedAt, now);
}

/** Stamp Close and make the pinned account button ignore the leftover tap. */
export function armOptionsCloseGuard(
  now = Date.now(),
  body?: GuardBody | null,
  windowMs = OPTIONS_REOPEN_GUARD_MS,
): void {
  lastClosedAt = now;
  const target =
    body !== undefined ? body : typeof document !== 'undefined' ? document.body : null;
  if (!target) return;
  target.classList.add(SHEET_CLOSE_GUARD_CLASS);
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = setTimeout(() => {
    target.classList.remove(SHEET_CLOSE_GUARD_CLASS);
    guardTimer = undefined;
  }, windowMs);
}

/**
 * How long the one leftover click after a Close tap is eaten. A phone sends
 * that click right after pointerup, to whatever now sits under the finger
 * (the timer, the scoreboard). Without this, Close reopened Training options
 * on most timer skins and sent the Quick Result board to the Controller.
 */
export const LEFTOVER_CLICK_MS = 600;

type ClickTarget = {
  addEventListener(type: 'click', fn: (event: Event) => void, capture: boolean): void;
  removeEventListener(type: 'click', fn: (event: Event) => void, capture: boolean): void;
};

let dropLeftover: (() => void) | undefined;

/** Eat the next click anywhere on the page (capture phase), once, within `windowMs`. */
export function swallowLeftoverClick(
  windowMs = LEFTOVER_CLICK_MS,
  target: ClickTarget | null = typeof window !== 'undefined' ? window : null,
): void {
  if (!target) return;
  dropLeftover?.();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onClick = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    done();
  };
  const done = () => {
    if (timer) clearTimeout(timer);
    target.removeEventListener('click', onClick, true);
    if (dropLeftover === done) dropLeftover = undefined;
  };
  target.addEventListener('click', onClick, true);
  timer = setTimeout(done, windowMs);
  dropLeftover = done;
}

/** Test helper. */
export function resetOptionsCloseGuard(body?: GuardBody | null): void {
  dropLeftover?.();
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = undefined;
  lastClosedAt = 0;
  const target =
    body !== undefined ? body : typeof document !== 'undefined' ? document.body : null;
  target?.classList.remove(SHEET_CLOSE_GUARD_CLASS);
}
