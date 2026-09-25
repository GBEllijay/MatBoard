import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STORED_PHOTO_MAX_EDGE,
  STORED_PHOTO_PASSTHROUGH_BYTES,
  STORED_PHOTO_QUALITY,
  boundsForDecode,
  fitWithinEdge,
  imageBoundsFromBytes,
  shrinkImageFile,
  shrinkPhotoForStore,
} from './imageShrink.ts';
import { StorageQuotaError, isStorageQuotaError } from './storageQuota.ts';

type Draw = { w: number; h: number; fill: string };

function installEncoder(bitmap: { width: number; height: number }, encode: (mime: string) => Blob | null) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const draws: Draw[] = [];
  const mimes: string[] = [];
  const qualities: number[] = [];
  let closed = false;
  const bitmapOptions: ImageBitmapOptions[] = [];
  globalThis.createImageBitmap = (async (_source: Blob, opts?: ImageBitmapOptions) => {
    if (opts && Object.keys(opts).length) bitmapOptions.push(opts);
    return {
      width: bitmap.width,
      height: bitmap.height,
      close() {
        closed = true;
      },
    };
  }) as typeof createImageBitmap;
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
          draws.push({ w, h, fill: ctx.fillStyle });
        },
      };
      return ctx;
    },
    toBlob(callback: (blob: Blob | null) => void, mime: string, quality: number) {
      mimes.push(mime);
      qualities.push(quality);
      callback(encode(mime));
    },
  };
  globalThis.document = {
    createElement: () => canvas,
  } as unknown as Document;
  return {
    draws,
    mimes,
    qualities,
    bitmapOptions,
    canvas,
    wasClosed: () => closed,
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

test('a phone photo fits a 1080p gym TV on the long edge', () => {
  assert.equal(STORED_PHOTO_MAX_EDGE, 1920);
  assert.equal(STORED_PHOTO_QUALITY, 0.82);
  assert.deepEqual(fitWithinEdge(4032, 3024, STORED_PHOTO_MAX_EDGE), {
    scale: 1920 / 4032,
    width: 1920,
    height: 1440,
  });
  assert.deepEqual(fitWithinEdge(3024, 4032, STORED_PHOTO_MAX_EDGE), {
    scale: 1920 / 4032,
    width: 1440,
    height: 1920,
  });
  const already = fitWithinEdge(1280, 720, STORED_PHOTO_MAX_EDGE);
  assert.equal(already.scale, 1);
  assert.equal(already.width, 1280);
  assert.equal(already.height, 720);
});

test('a Pro Shop photo is scaled and stored as a small JPEG', async () => {
  const encoder = installEncoder({ width: 4032, height: 3024 }, (mime) => {
    assert.equal(mime, 'image/jpeg');
    return new Blob([new Uint8Array(24_000)], { type: mime });
  });
  try {
    const phone = new File([new Uint8Array(4_200_000)], 'gi-front.jpg', { type: 'image/jpeg' });
    const stored = await shrinkPhotoForStore(phone);
    assert.equal(encoder.canvas.width, 1920);
    assert.equal(encoder.canvas.height, 1440);
    assert.deepEqual(encoder.mimes, ['image/jpeg']);
    assert.deepEqual(encoder.qualities, [STORED_PHOTO_QUALITY]);
    assert.equal(encoder.draws[0]?.fill, '#ffffff');
    assert.equal(encoder.draws[0]?.w, 1920);
    assert.equal(encoder.draws[0]?.h, 1440);
    assert.equal(stored.type, 'image/jpeg');
    assert.equal(stored.size, 24_000);
    assert.ok(stored.size < phone.size);
    assert.equal(encoder.wasClosed(), true);
  } finally {
    encoder.restore();
  }
});

test('JPEG encode falls back to WebP, then to the original file', async () => {
  const webp = installEncoder({ width: 4000, height: 3000 }, (mime) =>
    mime === 'image/webp' ? new Blob([new Uint8Array(800)], { type: 'image/webp' }) : null,
  );
  try {
    const phone = new File([new Uint8Array(2_000_000)], 'rashguard.jpg', { type: 'image/jpeg' });
    const stored = await shrinkPhotoForStore(phone);
    assert.deepEqual(webp.mimes, ['image/jpeg', 'image/webp']);
    assert.equal(stored.type, 'image/webp');
    assert.equal(stored.size, 800);
  } finally {
    webp.restore();
  }

  const neither = installEncoder({ width: 4000, height: 3000 }, () => null);
  try {
    const phone = new File([new Uint8Array(2_000_000)], 'rashguard.jpg', { type: 'image/jpeg' });
    const stored = await shrinkPhotoForStore(phone);
    assert.equal(stored, phone);
  } finally {
    neither.restore();
  }
});

test('a small in-bounds JPEG is kept and a larger re-encode is discarded', async () => {
  let encoded = 0;
  const small = installEncoder({ width: 1200, height: 900 }, () => {
    encoded += 1;
    return new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
  });
  try {
    const file = new File([new Uint8Array(80_000)], 'patch.jpg', { type: 'image/jpeg' });
    assert.ok(file.size < STORED_PHOTO_PASSTHROUGH_BYTES);
    const stored = await shrinkPhotoForStore(file);
    assert.equal(stored, file);
    assert.equal(encoded, 0);
    assert.equal(small.wasClosed(), true);
  } finally {
    small.restore();
  }

  const grown = installEncoder({ width: 800, height: 600 }, () => new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' }));
  try {
    const file = new File([new Uint8Array(800_000)], 'already-big.jpg', { type: 'image/jpeg' });
    const stored = await shrinkPhotoForStore(file);
    assert.equal(stored, file);
  } finally {
    grown.restore();
  }
});

test('videos and gifs are not re-encoded; a broken decode keeps the original', async () => {
  let decoded = 0;
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  globalThis.createImageBitmap = (async () => {
    decoded += 1;
    throw new Error('decode failed');
  }) as typeof createImageBitmap;
  globalThis.document = {
    createElement() {
      throw new Error('no canvas');
    },
  } as unknown as Document;
  try {
    const clip = new File([new Uint8Array(50_000)], 'drill.mp4', { type: 'video/mp4' });
    const gif = new File([new Uint8Array(50_000)], 'loop.gif', { type: 'image/gif' });
    const heic = new File([new Uint8Array(50_000)], 'gi.heic', { type: 'image/heic' });
    assert.equal(await shrinkPhotoForStore(clip), clip);
    assert.equal(await shrinkPhotoForStore(gif), gif);
    assert.equal(decoded, 0);
    assert.equal(await shrinkPhotoForStore(heic), heic);
    assert.ok(decoded >= 1);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('a large camera HEIC that cannot be decoded is not stored whole', async () => {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const options: ImageBitmapOptions[] = [];
  globalThis.createImageBitmap = (async (_source: Blob, opts?: ImageBitmapOptions) => {
    if (opts) options.push(opts);
    throw new Error('Unable to complete previous operation due to low memory');
  }) as typeof createImageBitmap;
  globalThis.document = {
    createElement() {
      throw new Error('no canvas');
    },
  } as unknown as Document;
  try {
    const heic = new File([new Uint8Array(2_400_000)], 'IMG.HEIC', { type: 'image/heic' });
    await assert.rejects(shrinkPhotoForStore(heic), (error: unknown) => {
      assert.ok(error instanceof StorageQuotaError);
      assert.equal(error.saved, 0);
      assert.equal(isStorageQuotaError(error), true);
      return true;
    });
    assert.deepEqual(
      options.map((option) => option.resizeWidth),
      [STORED_PHOTO_MAX_EDGE, 1280, 960],
    );
    assert.ok(options.every((option) => option.imageOrientation === 'from-image' && option.resizeQuality === 'high'));
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
    else globalThis.document = previousDocument;
  }
});

test('the gym-logo shrink still keeps a small PNG and encodes a wide one', async () => {
  const encoder = installEncoder({ width: 64, height: 64 }, () => {
    throw new Error('should passthrough');
  });
  try {
    const crest = new File([new Uint8Array(2_000)], 'crest.png', { type: 'image/png' });
    const stored = await shrinkImageFile(crest, {
      maxEdge: 512,
      quality: 0.86,
      passthroughBytes: 180_000,
      mimeFor: (source) => source.type,
    });
    assert.equal(stored, crest);
  } finally {
    encoder.restore();
  }

  const wide = installEncoder({ width: 2000, height: 800 }, (mime) => new Blob([new Uint8Array(400)], { type: mime }));
  try {
    const crest = new File([new Uint8Array(900_000)], 'crest.png', { type: 'image/png' });
    const stored = await shrinkImageFile(crest, {
      maxEdge: 512,
      quality: 0.86,
      passthroughBytes: 180_000,
      mimeFor: (source) =>
        source.type === 'image/png' || source.type === 'image/webp' ? source.type : 'image/jpeg',
    });
    assert.equal(wide.canvas.width, 512);
    assert.equal(wide.canvas.height, 205);
    assert.deepEqual(wide.mimes, ['image/png']);
    assert.deepEqual(wide.qualities, [0.86]);
    assert.equal(stored.type, 'image/png');
    assert.equal(stored.size, 400);
  } finally {
    wide.restore();
  }
});

function jpegBytes(width: number, height: number, orientation?: number): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (orientation) {
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00,
      0x00, orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const length = payload.length + 2;
    parts.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload);
  }
  parts.push(
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  );
  return Uint8Array.from(parts);
}

test('camera JPEG headers report sensor size and EXIF portrait orientation', () => {
  const landscape = imageBoundsFromBytes(jpegBytes(4032, 3024, 1));
  assert.deepEqual(landscape, { width: 4032, height: 3024, orientation: 1 });
  assert.deepEqual(boundsForDecode(landscape!, true), { width: 4032, height: 3024 });

  const portrait = imageBoundsFromBytes(jpegBytes(4032, 3024, 6));
  assert.equal(portrait?.orientation, 6);
  assert.deepEqual(boundsForDecode(portrait!, true), { width: 3024, height: 4032 });
  assert.equal(imageBoundsFromBytes(Uint8Array.from([0, 1, 2, 3])), null);
});

test('a camera JPEG is decoded on its long edge instead of the full sensor bitmap', async () => {
  const landscape = installEncoder({ width: 1920, height: 1440 }, (mime) => new Blob([new Uint8Array(24_000)], { type: mime }));
  try {
    const phone = new File([jpegBytes(4032, 3024, 1)], 'IMG_0001.jpg', { type: '' });
    const stored = await shrinkPhotoForStore(phone);
    assert.deepEqual(landscape.bitmapOptions[0], {
      imageOrientation: 'from-image',
      resizeWidth: 1920,
      resizeQuality: 'high',
    });
    assert.equal(stored.type, 'image/jpeg');
  } finally {
    landscape.restore();
  }

  const portrait = installEncoder({ width: 1440, height: 1920 }, (mime) => new Blob([new Uint8Array(24_000)], { type: mime }));
  try {
    const phone = new File([jpegBytes(4032, 3024, 6)], 'IMG_0002.jpg', { type: 'image/jpeg' });
    await shrinkPhotoForStore(phone);
    assert.deepEqual(portrait.bitmapOptions[0], {
      imageOrientation: 'from-image',
      resizeHeight: 1920,
      resizeQuality: 'high',
    });
  } finally {
    portrait.restore();
  }
});
