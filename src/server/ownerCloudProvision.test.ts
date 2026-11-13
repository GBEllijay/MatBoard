import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyToken, type PrivateJwk } from '../lib/entitlementToken.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { handleOwnerTest } from './ownerTest.ts';
import { handleSeatAccept, handleSeatIssue } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';

const now = new Date('2026-11-08T15:00:00.000Z');

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  return JSON.stringify(privateJwk);
}

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();

  async head(key: string) {
    const row = this.objects.get(key);
    return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
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
    return {
      objects: keys.map((key) => {
        const row = this.objects.get(key)!;
        return { key, size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
      }),
      truncated: false,
    };
  }

  async createMultipartUpload(): Promise<R2MultipartUpload> {
    throw new Error('unused');
  }

  resumeMultipartUpload(): R2MultipartUpload {
    throw new Error('unused');
  }
}

function post(secret: string, tier: string, ip: string): Request {
  return new Request('http://localhost/api/owner-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ secret, tier, days: 7, deviceId: 'owner-phone' }),
  });
}

test('owner unlock stores one academy, keeps Cloud after refresh, and isolates the folder', async () => {
  resetRateLimitsForTests();
  const secret = crypto.randomUUID();
  const signing = await signingSecret();
  const material = signingMaterial(signing, 'k1');
  assert.ok(material);
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const db = sqliteD1();
  const env = { OWNER_TEST_SECRET: secret, ENTITLEMENT_SIGNING_KEY: signing, ENTITLEMENT_KEY_ID: 'k1' };
  const services = { signingKey: signing, keyId: 'k1', db };

  const first = await handleOwnerTest(post(secret, 'all', '198.51.100.50'), env, null, () => now, services);
  assert.equal(first.status, 200);
  const opened = (await first.json()) as { token?: string; grants: string[] };
  assert.equal(opened.grants.includes('seat'), false);
  assert.equal(opened.grants.includes('pro'), true);
  const claims = await verifyToken(opened.token ?? '', keys);
  assert.ok(claims);
  assert.equal(claims.src, 'owner');
  assert.equal(claims.tier, 'owner');
  assert.notEqual(claims.sub, 'owner-test');
  assert.equal(claims.subs, undefined);

  const again = await handleOwnerTest(post(secret, 'pro', '198.51.100.51'), env, null, () => now, services);
  const second = await verifyToken(((await again.json()) as { token: string }).token, keys);
  assert.equal(second?.sub, claims.sub);

  const bucket = new MemoryBucket();
  const cloudEnv: GymCloudEnv = { ...env, GYM_MEDIA: bucket, ENTITLEMENTS_DB: db };
  const status = await cloud(cloudEnv, '/api/gym/cloud?op=status', opened.token ?? '');
  assert.equal(status.status, 200);
  assert.equal(((await status.json()) as { cloud: boolean }).cloud, true);

  const key = `groups/${claims.sub}/videos/daily/2026-11-08/fixture.jpg`;
  const uploaded = await cloud(cloudEnv, `/api/gym/cloud?key=${encodeURIComponent(key)}`, opened.token ?? '', {
    method: 'PUT',
    body: new Uint8Array([1, 2, 3, 4]),
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(uploaded.status, 200);
  const listed = await cloud(cloudEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-08', opened.token ?? '');
  const files = ((await listed.json()) as { files: { path: string }[] }).files;
  assert.equal(files.some((file) => file.path === 'videos/daily/2026-11-08/fixture.jpg'), true);

  const refreshed = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: opened.token }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(refreshed.status, 200);
  const refreshedToken = ((await refreshed.json()) as { token: string }).token;
  const next = await verifyToken(refreshedToken, keys);
  assert.equal(next?.sub, claims.sub);
  assert.equal(next?.src, 'owner');
  assert.notEqual(next?.tier, 'seat');
  const kept = await cloud(cloudEnv, '/api/gym/cloud?op=status', refreshedToken);
  assert.equal(((await kept.json()) as { cloud: boolean }).cloud, true);

  const issued = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: opened.token, email: 'instructor@example.com', preset: 'instructors' }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(issued.status, 200);
  const invite = ((await issued.json()) as { invite: string }).invite;
  const accepted = await handleSeatAccept(
    new Request('http://localhost/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite, deviceId: 'instructor-phone' }),
    }),
    env,
    db,
    fetch,
    () => now,
  );
  assert.equal(accepted.status, 200);
  const seatToken = ((await accepted.json()) as { token: string }).token;
  const seatClaims = await verifyToken(seatToken, keys);
  assert.equal(seatClaims?.tier, 'seat');
  assert.equal(seatClaims?.src, 'seat');
  const shared = await cloud(cloudEnv, '/api/gym/cloud?op=file&path=videos/daily/2026-11-08/fixture.jpg', seatToken);
  assert.equal(shared.status, 200);
  const seatIssue = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: seatToken, email: 'other@example.com', preset: 'coach' }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(seatIssue.status, 403);

  const otherId = crypto.randomUUID();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(otherId, now.toISOString()).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, 'advantage-pro', 'owner', 'other-academy', 'active', ?)`,
    )
    .bind(crypto.randomUUID(), otherId, now.toISOString())
    .run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, 'advantage-cloud-pro', 'owner', 'other-academy-cloud', 'active', ?)`,
    )
    .bind(crypto.randomUUID(), otherId, now.toISOString())
    .run();
  const other = await issueToken(signing, {
    licenseId: otherId,
    grants: ['pro', 'coach', 'student', 'white'],
    tier: 'owner',
    src: 'owner',
    deviceId: 'other-phone',
    now,
    kind: 'owner-test',
    ownerTestSeconds: 7 * 24 * 60 * 60,
  });
  assert.ok(other);
  const denied = await cloud(cloudEnv, '/api/gym/cloud?op=file&path=videos/daily/2026-11-08/fixture.jpg', other);
  assert.equal(denied.status, 404);
  const otherList = await cloud(cloudEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-08', other);
  assert.equal(((await otherList.json()) as { files: unknown[] }).files.length, 0);

  const stripeId = crypto.randomUUID();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(stripeId, now.toISOString()).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, 'advantage-pro', 'stripe_payment', 'cs_test', 'active', ?)`,
    )
    .bind(crypto.randomUUID(), stripeId, now.toISOString())
    .run();
  const stripe = await issueToken(signing, {
    licenseId: stripeId,
    grants: ['pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'buyer-phone',
    now,
    kind: 'pro',
  });
  assert.ok(stripe);
  const buyer = await cloud(cloudEnv, '/api/gym/cloud?op=status', stripe);
  assert.equal(((await buyer.json()) as { cloud: boolean }).cloud, false);

  const legacy = await issueToken(signing, {
    licenseId: 'owner-test',
    grants: ['pro', 'coach', 'student', 'white'],
    tier: 'owner',
    src: 'owner',
    deviceId: 'legacy-phone',
    now,
    kind: 'owner-test',
    ownerTestSeconds: 7 * 24 * 60 * 60,
  });
  const legacyRefresh = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: legacy }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(legacyRefresh.status, 200);
  const legacyClaims = await verifyToken(((await legacyRefresh.json()) as { token: string }).token, keys);
  assert.equal(legacyClaims?.sub, 'owner-test');
});

function cloud(env: GymCloudEnv, path: string, bearer: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers }), env, () => now);
}
