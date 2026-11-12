/**
 * Fixture owner academy. No catalog paste, no Stripe call, no production database.
 * The webhook and restore coverage lives in proCloudRestore.test.ts and is simulated there too.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyToken, type PrivateJwk } from '../lib/entitlementToken.ts';
import { DEFAULT_CLOUD_CAP_BYTES } from '../lib/advantageCloudMedia.ts';
import { keyedHash, normalizeCode } from './codeCrypto.ts';
import { handleCodeRedeem } from './codeRedeem.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { handleOwnerCodeReissue } from './ownerReissue.ts';
import { OWNER_SESSION_SECONDS } from './ownerCloudProvision.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';
import { handleSeatIssue } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleStudentLicenseClaim, handleStudentLicenseIssue } from './studentLicenses.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';
import type { KvListBinding } from './codeCatalog.ts';

const pepper = 'owner-perpetual-fixture-pepper';
const start = new Date('2026-11-08T15:00:00.000Z');
const later = new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000);

class MemoryKv implements KvListBinding {
  rows = new Map<string, string>();
  async get(key: string) {
    return this.rows.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.rows.set(key, value);
  }
  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? '';
    return { keys: [...this.rows.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })) };
  }
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

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  return JSON.stringify(privateJwk);
}

async function catalog(code: string, kind: 'owner' | 'alpha-pro'): Promise<string> {
  const hash = await keyedHash(normalizeCode(code), pepper, 'code');
  return JSON.stringify([{ id: `fixture-${kind}`, hash, kind }]);
}

function redeem(code: string, deviceId: string): Request {
  return new Request('https://advantagebjjtimer.com/api/codes/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${deviceId.length}` },
    body: JSON.stringify({ code, deviceId }),
  });
}

test('an owner code is one academy with no end, and an expired pass refreshes onto it', async () => {
  resetRateLimitsForTests();
  assert.equal(DEFAULT_CLOUD_CAP_BYTES, 100_000_000_000);
  const signing = await signingSecret();
  const material = signingMaterial(signing, 'k1');
  assert.ok(material);
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const db = sqliteD1();
  const kv = new MemoryKv();
  const code = 'fixture-owner-perpetual';
  const env = {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await catalog(code, 'owner'),
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
  };
  const services = { db, signingKey: signing, keyId: 'k1' };
  const opened = await handleCodeRedeem(redeem(code, 'phone-a'), env, kv, null, () => start, services);
  assert.equal(opened.status, 200);
  const first = (await opened.json()) as { ok: boolean; token?: string; expiresAt: string | null };
  assert.equal(first.ok, true);
  assert.equal(first.expiresAt, null);
  const claims = await verifyToken(first.token ?? '', keys);
  assert.ok(claims);
  assert.equal(claims.src, 'owner');
  assert.equal(claims.tier, 'owner');
  assert.equal(claims.grants.includes('pro'), true);
  assert.equal(claims.grants.includes('student'), true);
  assert.equal(claims.grants.includes('coach'), true);
  assert.equal(claims.exp - claims.iat, OWNER_SESSION_SECONDS);
  assert.ok(claims.exp < start.getTime() / 1000 + 40 * 24 * 60 * 60);

  const grant = await db
    .prepare(`SELECT ends_at AS endsAt, license_id AS licenseId FROM grants WHERE source_ref = 'owner-academy'`)
    .first<{ endsAt: string | null; licenseId: string }>();
  assert.equal(grant?.endsAt ?? null, null);
  assert.equal(grant?.licenseId, claims.sub);

  const again = await handleCodeRedeem(redeem(code, 'phone-b'), env, kv, null, () => start, services);
  const second = await verifyToken(((await again.json()) as { token: string }).token, keys);
  assert.equal(second?.sub, claims.sub);

  const bucket = new MemoryBucket();
  const cloudEnv: GymCloudEnv = { ...env, GYM_MEDIA: bucket, ENTITLEMENTS_DB: db };
  const status = await cloud(cloudEnv, '/api/gym/cloud?op=status', first.token ?? '', start);
  const statusBody = (await status.json()) as { cloud: boolean; capBytes: number };
  assert.equal(statusBody.cloud, true);
  assert.equal(statusBody.capBytes, DEFAULT_CLOUD_CAP_BYTES);

  const refreshed = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: first.token }),
    }),
    env,
    db,
    () => later,
  );
  assert.equal(refreshed.status, 200);
  const refreshedToken = ((await refreshed.json()) as { token: string }).token;
  const renewed = await verifyToken(refreshedToken, keys);
  assert.ok(renewed);
  assert.equal(renewed.sub, claims.sub);
  assert.equal(renewed.exp - renewed.iat, OWNER_SESSION_SECONDS);
  assert.ok(renewed.exp > later.getTime() / 1000);
  const kept = await cloud(cloudEnv, '/api/gym/cloud?op=status', refreshedToken, later);
  assert.equal(((await kept.json()) as { cloud: boolean }).cloud, true);

  for (let index = 0; index < 5; index += 1) {
    const issued = await handleSeatIssue(
      new Request('http://localhost/api/seats/issue', {
        method: 'POST',
        body: JSON.stringify({ token: first.token, email: `coach-${index}@example.com`, preset: 'instructors' }),
      }),
      env,
      db,
      () => start,
    );
    assert.equal(issued.status, 200);
  }
  const sixthSeat = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: first.token, email: 'coach-extra@example.com', preset: 'instructors' }),
    }),
    env,
    db,
    () => start,
  );
  assert.equal(sixthSeat.status, 409);

  for (let index = 0; index < 5; index += 1) {
    const issued = await handleStudentLicenseIssue(
      new Request('http://localhost/api/student-licenses/issue', {
        method: 'POST',
        body: JSON.stringify({ token: first.token }),
      }),
      env,
      db,
      () => start,
    );
    assert.equal(issued.status, 200, index === 0 ? await issued.clone().text() : '');
  }
  const sixthStudent = await handleStudentLicenseIssue(
    new Request('http://localhost/api/student-licenses/issue', {
      method: 'POST',
      body: JSON.stringify({ token: first.token }),
    }),
    env,
    db,
    () => start,
  );
  assert.equal(sixthStudent.status, 409);

  const listed = await db
    .prepare(`SELECT code FROM student_codes WHERE license_id = ? AND status = 'issued' LIMIT 1`)
    .bind(claims.sub)
    .first<{ code: string }>();
  assert.ok(listed);
  const claimed = await handleStudentLicenseClaim(
    new Request('http://localhost/api/student-licenses/claim', {
      method: 'POST',
      body: JSON.stringify({ code: listed.code, email: 'student@example.com', deviceId: 'student-phone' }),
    }),
    env,
    db,
    () => start,
  );
  assert.equal(claimed.status, 200);
  const student = await verifyToken(((await claimed.json()) as { token: string }).token, keys);
  assert.equal(student?.grants.includes('student'), true);
  assert.notEqual(student?.sub, claims.sub);

  const minted = await handleOwnerCodeReissue(
    new Request('https://advantagebjjtimer.com/api/owner/codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.20' },
      body: JSON.stringify({ token: first.token }),
    }),
    env,
    kv,
    db,
    () => later,
  );
  assert.equal(minted.status, 200);
  const mintedBody = (await minted.json()) as { code?: string };
  assert.equal(typeof mintedBody.code, 'string');
  const stored = [...kv.rows.values()].join('\n');
  assert.equal(stored.includes(mintedBody.code ?? 'missing'), false);
  const redeemed = await handleCodeRedeem(
    redeem(mintedBody.code ?? '', 'phone-c'),
    { ...env, CODE_CATALOG: '[]' },
    kv,
    null,
    () => later,
    services,
  );
  assert.equal(redeemed.status, 200);
  const third = await verifyToken(((await redeemed.json()) as { token: string }).token, keys);
  assert.equal(third?.sub, claims.sub);
  const seatCount = await db
    .prepare(`SELECT COUNT(*) AS total FROM seats WHERE gym_license_id = ? AND revoked_at IS NULL`)
    .bind(claims.sub)
    .first<{ total: number }>();
  assert.equal(Number(seatCount?.total), 5);
  const studentCount = await db
    .prepare(`SELECT COUNT(*) AS total FROM student_codes WHERE license_id = ? AND status IN ('issued', 'claimed')`)
    .bind(claims.sub)
    .first<{ total: number }>();
  assert.equal(Number(studentCount?.total), 5);

  const seat = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: first.token, email: 'still-full@example.com', preset: 'coach' }),
    }),
    env,
    db,
    () => later,
  );
  assert.equal(seat.status, 409);
  const accepted = await db
    .prepare(`SELECT id FROM seats WHERE gym_license_id = ? LIMIT 1`)
    .bind(claims.sub)
    .first<{ id: string }>();
  assert.ok(accepted);
  await db.prepare(`UPDATE seats SET status = 'claimed', claimed_device = ? WHERE id = ?`).bind('seat-phone', accepted.id).run();
  const seatPass = await issueToken(signing, {
    licenseId: claims.sub,
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-phone',
    now: later,
    kind: 'seat',
    gym: claims.sub,
    sid: accepted.id,
    preset: 'instructors',
  });
  assert.ok(seatPass);
  const seatReissue = await handleOwnerCodeReissue(
    new Request('https://advantagebjjtimer.com/api/owner/codes', {
      method: 'POST',
      body: JSON.stringify({ token: seatPass }),
    }),
    env,
    kv,
    db,
    () => later,
  );
  assert.equal(seatReissue.status, 403);

  const stripeId = crypto.randomUUID();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(stripeId, start.toISOString()).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at)
       VALUES (?, ?, 'advantage-pro', 'stripe_payment', 'cs_fixture', 'active', ?)`,
    )
    .bind(crypto.randomUUID(), stripeId, start.toISOString())
    .run();
  const stripe = await issueToken(signing, {
    licenseId: stripeId,
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'buyer',
    now: start,
    kind: 'pro',
  });
  assert.ok(stripe);
  const buyer = await cloud(cloudEnv, '/api/gym/cloud?op=status', stripe, start);
  assert.equal(((await buyer.json()) as { cloud: boolean }).cloud, false);
  const buyerReissue = await handleOwnerCodeReissue(
    new Request('https://advantagebjjtimer.com/api/owner/codes', {
      method: 'POST',
      body: JSON.stringify({ token: stripe }),
    }),
    env,
    kv,
    db,
    () => start,
  );
  assert.equal(buyerReissue.status, 403);

  const wrong = await handleCodeRedeem(redeem('not-a-real-code', 'phone-z'), env, kv, null, () => start, services);
  assert.equal(wrong.status, 400);

  const alpha = await handleCodeRedeem(
    redeem('fixture-alpha-pro', 'phone-alpha'),
    { ...env, CODE_CATALOG: await catalog('fixture-alpha-pro', 'alpha-pro') },
    kv,
    null,
    () => start,
    services,
  );
  assert.equal(alpha.status, 200);
  const alphaClaims = await verifyToken(((await alpha.json()) as { token: string }).token, keys);
  assert.notEqual(alphaClaims?.sub, claims.sub);
});

test('a dated owner-test grant still ends, and a missing database does not mint an owner pass', async () => {
  resetRateLimitsForTests();
  const signing = await signingSecret();
  const db = sqliteD1();
  const code = 'fixture-owner-dated';
  const env = {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await catalog(code, 'owner'),
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
  };
  const missing = await handleCodeRedeem(redeem(code, 'phone-a'), env, null, null, () => start, {
    signingKey: signing,
    keyId: 'k1',
  });
  assert.equal(missing.status, 503);

  const { provisionOwnerAcademy } = await import('./ownerCloudProvision.ts');
  const licenseId = (await provisionOwnerAcademy(db, { now: start, endsAt: new Date(start.getTime() + OWNER_SESSION_SECONDS * 1000).toISOString() })).licenseId;
  const material = signingMaterial(signing, 'k1');
  assert.ok(material);
  const token = await issueToken(signing, {
    licenseId,
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    tier: 'owner',
    src: 'owner',
    deviceId: 'dated-phone',
    now: start,
    kind: 'owner-test',
    ownerTestSeconds: OWNER_SESSION_SECONDS,
  });
  assert.ok(token);
  const ended = await handleTokenRefresh(
    new Request('https://advantagebjjtimer.com/api/token/refresh', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
    env,
    db,
    () => later,
  );
  assert.equal(ended.status, 401);
  const reissue = await handleOwnerCodeReissue(
    new Request('https://advantagebjjtimer.com/api/owner/codes', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
    env,
    new MemoryKv(),
    db,
    () => start,
  );
  assert.equal(reissue.status, 403);
});

function cloud(env: GymCloudEnv, path: string, bearer: string, now: Date): Promise<Response> {
  const headers = new Headers();
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { headers }), env, () => now);
}
