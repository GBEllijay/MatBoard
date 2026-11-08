import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOwnerTestGrant, clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { issueInstructorInvite } from '../lib/instructorSeats.ts';
import { seatIssueClientFailure } from '../lib/seatClient.ts';
import { verifyToken, type PrivateJwk } from '../lib/entitlementToken.ts';
import { keyedHash, normalizeCode } from './codeCrypto.ts';
import { handleCodeRedeem } from './codeRedeem.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { API_PRODUCT_ID, API_PRODUCT_PRO } from './routes.ts';
import { handleSeatIssue } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';

const pepper = 'alpha-redeem-pepper';
const now = new Date('2026-11-08T16:00:00.000Z');

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  return JSON.stringify(privateJwk);
}

async function catalog(code: string): Promise<string> {
  const hash = await keyedHash(normalizeCode(code), pepper, 'code');
  return JSON.stringify([{ id: 'alpha-pro', hash, kind: 'alpha-pro' }]);
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
  async delete(key: string) {
    this.objects.delete(key);
  }
  async list(options?: { prefix?: string }) {
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

function redeem(code: string, deviceId: string, ip: string): Request {
  return new Request('http://localhost/api/codes/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ code, deviceId }),
  });
}

function cloud(env: GymCloudEnv, path: string, bearer: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers }), env, () => now);
}

test('an alpha-pro code without an email is one license and Cloud stays on after refresh', async () => {
  resetRateLimitsForTests();
  const signing = await signingSecret();
  const material = signingMaterial(signing, 'k1');
  assert.ok(material);
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const db = sqliteD1();
  const code = 'fixture-alpha-pro';
  const env = { CODE_HASH_PEPPER: pepper, CODE_CATALOG: await catalog(code), ENTITLEMENT_SIGNING_KEY: signing, ENTITLEMENT_KEY_ID: 'k1' };
  const services = { db, signingKey: signing, keyId: 'k1' };
  const first = await handleCodeRedeem(redeem(code, 'fresh-device', '203.0.113.40'), env, null, null, () => now, services);
  assert.equal(first.status, 200);
  const opened = (await first.json()) as { token?: string };
  const claims = await verifyToken(opened.token ?? '', keys);
  assert.ok(claims);
  assert.equal(claims.src, 'code');
  assert.notEqual(claims.tier, 'seat');
  const rows = await db
    .prepare(`SELECT license_id AS licenseId, product FROM grants WHERE source_ref LIKE ?`)
    .bind('code:alpha-pro:fresh-device:%')
    .all<{ licenseId: string; product: string }>();
  const ids = new Set(rows.results.map((row) => row.licenseId));
  assert.equal(ids.size, 1);
  assert.equal(claims.sub, rows.results[0]?.licenseId);
  assert.equal(rows.results.some((row) => row.product === API_PRODUCT_PRO), true);

  const again = await handleCodeRedeem(redeem(code, 'fresh-device', '203.0.113.41'), env, null, null, () => now, services);
  const second = await verifyToken(((await again.json()) as { token: string }).token, keys);
  assert.equal(second?.sub, claims.sub);

  const bucket = new MemoryBucket();
  const cloudEnv: GymCloudEnv = { ...env, GYM_MEDIA: bucket, ENTITLEMENTS_DB: db };
  const status = await cloud(cloudEnv, '/api/gym/cloud?op=status', opened.token ?? '');
  assert.equal(((await status.json()) as { cloud: boolean }).cloud, true);
  const key = `groups/${claims.sub}/videos/daily/2026-11-08/fixture.jpg`;
  const uploaded = await cloud(cloudEnv, `/api/gym/cloud?key=${encodeURIComponent(key)}`, opened.token ?? '', {
    method: 'PUT',
    body: new Uint8Array([9, 8, 7]),
    headers: { 'content-type': 'image/jpeg' },
  });
  assert.equal(uploaded.status, 200);
  const listed = await cloud(cloudEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-08', opened.token ?? '');
  assert.equal(((await listed.json()) as { files: { path: string }[] }).files.some((file) => file.path.endsWith('fixture.jpg')), true);

  const refreshed = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', { method: 'POST', body: JSON.stringify({ token: opened.token }) }),
    env,
    db,
    () => now,
  );
  assert.equal(refreshed.status, 200);
  const refreshedToken = ((await refreshed.json()) as { token: string }).token;
  const kept = await cloud(cloudEnv, '/api/gym/cloud?op=status', refreshedToken);
  assert.equal(((await kept.json()) as { cloud: boolean }).cloud, true);

  const issued = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: opened.token, email: 'coach@example.com', preset: 'instructors' }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(issued.status, 200);
  const seatTok = await issueToken(signing, {
    licenseId: claims.sub,
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-phone',
    now,
    kind: 'seat',
    gym: claims.sub,
    sid: 'seat-1',
    preset: 'instructors',
  });
  assert.ok(seatTok);
  const denied = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: seatTok, email: 'other@example.com', preset: 'coach' }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { error: string }).error, 'Only the gym owner can issue invites.');

  const otherId = crypto.randomUUID();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(otherId, now.toISOString()).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, 'advantage-pro', 'code', 'other-pro', 'active', ?)`,
    )
    .bind(crypto.randomUUID(), otherId, now.toISOString())
    .run();
  const other = await issueToken(signing, {
    licenseId: otherId,
    grants: ['white', 'student', 'coach', 'pro', 'media'],
    tier: 'alpha',
    src: 'code',
    deviceId: 'other-phone',
    now,
    kind: 'code',
  });
  assert.ok(other);
  const hidden = await cloud(cloudEnv, '/api/gym/cloud?op=file&path=videos/daily/2026-11-08/fixture.jpg', other);
  assert.equal(hidden.status, 404);
});

test('a second redeem of a split code uses the existing Pro license and does not move the other row', async () => {
  resetRateLimitsForTests();
  const signing = await signingSecret();
  const material = signingMaterial(signing, 'k1');
  assert.ok(material);
  const db = sqliteD1();
  const deviceId = 'split-device';
  const whiteId = crypto.randomUUID();
  const proId = crypto.randomUUID();
  const stamp = now.toISOString();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(whiteId, stamp).run();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(proId, stamp).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, ?, 'code', ?, 'active', ?)`,
    )
    .bind(crypto.randomUUID(), whiteId, API_PRODUCT_ID, `code:alpha-pro:${deviceId}:white`, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, ?, 'code', ?, 'active', ?)`,
    )
    .bind(crypto.randomUUID(), proId, API_PRODUCT_PRO, `code:alpha-pro:${deviceId}:pro`, stamp)
    .run();
  const env = {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await catalog('fixture-split-pro'),
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
  };
  const response = await handleCodeRedeem(redeem('fixture-split-pro', deviceId, '203.0.113.50'), env, null, null, () => now, {
    db,
    signingKey: signing,
    keyId: 'k1',
  });
  assert.equal(response.status, 200);
  const claims = await verifyToken(((await response.json()) as { token: string }).token, [{ kid: material.kid, jwk: material.publicJwk }]);
  assert.equal(claims?.sub, proId);
  const white = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ?`)
    .bind(`code:alpha-pro:${deviceId}:white`)
    .first<{ licenseId: string }>();
  assert.equal(white?.licenseId, whiteId);
  const stale = await issueToken(signing, {
    licenseId: whiteId,
    grants: ['white', 'student', 'coach', 'pro', 'media'],
    tier: 'alpha',
    src: 'code',
    deviceId,
    now,
    kind: 'code',
  });
  assert.ok(stale);
  const refreshed = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', { method: 'POST', body: JSON.stringify({ token: stale }) }),
    env,
    db,
    () => now,
  );
  assert.equal(refreshed.status, 200);
  const repairedToken = ((await refreshed.json()) as { token: string }).token;
  const repaired = await verifyToken(repairedToken, [{ kid: material.kid, jwk: material.publicJwk }]);
  assert.equal(repaired?.sub, proId);
  const stillWhite = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ?`)
    .bind(`code:alpha-pro:${deviceId}:white`)
    .first<{ licenseId: string }>();
  assert.equal(stillWhite?.licenseId, whiteId);
  const cloudEnv: GymCloudEnv = { ...env, GYM_MEDIA: new MemoryBucket(), ENTITLEMENTS_DB: db };
  const status = await cloud(cloudEnv, '/api/gym/cloud?op=status', repairedToken);
  assert.equal(((await status.json()) as { cloud: boolean }).cloud, true);
});

test('a purchase with one email still shares one license', async () => {
  const db = sqliteD1();
  const stamp = now;
  const pro = await recordPurchase(db, {
    email: 'buyer@gym.com',
    product: API_PRODUCT_PRO,
    source: 'stripe_payment',
    sourceRef: 'cs_pro',
    sessionId: 'cs_buyer',
    pepper,
    now: stamp,
  });
  const media = await recordPurchase(db, {
    email: 'buyer@gym.com',
    product: 'advantage-media',
    source: 'stripe_payment',
    sourceRef: 'cs_media',
    sessionId: 'cs_buyer',
    pepper,
    now: stamp,
  });
  assert.equal(pro.licenseId, media.licenseId);
});

test('seat issue failures keep the server sentence, and a real owner pass is not blocked by a local seat preview', () => {
  assert.deepEqual(seatIssueClientFailure(403, { error: 'Only the gym owner can issue invites.' }), {
    reason: 'closed',
    detail: 'Only the gym owner can issue invites.',
  });
  assert.deepEqual(seatIssueClientFailure(403, { error: 'Advantage Pro is paused. Update payment before issuing a seat.' }), {
    reason: 'closed',
    detail: 'Advantage Pro is paused. Update payment before issuing a seat.',
  });
  assert.deepEqual(seatIssueClientFailure(503, { error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' }), {
    reason: 'closed',
    detail: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.',
  });
  assert.deepEqual(seatIssueClientFailure(409, { reason: 'cap' }), { reason: 'cap' });

  const memory = new Map<string, string>();
  const storage = {
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key: string) => memory.get(key) ?? null,
    key: (index: number) => [...memory.keys()][index] ?? null,
    removeItem: (key: string) => memory.delete(key),
    setItem: (key: string, value: string) => void memory.set(key, value),
  };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    assert.equal(applyOwnerTestGrant({ grants: ['seat'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'seat' }), true);
    const blocked = issueInstructorInvite({ email: 'coach@example.com', origin: 'https://advantage.test', token: 'local-seat' });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.reason, 'owner');
    clearOwnerTestGrant();
    assert.equal(applyOwnerTestGrant({ grants: ['pro', 'seat'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'all' }), true);
    const allowed = issueInstructorInvite({ email: 'coach@example.com', origin: 'https://advantage.test', token: 'local-owner' });
    assert.equal(allowed.ok, true);
  } finally {
    clearOwnerTestGrant();
  }
});
