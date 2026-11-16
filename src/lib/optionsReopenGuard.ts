/**
 * The shared Close control closes the sheet on pointerup. On a phone, the
 * leftover click then lands on the page behind it. Media Console treats a tap
 * as "open the setup menu" when slides are loaded, so that leftover click
 * would open the menu again unless this window ignores it.
 */
export const OPTIONS_REOPEN_GUARD_MS = 400;

export function optionsReopenBlocked(
  closedAt: number,
  now: number,
  windowMs = OPTIONS_REOPEN_GUARD_MS,
): boolean {
  if (closedAt <= 0) return false;
  const elapsed = now - closedAt;
  return elapsed >= 0 && elapsed < windowMs;
}
