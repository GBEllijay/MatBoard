import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deltaToShowChild,
  forgetCaptureFolder,
  readCaptureFolder,
  releaseInputFiles,
  rememberCaptureFolder,
  takeInputFiles,
  type FileInputLike,
} from './mediaCapture.ts';

function fileList(...files: File[]): FileList {
  return {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    *[Symbol.iterator]() {
      yield* files;
    },
  } as unknown as FileList;
}

describe('camera file handoff', () => {
  it('keeps the camera file itself until the save releases the input', async () => {
    const original = new File([Uint8Array.from([4, 5, 6])], 'IMG.jpg', { type: '' });
    let reads = 0;
    const camera = new Proxy(original, {
      get(target, prop, receiver) {
        if (prop === 'arrayBuffer') {
          return async () => {
            reads += 1;
            return target.arrayBuffer();
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as File;
    const input: FileInputLike = { files: fileList(camera), value: 'IMG.jpg' };
    const files = takeInputFiles(input);

    assert.equal(files[0], camera);
    assert.equal(input.value, 'IMG.jpg');
    assert.equal(reads, 0);
    releaseInputFiles(input);
    assert.equal(input.value, '');
    assert.deepEqual(new Uint8Array(await files[0]!.arrayBuffer()), Uint8Array.from([4, 5, 6]));
    assert.equal(reads, 1);
  });

  it('keeps gallery picks as the same files until the save releases the input', () => {
    const original = new File([Uint8Array.from([1])], 'kid.jpg', { type: 'image/jpeg' });
    const input: FileInputLike = { files: fileList(original), value: 'kid.jpg' };
    const files = takeInputFiles(input);

    assert.equal(files[0], original);
    assert.equal(input.value, 'kid.jpg');
    releaseInputFiles(input);
    assert.equal(input.value, '');
  });

  it('returns nothing when the picker was cancelled', () => {
    const input: FileInputLike = { files: fileList(), value: '' };
    assert.deepEqual(takeInputFiles(input), []);
    assert.equal(input.value, '');
  });
});

describe('capture folder restore', () => {
  it('remembers the folder if the page is discarded during the camera', () => {
    const store = new Map<string, string>();
    const previous = globalThis.sessionStorage;
    globalThis.sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    } as Storage;
    try {
      rememberCaptureFolder('shop');
      assert.equal(readCaptureFolder(), 'shop');
      forgetCaptureFolder();
      assert.equal(readCaptureFolder(), null);
    } finally {
      if (previous === undefined) delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
      else globalThis.sessionStorage = previous;
    }
  });
});

describe('sheet scroll back to a folder', () => {
  it('leaves a folder that is already on screen', () => {
    assert.equal(deltaToShowChild(120, 420, 80, 700), 0);
  });

  it('scrolls a folder below the sheet up into view', () => {
    assert.equal(deltaToShowChild(900, 1300, 100, 800), 512);
  });

  it('pins a tall folder to the top of the sheet instead of the page top', () => {
    assert.equal(deltaToShowChild(640, 1800, 40, 720), 588);
  });
});
