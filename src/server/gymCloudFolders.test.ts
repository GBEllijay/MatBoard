/**
 * Advantage Cloud folders: Gallery, Pro Shop, Events, Schedule.
 * Gallery keeps the existing gallery/{lane}/{date}/ keys. The folder list for
 * Gallery (the TV slideshow source) is approved Gallery files only, with no
 * daily videos mixed in. Pro Shop, Events, and Schedule are pro-shop/,
 * events/, and schedule/; only the owner and an Instructors seat may change them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_SIDE_FOLDERS,
  cloudObjectKey,
  cloudSideFolderWriteAllowed,
  parseSideFolderCloudPath,
  sideFolderCloudPath,
} from '../lib/advantageCloudMedia.ts';
import { listCloudFolder, uploadToCloudFolder } from '../lib/advantageCloudFolders.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { CLOUD_FOLDER_WRITE_REFUSED, handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket } from './gymCloud.ts';
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
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const keys = [...objects.keys()].filter((item) => item.startsWith(prefix)).sort();
      return {
        objects: keys.map((item) => ({ key: item, size: objects.get(item)!.bytes.byteLength, httpMetadata: { contentType: objects.get(item)!.type } })),
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

async function setup() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const secret = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const bucket = memoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
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

test('side folder paths: flat pro-shop/, events/, schedule/; nothing else; academy-owned keys', () => {
  assert.deepEqual([...CLOUD_SIDE_FOLDERS], ['pro-shop', 'events', 'schedule']);
  assert.equal(sideFolderCloudPath('pro-shop', 'Rash guard.jpg'), 'pro-shop/Rash-guard.jpg');
  assert.equal(sideFolderCloudPath('schedule', 'week/../x.pdf'), 'schedule/x.pdf');
  assert.equal(sideFolderCloudPath('gallery', 'a.jpg'), null);
  assert.equal(sideFolderCloudPath('students', 'a.jpg'), null);
  assert.deepEqual(parseSideFolderCloudPath('events/open-mat.jpg'), { folder: 'events', name: 'open-mat.jpg' });
  assert.equal(parseSideFolderCloudPath('events/2026/x.jpg'), null);
  assert.equal(cloudObjectKey(LIC, 'events/open-mat.jpg'), `${BASE}events/open-mat.jpg`);
  assert.equal(cloudObjectKey(LIC, 'schedule/../roster/master.json'), null);
  assert.equal(cloudSideFolderWriteAllowed({ kind: 'owner' }), true);
  assert.equal(cloudSideFolderWriteAllowed({ kind: 'seat', preset: 'instructors' }), true);
  for (const preset of ['coach', 'assistant-coach', 'program-director']) {
    assert.equal(cloudSideFolderWriteAllowed({ kind: 'seat', preset }), false, preset);
  }
});

test('Gallery folder list is approved Gallery photos and videos only: daily videos and pending files stay out', async () => {
  const { fetcher, tokens, put } = await setup();
  put('gallery/approved/2026-11-12/class.jpg', 'image/jpeg');
  put('gallery/approved/2026-11-17/promo.mp4', 'video/mp4');
  put('gallery/pending/2026-11-17/wait.jpg', 'image/jpeg');
  put('videos/daily/2026-11-17/drill.mp4', 'video/mp4');
  put('pro-shop/gi.jpg', 'image/jpeg');

  const listed = await listCloudFolder({ folder: 'gallery', token: tokens.owner, fetcher });
  assert.ok(listed && !('error' in listed));
  assert.deepEqual(listed.items.map((item) => [item.path, item.kind]), [
    ['gallery/approved/2026-11-17/promo.mp4', 'video'],
    ['gallery/approved/2026-11-12/class.jpg', 'photo'],
  ]);
  assert.equal(listed.canUpload, true);
  assert.equal(listed.canDelete, true);
  assert.equal(listed.uploadLane, 'approved');

  const shop = await listCloudFolder({ folder: 'pro-shop', token: tokens.owner, fetcher });
  assert.ok(shop && !('error' in shop));
  assert.deepEqual(shop.items.map((item) => item.path), ['pro-shop/gi.jpg']);
  for (const folder of ['events', 'schedule'] as const) {
    const empty = await listCloudFolder({ folder, token: tokens.owner, fetcher });
    assert.ok(empty && !('error' in empty));
    assert.deepEqual(empty.items, []);
  }
  const bad = await call(fetcher, tokens.owner, '/api/gym/cloud?op=list&purpose=folder&folder=students');
  assert.equal(bad.status, 400);

  // The old display list is unchanged for the pages that still use it.
  const approved = (await (await call(fetcher, tokens.owner, '/api/gym/cloud?op=list&purpose=approved-media')).json()) as { items: { path: string }[] };
  assert.ok(approved.items.some((item) => item.path === 'videos/daily/2026-11-17/drill.mp4'));
});

test('who sees what: Coach uploads to Gallery as pending and only views Pro Shop; Program Director with Gallery on can view', async () => {
  const { fetcher, tokens, put } = await setup();
  put('gallery/approved/2026-11-12/class.jpg', 'image/jpeg');
  put('events/seminar.jpg', 'image/jpeg');

  const coachGallery = await listCloudFolder({ folder: 'gallery', token: tokens.coach, fetcher });
  assert.ok(coachGallery && !('error' in coachGallery));
  assert.equal(coachGallery.canUpload, true);
  assert.equal(coachGallery.uploadLane, 'pending');
  assert.equal(coachGallery.canDelete, false);
  const coachEvents = await listCloudFolder({ folder: 'events', token: tokens.coach, fetcher });
  assert.ok(coachEvents && !('error' in coachEvents));
  assert.equal(coachEvents.canUpload, false);
  assert.equal(coachEvents.canDelete, false);
  assert.equal(coachEvents.items.length, 1);

  const director = await listCloudFolder({ folder: 'gallery', token: tokens.director, fetcher });
  assert.ok(director && !('error' in director), 'a Program Director with the Gallery switch on can open Gallery');
  assert.equal(director.items.length, 1);
  assert.equal(director.canUpload, false);
  assert.equal(director.canDelete, false);
  const directorEvents = await listCloudFolder({ folder: 'events', token: tokens.director, fetcher });
  assert.ok(directorEvents && !('error' in directorEvents));
  const file = await call(fetcher, tokens.director, `/api/gym/cloud?op=file&path=${encodeURIComponent('events/seminar.jpg')}`);
  assert.equal(file.status, 200);
  const pendingPeek = await call(fetcher, tokens.director, `/api/gym/cloud?op=file&path=${encodeURIComponent('gallery/pending/2026-11-12/x.jpg')}`);
  assert.equal(pendingPeek.status, 403);

  const assistant = await listCloudFolder({ folder: 'schedule', token: tokens.assistant, fetcher });
  assert.ok(assistant && !('error' in assistant));
  assert.equal(assistant.canUpload, false);
});

test('Gallery upload key stays gallery/{lane}/{date}/; side folder uploads land in their folder', async () => {
  const { bucket, fetcher, tokens } = await setup();
  const photo = new File(['pixels'], 'open mat.jpg', { type: 'image/jpeg' });
  const owner = await uploadToCloudFolder({ folder: 'gallery', file: photo, dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.deepEqual(owner, { ok: true, path: 'gallery/approved/2026-11-18/open-mat.jpg', lane: 'approved' });
  assert.ok(bucket.objects.has(`${BASE}gallery/approved/2026-11-18/open-mat.jpg`));

  const coach = await uploadToCloudFolder({ folder: 'gallery', file: new File(['c'], 'coach.jpg', { type: 'image/jpeg' }), dateKey: '2026-11-18', token: tokens.coach, fetcher });
  assert.equal(coach.ok && coach.lane, 'pending');
  assert.ok(bucket.objects.has(`${BASE}gallery/pending/2026-11-18/coach.jpg`));

  const schedule = await uploadToCloudFolder({ folder: 'schedule', file: new File(['%PDF'], 'November.pdf', { type: 'application/pdf' }), dateKey: '2026-11-18', token: tokens.owner, fetcher });
  assert.equal(schedule.ok && schedule.path, 'schedule/November.pdf');
  const shop = await uploadToCloudFolder({ folder: 'pro-shop', file: new File(['g'], 'gi.jpg', { type: 'image/jpeg' }), dateKey: '2026-11-18', token: tokens.instructors, fetcher });
  assert.equal(shop.ok && shop.path, 'pro-shop/gi.jpg');
  assert.ok(bucket.objects.has(`${BASE}pro-shop/gi.jpg`));

  const json = await call(fetcher, tokens.owner, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'events', fileName: 'notes.json', mime: 'application/json' }));
  assert.equal(json.status, 400, 'folders take photos, videos, or PDFs');
  const nowhere = await call(fetcher, tokens.owner, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'students', fileName: 'a.jpg', mime: 'image/jpeg' }));
  assert.equal(nowhere.status, 400);
});

test('Coach, assistant, and Program Director cannot write or delete Pro Shop, Events, or Schedule, even with a direct PUT', async () => {
  const { bucket, fetcher, tokens, put } = await setup();
  put('pro-shop/gi.jpg', 'image/jpeg');
  for (const [who, token] of [['coach', tokens.coach], ['assistant', tokens.assistant], ['director', tokens.director]] as const) {
    const started = await call(fetcher, token, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'pro-shop', fileName: 'mine.jpg', mime: 'image/jpeg' }));
    assert.equal(started.status, 403, `${who} start`);
    const direct = await call(fetcher, token, `/api/gym/cloud?op=put&key=${encodeURIComponent(`${BASE}pro-shop/gi.jpg`)}`, {
      method: 'PUT',
      body: 'overwrite',
      headers: { 'content-type': 'image/jpeg' },
    });
    assert.equal(direct.status, 403, `${who} put`);
    const removed = await call(fetcher, token, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'delete-media', keys: ['pro-shop/gi.jpg'] }) });
    assert.equal(removed.status, 403, `${who} delete`);
  }
  const coachStart = await call(fetcher, tokens.coach, '/api/gym/cloud', startBody({ purpose: 'cloud-folder', folder: 'events', fileName: 'x.jpg', mime: 'image/jpeg' }));
  assert.equal(((await coachStart.json()) as { error: string }).error, CLOUD_FOLDER_WRITE_REFUSED);
  assert.equal(new TextDecoder().decode(bucket.objects.get(`${BASE}pro-shop/gi.jpg`)!.bytes), 'x', 'the file is untouched');

  const ownerDelete = await call(fetcher, tokens.instructors, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'delete-media', keys: ['pro-shop/gi.jpg'] }) });
  assert.equal(ownerDelete.status, 200);
  assert.equal(bucket.objects.has(`${BASE}pro-shop/gi.jpg`), false);
});
