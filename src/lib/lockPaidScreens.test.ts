import assert from 'node:assert/strict';
import test from 'node:test';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: () => null,
    length: 0,
    clear() {
      store.clear();
    },
  };
}

const local = memoryStorage();
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

const { lockCoach, isCoachUnlocked, setCoachUnlocked } = await import('./coachUnlock.ts');
const { isProUnlocked, lockPro, setProUnlocked } = await import('./proUnlock.ts');
const { lockStudentEditionBrowser } = await import('./studentUnlock.ts');
const { paidScreenSyncSettled, setPaidCacheLoaderForTests, syncPaidScreensAfterLock } = await import('./paidScreenSync.ts');

const calls: string[] = [];
function fakeCache() {
  calls.length = 0;
  setPaidCacheLoaderForTests(async () => ({
    clearPaidChunkCache: async () => {
      calls.push('clear');
    },
    prefetchStoredPaidChunks: async () => {
      calls.push('resync');
    },
  }));
}

function reset() {
  local.clear();
  session.clear();
}

test('Lock Coach with Pro still open re-syncs the paid screens and keeps Pro', async () => {
  reset();
  setProUnlocked(true);
  setCoachUnlocked(true);
  assert.equal(isProUnlocked(), true);
  fakeCache();
  lockCoach();
  await paidScreenSyncSettled();
  assert.deepEqual(calls, ['resync']);
  assert.equal(isProUnlocked(), true);
});

test('Lock Coach with Pro closed clears the cached paid screens', async () => {
  reset();
  setCoachUnlocked(true);
  lockPro();
  assert.equal(isProUnlocked(), false);
  fakeCache();
  lockCoach();
  await paidScreenSyncSettled();
  assert.deepEqual(calls, ['clear']);
  assert.equal(isCoachUnlocked(), false);
});

test('Lock Student Edition with Pro still open re-syncs and does not wipe Pro screens', async () => {
  reset();
  setProUnlocked(true);
  fakeCache();
  lockStudentEditionBrowser();
  await paidScreenSyncSettled();
  assert.deepEqual(calls, ['resync']);
  assert.equal(isProUnlocked(), true);
});

test('Lock Student Edition with Pro closed clears the cached paid screens', async () => {
  reset();
  lockPro();
  fakeCache();
  lockStudentEditionBrowser();
  await paidScreenSyncSettled();
  assert.deepEqual(calls, ['clear']);
});

test('a cache that cannot load never breaks a lock', async () => {
  reset();
  setPaidCacheLoaderForTests(async () => {
    throw new Error('no Cache Storage');
  });
  await assert.doesNotReject(syncPaidScreensAfterLock());
  assert.doesNotThrow(() => lockCoach());
  assert.doesNotThrow(() => lockStudentEditionBrowser());
  await paidScreenSyncSettled();
  setPaidCacheLoaderForTests(null);
});
