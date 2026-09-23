import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyRankingDraft,
  normalizeRankingLibrary,
  rankingFromDraft,
  removeRankingFile,
  saveRankingFile,
  RANKING_STORAGE_KEY,
} from './rankingStore.ts';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  },
  configurable: true,
});

test('a result file keeps name, date, division, and placements', () => {
  const file = rankingFromDraft({
    name: 'Spring In-House',
    date: '2026-04-12',
    division: 'Blue Belt',
    rows: [
      { id: 'p1', place: 2, name: 'Blair', result: 'Lost final' },
      { id: 'p2', place: 1, name: 'Alex Rivera', result: '3-0' },
      { id: 'p3', place: 1, name: '', result: 'skip' },
    ],
  });
  assert.ok(file);
  assert.equal(file.name, 'Spring In-House');
  assert.equal(file.date, '2026-04-12');
  assert.equal(file.division, 'Blue Belt');
  assert.deepEqual(
    file.rows.map((row) => [row.place, row.name, row.result]),
    [
      [1, 'Alex Rivera', '3-0'],
      [2, 'Blair', 'Lost final'],
    ],
  );
  assert.equal(rankingFromDraft(emptyRankingDraft()), null);
});

test('result files persist on this device and drop when removed', () => {
  localStorage.removeItem(RANKING_STORAGE_KEY);
  const saved = saveRankingFile({
    name: 'Kids Gi',
    date: '2026-05-01',
    division: 'Grey',
    rows: [{ id: 'p1', place: 1, name: 'Sam', result: 'Won final' }],
  });
  assert.ok(saved);
  const stored = normalizeRankingLibrary(JSON.parse(localStorage.getItem(RANKING_STORAGE_KEY) ?? '{}'));
  assert.equal(stored.files[0]?.name, 'Kids Gi');
  assert.equal(stored.files[0]?.rows[0]?.result, 'Won final');
  removeRankingFile(saved.id);
  const after = normalizeRankingLibrary(JSON.parse(localStorage.getItem(RANKING_STORAGE_KEY) ?? '{}'));
  assert.equal(after.files.length, 0);
});
