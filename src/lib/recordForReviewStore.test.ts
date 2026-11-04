import assert from 'node:assert/strict';
import test from 'node:test';
import { TRAINING_NOTES_STORAGE_KEY } from './trainingNotesStore.ts';
import { STANDALONE_REVIEW_KEY, loadStandaloneReview, saveStandaloneReview } from './recordForReviewStore.ts';
import { createReplay } from './replayAnalysis.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    bag,
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

test('standalone Record for Review keeps its own clip and does not write a lesson plan', () => {
  const store = memory();
  const fresh = loadStandaloneReview(store);
  assert.equal(fresh.clip, undefined);
  assert.equal(store.bag.has(TRAINING_NOTES_STORAGE_KEY), false);
  assert.equal(store.bag.has(STANDALONE_REVIEW_KEY), false);

  const replay = createReplay();
  replay.title = 'Knee cut';
  replay.clip = { localId: 'rclip-alone', name: 'knee.mp4', mime: 'video/mp4', size: 12, source: 'record' };
  saveStandaloneReview(replay, store);
  assert.equal(store.bag.has(TRAINING_NOTES_STORAGE_KEY), false);

  const loaded = loadStandaloneReview(store);
  assert.equal(loaded.id, replay.id);
  assert.equal(loaded.title, 'Knee cut');
  assert.equal(loaded.clip?.localId, 'rclip-alone');
  assert.equal(store.bag.has(TRAINING_NOTES_STORAGE_KEY), false);
});
