import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { occurrencesOnDate } from './gymCalendar.ts';
import {
  addClass,
  applyScheduleImport,
  getSchedule,
  getScheduleSaveError,
  normalizeSchedule,
  reloadScheduleFromStorage,
  SCHEDULE_SAVE_FAILED,
  STORAGE_KEY,
  updateClass,
} from './scheduleStore.ts';
import { readScheduleSyncMeta } from './scheduleSyncDoc.ts';

function memoryStorage() {
  const bag = new Map<string, string>();
  let refuse = false;
  let drop = false;
  return {
    bag,
    refuseWrites(on: boolean) {
      refuse = on;
    },
    dropWrites(on: boolean) {
      drop = on;
    },
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuse) throw new DOMException('full', 'QuotaExceededError');
      if (drop) return;
      bag.set(key, String(value));
    },
    removeItem: (key: string) => {
      bag.delete(key);
    },
    clear: () => bag.clear(),
    key: (index: number) => [...bag.keys()][index] ?? null,
    get length() {
      return bag.size;
    },
  };
}

function withStorage(run: (storage: ReturnType<typeof memoryStorage>) => void): void {
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  try {
    applyScheduleImport({ classes: [], specials: [], title: 'Sample Gym', qrUrl: '', notes: '', template: 'week', castEnabled: true });
    run(storage);
  } finally {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

const savedLevel = (id: string) =>
  normalizeSchedule(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) ?? '{}')).classes.find((row) => row.id === id)?.level;

describe('Class Schedule level persistence', () => {
  it('a level picked in another tab or on the gym TV window survives an edit from a window holding an older copy', () => {
    withStorage((storage) => {
      const kids = addClass('tue', '17:00', 'Advanced Kids', 'MAT 2', 'Grey and White');
      const tiny = addClass('tue', '17:00', 'Tiny Champions', 'MAT 1', '3-5 Years Old');
      assert.ok(kids && tiny);
      // Another tab saves a level. This window never got a storage event.
      const other = JSON.parse(storage.getItem(STORAGE_KEY)!);
      other.classes.find((row: { id: string }) => row.id === kids.id).level = 'kids-advanced';
      storage.setItem(STORAGE_KEY, JSON.stringify(other));
      // This window edits another class from its older copy.
      updateClass(tiny.id, { subtitle: '3-5 years old' });
      assert.equal(savedLevel(kids.id), 'kids-advanced', 'the older copy wrote over the saved level');
      assert.equal(getSchedule().classes.find((row) => row.id === kids.id)?.level, 'kids-advanced');
      assert.equal(normalizeSchedule(JSON.parse(storage.getItem(STORAGE_KEY)!)).classes.find((row) => row.id === tiny.id)?.subtitle, '3-5 years old');
    });
  });

  it('set level, save, rehydrate: the level is still there and the edit is stamped for Cloud sync', () => {
    withStorage((storage) => {
      const bluegi = addClass('mon', '18:00', 'Blue Belt Gi', 'MAT 1', 'Blue belt & up');
      assert.ok(bluegi);
      updateClass(bluegi.id, { level: 'advanced' });
      assert.equal(savedLevel(bluegi.id), 'advanced');
      // Rehydrate the way a reload does.
      storage.setItem(STORAGE_KEY, storage.getItem(STORAGE_KEY)!.replace('"Blue belt & up"', '"Blue belt and up"'));
      reloadScheduleFromStorage();
      const row = getSchedule().classes.find((item) => item.id === bluegi.id);
      assert.equal(row?.level, 'advanced');
      assert.equal(row?.subtitle, 'Blue belt and up');
      assert.ok(readScheduleSyncMeta(storage).updatedAt > 0);
      assert.equal(getScheduleSaveError(), null);
    });
  });

  it('reports a level change the browser refused to save instead of showing it as saved', () => {
    withStorage((storage) => {
      const row = addClass('wed', '19:00', 'Expert', 'MAT 1', '');
      assert.ok(row);
      storage.refuseWrites(true);
      updateClass(row.id, { level: 'expert' });
      assert.equal(getScheduleSaveError(), SCHEDULE_SAVE_FAILED);
      assert.equal(savedLevel(row.id), 'none');
      storage.refuseWrites(false);
      storage.dropWrites(true);
      updateClass(row.id, { level: 'expert' });
      assert.equal(getScheduleSaveError(), SCHEDULE_SAVE_FAILED, 'a write that did not stick is reported too');
      storage.dropWrites(false);
      updateClass(row.id, { level: 'expert' });
      assert.equal(getScheduleSaveError(), null);
      assert.equal(savedLevel(row.id), 'expert');
    });
  });

  it('reads the level from older or hand-made field names instead of dropping it', () => {
    const board = normalizeSchedule({
      classes: [
        { id: 'a', day: 'mon', time: '17:00', title: 'Fundamentals', classLevel: 'Fundamentals' },
        { id: 'b', day: 'mon', time: '18:00', title: 'Kids', beltLevel: 'Kids Advanced' },
        { id: 'c', day: 'mon', time: '19:00', title: 'Open Mat', level: '' },
        { id: 'd', day: 'mon', time: '20:00', title: 'Blue Belt Gi', level: 'advanced', belt: 'expert' },
      ],
    });
    assert.deepEqual(
      board.classes.map((row) => [row.id, row.level]),
      [
        ['a', 'fundamentals'],
        ['b', 'kids-advanced'],
        ['c', 'none'],
        ['d', 'advanced'],
      ],
    );
  });

  it('student calendar occurrences carry the class level', () => {
    const board = normalizeSchedule({
      classes: [
        { id: 'bluegi', day: 'mon', time: '18:00', title: 'Blue Belt Gi', level: 'advanced' },
        { id: 'open', day: 'mon', time: '19:00', title: 'Open Mat' },
      ],
    });
    // 2026-11-23 is a Monday.
    const rows = occurrencesOnDate(board, '2026-11-23');
    assert.deepEqual(
      rows.map((row) => [row.slotId, row.level]),
      [
        ['bluegi', 'advanced'],
        ['open', 'none'],
      ],
    );
  });
});
