import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleWeekClasses, sampleWeekSpecials } from './gymCalendar.ts';
import {
  PUBLISHED_SCHEDULE_CACHE_KEY,
  fetchPublishedSchedule,
  publishGymSchedule,
  readLocalGymSchedule,
  resolveGymSchedule,
  scheduleForPublish,
  SCHEDULE_STORAGE_KEY,
  writePublishedScheduleCache,
} from './gymSchedulePublish.ts';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
};

test('scheduleForPublish keeps slots and specials and turns off the TV cast flag', () => {
  const published = scheduleForPublish({
    version: 1,
    title: 'Riverside Academy',
    qrUrl: 'https://example.com/schedule',
    notes: 'Park in the back',
    template: 'week',
    castEnabled: true,
    classes: sampleWeekClasses(),
    specials: sampleWeekSpecials(),
  });
  assert.equal(published.castEnabled, false);
  assert.ok(published.classes.length > 0);
  assert.equal(published.title, 'Riverside Academy');
});

test('resolveGymSchedule prefers a published board, then a cache, then this device', () => {
  const storage = memory();
  storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ version: 1, title: 'Local', classes: sampleWeekClasses(), specials: [] }));
  assert.equal(resolveGymSchedule({ storage }).source, 'local');
  writePublishedScheduleCache(storage, scheduleForPublish({
    version: 1,
    title: 'Cached',
    qrUrl: '',
    notes: '',
    template: 'week',
    castEnabled: false,
    classes: sampleWeekClasses(),
    specials: [],
  }), 10);
  assert.equal(resolveGymSchedule({ storage }).source, 'cache');
  assert.equal(resolveGymSchedule({ storage }).schedule?.title, 'Cached');
  const published = scheduleForPublish({
    version: 1,
    title: 'Live',
    qrUrl: '',
    notes: '',
    template: 'week',
    castEnabled: false,
    classes: sampleWeekClasses(),
    specials: [],
  });
  const live = resolveGymSchedule({ published, publishedAt: 20, available: true, storage });
  assert.equal(live.source, 'published');
  assert.equal(live.schedule?.title, 'Live');
});

test('fetchPublishedSchedule falls back when the table is missing', async () => {
  const storage = memory();
  storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ version: 1, title: 'Local board', classes: sampleWeekClasses(), specials: [] }));
  const result = await fetchPublishedSchedule({
    storage,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, available: false, schedule: null }), { status: 200 }),
  });
  assert.equal(result.available, false);
  assert.equal(result.source, 'local');
  assert.equal(result.schedule?.title, 'Local board');
});

test('publishGymSchedule reports a missing table without throwing', async () => {
  const result = await publishGymSchedule(
    { version: 1, title: 'Riverside', qrUrl: '', notes: '', template: 'week', castEnabled: false, classes: sampleWeekClasses(), specials: [] },
    { fetchImpl: async () => new Response(JSON.stringify({ ok: false, available: false }), { status: 200 }) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.available, false);
});

test('readLocalGymSchedule returns null for an empty board', () => {
  const storage = memory();
  storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ version: 1, classes: [], specials: [] }));
  assert.equal(readLocalGymSchedule(storage), null);
  assert.equal(storage.getItem(PUBLISHED_SCHEDULE_CACHE_KEY), null);
});
