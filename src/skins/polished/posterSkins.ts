/**
 * Poster skins share one scoreboard and timer frame (crest, side chips, clock plate).
 * Each skin still loads its own CSS, fonts, and art.
 */

export const POSTER_SKIN_SLUGS = ['creature-anime', 'idol-hunters', 'shinobi-anime'] as const;

export type PosterSkinSlug = (typeof POSTER_SKIN_SLUGS)[number];

export type PosterSpec = {
  fitLineFloor: number;
  splitNums: boolean;
  headerCrest: string;
  wordmarkExtra: string;
  bandDeco: string;
  titleBrush: string;
  meterKnob: string;
};

export function isPosterSkin(slug: string): slug is PosterSkinSlug {
  return (POSTER_SKIN_SLUGS as readonly string[]).includes(slug);
}

/** Live timer title. Rest wording follows each approved mock. */
export function posterTimerTitle(slug: PosterSkinSlug, rest: boolean, round: number): string {
  if (slug === 'creature-anime') return rest ? 'Rest Up!' : `Round ${round}`;
  if (slug === 'idol-hunters') return rest ? 'Encore Break' : `Round ${round}`;
  return rest ? 'Rest' : `Round ${round}`;
}

/** Shinobi shrinks further before it wraps. The other two stop at 72%. */
export function posterFitLineFloor(slug: PosterSkinSlug): number {
  return slug === 'shinobi-anime' ? 0.56 : 0.72;
}

/** A digit inside a decorative heading uses Anton, so 1 does not read as I. */
export function posterSplitsNums(slug: PosterSkinSlug): boolean {
  return slug === 'shinobi-anime';
}

/**
 * OPEN while the bout is live. FINAL once Win or DQ is called.
 * Null for every skin that is not a poster, so those boards keep the word Match.
 */
export function posterBoardState(slug: string, decided: boolean): 'OPEN' | 'FINAL' | null {
  if (!isPosterSkin(slug)) return null;
  return decided ? 'FINAL' : 'OPEN';
}
