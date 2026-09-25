import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVICE_STORAGE_FULL_NOTE,
  LARGE_MEDIA_BYTES,
  StorageQuotaError,
  assertOriginRoom,
  isStorageQuotaError,
  originCanStore,
  quotaAddNote,
} from './storageQuota.ts';

test('quota errors are the Safari memory dialog, not a random failure', () => {
  assert.equal(isStorageQuotaError(null), false);
  assert.equal(isStorageQuotaError(new Error('network down')), false);
  assert.equal(isStorageQuotaError(new DOMException('Transaction aborted', 'AbortError')), false);
  assert.equal(isStorageQuotaError(new DOMException('The quota has been exceeded.', 'QuotaExceededError')), true);
  assert.equal(isStorageQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(isStorageQuotaError({ code: 22 }), true);
  assert.equal(isStorageQuotaError({ code: 1014 }), true);
  assert.equal(isStorageQuotaError({ message: 'not enough memory on phone' }), true);
  assert.equal(quotaAddNote(new Error('nope')), null);
  assert.equal(quotaAddNote(new StorageQuotaError(0)), DEVICE_STORAGE_FULL_NOTE);
  assert.equal(quotaAddNote(new StorageQuotaError(1)), `Saved 1. ${DEVICE_STORAGE_FULL_NOTE}`);
  assert.match(DEVICE_STORAGE_FULL_NOTE, /training clip/);
  assert.equal(DEVICE_STORAGE_FULL_NOTE.includes('memory'), false);
  assert.equal(LARGE_MEDIA_BYTES, 40 * 1024 * 1024);
});

test('storage estimate blocks a file larger than the room left and allows a smaller one', async () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        estimate: async () => ({ quota: 1_000, usage: 800 }),
      },
    },
  });
  try {
    assert.equal(await originCanStore(300), false);
    assert.equal(await originCanStore(200), true);
    await assert.rejects(assertOriginRoom(300), (error: unknown) => {
      assert.ok(error instanceof StorageQuotaError);
      assert.equal(error.saved, 0);
      return true;
    });
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});

test('a missing storage estimate does not invent a cap', async () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  });
  try {
    assert.equal(await originCanStore(9_000_000_000), null);
    await assert.doesNotReject(assertOriginRoom(9_000_000_000));
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});
