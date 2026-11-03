import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_CHUNK_BYTES, uploadAdvantageCloudFile } from '../lib/advantageCloudMedia.ts';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import {
  handleGymCloud,
  streamFrom,
  type GymCloudEnv,
  type GymMediaBucket,
  type R2MultipartUpload,
} from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-03T15:00:00.000Z');

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  return JSON.stringify(privateJwk);
}

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, Uint8Array>; type: string }>();
  seq = 1;

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

  async delete(key: string) {
    this.objects.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? '';
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = options?.cursor ? Math.max(0, keys.indexOf(options.cursor) + 1) : 0;
    const limit = options?.limit ?? keys.length;
    const slice = keys.slice(start, start + limit);
    const truncated = start + limit < keys.length;
    return {
      objects: slice.map((key) => {
        const row = this.objects.get(key)!;
        return { key, size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
      }),
      truncated,
      cursor: truncated ? slice[slice.length - 1] : undefined,
    };
  }

  async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2MultipartUpload> {
    const uploadId = `up-${this.seq}`;
    this.seq += 1;
    this.uploads.set(uploadId, {
      key,
      parts: new Map(),
      type: options?.httpMetadata?.contentType || 'application/octet-stream',
    });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    const row = this.uploads.get(uploadId);
    if (!row || row.key !== key) throw new Error('missing upload');
    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: ArrayBuffer | Uint8Array) => {
        const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
        row.parts.set(partNumber, bytes);
        return { partNumber, etag: `etag-${partNumber}-${bytes.byteLength}` };
      },
      complete: async (parts) => {
        const chunks = parts.map((part) => {
          const bytes = row.parts.get(part.partNumber);
          if (!bytes) throw new Error('missing part');
          return bytes;
        });
        const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        this.objects.set(key, { bytes, type: row.type });
        this.uploads.delete(uploadId);
      },
      abort: async () => {
        this.uploads.delete(uploadId);
      },
    };
  }
}

function fakeDb(input: {
  grants?: { licenseId: string; product: string; source: string; sourceRef: string | null; status: string; endsAt: string | null; revokedAt: string | null }[];
  seat?: { status: string; revokedAt: string | null } | null;
}): D1Database {
  return {
    prepare(sql: string) {
      const prepared = {
        bind() {
          return prepared;
        },
        async all<T>() {
          return { results: (sql.includes('FROM grants') ? input.grants ?? [] : []) as T[] };
        },
        async first<T>() {
          return (sql.includes('FROM seats') ? (input.seat ?? null) : null) as T | null;
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

async function token(secret: string, input: Parameters<typeof issueToken>[1]): Promise<string> {
  const issued = await issueToken(secret, input);
  assert.ok(issued);
  return issued;
}

function call(env: GymCloudEnv, path: string, init: RequestInit = {}, bearer = ''): Promise<Response> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  const request = new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers });
  return handleGymCloud(request, env, () => now);
}

test('cloud files require a bound bucket and a signed-in Plus Cloud license', async () => {
  const secret = await signingSecret();
  const missing = await call({}, '/api/gym/cloud?op=status');
  assert.equal(missing.status, 503);
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const signedOut = await call(env, '/api/gym/cloud?op=status');
  assert.equal(signedOut.status, 401);
  assert.match(await signedOut.text(), /Sign in/);

  const stripe = await token(secret, {
    licenseId: 'lic-stripe',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'device-stripe',
    now,
    kind: 'pro',
  });
  const stripeStatus = await call(env, '/api/gym/cloud?op=status', {}, stripe);
  assert.equal(stripeStatus.status, 200);
  assert.equal(((await stripeStatus.json()) as { cloud: boolean }).cloud, false);

  const coachOnly = await token(secret, {
    licenseId: 'lic-coach',
    grants: ['white', 'student', 'coach'],
    tier: 'coach',
    src: 'code',
    deviceId: 'device-coach',
    now,
    kind: 'code',
  });
  const coachStatus = await call(env, '/api/gym/cloud?op=status', {}, coachOnly);
  assert.equal(((await coachStatus.json()) as { cloud: boolean }).cloud, false);
});

test('an owner uploads, lists, and plays a daily video through the signed-in function', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const owner = await token(secret, {
    licenseId: 'lic-owner',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  const fetcher: typeof fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const request = new Request(raw, init);
    return handleGymCloud(request, env, () => now);
  };
  const saved = await uploadAdvantageCloudFile({
    purpose: 'daily-video',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'video/mp4' }),
    fileName: 'armbar.mp4',
    mime: 'video/mp4',
    token: owner,
    fetcher,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.path, 'videos/daily/2026-11-03/armbar.mp4');
  assert.equal(bucket.objects.has('groups/lic-owner/videos/daily/2026-11-03/armbar.mp4'), true);

  const listed = await call(env, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, owner);
  const listBody = (await listed.json()) as { files: { name: string; path: string }[] };
  assert.equal(listBody.files[0]?.name, 'armbar.mp4');
  const file = await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(saved.path)}`, {}, owner);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('cache-control') ?? '', /private/);
  assert.equal(file.headers.get('cache-control')?.includes('public'), false);
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3, 4]);
  const escaped = await call(env, '/api/gym/cloud?op=file&path=..%2Fsecret', {}, owner);
  assert.equal(escaped.status, 404);
  const gallery = await call(env, '/api/gym/cloud?op=file&path=gallery%2Fapproved%2F2026-11-03%2Fphoto.jpg', {}, owner);
  assert.equal(gallery.status, 404);

  const status = await call(env, '/api/gym/cloud?op=status', {}, owner);
  const statusBody = (await status.json()) as { cloud: boolean; canUpload: boolean; licenseUsedBytes: number; capBytes: number };
  assert.equal(statusBody.cloud, true);
  assert.equal(statusBody.canUpload, true);
  assert.equal(statusBody.licenseUsedBytes, 4);
  assert.equal(statusBody.capBytes, 8_000_000_000);
  const raw = JSON.stringify(statusBody);
  assert.equal(raw.includes('r2.dev'), false);
  assert.equal(raw.includes('http'), false);
});

test('a seated assistant can download and a coach can upload; a full bucket refuses the file', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  bucket.objects.set('groups/other/videos/daily/2026-11-03/keep.mp4', {
    bytes: Uint8Array.from([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]),
    type: 'video/mp4',
  });
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
    GYM_MEDIA_CAP_BYTES: '20',
    GYM_MEDIA_MAX_UPLOAD_BYTES: '12',
  };
  const assistant = await token(secret, {
    licenseId: 'owner-test',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'device-assistant',
    now,
    kind: 'seat',
    gym: 'owner-test',
    sid: 'seat-assistant',
    preset: 'assistant-coach',
  });
  const coach = await token(secret, {
    licenseId: 'owner-test',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'device-coach',
    now,
    kind: 'seat',
    gym: 'owner-test',
    sid: 'seat-coach',
    preset: 'coach',
  });
  const assistantStatus = await call(env, '/api/gym/cloud?op=status', {}, assistant);
  const assistantBody = (await assistantStatus.json()) as { cloud: boolean; canUpload: boolean };
  assert.equal(assistantBody.cloud, true);
  assert.equal(assistantBody.canUpload, false);
  const refused = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'daily-video',
        dateKey: '2026-11-03',
        fileName: 'nope.mp4',
        size: 4,
        mime: 'video/mp4',
      }),
    },
    assistant,
  );
  assert.equal(refused.status, 403);
  assert.match(await refused.text(), /Assistant coaches can play and download/);

  const tooBig = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'daily-video',
        dateKey: '2026-11-03',
        fileName: 'long.mp4',
        size: 13,
        mime: 'video/mp4',
      }),
    },
    coach,
  );
  assert.equal(tooBig.status, 413);
  assert.match(await tooBig.text(), /too large/);

  const full = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'lesson-media',
        dateKey: '2026-11-03',
        fileName: 'plan.mp4',
        size: 11,
        mime: 'video/mp4',
      }),
    },
    coach,
  );
  assert.equal(full.status, 409);
  const fullText = await full.text();
  assert.match(fullText, /Advantage Cloud is full/);
  assert.equal([...bucket.objects.keys()].some((key) => key.includes('plan')), false);

  const lesson = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'lesson',
        dateKey: '2026-11-03',
        fileName: 'ignored.json',
        size: 4,
        mime: 'application/json',
      }),
    },
    coach,
  );
  assert.equal(lesson.status, 200);
  const opened = (await lesson.json()) as { key: string; path: string; mode: string };
  assert.equal(opened.mode, 'single');
  assert.equal(opened.path, 'lessons/current/2026-W45/2026-11-03.json');
  const put = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent(opened.key)}`,
    { method: 'PUT', body: 'plan', headers: { 'content-type': 'application/json' } },
    coach,
  );
  assert.equal(put.status, 200);
  const played = await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(opened.path)}`, {}, assistant);
  assert.equal(played.status, 200);
  assert.equal(await played.text(), 'plan');
  const usage = await call(env, '/api/gym/cloud?op=status', {}, coach);
  const usageBody = (await usage.json()) as { licenseUsedBytes: number; bucketUsedBytes: number };
  assert.equal(usageBody.licenseUsedBytes, 4);
  assert.equal(usageBody.bucketUsedBytes, 14);
});

test('a video larger than one part is uploaded in chunks and a revoked seat cannot read it', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({
      grants: [
        {
          licenseId: 'lic-code',
          product: 'advantage-pro',
          source: 'code',
          sourceRef: 'code:1',
          status: 'active',
          endsAt: null,
          revokedAt: null,
        },
      ],
      seat: { status: 'claimed', revokedAt: null },
    }),
  };
  const coach = await token(secret, {
    licenseId: 'lic-code',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'device-seat',
    now,
    kind: 'seat',
    gym: 'lic-code',
    sid: 'seat-real',
    preset: 'instructors',
  });
  const started = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'daily-video',
        dateKey: '2026-11-03',
        fileName: 'long-class.mp4',
        size: CLOUD_CHUNK_BYTES + 4,
        mime: 'video/mp4',
      }),
    },
    coach,
  );
  assert.equal(started.status, 200);
  const opened = (await started.json()) as { mode: string; key: string; uploadId: string; partSize: number };
  assert.equal(opened.mode, 'multipart');
  assert.equal(opened.partSize, CLOUD_CHUNK_BYTES);
  const first = await call(
    env,
    `/api/gym/cloud?op=part&key=${encodeURIComponent(opened.key)}&uploadId=${encodeURIComponent(opened.uploadId)}&partNumber=1`,
    { method: 'PUT', body: Uint8Array.from([1, 2]) },
    coach,
  );
  const second = await call(
    env,
    `/api/gym/cloud?op=part&key=${encodeURIComponent(opened.key)}&uploadId=${encodeURIComponent(opened.uploadId)}&partNumber=2`,
    { method: 'PUT', body: Uint8Array.from([3, 4]) },
    coach,
  );
  const partBody = (await first.json()) as { etag: string };
  const secondBody = (await second.json()) as { etag: string };
  const done = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'complete',
        key: opened.key,
        uploadId: opened.uploadId,
        parts: [
          { partNumber: 1, etag: partBody.etag },
          { partNumber: 2, etag: secondBody.etag },
        ],
        size: 4,
      }),
    },
    coach,
  );
  assert.equal(done.status, 200);
  assert.deepEqual([...bucket.objects.get(opened.key)!.bytes], [1, 2, 3, 4]);

  const revokedEnv: GymCloudEnv = {
    ...env,
    ENTITLEMENTS_DB: fakeDb({
      grants: [
        {
          licenseId: 'lic-code',
          product: 'advantage-pro',
          source: 'code',
          sourceRef: 'code:1',
          status: 'active',
          endsAt: null,
          revokedAt: null,
        },
      ],
      seat: { status: 'claimed', revokedAt: '2026-11-01T00:00:00.000Z' },
    }),
  };
  const blocked = await call(revokedEnv, '/api/gym/cloud?op=status', {}, coach);
  assert.equal(blocked.status, 403);

  const stripeSeatEnv: GymCloudEnv = {
    ...env,
    ENTITLEMENTS_DB: fakeDb({
      grants: [
        {
          licenseId: 'lic-code',
          product: 'advantage-pro',
          source: 'stripe_subscription',
          sourceRef: 'sub_1',
          status: 'active',
          endsAt: null,
          revokedAt: null,
        },
      ],
      seat: { status: 'claimed', revokedAt: null },
    }),
  };
  const hidden = await call(stripeSeatEnv, '/api/gym/cloud?op=status', {}, coach);
  assert.equal(hidden.status, 200);
  assert.equal(((await hidden.json()) as { cloud: boolean }).cloud, false);
});
