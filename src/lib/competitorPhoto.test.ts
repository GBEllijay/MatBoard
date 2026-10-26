import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPETITOR_PHOTO_MAX_CHARS,
  COMPETITOR_PHOTO_MAX_EDGE,
  COMPETITOR_PHOTO_QUALITY,
  clipCompetitorPhoto,
  competitorPhotoFromFile,
} from './competitorPhoto.ts';

type Draw = { w: number; h: number };

function installEncoder(bitmap: { width: number; height: number }, encode: (mime: string) => Blob | null) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const draws: Draw[] = [];
  const mimes: string[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      const ctx = {
        fillStyle: '',
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low' as ImageSmoothingQuality,
        fillRect() {},
        drawImage(_image: unknown, _x: number, _y: number, w: number, h: number) {
          draws.push({ w, h });
        },
      };
      return ctx;
    },
    toBlob(callback: (blob: Blob | null) => void, mime: string) {
      mimes.push(mime);
      callback(encode(mime));
    },
  };
  globalThis.createImageBitmap = (async () => ({
    width: bitmap.width,
    height: bitmap.height,
    close() {},
  })) as typeof createImageBitmap;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  return {
    draws,
    mimes,
    canvas,
    restore() {
      globalThis.createImageBitmap = previousBitmap;
      if (previousDocument === undefined) {
        delete (globalThis as { document?: Document }).document;
      } else {
        globalThis.document = previousDocument;
      }
    },
  };
}

test('a competitor face is a small still, not a TV photo', () => {
  assert.equal(COMPETITOR_PHOTO_MAX_EDGE, 256);
  assert.equal(COMPETITOR_PHOTO_QUALITY, 0.72);
  assert.ok(COMPETITOR_PHOTO_MAX_CHARS <= 40_000);
});

test('clipCompetitorPhoto keeps a compact still and drops everything else', () => {
  const jpeg = 'data:image/jpeg;base64,aaaa';
  assert.equal(clipCompetitorPhoto(jpeg), jpeg);
  assert.equal(clipCompetitorPhoto(`  ${jpeg}  `), jpeg);
  assert.equal(clipCompetitorPhoto('data:image/webp;base64,aaaa'), 'data:image/webp;base64,aaaa');
  assert.equal(clipCompetitorPhoto(''), '');
  assert.equal(clipCompetitorPhoto(null), '');
  assert.equal(clipCompetitorPhoto('https://example.com/face.jpg'), '');
  assert.equal(clipCompetitorPhoto('data:image/svg+xml;base64,aaaa'), '');
  assert.equal(clipCompetitorPhoto(`data:image/jpeg;base64,${'a'.repeat(COMPETITOR_PHOTO_MAX_CHARS)}`), '');
});

test('a file that is not a photo is refused', async () => {
  await assert.rejects(
    () => competitorPhotoFromFile(new File(['notes'], 'notes.txt', { type: 'text/plain' })),
    /not-image/,
  );
});

test('a small jpeg already under the face edge is stored as a data url', async () => {
  const encoder = installEncoder({ width: 80, height: 80 }, () => null);
  try {
    const file = new File([Uint8Array.from([1, 2, 3, 4])], 'face.jpg', { type: 'image/jpeg' });
    const url = await competitorPhotoFromFile(file);
    assert.match(url, /^data:image\/jpeg;base64,/);
    assert.equal(encoder.mimes.length, 0);
    assert.equal(clipCompetitorPhoto(url), url);
  } finally {
    encoder.restore();
  }
});

test('a phone photo is scaled to the face edge and encoded as jpeg', async () => {
  const jpeg = new Blob([new Uint8Array(120)], { type: 'image/jpeg' });
  const encoder = installEncoder({ width: 3000, height: 4000 }, () => jpeg);
  try {
    const file = new File([new Uint8Array(80_000)], 'face.jpg', { type: 'image/jpeg' });
    const url = await competitorPhotoFromFile(file);
    assert.match(url, /^data:image\/jpeg;base64,/);
    assert.equal(encoder.canvas.width, 192);
    assert.equal(encoder.canvas.height, 256);
    assert.equal(encoder.mimes[0], 'image/jpeg');
    assert.deepEqual(encoder.draws[0], { w: 192, h: 256 });
  } finally {
    encoder.restore();
  }
});

test('a still that cannot fit the cap is refused', async () => {
  const big = new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' });
  const encoder = installEncoder({ width: 4000, height: 3000 }, () => big);
  try {
    const file = new File([new Uint8Array(20)], 'face.jpg', { type: 'image/jpeg' });
    await assert.rejects(() => competitorPhotoFromFile(file), /too-large/);
    assert.equal(encoder.mimes.length, 3);
  } finally {
    encoder.restore();
  }
});
