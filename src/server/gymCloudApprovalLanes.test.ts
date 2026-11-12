/**
 * Advantage Cloud approve-then-display: daily-video lanes, legacy daily videos,
 * approve/reject, the approved-media gallery list, op=file for approved gallery
 * paths, and the ranged copy that keeps big approvals out of Worker memory.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_CHUNK_BYTES,
  cloudObjectKey,
  dailyVideoMarkerPath,
  dailyVideoUploadLane,
  parseDailyVideoMarkerPath,
} from '../lib/advantageCloudMedia.ts';
import {
  canDecideApproval,
  folderLanePath,
  folderLaneStoreStub,
  laneFromMarkers,
  uploadLaneFor,
} from '../lib/approvalLanes.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import {
  copyGymObject,
  handleGymCloud,
  streamFrom,
  type GymCloudEnv,
  type GymMediaBucket,
  type R2MultipartUpload,
} from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-12T05:00:00.000Z');
const LIC = 'lic-owner1';
const BASE = `groups/${LIC}/`;

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, Uint8Array>; type: string }>();
  /** Largest single read, to prove big copies are ranged. */
  largestRead = 0;
  seq = 1;

  async head(key: string) {
    const row = this.objects.get(key);
    return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
  }

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const row = this.objects.get(key);
    if (!row) return null;
    const bytes = options?.range
      ? row.bytes.slice(options.range.offset, options.range.offset + options.range.length)
      : row.bytes;
    this.largestRead = Math.max(this.largestRead, bytes.byteLength);
    return { body: streamFrom(bytes), size: bytes.byteLength, httpMetadata: { contentType: row.type } };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? '';
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    return {
      objects: keys.map((key) => ({ key, size: this.objects.get(key)!.bytes.byteLength, httpMetadata: { contentType: this.objects.get(key)!.type } })),
      truncated: false,
    };
  }

  async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2MultipartUpload> {
    const uploadId = `up-${this.seq++}`;
    this.uploads.set(uploadId, { key, parts: new Map(), type: options?.httpMetadata?.contentType || 'application/octet-stream' });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    return {
      key,
      uploadId,
      uploadPart: async (partNumber, value) => {
        const upload = this.uploads.get(uploadId);
        if (!upload) throw new Error('no upload');
        upload.parts.set(partNumber, value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value));
        return { partNumber, etag: `e${partNumber}` };
      },
      complete: async (parts) => {
        const upload = this.uploads.get(uploadId);
        if (!upload) throw new Error('no upload');
        const chunks = parts.map((part) => upload.parts.get(part.partNumber)!);
        const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        this.objects.set(upload.key, { bytes, type: upload.type });
        this.uploads.delete(uploadId);
      },
      abort: async () => {
        this.uploads.delete(uploadId);
      },
    };
  }
}

function fakeDb(state: { approvalRequired: boolean | null }): D1Database {
  return {
    prepare(sql: string) {
      const prepared = {
        bind() {
          return prepared;
        },
        async all<T>() {
          const grants = sql.includes('FROM grants')
            ? [{ licenseId: LIC, product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null }]
            : [];
          return { results: grants as T[] };
        },
        async first<T>() {
          if (sql.includes('FROM seats')) return { status: 'claimed', revokedAt: null } as T;
          if (sql.includes('FROM gallery_approval')) {
            return (state.approvalRequired === null ? null : { required: state.approvalRequired ? 1 : 0 }) as T | null;
          }
          return null;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
      return prepared;
    },
    async exec() {
      return undefined;
    },
  };
}

async function secret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

async function setup(approvalRequired: boolean | null = null) {
  const signing = await secret();
  const bucket = new MemoryBucket();
  const state = { approvalRequired };
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb(state),
  };
  const issue = async (input: Parameters<typeof issueToken>[1]) => {
    const issued = await issueToken(signing, input);
    assert.ok(issued);
    return issued;
  };
  const seat = (preset: string, sid: string) =>
    issue({ licenseId: LIC, grants: ['pro'], tier: 'seat', src: 'seat', deviceId: `d-${sid}`, now, kind: 'seat', gym: LIC, sid, preset });
  const owner = await issue({
    licenseId: LIC,
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'd-owner',
    now,
    kind: 'code',
  });
  return {
    bucket,
    env,
    state,
    owner,
    coach: await seat('coach', 'seat-coach'),
    instructors: await seat('instructors', 'seat-instructors'),
    assistant: await seat('assistant-coach', 'seat-assistant'),
    director: await seat('program-director', 'seat-director'),
  };
}

function call(env: GymCloudEnv, path: string, init: RequestInit = {}, bearer = ''): Promise<Response> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers }), env, () => now);
}

const post = (env: GymCloudEnv, bearer: string, body: Record<string, unknown>) =>
  call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify(body) }, bearer);

async function uploadDaily(env: GymCloudEnv, bearer: string, fileName: string, dateKey = '2026-11-12') {
  const started = await post(env, bearer, { action: 'start', purpose: 'daily-video', dateKey, fileName, size: 4, mime: 'video/mp4' });
  const body = (await started.json()) as { key?: string; path?: string; lane?: string; error?: string };
  if (started.status !== 200 || !body.key) return { status: started.status, ...body };
  const put = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent(body.key)}`,
    { method: 'PUT', body: Uint8Array.from([1, 2, 3, 4]), headers: { 'content-type': 'video/mp4' } },
    bearer,
  );
  return { status: put.status, ...body };
}

async function listDaily(env: GymCloudEnv, bearer: string, extra = '', dateKey = '2026-11-12') {
  const response = await call(env, `/api/gym/cloud?op=list&purpose=daily-video&date=${dateKey}${extra}`, {}, bearer);
  assert.equal(response.status, 200);
  return ((await response.json()) as { files: { path: string; lane?: string }[] }).files;
}

async function fileStatus(env: GymCloudEnv, bearer: string, path: string) {
  return (await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(path)}`, {}, bearer)).status;
}

async function approvedMedia(env: GymCloudEnv, bearer: string) {
  const response = await call(env, '/api/gym/cloud?op=list&purpose=approved-media', {}, bearer);
  assert.equal(response.status, 200);
  return ((await response.json()) as { items: { path: string; source: string; lane: string; kind: string }[] }).items;
}

test('lane rules: owner approved, seats pending while approval is on, legacy markers approved', () => {
  assert.equal(uploadLaneFor({ kind: 'owner' }), 'approved');
  assert.equal(uploadLaneFor({ kind: 'owner', approvalRequired: true }), 'approved');
  assert.equal(uploadLaneFor({ kind: 'seat' }), 'pending');
  assert.equal(uploadLaneFor({ kind: 'seat', approvalRequired: false }), 'approved');
  assert.equal(dailyVideoUploadLane({ kind: 'seat', approvalRequired: true }), 'pending');
  assert.equal(laneFromMarkers({ pending: false, rejected: false }), 'approved');
  assert.equal(laneFromMarkers({ pending: true, rejected: false }), 'pending');
  assert.equal(laneFromMarkers({ pending: true, rejected: true }), 'rejected');
  assert.equal(canDecideApproval({ kind: 'owner' }), true);
  assert.equal(canDecideApproval({ kind: 'seat', preset: 'instructors' }), true);
  assert.equal(canDecideApproval({ kind: 'seat', preset: 'coach' }), false);
  const marker = dailyVideoMarkerPath('videos/daily/2026-11-12/drill.mp4', 'pending');
  assert.equal(marker, 'pending/daily/pending/2026-11-12/drill.mp4');
  assert.deepEqual(parseDailyVideoMarkerPath(marker!), {
    lane: 'pending',
    dateKey: '2026-11-12',
    name: 'drill.mp4',
    videoPath: 'videos/daily/2026-11-12/drill.mp4',
  });
  assert.equal(dailyVideoMarkerPath('gallery/approved/2026-11-12/a.jpg', 'pending'), null);
  // A browser can never address a marker: op=put keys go through cloudObjectKey.
  assert.equal(cloudObjectKey(LIC, marker!), null);
  assert.equal(folderLanePath('gallery', 'pending', '2026-11-12'), 'gallery/pending/2026-11-12');
  assert.equal(folderLanePath('daily-video', 'approved', '2026-11-12'), 'videos/daily/2026-11-12');
  assert.equal(folderLanePath('daily-video', 'pending', '2026-11-12'), 'videos/daily-pending/2026-11-12');
});

test('Drive and OneDrive stubs list nothing and refuse decisions', async () => {
  const drive = folderLaneStoreStub('google-drive');
  assert.equal(drive.provider, 'google-drive');
  assert.equal(await drive.list({ lane: 'pending' }), null);
  const decided = await drive.decide(
    { provider: 'google-drive', source: 'gallery', lane: 'pending', path: 'x', name: 'x', dateKey: '2026-11-12', mime: 'image/jpeg', size: 1, kind: 'photo' },
    'approve',
  );
  assert.equal(decided.ok, false);
});

test('legacy daily videos with no marker stay listed, playable, and in the gallery', async () => {
  const { bucket, env, owner, assistant, director } = await setup();
  bucket.objects.set(`${BASE}videos/daily/2026-11-10/old-drill.mp4`, { bytes: Uint8Array.from([9, 9]), type: 'video/mp4' });
  const files = await listDaily(env, owner, '', '2026-11-10');
  assert.deepEqual(files.map((file) => [file.path, file.lane]), [['videos/daily/2026-11-10/old-drill.mp4', 'approved']]);
  assert.equal((await listDaily(env, assistant, '', '2026-11-10')).length, 1);
  assert.equal(await fileStatus(env, assistant, 'videos/daily/2026-11-10/old-drill.mp4'), 200);
  assert.equal(await fileStatus(env, director, 'videos/daily/2026-11-10/old-drill.mp4'), 200);
  const items = await approvedMedia(env, owner);
  assert.deepEqual(items.map((item) => [item.path, item.source, item.kind]), [['videos/daily/2026-11-10/old-drill.mp4', 'daily-video', 'video']]);
});

test('owner daily videos go straight to approved; a seat video waits, hidden, until approved', async () => {
  const { bucket, env, owner, coach, instructors, assistant } = await setup();
  const mine = await uploadDaily(env, owner, 'owner-drill.mp4');
  assert.equal(mine.status, 200);
  assert.equal(mine.lane, 'approved');
  assert.equal(bucket.objects.has(`${BASE}pending/daily/pending/2026-11-12/owner-drill.mp4`), false);

  const theirs = await uploadDaily(env, coach, 'coach-drill.mp4');
  assert.equal(theirs.status, 200);
  assert.equal(theirs.lane, 'pending');
  assert.equal(theirs.path, 'videos/daily/2026-11-12/coach-drill.mp4');
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-11-12/coach-drill.mp4`), true);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/pending/2026-11-12/coach-drill.mp4`), true);

  // Default lists show approved only, for everyone.
  assert.deepEqual((await listDaily(env, owner)).map((file) => file.path), ['videos/daily/2026-11-12/owner-drill.mp4']);
  assert.deepEqual((await listDaily(env, assistant)).map((file) => file.path), ['videos/daily/2026-11-12/owner-drill.mp4']);
  // Approvers may ask for every lane.
  assert.deepEqual(
    (await listDaily(env, owner, '&lanes=all')).map((file) => [file.path, file.lane]),
    [
      ['videos/daily/2026-11-12/coach-drill.mp4', 'pending'],
      ['videos/daily/2026-11-12/owner-drill.mp4', 'approved'],
    ],
  );
  // A coach (not an approver) asking for every lane still gets approved only.
  assert.equal((await listDaily(env, coach, '&lanes=all')).length, 1);
  // Pending bytes: approvers only.
  assert.equal(await fileStatus(env, assistant, theirs.path!), 404);
  assert.equal(await fileStatus(env, coach, theirs.path!), 404);
  assert.equal(await fileStatus(env, owner, theirs.path!), 200);
  assert.equal(await fileStatus(env, instructors, theirs.path!), 200);
  // Not in the display gallery, and cannot be sent to a student.
  assert.deepEqual((await approvedMedia(env, owner)).map((item) => item.path), ['videos/daily/2026-11-12/owner-drill.mp4']);
  const send = await post(env, owner, { action: 'send-to-student', key: theirs.path, studentId: 'stu1', dateKey: '2026-11-12' });
  assert.equal(send.status, 409);

  // Review Inbox list: approvers only.
  const review = await call(env, '/api/gym/cloud?op=list&purpose=daily-review', {}, owner);
  assert.equal(review.status, 200);
  assert.deepEqual(((await review.json()) as { files: { path: string }[] }).files.map((file) => file.path), [theirs.path]);
  assert.equal((await call(env, '/api/gym/cloud?op=list&purpose=daily-review', {}, coach)).status, 403);

  // A coach cannot approve; an Instructors seat can.
  assert.equal((await post(env, coach, { action: 'daily-approve', key: theirs.path })).status, 403);
  const approved = await post(env, instructors, { action: 'daily-approve', key: theirs.path });
  assert.equal(approved.status, 200);
  assert.equal(((await approved.json()) as { lane: string }).lane, 'approved');
  // The video never moved; only the marker went away.
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-11-12/coach-drill.mp4`), true);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/pending/2026-11-12/coach-drill.mp4`), false);
  assert.equal((await listDaily(env, assistant)).length, 2);
  assert.equal(await fileStatus(env, assistant, theirs.path!), 200);
  assert.equal((await approvedMedia(env, assistant)).length, 2);
  // A second decision finds nothing waiting.
  assert.equal((await post(env, owner, { action: 'daily-approve', key: theirs.path })).status, 404);
});

test('reject hides a seat daily video and keeps its bytes; a pending upload cannot replace a showing video', async () => {
  const { bucket, env, owner, coach, director } = await setup();
  assert.equal((await uploadDaily(env, owner, 'same-name.mp4')).status, 200);
  const clash = await uploadDaily(env, coach, 'same-name.mp4');
  assert.equal(clash.status, 409);
  assert.deepEqual([...bucket.objects.get(`${BASE}videos/daily/2026-11-12/same-name.mp4`)!.bytes], [1, 2, 3, 4]);

  const sent = await uploadDaily(env, director, 'pd-drop.mp4');
  assert.equal(sent.status, 200);
  assert.equal(sent.lane, 'pending');
  const rejected = await post(env, owner, { action: 'daily-reject', key: sent.path });
  assert.equal(rejected.status, 200);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/rejected/2026-11-12/pd-drop.mp4`), true);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/pending/2026-11-12/pd-drop.mp4`), false);
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-11-12/pd-drop.mp4`), true);
  assert.deepEqual((await listDaily(env, owner)).map((file) => file.path), ['videos/daily/2026-11-12/same-name.mp4']);
  assert.equal(
    (await listDaily(env, owner, '&lanes=all')).find((file) => file.path === sent.path)?.lane,
    'rejected',
  );
  assert.equal((await approvedMedia(env, owner)).some((item) => item.path === sent.path), false);
  // The program director's camera window never plays it.
  assert.equal(await fileStatus(env, director, sent.path!), 404);
});

test('a seat cannot skip review by writing bytes without start, or by writing a marker', async () => {
  const { bucket, env, coach } = await setup();
  const direct = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent(`${BASE}videos/daily/2026-11-12/sneaky.mp4`)}`,
    { method: 'PUT', body: Uint8Array.from([1]), headers: { 'content-type': 'video/mp4' } },
    coach,
  );
  assert.equal(direct.status, 403);
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-11-12/sneaky.mp4`), false);
  const marker = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent(`${BASE}pending/daily/pending/2026-11-12/x.mp4`)}`,
    { method: 'PUT', body: Uint8Array.from([1]), headers: { 'content-type': 'application/json' } },
    coach,
  );
  assert.equal(marker.status, 400);
});

test('with the approval switch off, seat daily videos are approved as sent', async () => {
  const { env, coach, assistant } = await setup(false);
  const sent = await uploadDaily(env, coach, 'open-mat.mp4');
  assert.equal(sent.status, 200);
  assert.equal(sent.lane, 'approved');
  assert.deepEqual((await listDaily(env, assistant)).map((file) => file.path), ['videos/daily/2026-11-12/open-mat.mp4']);
});

test('approved gallery photos are listed and served by op=file; pending ones are not in the gallery', async () => {
  const { bucket, env, owner, assistant, director } = await setup();
  bucket.objects.set(`${BASE}gallery/approved/2026-11-11/class.jpg`, { bytes: Uint8Array.from([1]), type: 'image/jpeg' });
  bucket.objects.set(`${BASE}gallery/pending/2026-11-11/waiting.jpg`, { bytes: Uint8Array.from([2]), type: 'image/jpeg' });
  bucket.objects.set(`${BASE}videos/daily/2026-11-12/today.mp4`, { bytes: Uint8Array.from([3]), type: 'video/mp4' });
  const items = await approvedMedia(env, assistant);
  assert.deepEqual(
    items.map((item) => [item.path, item.source, item.kind, item.lane]),
    [
      ['videos/daily/2026-11-12/today.mp4', 'daily-video', 'video', 'approved'],
      ['gallery/approved/2026-11-11/class.jpg', 'gallery', 'photo', 'approved'],
    ],
  );
  assert.equal(await fileStatus(env, owner, 'gallery/approved/2026-11-11/class.jpg'), 200);
  assert.equal(await fileStatus(env, assistant, 'gallery/approved/2026-11-11/class.jpg'), 200);
  // The program director's file branch used to allow daily videos only.
  assert.equal(await fileStatus(env, director, 'gallery/approved/2026-11-11/class.jpg'), 200);
  assert.equal(await fileStatus(env, director, 'gallery/pending/2026-11-11/waiting.jpg'), 403);
  assert.equal((await approvedMedia(env, director)).length, 2);
});

test('approving a large gallery video copies it in ranged parts, never in one read', async () => {
  const { bucket, env, owner } = await setup();
  const size = CLOUD_CHUNK_BYTES * 2 + 12345;
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 4096) bytes[index] = index % 251;
  bucket.objects.set(`${BASE}gallery/pending/2026-11-12/big-clip.mp4`, { bytes, type: 'video/mp4' });
  bucket.largestRead = 0;
  const approved = await post(env, owner, { action: 'gallery-approve', key: 'gallery/pending/2026-11-12/big-clip.mp4' });
  assert.equal(approved.status, 200);
  const copied = bucket.objects.get(`${BASE}gallery/approved/2026-11-12/big-clip.mp4`);
  assert.ok(copied);
  assert.equal(copied.bytes.byteLength, size);
  assert.deepEqual(copied.bytes, bytes);
  assert.equal(copied.type, 'video/mp4');
  assert.equal(bucket.objects.has(`${BASE}gallery/pending/2026-11-12/big-clip.mp4`), false);
  assert.ok(bucket.largestRead <= CLOUD_CHUNK_BYTES, `largest read ${bucket.largestRead}`);
});

test('copyGymObject reports a missing source and leaves no half-written target', async () => {
  const bucket = new MemoryBucket();
  assert.equal(await copyGymObject(bucket, `${BASE}gallery/pending/2026-11-12/gone.jpg`, `${BASE}gallery/approved/2026-11-12/gone.jpg`, 10, 'image/jpeg'), false);
  assert.equal(
    await copyGymObject(bucket, `${BASE}gallery/pending/2026-11-12/gone.mp4`, `${BASE}gallery/approved/2026-11-12/gone.mp4`, CLOUD_CHUNK_BYTES * 3, 'video/mp4'),
    false,
  );
  assert.equal(bucket.objects.size, 0);
  assert.equal(bucket.uploads.size, 0);
});
