import assert from 'node:assert/strict';
import test from 'node:test';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { STUDENT_CLOUD_REFUSED, STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import type { D1Database } from './d1.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket } from './gymCloud.ts';
import { handleStudentInbox, type InboxBucket } from './studentInbox.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-10T18:00:00.000Z');
const LICENSE = 'lic-owner1';

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();

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

  async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }) {
    void key;
    void options;
    throw new Error('unused');
  }

  resumeMultipartUpload(key: string, uploadId: string) {
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
            ? [{ product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null }]
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

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

async function token(secret: string, input: Parameters<typeof issueToken>[1]): Promise<string> {
  const issued = await issueToken(secret, input);
  assert.ok(issued);
  return issued;
}

function call(env: GymCloudEnv, path: string, init: RequestInit = {}, bearer = ''): Promise<Response> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers }), env, () => now);
}

test('instructor folders and from-instructor sends follow the seat and the student', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = {
    GYM_MEDIA: bucket,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ status: 'claimed', revokedAt: null }),
  };
  const seat = (preset: string, sid: string) =>
    token(secret, {
      licenseId: LICENSE,
      grants: ['pro'],
      tier: 'seat',
      src: 'seat',
      deviceId: sid,
      now,
      kind: 'seat',
      gym: LICENSE,
      sid,
      preset,
    });
  const owner = await token(secret, {
    licenseId: LICENSE,
    grants: ['pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'owner',
    now,
    kind: 'code',
  });
  const coach = await seat('coach', 'seat-coach');
  const other = await seat('instructors', 'seat-other');
  const assistant = await seat('assistant-coach', 'seat-assistant');
  const director = await seat('program-director', 'seat-director');
  const student = await token(secret, {
    licenseId: LICENSE,
    grants: ['student'],
    tier: 'student',
    src: 'code',
    deviceId: 'student',
    now,
    kind: 'code',
    preset: STUDENT_LICENSE_PRESET,
  });

  const startFolder = (bearer: string, purpose: string, fileName: string, studentId = '') =>
    call(
      env,
      '/api/gym/cloud',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'start', purpose, dateKey: '2026-11-10', fileName, size: 4, mime: purpose === 'instructor-photo' ? 'image/jpeg' : 'video/mp4', studentId }),
      },
      bearer,
    );

  const coachStart = await startFolder(coach, 'instructor-video', 'own.mp4');
  assert.equal(coachStart.status, 200);
  const coachOpened = (await coachStart.json()) as { path: string; key: string };
  assert.equal(coachOpened.path, 'instructors/seat-coach/videos/2026-11-10/own.mp4');
  assert.equal(
    (await call(env, `/api/gym/cloud?op=put&key=${encodeURIComponent(coachOpened.key)}`, { method: 'PUT', body: 'clip', headers: { 'content-type': 'video/mp4' } }, coach)).status,
    200,
  );
  const otherStart = await startFolder(other, 'instructor-photo', 'board.jpg');
  assert.equal(otherStart.status, 200);
  const otherOpened = (await otherStart.json()) as { path: string; key: string };
  assert.equal(
    (await call(env, `/api/gym/cloud?op=put&key=${encodeURIComponent(otherOpened.key)}`, { method: 'PUT', body: 'jpg', headers: { 'content-type': 'image/jpeg' } }, other)).status,
    200,
  );
  assert.equal((await call(env, `/api/gym/cloud?op=put&key=${encodeURIComponent(otherOpened.key)}`, { method: 'PUT', body: 'jpg', headers: { 'content-type': 'image/jpeg' } }, coach)).status, 403);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(otherOpened.path)}`, {}, coach)).status, 403);
  assert.equal((await call(env, `/api/gym/cloud?op=file&path=${encodeURIComponent(otherOpened.path)}`, {}, owner)).status, 200);
  assert.equal((await call(env, `/api/gym/cloud?op=list&purpose=instructor&kind=videos&date=2026-11-10&seat=seat-other`, {}, coach)).status, 403);
  const ownerList = await call(env, '/api/gym/cloud?op=list&purpose=instructor&kind=photos&date=2026-11-10', {}, owner);
  assert.deepEqual(((await ownerList.json()) as { files: { path: string }[] }).files.map((file) => file.path), [otherOpened.path]);
  assert.equal((await startFolder(owner, 'instructor-video', 'owner.mp4')).status, 403);
  assert.equal((await startFolder(assistant, 'instructor-video', 'asst.mp4')).status, 200);
  assert.equal((await startFolder(director, 'instructor-photo', 'pd.jpg')).status, 200);

  const daily = await call(
    env,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'start', purpose: 'daily-video', dateKey: '2026-11-10', fileName: 'class.mp4', size: 4, mime: 'video/mp4' }) },
    coach,
  );
  const dailyOpened = (await daily.json()) as { key: string; path: string };
  assert.equal(
    (await call(env, `/api/gym/cloud?op=put&key=${encodeURIComponent(dailyOpened.key)}`, { method: 'PUT', body: 'vid', headers: { 'content-type': 'video/mp4' } }, coach)).status,
    200,
  );
  const send = (bearer: string, studentId: string) =>
    call(env, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'send-to-student', key: dailyOpened.path, studentId, dateKey: '2026-11-10' }) }, bearer);
  assert.equal((await send(assistant, 'stu-alex')).status, 403);
  assert.equal((await send(director, 'stu-alex')).status, 403);
  const studentSend = await send(student, 'stu-alex');
  assert.equal(studentSend.status, 403);
  assert.equal(((await studentSend.json()) as { error?: string }).error, STUDENT_CLOUD_REFUSED);
  // A coach's daily video waits for approval (#cloud-media-approval), so it cannot be sent until approved.
  assert.equal((await send(coach, 'stu-alex')).status, 409);
  const approved = await call(
    env,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'daily-approve', key: dailyOpened.path }) },
    owner,
  );
  assert.equal(approved.status, 200);
  const sent = await send(coach, 'stu-alex');
  assert.equal(sent.status, 200);
  assert.equal(((await sent.json()) as { path: string }).path, 'students/stu-alex/from-instructor/2026-11-10/class.mp4');
  assert.equal((await send(owner, 'stu-bo')).status, 200);
  assert.equal((await call(env, '/api/gym/cloud?op=file&path=students%2Fstu-alex%2Ffrom-instructor%2F2026-11-10%2Fclass.mp4', {}, assistant)).status, 403);
  assert.equal((await call(env, '/api/gym/cloud?op=file&path=students%2Fstu-alex%2Ffrom-instructor%2F2026-11-10%2Fclass.mp4', {}, owner)).status, 200);

  const revokedEnv: GymCloudEnv = { ...env, ENTITLEMENTS_DB: fakeDb({ status: 'revoked', revokedAt: '2026-11-01T00:00:00.000Z' }) };
  const revokedStart = await call(
    revokedEnv,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'start', purpose: 'instructor-video', dateKey: '2026-11-10', fileName: 'nope.mp4', size: 4, mime: 'video/mp4' }) },
    coach,
  );
  assert.equal(revokedStart.status, 403);
  assert.match(await revokedStart.text(), /not active/);

  const fullEnv: GymCloudEnv = { ...env, GYM_MEDIA_CAP_BYTES: '8' };
  const fullSend = await call(
    fullEnv,
    '/api/gym/cloud',
    { method: 'POST', body: JSON.stringify({ action: 'send-to-student', key: dailyOpened.path, studentId: 'stu-cap', dateKey: '2026-11-10' }) },
    owner,
  );
  assert.equal(fullSend.status, 409);
  assert.equal(bucket.objects.has(`groups/${LICENSE}/students/stu-cap/from-instructor/2026-11-10/class.mp4`), false);
});

test('a student inbox pass reads only that student from-instructor folder', async () => {
  const secret = await signingSecret();
  const objects = new Map<string, string>();
  const bucket: InboxBucket = {
    async get(key) {
      const text = objects.get(key);
      if (text == null) return null;
      return { text: async () => text };
    },
    async put(key, value) {
      objects.set(key, value);
    },
    async delete(key) {
      objects.delete(key);
    },
    async list({ prefix }) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
  const owner = await token(secret, {
    licenseId: 'license01',
    grants: ['pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'owner',
    now,
    kind: 'code',
  });
  const passFor = async (studentId: string) => {
    const response = await handleStudentInbox(
      new Request('https://advantage.test/api/gym/inbox', {
        method: 'POST',
        headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'pass', license: 'license01', studentId }),
      }),
      { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
      () => now,
    );
    return ((await response.json()) as { studentPass: string }).studentPass;
  };
  const alex = await passFor('stu-alex');
  const bo = await passFor('stu-bo');
  objects.set('groups/license01/students/stu-alex/from-instructor/2026-11-10/class.mp4', 'alex-video');
  objects.set('groups/license01/students/stu-bo/from-instructor/2026-11-10/class.mp4', 'bo-video');
  const listed = await handleStudentInbox(
    new Request('https://advantage.test/api/gym/inbox?license=license01&studentId=stu-alex', { headers: { authorization: `Bearer ${alex}` } }),
    { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
    () => now,
  );
  const body = (await listed.json()) as { fromInstructor: { path: string }[] };
  assert.deepEqual(body.fromInstructor.map((file) => file.path), ['students/stu-alex/from-instructor/2026-11-10/class.mp4']);
  const file = await handleStudentInbox(
    new Request('https://advantage.test/api/gym/inbox?license=license01&studentId=stu-alex&file=students%2Fstu-alex%2Ffrom-instructor%2F2026-11-10%2Fclass.mp4', {
      headers: { authorization: `Bearer ${alex}` },
    }),
    { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
    () => now,
  );
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'alex-video');
  const other = await handleStudentInbox(
    new Request('https://advantage.test/api/gym/inbox?license=license01&studentId=stu-alex&file=students%2Fstu-bo%2Ffrom-instructor%2F2026-11-10%2Fclass.mp4', {
      headers: { authorization: `Bearer ${alex}` },
    }),
    { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
    () => now,
  );
  assert.equal(other.status, 404);
  const crossed = await handleStudentInbox(
    new Request('https://advantage.test/api/gym/inbox?license=license01&studentId=stu-bo', { headers: { authorization: `Bearer ${alex}` } }),
    { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' },
    () => now,
  );
  assert.equal(crossed.status, 403);
  assert.ok(bo);
});
