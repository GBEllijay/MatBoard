import assert from 'node:assert/strict';
import test from 'node:test';
import { RANK_PHOTO_MAX_CHARS } from './progress/types.ts';
import {
  RANK_ENCODE_STEPS,
  RANK_PHOTO_KEY,
  addBeltPhoto,
  addKidsBeltPhoto,
  addTapePhoto,
  beltPhotos,
  emptyRankPhotoStore,
  kidsBeltPhotos,
  loadRankPictures,
  promotionPhotoError,
  rankPhotoFromFile,
  removeKidsBeltPhoto,
  removeTapePhoto,
  tapePhotos,
} from './rankPhotos.ts';
import { StorageQuotaError } from './storageQuota.ts';

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

function jpeg(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

function installCanvas(size: { width: number; height: number }, encode: (mime: string, quality: number) => Blob | null) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const edges: number[] = [];
  const qualities: number[] = [];
  globalThis.createImageBitmap = (async () => ({
    width: size.width,
    height: size.height,
    close() {},
  })) as typeof createImageBitmap;
  globalThis.document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: '',
            imageSmoothingEnabled: false,
            imageSmoothingQuality: 'low' as ImageSmoothingQuality,
            fillRect() {},
            drawImage() {},
          };
        },
        toBlob(callback: (blob: Blob | null) => void, mime: string, quality: number) {
          edges.push(canvas.width);
          qualities.push(quality);
          callback(encode(mime, quality));
        },
      };
      return canvas;
    },
  } as unknown as Document;
  return {
    edges,
    qualities,
    restore() {
      globalThis.createImageBitmap = previousBitmap;
      if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = previousDocument;
    },
  };
}

test('a promotion photo cap stays 48,000 characters and starts at 960', () => {
  assert.equal(RANK_PHOTO_MAX_CHARS, 48_000);
  assert.deepEqual(RANK_ENCODE_STEPS[0], { edge: 960, quality: 0.62 });
});

test('a large camera photo is shrunk under the promotion cap', async () => {
  const encoder = installCanvas({ width: 4032, height: 3024 }, (mime) => (mime === 'image/jpeg' ? jpeg(8_000) : null));
  try {
    const phone = new File([new Uint8Array(3_000_000)], 'black-belt.jpg', { type: 'image/jpeg' });
    const saved = await rankPhotoFromFile(phone);
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.ok(saved.length <= RANK_PHOTO_MAX_CHARS);
    assert.equal(encoder.edges[0], 960);
    assert.equal(encoder.qualities[0], 0.62);
  } finally {
    encoder.restore();
  }
});

test('an oversized encode steps down before it is refused', async () => {
  const encoder = installCanvas({ width: 4000, height: 3000 }, (mime, quality) => {
    if (mime !== 'image/jpeg') return null;
    return jpeg(quality <= 0.48 && encoder.edges.at(-1)! <= 720 ? 400 : 40_000);
  });
  try {
    const phone = new File([new Uint8Array(2_000_000)], 'promotion.jpg', { type: 'image/jpeg' });
    const saved = await rankPhotoFromFile(phone);
    assert.ok(saved.length <= RANK_PHOTO_MAX_CHARS);
    assert.equal(encoder.qualities.includes(0.62), true);
    assert.equal(encoder.edges.at(-1)! <= 720, true);
  } finally {
    encoder.restore();
  }
});

test('a missing createImageBitmap still encodes through an Image', async () => {
  const previousBitmap = globalThis.createImageBitmap;
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  const previousCreate = globalThis.URL.createObjectURL;
  const previousRevoke = globalThis.URL.revokeObjectURL;
  delete (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap;
  class FakeImage {
    naturalWidth = 3000;
    naturalHeight = 2000;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      this.onload?.();
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  globalThis.URL.createObjectURL = (() => 'blob:rank') as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext() {
        return { fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low', fillRect() {}, drawImage() {} };
      },
      toBlob(callback: (blob: Blob | null) => void, mime: string) {
        callback(mime === 'image/jpeg' ? jpeg(2_000) : null);
      },
    }),
  } as unknown as Document;
  try {
    const saved = await rankPhotoFromFile(new File([new Uint8Array(1_000_000)], 'belt.heic', { type: 'image/heic' }));
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.ok(saved.length <= RANK_PHOTO_MAX_CHARS);
  } finally {
    if (previousBitmap) globalThis.createImageBitmap = previousBitmap;
    if (previousImage) globalThis.Image = previousImage;
    else delete (globalThis as { Image?: typeof Image }).Image;
    globalThis.URL.createObjectURL = previousCreate;
    globalThis.URL.revokeObjectURL = previousRevoke;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('a photo no decoder can read is not stored, and a full quota leaves the old photo', async () => {
  withStorage(() => {
    addBeltPhoto(emptyRankPhotoStore(), 'black', image);
  });
  const previousBitmap = globalThis.createImageBitmap;
  const previousImage = globalThis.Image;
  const previousCreate = globalThis.URL.createObjectURL;
  const previousRevoke = globalThis.URL.revokeObjectURL;
  globalThis.createImageBitmap = (async () => {
    throw new Error('decode failed');
  }) as typeof createImageBitmap;
  class DeadImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      this.onerror?.();
    }
  }
  globalThis.Image = DeadImage as unknown as typeof Image;
  globalThis.URL.createObjectURL = (() => 'blob:broken') as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  try {
    await assert.rejects(
      rankPhotoFromFile(new File([Uint8Array.from([1, 2, 3])], 'broken.jpg', { type: 'image/jpeg' })),
      /undecodable/,
    );
    assert.match(promotionPhotoError(new Error('undecodable')), /could not read that photo/);
    assert.doesNotMatch(promotionPhotoError(new Error('undecodable')), /too large/);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    if (previousImage) globalThis.Image = previousImage;
    else delete (globalThis as { Image?: typeof Image }).Image;
    globalThis.URL.createObjectURL = previousCreate;
    globalThis.URL.revokeObjectURL = previousRevoke;
  }

  withStorage(() => {
    addBeltPhoto(emptyRankPhotoStore(), 'black', image);
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (value.length > image.length) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      setItem(key, value);
    };
    assert.throws(() => addBeltPhoto(loadRankPictures(), 'black', `${image}EXTRA`), (error) => error instanceof StorageQuotaError);
    assert.deepEqual(beltPhotos(loadRankPictures(), 'black'), [image]);
  });
});
