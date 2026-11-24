import type { PolishedTimerSlug } from '../../lib/polishedSkins.ts';
import { loadPolishedSkin } from '../polished/load.ts';

/** Each bracket skin is its own CSS chunk. The polished skin module brings the same fonts the scoreboard and timer use. */
const SKIN_CSS: Record<PolishedTimerSlug, () => Promise<unknown>> = {
  'kids-arcade': () => import('./skins/kids-arcade.css'),
  'kids-sticker': () => import('./skins/kids-sticker.css'),
  keynote: () => import('./skins/keynote.css'),
  'heavy-metal': () => import('./skins/heavy-metal.css'),
  brasil: () => import('./skins/brasil.css'),
  calcadao: () => import('./skins/calcadao.css'),
  woodblock: () => import('./skins/woodblock.css'),
  reggae: () => import('./skins/reggae.css'),
  psychedelic: () => import('./skins/psychedelic.css'),
  visionary: () => import('./skins/visionary.css'),
  'creature-anime': () => import('./skins/creature-anime.css'),
  'idol-hunters': () => import('./skins/idol-hunters.css'),
  'shinobi-anime': () => import('./skins/shinobi-anime.css'),
  'dungeon-quest': () => import('./skins/dungeon-quest.css'),
  'mech-battle': () => import('./skins/mech-battle.css'),
  'arcade-fighter': () => import('./skins/arcade-fighter.css'),
};

export type BracketSkinModule = { deco: string };

const cache = new Map<PolishedTimerSlug, BracketSkinModule>();

export function loadedBracketSkin(slug: PolishedTimerSlug): BracketSkinModule | null {
  return cache.get(slug) ?? null;
}

export async function loadBracketSkin(slug: PolishedTimerSlug): Promise<BracketSkinModule> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const [, , deco] = await Promise.all([
    import('./bracket-skin.css'),
    SKIN_CSS[slug](),
    import('./deco.generated.ts'),
    loadPolishedSkin(slug),
  ]);
  const mod = { deco: deco.BRACKET_SKIN_DECO[slug] };
  cache.set(slug, mod);
  return mod;
}
