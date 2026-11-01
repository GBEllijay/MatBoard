import { formatMmSs } from '../../lib/format.ts';

/** Timer text shared by the polished skins. Pure, so the node tests can pin it. */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function romanRound(n: number): string {
  return ROMAN[n] ?? String(n);
}

/** "NEXT · REST 01:00" while working, "NEXT · WORK 05:00 · ROUND 2" while resting. */
export function timerNextLine(rest: boolean, workMs: number, breakMs: number, round: number): string {
  return rest
    ? `NEXT · WORK ${formatMmSs(workMs)} · ROUND ${round + 1}`
    : `NEXT · REST ${formatMmSs(breakMs)}`;
}

/** Remaining share of the phase, 1 = full. Drives --p on .tm. */
export function timerProgress(remainingMs: number, phaseMs: number): number {
  if (!(phaseMs > 0)) return 0;
  return Math.min(1, Math.max(0, remainingMs / phaseMs));
}

/** Heavy Metal title: "Round III" while working, "Rest" on the break. */
export function metalTimerTitle(rest: boolean, round: number): string {
  return rest ? 'Rest' : `Round ${romanRound(round)}`;
}

/** Reggae title: "Round 3" while working, "Rest Easy" on the break (owner's wording). */
export function reggaeTimerTitle(rest: boolean, round: number): string {
  return rest ? 'Rest Easy' : `Round ${round}`;
}

/** Psychedelic title: "Round 3" while working, "Far Out" on the break (owner's mock). */
export function psychedelicTimerTitle(rest: boolean, round: number): string {
  return rest ? 'Far Out' : `Round ${round}`;
}
