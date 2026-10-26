export type LoopStep = 'play' | 'restart' | 'stop';

/** Ignore an `ended` that arrives this soon after a restart. A zero-length clip would otherwise spin. */
export const LOOP_RESTART_MIN_MS = 80;

/**
 * What a looping clip should do for a card duration.
 * Time is checked first, so a clip that ends exactly when the duration ends stops.
 * A longer clip stops mid-play once elapsed time reaches the duration.
 * A shorter clip restarts while time remains.
 */
export function nextLoopStep(
  elapsedMs: number,
  durationMs: number,
  clipEnded: boolean,
  sinceRestartMs = Number.POSITIVE_INFINITY,
): LoopStep {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 'stop';
  if (elapsedMs >= durationMs) return 'stop';
  if (clipEnded && (!Number.isFinite(sinceRestartMs) || sinceRestartMs < LOOP_RESTART_MIN_MS)) return 'stop';
  if (clipEnded) return 'restart';
  return 'play';
}
