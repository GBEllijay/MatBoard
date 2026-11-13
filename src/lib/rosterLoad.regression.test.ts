import assert from 'node:assert/strict';
import { test } from 'node:test';

const data: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => data[key] ?? null,
  setItem: (key: string, value: string) => {
    data[key] = value;
  },
  removeItem: (key: string) => {
    delete data[key];
  },
};
data['matboard.roster.v1'] = JSON.stringify({
  version: 1,
  students: [
    { id: 'a', name: 'Amy', belt: 'white', division: 'Adult' },
    { id: 'm', name: 'Marty', belt: 'white', division: 'Adult', cardPhotoId: 'photo-1' },
    { id: 'z', name: 'Zed', belt: 'blue', division: 'Adult', archivedAt: '2026-11-01', archivedReason: 'moved' },
  ],
});

test('a card with a photo id or an archive date does not blank the roster on launch', async () => {
  const store = await import('./rosterStore.ts');
  const names = store.getRoster().students.map((row) => row.name).sort();
  assert.deepEqual(names, ['Amy', 'Marty', 'Zed']);
  assert.equal(store.getRoster().students.find((row) => row.id === 'm')?.cardPhotoId, 'photo-1');
});

test('one unreadable card is skipped and the rest still load', async () => {
  const store = await import('./rosterStore.ts');
  const bad = { id: 'x', name: 'Bad', belt: 'white', division: 'Adult' };
  Object.defineProperty(bad, 'photo', {
    enumerable: true,
    get() {
      throw new Error('bad card');
    },
  });
  const roster = store.normalizeRoster({ version: 1, students: [{ id: 'a', name: 'Amy', belt: 'white', division: 'Adult' }, bad] });
  assert.deepEqual(
    roster.students.map((row) => row.name),
    ['Amy'],
  );
});
