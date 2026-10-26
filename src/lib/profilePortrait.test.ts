import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearProfilePortrait,
  portraitFromFile,
  readProfilePortrait,
  saveProfilePortrait,
  writeProfilePortraitSync,
  type PortraitMirror,
} from './profilePortrait.ts';

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

test('a profile photo rejects a file that is not a picture', async () => {
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  await assert.rejects(portraitFromFile(file), /not-image/);
});
