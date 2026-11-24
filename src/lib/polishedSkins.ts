/**
 * Polished skins for the match scoreboard and the round timer.
 * Families from the owner's polished mock: Kids Arcade, Kids Sticker, Keynote,
 * Heavy Metal ("up to 11"), Brasil (plus the timer-only Calçadão variant), Woodblock,
 * Reggae, Psychedelic, Visionary, then Creature Anime, Idol Hunters, and Shinobi Anime.
 *
 * Tier rule: Media Edition and every tier above it. The gate is the existing /media
 * entitlement check, so it opens exactly where the Media door is open (Media, Pro, owner;
 * Instructor once the helper's "higher tiers include lower ones" change lands).
 * White and Student get none of them: the pickers leave them out entirely (no lock tiles,
 * no upsell). This only reads doors; it never grants or stores one.
 *
 * Mock-Tournament, Old School, and Quick Result are not part of this list and stay
 * exactly where they were.
 */

import { mediaConsoleDoorOpen, type ProSurfaceInput } from './productNames.ts';

export const POLISHED_SKINS = [
  { slug: 'kids-arcade', id: 'KIDS_ARCADE', label: 'Kids Arcade' },
  { slug: 'kids-sticker', id: 'KIDS_STICKER', label: 'Kids Sticker' },
  { slug: 'keynote', id: 'KEYNOTE', label: 'Keynote' },
  { slug: 'heavy-metal', id: 'HEAVY_METAL', label: 'Heavy Metal' },
  { slug: 'brasil', id: 'BRASIL', label: 'Brasil' },
  { slug: 'woodblock', id: 'WOODBLOCK', label: 'Woodblock' },
  { slug: 'reggae', id: 'REGGAE', label: 'Reggae' },
  { slug: 'psychedelic', id: 'PSYCHEDELIC', label: 'Psychedelic' },
  { slug: 'visionary', id: 'VISIONARY', label: 'Visionary' },
  { slug: 'creature-anime', id: 'CREATURE_ANIME', label: 'Creature Anime' },
  { slug: 'idol-hunters', id: 'IDOL_HUNTERS', label: 'Idol Hunters' },
  { slug: 'shinobi-anime', id: 'SHINOBI_ANIME', label: 'Shinobi Anime' },
  { slug: 'dungeon-quest', id: 'DUNGEON_QUEST', label: 'Dungeon Quest' },
  { slug: 'mech-battle', id: 'MECH_BATTLE', label: 'Mech Battle' },
  { slug: 'arcade-fighter', id: 'ARCADE_FIGHTER', label: 'Arcade Fighter' },
] as const;

/** 05b Calçadão: a Brasil variant the mock draws for the round timer only (no scoreboard). */
export const POLISHED_TIMER_ONLY_SKINS = [{ slug: 'calcadao', label: 'Calçadão' }] as const;

export type PolishedSkin = (typeof POLISHED_SKINS)[number];
export type PolishedSkinSlug = PolishedSkin['slug'];
export type PolishedSkinId = PolishedSkin['id'];

export type PolishedTimerSlug = PolishedSkinSlug | (typeof POLISHED_TIMER_ONLY_SKINS)[number]['slug'];

/** Round timer picker order: the families, with Calçadão right after Brasil. */
export const POLISHED_TIMER_SKINS: readonly { slug: PolishedTimerSlug; label: string }[] = POLISHED_SKINS.flatMap<{ slug: PolishedTimerSlug; label: string }>((skin) =>
  skin.slug === 'brasil'
    ? [{ slug: skin.slug, label: skin.label }, ...POLISHED_TIMER_ONLY_SKINS]
    : [{ slug: skin.slug, label: skin.label }],
);

export function isPolishedTimerSlug(value: unknown): value is PolishedTimerSlug {
  return POLISHED_TIMER_SKINS.some((skin) => skin.slug === value);
}

export function isPolishedSkinSlug(value: unknown): value is PolishedSkinSlug {
  return POLISHED_SKINS.some((skin) => skin.slug === value);
}

export function isPolishedSkinId(value: unknown): value is PolishedSkinId {
  return POLISHED_SKINS.some((skin) => skin.id === value);
}

export function polishedSkinById(id: unknown): PolishedSkin | null {
  return POLISHED_SKINS.find((skin) => skin.id === id) ?? null;
}

export function polishedSkinBySlug(slug: unknown): PolishedSkin | null {
  return POLISHED_SKINS.find((skin) => skin.slug === slug) ?? null;
}

/**
 * Media Edition and above, read from the one check that gates the /media hub
 * (mediaConsoleDoorOpen over the browser's doors). No tier list lives here: whichever
 * tiers the entitlement helper says carry the Media door open these skins. Today that is
 * Media, Pro, and the owner unlock (and a seat whose invite opens the Media Console).
 * Instructor follows automatically once the helper gives it Media (PR #339's tier rule).
 */
export function polishedSkinsUnlocked(door: ProSurfaceInput): boolean {
  return mediaConsoleDoorOpen(door);
}

/** Unseated browser holding these pass doors (after tier expansion). For tests on the real tier table. */
export function polishedSkinAccessFromDoors(doors: readonly string[]): ProSurfaceInput {
  return {
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
    proUnlocked: doors.includes('pro'),
    mediaUnlocked: doors.includes('media'),
  };
}
