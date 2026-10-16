import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RANK_PHOTO_KEY,
  addTapePhoto,
  emptyRankPhotoStore,
  loadRankPictures,
  removeTapePhoto,
  tapePhotos,
} from './rankPhotos.ts';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function withStorage(run: () => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map<string, string>();
  const storage = {
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key: string) => memory.get(key) ?? null,
    key: (index: number) => [...memory.keys()][index] ?? null,
    removeItem: (key: string) => {
      memory.delete(key);
    },
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  try {
    run();
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('a saved stripe photo with no date still loads', () => {
  withStorage(() => {
    localStorage.setItem(
      RANK_PHOTO_KEY,
      JSON.stringify({
        belts: { blue: [image] },
        tapes: { blue: [[image], [], [], []] },
        dates: { blue: ['2020-01-01'] },
      }),
    );
    const store = loadRankPictures();
    assert.deepEqual(tapePhotos(store, 'blue', 0), [image]);
    assert.deepEqual(tapePhotos(store, 'blue', 1), []);
    assert.equal(store.belts.blue?.[0], image);
    assert.equal(JSON.stringify(store).includes('"date"'), false);

    const saved = addTapePhoto(emptyRankPhotoStore(), 'white', 0, image);
    const raw = localStorage.getItem(RANK_PHOTO_KEY) ?? '';
    assert.equal(raw.includes('"date"'), false);
    assert.deepEqual(tapePhotos(loadRankPictures(), 'white', 0), [image]);
    const removed = removeTapePhoto(saved, 'white', 0, 0);
    assert.deepEqual(tapePhotos(removed, 'white', 0), []);
    assert.deepEqual(tapePhotos(loadRankPictures(), 'white', 0), []);
  });
});
