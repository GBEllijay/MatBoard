import assert from 'node:assert/strict';
import test from 'node:test';
import { GYM_NAME_STORAGE_KEY, readGymName, writeGymName } from './gymName.ts';

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

test('gym name key starts empty', () => {
  localStorage.removeItem(GYM_NAME_STORAGE_KEY);
  assert.equal(GYM_NAME_STORAGE_KEY, 'matboard.gymName.v1');
  assert.equal(readGymName(), '');
});

test('a saved gym name round-trips from the paired key', () => {
  writeGymName('  Alliance  ');
  assert.equal(readGymName(), 'Alliance');
  const raw = JSON.parse(localStorage.getItem(GYM_NAME_STORAGE_KEY) ?? '');
  assert.equal(raw.version, 1);
  assert.equal(raw.name, 'Alliance');
});

test('a blank gym name clears the key', () => {
  writeGymName('Atos');
  writeGymName('   ');
  assert.equal(readGymName(), '');
  assert.equal(localStorage.getItem(GYM_NAME_STORAGE_KEY), null);
});

test('junk in the gym name key is ignored', () => {
  localStorage.setItem(GYM_NAME_STORAGE_KEY, '{');
  assert.equal(readGymName(), '');
  localStorage.setItem(GYM_NAME_STORAGE_KEY, JSON.stringify({ version: 2, name: 'Checkmat' }));
  assert.equal(readGymName(), '');
});

test('gym name clips to 80 characters', () => {
  writeGymName('A'.repeat(120));
  assert.equal(readGymName().length, 80);
});
