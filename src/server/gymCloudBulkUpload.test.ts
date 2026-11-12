import assert from 'node:assert/strict';
import test from 'node:test';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { findCloudDuplicate, handleGymCloud, licensePrefixOf, roomFor, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { CLOUD_LICENSE_HARD_LIMIT_BYTES, CLOUD_LICENSE_SOFT_LIMIT_BYTES, DEFAULT_CLOUD_CAP_BYTES, cloudCapBytes } from '../lib/advantageCloudMedia.ts';
import { sha256Hex } from '../lib/cloudFingerprint.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-10T18:00:00.000Z');

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  seq = 1;
  uploads = new Map<string, { key: string }>();

  async head(key: string) {
    const row = this.objects.get(key);
    if (!row) return null;
    return { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
  }

  async get(key: string) {
    const row = this.objects.get(key);
    if (!row) return null;
    return { body: streamFrom(row.bytes), size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
  }

  async delete(keys: string | string[]) {
    // R2 takes one key or a batch of up to 1,000.
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? '';
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = options?.cursor ? Math.max(0, keys.indexOf(options.cursor) + 1) : 0;
    const limit = options?.limit ?? keys.length;
    const slice = keys.slice(start, start + limit);
    return {
      objects: slice.map((key) => {
        const row = this.objects.get(key)!;
        return { key, size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
      }),
      truncated: start + limit < keys.length,
      cursor: start + limit < keys.length ? slice[slice.length - 1] : undefined,
    };
  }

  async createMultipartUpload(key: string): Promise<R2MultipartUpload> {
    this.uploads.set('unused', { key });
    throw new Error('unused');
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    return {
      key,
      uploadId,
      uploadPart: async () => ({ partNumber: 1, etag: 'e' }),
      complete: async () => undefined,
      abort: async () => undefined,
    };
  }
}

function fakeDb(seat: { status: string; revokedAt: string | null } | null): D1Database {
  return {
    prepare(sql: string) {
      const prepared = {
        bind() {
          return prepared;
        },
        async all<T>() {
          const grants = sql.includes('FROM grants')
            ? [{ licenseId: 'lic-owner1', product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null }]
            : [];
          return { results: grants as T[] };
        },
        async first<T>() {
          return (sql.includes('FROM seats') ? seat : null) as T | null;
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

async function token(signing: string, input: Parameters<typeof issueToken>[1]): Promise<string> {
  const issued = await issueToken(signing, input);
  assert.ok(issued);
  return issued;
}

function call(env: GymCloudEnv, path: string, init: RequestInit = {}, bearer = ''): Promise<Response> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers }), env, () => now);
}

async function start(env: GymCloudEnv, bearer: string, fileName: string, extra: Record<string, unknown> = {}) {
  return call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'gallery',
        dateKey: '2026-11-10',
        fileName,
        size: 4,
        mime: 'image/jpeg',
        lane: 'approved',
        ...extra,
      }),
    },
    bearer,
  );
}

async function putPhoto(env: GymCloudEnv, bearer: string, key: string, fingerprint = '') {
  const print = fingerprint ? `&fingerprint=${encodeURIComponent(fingerprint)}` : '';
  return call(env, `/api/gym/cloud?op=put&key=${encodeURIComponent(key)}${print}`, {
    method: 'PUT',
    body: 'jpeg',
    headers: { 'content-type': 'image/jpeg' },
  }, bearer);
}


async function setup() {
  const signing = await secret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ status: 'claimed', revokedAt: null }),
  };
  const owner = await token(signing, {
    licenseId: 'lic-owner1',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  const coach = await token(signing, {
    licenseId: 'lic-owner1',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'device-coach',
    now,
    kind: 'seat',
    gym: 'lic-owner1',
    sid: 'seat-coach',
    preset: 'coach',
  });
  return { bucket, env, owner, coach };
}

const JPEG_PRINT = async () => `v1-full-${await sha256Hex(new TextEncoder().encode('jpeg'))}`;

test('quota limits are per-license constants: 50 GB soft, 100 GB hard', () => {
  assert.equal(CLOUD_LICENSE_SOFT_LIMIT_BYTES, 50_000_000_000);
  assert.equal(CLOUD_LICENSE_HARD_LIMIT_BYTES, 100_000_000_000);
  assert.equal(DEFAULT_CLOUD_CAP_BYTES, CLOUD_LICENSE_HARD_LIMIT_BYTES);
  assert.equal(cloudCapBytes(undefined), CLOUD_LICENSE_HARD_LIMIT_BYTES);
  assert.equal(licensePrefixOf('groups/lic-a/gallery/approved/2026-11-10/a.jpg'), 'groups/lic-a/');
});

test('roomFor counts only the same license, not the whole bucket', async () => {
  const bucket = new MemoryBucket();
  bucket.objects.set('groups/other-gym/videos/daily/2026-11-10/big.mp4', { bytes: new Uint8Array(90), type: 'video/mp4' });
  bucket.objects.set('groups/lic-a/videos/daily/2026-11-10/mine.mp4', { bytes: new Uint8Array(6), type: 'video/mp4' });
  const room = await roomFor(bucket, 'groups/lic-a/gallery/approved/2026-11-10/x.jpg', 4, 10);
  assert.deepEqual(room, { ok: true, used: 6 });
  const tight = await roomFor(bucket, 'groups/lic-a/gallery/approved/2026-11-10/x.jpg', 5, 10);
  assert.equal(tight.ok, false);
  // Replacing an existing key only counts the difference.
  const replace = await roomFor(bucket, 'groups/lic-a/videos/daily/2026-11-10/mine.mp4', 10, 10);
  assert.equal(replace.ok, true);
});

test('another gym filling the bucket does not block this gym; this gym at its cap is refused', async () => {
  const { bucket, env, owner } = await setup();
  const capped: GymCloudEnv = { ...env, GYM_MEDIA_LICENSE_CAP_BYTES: '10' };
  bucket.objects.set('groups/other-gym/videos/daily/2026-11-10/huge.mp4', { bytes: new Uint8Array(500), type: 'video/mp4' });
  const okStart = await start(capped, owner, 'fits.jpg');
  assert.equal(okStart.status, 200);
  bucket.objects.set('groups/lic-owner1/videos/daily/2026-11-10/keep.mp4', { bytes: new Uint8Array(8), type: 'video/mp4' });
  const full = await start(capped, owner, 'nope.jpg');
  assert.equal(full.status, 409);
  assert.match(await full.text(), /Advantage Cloud is full for this gym/);
});

test('status reports this license only, with the soft and hard limits', async () => {
  const { bucket, env, owner } = await setup();
  bucket.objects.set('groups/other-gym/videos/daily/2026-11-10/huge.mp4', { bytes: new Uint8Array(500), type: 'video/mp4' });
  bucket.objects.set('groups/lic-owner1/videos/daily/2026-11-10/keep.mp4', { bytes: new Uint8Array(7), type: 'video/mp4' });
  const status = await call({ ...env, GYM_MEDIA_LICENSE_CAP_BYTES: '10' }, '/api/gym/cloud?op=status', {}, owner);
  const body = (await status.json()) as { licenseUsedBytes: number; bucketUsedBytes: number; capBytes: number; softLimitBytes: number };
  assert.equal(body.licenseUsedBytes, 7);
  assert.equal(body.bucketUsedBytes, 7, 'older builds read this; it no longer scans other gyms');
  assert.equal(body.capBytes, 10);
  assert.equal(body.softLimitBytes, 5);
  const defaults = await call(env, '/api/gym/cloud?op=status', {}, owner);
  const defaultBody = (await defaults.json()) as { capBytes: number; softLimitBytes: number };
  assert.equal(defaultBody.capBytes, 100_000_000_000);
  assert.equal(defaultBody.softLimitBytes, 50_000_000_000);
});

test('dedup: a verified single upload is skipped next time, for this gym only', async () => {
  const { bucket, env, owner } = await setup();
  const print = await JPEG_PRINT();
  const first = await start(env, owner, 'class.jpg', { fingerprint: print });
  const opened = (await first.json()) as { mode: string; key: string; path: string };
  assert.equal(opened.mode, 'single');
  assert.equal((await putPhoto(env, owner, opened.key, print)).status, 200);
  assert.equal(bucket.objects.has(`groups/lic-owner1/hashes/${print}.json`), true);

  const again = await start(env, owner, 'class-copy.jpg', { fingerprint: print });
  const dup = (await again.json()) as { mode: string; path: string; lane?: string };
  assert.equal(dup.mode, 'duplicate');
  assert.equal(dup.path, 'gallery/approved/2026-11-10/class.jpg');
  assert.equal(dup.lane, 'approved');
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/approved/2026-11-10/class-copy.jpg'), false);

  // Another license never sees this gym's fingerprints.
  assert.equal(await findCloudDuplicate(bucket, 'other-gym', print), null);
});

test('dedup: a wrong fingerprint on a single PUT is not recorded', async () => {
  const { bucket, env, owner } = await setup();
  const wrong = `v1-full-${'0'.repeat(64)}`;
  const first = await start(env, owner, 'class.jpg', { fingerprint: wrong });
  const opened = (await first.json()) as { key: string };
  assert.equal((await putPhoto(env, owner, opened.key, wrong)).status, 200);
  assert.equal(bucket.objects.has(`groups/lic-owner1/hashes/${wrong}.json`), false);
  const again = await start(env, owner, 'class2.jpg', { fingerprint: wrong });
  assert.equal(((await again.json()) as { mode: string }).mode, 'single');
});

test('dedup: pending upload stays a duplicate after approval; a rejected or deleted file can be sent again', async () => {
  const { bucket, env, owner, coach } = await setup();
  const print = await JPEG_PRINT();
  const first = await start(env, coach, 'coach.jpg', { fingerprint: print });
  const opened = (await first.json()) as { key: string; path: string };
  assert.equal(opened.path, 'gallery/pending/2026-11-10/coach.jpg');
  assert.equal((await putPhoto(env, coach, opened.key, print)).status, 200);
  const pendingDup = (await (await start(env, coach, 'again.jpg', { fingerprint: print })).json()) as { mode: string; lane?: string };
  assert.equal(pendingDup.mode, 'duplicate');
  assert.equal(pendingDup.lane, 'pending');

  const approve = await call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'gallery-approve', key: opened.path }) }, owner);
  assert.equal(approve.status, 200);
  const approvedDup = (await (await start(env, coach, 'again.jpg', { fingerprint: print })).json()) as { mode: string; path: string; lane?: string };
  assert.equal(approvedDup.mode, 'duplicate');
  assert.equal(approvedDup.path, 'gallery/approved/2026-11-10/coach.jpg');

  bucket.objects.delete('groups/lic-owner1/gallery/approved/2026-11-10/coach.jpg');
  const afterDelete = (await (await start(env, coach, 'again.jpg', { fingerprint: print })).json()) as { mode: string };
  assert.equal(afterDelete.mode, 'single');

  // Rejected: upload a fresh pending copy, reject it, then it may be sent again.
  const second = (await (await start(env, coach, 'redo.jpg', { fingerprint: print })).json()) as { key: string; path: string };
  assert.equal((await putPhoto(env, coach, second.key, print)).status, 200);
  const reject = await call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'gallery-reject', key: second.path }) }, owner);
  assert.equal(reject.status, 200);
  const afterReject = (await (await start(env, coach, 'redo2.jpg', { fingerprint: print })).json()) as { mode: string };
  assert.equal(afterReject.mode, 'single');
});

test('dedup ignores a malformed fingerprint and other purposes', async () => {
  const { env, owner } = await setup();
  const bad = await start(env, owner, 'x.jpg', { fingerprint: '../../etc' });
  assert.equal(((await bad.json()) as { mode: string }).mode, 'single');
});

// --- PR 515 deletes x PR 517 quota and dedup markers ---

const BASE = 'groups/lic-owner1/';

async function usage(env: GymCloudEnv, bearer: string): Promise<number> {
  const body = (await (await call(env, '/api/gym/cloud?op=status', {}, bearer)).json()) as { licenseUsedBytes: number };
  return body.licenseUsedBytes;
}

const postBody = (env: GymCloudEnv, bearer: string, body: Record<string, unknown>) =>
  call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify(body) }, bearer);

test('per-item delete lowers per-gym usage and removes the dedup marker so the file can be sent again', async () => {
  const { bucket, env, owner } = await setup();
  const print = await JPEG_PRINT();
  const opened = (await (await start(env, owner, 'class.jpg', { fingerprint: print })).json()) as { key: string; path: string };
  assert.equal((await putPhoto(env, owner, opened.key, print)).status, 200);
  assert.equal(bucket.objects.has(`${BASE}hashes/${print}.json`), true);
  assert.equal(bucket.objects.has(`${BASE}hashes/paths/${opened.path}.json`), true);
  const before = await usage(env, owner);
  assert.ok(before > 4);

  const removed = await postBody(env, owner, { action: 'delete-media', key: opened.path });
  assert.equal(removed.status, 200);
  const body = (await removed.json()) as { licenseUsedBytes: number; bucketUsedBytes: number; capBytes: number };
  assert.equal(body.licenseUsedBytes, 0);
  assert.equal(body.bucketUsedBytes, body.licenseUsedBytes);
  assert.equal(await usage(env, owner), body.licenseUsedBytes);
  assert.equal(bucket.objects.has(`${BASE}hashes/${print}.json`), false);
  assert.equal(bucket.objects.has(`${BASE}hashes/paths/${opened.path}.json`), false);

  const again = (await (await start(env, owner, 'class.jpg', { fingerprint: print })).json()) as { mode: string };
  assert.equal(again.mode, 'single');
});

test('approved-then-deleted gallery photo still finds its marker recorded under the pending path', async () => {
  const { bucket, env, owner, coach } = await setup();
  const print = await JPEG_PRINT();
  const opened = (await (await start(env, coach, 'coach.jpg', { fingerprint: print })).json()) as { key: string; path: string };
  assert.equal(opened.path, 'gallery/pending/2026-11-10/coach.jpg');
  assert.equal((await putPhoto(env, coach, opened.key, print)).status, 200);
  assert.equal((await postBody(env, owner, { action: 'gallery-approve', key: opened.path })).status, 200);
  const removed = await postBody(env, owner, { action: 'delete-media', key: 'gallery/approved/2026-11-10/coach.jpg' });
  assert.equal(removed.status, 200);
  assert.equal(bucket.objects.has(`${BASE}hashes/${print}.json`), false);
  assert.equal(await usage(env, owner), 0);
});

test('Review Inbox reject lowers usage and removes the dedup marker', async () => {
  const { bucket, env, owner, coach } = await setup();
  const print = await JPEG_PRINT();
  const opened = (await (await start(env, coach, 'coach.jpg', { fingerprint: print })).json()) as { key: string; path: string };
  assert.equal((await putPhoto(env, coach, opened.key, print)).status, 200);
  const before = await usage(env, owner);
  const reject = await postBody(env, owner, { action: 'gallery-reject', key: opened.path });
  assert.equal(reject.status, 200);
  assert.ok((await usage(env, owner)) < before);
  assert.equal(await usage(env, owner), 0);
  assert.equal(bucket.objects.has(`${BASE}hashes/${print}.json`), false);
  assert.equal(bucket.objects.has(`${BASE}hashes/paths/${opened.path}.json`), false);
});

test('bulk cleanup: old-videos total matches the per-gym status measure, and deleting drops usage and markers', async () => {
  const { bucket, env, owner } = await setup();
  const enc = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const prints = [`v1-full-${'a'.repeat(64)}`, `v1-full-${'b'.repeat(64)}`];
  const paths = ['videos/daily/2026-07-01/a.mp4', 'videos/daily/2026-07-02/b.mp4'];
  paths.forEach((path, i) => {
    bucket.objects.set(`${BASE}${path}`, { bytes: new Uint8Array(1000 * (i + 1)), type: 'video/mp4' });
    bucket.objects.set(`${BASE}hashes/${prints[i]}.json`, { bytes: enc({ path }), type: 'application/json' });
    bucket.objects.set(`${BASE}hashes/paths/${path}.json`, { bytes: enc({ fingerprint: prints[i] }), type: 'application/json' });
  });
  // A recent video and another gym's file stay put and never count against this gym.
  bucket.objects.set(`${BASE}videos/daily/2026-11-09/new.mp4`, { bytes: new Uint8Array(500), type: 'video/mp4' });
  bucket.objects.set('groups/other-gym/videos/daily/2026-07-01/a.mp4', { bytes: new Uint8Array(9999), type: 'video/mp4' });

  const listed = (await (await call(env, '/api/gym/cloud?op=list&purpose=old-videos&days=90', {}, owner)).json()) as {
    items: { path: string }[];
    totalBytes: number;
    licenseUsedBytes: number;
    capBytes: number;
  };
  assert.deepEqual(listed.items.map((item) => item.path).sort(), paths);
  assert.equal(listed.totalBytes, 3000);
  const statusBefore = await usage(env, owner);
  assert.equal(listed.licenseUsedBytes, statusBefore);
  assert.equal(listed.capBytes, CLOUD_LICENSE_HARD_LIMIT_BYTES);

  const removed = (await (await postBody(env, owner, { action: 'delete-media', keys: listed.items.map((item) => item.path) })).json()) as {
    licenseUsedBytes: number;
  };
  const statusAfter = await usage(env, owner);
  assert.equal(removed.licenseUsedBytes, statusAfter);
  assert.equal(statusAfter, 500);
  assert.ok(statusBefore - statusAfter >= listed.totalBytes);
  for (const [i, path] of paths.entries()) {
    assert.equal(bucket.objects.has(`${BASE}hashes/${prints[i]}.json`), false);
    assert.equal(bucket.objects.has(`${BASE}hashes/paths/${path}.json`), false);
  }
  assert.equal(bucket.objects.has('groups/other-gym/videos/daily/2026-07-01/a.mp4'), true);
});

test('a delete leaves a marker that was re-pointed at a newer copy', async () => {
  const { bucket, env, owner } = await setup();
  const enc = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const print = `v1-full-${'c'.repeat(64)}`;
  bucket.objects.set(`${BASE}videos/daily/2026-07-01/old.mp4`, { bytes: new Uint8Array(10), type: 'video/mp4' });
  bucket.objects.set(`${BASE}videos/daily/2026-11-09/new.mp4`, { bytes: new Uint8Array(10), type: 'video/mp4' });
  bucket.objects.set(`${BASE}hashes/paths/videos/daily/2026-07-01/old.mp4.json`, { bytes: enc({ fingerprint: print }), type: 'application/json' });
  bucket.objects.set(`${BASE}hashes/${print}.json`, { bytes: enc({ path: 'videos/daily/2026-11-09/new.mp4' }), type: 'application/json' });
  assert.equal((await postBody(env, owner, { action: 'delete-media', key: 'videos/daily/2026-07-01/old.mp4' })).status, 200);
  assert.equal(bucket.objects.has(`${BASE}hashes/${print}.json`), true);
  assert.equal(bucket.objects.has(`${BASE}hashes/paths/videos/daily/2026-07-01/old.mp4.json`), false);
});

test('a stale marker from before delete cleanup (no reverse key) is dropped on the next start', async () => {
  const { bucket, env, owner } = await setup();
  const print = await JPEG_PRINT();
  bucket.objects.set(`${BASE}hashes/${print}.json`, {
    bytes: new TextEncoder().encode(JSON.stringify({ path: 'gallery/approved/2026-11-01/gone.jpg' })),
    type: 'application/json',
  });
  const again = (await (await start(env, owner, 'gone.jpg', { fingerprint: print })).json()) as { mode: string };
  assert.equal(again.mode, 'single');
  assert.equal(bucket.objects.has(`${BASE}hashes/${print}.json`), false);
});
