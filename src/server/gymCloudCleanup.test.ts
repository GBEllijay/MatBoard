/**
 * Advantage Cloud delete and cleanup: prefix scoping, auth, reject-deletes,
 * cutoff selection, and the batch cap.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDIA_DELETE_BATCH_MAX, videoCleanupCutoffDate } from '../lib/cloudVideoCleanup.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import type { D1Database } from './d1.ts';
import {
  companionKeysForDelete,
  deletableCloudMediaPath,
  handleGymCloud,
  streamFrom,
  type GymCloudEnv,
  type GymMediaBucket,
  type R2MultipartUpload,
} from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-12T05:00:00.000Z');
const LIC = 'lic-owner1';
const OTHER = 'lic-other';
const BASE = `groups/${LIC}/`;

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, Uint8Array>; type: string }>();
  deletedBatches: string[][] = [];
  aborted: string[] = [];
  seq = 1;

  async head(key: string) {
    const row = this.objects.get(key);
    return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
  }

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const row = this.objects.get(key);
    if (!row) return null;
    const bytes = options?.range ? row.bytes.slice(options.range.offset, options.range.offset + options.range.length) : row.bytes;
    return { body: streamFrom(bytes), size: bytes.byteLength, httpMetadata: { contentType: row.type } };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
  }

  async delete(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    this.deletedBatches.push(list);
    for (const key of list) this.objects.delete(key);
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
      uploadPart: async () => ({ partNumber: 1, etag: 'e1' }),
      complete: async () => undefined,
      abort: async () => {
        this.aborted.push(key);
        this.uploads.delete(uploadId);
      },
    };
  }

  async listMultipartUploads(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? '';
    const uploads = [...this.uploads.values()]
      .filter((upload) => upload.key.startsWith(prefix))
      .map((upload) => {
        const uploadId = [...this.uploads.entries()].find((entry) => entry[1] === upload)?.[0] ?? '';
        return { key: upload.key, uploadId };
      });
    return { uploads };
  }
}

function fakeDb(): D1Database {
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
          if (sql.includes('FROM gallery_approval')) return { required: 1 } as T;
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

async function setup() {
  const signing = await secret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb(),
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
  const otherOwner = await issue({
    licenseId: OTHER,
    grants: ['pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'd-other',
    now,
    kind: 'code',
  });
  const student = await issue({
    licenseId: 'stu-1',
    grants: ['student'],
    tier: 'student',
    src: 'code',
    deviceId: 'd-stu',
    now,
    kind: 'code',
    preset: STUDENT_LICENSE_PRESET,
  });
  return {
    bucket,
    env,
    owner,
    otherOwner,
    student,
    coach: await seat('coach', 'seat-coach'),
    instructors: await seat('instructors', 'seat-instructors'),
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

function put(bucket: MemoryBucket, relative: string, bytes: number, type: string, license = LIC) {
  bucket.objects.set(`groups/${license}/${relative}`, { bytes: new Uint8Array(bytes).fill(7), type });
}

function markPending(bucket: MemoryBucket, videoPath: string, lane: 'pending' | 'rejected' = 'pending') {
  const parts = videoPath.split('/');
  bucket.objects.set(`${BASE}pending/daily/${lane}/${parts[2]}/${parts[3]}`, {
    bytes: new TextEncoder().encode('{}'),
    type: 'application/json',
  });
}

test('companion keys stay inside this license and include markers or gallery siblings', () => {
  assert.deepEqual(deletableCloudMediaPath('videos/daily/2026-05-01/old.mp4'), {
    source: 'daily-video',
    dateKey: '2026-05-01',
    name: 'old.mp4',
  });
  assert.equal(deletableCloudMediaPath('lessons/current/2026-W45/media/2026-11-03/plan.mp4'), null);
  const daily = companionKeysForDelete(LIC, 'videos/daily/2026-05-01/old.mp4');
  assert.deepEqual(daily, [
    `${BASE}videos/daily/2026-05-01/old.mp4`,
    `${BASE}pending/daily/pending/2026-05-01/old.mp4`,
    `${BASE}pending/daily/rejected/2026-05-01/old.mp4`,
  ]);
  assert.ok(daily.every((key) => key.startsWith(BASE)));
  const gallery = companionKeysForDelete(LIC, 'gallery/approved/2026-06-01/clip.mp4');
  assert.deepEqual(gallery, [
    `${BASE}gallery/pending/2026-06-01/clip.mp4`,
    `${BASE}gallery/approved/2026-06-01/clip.mp4`,
    `${BASE}gallery/rejected/2026-06-01/clip.mp4`,
  ]);
});

test('delete-media is scoped to the caller license, refuses traversal, and skips non-media paths', async () => {
  const { bucket, env, owner, otherOwner } = await setup();
  put(bucket, 'videos/daily/2026-05-01/mine.mp4', 4, 'video/mp4');
  put(bucket, 'videos/daily/2026-05-01/theirs.mp4', 8, 'video/mp4', OTHER);
  put(bucket, 'lessons/current/2026-W45/media/2026-11-03/plan.mp4', 4, 'video/mp4');

  const otherKey = `groups/${OTHER}/videos/daily/2026-05-01/theirs.mp4`;
  assert.equal((await post(env, owner, { action: 'delete-media', keys: [otherKey] })).status, 400);
  assert.equal(bucket.objects.has(otherKey), true);

  const traversal = await post(env, owner, { action: 'delete-media', keys: ['videos/daily/2026-05-01/../../secrets'] });
  assert.equal(traversal.status, 400);
  const lesson = await post(env, owner, { action: 'delete-media', keys: ['lessons/current/2026-W45/media/2026-11-03/plan.mp4'] });
  assert.equal(lesson.status, 400);
  assert.equal(bucket.objects.has(`${BASE}lessons/current/2026-W45/media/2026-11-03/plan.mp4`), true);

  // The other license cannot delete this gym's file, even with a full key.
  const theft = await post(env, otherOwner, { action: 'delete-media', keys: [`${BASE}videos/daily/2026-05-01/mine.mp4`] });
  assert.equal(theft.status, 400);
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-05-01/mine.mp4`), true);

  const ok = await post(env, owner, { action: 'delete-media', keys: ['videos/daily/2026-05-01/mine.mp4'] });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { deleted: number; licenseUsedBytes: number };
  assert.equal(body.deleted, 1);
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-05-01/mine.mp4`), false);
  assert.equal(bucket.objects.has(otherKey), true);
  assert.equal(body.licenseUsedBytes, 4); // only the leftover lesson video in this license
});

test('delete-media and old-videos list refuse missing auth, a coach, a student, and a program director', async () => {
  const { bucket, env, owner, coach, instructors, director, student } = await setup();
  put(bucket, 'videos/daily/2026-05-01/old.mp4', 4, 'video/mp4');

  assert.equal((await post(env, '', { action: 'delete-media', keys: ['videos/daily/2026-05-01/old.mp4'] })).status, 401);
  assert.equal((await post(env, student, { action: 'delete-media', keys: ['videos/daily/2026-05-01/old.mp4'] })).status, 403);
  assert.equal((await post(env, coach, { action: 'delete-media', keys: ['videos/daily/2026-05-01/old.mp4'] })).status, 403);
  assert.equal((await post(env, director, { action: 'delete-media', keys: ['videos/daily/2026-05-01/old.mp4'] })).status, 403);
  assert.equal((await call(env, '/api/gym/cloud?op=list&purpose=old-videos&days=90', {}, coach)).status, 403);
  assert.equal((await call(env, '/api/gym/cloud?op=list&purpose=old-videos&days=90', {}, '')).status, 401);

  const byInstructor = await post(env, instructors, { action: 'delete-media', key: 'videos/daily/2026-05-01/old.mp4' });
  assert.equal(byInstructor.status, 200);
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-05-01/old.mp4`), false);

  // A later owner delete of a missing file is still ok (idempotent companions).
  put(bucket, 'gallery/approved/2026-05-01/class.jpg', 3, 'image/jpeg');
  const photo = await post(env, owner, { action: 'delete-media', keys: ['gallery/approved/2026-05-01/class.jpg'] });
  assert.equal(photo.status, 200);
  assert.equal(bucket.objects.has(`${BASE}gallery/approved/2026-05-01/class.jpg`), false);
});

test('reject deletes the pending daily video or gallery file instead of hiding a kept copy', async () => {
  const { bucket, env, owner } = await setup();
  put(bucket, 'videos/daily/2026-11-12/drop.mp4', 4, 'video/mp4');
  markPending(bucket, 'videos/daily/2026-11-12/drop.mp4', 'pending');
  put(bucket, 'gallery/pending/2026-11-12/shot.jpg', 2, 'image/jpeg');

  const daily = await post(env, owner, { action: 'daily-reject', key: 'videos/daily/2026-11-12/drop.mp4' });
  assert.equal(daily.status, 200);
  assert.equal(bucket.objects.has(`${BASE}videos/daily/2026-11-12/drop.mp4`), false);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/pending/2026-11-12/drop.mp4`), false);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/rejected/2026-11-12/drop.mp4`), false);

  const gallery = await post(env, owner, { action: 'gallery-reject', key: 'gallery/pending/2026-11-12/shot.jpg' });
  assert.equal(gallery.status, 200);
  assert.equal(bucket.objects.has(`${BASE}gallery/pending/2026-11-12/shot.jpg`), false);
  assert.equal(bucket.objects.has(`${BASE}gallery/rejected/2026-11-12/shot.jpg`), false);
});

test('old-videos list uses the chosen cutoff, skips photos and pending rows, and includes rejected videos', async () => {
  const { bucket, env, owner } = await setup();
  // today is 2026-11-12. 30=2026-10-13, 60=2026-09-13, 90=2026-08-14, 180=2026-05-16.
  put(bucket, 'videos/daily/2026-11-01/recent.mp4', 4, 'video/mp4');
  put(bucket, 'videos/daily/2026-10-01/month.mp4', 5, 'video/mp4');
  put(bucket, 'videos/daily/2026-09-01/two-months.mp4', 6, 'video/mp4');
  put(bucket, 'videos/daily/2026-07-01/quarter.mp4', 7, 'video/mp4');
  put(bucket, 'videos/daily/2026-04-01/half.mp4', 8, 'video/mp4');
  put(bucket, 'videos/daily/2026-04-01/waiting.mp4', 9, 'video/mp4');
  markPending(bucket, 'videos/daily/2026-04-01/waiting.mp4', 'pending');
  put(bucket, 'videos/daily/2026-04-02/hidden.mp4', 10, 'video/mp4');
  markPending(bucket, 'videos/daily/2026-04-02/hidden.mp4', 'rejected');
  put(bucket, 'gallery/approved/2026-04-01/old-class.jpg', 3, 'image/jpeg');
  put(bucket, 'gallery/approved/2026-04-01/old-clip.mp4', 11, 'video/mp4');
  put(bucket, 'gallery/pending/2026-04-01/pending-clip.mp4', 12, 'video/mp4');

  const bad = await call(env, '/api/gym/cloud?op=list&purpose=old-videos&days=45', {}, owner);
  assert.equal(bad.status, 400);

  const listed = async (days: string) => {
    const response = await call(env, `/api/gym/cloud?op=list&purpose=old-videos&days=${days}`, {}, owner);
    assert.equal(response.status, 200);
    return (await response.json()) as { cutoff: string; count: number; totalBytes: number; items: { path: string }[]; truncated: boolean };
  };

  const thirty = await listed('30');
  assert.equal(thirty.cutoff, videoCleanupCutoffDate(30, now));
  assert.deepEqual(
    thirty.items.map((item) => item.path),
    [
      'videos/daily/2026-04-01/half.mp4',
      'gallery/approved/2026-04-01/old-clip.mp4',
      'videos/daily/2026-04-02/hidden.mp4',
      'videos/daily/2026-07-01/quarter.mp4',
      'videos/daily/2026-09-01/two-months.mp4',
      'videos/daily/2026-10-01/month.mp4',
    ],
  );
  assert.equal(thirty.items.some((item) => item.path.includes('waiting') || item.path.includes('recent') || item.path.includes('old-class') || item.path.includes('pending-clip')), false);

  const ninety = await listed('90');
  assert.equal(ninety.cutoff, '2026-08-14');
  assert.deepEqual(
    ninety.items.map((item) => item.path),
    [
      'videos/daily/2026-04-01/half.mp4',
      'gallery/approved/2026-04-01/old-clip.mp4',
      'videos/daily/2026-04-02/hidden.mp4',
      'videos/daily/2026-07-01/quarter.mp4',
    ],
  );
  assert.equal(ninety.count, 4);
  assert.equal(ninety.totalBytes, 8 + 11 + 10 + 7);
  assert.equal(ninety.truncated, false);

  const half = await listed('180');
  assert.deepEqual(
    half.items.map((item) => item.path),
    ['videos/daily/2026-04-01/half.mp4', 'gallery/approved/2026-04-01/old-clip.mp4', 'videos/daily/2026-04-02/hidden.mp4'],
  );

  const defaulted = await call(env, '/api/gym/cloud?op=list&purpose=old-videos', {}, owner);
  assert.equal(((await defaulted.json()) as { cutoff: string }).cutoff, '2026-08-14');
});

test('delete-media batch is capped, frees markers and leftover chunked uploads, and returns updated usage', async () => {
  const { bucket, env, owner } = await setup();
  const tooMany = Array.from({ length: MEDIA_DELETE_BATCH_MAX + 1 }, (_, index) => `videos/daily/2026-01-01/v${index}.mp4`);
  const refused = await post(env, owner, { action: 'delete-media', keys: tooMany });
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /100/);

  put(bucket, 'videos/daily/2026-05-01/old.mp4', 4, 'video/mp4');
  markPending(bucket, 'videos/daily/2026-05-01/old.mp4', 'rejected');
  put(bucket, 'gallery/approved/2026-05-01/clip.mp4', 5, 'video/mp4');
  put(bucket, 'gallery/rejected/2026-05-01/clip.mp4', 5, 'video/mp4'); // leftover sibling
  const leftover = `${BASE}videos/daily/2026-05-01/old.mp4`;
  const upload = await bucket.createMultipartUpload(leftover, { httpMetadata: { contentType: 'video/mp4' } });
  assert.equal(bucket.uploads.size, 1);

  const deleted = await post(env, owner, {
    action: 'delete-media',
    keys: ['videos/daily/2026-05-01/old.mp4', 'gallery/approved/2026-05-01/clip.mp4'],
  });
  assert.equal(deleted.status, 200);
  const body = (await deleted.json()) as { deleted: number; licenseUsedBytes: number; bucketUsedBytes: number; capBytes: number };
  assert.equal(body.deleted, 2);
  assert.equal(bucket.objects.has(leftover), false);
  assert.equal(bucket.objects.has(`${BASE}pending/daily/rejected/2026-05-01/old.mp4`), false);
  assert.equal(bucket.objects.has(`${BASE}gallery/approved/2026-05-01/clip.mp4`), false);
  assert.equal(bucket.objects.has(`${BASE}gallery/rejected/2026-05-01/clip.mp4`), false);
  assert.deepEqual(bucket.aborted, [leftover]);
  assert.equal(bucket.uploads.size, 0);
  assert.equal(body.licenseUsedBytes, 0);
  assert.equal(body.bucketUsedBytes, 0);
  assert.equal(body.capBytes, 100_000_000_000);
  // One batch delete call (keys fit well under 1,000).
  assert.ok(bucket.deletedBatches.some((batch) => batch.length >= 2));
});
