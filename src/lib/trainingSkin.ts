/** Round timer look. Classic is the familiar black board; Advantage is the mat theme. */

export type TrainingSkin = 'classic' | 'themed';

export const TRAINING_SKIN_KEY = 'matboard.trainingSkin.v1';
export const DEFAULT_TRAINING_SKIN: TrainingSkin = 'classic';

const listeners = new Set<() => void>();

function isSkin(value: string | null): value is TrainingSkin {
  return value === 'classic' || value === 'themed';
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

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TRAINING_SKIN_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
