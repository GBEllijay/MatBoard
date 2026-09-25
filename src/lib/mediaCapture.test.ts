import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  copyDeviceFiles,
  deltaToShowChild,
  forgetCaptureFolder,
  readCaptureFolder,
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
  it('copies capture bytes before the input is cleared', async () => {
    const original = new File([Uint8Array.from([4, 5, 6])], 'IMG.jpg', { type: '' });
    const input: FileInputLike = { files: fileList(original), value: 'IMG.jpg' };
    const files = await takeInputFiles(input, true);

    assert.equal(input.value, '');
    assert.notEqual(files[0], original);
    assert.equal(files[0]?.name, 'IMG.jpg');
    assert.equal(files[0]?.type, '');
    assert.deepEqual(new Uint8Array(await files[0]!.arrayBuffer()), Uint8Array.from([4, 5, 6]));
    const copied = await copyDeviceFiles([original]);
    assert.deepEqual(new Uint8Array(await copied[0]!.arrayBuffer()), Uint8Array.from([4, 5, 6]));
  });

  it('keeps gallery picks as the same files and still clears the input', async () => {
    const original = new File([Uint8Array.from([1])], 'kid.jpg', { type: 'image/jpeg' });
    const input: FileInputLike = { files: fileList(original), value: 'kid.jpg' };
    const files = await takeInputFiles(input, false);

    assert.equal(files[0], original);
    assert.equal(input.value, '');
  });

  it('returns nothing when the picker was cancelled', async () => {
    const input: FileInputLike = { files: fileList(), value: '' };
    assert.deepEqual(await takeInputFiles(input, true), []);
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
