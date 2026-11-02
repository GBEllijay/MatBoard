/**
 * Round timer look. Classic is the familiar black board; Advantage is the mat theme.
 * The polished skins (polishedSkins.ts) are Media Edition and above. The pick is
 * remembered on this device; a polished pick that is locked here paints Classic.
 */

import { POLISHED_TIMER_SKINS, isPolishedTimerSlug, type PolishedTimerSlug } from './polishedSkins.ts';

export type TrainingSkin = 'classic' | 'themed' | PolishedTimerSlug;

export const TRAINING_SKIN_KEY = 'matboard.trainingSkin.v1';
export const DEFAULT_TRAINING_SKIN: TrainingSkin = 'classic';

const listeners = new Set<() => void>();

function isSkin(value: string | null): value is TrainingSkin {
  return value === 'classic' || value === 'themed' || isPolishedTimerSlug(value);
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

/** Skin the timer paints on this browser. A locked polished pick falls back to Classic. */
export function visibleTrainingSkin(skin: TrainingSkin, polishedOpen: boolean): TrainingSkin {
  if (isPolishedTimerSlug(skin) && !polishedOpen) return DEFAULT_TRAINING_SKIN;
  return skin;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TRAINING_SKIN_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}

/**
 * Everything the Timer Skin popup lists: Classic, Advantage, then the polished skins
 * (Calçadão after Brasil) only when this browser has Media Edition or above.
 */
export function timerPickerSkins(polishedOpen: boolean): readonly { id: TrainingSkin; label: string; polished: boolean }[] {
  return [
    { id: 'classic', label: 'Classic', polished: false },
    { id: 'themed', label: 'Advantage', polished: false },
    ...(polishedOpen ? POLISHED_TIMER_SKINS.map((skin) => ({ id: skin.slug, label: skin.label, polished: true })) : []),
  ];
}
