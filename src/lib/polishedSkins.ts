/**
 * Polished skins for the match scoreboard and the round timer.
 * Eight looks from the owner's polished mock: Kids Arcade, Kids Sticker, Keynote,
 * Heavy Metal ("up to 11"), Brasil, Woodblock, Reggae, Psychedelic.
 *
 * Tier rule: Media Edition and every tier above it. The gate is the existing /media
 * entitlement check, so it opens exactly where the Media door is open (Media, Pro, owner;
 * Instructor once the helper's "higher tiers include lower ones" change lands).
 * White and Student get none of them. This only reads doors; it never grants or stores one.
 *
 * Mock-Tournament, Old School, and Quick Result are not part of this list and stay
 * exactly where they were.
 */

import { MEDIA_HOME_PATH, mediaConsoleDoorOpen, type ProSurfaceInput } from './productNames.ts';

export const POLISHED_SKINS = [
  { slug: 'kids-arcade', id: 'KIDS_ARCADE', label: 'Kids Arcade' },
  { slug: 'kids-sticker', id: 'KIDS_STICKER', label: 'Kids Sticker' },
  { slug: 'keynote', id: 'KEYNOTE', label: 'Keynote' },
  { slug: 'heavy-metal', id: 'HEAVY_METAL', label: 'Heavy Metal' },
  { slug: 'brasil', id: 'BRASIL', label: 'Brasil' },
  { slug: 'woodblock', id: 'WOODBLOCK', label: 'Woodblock' },
  { slug: 'reggae', id: 'REGGAE', label: 'Reggae' },
  { slug: 'psychedelic', id: 'PSYCHEDELIC', label: 'Psychedelic' },
] as const;

export type PolishedSkin = (typeof POLISHED_SKINS)[number];
export type PolishedSkinSlug = PolishedSkin['slug'];
export type PolishedSkinId = PolishedSkin['id'];

/** Locked tile note in the picker. Keep it short. */
export const POLISHED_SKIN_UNLOCK_NOTE = 'Unlock with Media Edition';

/** Media Edition buy page. /media shows the $29.99 page to a browser without Media. */
export const POLISHED_SKIN_BUY_PATH = MEDIA_HOME_PATH;

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
