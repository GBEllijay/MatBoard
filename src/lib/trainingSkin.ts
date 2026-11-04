/**
 * Round timer look. Classic is the familiar black board; Advantage is the mat theme.
 * The polished skins (polishedSkins.ts) are Media Edition and above. The pick is
 * remembered on this device; a polished pick that is locked here paints Classic.
 *
 * Advantage White, and no tier above it, does not use Classic, Advantage, or the
 * polished families. Its picker lists the same three base skins as the scoreboard
 * (Mock-Tournament, Old School, Quick Result). A saved skin that is not one of
 * those three paints Mock-Tournament and stays stored.
 */

import { isCustomSkinId } from './customSkin.ts';
import { POLISHED_TIMER_SKINS, isPolishedTimerSlug, type PolishedTimerSlug } from './polishedSkins.ts';

/** Same three base skins as the scoreboard picker, in that order. White tier only. */
export const WHITE_TIMER_SKINS = [
  { id: 'MOCK_TOURNAMENT', label: 'Mock-Tournament' },
  { id: 'OLD_SCHOOL', label: 'Old School' },
  { id: 'QUICK_RESULT', label: 'Quick Result' },
] as const;

export type WhiteTimerSkinId = (typeof WHITE_TIMER_SKINS)[number]['id'];

/** Base skin a hidden pick falls back to on White. */
export const WHITE_TIMER_BASE: WhiteTimerSkinId = 'MOCK_TOURNAMENT';

export type TrainingSkin = 'classic' | 'themed' | WhiteTimerSkinId | PolishedTimerSlug | `custom:${string}`;

export const TRAINING_SKIN_KEY = 'matboard.trainingSkin.v1';
export const DEFAULT_TRAINING_SKIN: TrainingSkin = 'classic';

const listeners = new Set<() => void>();

export function isWhiteTimerSkin(value: unknown): value is WhiteTimerSkinId {
  return WHITE_TIMER_SKINS.some((skin) => skin.id === value);
}

function isSkin(value: string | null): value is TrainingSkin {
  return value === 'classic' || value === 'themed' || isWhiteTimerSkin(value) || isPolishedTimerSlug(value) || isCustomSkinId(value);
}

function readSkin(): TrainingSkin {
  try {
    const raw = localStorage.getItem(TRAINING_SKIN_KEY);
    return isSkin(raw) ? raw : DEFAULT_TRAINING_SKIN;
  } catch {
    return DEFAULT_TRAINING_SKIN;
  }
}

function writeSkin(skin: TrainingSkin): void {
  try {
    localStorage.setItem(TRAINING_SKIN_KEY, skin);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function getTrainingSkin(): TrainingSkin {
  return readSkin();
}

export function subscribeTrainingSkin(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setTrainingSkin(skin: TrainingSkin): void {
  writeSkin(skin);
}

/**
 * Advantage is the mat clock. Classic is the black board.
 * Opening from the Pro suite must not force Advantage.
 */
export function trainingUsesAdvantageSkin(skin: TrainingSkin): boolean {
  return skin === 'themed';
}

export function isPolishedTrainingSkin(skin: TrainingSkin): skin is PolishedTimerSlug {
  return isPolishedTimerSlug(skin);
}

/**
 * Skin the timer paints on this browser.
 * White (no higher tier) paints one of its three base skins. Anything else, including
 * Classic, Advantage, and a polished family, falls back to Mock-Tournament. The stored
 * value is left alone.
 * Every other tier paints Classic for a locked polished pick, and also for a White-only
 * id, so Student and above keep the looks they already had.
 */
export function visibleTrainingSkin(skin: TrainingSkin, polishedOpen: boolean, whiteBaseSkins = false): TrainingSkin {
  if (whiteBaseSkins) return isWhiteTimerSkin(skin) ? skin : WHITE_TIMER_BASE;
  if (isCustomSkinId(skin)) return polishedOpen ? skin : DEFAULT_TRAINING_SKIN;
  if (isWhiteTimerSkin(skin)) return DEFAULT_TRAINING_SKIN;
  if (isPolishedTimerSlug(skin) && !polishedOpen) return DEFAULT_TRAINING_SKIN;
  return skin;
}

/** Extra class for a White base skin. Classic, Advantage, and polished skins add none. */
export function whiteTimerSurfaceClass(skin: TrainingSkin): string {
  if (skin === 'MOCK_TOURNAMENT') return 'training--wt-mock';
  if (skin === 'OLD_SCHOOL') return 'training--wt-old';
  if (skin === 'QUICK_RESULT') return 'training--wt-quick';
  return '';
}

/** Rounds controller background for a White base skin. Empty when the old Classic/Advantage rule applies. */
export function whiteTimerControllerClass(skin: TrainingSkin): string {
  if (skin === 'MOCK_TOURNAMENT') return 'controller--wt-mock';
  if (skin === 'OLD_SCHOOL') return 'controller--wt-old';
  if (skin === 'QUICK_RESULT') return 'controller--wt-quick';
  return '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TRAINING_SKIN_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}

/**
 * Everything the Timer Skin popup lists.
 * White (no higher tier): Mock-Tournament, Old School, Quick Result. The new families
 * are absent, not locked.
 * Everyone else: Classic, Advantage, then the polished skins (Calçadão after Brasil)
 * only when this browser has Media Edition or above.
 */
export function timerPickerSkins(
  polishedOpen: boolean,
  whiteBaseSkins = false,
): readonly { id: TrainingSkin; label: string; polished: boolean }[] {
  if (whiteBaseSkins) {
    return WHITE_TIMER_SKINS.map((skin) => ({ id: skin.id, label: skin.label, polished: false }));
  }
  return [
    { id: 'classic', label: 'Classic', polished: false },
    { id: 'themed', label: 'Advantage', polished: false },
    ...(polishedOpen ? POLISHED_TIMER_SKINS.map((skin) => ({ id: skin.slug, label: skin.label, polished: true })) : []),
  ];
}
