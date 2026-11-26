/**
 * Networked Media Console folders: which store backs the top folders, how Cloud
 * files become console rows, events on the TV, and the one-time device send.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { listCloudFolder, type CloudFolderListing } from './advantageCloudFolders.ts';
import { applyCloudIndexPatch, emptyCloudIndex, type CloudIndexPatch, type CloudMediaIndex } from './cloudMediaIndex.ts';
import {
  CLOUD_BACKED_NOTE,
  DEVICE_ONLY_NOTE,
  DEVICE_ONLY_SIGN_IN_NOTE,
  addToEventPatch,
  chooseMediaBacking,
  cloudRowsForFolder,
  folderBackingNote,
  mergeBackedRows,
  migrationFileName,
  planDeviceMigration,
  runDeviceMigration,
  uniqueCloudFileName,
  type MigrationUpload,
  folderCopyFor,
} from './cloudMediaFolders.ts';
import { playableItems, type FolderId, type StoredPhoto } from './photoStore.ts';

function listing(folder: CloudFolderListing['folder'], rows: { path: string; name?: string; kind?: 'photo' | 'video' | 'file'; mime?: string }[]): CloudFolderListing {
  return {
    folder,
    canUpload: true,
    canDelete: true,
    uploadLane: 'approved',
    items: rows.map((row) => ({
      provider: 'advantage-cloud',
      source: 'gallery',
      lane: 'approved',
      folder,
      path: row.path,
      name: row.name ?? row.path.split('/').pop()!,
      dateKey: '',
      mime: row.mime ?? (row.kind === 'video' ? 'video/mp4' : row.kind === 'file' ? 'application/pdf' : 'image/jpeg'),
      size: 4,
      kind: row.kind ?? 'photo',
    })),
  };
}

function device(id: string, folderId: FolderId, extra: Partial<StoredPhoto> = {}): StoredPhoto {
  return {
    id,
    label: `Card ${id}`,
    sortOrder: 0,
    addedAt: 1,
    folderId,
    playEnabled: true,
    mime: 'image/jpeg',
    blob: new Blob([`bytes-${id}`]),
    buyUrl: '',
    startsSlide: true,
    qrLinks: [],
    driveFileId: null,
    caption: '',
    schedule: 'always',
    showDate: '',
    techniqueClipId: '',
    loopSec: 0,
    ...extra,
  };
}

test('backing: Cloud only with Cloud on, a Cloud sign-in on this device, and an answer', () => {
  assert.equal(chooseMediaBacking({ cloudEntitled: true, signedIn: true, cloudAnswered: true }), 'cloud');
  assert.equal(chooseMediaBacking({ cloudEntitled: true, signedIn: false, cloudAnswered: false }), 'device');
  assert.equal(chooseMediaBacking({ cloudEntitled: true, signedIn: true, cloudAnswered: false }), 'device');
  assert.equal(chooseMediaBacking({ cloudEntitled: false, signedIn: true, cloudAnswered: true }), 'device');
  assert.equal(folderBackingNote({ backing: 'cloud', cloudEntitled: true }), CLOUD_BACKED_NOTE);
  assert.equal(folderBackingNote({ backing: 'device', cloudEntitled: true }), DEVICE_ONLY_SIGN_IN_NOTE);
  assert.equal(folderBackingNote({ backing: 'device', cloudEntitled: false }), DEVICE_ONLY_NOTE);
});

test('Cloud Pro Shop rows carry name, price text, buy link, and slide grouping from the index', () => {
  const index = applyCloudIndexPatch(
    emptyCloudIndex('pro-shop'),
    { items: { 'pro-shop/gi.jpg': { label: 'Advantage gi $140 — A2, white', buyUrl: 'https://buy.example/gi', startsSlide: false, sortOrder: 1 } } },
    new Date(),
  );
  assert.ok(index.ok);
  const rows = cloudRowsForFolder({
    folderId: 'shop',
    listing: listing('pro-shop', [{ path: 'pro-shop/gi.jpg' }, { path: 'pro-shop/Rash-guard.jpg' }, { path: 'pro-shop/prices.pdf', kind: 'file' }]),
    index: index.index,
    canEdit: true,
  });
  assert.equal(rows.length, 2, 'PDFs stay in the Cloud folder view, not the TV');
  const gi = rows.find((row) => row.cloudPath === 'pro-shop/gi.jpg')!;
  assert.equal(gi.label, 'Advantage gi $140 — A2, white');
  assert.equal(gi.buyUrl, 'https://buy.example/gi');
  assert.equal(gi.startsSlide, false);
  assert.equal(gi.folderId, 'shop');
  assert.equal(rows.find((row) => row.cloudPath === 'pro-shop/Rash-guard.jpg')!.label, 'Rash guard');
});

test('Cloud Events play grouped by event, titled, with the event QR codes unless the photo has its own', () => {
  const index: CloudMediaIndex = {
    ...emptyCloudIndex('events'),
    items: { 'events/own-qr.png': { qrLinks: ['https://own.example'] } },
    events: [{ id: 'ev1', title: 'Winter Open', date: '2026-12-12', qrLinks: ['https://reg.example'], items: ['events/sponsor.png', 'events/own-qr.png'], order: 0 }],
  };
  const rows = cloudRowsForFolder({
    folderId: 'events',
    listing: listing('events', [{ path: 'events/loose.png' }, { path: 'events/own-qr.png' }, { path: 'events/sponsor.png' }]),
    index,
    canEdit: true,
  });
  assert.deepEqual(rows.map((row) => row.cloudPath), ['events/sponsor.png', 'events/own-qr.png', 'events/loose.png']);
  assert.equal(rows[0].label, 'Winter Open');
  assert.deepEqual(rows[0].qrLinks, ['https://reg.example']);
  assert.deepEqual(rows[1].qrLinks, ['https://own.example']);
  assert.equal(rows[1].cloudEventId, 'ev1');
  assert.equal(rows[2].cloudEventId, undefined);
});

test('Cloud-backed console keeps this device\'s Gallery videos and technique links on this device', () => {
  const deviceRows = [
    device('p1', 'gallery'),
    device('v1', 'gallery', { mime: 'video/mp4' }),
    device('t1', 'gallery', { techniqueClipId: 'clip-1', mime: 'video/mp4', blob: new Blob([]) }),
    device('s1', 'shop'),
  ];
  const cloudRows = cloudRowsForFolder({ folderId: 'gallery', listing: listing('gallery', [{ path: 'gallery/approved/2026-11-19/a.jpg' }]), index: emptyCloudIndex('gallery'), canEdit: true });
  const merged = mergeBackedRows({ backing: 'cloud', deviceRows, cloudRows });
  assert.deepEqual(merged.map((row) => row.id), ['cloud:gallery/approved/2026-11-19/a.jpg', 'v1', 't1']);
  assert.deepEqual(mergeBackedRows({ backing: 'device', deviceRows, cloudRows }).map((row) => row.id), ['p1', 'v1', 't1', 's1']);
});

test('upload names never collide across phones; migration names are stable per device item', () => {
  assert.notEqual(uniqueCloudFileName('IMG_0001.HEIC', 'image/jpeg', () => 0.1), uniqueCloudFileName('IMG_0001.HEIC', 'image/jpeg', () => 0.2));
  assert.match(uniqueCloudFileName('IMG_0001.HEIC', 'image/jpeg', () => 0.1), /^IMG-0001-[a-z0-9]{6}\.jpg$/);
  const row = device('6f1c2a90-aaaa-bbbb', 'shop', { label: 'Black belt $35' });
  assert.equal(migrationFileName(row), migrationFileName({ ...row }));
  assert.match(migrationFileName(row), /^Black-belt-35-6f1c2a90-aaa\.jpg$/);
});

/** A tiny Cloud: uploads land in `files`, patches merge like the server. */
function fakeCloud(folder: 'pro-shop' | 'events' | 'gallery') {
  const files = new Set<string>();
  let index = emptyCloudIndex(folder);
  let uploads = 0;
  const upload: MigrationUpload = async ({ file }) => {
    uploads += 1;
    const path = folder === 'gallery' ? `gallery/approved/2026-11-19/${file.name}` : `${folder}/${file.name}`;
    files.add(path);
    return { ok: true, path, lane: 'approved' };
  };
  const patch = async (change: CloudIndexPatch) => {
    const merged = applyCloudIndexPatch(index, change, new Date());
    if (!merged.ok) return { ok: false as const, message: merged.error };
    index = merged.index;
    return { ok: true as const, index };
  };
  return { files, upload, patch, get index() { return index; }, get uploads() { return uploads; } };
}

test('device send: every Pro Shop card goes with its details; a second run sends nothing (idempotent)', async () => {
  const cloud = fakeCloud('pro-shop');
  const rows = [
    device('a1', 'shop', { label: 'Advantage gi $140', buyUrl: 'https://buy.example/gi', sortOrder: 0 }),
    device('b2', 'shop', { label: 'Rash guard $45 — long sleeve', buyUrl: 'https://buy.example/rash', startsSlide: false, sortOrder: 1 }),
    device('e1', 'events', { label: 'Not this folder' }),
  ];
  const plan = planDeviceMigration({ rows, folderId: 'shop', index: cloud.index, listedPaths: cloud.files, dateKey: '2026-11-19' });
  assert.equal(plan.send.length, 2);
  const summary = await runDeviceMigration({ plan, folderId: 'shop', dateKey: '2026-11-19', upload: cloud.upload, patch: cloud.patch });
  assert.equal(summary.sent, 2);
  assert.deepEqual(summary.failed, []);
  const details = Object.values(cloud.index.items);
  assert.deepEqual(
    details.map((row) => [row.label, row.buyUrl, row.startsSlide]).sort(),
    [
      ['Advantage gi $140', 'https://buy.example/gi', true],
      ['Rash guard $45 — long sleeve', 'https://buy.example/rash', false],
    ],
  );
  const again = planDeviceMigration({ rows, folderId: 'shop', index: cloud.index, listedPaths: cloud.files, dateKey: '2026-11-19' });
  assert.equal(again.send.length + again.relink.length, 0);
  assert.equal(again.skip.length, 2);
  await runDeviceMigration({ plan: again, folderId: 'shop', dateKey: '2026-11-19', upload: cloud.upload, patch: cloud.patch });
  assert.equal(cloud.uploads, 2, 'no second upload');
});

test('device send: a run that stopped after the upload is finished by recording, not uploading again', async () => {
  const cloud = fakeCloud('events');
  const row = device('c3', 'events', { label: 'Seminar flyer', qrLinks: ['https://reg.example/a', 'https://reg.example/b'] });
  cloud.files.add(`events/${migrationFileName(row)}`);
  const plan = planDeviceMigration({ rows: [row], folderId: 'events', index: cloud.index, listedPaths: cloud.files, dateKey: '2026-11-19' });
  assert.equal(plan.send.length, 0);
  assert.equal(plan.relink.length, 1);
  const summary = await runDeviceMigration({ plan, folderId: 'events', dateKey: '2026-11-19', upload: cloud.upload, patch: cloud.patch });
  assert.equal(summary.relinked, 1);
  assert.equal(cloud.uploads, 0);
  assert.deepEqual(cloud.index.items[`events/${migrationFileName(row)}`].qrLinks, ['https://reg.example/a', 'https://reg.example/b']);
});

test('device send: videos and technique links never leave the device; the same photo from another device is skipped by fingerprint', async () => {
  const cloud = fakeCloud('gallery');
  const rows = [
    device('g1', 'gallery'),
    device('v1', 'gallery', { mime: 'video/mp4' }),
    device('t1', 'gallery', { techniqueClipId: 'clip', mime: 'video/mp4' }),
  ];
  const prints = new Map([['g1', 'v1-full-abc']]);
  const plan = planDeviceMigration({ rows, folderId: 'gallery', index: cloud.index, listedPaths: cloud.files, fingerprints: prints, dateKey: '2026-11-19' });
  assert.deepEqual(plan.send.map((row) => row.id), ['g1']);
  assert.deepEqual(plan.deviceOnly.map((row) => row.id).sort(), ['t1', 'v1']);
  await runDeviceMigration({ plan, folderId: 'gallery', dateKey: '2026-11-19', upload: cloud.upload, patch: cloud.patch, fingerprints: prints });
  const twin = device('other-device-id', 'gallery');
  const twinPlan = planDeviceMigration({ rows: [twin], folderId: 'gallery', index: cloud.index, listedPaths: cloud.files, fingerprints: new Map([['other-device-id', 'v1-full-abc']]), dateKey: '2026-11-20' });
  assert.equal(twinPlan.send.length, 0);
  assert.equal(twinPlan.skip.length, 1);
});

test('device send: one failed upload is reported and the rest still go; nothing is deleted on the device', async () => {
  const cloud = fakeCloud('pro-shop');
  const rows = [device('ok1', 'shop'), device('bad', 'shop'), device('ok2', 'shop')];
  const upload: MigrationUpload = async (input) => (input.file.name.includes('bad') ? { ok: false, message: 'Advantage Cloud is full.' } : cloud.upload(input));
  const plan = planDeviceMigration({ rows, folderId: 'shop', index: cloud.index, listedPaths: cloud.files, dateKey: '2026-11-19' });
  const summary = await runDeviceMigration({ plan, folderId: 'shop', dateKey: '2026-11-19', upload, patch: cloud.patch });
  assert.equal(summary.sent, 2);
  assert.deepEqual(summary.failed, [{ label: 'Card bad', message: 'Advantage Cloud is full.' }]);
  assert.equal(rows.length, 3);
});

test('Add to event moves files out of any other event and keeps the order', () => {
  const events = [
    { id: 'a', title: 'A', date: '', qrLinks: [], items: ['events/1.png', 'events/2.png'], order: 0 },
    { id: 'b', title: 'B', date: '', qrLinks: [], items: ['events/3.png'], order: 1 },
  ];
  const patch = addToEventPatch(events, events[1], ['events/2.png', 'events/4.png', 'events/2.png']);
  const applied = applyCloudIndexPatch({ ...emptyCloudIndex('events'), events }, patch, new Date());
  assert.ok(applied.ok);
  assert.deepEqual(applied.index.events.find((e) => e.id === 'a')!.items, ['events/1.png']);
  assert.deepEqual(applied.index.events.find((e) => e.id === 'b')!.items, ['events/3.png', 'events/2.png', 'events/4.png']);
  const fresh = { id: 'ev-new', title: 'New event', date: '', qrLinks: [], items: [], order: 2 };
  const created = applyCloudIndexPatch(applied.index, addToEventPatch(applied.index.events, fresh, ['events/1.png']), new Date());
  assert.ok(created.ok);
  assert.deepEqual(created.index.events.map((e) => [e.id, e.items]), [['a', []], ['b', ['events/3.png', 'events/2.png', 'events/4.png']], ['ev-new', ['events/1.png']]]);
});

test('Events as the only slideshow folder plays its photos, grouped or not; a PDF in Events never plays', () => {
  const index: CloudMediaIndex = {
    ...emptyCloudIndex('events'),
    events: [{ id: 'ev1', title: 'Winter Open', date: '', qrLinks: [], items: ['events/b.png'], order: 0 }],
  };
  const rows = cloudRowsForFolder({
    folderId: 'events',
    listing: listing('events', [{ path: 'events/a.png' }, { path: 'events/b.png' }, { path: 'events/flyer.pdf', kind: 'file' }]),
    index,
    canEdit: true,
  });
  const galleryRow = { ...rows[0], id: 'cloud:gallery/approved/2026-11-12/x.jpg', folderId: 'gallery' as const, cloudPath: 'gallery/approved/2026-11-12/x.jpg' };
  const queue = playableItems([...rows, galleryRow], { gallery: false, shop: false, events: true });
  assert.deepEqual(queue.map((row) => row.cloudPath), ['events/b.png', 'events/a.png']);
  assert.ok(queue.every((row) => row.mime.startsWith('image/')));
});

test('Events-only slideshow plays photos the list sent with a generic type and kind "file" (the PDF-tile bug)', async () => {
  const names = ['00-Title.png', '1000017087-jsw3yr.png', 'ALLSKIDUSA.COM.png'];
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        items: names.map((name) => ({ name, path: `events/${name}`, size: 9, mime: 'application/octet-stream', kind: 'file' })),
        canUpload: true,
        canDelete: true,
        uploadLane: 'approved',
      }),
      { status: 200 },
    );
  const listed = await listCloudFolder({ folder: 'events', token: 'test-token', fetcher });
  assert.ok(listed && !('error' in listed));
  assert.deepEqual(listed.items.map((item) => item.kind), ['photo', 'photo', 'photo']);
  const rows = cloudRowsForFolder({ folderId: 'events', listing: listed, index: emptyCloudIndex('events'), canEdit: true });
  assert.equal(rows.length, 3);
  const queue = playableItems(rows, { gallery: false, shop: false, events: true });
  assert.deepEqual(queue.map((row) => row.cloudPath), names.map((name) => `events/${name}`));
});

test('every networked folder plays on its own: Gallery (photos and a clip) and Pro Shop with the generic type the old list sent', async () => {
  const fetcherFor = (items: unknown[]): typeof fetch => async () =>
    new Response(JSON.stringify({ items, canUpload: true, canDelete: true, uploadLane: 'approved' }), { status: 200 });
  // Gallery rows as the old server sent them: kind from the file name, type dropped to octet-stream.
  const gallery = await listCloudFolder({
    folder: 'gallery',
    token: 'test-token',
    fetcher: fetcherFor([
      { name: '20260218_190358.jpg', path: 'gallery/approved/2026-11-19/20260218_190358.jpg', size: 9, mime: 'application/octet-stream', kind: 'photo', dateKey: '2026-11-19' },
      { name: 'warmup.mp4', path: 'gallery/approved/2026-11-19/warmup.mp4', size: 9, mime: 'application/octet-stream', kind: 'video', dateKey: '2026-11-19' },
    ]),
  });
  const shop = await listCloudFolder({
    folder: 'pro-shop',
    token: 'test-token',
    fetcher: fetcherFor([{ name: 'Rash-guard.jpg', path: 'pro-shop/Rash-guard.jpg', size: 9, mime: 'application/octet-stream', kind: 'file' }]),
  });
  assert.ok(gallery && !('error' in gallery) && shop && !('error' in shop));
  const rows = [
    ...cloudRowsForFolder({ folderId: 'gallery', listing: gallery, index: emptyCloudIndex('gallery'), canEdit: true }),
    ...cloudRowsForFolder({ folderId: 'shop', listing: shop, index: emptyCloudIndex('pro-shop'), canEdit: true }),
  ];
  const only = (folder: 'gallery' | 'shop') =>
    playableItems(rows, { gallery: folder === 'gallery', shop: folder === 'shop', events: false }).map((row) => row.cloudPath);
  assert.deepEqual(only('gallery'), ['gallery/approved/2026-11-19/20260218_190358.jpg', 'gallery/approved/2026-11-19/warmup.mp4']);
  assert.deepEqual(only('shop'), ['pro-shop/Rash-guard.jpg']);
});

test('device send: a photo Cloud already has (under its old name) is linked to that file, not stored again', async () => {
  const cloud = fakeCloud('events');
  cloud.files.add('events/KIM-Fitness.png');
  const row = device('k1', 'events', { label: 'KIM Fitness' });
  const plan = planDeviceMigration({ rows: [row], folderId: 'events', index: cloud.index, listedPaths: cloud.files, dateKey: '2026-11-19' });
  assert.equal(plan.send.length, 1);
  const summary = await runDeviceMigration({
    plan,
    folderId: 'events',
    dateKey: '2026-11-19',
    upload: async () => ({ ok: true, path: 'events/KIM-Fitness.png', lane: 'approved', duplicate: true }),
    patch: cloud.patch,
  });
  assert.equal(summary.sent, 0);
  assert.equal(summary.relinked, 1);
  assert.equal(cloud.index.migrated['dev:k1'], 'events/KIM-Fitness.png');
  assert.equal(cloud.index.items['events/KIM-Fitness.png'].label, 'KIM Fitness');
  // The next run skips it.
  const again = planDeviceMigration({ rows: [row], folderId: 'events', index: cloud.index, listedPaths: cloud.files, dateKey: '2026-11-19' });
  assert.equal(again.skip.length, 1);
});

test('"Photos stay on this device" shows only when the folder really is device-only', () => {
  const folder = { id: 'gallery', emptyCopy: 'No photos yet. Photos stay on this device.', orderHint: 'Drag to reorder. Photos and clips stay on this device.' };
  assert.deepEqual(folderCopyFor(folder, 'device'), folder);
  const cloud = folderCopyFor(folder, 'cloud');
  assert.equal(cloud.emptyCopy, 'No photos yet.');
  assert.equal(cloud.orderHint, 'Drag to reorder.');
  assert.equal(cloud.id, 'gallery');
});
