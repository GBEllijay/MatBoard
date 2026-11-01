/**
 * What a locked-door route guard renders.
 * An open door always renders its screen right away. A closed door waits while
 * a saved pass is still being verified (refresh, deep link, cold offline open),
 * then redirects only if the finished check still says closed. This never opens
 * a door; it only delays the redirect.
 */
export type GuardOutcome = 'render' | 'wait' | 'redirect';

export function guardOutcome(open: boolean, settled: boolean): GuardOutcome {
  if (open) return 'render';
  return settled ? 'redirect' : 'wait';
}
