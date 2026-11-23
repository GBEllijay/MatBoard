/**
 * Shared start-sound policy for the match scoreboard and the round timer.
 *
 * The chosen start cue (Beep or Combate) plays when a work/match period
 * starts at full time. With Round Start Only on (stored as startSoundWhen
 * "first", the default), a later resume after a pause plays the short
 * low beep. With Round Start Only off ("every"), the chosen cue plays on
 * every manual begin.
 *
 * Rest/break periods never play Combate. They use the regular start beep
 * at the start of the rest, or the low resume beep after a mid-rest pause.
 * Automatic work/rest transitions in the round timer do not use this helper.
 */

export type StartSoundWhen = 'first' | 'every';

/** What the Match start cue row shows, including None for startBeep off. */
export type MatchStartCueChoice = 'none' | 'beep' | 'combate';

/** Which clip a manual begin should play. */
export type ManualStartPlay = 'combate' | 'beep' | 'resume' | 'none';

export function parseStartSoundWhen(value: unknown): StartSoundWhen {
  return value === 'every' ? 'every' : 'first';
}

/** Clock is at (or past) full length, or the period has expired and will restart full. */
export function isFirstStart(remainingMs: number, durationMs: number): boolean {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(durationMs)) return true;
  return remainingMs <= 0 || remainingMs >= durationMs;
}

/**
 * Map the old Start beep checkbox plus the shared Beep/Combate pref to the
 * match start-cue row. startBeep off (the match default) is None. A saved
 * startBeep on keeps the device start cue, which is Combate when unset.
 */
export function matchStartCueChoice(
  startBeep: boolean,
  startCue: 'beep' | 'combate',
): MatchStartCueChoice {
  return startBeep ? startCue : 'none';
}

export function startSoundKind(input: {
  startCue: 'beep' | 'combate';
  when: StartSoundWhen;
  firstStart: boolean;
  rest?: boolean;
  enabled?: boolean;
}): ManualStartPlay {
  if (input.enabled === false) return 'none';
  if (input.when === 'first' && !input.firstStart) return 'resume';
  if (input.rest || input.startCue === 'beep') return 'beep';
  return 'combate';
}
