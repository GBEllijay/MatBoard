import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localPhotoError } from './localPhotoError.ts';
import { packetCarriesBytes } from './progress/format.ts';
import {
  PORTRAIT_ENCODE_STEPS,
  PORTRAIT_MAX_CHARS,
  PORTRAIT_MAX_EDGE,
  clearProfilePortrait,
  portraitFromFile,
  readProfilePortrait,
  saveProfilePortrait,
  writeProfilePortraitSync,
  type PortraitMirror,
} from './profilePortrait.ts';
import { DEVICE_STORAGE_FULL_NOTE, StorageQuotaError } from './storageQuota.ts';
import { blankStudentReport } from './studentEdition.ts';
import { progressReportFiles } from './studentTools.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

const SELFIE = 'data:image/jpeg;base64,AAAA';

test('a profile photo is stored and removed on this device', async () => {
  const storage = memory();
  const mirrored: string[] = [];
  const mirror: PortraitMirror = {
    put: async (value) => {
      mirrored.push(`put:${value}`);
    },
    delete: async () => {
      mirrored.push('delete');
    },
  };
  assert.equal(readProfilePortrait(storage), null);
  await saveProfilePortrait(SELFIE, storage, mirror);
  assert.equal(readProfilePortrait(storage), SELFIE);
  assert.deepEqual(mirrored, [`put:${SELFIE}`]);
  await clearProfilePortrait(storage, mirror);
  assert.equal(readProfilePortrait(storage), null);
  assert.deepEqual(mirrored, [`put:${SELFIE}`, 'delete']);
});

test('saving a profile photo does not call fetch', async () => {
  const storage = memory();
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.reject(new Error('network'));
  }) as typeof fetch;
  try {
    await saveProfilePortrait(SELFIE, storage, { put: async () => undefined, delete: async () => undefined });
    await clearProfilePortrait(storage, { put: async () => undefined, delete: async () => undefined });
    assert.equal(calls, 0);
    assert.equal(readProfilePortrait(storage), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('a remote address is not kept as the profile photo', () => {
  const storage = memory();
  assert.throws(() => writeProfilePortraitSync('https://example.com/face.jpg', storage), /too-large/);
  assert.equal(readProfilePortrait(storage), null);
});

test('a profile photo stays out of the progress file', () => {
  const storage = memory();
  writeProfilePortraitSync(SELFIE, storage);
  const files = progressReportFiles(blankStudentReport(), [], storage);
  assert.equal(files.json.includes(SELFIE), false);
  assert.equal(files.json.includes('portrait'), false);
  assert.equal(packetCarriesBytes(JSON.parse(files.json)), false);
  assert.equal(readProfilePortrait(storage), SELFIE);
});

test('a profile photo rejects a file that is not a picture', async () => {
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  await assert.rejects(portraitFromFile(file), /not-image/);
});

type Crop = { sx: number; sy: number; sw: number; sh: number; dw: number; dh: number };

function installCanvas(bitmap: { width: number; height: number }, encode: (mime: string, quality: number) => Blob | null) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const crops: Crop[] = [];
  const mimes: string[] = [];
  const qualities: number[] = [];
  const edges: number[] = [];
  let closed = false;
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        fillStyle: '',
        save() {},
        restore() {},
        beginPath() {},
        arc() {},
        clip() {},
        fillRect() {},
        drawImage(
          _image: unknown,
          sx: number,
          sy: number,
          sw: number,
          sh: number,
          _dx: number,
          _dy: number,
          dw: number,
          dh: number,
        ) {
          crops.push({ sx, sy, sw, sh, dw, dh });
        },
      };
    },
    toBlob(callback: (blob: Blob | null) => void, mime: string, quality: number) {
      mimes.push(mime);
      qualities.push(quality);
      edges.push(canvas.width);
      callback(encode(mime, quality));
    },
  };
  globalThis.createImageBitmap = (async () => ({
    width: bitmap.width,
    height: bitmap.height,
    close() {
      closed = true;
    },
  })) as typeof createImageBitmap;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  return {
    crops,
    mimes,
    qualities,
    edges,
    wasClosed: () => closed,
    restore() {
      globalThis.createImageBitmap = previousBitmap;
      if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
      else globalThis.document = previousDocument;
    },
  };
}

function jpeg(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

test('the stored profile photo cap is unchanged', () => {
  assert.equal(PORTRAIT_MAX_EDGE, 320);
  assert.equal(PORTRAIT_MAX_CHARS, 70_000);
  assert.deepEqual(PORTRAIT_ENCODE_STEPS[0], { edge: 320, quality: 0.72 });
});

test('a 12MP camera photo is center-cropped to 320 and kept under the cap', async () => {
  const encoder = installCanvas({ width: 4032, height: 3024 }, (mime) => (mime === 'image/jpeg' ? jpeg(18_000) : null));
  const original = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (() => {
    fetches += 1;
    return Promise.reject(new Error('network'));
  }) as typeof fetch;
  try {
    const phone = new File([new Uint8Array(4_500_000)], 'IMG_4032.JPG', { type: 'image/jpeg' });
    const saved = await portraitFromFile(phone);
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.ok(saved.length <= PORTRAIT_MAX_CHARS);
    assert.deepEqual(encoder.edges, [320]);
    assert.deepEqual(encoder.qualities, [0.72]);
    assert.deepEqual(encoder.crops[0], { sx: 504, sy: 0, sw: 3024, sh: 3024, dw: 320, dh: 320 });
    assert.equal(encoder.wasClosed(), true);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = original;
    encoder.restore();
  }
});

test('a JPEG over the cap steps down, and WebP can fit at the same size', async () => {
  const stepped = installCanvas({ width: 4032, height: 3024 }, (mime, quality) => {
    if (mime !== 'image/jpeg') return null;
    return quality <= 0.42 ? jpeg(200) : jpeg(60_000);
  });
  try {
    const phone = new File([new Uint8Array(3_000_000)], 'IMG_4032.JPG', { type: 'image/jpeg' });
    const saved = await portraitFromFile(phone);
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.ok(saved.length <= PORTRAIT_MAX_CHARS);
    assert.deepEqual(stepped.qualities.filter((quality) => quality > 0.42).length > 0, true);
    assert.equal(stepped.qualities.at(-1), 0.42);
    assert.equal(stepped.edges.at(-1), 320);
  } finally {
    stepped.restore();
  }

  const webp = installCanvas({ width: 4000, height: 3000 }, (mime) =>
    mime === 'image/webp' ? new Blob([new Uint8Array(180)], { type: 'image/webp' }) : jpeg(60_000),
  );
  try {
    const phone = new File([new Uint8Array(2_000_000)], 'IMG_4000.JPG', { type: 'image/jpeg' });
    const saved = await portraitFromFile(phone);
    assert.match(saved, /^data:image\/webp;base64,/);
    assert.ok(saved.length <= PORTRAIT_MAX_CHARS);
    assert.deepEqual(webp.edges, [320, 320]);
  } finally {
    webp.restore();
  }
});

test('a missing or rejecting createImageBitmap falls back to an Image decode', async () => {
  const previousBitmap = globalThis.createImageBitmap;
  const previousImage = globalThis.Image;
  const previousCreate = globalThis.URL.createObjectURL;
  const previousRevoke = globalThis.URL.revokeObjectURL;
  const previousDocument = globalThis.document;
  delete (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap;
  class FakeImage {
    naturalWidth = 3024;
    naturalHeight = 4032;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      this.onload?.();
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  let revoked = 0;
  globalThis.URL.createObjectURL = (() => 'blob:fixture') as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => {
    revoked += 1;
  }) as typeof URL.revokeObjectURL;
  const crops: Crop[] = [];
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext() {
        return {
          fillStyle: '',
          save() {},
          restore() {},
          beginPath() {},
          arc() {},
          clip() {},
          fillRect() {},
          drawImage(
            _image: unknown,
            sx: number,
            sy: number,
            sw: number,
            sh: number,
            _dx: number,
            _dy: number,
            dw: number,
            dh: number,
          ) {
            crops.push({ sx, sy, sw, sh, dw, dh });
          },
        };
      },
      toBlob(callback: (blob: Blob | null) => void, mime: string) {
        callback(mime === 'image/jpeg' ? jpeg(4_000) : null);
      },
    }),
  } as unknown as Document;
  try {
    const phone = new File([new Uint8Array(5_000_000)], 'portrait.heic', { type: 'image/heic' });
    const saved = await portraitFromFile(phone);
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.ok(saved.length <= PORTRAIT_MAX_CHARS);
    assert.deepEqual(crops[0], { sx: 0, sy: 504, sw: 3024, sh: 3024, dw: 320, dh: 320 });
    assert.equal(revoked, 1);
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

test('createImageBitmap can reject the full photo and still decode a smaller one', async () => {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const calls: Array<ImageBitmapOptions | undefined> = [];
  globalThis.createImageBitmap = (async (_file: Blob, options?: ImageBitmapOptions) => {
    calls.push(options);
    if (!options?.resizeWidth) throw new Error('too big');
    return { width: 1600, height: 1200, close() {} };
  }) as typeof createImageBitmap;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext() {
        return {
          fillStyle: '',
          save() {},
          restore() {},
          beginPath() {},
          arc() {},
          clip() {},
          fillRect() {},
          drawImage() {},
        };
      },
      toBlob(callback: (blob: Blob | null) => void, mime: string) {
        callback(mime === 'image/jpeg' ? jpeg(2_000) : null);
      },
    }),
  } as unknown as Document;
  try {
    const phone = new File([new Uint8Array(8_000_000)], 'IMG_4032.JPG', { type: 'image/jpeg' });
    const saved = await portraitFromFile(phone);
    assert.match(saved, /^data:image\/jpeg;base64,/);
    assert.equal(calls.length, 3);
    assert.equal(calls[2]?.resizeWidth, 1600);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('a photo no decoder can read is undecodable and leaves the saved photo', async () => {
  const storage = memory();
  writeProfilePortraitSync(SELFIE, storage);
  const previousBitmap = globalThis.createImageBitmap;
  const previousImage = globalThis.Image;
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
  const previousCreate = globalThis.URL.createObjectURL;
  const previousRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = (() => 'blob:broken') as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  try {
    const broken = new File([Uint8Array.from([0, 1, 2, 3])], 'broken.jpg', { type: 'image/jpeg' });
    await assert.rejects(portraitFromFile(broken), /undecodable/);
    assert.equal(readProfilePortrait(storage), SELFIE);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    if (previousImage) globalThis.Image = previousImage;
    else delete (globalThis as { Image?: typeof Image }).Image;
    globalThis.URL.createObjectURL = previousCreate;
    globalThis.URL.revokeObjectURL = previousRevoke;
  }
});

test('an encode that cannot fit the cap is too-large and does not replace the photo', async () => {
  const storage = memory();
  writeProfilePortraitSync(SELFIE, storage);
  const encoder = installCanvas({ width: 4032, height: 3024 }, () => jpeg(60_000));
  try {
    const phone = new File([new Uint8Array(2_000_000)], 'noise.jpg', { type: 'image/jpeg' });
    await assert.rejects(portraitFromFile(phone), /too-large/);
    assert.equal(encoder.mimes.length, PORTRAIT_ENCODE_STEPS.length * 2);
    assert.equal(readProfilePortrait(storage), SELFIE);
  } finally {
    encoder.restore();
  }
});

test('a canvas that cannot encode is unencoded, not too large', async () => {
  const encoder = installCanvas({ width: 1200, height: 1600 }, () => null);
  try {
    const phone = new File([new Uint8Array(800_000)], 'face.jpg', { type: 'image/jpeg' });
    await assert.rejects(portraitFromFile(phone), /unencoded/);
  } finally {
    encoder.restore();
  }
});

test('a full storage quota does not replace the profile photo', async () => {
  const storage = memory();
  writeProfilePortraitSync(SELFIE, storage);
  let writes = 0;
  const full = {
    getItem: storage.getItem,
    setItem: () => {
      writes += 1;
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
    removeItem: storage.removeItem,
  };
  await assert.rejects(() => saveProfilePortrait('data:image/jpeg;base64,BBBB', full), (error) => error instanceof StorageQuotaError);
  assert.equal(writes, 1);
  assert.equal(readProfilePortrait(storage), SELFIE);

  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { storage: { estimate: async () => ({ quota: 10, usage: 10 }) } },
  });
  let estimatedWrites = 0;
  const blocked = {
    getItem: storage.getItem,
    setItem: () => {
      estimatedWrites += 1;
    },
    removeItem: storage.removeItem,
  };
  try {
    await assert.rejects(
      () => saveProfilePortrait('data:image/jpeg;base64,CCCC', blocked),
      (error) => error instanceof StorageQuotaError,
    );
    assert.equal(estimatedWrites, 0);
    assert.equal(readProfilePortrait(storage), SELFIE);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
  }
});

test('profile photo failures say what happened, and the saver does not call the network', () => {
  assert.match(localPhotoError(new Error('not-image'), 'photo'), /Choose a JPEG, PNG, or WebP/);
  assert.match(localPhotoError(new Error('undecodable'), 'photo'), /could not read that photo/);
  assert.match(localPhotoError(new Error('too-large'), 'photo'), /after shrinking it/);
  assert.match(localPhotoError(new Error('unencoded'), 'logo'), /could not prepare that logo/);
  assert.equal(localPhotoError(new StorageQuotaError(0), 'photo'), DEVICE_STORAGE_FULL_NOTE);
  assert.match(localPhotoError(new Error('boom'), 'photo'), /could not be saved/);
  const portrait = readFileSync(new URL('./profilePortrait.ts', import.meta.url), 'utf8');
  const still = readFileSync(new URL('./phoneStill.ts', import.meta.url), 'utf8');
  assert.equal(portrait.includes('fetch('), false);
  assert.equal(still.includes('fetch('), false);
  assert.equal(portrait.includes('advantageCloud'), false);
  assert.equal(still.includes('advantageCloud'), false);
});
