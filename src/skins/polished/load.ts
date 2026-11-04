import type { PolishedTimerSlug } from '../../lib/polishedSkins.ts';
import type { PosterSpec } from './posterSkins.ts';

export type PolishedSkinModule = {
  /** null for the timer-only Calçadão. */
  SCOREBOARD_DECO: string | null;
  TIMER_DECO: string;
  TIMER_REST_DECO: string | null;
  ROW_EXTRA: readonly [string, string] | null;
  GLOBE_STARS?: string;
  /** Psychedelic: eyeball knob on the progress bar. */
  KNOB_EYE?: string;
  /** Visionary: third-eye knob on the ring and the Flower-of-Life watermark in the disc. */
  VIS_KNOB_EYE?: string;
  VIS_DISC_FLOWER?: string;
  /** Poster skins: crest, side chips, and the clock plate. Absent on the older families. */
  POSTER?: PosterSpec;
};

/** Each skin is its own chunk (fonts, CSS, art), so the main bundle does not grow. */
const LOADERS: Record<PolishedTimerSlug, () => Promise<PolishedSkinModule>> = {
  'kids-arcade': () => import('./kids-arcade.ts'),
  'kids-sticker': () => import('./kids-sticker.ts'),
  keynote: () => import('./keynote.ts'),
  'heavy-metal': () => import('./heavy-metal.ts'),
  brasil: () => import('./brasil.ts'),
  woodblock: () => import('./woodblock.ts'),
  reggae: () => import('./reggae.ts'),
  psychedelic: () => import('./psychedelic.ts'),
  calcadao: () => import('./calcadao.ts'),
  visionary: () => import('./visionary.ts'),
  'creature-anime': () => import('./creature-anime.ts'),
  'idol-hunters': () => import('./idol-hunters.ts'),
  'shinobi-anime': () => import('./shinobi-anime.ts'),
  'dungeon-quest': () => import('./dungeon-quest.ts'),
  'mech-battle': () => import('./mech-battle.ts'),
  'arcade-fighter': () => import('./arcade-fighter.ts'),
};

const cache = new Map<PolishedTimerSlug, PolishedSkinModule>();

export function loadedPolishedSkin(slug: PolishedTimerSlug): PolishedSkinModule | null {
  return cache.get(slug) ?? null;
}

export async function loadPolishedSkin(slug: PolishedTimerSlug): Promise<PolishedSkinModule> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const mod = await LOADERS[slug]();
  cache.set(slug, mod);
  return mod;
}
