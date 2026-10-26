import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_KEY, getRoster } from './rosterStore.ts';
import {
  WHITE_ROSTER_STORAGE_KEY,
  addWhiteMatchName,
  getWhiteRoster,
  hydrateWhiteRoster,
  normalizeWhiteRoster,
  removeWhiteMatchName,
  resetWhiteRoster,
  searchWhiteMatchNames,
  updateWhiteMatchName,
  whiteMatchPrefill,
} from './whiteRosterStore.ts';

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

test('white match names start empty and use their own key', () => {
  resetWhiteRoster();
  assert.equal(WHITE_ROSTER_STORAGE_KEY, 'matboard.whiteRoster.v1');
  assert.notEqual(WHITE_ROSTER_STORAGE_KEY, STORAGE_KEY);
  assert.equal(localStorage.getItem(WHITE_ROSTER_STORAGE_KEY), null);
  assert.deepEqual(getWhiteRoster().names, []);
});

test('a name and a known belt save, and aliases canonicalize', () => {
  resetWhiteRoster();
  assert.equal(addWhiteMatchName('  ', 'Blue'), null);
  assert.equal(addWhiteMatchName('Sam', ''), null);
  assert.equal(addWhiteMatchName('Sam', 'coral'), null);
  const added = addWhiteMatchName('  sam rivera  ', 'bluebelt');
  assert.ok(added);
  assert.equal(added.name, 'sam rivera');
  assert.equal(added.belt, 'Blue');
  assert.deepEqual(Object.keys(added).sort(), ['belt', 'id', 'name']);
  const raw = JSON.parse(localStorage.getItem(WHITE_ROSTER_STORAGE_KEY) ?? '');
  assert.equal(raw.version, 1);
  assert.equal(raw.names.length, 1);
  assert.deepEqual(Object.keys(raw.names[0]).sort(), ['belt', 'id', 'name']);
});

test('the same name updates its belt instead of duplicating', () => {
  resetWhiteRoster();
  const first = addWhiteMatchName('Alex', 'White');
  const second = addWhiteMatchName('alex', 'Purple');
  assert.ok(first);
  assert.ok(second);
  assert.equal(second.id, first.id);
  assert.equal(second.belt, 'Purple');
  assert.equal(getWhiteRoster().names.length, 1);
});

test('edit and remove stay on this list', () => {
  resetWhiteRoster();
  const sam = addWhiteMatchName('Sam', 'Blue');
  const pat = addWhiteMatchName('Pat', 'Green');
  assert.ok(sam);
  assert.ok(pat);
  assert.equal(updateWhiteMatchName(sam.id, 'Pat', 'Brown'), null);
  assert.equal(getWhiteRoster().names.find((row) => row.id === sam.id)?.name, 'Sam');
  const renamed = updateWhiteMatchName(sam.id, 'Sam Lee', 'Brown');
  assert.equal(renamed?.name, 'Sam Lee');
  assert.equal(renamed?.belt, 'Brown');
  removeWhiteMatchName(pat.id);
  assert.deepEqual(
    getWhiteRoster().names.map((row) => row.name),
    ['Sam Lee'],
  );
});

test('search matches name or belt', () => {
  resetWhiteRoster();
  addWhiteMatchName('Sam', 'Blue');
  addWhiteMatchName('Pat', 'Green');
  assert.deepEqual(
    searchWhiteMatchNames(getWhiteRoster().names, 'gre').map((row) => row.name),
    ['Pat'],
  );
  assert.equal(searchWhiteMatchNames(getWhiteRoster().names, '').length, 2);
});

test('a saved name prefills belt only', () => {
  resetWhiteRoster();
  const added = addWhiteMatchName('Sam', 'Grey');
  assert.ok(added);
  assert.deepEqual(whiteMatchPrefill(added), {
    name: 'Sam',
    belt: 'Grey',
    gym: '',
    division: '',
  });
});

test('hydration keeps name and belt and drops every other field', () => {
  resetWhiteRoster();
  localStorage.setItem(
    WHITE_ROSTER_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      names: [
        {
          id: 'w-1',
          name: '  Pat  ',
          belt: 'gray',
          gym: 'GB Ellijay',
          division: 'Adult',
          note: 'knee',
          lastPromotion: '2026-01-01',
          photo: 'data:image/jpeg;base64,aaaa',
          checkedIn: true,
        },
        { id: 'w-2', name: 'Nope', belt: 'Coral' },
      ],
    }),
  );
  hydrateWhiteRoster();
  assert.deepEqual(getWhiteRoster().names, [{ id: 'w-1', name: 'Pat', belt: 'Grey' }]);
  assert.equal('note' in getWhiteRoster().names[0], false);
  assert.equal('gym' in getWhiteRoster().names[0], false);
});

test('junk in the white key is ignored', () => {
  localStorage.setItem(WHITE_ROSTER_STORAGE_KEY, '{');
  hydrateWhiteRoster();
  assert.deepEqual(getWhiteRoster().names, []);
  assert.deepEqual(normalizeWhiteRoster({ names: 'nope' }).names, []);
});

test('saving a white name does not write the competitor roster', () => {
  resetWhiteRoster();
  const before = localStorage.getItem(STORAGE_KEY);
  const rosterIds = new Set(getRoster().students.map((row) => row.id));
  const added = addWhiteMatchName('White Only', 'Black');
  assert.ok(added);
  assert.equal(localStorage.getItem(STORAGE_KEY), before);
  assert.equal(rosterIds.has(added.id), false);
  assert.equal(
    getRoster().students.some((row) => row.id === added.id),
    false,
  );
});
