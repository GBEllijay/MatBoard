import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRAINING_NOTES_MAX,
  TRAINING_NOTES_STORAGE_KEY,
  loadTrainingNotes,
  saveTrainingNotes,
} from './trainingNotesStore.ts';

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

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage(),
  configurable: true,
});

test('Training notes stay local and clamp length', () => {
  assert.equal(loadTrainingNotes(), '');
  const saved = saveTrainingNotes('Closed guard drill, 5:00 each side.');
  assert.equal(saved, 'Closed guard drill, 5:00 each side.');
  assert.equal(loadTrainingNotes(), saved);
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), saved);
  const long = 'x'.repeat(TRAINING_NOTES_MAX + 40);
  assert.equal(saveTrainingNotes(long).length, TRAINING_NOTES_MAX);
});
