import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TRAINING_SKIN,
  TRAINING_SKIN_KEY,
  getTrainingSkin,
  setTrainingSkin,
} from './trainingSkin.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

test('Round timer defaults to the Classic skin', () => {
  storage.removeItem(TRAINING_SKIN_KEY);
  assert.equal(DEFAULT_TRAINING_SKIN, 'classic');
  assert.equal(getTrainingSkin(), 'classic');
});

test('Round timer skin persists Classic and Advantage', () => {
  setTrainingSkin('themed');
  assert.equal(getTrainingSkin(), 'themed');
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'themed');
  setTrainingSkin('classic');
  assert.equal(getTrainingSkin(), 'classic');
});

test('Unknown stored timer skin falls back to Classic', () => {
  localStorage.setItem(TRAINING_SKIN_KEY, 'neon');
  assert.equal(getTrainingSkin(), 'classic');
});
