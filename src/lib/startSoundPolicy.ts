/**
 * Shared start-sound policy for the match scoreboard and the round timer.
 * Default: Combate on the true first start (clock at full time, or a new
 * match/session after reset). Later manual begins after a pause or rest get a
 * short beep. "Every start" plays Combate on every manual begin.
 * Automatic work/rest transitions in the round timer do not use this helper.
 */

export type StartSoundWhen = 'first' | 'every';

export function parseStartSoundWhen(value: unknown): StartSoundWhen {
  return value === 'every' ? 'every' : 'first';
}

/** Clock is at (or past) full length, or the period has expired and will restart full. */
export function isFirstStart(remainingMs: number, durationMs: number): boolean {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(durationMs)) return true;
  return remainingMs <= 0 || remainingMs >= durationMs;
}

export function startSoundKind(when: StartSoundWhen, firstStart: boolean): 'combat' | 'beep' {
  return when === 'every' || firstStart ? 'combat' : 'beep';
}
