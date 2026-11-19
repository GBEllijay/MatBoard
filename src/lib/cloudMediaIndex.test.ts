/**
 * Advantage Cloud media index: the details beside each file in the networked
 * Gallery, Pro Shop, and Events folders. Field-level merges, safe paths, events.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_EVENTS_MAX,
  applyCloudIndexPatch,
  cloudIndexKey,
  emptyCloudIndex,
  normalizeCloudIndex,
} from './cloudMediaIndex.ts';

const now = new Date('2026-11-19T21:30:00.000Z');

test('index key lives beside the folders, one per license and folder, never inside a media folder', () => {
  assert.equal(cloudIndexKey('owner-test', 'pro-shop'), 'groups/owner-test/media-index/pro-shop.json');
  assert.equal(cloudIndexKey('owner-test', 'events'), 'groups/owner-test/media-index/events.json');
  assert.equal(cloudIndexKey('owner-test', 'schedule'), null);
  assert.equal(cloudIndexKey('../x', 'events'), null);
});

test('normalize keeps only this folder\'s fields and paths, and survives junk', () => {
  const raw = {
    items: {
      'pro-shop/gi-white.jpg': { label: ' White gi $120 ', buyUrl: 'shop.example.com/gi', startsSlide: false, qrLinks: ['x.com'], caption: 'no' },
      'events/elsewhere.jpg': { label: 'wrong folder' },
      '../../secrets': { label: 'nope' },
    },
    events: [{ id: 'ev1', title: 'should not stay on pro-shop' }],
    migrated: { 'dev:abc': 'pro-shop/gi-white.jpg', 'bad key': 'pro-shop/gi-white.jpg' },
  };
  const index = normalizeCloudIndex('pro-shop', raw);
  assert.deepEqual(Object.keys(index.items), ['pro-shop/gi-white.jpg']);
  assert.deepEqual(index.items['pro-shop/gi-white.jpg'], { label: 'White gi $120', buyUrl: 'https://shop.example.com/gi', startsSlide: false });
  assert.deepEqual(index.events, []);
  assert.deepEqual(index.migrated, { 'dev:abc': 'pro-shop/gi-white.jpg' });
  assert.deepEqual(normalizeCloudIndex('events', 'not json'), emptyCloudIndex('events'));
});

test('patch merges field by field: one device\'s rename never wipes another device\'s link', () => {
  let index = emptyCloudIndex('pro-shop');
  const a = applyCloudIndexPatch(index, { items: { 'pro-shop/rash.jpg': { label: 'Rash guard', buyUrl: 'https://buy.example/rash' } } }, now);
  assert.ok(a.ok);
  index = a.index;
  const b = applyCloudIndexPatch(index, { items: { 'pro-shop/rash.jpg': { label: 'Rash guard $45' } } }, now);
  assert.ok(b.ok);
  assert.deepEqual(b.index.items['pro-shop/rash.jpg'], { label: 'Rash guard $45', buyUrl: 'https://buy.example/rash' });
  assert.equal(b.index.updatedAt, now.toISOString());
  const bad = applyCloudIndexPatch(index, { items: { 'gallery/approved/2026-11-19/x.jpg': { label: 'x' } } }, now);
  assert.equal(bad.ok, false);
});

test('events: upsert, group files, drop a file everywhere when its details are removed', () => {
  const start = emptyCloudIndex('events');
  const made = applyCloudIndexPatch(
    start,
    {
      items: { 'events/flyer.png': { qrLinks: ['https://reg.example/open', 'https://reg.example/open', 'tickets.example'] } },
      events: { upsert: [{ id: 'ev-open', title: 'Open Mat Seminar', date: '2026-12-05', qrLinks: ['reg.example'], items: ['events/flyer.png', 'events/sponsor.png', 'pro-shop/x.jpg'] }] },
    },
    now,
  );
  assert.ok(made.ok);
  assert.deepEqual(made.index.items['events/flyer.png'].qrLinks, ['https://reg.example/open', 'https://tickets.example']);
  assert.deepEqual(made.index.events[0].items, ['events/flyer.png', 'events/sponsor.png']);
  assert.equal(made.index.events[0].title, 'Open Mat Seminar');
  const renamed = applyCloudIndexPatch(made.index, { events: { upsert: [{ id: 'ev-open', title: 'Open Mat + Seminar' }] } }, now);
  assert.ok(renamed.ok);
  assert.deepEqual(renamed.index.events[0].items, ['events/flyer.png', 'events/sponsor.png'], 'a title change keeps the files');
  const dropped = applyCloudIndexPatch(renamed.index, { items: { 'events/sponsor.png': null } }, now);
  assert.ok(dropped.ok);
  assert.deepEqual(dropped.index.events[0].items, ['events/flyer.png']);
  const removed = applyCloudIndexPatch(dropped.index, { events: { remove: ['ev-open'] } }, now);
  assert.ok(removed.ok);
  assert.deepEqual(removed.index.events, []);
  assert.ok(removed.index.items['events/flyer.png'], 'removing an event never removes its files');
  const notEvents = applyCloudIndexPatch(emptyCloudIndex('pro-shop'), { events: { upsert: [{ id: 'x' }] } }, now);
  assert.equal(notEvents.ok, false);
});

test('events are capped and bad ids are refused', () => {
  let index = emptyCloudIndex('events');
  for (let i = 0; i < CLOUD_EVENTS_MAX; i += 1) {
    const next = applyCloudIndexPatch(index, { events: { upsert: [{ id: `ev${i}`, title: `E${i}` }] } }, now);
    assert.ok(next.ok);
    index = next.index;
  }
  assert.equal(applyCloudIndexPatch(index, { events: { upsert: [{ id: 'one-more' }] } }, now).ok, false);
  assert.equal(applyCloudIndexPatch(emptyCloudIndex('events'), { events: { upsert: [{ id: 'bad id!' }] } }, now).ok, false);
});
