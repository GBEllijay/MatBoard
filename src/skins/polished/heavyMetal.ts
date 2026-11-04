/**
 * Heavy Metal v2, direction A "Chrome Inferno".
 * Pure helpers so the scoreboard and the round timer share one contract,
 * and the node tests can pin the side chips, the heading numerals, and the meter.
 */

export const METAL_METER_SEGMENTS = 30;

/** Side 1 is BLUE. Side 2 is WHITE. The belt rank never chooses this label. */
export function sideChipLabel(side: 'blue' | 'white'): 'BLUE' | 'WHITE' {
  return side === 'blue' ? 'BLUE' : 'WHITE';
}

export type MetalBoardPhase = 'OPEN' | 'LIVE' | 'FINAL';

/**
 * Left band pill. OPEN before the clock runs, LIVE while it runs,
 * FINAL after a win or a DQ. A plain "Match" label is OPEN.
 */
export function metalBoardPhase(input: { running: boolean; decided: boolean }): MetalBoardPhase {
  if (input.decided) return 'FINAL';
  if (input.running) return 'LIVE';
  return 'OPEN';
}

/** The approved board calls the left band pill OPEN. LIVE and FINAL pass through. */
export function metalBoardState(state: string): string {
  const value = state.trim();
  if (value === 'OPEN' || value === 'LIVE' || value === 'FINAL') return value;
  return value.toLowerCase() === 'match' ? 'OPEN' : state;
}

export type MetalFacePart = { kind: 'chrome' | 'num'; value: string };

/**
 * Split a Metal Mania heading so each numeral is its own Anton run.
 * "Round 1" and "Mat 1" keep the digit out of Metal Mania, where 1 reads as I.
 */
export function metalFaceParts(text: string): MetalFacePart[] {
  const parts = text.split(/(\d+)/).filter((part) => part !== '');
  if (parts.length === 0) return [];
  if (!parts.some((part) => /^\d+$/.test(part))) return [{ kind: 'chrome', value: text.trim() }];
  /* The gap before a numeral is margin on .n. A space inside the metal-face flex item collapses. */
  return parts
    .map((value) =>
      /^\d+$/.test(value)
        ? { kind: 'num' as const, value }
        : { kind: 'chrome' as const, value: value.trim() },
    )
    .filter((part) => part.value !== '');
}

/** Heavy Metal timer title. Rest has no numeral. A round uses an Arabic numeral, not Roman. */
export function metalTimerTitle(rest: boolean, round: number): { word: string; numeral: string | null } {
  if (rest) return { word: 'Rest', numeral: null };
  return { word: 'Round', numeral: String(round) };
}

/** "WORK · ROUND 1 · ENDLESS" -> the pill word and the line under it. */
export function metalPhaseParts(phaseLine: string): { pill: string; sub: string } {
  const parts = phaseLine.split(' · ');
  return { pill: parts[0] || phaseLine, sub: parts.slice(1).join(' · ') };
}

/** How many of the 30 meter segments are lit. 04:40 of 05:00 lights 28. */
export function metalMeterLit(progress: number, segments = METAL_METER_SEGMENTS): number {
  const share = Math.min(1, Math.max(0, progress));
  return Math.round(share * segments);
}
