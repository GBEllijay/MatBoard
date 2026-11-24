/**
 * Round timer look. Classic is the familiar black board; Advantage is the mat theme.
 * The polished skins (polishedSkins.ts) are Media Edition and above. The pick is
 * remembered on this device; a polished pick that is locked here paints Classic.
 *
 * Advantage White, and no tier above it, does not use Classic, Advantage, or the
 * polished families. Its picker lists the White base and timer skins. A saved skin
 * that is not one of those paints Mock-Tournament and stays stored.
 */

import { isCustomSkinId } from './customSkin.ts';
import { POLISHED_TIMER_SKINS, isPolishedTimerSlug, type PolishedTimerSlug } from './polishedSkins.ts';

/** White-tier round timer skins. */
export const WHITE_TIMER_SKINS = [
  { id: 'MOCK_TOURNAMENT', label: 'Mock-Tournament' },
  { id: 'OLD_SCHOOL', label: 'Old School' },
  { id: 'QUICK_RESULT', label: 'Quick Result' },
  { id: 'CLEAN_MAT_BROADCAST', label: 'Clean Mat Broadcast' },
  { id: 'SPLIT_FLAP_PRO', label: 'Split-Flap Pro' },
  { id: 'HIGH_CONTRAST_DAYLIGHT', label: 'High-Contrast Daylight' },
  { id: 'LED_GYM_WALL', label: 'LED Gym Wall Clock' },
  { id: 'TRUE_FLIP_INTERVAL', label: 'True Flip-Card Interval' },
  { id: 'WORK_REST_TATAMI', label: 'Work/Rest Color-Shift Tatami' },
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
 * White (no higher tier) paints one of its White timer skins. Anything else, including
 * Classic, Advantage, and a polished family, falls back to Mock-Tournament. The stored
 * value is left alone.
 * Every other tier paints Classic for a locked polished pick, and also for a White-only
 * id, so Student and above keep the looks they already had.
 */
export function visibleTrainingSkin(
  skin: TrainingSkin,
  polishedOpen: boolean,
  whiteBaseSkins = false,
  whiteRoute = false,
): TrainingSkin {
  const whiteBoard = whiteBaseSkins || whiteRoute;
  if (whiteBoard) {
    if (isWhiteTimerSkin(skin)) return skin;
    if (isPolishedTimerSlug(skin) || isCustomSkinId(skin)) return skin;
    return WHITE_TIMER_BASE;
  }
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
  if (skin === 'CLEAN_MAT_BROADCAST') return 'training--wt-broadcast';
  if (skin === 'SPLIT_FLAP_PRO') return 'training--wt-split-flap';
  if (skin === 'HIGH_CONTRAST_DAYLIGHT') return 'training--wt-daylight';
  if (skin === 'LED_GYM_WALL') return 'training--wt-led';
  if (skin === 'TRUE_FLIP_INTERVAL') return 'training--wt-true-flip';
  if (skin === 'WORK_REST_TATAMI') return 'training--wt-tatami';
  return '';
}

/** Rounds controller background for a White base skin. Empty when the old Classic/Advantage rule applies. */
export function whiteTimerControllerClass(skin: TrainingSkin): string {
  if (skin === 'MOCK_TOURNAMENT') return 'controller--wt-mock';
  if (skin === 'OLD_SCHOOL') return 'controller--wt-old';
  if (skin === 'QUICK_RESULT') return 'controller--wt-quick';
  if (skin === 'CLEAN_MAT_BROADCAST') return 'controller--wt-broadcast';
  if (skin === 'SPLIT_FLAP_PRO') return 'controller--wt-split-flap';
  if (skin === 'HIGH_CONTRAST_DAYLIGHT') return 'controller--wt-daylight';
  if (skin === 'LED_GYM_WALL') return 'controller--wt-led';
  if (skin === 'TRUE_FLIP_INTERVAL') return 'controller--wt-true-flip';
  if (skin === 'WORK_REST_TATAMI') return 'controller--wt-tatami';
  return '';
}

/** True when the timer renders matte split-flap digit modules (Split-Flap Pro). */
export function trainingUsesSplitFlap(skin: TrainingSkin): boolean {
  return skin === 'SPLIT_FLAP_PRO';
}

/** True when the timer renders hinged flip-card digits (True Flip-Card Interval). */
export function trainingUsesTrueFlipCards(skin: TrainingSkin): boolean {
  return skin === 'TRUE_FLIP_INTERVAL';
}

/** True when the timer renders segmented 7-segment LED digits. */
export function trainingUsesLedClock(skin: TrainingSkin): boolean {
  return skin === 'LED_GYM_WALL';
}

/** True for White timer skins that display a phase progress bar. */
export function trainingHasProgressBar(skin: TrainingSkin): boolean {
  return (
    skin === 'CLEAN_MAT_BROADCAST' ||
    skin === 'SPLIT_FLAP_PRO' ||
    skin === 'HIGH_CONTRAST_DAYLIGHT' ||
    skin === 'LED_GYM_WALL' ||
    skin === 'TRUE_FLIP_INTERVAL' ||
    skin === 'WORK_REST_TATAMI'
  );
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
 * Advantage BJJ Scoreboard (White route or White-only tier): the White timer skins
 * plus the polished families.
 * Everyone else: Classic, Advantage, then the polished skins (Calçadão after Brasil)
 * only when this browser has Media Edition or above.
 */
export function timerPickerSkins(
  polishedOpen: boolean,
  whiteBaseSkins = false,
  whiteRoute = false,
): readonly { id: TrainingSkin; label: string; polished: boolean }[] {
  if (whiteBaseSkins || whiteRoute) {
    return [
      ...WHITE_TIMER_SKINS.map((skin) => ({ id: skin.id, label: skin.label, polished: false })),
      ...POLISHED_TIMER_SKINS.map((skin) => ({ id: skin.slug as TrainingSkin, label: skin.label, polished: true })),
    ];
  }
  return [
    { id: 'classic', label: 'Classic', polished: false },
    { id: 'themed', label: 'Advantage', polished: false },
    ...(polishedOpen ? POLISHED_TIMER_SKINS.map((skin) => ({ id: skin.slug, label: skin.label, polished: true })) : []),
  ];
}
