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

/** Test helper. */
export function resetOptionsCloseGuard(body?: GuardBody | null): void {
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = undefined;
  lastClosedAt = 0;
  const target =
    body !== undefined ? body : typeof document !== 'undefined' ? document.body : null;
  target?.classList.remove(SHEET_CLOSE_GUARD_CLASS);
}
