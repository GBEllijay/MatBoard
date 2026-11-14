import assert from 'node:assert/strict';
import test from 'node:test';
import { readRestoreSessionEmail, rememberRestoreSessionEmail, RESTORE_SESSION_EMAIL_KEY } from './restoreSessionEmail.ts';

const store = new Map<string, string>();
const local = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear() {
    store.clear();
  },
  key: () => null,
  length: 0,
};
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });

test('rememberRestoreSessionEmail keeps a valid address and ignores junk', () => {
  store.clear();
  rememberRestoreSessionEmail('not-an-email');
  assert.equal(readRestoreSessionEmail(), '');
  rememberRestoreSessionEmail('  buyer@gym.test ');
  assert.equal(readRestoreSessionEmail(), 'buyer@gym.test');
  assert.equal(store.get(RESTORE_SESSION_EMAIL_KEY), 'buyer@gym.test');
});
