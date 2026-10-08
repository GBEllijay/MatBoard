import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_TRAINING_SKIN,
  TRAINING_SKIN_KEY,
  getTrainingSkin,
  setTrainingSkin,
  trainingUsesAdvantageSkin,
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

test('Pro suite can switch Advantage, Classic, then Advantage across a reload', () => {
  setTrainingSkin('themed');
  assert.equal(trainingUsesAdvantageSkin(getTrainingSkin()), true);
  setTrainingSkin('classic');
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'classic');
  assert.equal(getTrainingSkin(), 'classic');
  assert.equal(trainingUsesAdvantageSkin(getTrainingSkin()), false);
  setTrainingSkin('themed');
  assert.equal(getTrainingSkin(), 'themed');
  assert.equal(trainingUsesAdvantageSkin(getTrainingSkin()), true);
  const page = fs.readFileSync(new URL('../pages/Training.tsx', import.meta.url), 'utf8');
  assert.match(page, /trainingUsesAdvantageSkin\(skin\)/);
  assert.doesNotMatch(page, /fromSuite \? ' training--themed'/);
});

test('Round timer still offers the Advantage skin beside Classic', () => {
  const source = fs.readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
  assert.match(source, /setTrainingSkin\('classic'\)/);
  assert.match(source, /setTrainingSkin\('themed'\)/);
  assert.match(source, />\s*Advantage\s*</);
});
