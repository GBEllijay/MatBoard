import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RANK_PHOTO_KEY,
  addBeltPhoto,
  addKidsBeltPhoto,
  addTapePhoto,
  beltPhotos,
  emptyRankPhotoStore,
  kidsBeltPhotos,
  loadRankPictures,
  removeKidsBeltPhoto,
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

test('kids belt photos stay off the adult belts', () => {
  withStorage(() => {
    const adult = addBeltPhoto(emptyRankPhotoStore(), 'white', image);
    const kids = addKidsBeltPhoto(adult, 'grey-white', image);
    assert.deepEqual(beltPhotos(kids, 'white'), [image]);
    assert.deepEqual(kidsBeltPhotos(kids, 'grey-white'), [image]);
    assert.equal(kidsBeltPhotos(kids, 'white').length, 0);
    const loaded = loadRankPictures();
    assert.deepEqual(beltPhotos(loaded, 'white'), [image]);
    assert.deepEqual(kidsBeltPhotos(loaded, 'grey-white'), [image]);
    const cleared = removeKidsBeltPhoto(loaded, 'grey-white', 0);
    assert.deepEqual(kidsBeltPhotos(cleared, 'grey-white'), []);
    assert.equal(JSON.stringify(cleared).includes('grey-white'), false);
    assert.deepEqual(beltPhotos(loadRankPictures(), 'white'), [image]);
  });
});
