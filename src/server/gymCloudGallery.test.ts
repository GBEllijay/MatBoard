import assert from 'node:assert/strict';
import test from 'node:test';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { STUDENT_CLOUD_REFUSED, STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import type { D1Database } from './d1.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
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

  async delete(key: string) {
    this.objects.delete(key);
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

async function start(env: GymCloudEnv, bearer: string, fileName: string) {
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
      }),
    },
    bearer,
  );
}

async function putPhoto(env: GymCloudEnv, bearer: string, key: string) {
  return call(env, `/api/gym/cloud?op=put&key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: 'jpeg',
    headers: { 'content-type': 'image/jpeg' },
  }, bearer);
}

test('gallery role matrix: owner approved, staff pending, approve and reject, revoked and student refused', async () => {
  const signing = await secret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ status: 'claimed', revokedAt: null }),
  };
  const seat = (preset: string, sid: string, license = 'lic-owner1') =>
    token(signing, {
      licenseId: license,
      grants: ['pro'],
      tier: 'seat',
      src: 'seat',
      deviceId: `device-${sid}`,
      now,
      kind: 'seat',
      gym: license,
      sid,
      preset,
    });
  const owner = await token(signing, {
    licenseId: 'lic-owner1',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  const coach = await seat('coach', 'seat-coach');
  const instructors = await seat('instructors', 'seat-instructors');
  const assistant = await seat('assistant-coach', 'seat-assistant');
  const director = await seat('program-director', 'seat-director');
  const student = await token(signing, {
    licenseId: 'lic-owner1',
    grants: ['student'],
    tier: 'student',
    src: 'code',
    deviceId: 'device-student',
    now,
    kind: 'code',
    preset: STUDENT_LICENSE_PRESET,
  });

  const ownerStart = await start(env, owner, 'owner-class.jpg');
  assert.equal(ownerStart.status, 200);
  const ownerOpened = (await ownerStart.json()) as { path: string; key: string };
  assert.equal(ownerOpened.path, 'gallery/approved/2026-11-10/owner-class.jpg');
  assert.equal((await putPhoto(env, owner, ownerOpened.key)).status, 200);
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/approved/2026-11-10/owner-class.jpg'), true);

  const coachStart = await start(env, coach, 'coach-class.jpg');
  assert.equal(coachStart.status, 200);
  const coachOpened = (await coachStart.json()) as { path: string; key: string };
  assert.equal(coachOpened.path, 'gallery/pending/2026-11-10/coach-class.jpg');
  assert.equal((await putPhoto(env, coach, coachOpened.key)).status, 200);
  const coachApprovedKey = ownerOpened.key.replace('owner-class.jpg', 'coach-class.jpg');
  assert.equal((await putPhoto(env, coach, coachApprovedKey)).status, 403);

  const instructorStart = await start(env, instructors, 'instructor-class.jpg');
  assert.equal(instructorStart.status, 200);
  const instructorOpened = (await instructorStart.json()) as { path: string; key: string };
  assert.equal(instructorOpened.path, 'gallery/pending/2026-11-10/instructor-class.jpg');
  assert.equal((await putPhoto(env, instructors, instructorOpened.key)).status, 200);

  assert.equal((await start(env, assistant, 'nope.jpg')).status, 403);
  assert.equal((await start(env, director, 'nope.jpg')).status, 403);
  const studentStart = await start(env, student, 'nope.jpg');
  assert.equal(studentStart.status, 403);
  assert.equal(((await studentStart.json()) as { error?: string }).error, STUDENT_CLOUD_REFUSED);

  const listed = await call(env, '/api/gym/cloud?op=list&purpose=gallery&lane=pending', {}, owner);
  const listBody = (await listed.json()) as { files: { path: string }[] };
  assert.deepEqual(
    listBody.files.map((file) => file.path).sort(),
    ['gallery/pending/2026-11-10/coach-class.jpg', 'gallery/pending/2026-11-10/instructor-class.jpg'],
  );
  const assistantList = await call(env, '/api/gym/cloud?op=list&purpose=gallery&lane=pending', {}, assistant);
  assert.equal(assistantList.status, 200);
  const directorList = await call(env, '/api/gym/cloud?op=list&purpose=gallery&lane=pending', {}, director);
  assert.equal(directorList.status, 403);

  const coachApprove = await call(
    env,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'gallery-approve', key: coachOpened.path }) },
    coach,
  );
  assert.equal(coachApprove.status, 403);
  const approved = await call(
    env,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'gallery-approve', key: coachOpened.path }) },
    instructors,
  );
  assert.equal(approved.status, 200);
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/approved/2026-11-10/coach-class.jpg'), true);
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/pending/2026-11-10/coach-class.jpg'), false);

  const rejected = await call(
    env,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'gallery-reject', key: instructorOpened.path }) },
    owner,
  );
  assert.equal(rejected.status, 200);
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/rejected/2026-11-10/instructor-class.jpg'), true);
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/pending/2026-11-10/instructor-class.jpg'), false);

  const pendingAfter = await call(env, '/api/gym/cloud?op=list&purpose=gallery&lane=pending', {}, owner);
  assert.deepEqual(((await pendingAfter.json()) as { files: unknown[] }).files, []);

  const revokedEnv: GymCloudEnv = { ...env, ENTITLEMENTS_DB: fakeDb({ status: 'revoked', revokedAt: '2026-11-10T00:00:00.000Z' }) };
  const revoked = await start(revokedEnv, coach, 'revoked.jpg');
  assert.equal(revoked.status, 403);
  assert.match(await revoked.text(), /not active/);

  const fullEnv: GymCloudEnv = { ...env, GYM_MEDIA_CAP_BYTES: '4' };
  bucket.objects.set('groups/lic-owner1/videos/daily/2026-11-10/keep.mp4', { bytes: Uint8Array.from([9, 9, 9, 9]), type: 'video/mp4' });
  const full = await start(fullEnv, owner, 'full.jpg');
  assert.equal(full.status, 409);
  assert.match(await full.text(), /Advantage Cloud is full/);
  assert.equal(bucket.objects.has('groups/lic-owner1/gallery/approved/2026-11-10/full.jpg'), false);
});
