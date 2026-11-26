/**
 * Advantage Cloud folders: Gallery, Pro Shop, Events, Schedule.
 * Gallery keeps the existing gallery/{lane}/{date}/ keys. The folder list for
 * Gallery (the TV slideshow source) is approved Gallery files only, with no
 * daily videos mixed in. Pro Shop, Events, and Schedule are pro-shop/,
 * events/, and schedule/ (approved) plus {folder}/pending/ while a seat's upload
 * waits. Everyone who can open the folders may upload. With the owner's approval
 * switch on, every seat's upload waits and only the owner approves or rejects.
 * With it off, uploads go live. Delete stays the owner and an Instructors seat.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_SIDE_FOLDERS,
  cloudFolderApprovalAllowed,
  cloudFolderDeleteAllowed,
  cloudObjectKey,
  galleryUploadLane,
  parseSideFolderCloudPath,
  sideFolderApprovedPath,
  sideFolderCloudPath,
} from '../lib/advantageCloudMedia.ts';
import { listCloudFolder, uploadToCloudFolder } from '../lib/advantageCloudFolders.ts';
import { deleteCloudMedia } from '../lib/cloudVideoCleanup.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { CLOUD_FOLDER_APPROVE_REFUSED, handleGymCloud, putMimeOf, streamFrom, uploadMimeOf, type GymCloudEnv, type GymMediaBucket } from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-18T20:00:00.000Z');
const LIC = 'owner-test';
const BASE = `groups/${LIC}/`;

function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const bucket = {
    objects,
    async head(name: string) {
      const row = objects.get(name);
      return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
    },
    async get(name: string) {
      const row = objects.get(name);
      return row ? { body: streamFrom(row.bytes), size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
    },
    async put(name: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(name, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
    },
    async delete(names: string | string[]) {
      for (const name of Array.isArray(names) ? names : [names]) objects.delete(name);
    },
    // Like R2 on a current compatibility date: a list leaves the Content-Type out unless `include` asks for it.
    async list(options?: { prefix?: string; include?: string[] }) {
      const prefix = options?.prefix ?? '';
      const keys = [...objects.keys()].filter((item) => item.startsWith(prefix)).sort();
      const withTypes = options?.include?.includes('httpMetadata') === true;
      return {
        objects: keys.map((item) => ({
          key: item,
          size: objects.get(item)!.bytes.byteLength,
          ...(withTypes ? { httpMetadata: { contentType: objects.get(item)!.type } } : {}),
        })),
        truncated: false,
      };
    },
    async createMultipartUpload() {
      throw new Error('unused');
    },
    resumeMultipartUpload(name: string, uploadId: string) {
      return { key: name, uploadId, uploadPart: async () => ({ partNumber: 1, etag: 'e' }), complete: async () => undefined, abort: async () => undefined };
    },
  };
  return bucket as unknown as GymMediaBucket & { objects: typeof objects };
}

/** Just enough D1 for the owner's approval switch; every other query reads as empty. Seats on owner-test stay active. */
function approvalDb() {
  let required: number | null = null;
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const prepared = {
        bind(...values: unknown[]) {
          args = values;
          return prepared;
        },
        async first<T>() {
          if (sql.includes('gallery_approval') && required !== null) return { required } as T;
          return null as T | null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO gallery_approval')) required = Number(args[1]);
          return { meta: { changes: 1 } };
        },
      };
      return prepared;
    },
    async exec() {
      return undefined;
    },
  };
  return db as unknown as NonNullable<GymCloudEnv['ENTITLEMENTS_DB']>;
}

async function setup() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const secret = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const bucket = memoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: approvalDb() };
  const fetcher: typeof fetch = async (input, init) =>
    handleGymCloud(new Request(new URL(String(input), 'https://advantagebjjtimer.com'), init), env, () => now);
  const owner = await issueToken(secret, { licenseId: LIC, grants: ['pro'], tier: 'pro', src: 'code', deviceId: 'owner', now, kind: 'code' });
  const seat = async (preset: string) =>
    issueToken(secret, { licenseId: LIC, grants: ['pro'], tier: 'seat', src: 'seat', deviceId: preset, now, kind: 'seat', gym: LIC, sid: `seat-${preset}`, preset });
  const tokens = {
    owner: owner!,
    coach: (await seat('coach'))!,
    instructors: (await seat('instructors'))!,
    assistant: (await seat('assistant-coach'))!,
    director: (await seat('program-director'))!,
  };
  const put = (name: string, type: string, body = 'x') => bucket.objects.set(`${BASE}${name}`, { bytes: new TextEncoder().encode(body), type });
  return { bucket, env, fetcher, tokens, put };
}

function call(fetcher: typeof fetch, token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetcher(path, { ...init, headers });
}

function startBody(input: Record<string, unknown>) {
  return { method: 'POST', body: JSON.stringify({ action: 'start', dateKey: '2026-11-18', size: 4, ...input }) };
}

async function setSwitch(fetcher: typeof fetch, owner: string, required: boolean) {
  const res = await call(fetcher, owner, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'gallery-approval', required }) });
  assert.equal(res.status, 200);
}

function decide(fetcher: typeof fetch, token: string, action: 'gallery-approve' | 'gallery-reject', key: string) {
  return call(fetcher, token, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action, key }) });
}

test('side folder paths: flat approved keys, {folder}/pending/ for waiting uploads, nothing else', () => {
  assert.deepEqual([...CLOUD_SIDE_FOLDERS], ['pro-shop', 'events', 'schedule']);
  assert.equal(sideFolderCloudPath('pro-shop', 'Rash guard.jpg'), 'pro-shop/Rash-guard.jpg');
  assert.equal(sideFolderCloudPath('pro-shop', 'Rash guard.jpg', 'pending'), 'pro-shop/pending/Rash-guard.jpg');
  assert.equal(sideFolderCloudPath('schedule', 'week/../x.pdf'), 'schedule/x.pdf');
  assert.equal(sideFolderCloudPath('gallery', 'a.jpg'), null);
  assert.equal(sideFolderCloudPath('students', 'a.jpg'), null);
  assert.deepEqual(parseSideFolderCloudPath('events/open-mat.jpg'), { folder: 'events', name: 'open-mat.jpg', lane: 'approved' });
  assert.deepEqual(parseSideFolderCloudPath('events/pending/open-mat.jpg'), { folder: 'events', name: 'open-mat.jpg', lane: 'pending' });
  assert.equal(parseSideFolderCloudPath('events/2026/x.jpg'), null);
  assert.equal(sideFolderApprovedPath('schedule/pending/Nov.pdf'), 'schedule/Nov.pdf');
  assert.equal(sideFolderApprovedPath('schedule/Nov.pdf'), null);
  assert.equal(cloudObjectKey(LIC, 'events/open-mat.jpg'), `${BASE}events/open-mat.jpg`);
  assert.equal(cloudObjectKey(LIC, 'events/pending/open-mat.jpg'), `${BASE}events/pending/open-mat.jpg`);
  assert.equal(cloudObjectKey(LIC, 'schedule/../roster/master.json'), null);
  // Upload lane: the owner is live; every seat waits while the switch is on and is live when it is off.
  assert.equal(galleryUploadLane({ kind: 'owner', approvalRequired: true }), 'approved');
  for (const preset of ['instructors', 'coach', 'assistant-coach', 'program-director']) {
    assert.equal(galleryUploadLane({ kind: 'seat', preset, approvalRequired: true }), 'pending', preset);
    assert.equal(galleryUploadLane({ kind: 'seat', preset, approvalRequired: false }), 'approved', preset);
    assert.equal(cloudFolderApprovalAllowed({ kind: 'seat' }), false);
  }
  assert.equal(cloudFolderApprovalAllowed({ kind: 'owner' }), true);
  // Delete is unchanged: the owner and an Instructors seat.
  assert.equal(cloudFolderDeleteAllowed({ kind: 'owner' }), true);
  assert.equal(cloudFolderDeleteAllowed({ kind: 'seat', preset: 'instructors' }), true);
  assert.equal(cloudFolderDeleteAllowed({ kind: 'seat', preset: 'coach' }), false);
});

test('Gallery folder list is approved Gallery photos and videos only; old flat Pro Shop, Events, Schedule files still list', async () => {
  const { fetcher, tokens, put } = await setup();
  put('gallery/approved/2026-11-12/class.jpg', 'image/jpeg');
  put('gallery/approved/2026-11-17/promo.mp4', 'video/mp4');
  put('gallery/pending/2026-11-17/wait.jpg', 'image/jpeg');
  put('videos/daily/2026-11-17/drill.mp4', 'video/mp4');
  // Flat objects from before approval existed count as approved. Pending ones stay out.
  put('pro-shop/gi.jpg', 'image/jpeg');
  put('pro-shop/pending/new-gi.jpg', 'image/jpeg');
  put('events/seminar.jpg', 'image/jpeg');
  put('schedule/November.pdf', 'application/pdf');

  const listed = await listCloudFolder({ folder: 'gallery', token: tokens.owner, fetcher });
  assert.ok(listed && !('error' in listed));
  assert.deepEqual(listed.items.map((item) => [item.path, item.kind]), [
    ['gallery/approved/2026-11-17/promo.mp4', 'video'],
    ['gallery/approved/2026-11-12/class.jpg', 'photo'],
  ]);
  assert.equal(listed.canUpload, true);
  assert.equal(listed.canDelete, true);
  assert.equal(listed.uploadLane, 'approved');

  const expected = { 'pro-shop': ['pro-shop/gi.jpg'], events: ['events/seminar.jpg'], schedule: ['schedule/November.pdf'] } as const;
  for (const folder of CLOUD_SIDE_FOLDERS) {
    const side = await listCloudFolder({ folder, token: tokens.owner, fetcher });
    assert.ok(side && !('error' in side));
    assert.deepEqual(side.items.map((item) => item.path), [...expected[folder]], folder);
  }
  assert.equal((await call(fetcher, tokens.owner, '/api/gym/cloud?op=list&purpose=folder&folder=students')).status, 400);
  // The old display list is unchanged for the pages that still use it.
  const approved = (await (await call(fetcher, tokens.owner, '/api/gym/cloud?op=list&purpose=approved-media')).json()) as { items: { path: string }[] };
  assert.ok(approved.items.some((item) => item.path === 'videos/daily/2026-11-17/drill.mp4'));
});

test('approval ON: Coach, Program Director, Assistant, Instructors uploads wait in pending in all four folders; the owner is live', async () => {
  const { bucket, fetcher, tokens } = await setup();
  const file = (name: string, type = 'image/jpeg') => new File([`bytes-${name}`], name, { type });
  const seats = [['coach', tokens.coach], ['director', tokens.director], ['assistant', tokens.assistant], ['instructors', tokens.instructors]] as const;
  for (const [who, token] of seats) {
    const listing = await listCloudFolder({ folder: 'events', token, fetcher });
    assert.ok(listing && !('error' in listing), who);
    assert.equal(listing.canUpload, true, `${who} can upload`);
    assert.equal(listing.uploadLane, 'pending', `${who} waits`);
    const gallery = await uploadToCloudFolder({ folder: 'gallery', file: file(`${who}.jpg`), dateKey: '2026-11-18', token, fetcher });
    assert.deepEqual(gallery, { ok: true, path: `gallery/pending/2026-11-18/${who}.jpg`, lane: 'pending' }, who);
    for (const folder of CLOUD_SIDE_FOLDERS) {
      const sent = await uploadToCloudFolder({ folder, file: file(`${who}.jpg`), dateKey: '2026-11-18', token, fetcher });
      assert.deepEqual(sent, { ok: true, path: `${folder}/pending/${who}.jpg`, lane: 'pending' }, `${who} ${folder}`);
      assert.ok(bucket.objects.has(`${BASE}${folder}/pending/${who}.jpg`));
      assert.equal(bucket.objects.has(`${BASE}${folder}/${who}.jpg`), false, 'nothing shows until the owner approves');
    }
  }
  // Nothing pending shows in the folders or the slideshow source.
  for (const folder of ['gallery', ...CLOUD_SIDE_FOLDERS] as const) {
    const listed = await listCloudFolder({ folder, token: tokens.owner, fetcher });
    assert.ok(listed && !('error' in listed));
    assert.deepEqual(listed.items, [], folder);
  }
  // A seat cannot skip the wait by writing the approved key directly.
  const sneak = await call(fetcher, tokens.director, `/api/gym/cloud?op=put&key=${encodeURIComponent(`${BASE}pro-shop/sneak.jpg`)}`, {
    method: 'PUT',
    body: 'x',
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(sneak.status, 403);
  const owner = await uploadToCloudFolder({ folder: 'schedule', file: file('Nov.pdf', 'application/pdf'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(owner, { ok: true, path: 'schedule/Nov.pdf', lane: 'approved' });
  const json = await call(fetcher, tokens.coach, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'events', fileName: 'notes.json', mime: 'application/json' }));
  assert.equal(json.status, 400, 'folders take photos, videos, or PDFs');
});

test('approval OFF: anyone with access uploads live right away, and a seat never replaces an existing file', async () => {
  const { bucket, fetcher, tokens, put } = await setup();
  await setSwitch(fetcher, tokens.owner, false);
  put('pro-shop/gi.jpg', 'image/jpeg', 'owner');
  for (const [who, token] of [['coach', tokens.coach], ['director', tokens.director], ['assistant', tokens.assistant]] as const) {
    const gallery = await uploadToCloudFolder({ folder: 'gallery', file: new File([`x-${who}`], `${who}.jpg`, { type: 'image/jpeg' }), dateKey: '2026-11-18', token, fetcher });
    assert.deepEqual(gallery, { ok: true, path: `gallery/approved/2026-11-18/${who}.jpg`, lane: 'approved' }, who);
    const shop = await uploadToCloudFolder({ folder: 'pro-shop', file: new File([`x-${who}`], `${who}.jpg`, { type: 'image/jpeg' }), dateKey: '2026-11-18', token, fetcher });
    assert.deepEqual(shop, { ok: true, path: `pro-shop/${who}.jpg`, lane: 'approved' }, who);
    const clash = await call(fetcher, token, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'pro-shop', fileName: 'gi.jpg', mime: 'image/jpeg' }));
    assert.equal(clash.status, 409, `${who} cannot replace the owner's file`);
  }
  assert.equal(new TextDecoder().decode(bucket.objects.get(`${BASE}pro-shop/gi.jpg`)!.bytes), 'owner');
  const shop = await listCloudFolder({ folder: 'pro-shop', token: tokens.director, fetcher });
  assert.ok(shop && !('error' in shop));
  assert.deepEqual(shop.items.map((item) => item.path), ['pro-shop/assistant.jpg', 'pro-shop/coach.jpg', 'pro-shop/director.jpg', 'pro-shop/gi.jpg']);
  const gallery = await listCloudFolder({ folder: 'gallery', token: tokens.owner, fetcher });
  assert.ok(gallery && !('error' in gallery));
  assert.equal(gallery.items.length, 3, 'live uploads join the slideshow source');
});

test('only the owner approves or rejects; approve moves the file into the folder, reject deletes only the waiting copy', async () => {
  const { bucket, fetcher, tokens, put } = await setup();
  put('events/pending/seminar.jpg', 'image/jpeg', 'new');
  put('events/seminar.jpg', 'image/jpeg', 'old');
  put('schedule/pending/Nov.pdf', 'application/pdf');
  put('gallery/pending/2026-11-18/coach.jpg', 'image/jpeg');

  for (const [who, token] of [['instructors', tokens.instructors], ['coach', tokens.coach], ['director', tokens.director], ['assistant', tokens.assistant]] as const) {
    for (const key of ['events/pending/seminar.jpg', 'gallery/pending/2026-11-18/coach.jpg']) {
      const res = await decide(fetcher, token, 'gallery-approve', key);
      assert.equal(res.status, 403, `${who} approve ${key}`);
      const rej = await decide(fetcher, token, 'gallery-reject', key);
      assert.equal(rej.status, 403, `${who} reject ${key}`);
    }
  }
  const refused = await decide(fetcher, tokens.instructors, 'gallery-approve', 'events/pending/seminar.jpg');
  assert.equal(((await refused.json()) as { error: string }).error, CLOUD_FOLDER_APPROVE_REFUSED);

  // Review Inbox list: pending Pro Shop, Events, Schedule files.
  const pending = (await (await call(fetcher, tokens.owner, '/api/gym/cloud?op=list&purpose=folder-pending')).json()) as { files: { path: string }[] };
  assert.deepEqual(pending.files.map((row) => row.path).sort(), ['events/pending/seminar.jpg', 'schedule/pending/Nov.pdf']);
  assert.equal((await call(fetcher, tokens.director, '/api/gym/cloud?op=list&purpose=folder-pending')).status, 403);
  assert.equal((await call(fetcher, tokens.director, `/api/gym/cloud?op=file&path=${encodeURIComponent('events/pending/seminar.jpg')}`)).status, 403);

  const approved = await decide(fetcher, tokens.owner, 'gallery-approve', 'events/pending/seminar.jpg');
  assert.equal(approved.status, 200);
  assert.deepEqual(await approved.json(), { ok: true, lane: 'approved', path: 'events/seminar.jpg' });
  assert.equal(new TextDecoder().decode(bucket.objects.get(`${BASE}events/seminar.jpg`)!.bytes), 'new');
  assert.equal(bucket.objects.has(`${BASE}events/pending/seminar.jpg`), false);

  put('pro-shop/belt.jpg', 'image/jpeg', 'live');
  put('pro-shop/pending/belt.jpg', 'image/jpeg', 'waiting');
  const rejected = await decide(fetcher, tokens.owner, 'gallery-reject', 'pro-shop/pending/belt.jpg');
  assert.equal(rejected.status, 200);
  assert.equal(bucket.objects.has(`${BASE}pro-shop/pending/belt.jpg`), false);
  assert.equal(bucket.objects.has(`${BASE}pro-shop/belt.jpg`), true, 'the approved file with the same name stays');

  const galleryApproved = await decide(fetcher, tokens.owner, 'gallery-approve', 'gallery/pending/2026-11-18/coach.jpg');
  assert.equal(galleryApproved.status, 200);
  const gallery = await listCloudFolder({ folder: 'gallery', token: tokens.director, fetcher });
  assert.ok(gallery && !('error' in gallery));
  assert.deepEqual(gallery.items.map((item) => item.path), ['gallery/approved/2026-11-18/coach.jpg']);
});

test('delete stays the owner and an Instructors seat', async () => {
  const { bucket, fetcher, tokens, put } = await setup();
  put('pro-shop/gi.jpg', 'image/jpeg');
  for (const [who, token] of [['coach', tokens.coach], ['assistant', tokens.assistant], ['director', tokens.director]] as const) {
    const removed = await call(fetcher, token, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'delete-media', keys: ['pro-shop/gi.jpg'] }) });
    assert.equal(removed.status, 403, `${who} delete`);
    const listing = await listCloudFolder({ folder: 'pro-shop', token, fetcher });
    assert.ok(listing && !('error' in listing));
    assert.equal(listing.canDelete, false, who);
  }
  assert.ok(bucket.objects.has(`${BASE}pro-shop/gi.jpg`));
  const removed = await call(fetcher, tokens.instructors, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'delete-media', keys: ['pro-shop/gi.jpg'] }) });
  assert.equal(removed.status, 200);
  assert.equal(bucket.objects.has(`${BASE}pro-shop/gi.jpg`), false);
});

test('Events photos list as photos even when R2 leaves the Content-Type off or the upload sent none', async () => {
  const { fetcher, tokens, put } = await setup();
  put('events/00-Title.png', 'image/png');
  put('events/Event-1-0a12b5bd-078.png', 'image/png');
  // Stored with no type at all (an older upload): the .png name still makes it a photo.
  put('events/untyped.png', '');
  put('events/flyer.pdf', 'application/pdf');
  put('events/clip.mov', 'application/octet-stream');
  const events = await listCloudFolder({ folder: 'events', token: tokens.owner, fetcher });
  assert.ok(events && !('error' in events));
  assert.deepEqual(
    events.items.map((item) => [item.name, item.kind, item.mime]),
    [
      ['00-Title.png', 'photo', 'image/png'],
      ['clip.mov', 'video', 'video/quicktime'],
      ['Event-1-0a12b5bd-078.png', 'photo', 'image/png'],
      ['flyer.pdf', 'file', 'application/pdf'],
      ['untyped.png', 'photo', 'image/png'],
    ],
  );
  // The old display list reads the same type for Gallery.
  put('gallery/approved/2026-11-12/a.jpg', 'image/jpeg');
  const gallery = await listCloudFolder({ folder: 'gallery', token: tokens.owner, fetcher });
  assert.ok(gallery && !('error' in gallery));
  assert.deepEqual(gallery.items.map((item) => [item.kind, item.mime]), [['photo', 'image/jpeg']]);
});

test('Events dedupe: the same photo sent again, or retried, is skipped; another folder and a deleted file are not blocked', async () => {
  const { bucket, fetcher, tokens } = await setup();
  await setSwitch(fetcher, tokens.owner, false);
  const photo = (name: string, text = 'one photo') => new File([text], name, { type: 'image/png' });
  const first = await uploadToCloudFolder({ folder: 'events', file: photo('1000017087-jsw3yr.png'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(first, { ok: true, path: 'events/1000017087-jsw3yr.png', lane: 'approved' });
  // Same bytes under a new name (a retry, or another pick of the same photo): skipped, nothing new stored.
  const again = await uploadToCloudFolder({ folder: 'events', file: photo('Event-12-3c9749bf-c79.png'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(again, { ok: true, path: 'events/1000017087-jsw3yr.png', lane: 'approved', duplicate: true });
  assert.equal(bucket.objects.has(`${BASE}events/Event-12-3c9749bf-c79.png`), false);
  const listed = await listCloudFolder({ folder: 'events', token: tokens.owner, fetcher });
  assert.ok(listed && !('error' in listed));
  assert.deepEqual(listed.items.map((item) => item.name), ['1000017087-jsw3yr.png']);
  // Different bytes are a different photo.
  const other = await uploadToCloudFolder({ folder: 'events', file: photo('KIM-Fitness.png', 'another photo'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.equal(other.ok && other.duplicate, undefined);
  // The same photo in Gallery or Pro Shop is its own file there.
  const shop = await uploadToCloudFolder({ folder: 'pro-shop', file: photo('same.png'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(shop, { ok: true, path: 'pro-shop/same.png', lane: 'approved' });
  const gallery = await uploadToCloudFolder({ folder: 'gallery', file: photo('same.png'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(gallery, { ok: true, path: 'gallery/approved/2026-11-18/same.png', lane: 'approved' });
  // Deleting the file clears its marker, so the photo can be sent again.
  const removed = await deleteCloudMedia({ paths: ['events/1000017087-jsw3yr.png'], token: tokens.owner, fetcher });
  assert.equal(removed.ok, true);
  const resent = await uploadToCloudFolder({ folder: 'events', file: photo('back.png'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(resent, { ok: true, path: 'events/back.png', lane: 'approved' });
});

test('Events dedupe also catches a seat\'s repeat while the first copy waits in pending', async () => {
  const { fetcher, tokens } = await setup();
  const photo = (name: string) => new File(['pending photo'], name, { type: 'image/png' });
  const first = await uploadToCloudFolder({ folder: 'events', file: photo('a.png'), dateKey: '2026-11-18', token: tokens.coach, fetcher });
  assert.deepEqual(first, { ok: true, path: 'events/pending/a.png', lane: 'pending' });
  const again = await uploadToCloudFolder({ folder: 'events', file: photo('b.png'), dateKey: '2026-11-18', token: tokens.coach, fetcher });
  assert.deepEqual(again, { ok: true, path: 'events/pending/a.png', lane: 'pending', duplicate: true });
});

test('a file with a missing or generic stored type is served and stored as what its extension says', async () => {
  const { fetcher, tokens, put, bucket } = await setup();
  put('events/untyped.png', '', 'png-bytes');
  put('gallery/approved/2026-11-12/clip.mov', 'application/octet-stream', 'mov-bytes');
  put('events/flyer.pdf', 'application/pdf', 'pdf-bytes');
  const typeOf = async (path: string) => (await call(fetcher, tokens.owner, `/api/gym/cloud?op=file&path=${encodeURIComponent(path)}`)).headers.get('content-type');
  assert.equal(await typeOf('events/untyped.png'), 'image/png');
  assert.equal(await typeOf('gallery/approved/2026-11-12/clip.mov'), 'video/quicktime');
  assert.equal(await typeOf('events/flyer.pdf'), 'application/pdf');
  // Upload side: a phone or Drive that sends no type, or a generic one, still stores the right one.
  assert.equal(uploadMimeOf('', 'IMG_1.png', 'gallery'), 'image/png');
  assert.equal(uploadMimeOf('application/octet-stream', 'IMG_2.heic', 'cloud-folder'), 'image/heic');
  assert.equal(uploadMimeOf('', 'mystery', 'gallery'), 'video/mp4');
  assert.equal(uploadMimeOf('application/octet-stream', 'mystery.xyz', 'gallery'), 'application/octet-stream');
  assert.equal(uploadMimeOf('image/png', 'x.jpg', 'gallery'), 'image/png');
  assert.equal(uploadMimeOf('', 'day.mp4', 'daily-video'), 'video/mp4');
  assert.equal(putMimeOf('application/octet-stream', 'events/a.webp'), 'image/webp');
  assert.equal(putMimeOf('application/octet-stream', 'roster/master.json'), 'application/octet-stream');
  // End to end: a start with no type for a .png lands as a photo in Events.
  const start = await call(fetcher, tokens.owner, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'events', fileName: 'no-type.png', mime: '' }));
  assert.equal(start.status, 200);
  const started = (await start.json()) as { mode: string; key: string };
  assert.equal(started.mode, 'single');
  const stored = await call(fetcher, tokens.owner, `/api/gym/cloud?op=put&key=${encodeURIComponent(started.key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array([1, 2, 3, 4]),
  });
  assert.equal(stored.status, 200);
  assert.equal(bucket.objects.get(`${BASE}events/no-type.png`)?.type, 'image/png');
});

test('Events dedupe also sees files uploaded before folders kept fingerprints (the 13 already there)', async () => {
  const { bucket, fetcher, tokens, put } = await setup();
  await setSwitch(fetcher, tokens.owner, false);
  // Stored by the old code: no marker beside them.
  put('events/KIM-Fitness.png', 'image/png', 'kim photo');
  put('events/Bee-is-the-Balm.png', 'image/png', 'bee photo!');
  const markers = () => [...bucket.objects.keys()].filter((key) => key.startsWith(`${BASE}hashes/`));
  assert.equal(markers().length, 0);
  const photo = (name: string, text: string) => new File([text], name, { type: 'image/png' });
  // The device sends the same photo again under its migration name: skipped, nothing new stored.
  const again = await uploadToCloudFolder({ folder: 'events', file: photo('Event-11-e8ad20bc-a83.png', 'kim photo'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(again, { ok: true, path: 'events/KIM-Fitness.png', lane: 'approved', duplicate: true });
  assert.equal(bucket.objects.has(`${BASE}events/Event-11-e8ad20bc-a83.png`), false);
  // Same size, different bytes: a new photo. The check never reads files of another size.
  const other = await uploadToCloudFolder({ folder: 'events', file: photo('new.png', 'kim photX'), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(other, { ok: true, path: 'events/new.png', lane: 'approved' });
  assert.ok(markers().length > 0, 'the files that were checked now have markers');
});
