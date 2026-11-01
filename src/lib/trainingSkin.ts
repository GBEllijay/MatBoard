/**
 * Round timer look. Classic is the familiar black board; Advantage is the mat theme.
 * The polished skins (polishedSkins.ts) are Media Edition and above. The pick is
 * remembered on this device; a polished pick that is locked here paints Classic.
 */

import { isPolishedSkinSlug, type PolishedSkinSlug } from './polishedSkins.ts';

export type TrainingSkin = 'classic' | 'themed' | PolishedSkinSlug;

export const TRAINING_SKIN_KEY = 'matboard.trainingSkin.v1';
export const DEFAULT_TRAINING_SKIN: TrainingSkin = 'classic';

const listeners = new Set<() => void>();

function isSkin(value: string | null): value is TrainingSkin {
  return value === 'classic' || value === 'themed' || isPolishedSkinSlug(value);
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

export function isPolishedTrainingSkin(skin: TrainingSkin): skin is PolishedSkinSlug {
  return isPolishedSkinSlug(skin);
}

/** Skin the timer paints on this browser. A locked polished pick falls back to Classic. */
export function visibleTrainingSkin(skin: TrainingSkin, polishedOpen: boolean): TrainingSkin {
  if (isPolishedSkinSlug(skin) && !polishedOpen) return DEFAULT_TRAINING_SKIN;
  return skin;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TRAINING_SKIN_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
