import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADVANTAGE_MARK_SRC,
  GYM_LOGO_STORAGE_KEY,
  clearGymLogo,
  readGymLogo,
  resolveScheduleLogo,
  saveGymLogoFile,
  writeGymLogo,
} from './gymLogo.ts';

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
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

test('gym logo key is empty until a photo is saved', () => {
  clearGymLogo();
  assert.equal(GYM_LOGO_STORAGE_KEY, 'matboard.gymLogo.v1');
  assert.equal(readGymLogo(), null);
  assert.equal(localStorage.getItem(GYM_LOGO_STORAGE_KEY), null);
});

test('a saved gym logo round-trips from the same localStorage key', async () => {
  clearGymLogo();
  const file = new File([TINY_PNG], 'crest.png', { type: 'image/png' });
  const saved = await saveGymLogoFile(file);
  assert.match(saved, /^data:image\/png;base64,/);
  assert.equal(readGymLogo(), saved);
  const raw = JSON.parse(localStorage.getItem(GYM_LOGO_STORAGE_KEY) ?? '');
  assert.equal(raw.version, 1);
  assert.equal(raw.dataUrl, saved);
});

test('clear removes the default gym logo', () => {
  writeGymLogo('data:image/png;base64,AAAA');
  assert.equal(readGymLogo(), 'data:image/png;base64,AAAA');
  clearGymLogo();
  assert.equal(readGymLogo(), null);
});

test('junk in the gym logo key is ignored', () => {
  localStorage.setItem(GYM_LOGO_STORAGE_KEY, '{');
  assert.equal(readGymLogo(), null);
  localStorage.setItem(GYM_LOGO_STORAGE_KEY, JSON.stringify({ version: 1, dataUrl: 'https://example.com/logo.png' }));
  assert.equal(readGymLogo(), null);
});

test('the schedule board prefers the Media Console logo, then a board picture, then Advantage', () => {
  assert.equal(resolveScheduleLogo('data:image/png;base64,GYM', 'blob:board'), 'data:image/png;base64,GYM');
  assert.equal(resolveScheduleLogo('', 'blob:board'), 'blob:board');
  assert.equal(resolveScheduleLogo(null, ''), ADVANTAGE_MARK_SRC);
  assert.equal(ADVANTAGE_MARK_SRC, '/advantage-icon.png');
});

test('a non-image is not stored as the gym logo', async () => {
  clearGymLogo();
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  await assert.rejects(saveGymLogoFile(file), /not-image/);
  assert.equal(readGymLogo(), null);
});
