/**
 * Bracket skins: the third screen of every polished skin (owner policy: each skin ships a scoreboard,
 * a round timer, and a bracket). Built from the owner-approved bracket mockups. The live tree,
 * its order, and its buttons are unchanged; only the paint changes.
 *
 * Pure data, so the node tests can pin it.
 */

import { POLISHED_TIMER_SKINS, type PolishedTimerSlug } from './polishedSkins.ts';
import { isPreviewWhiteBypassHost } from './previewWhiteBypass.ts';

export type BracketSkinFlavor = {
  /** Shares the variable-driven poster frame from the mockups (every family drawn after Calçadão). */
  generic: boolean;
  /** Art crest over the Finals card. */
  crest: boolean;
  /** Characters beside the bracket on a TV. */
  mascots: boolean;
  /** Characters still show on a portrait phone. Only Creature Anime keeps them (approved phone mock). */
  phoneMascots: boolean;
};

const F = (generic: boolean, crest: boolean, mascots: boolean, phoneMascots = false): BracketSkinFlavor => ({
  generic,
  crest,
  mascots,
  phoneMascots,
});

export const BRACKET_SKIN_FLAVOR: Record<PolishedTimerSlug, BracketSkinFlavor> = {
  brasil: F(false, false, false),
  calcadao: F(false, false, false),
  'creature-anime': F(false, true, true, true),
  'heavy-metal': F(true, true, false),
  'idol-hunters': F(true, true, true),
  stage: F(true, false, false),
  'kids-arcade': F(true, false, false),
  'kids-sticker': F(true, false, false),
  psychedelic: F(true, false, false),
  reggae: F(true, false, false),
  'shinobi-anime': F(true, false, true),
  visionary: F(true, false, false),
  woodblock: F(true, false, false),
  'dungeon-quest': F(true, true, false),
  'mech-battle': F(true, true, true),
  'arcade-fighter': F(true, false, true),
};

/** Every polished skin, in the round timer's picker order. */
export const BRACKET_SKIN_SLUGS: readonly PolishedTimerSlug[] = POLISHED_TIMER_SKINS.map((skin) => skin.slug);

/** Classes on main.tournament while a bracket skin paints it. Advantage (bright) keeps the layout underneath. */
export function bracketSkinClasses(slug: PolishedTimerSlug): string {
  const flavor = BRACKET_SKIN_FLAVOR[slug];
  return [
    'tournament--bright',
    'tournament--skin',
    `bskin-${slug}`,
    flavor.generic ? 'bskin--t' : '',
    flavor.crest ? 'bskin--crest' : '',
    flavor.mascots ? 'bskin--mascots' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Connector edges for the 8-person tree, the same pairs the mockups draw. */
export type BracketLinkEdge = { from: string; to: string; slot: 0 | 1 | 'card'; side: 'left' | 'right' };

/** Each match feeds a slot in the next round. The Finals card takes the semifinals at its middle. */
export function bracketLinkEdges(matchIds: readonly string[]): BracketLinkEdge[] {
  const edges: BracketLinkEdge[] = [];
  const byRound = new Map<string, number[]>();
  for (const id of matchIds) {
    const m = /^([a-z0-9]+)-(\d+)$/.exec(id);
    if (!m || m[1] === 'final') continue;
    const list = byRound.get(m[1]) ?? [];
    list.push(Number(m[2]));
    byRound.set(m[1], list);
  }
  for (const [round, indexes] of byRound) {
    const count = Math.max(...indexes) + 1;
    for (const index of indexes) {
      const side = index < count / 2 ? 'left' : 'right';
      if (count === 2) {
        edges.push({ from: `${round}-${index}`, to: 'final-0', slot: 'card', side });
        continue;
      }
      const next = NEXT_ROUND[round];
      if (!next) continue;
      edges.push({ from: `${round}-${index}`, to: `${next}-${Math.floor(index / 2)}`, slot: (index % 2) as 0 | 1, side });
    }
  }
  return edges;
}

const NEXT_ROUND: Record<string, string> = { r64: 'r32', r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final' };

/**
 * The /preview/bracket-skins review pages open on Cloudflare Pages branch and hash previews and on local dev.
 * Host-based only, like the White preview bypass. Production (advantagebjjtimer.com, matboard.pages.dev) stays closed.
 */
export function bracketSkinsPreviewOpen(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return isPreviewWhiteBypassHost(host) || host === 'localhost' || host === '127.0.0.1';
}
