import type { PolishedSkinSlug } from '../../lib/polishedSkins.ts';

export type PolishedSkinModule = {
  SCOREBOARD_DECO: string;
  TIMER_DECO: string;
  TIMER_REST_DECO: string | null;
  ROW_EXTRA: readonly [string, string] | null;
  GLOBE_STARS?: string;
  /** Psychedelic: eyeball knob on the progress bar. */
  KNOB_EYE?: string;
};

/** Each skin is its own chunk (fonts, CSS, art), so the main bundle does not grow. */
const LOADERS: Record<PolishedSkinSlug, () => Promise<PolishedSkinModule>> = {
  'kids-arcade': () => import('./kids-arcade.ts'),
  'kids-sticker': () => import('./kids-sticker.ts'),
  keynote: () => import('./keynote.ts'),
  'heavy-metal': () => import('./heavy-metal.ts'),
  brasil: () => import('./brasil.ts'),
  woodblock: () => import('./woodblock.ts'),
  reggae: () => import('./reggae.ts'),
  psychedelic: () => import('./psychedelic.ts'),
};

const cache = new Map<PolishedSkinSlug, PolishedSkinModule>();

export function loadedPolishedSkin(slug: PolishedSkinSlug): PolishedSkinModule | null {
  return cache.get(slug) ?? null;
}

export async function loadPolishedSkin(slug: PolishedSkinSlug): Promise<PolishedSkinModule> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const mod = await LOADERS[slug]();
  cache.set(slug, mod);
  return mod;
}
