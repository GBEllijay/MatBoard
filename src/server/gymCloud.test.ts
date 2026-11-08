import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_CHUNK_BYTES, uploadAdvantageCloudFile } from '../lib/advantageCloudMedia.ts';
import { verifyToken, type PrivateJwk } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import {
  handleGymCloud,
  streamFrom,
  type GymCloudEnv,
  type GymMediaBucket,
  type R2MultipartUpload,
} from './gymCloud.ts';
import { handleSeatAccept, handleSeatIssue } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';

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

  const unreadDb = {
    prepare() {
      throw new Error('db down');
    },
    async exec() {
      return undefined;
    },
  } as D1Database;
  const unreadEnv: GymCloudEnv = { ...env, ENTITLEMENTS_DB: unreadDb };
  const codePro = await token(secret, {
    licenseId: 'lic-code-pro',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-code',
    now,
    kind: 'code',
  });
  const unread = await call(unreadEnv, '/api/gym/cloud?op=status', {}, codePro);
  assert.equal(unread.status, 503);
  assert.doesNotMatch(await unread.text(), /not on this license/);
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

test('custom skins sync under the license cap and the existing byte cap', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
  };
  const owner = await token(secret, {
    licenseId: 'lic-owner',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  const jpeg = new Uint8Array([1, 2, 3, 4]);
  async function putSkin(id: string, bytes: Uint8Array = jpeg) {
    const key = `groups/lic-owner/skins/${id}`;
    const image = await call(
      env,
      `/api/gym/cloud?op=put&key=${encodeURIComponent(key)}`,
      { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: bytes },
      owner,
    );
    const meta = await call(
      env,
      `/api/gym/cloud?op=put&key=${encodeURIComponent(`${key}.json`)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name: `Mat ${id}`, updatedAt: 5 }),
      },
      owner,
    );
    return { image, meta };
  }
  for (let i = 0; i < 10; i += 1) {
    const saved = await putSkin(`skin${String(i).padStart(8, '0')}`);
    assert.equal(saved.image.status, 200, String(i));
    assert.equal(saved.meta.status, 200, String(i));
  }
  const blocked = await putSkin('skin00000010');
  assert.equal(blocked.image.status, 409);
  assert.match(await blocked.image.text(), /Delete one first/);
  const listed = await call(env, '/api/gym/cloud?op=skins', {}, owner);
  const skins = ((await listed.json()) as { skins: { id: string; name: string }[] }).skins;
  assert.equal(skins.length, 10);
  assert.equal(skins.find((skin) => skin.id === 'skin00000000')?.name, 'Mat skin00000000');
  const file = await call(env, '/api/gym/cloud?op=file&path=skins%2Fskin00000000', {}, owner);
  assert.equal(file.status, 200);
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3, 4]);
  const removed = await call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'delete-skin', id: 'skin00000000' }) }, owner);
  assert.equal(removed.status, 200);
  assert.equal(bucket.objects.has('groups/lic-owner/skins/skin00000000'), false);
  const again = await putSkin('skin00000011');
  assert.equal(again.image.status, 200);
  const gif = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent('groups/lic-owner/skins/skin00000012')}`,
    { method: 'PUT', headers: { 'content-type': 'image/gif' }, body: jpeg },
    owner,
  );
  assert.equal(gif.status, 400);
  const tightBucket = new MemoryBucket();
  const tight: GymCloudEnv = { ...env, GYM_MEDIA: tightBucket, GYM_MEDIA_CAP_BYTES: '20' };
  const overCap = await call(
    tight,
    `/api/gym/cloud?op=put&key=${encodeURIComponent('groups/lic-owner/skins/skin00000013')}`,
    { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array(30) },
    owner,
  );
  assert.equal(overCap.status, 409);
  assert.match(await overCap.text(), /full/);
});

async function seatToken(secret: string, sid: string, preset: string): Promise<string> {
  return token(secret, {
    licenseId: 'owner-test',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: `device-${sid}`,
    now,
    kind: 'seat',
    gym: 'owner-test',
    sid,
    preset,
  } as Parameters<typeof issueToken>[1]);
}

function cloudFetcher(env: GymCloudEnv): typeof fetch {
  return async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handleGymCloud(new Request(raw, init), env, () => now);
  };
}

async function pendingFor(env: GymCloudEnv, bearer: string): Promise<{ status: number; rows: { path: string; status: string; seatId: string }[] }> {
  const response = await call(env, '/api/gym/cloud?op=pending', {}, bearer);
  const body = (await response.json()) as { pending?: { path: string; status: string; seatId: string }[] };
  return { status: response.status, rows: body.pending ?? [] };
}

function decide(env: GymCloudEnv, bearer: string, action: 'approve' | 'decline', key: string): Promise<Response> {
  return call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action, key }) }, bearer);
}

test('replay uploads from an assistant coach and a program director land pending; only the owner decides', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const owner = await token(secret, {
    licenseId: 'owner-test',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  const assistant = await seatToken(secret, 'seat-assistant', 'assistant-coach');
  const director = await seatToken(secret, 'seat-pd', 'program-director');
  const coach = await seatToken(secret, 'seat-coach', 'coach');
  const fetcher = cloudFetcher(env);

  const assistantStatus = (await (await call(env, '/api/gym/cloud?op=status', {}, assistant)).json()) as { canUpload: boolean; replayUpload: string };
  assert.equal(assistantStatus.canUpload, false);
  assert.equal(assistantStatus.replayUpload, 'pending');
  const pdStatus = (await (await call(env, '/api/gym/cloud?op=status', {}, director)).json()) as { cloud: boolean; replayUpload: string };
  assert.equal(pdStatus.cloud, false, 'PD still has no Cloud library');
  assert.equal(pdStatus.replayUpload, 'pending');

  // Assistant: pending, not lesson media.
  const sent = await uploadAdvantageCloudFile({
    purpose: 'replay-pending',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([1, 2, 3])], { type: 'video/mp4' }),
    fileName: 'round2.mp4',
    mime: 'video/mp4',
    token: assistant,
    fetcher,
  });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(sent.path, 'pending/replays/seat-assistant/2026-11-03/round2.mp4');
  assert.equal([...bucket.objects.keys()].some((key) => key.includes('/media/')), false);

  // PD: pending too (replay only).
  const pdSent = await uploadAdvantageCloudFile({
    purpose: 'replay-pending',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([7, 7])], { type: 'image/png' }),
    fileName: 'frame.png',
    mime: 'image/png',
    token: director,
    fetcher,
  });
  assert.equal(pdSent.ok, true);
  if (!pdSent.ok) return;
  assert.equal(pdSent.path, 'pending/replays/seat-pd/2026-11-03/frame.png');

  // Pending seats cannot use any other upload purpose.
  for (const bearer of [assistant, director]) {
    const other = await uploadAdvantageCloudFile({
      purpose: 'lesson-media',
      dateKey: '2026-11-03',
      file: new Blob([Uint8Array.from([1])], { type: 'video/mp4' }),
      fileName: 'sneak.mp4',
      mime: 'video/mp4',
      token: bearer,
      fetcher,
    });
    assert.equal(other.ok, false);
  }
  // A pending seat cannot PUT into another seat's pending folder.
  const crossKey = encodeURIComponent('groups/owner-test/pending/replays/seat-assistant/2026-11-03/x.mp4');
  const cross = await call(env, `/api/gym/cloud?key=${crossKey}`, { method: 'PUT', body: new Uint8Array([1]) }, director);
  assert.notEqual(cross.status, 200);

  // Visibility: owner sees both, each seat only its own, Coach none; the lesson list shows neither.
  assert.deepEqual((await pendingFor(env, owner)).rows.map((row) => row.seatId).sort(), ['seat-assistant', 'seat-pd']);
  assert.deepEqual((await pendingFor(env, assistant)).rows.map((row) => row.path), [sent.path]);
  assert.deepEqual((await pendingFor(env, director)).rows.map((row) => row.path), [pdSent.path]);
  assert.equal((await pendingFor(env, coach)).status, 403);
  const lessonList = (await (await call(env, '/api/gym/cloud?op=list&purpose=lesson&date=2026-11-03', {}, coach)).json()) as { files: unknown[] };
  assert.equal(lessonList.files.length, 0);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(sent.path)}`, {}, coach)).status, 404);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(sent.path)}`, {}, director)).status, 404);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(sent.path)}`, {}, assistant)).status, 200);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(sent.path)}`, {}, owner)).status, 200);

  // Only the owner decides.
  assert.equal((await decide(env, assistant, 'approve', sent.path)).status, 403);
  assert.equal((await decide(env, coach, 'approve', sent.path)).status, 403);

  // Approve: normal lesson media.
  const approved = await decide(env, owner, 'approve', sent.path);
  assert.equal(approved.status, 200);
  const approvedBody = (await approved.json()) as { path: string };
  assert.match(approvedBody.path, /^lessons\/current\/.+\/media\/2026-11-03\/round2\.mp4$/);
  assert.equal(bucket.objects.has(`groups/owner-test/${approvedBody.path}`), true);
  const afterApprove = (await (await call(env, '/api/gym/cloud?op=list&purpose=lesson&date=2026-11-03', {}, coach)).json()) as { files: { name: string }[] };
  assert.deepEqual(afterApprove.files.map((file) => file.name), ['round2.mp4']);

  // Decline: marked, never deleted.
  const declined = await decide(env, owner, 'decline', pdSent.path);
  assert.equal(declined.status, 200);
  assert.equal(bucket.objects.has(`groups/owner-test/${pdSent.path}`), true);
  assert.equal([...bucket.objects.keys()].some((key) => key.endsWith('/media/2026-11-03/frame.png')), false);
  const statuses = Object.fromEntries((await pendingFor(env, owner)).rows.map((row) => [row.seatId, row.status]));
  assert.deepEqual(statuses, { 'seat-assistant': 'approved', 'seat-pd': 'declined' });

  // Coach keeps direct upload.
  const direct = await uploadAdvantageCloudFile({
    purpose: 'lesson-media',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([5])], { type: 'video/mp4' }),
    fileName: 'coach.mp4',
    mime: 'video/mp4',
    token: coach,
    fetcher,
  });
  assert.equal(direct.ok, true);
  if (direct.ok) assert.match(direct.path, /^lessons\/current\/.+\/media\/2026-11-03\/coach\.mp4$/);
});

test('a revoked program director seat cannot send a pending replay', async () => {
  const secret = await signingSecret();
  const env: GymCloudEnv = {
    GYM_MEDIA: new MemoryBucket(),
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({
      grants: [
        { licenseId: 'owner-test', product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null },
      ],
      seat: { status: 'claimed', revokedAt: '2026-11-01T00:00:00.000Z' },
    }),
  };
  const director = await seatToken(secret, 'seat-pd', 'program-director');
  const sent = await uploadAdvantageCloudFile({
    purpose: 'replay-pending',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([1])], { type: 'video/mp4' }),
    fileName: 'late.mp4',
    mime: 'video/mp4',
    token: director,
    fetcher: cloudFetcher(env),
  });
  assert.equal(sent.ok, false);
});

test('a program director can only drop a video into today\'s daily videos, and a revoked or non-Plus-Cloud PD is refused', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  bucket.objects.set('groups/lic-code/lessons/current/2026-W45/2026-11-03.json', {
    bytes: Uint8Array.from([1, 2]),
    type: 'application/json',
  });
  const grants = [
    {
      licenseId: 'lic-code',
      product: 'advantage-pro',
      source: 'code',
      sourceRef: 'code:1',
      status: 'active',
      endsAt: null,
      revokedAt: null,
    },
  ];
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ grants, seat: { status: 'claimed', revokedAt: null } }),
  };
  const pd = await token(secret, {
    licenseId: 'lic-code',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'device-pd',
    now,
    kind: 'seat',
    gym: 'lic-code',
    sid: 'seat-pd',
    preset: 'program-director',
  });
  const post = (body: Record<string, unknown>, e: GymCloudEnv = env) =>
    call(e, '/api/gym/cloud', { method: 'POST', body: JSON.stringify(body) }, pd);

  const status = await call(env, '/api/gym/cloud?op=status', {}, pd);
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as { cloud: boolean; dailyVideoDrop?: boolean; canUpload?: boolean };
  assert.equal(statusBody.cloud, false, 'PD does not open the Cloud file list');
  assert.equal(statusBody.dailyVideoDrop, true);
  assert.notEqual(statusBody.canUpload, true);

  // Owner decision (Camera window): a PD may list today's videos. Every other read stays closed.
  assert.equal((await call(env, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, pd)).status, 200);
  assert.equal(
    (await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent('lessons/current/2026-W45/2026-11-03.json')}`, {}, pd)).status,
    403,
  );

  // Lesson plans and lesson media are refused.
  for (const purpose of ['lesson', 'lesson-media']) {
    const refused = await post({ action: 'start', purpose, dateKey: '2026-11-03', fileName: 'x.mp4', size: 4, mime: 'video/mp4' });
    assert.equal(refused.status, 403, purpose);
  }
  // Writing straight to a lesson key is refused.
  const sneaky = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent('groups/lic-code/lessons/current/2026-W45/2026-11-03.json')}`,
    { method: 'PUT', body: 'xx', headers: { 'content-type': 'video/mp4' } },
    pd,
  );
  assert.equal(sneaky.status, 403);
  assert.deepEqual([...bucket.objects.get('groups/lic-code/lessons/current/2026-W45/2026-11-03.json')!.bytes], [1, 2]);
  const skin = await post({ action: 'delete-skin', id: 'any' });
  assert.equal(skin.status, 403);

  // Today's daily video goes in.
  const started = await post({
    action: 'start',
    purpose: 'daily-video',
    dateKey: '2026-11-03',
    fileName: 'morning drill.mp4',
    size: 4,
    mime: 'video/mp4',
  });
  assert.equal(started.status, 200);
  const opened = (await started.json()) as { key: string; path: string; mode: string };
  assert.match(opened.path, /^videos\/daily\/2026-11-03\//);
  const put = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent(opened.key)}`,
    { method: 'PUT', body: Uint8Array.from([1, 2, 3, 4]), headers: { 'content-type': 'video/mp4' } },
    pd,
  );
  assert.equal(put.status, 200);
  assert.ok(bucket.objects.has(opened.key));
  // The same name again is refused instead of replacing the video already there.
  const again = await post({
    action: 'start',
    purpose: 'daily-video',
    dateKey: '2026-11-03',
    fileName: 'morning drill.mp4',
    size: 4,
    mime: 'video/mp4',
  });
  assert.equal(again.status, 409);
  // A non-video type on a daily key is never stored as that type.
  const notVideo = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent('groups/lic-code/videos/daily/2026-11-03/x.mp4')}`,
    { method: 'PUT', body: 'hi', headers: { 'content-type': 'text/html' } },
    pd,
  );
  if (notVideo.status === 200) {
    assert.notEqual(bucket.objects.get('groups/lic-code/videos/daily/2026-11-03/x.mp4')?.type, 'text/html');
  } else {
    assert.equal(notVideo.status, 400);
  }

  // A revoked PD seat is refused before anything else.
  const revokedEnv: GymCloudEnv = {
    ...env,
    ENTITLEMENTS_DB: fakeDb({ grants, seat: { status: 'claimed', revokedAt: '2026-11-01T00:00:00.000Z' } }),
  };
  assert.equal((await call(revokedEnv, '/api/gym/cloud?op=status', {}, pd)).status, 403);
  const revokedStart = await post(
    { action: 'start', purpose: 'daily-video', dateKey: '2026-11-03', fileName: 'a.mp4', size: 4, mime: 'video/mp4' },
    revokedEnv,
  );
  assert.equal(revokedStart.status, 403);

  // Without Plus Cloud the drop is not offered and not accepted.
  const noCloudEnv: GymCloudEnv = {
    ...env,
    ENTITLEMENTS_DB: fakeDb({
      grants: [{ ...grants[0], source: 'stripe_subscription', sourceRef: 'sub_1' }],
      seat: { status: 'claimed', revokedAt: null },
    }),
  };
  const noCloud = await call(noCloudEnv, '/api/gym/cloud?op=status', {}, pd);
  assert.equal(noCloud.status, 200);
  const noCloudBody = (await noCloud.json()) as { cloud: boolean; dailyVideoDrop?: boolean };
  assert.equal(noCloudBody.cloud, false);
  assert.notEqual(noCloudBody.dailyVideoDrop, true);
  const noCloudStart = await post(
    { action: 'start', purpose: 'daily-video', dateKey: '2026-11-03', fileName: 'a.mp4', size: 4, mime: 'video/mp4' },
    noCloudEnv,
  );
  assert.equal(noCloudStart.status, 403);
});

test('program director Camera window: reads videos/daily only; lessons, skins, gallery and other files stay refused', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const put = (key: string, type: string) =>
    bucket.objects.set(`groups/lic-code/${key}`, { bytes: Uint8Array.from([1, 2, 3]), type });
  put('videos/daily/2026-11-03/drill.mp4', 'video/mp4');
  put('lessons/current/2026-W45/2026-11-03.json', 'application/json');
  put('lessons/media/2026-11-03/plan.mp4', 'video/mp4');
  put('gallery/photo.jpg', 'image/jpeg');
  put('skins/skin-1.json', 'application/json');
  put('videos/pending/2026-11-03/late.mp4', 'video/mp4');
  const grants = [
    { licenseId: 'lic-code', product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null },
  ];
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ grants, seat: { status: 'claimed', revokedAt: null } }),
  };
  const seatTok = (preset: string, sid: string) =>
    token(secret, {
      licenseId: 'lic-code',
      grants: ['pro'],
      tier: 'seat',
      src: 'seat',
      deviceId: `device-${sid}`,
      now,
      kind: 'seat',
      gym: 'lic-code',
      sid,
      preset,
    });
  const pd = await seatTok('program-director', 'seat-pd');
  const file = (path: string, e: GymCloudEnv = env, tok = pd) =>
    call(e, `/api/gym/cloud?op=file&path=${encodeURIComponent(path)}`, {}, tok);

  const status = (await (await call(env, '/api/gym/cloud?op=status', {}, pd)).json()) as {
    cloud: boolean;
    dailyVideoPlay?: boolean;
  };
  assert.equal(status.cloud, false, 'still no general Cloud file list');
  assert.equal(status.dailyVideoPlay, true);

  // List today's videos: only videos/daily rows come back.
  const listed = await call(env, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, pd);
  assert.equal(listed.status, 200);
  const rows = ((await listed.json()) as { files: { path: string }[] }).files;
  assert.ok(rows.length >= 1);
  for (const row of rows) assert.match(row.path, /^videos\/daily\/2026-11-03\//);

  // Play one.
  const played = await file('videos/daily/2026-11-03/drill.mp4');
  assert.equal(played.status, 200);
  assert.deepEqual([...new Uint8Array(await played.arrayBuffer())], [1, 2, 3]);

  // Everything else is refused.
  for (const path of [
    'lessons/current/2026-W45/2026-11-03.json',
    'lessons/media/2026-11-03/plan.mp4',
    'gallery/photo.jpg',
    'skins/skin-1.json',
    'videos/pending/2026-11-03/late.mp4',
    'videos/daily/../../lessons/current/2026-W45/2026-11-03.json',
    'videos/daily/2026-11-03/',
  ]) {
    assert.equal((await file(path)).status, 403, path);
  }
  for (const purpose of ['lesson', 'lesson-media', 'gallery', 'replay-pending']) {
    const refused = await call(env, `/api/gym/cloud?op=list&purpose=${purpose}&date=2026-11-03`, {}, pd);
    assert.equal(refused.status, 403, purpose);
  }
  assert.equal((await call(env, '/api/gym/cloud?op=skins', {}, pd)).status, 403);
  assert.equal((await call(env, '/api/gym/cloud?op=usage', {}, pd)).status, 403);

  // A revoked seat is refused.
  const revokedEnv: GymCloudEnv = {
    ...env,
    ENTITLEMENTS_DB: fakeDb({ grants, seat: { status: 'claimed', revokedAt: '2026-11-01T00:00:00.000Z' } }),
  };
  assert.equal((await call(revokedEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, pd)).status, 403);
  assert.equal((await file('videos/daily/2026-11-03/drill.mp4', revokedEnv)).status, 403);

  // Without Plus Cloud the PD is refused.
  const noCloudEnv: GymCloudEnv = {
    ...env,
    ENTITLEMENTS_DB: fakeDb({
      grants: [{ ...grants[0], source: 'stripe_subscription', sourceRef: 'sub_1' }],
      seat: { status: 'claimed', revokedAt: null },
    }),
  };
  assert.equal((await call(noCloudEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, pd)).status, 403);
  assert.equal((await file('videos/daily/2026-11-03/drill.mp4', noCloudEnv)).status, 403);

  // Coach and assistant reads are unchanged: both still read lessons and today's videos.
  for (const [preset, sid] of [['coach', 'seat-coach'], ['assistant-coach', 'seat-assistant']] as const) {
    const tok = await seatTok(preset, sid);
    const st = (await (await call(env, '/api/gym/cloud?op=status', {}, tok)).json()) as { cloud: boolean; dailyVideoPlay?: boolean };
    assert.equal(st.cloud, true, preset);
    assert.notEqual(st.dailyVideoPlay, true, preset);
    assert.equal((await file('videos/daily/2026-11-03/drill.mp4', env, tok)).status, 200, preset);
    assert.equal((await file('lessons/current/2026-W45/2026-11-03.json', env, tok)).status, 200, preset);
  }
});

test('a paid Cloud add-on is the academy folder for an accepted instructor seat', async () => {
  const secret = await signingSecret();
  const material = signingMaterial(secret, 'k1');
  assert.ok(material);
  const db = sqliteD1();
  const licenseId = 'lic-paid-cloud';
  const stamp = now.toISOString();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(licenseId, stamp).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES ('g-pro', ?, 'advantage-pro', 'stripe_payment', 'cs_pro', 'active', ?)`,
    )
    .bind(licenseId, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES ('g-cloud', ?, 'advantage-cloud-pro', 'stripe_subscription', 'sub_cloud', 'active', ?)`,
    )
    .bind(licenseId, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO subscriptions (
         stripe_subscription_id, license_id, status, cancel_at_period_end, current_period_end, last_event_at, last_synced_at
       ) VALUES ('sub_cloud', ?, 'active', 0, NULL, ?, ?)`,
    )
    .bind(licenseId, stamp, stamp)
    .run();

  const signing = { ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const owner = await token(secret, {
    licenseId,
    grants: ['white', 'student', 'coach', 'pro', 'media'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner-phone',
    now,
    kind: 'pro',
    subs: { state: 'active' },
  });
  const ownerClaims = await verifyToken(owner, [{ kid: material.kid, jwk: material.publicJwk }]);
  assert.equal(ownerClaims?.sub, licenseId);
  assert.notEqual(ownerClaims?.subs?.cloud, true);

  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { ...signing, GYM_MEDIA: bucket, ENTITLEMENTS_DB: db };
  const issued = await handleSeatIssue(
    new Request('https://advantagebjjtimer.com/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: owner, email: 'coach@gym.test', preset: 'coach' }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(issued.status, 200);
  const issuedBody = (await issued.json()) as { invite: string; seatId: string };
  assert.equal(issuedBody.invite.split('.').length, 3);

  const accepted = await handleSeatAccept(
    new Request('https://advantagebjjtimer.com/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite: issuedBody.invite, deviceId: 'coach-phone' }),
    }),
    signing,
    db,
    async () => new Response('{}', { status: 200 }),
    () => now,
  );
  assert.equal(accepted.status, 200);
  const acceptedBody = (await accepted.json()) as { token: string; gymId: string; seatId: string };
  assert.equal(acceptedBody.gymId, licenseId);
  const seatClaims = await verifyToken(acceptedBody.token, [{ kid: material.kid, jwk: material.publicJwk }]);
  assert.equal(seatClaims?.gym, licenseId);
  assert.equal(seatClaims?.sub, licenseId);
  assert.equal(seatClaims?.sid, issuedBody.seatId);
  assert.equal(seatClaims?.preset, 'coach');

  const fetcher: typeof fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handleGymCloud(new Request(raw, init), env, () => now);
  };
  const saved = await uploadAdvantageCloudFile({
    purpose: 'daily-video',
    dateKey: '2026-11-03',
    file: new Blob([Uint8Array.from([7, 7, 7])], { type: 'video/mp4' }),
    fileName: 'armbar.mp4',
    mime: 'video/mp4',
    token: owner,
    fetcher,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  const storedKey = `groups/${licenseId}/videos/daily/2026-11-03/armbar.mp4`;
  assert.equal(bucket.objects.has(storedKey), true);

  const played = await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(saved.path)}`, {}, acceptedBody.token);
  assert.equal(played.status, 200);
  assert.deepEqual([...new Uint8Array(await played.arrayBuffer())], [7, 7, 7]);
  const listed = await call(env, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, acceptedBody.token);
  const listedBody = (await listed.json()) as { files: { name: string }[] };
  assert.deepEqual(listedBody.files.map((file) => file.name), ['armbar.mp4']);

  const assistantIssued = await handleSeatIssue(
    new Request('https://advantagebjjtimer.com/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: owner, email: 'assistant@gym.test', preset: 'assistant-coach' }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(assistantIssued.status, 200);
  const assistantInvite = ((await assistantIssued.json()) as { invite: string }).invite;
  const assistantAccepted = await handleSeatAccept(
    new Request('https://advantagebjjtimer.com/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite: assistantInvite, deviceId: 'assistant-phone' }),
    }),
    signing,
    db,
    async () => new Response('{}', { status: 200 }),
    () => now,
  );
  const assistantToken = ((await assistantAccepted.json()) as { token: string }).token;
  const assistantUpload = await call(
    env,
    '/api/gym/cloud',
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        purpose: 'daily-video',
        dateKey: '2026-11-03',
        fileName: 'nope.mp4',
        size: 3,
        mime: 'video/mp4',
      }),
    },
    assistantToken,
  );
  assert.equal(assistantUpload.status, 403);

  const directorIssued = await handleSeatIssue(
    new Request('https://advantagebjjtimer.com/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: owner, email: 'director@gym.test', preset: 'program-director' }),
    }),
    signing,
    db,
    () => now,
  );
  const directorInvite = ((await directorIssued.json()) as { invite: string }).invite;
  const directorAccepted = await handleSeatAccept(
    new Request('https://advantagebjjtimer.com/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite: directorInvite, deviceId: 'director-phone' }),
    }),
    signing,
    db,
    async () => new Response('{}', { status: 200 }),
    () => now,
  );
  const directorToken = ((await directorAccepted.json()) as { token: string }).token;
  const directorStatus = (await (await call(env, '/api/gym/cloud?op=status', {}, directorToken)).json()) as {
    cloud: boolean;
    dailyVideoDrop?: boolean;
  };
  assert.equal(directorStatus.cloud, false);
  assert.equal(directorStatus.dailyVideoDrop, true);
  assert.equal((await call(env, '/api/gym/cloud?op=list&purpose=lesson&date=2026-11-03', {}, directorToken)).status, 403);

  const otherId = 'lic-other-academy';
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(otherId, stamp).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES ('g-other-cloud', ?, 'advantage-cloud-pro', 'stripe_subscription', 'sub_other', 'active', ?)`,
    )
    .bind(otherId, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO subscriptions (
         stripe_subscription_id, license_id, status, cancel_at_period_end, last_event_at, last_synced_at
       ) VALUES ('sub_other', ?, 'active', 0, ?, ?)`,
    )
    .bind(otherId, stamp, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO seats (id, gym_license_id, preset, status, created_at, email_label, legacy)
       VALUES ('seat-other', ?, 'coach', 'claimed', ?, 'other@gym.test', 0)`,
    )
    .bind(otherId, stamp)
    .run();
  const otherSeat = await token(secret, {
    licenseId: otherId,
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'other-phone',
    now,
    kind: 'seat',
    gym: otherId,
    sid: 'seat-other',
    preset: 'coach',
    subs: { state: 'active' },
  });
  const otherList = (await (await call(env, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-03', {}, otherSeat)).json()) as {
    files: { name: string }[];
  };
  assert.deepEqual(otherList.files, []);
  const stolen = await call(
    env,
    `/api/gym/cloud?op=put&key=${encodeURIComponent(storedKey)}`,
    { method: 'PUT', body: 'nope', headers: { 'content-type': 'video/mp4' } },
    otherSeat,
  );
  assert.equal(stolen.status, 400);
  assert.equal(bucket.objects.get(storedKey)?.bytes.length, 3);

  const wrongGym = await token(secret, {
    licenseId: otherId,
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'coach-phone',
    now,
    kind: 'seat',
    gym: otherId,
    sid: issuedBody.seatId,
    preset: 'coach',
    subs: { state: 'active' },
  });
  assert.equal((await call(env, '/api/gym/cloud?op=status', {}, wrongGym)).status, 403);

  const refreshed = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: acceptedBody.token }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(refreshed.status, 200);
  const refreshedToken = ((await refreshed.json()) as { token: string }).token;
  const refreshedClaims = await verifyToken(refreshedToken, [{ kid: material.kid, jwk: material.publicJwk }]);
  assert.equal(refreshedClaims?.gym, licenseId);
  assert.equal(refreshedClaims?.sub, licenseId);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(saved.path)}`, {}, refreshedToken)).status, 200);

  await db
    .prepare(`UPDATE seats SET status = 'revoked', revoked_at = ? WHERE id = ?`)
    .bind(stamp, issuedBody.seatId)
    .run();
  assert.equal((await call(env, '/api/gym/cloud?op=status', {}, refreshedToken)).status, 403);
  const revokedRefresh = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: refreshedToken }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(revokedRefresh.status, 401);

  const ownerRefresh = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: owner }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(ownerRefresh.status, 200);
  const ownerNext = ((await ownerRefresh.json()) as { token: string }).token;
  const ownerNextClaims = await verifyToken(ownerNext, [{ kid: material.kid, jwk: material.publicJwk }]);
  assert.equal(ownerNextClaims?.sub, licenseId);
  assert.equal(ownerNextClaims?.subs?.cloud, true);
});

test('paid Cloud follows the stored subscription and a code exemption still opens without it', async () => {
  const secret = await signingSecret();
  const material = signingMaterial(secret, 'k1');
  assert.ok(material);
  const db = sqliteD1();
  const licenseId = 'lic-cloud-life';
  const stamp = now.toISOString();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(licenseId, stamp).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at, revoked_at)
       VALUES ('g-pro', ?, 'advantage-pro', 'stripe_payment', 'cs_pro', 'active', ?, NULL, NULL)`,
    )
    .bind(licenseId, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at, revoked_at)
       VALUES ('g-cloud', ?, 'advantage-cloud-pro', 'stripe_subscription', 'sub_cloud', 'active', ?, NULL, NULL)`,
    )
    .bind(licenseId, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO subscriptions (
         stripe_subscription_id, license_id, status, cancel_at_period_end, current_period_end, past_due_since, last_event_at, last_synced_at
       ) VALUES ('sub_cloud', ?, 'active', 0, NULL, NULL, ?, ?)`,
    )
    .bind(licenseId, stamp, stamp)
    .run();
  const signing = { ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { ...signing, GYM_MEDIA: bucket, ENTITLEMENTS_DB: db };
  const owner = await token(secret, {
    licenseId,
    grants: ['pro', 'coach', 'student', 'white'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner-phone',
    now,
    kind: 'pro',
    subs: { state: 'active', cloud: true },
  });
  const statusOf = async () => ((await (await call(env, '/api/gym/cloud?op=status', {}, owner)).json()) as { cloud: boolean }).cloud;

  await db
    .prepare(`UPDATE subscriptions SET cancel_at_period_end = 1, current_period_end = ? WHERE stripe_subscription_id = 'sub_cloud'`)
    .bind('2026-12-01T00:00:00.000Z')
    .run();
  assert.equal(await statusOf(), true);

  await db
    .prepare(`UPDATE subscriptions SET current_period_end = ? WHERE stripe_subscription_id = 'sub_cloud'`)
    .bind('2026-11-01T00:00:00.000Z')
    .run();
  assert.equal(await statusOf(), false);
  assert.equal(bucket.objects.size, 0);

  await db
    .prepare(
      `UPDATE subscriptions SET status = 'past_due', cancel_at_period_end = 0, current_period_end = NULL, past_due_since = ? WHERE stripe_subscription_id = 'sub_cloud'`,
    )
    .bind('2026-11-02T15:00:00.000Z')
    .run();
  assert.equal(await statusOf(), true);

  await db
    .prepare(`UPDATE subscriptions SET past_due_since = ? WHERE stripe_subscription_id = 'sub_cloud'`)
    .bind('2026-10-26T15:00:00.000Z')
    .run();
  assert.equal(await statusOf(), false);

  await db
    .prepare(`UPDATE subscriptions SET status = 'paused', past_due_since = NULL WHERE stripe_subscription_id = 'sub_cloud'`)
    .bind()
    .run();
  assert.equal(await statusOf(), false);

  await db
    .prepare(`UPDATE grants SET status = 'inactive', revoked_at = ? WHERE id = 'g-cloud'`)
    .bind(stamp)
    .run();
  await db.prepare(`UPDATE subscriptions SET status = 'active', past_due_since = NULL WHERE stripe_subscription_id = 'sub_cloud'`).run();
  assert.equal(await statusOf(), false);

  const bare = sqliteD1();
  await bare.prepare(`INSERT INTO licenses (id, created_at) VALUES ('lic-stripe-only', ?)`).bind(stamp).run();
  await bare
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES ('g-stripe', 'lic-stripe-only', 'advantage-pro', 'stripe_payment', 'cs_only', 'active', ?)`,
    )
    .bind(stamp)
    .run();
  const stripeOwner = await token(secret, {
    licenseId: 'lic-stripe-only',
    grants: ['pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'stripe-phone',
    now,
    kind: 'pro',
    subs: { state: 'active' },
  });
  const stripeEnv: GymCloudEnv = { ...signing, GYM_MEDIA: bucket, ENTITLEMENTS_DB: bare };
  assert.equal(((await (await call(stripeEnv, '/api/gym/cloud?op=status', {}, stripeOwner)).json()) as { cloud: boolean }).cloud, false);

  const coded = sqliteD1();
  await coded.prepare(`INSERT INTO licenses (id, created_at) VALUES ('lic-code-pro', ?)`).bind(stamp).run();
  await coded
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES ('g-code', 'lic-code-pro', 'advantage-pro', 'code', 'code:alpha', 'active', ?)`,
    )
    .bind(stamp)
    .run();
  const codeOwner = await token(secret, {
    licenseId: 'lic-code-pro',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'code-phone',
    now,
    kind: 'code',
  });
  const codeEnv: GymCloudEnv = { ...signing, GYM_MEDIA: bucket, ENTITLEMENTS_DB: coded };
  assert.equal(((await (await call(codeEnv, '/api/gym/cloud?op=status', {}, codeOwner)).json()) as { cloud: boolean }).cloud, true);

  const lapsedRefresh = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: owner }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(lapsedRefresh.status, 200);
  const lapsedClaims = await verifyToken(((await lapsedRefresh.json()) as { token: string }).token, [
    { kid: material!.kid, jwk: material!.publicJwk },
  ]);
  assert.equal(lapsedClaims?.sub, licenseId);
  assert.notEqual(lapsedClaims?.subs?.cloud, true);
});
