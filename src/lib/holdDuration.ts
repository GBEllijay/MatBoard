/** How long a finger, mouse button, or Space/Enter key must stay down. */
export const HOLD_MS = 3000;

/**
 * A press this short is still a tap. Anything longer that lets go before
 * {@link HOLD_MS} cancels: no reset, and no start, pause, or fullscreen.
 */
export const HOLD_TAP_MS = 500;

/** Smooth ring updates. Reduced motion jumps on {@link HOLD_REDUCED_STEP_MS} instead. */
export const HOLD_FRAME_MS = 50;

/** Quarter-turn steps. 3 seconds / 4, so the ring counts up without sweeping. */
export const HOLD_REDUCED_STEP_MS = 750;

/** One short pulse. Browsers without vibration ignore it. */
export const HOLD_VIBRATE_MS = 20;

export type HoldOutcome = 'tap' | 'cancel' | 'complete';

/** 0 at the press, 1 at {@link HOLD_MS}. */
export function holdProgress(elapsedMs: number, holdMs = HOLD_MS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / holdMs);
}

/**
 * Release before the tap window: the control's existing tap.
 * Release after that, before the hold completes: no change.
 * Held for the full duration: the hold action.
 */
export function holdOutcome(elapsedMs: number, holdMs = HOLD_MS, tapMs = HOLD_TAP_MS): HoldOutcome {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'tap';
  if (elapsedMs >= holdMs) return 'complete';
  if (elapsedMs <= tapMs) return 'tap';
  return 'cancel';
}

/** 0, 0.25, 0.5, 0.75, then 1. Used while reduced motion is on. */
export function steppedHoldProgress(fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  return Math.floor(fraction * 4) / 4;
}

export function isHoldKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

/** Light haptic when a hold completes. No-op when the device cannot vibrate. */
export function pulseHoldHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(HOLD_VIBRATE_MS);
    }
  } catch {
    /* this browser has no vibration hardware */
  }
}
