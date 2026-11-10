/**
 * Fixture coverage for account ids. No Stripe network, no production D1, no owner catalog.
 * Redeem, refresh, and verified-email recovery must keep the existing academy.
 */

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyToken, type PrivateJwk } from '../lib/entitlementToken.ts';
import { sha256Hex } from '../lib/entitlementToken.ts';
import { ensureAccountForLicense, licenseForVerifiedEmail } from './accountId.ts';
import { keyedHash, normalizeCode } from './codeCrypto.ts';
import { handleCodeRedeem } from './codeRedeem.ts';
import { memoryEmailSender } from './emailSender.ts';
import { memoryEntitlementStore } from './entitlements.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { handleWebhook } from './handlers.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';
import { handleRestoreRequest, handleRestoreVerify } from './restoreAccess.ts';
import { handleSessionRedeem } from './sessionRedeem.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { signingMaterial } from './tokenIssue.ts';
import type { KvListBinding } from './codeCatalog.ts';

const pepper = 'account-id-fixture-pepper';
const start = new Date('2026-11-08T15:00:00.000Z');
const later = new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000);
const LICENSE = 'lic-owner-existing';
const OBJECT_KEY = `groups/${LICENSE}/videos/daily/2026-11-08/keep.mp4`;

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

async function ownerCatalog(code: string): Promise<string> {
  const hash = await keyedHash(normalizeCode(code), pepper, 'code');
  return JSON.stringify([{ id: 'fixture-owner', hash, kind: 'owner' }]);
}

function redeem(code: string, deviceId: string, extra: Record<string, unknown> = {}): Request {
  return new Request('https://advantagebjjtimer.com/api/codes/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${deviceId.length}` },
    body: JSON.stringify({ code, deviceId, ...extra }),
  });
}

function cloud(env: GymCloudEnv, path: string, bearer: string, now: Date): Promise<Response> {
  const headers = new Headers();
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { headers }), env, () => now);
}

async function count(db: ReturnType<typeof sqliteD1>, sql: string, ...bind: string[]): Promise<number> {
  const row = await db.prepare(sql).bind(...bind).first<{ total: number }>();
  return Number(row?.total ?? 0);
}

test('owner redeem, refresh, and verified email keep the same academy, seats, and R2 prefix', async () => {
  resetRateLimitsForTests();
  const signing = await signingSecret();
  const material = signingMaterial(signing, 'k1');
  assert.ok(material);
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const db = sqliteD1();
  const stamp = start.toISOString();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(LICENSE, stamp).run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at)
       VALUES (?, ?, 'advantage-pro', 'owner', 'owner-academy', 'active', ?, NULL)`,
    )
    .bind(crypto.randomUUID(), LICENSE, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at)
       VALUES (?, ?, 'advantage-cloud-pro', 'owner', 'owner-academy-cloud', 'active', ?, NULL)`,
    )
    .bind(crypto.randomUUID(), LICENSE, stamp)
    .run();
  const seatIds: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const id = `seat-${index}`;
    seatIds.push(id);
    await db
      .prepare(`INSERT INTO seats (id, gym_license_id, preset, status, created_at) VALUES (?, ?, 'instructors', 'claimed', ?)`)
      .bind(id, LICENSE, stamp)
      .run();
  }
  const studentCodes: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const code = `STUD-${index}`;
    studentCodes.push(code);
    await db
      .prepare(`INSERT INTO student_codes (code, license_id, status, created_at) VALUES (?, ?, 'issued', ?)`)
      .bind(code, LICENSE, stamp)
      .run();
  }
  const bucket = new MemoryBucket();
  bucket.objects.set(OBJECT_KEY, { bytes: Uint8Array.from([9, 9, 9]), type: 'video/mp4' });
  const code = 'fixture-owner-account';
  const env = {
    CODE_HASH_PEPPER: pepper,
    CODE_CATALOG: await ownerCatalog(code),
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    TURNSTILE_SECRET_KEY: 'turnstile-test',
  };
  const services = { db, signingKey: signing, keyId: 'k1' };
  const kv = new MemoryKv();

  const opened = await handleCodeRedeem(
    redeem(code, 'phone-a', { email: 'Owner@Gym.test' }),
    env,
    kv,
    null,
    () => start,
    services,
  );
  assert.equal(opened.status, 200);
  const first = (await opened.json()) as { token?: string; accountId?: string };
  const claims = await verifyToken(first.token ?? '', keys);
  assert.equal(claims?.sub, LICENSE);
  assert.equal(claims?.src, 'owner');
  assert.match(first.accountId ?? '', /^[0-9a-f-]{36}$/);
  const accountId = first.accountId ?? '';

  const again = await handleCodeRedeem(
    redeem(code, 'phone-b', { email: 'someone-else@gym.test', accountId: crypto.randomUUID() }),
    env,
    kv,
    null,
    () => start,
    services,
  );
  assert.equal(again.status, 200);
  const secondBody = (await again.json()) as { token?: string; accountId?: string };
  const second = await verifyToken(secondBody.token ?? '', keys);
  assert.equal(second?.sub, LICENSE);
  assert.equal(secondBody.accountId, accountId);

  const cloudEnv: GymCloudEnv = { ...env, GYM_MEDIA: bucket, ENTITLEMENTS_DB: db };
  const listed = await cloud(cloudEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-08', first.token ?? '', start);
  assert.equal(listed.status, 200);
  const files = ((await listed.json()) as { files: { path: string }[] }).files;
  assert.equal(files.some((file) => file.path === 'videos/daily/2026-11-08/keep.mp4'), true);

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
  const refreshedBody = (await refreshed.json()) as { token: string; accountId?: string };
  const renewed = await verifyToken(refreshedBody.token, keys);
  assert.equal(renewed?.sub, LICENSE);
  assert.equal(refreshedBody.accountId, accountId);

  const sender = memoryEmailSender();
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
  const requested = await handleRestoreRequest(
    new Request('http://localhost/api/restore/request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.50' },
      body: JSON.stringify({ email: 'owner@gym.test', turnstileToken: 'ok' }),
    }),
    env,
    db,
    sender,
    fetchImpl,
    () => later,
  );
  assert.equal(requested.status, 200);
  const requestedBody = (await requested.json()) as { challengeId?: string; accountId?: string; token?: string };
  assert.equal(requestedBody.accountId, undefined);
  assert.equal(requestedBody.token, undefined);
  assert.equal(Object.keys(requestedBody).includes('accountId'), false);
  const mailed = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  assert.equal(mailed.length, 8);

  const idOnly = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ accountId, email: 'owner@gym.test', deviceId: 'stolen-phone' }),
    }),
    env,
    db,
    () => later,
  );
  assert.equal(idOnly.status, 400);
  assert.equal(((await idOnly.json()) as { token?: string }).token, undefined);

  const emailOnly = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner@gym.test', deviceId: 'stolen-phone' }),
    }),
    env,
    db,
    () => later,
  );
  assert.equal(emailOnly.status, 400);

  const restored = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: requestedBody.challengeId, code: mailed, deviceId: 'new-phone' }),
    }),
    env,
    db,
    () => later,
  );
  assert.equal(restored.status, 200, await restored.clone().text());
  const restoredBody = (await restored.json()) as { token?: string; accountId?: string };
  const recovered = await verifyToken(restoredBody.token ?? '', keys);
  assert.equal(recovered?.sub, LICENSE);
  assert.equal(recovered?.src, 'owner');
  assert.equal(restoredBody.accountId, accountId);
  const kept = await cloud(cloudEnv, '/api/gym/cloud?op=list&purpose=daily-video&date=2026-11-08', restoredBody.token ?? '', later);
  assert.equal(kept.status, 200);
  const keptFiles = ((await kept.json()) as { files: { path: string }[] }).files;
  assert.equal(keptFiles.some((file) => file.path === 'videos/daily/2026-11-08/keep.mp4'), true);
  assert.equal(bucket.objects.has(OBJECT_KEY), true);

  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM licenses`), 1);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM accounts`), 1);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM grants WHERE source_ref = 'owner-academy'`), 1);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM seats WHERE gym_license_id = ? AND revoked_at IS NULL`, LICENSE), 5);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM student_codes WHERE license_id = ? AND status = 'issued'`, LICENSE), 5);
  const seatRows = await db
    .prepare(`SELECT id FROM seats WHERE gym_license_id = ? ORDER BY id`)
    .bind(LICENSE)
    .all<{ id: string }>();
  assert.deepEqual(seatRows.results.map((row) => row.id), seatIds);
  const codeRows = await db
    .prepare(`SELECT code FROM student_codes WHERE license_id = ? ORDER BY code`)
    .bind(LICENSE)
    .all<{ code: string }>();
  assert.deepEqual(codeRows.results.map((row) => row.code), studentCodes);
  const linked = await db
    .prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ?`)
    .bind(LICENSE)
    .first<{ accountId: string }>();
  assert.equal(linked?.accountId, accountId);
  const seatAccount = await db
    .prepare(`SELECT COUNT(*) AS total FROM seats WHERE gym_license_id = ? AND account_id = ?`)
    .bind(LICENSE, accountId)
    .first<{ total: number }>();
  assert.equal(Number(seatAccount?.total), 5);
  const storedEmail = await db
    .prepare(`SELECT email_normalized AS email FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first<{ email: string }>();
  assert.equal(storedEmail?.email, 'owner@gym.test');
  assert.equal(bucket.objects.has(OBJECT_KEY), true);
});

test('a verified email change keeps the account id and the license', async () => {
  resetRateLimitsForTests();
  const db = sqliteD1();
  const now = new Date('2026-11-09T12:00:00.000Z');
  const first = await recordPurchase(db, {
    email: 'old@gym.test',
    product: 'advantage-student',
    source: 'stripe_payment',
    sourceRef: 'cs_student_same',
    sessionId: 'cs_student_same',
    pepper,
    now,
  });
  const next = await recordPurchase(db, {
    email: 'new@gym.test',
    product: 'advantage-student',
    source: 'stripe_payment',
    sourceRef: 'cs_student_same',
    sessionId: 'cs_student_same',
    pepper,
    now: new Date(now.getTime() + 1000),
  });
  assert.equal(next.licenseId, first.licenseId);
  assert.equal(next.accountId, first.accountId);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM licenses`), 1);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM accounts`), 1);
  const found = await licenseForVerifiedEmail(db, 'new@gym.test', pepper);
  assert.equal(found?.accountId, first.accountId);
  assert.equal(found?.licenseId, first.licenseId);
  const oldIdentity = await db
    .prepare(`SELECT license_id AS licenseId FROM identities WHERE email_hash = ?`)
    .bind(await keyedHash('old@gym.test', pepper, 'email'))
    .first<{ licenseId: string }>();
  assert.equal(oldIdentity?.licenseId, first.licenseId);
  const again = await ensureAccountForLicense(db, {
    licenseId: first.licenseId,
    email: 'new@gym.test',
    pepper,
    now,
    replaceEmail: true,
  });
  assert.equal(again?.accountId, first.accountId);
});

test('stripe checkout and webhook attach one account id from the session email', async () => {
  resetRateLimitsForTests();
  const db = sqliteD1();
  const store = memoryEntitlementStore();
  const now = new Date('2026-11-09T15:00:00.000Z');
  const secret = 'whsec_account_fixture';
  const products = [
    ['advantage-student', 'student@gym.test', 'cs_student_acct'],
    ['advantage-media', 'media@gym.test', 'cs_media_acct'],
    ['advantage-coach', 'coach@gym.test', 'cs_coach_acct'],
    ['advantage-pro', 'pro@gym.test', 'cs_pro_acct'],
  ] as const;
  for (const [product, email, sessionId] of products) {
    const payload = JSON.stringify({
      id: `evt_${sessionId}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          amount_total: 1000,
          currency: 'usd',
          customer_details: { email },
          metadata: { product },
        },
      },
    });
    const timestamp = Math.floor(now.getTime() / 1000);
    const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    const response = await handleWebhook(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
        body: payload,
      }),
      { STRIPE_WEBHOOK_SECRET: secret },
      store,
      () => now,
      { db, pepper },
    );
    assert.equal(response.status, 200, await response.clone().text());
    const row = await db
      .prepare(
        `SELECT l.id AS licenseId, a.id AS accountId, a.email_normalized AS email
         FROM grants g
         JOIN licenses l ON l.id = g.license_id
         JOIN accounts a ON a.id = l.account_id
         WHERE g.source_ref = ?`,
      )
      .bind(sessionId)
      .first<{ licenseId: string; accountId: string; email: string }>();
    assert.equal(row?.email, email);
    assert.match(row?.accountId ?? '', /^[0-9a-f-]{36}$/);
  }
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM accounts`), 4);

  const repeat = JSON.stringify({
    id: 'evt_student_again',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_student_media',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 2999,
        currency: 'usd',
        customer_details: { email: 'Student@Gym.test' },
        metadata: { product: 'advantage-media' },
      },
    },
  });
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${repeat}`).digest('hex');
  const again = await handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      body: repeat,
    }),
    { STRIPE_WEBHOOK_SECRET: secret },
    store,
    () => now,
    { db, pepper },
  );
  assert.equal(again.status, 200);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM accounts WHERE email_normalized = 'student@gym.test'`), 1);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM licenses l JOIN identities i ON i.license_id = l.id WHERE i.email_hash IS NOT NULL`), 4);

  const signing = await signingSecret();
  const nonce = 'browser-nonce-value-1234';
  const nonceHash = await sha256Hex(nonce);
  const paid = async () =>
    new Response(
      JSON.stringify({
        id: 'cs_checkout_return',
        payment_status: 'paid',
        status: 'complete',
        mode: 'payment',
        client_reference_id: nonceHash,
        metadata: { product: 'advantage-pro' },
        customer_details: { email: 'Checkout.Pro@Gym.test' },
      }),
      { status: 200 },
    );
  const redeemed = await handleSessionRedeem(
    new Request('http://localhost/api/session/redeem', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '198.51.100.77' },
      body: JSON.stringify({ sessionId: 'cs_checkout_return', nonce, deviceId: 'buyer-phone' }),
    }),
    { STRIPE_SECRET_KEY: 'sk_test_fixture', ENTITLEMENT_SIGNING_KEY: signing, CODE_HASH_PEPPER: pepper },
    db,
    paid,
    null,
    () => now,
  );
  assert.equal(redeemed.status, 200, await redeemed.clone().text());
  const body = (await redeemed.json()) as { accountId?: string; email?: string; token?: string };
  assert.equal(body.email, undefined);
  assert.match(body.accountId ?? '', /^[0-9a-f-]{36}$/);
  const stored = await db
    .prepare(`SELECT email_normalized AS email FROM accounts WHERE id = ?`)
    .bind(body.accountId)
    .first<{ email: string }>();
  assert.equal(stored?.email, 'checkout.pro@gym.test');
  const secondRedeem = await handleSessionRedeem(
    new Request('http://localhost/api/session/redeem', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '198.51.100.78' },
      body: JSON.stringify({ sessionId: 'cs_checkout_return', nonce, deviceId: 'buyer-phone-2' }),
    }),
    { STRIPE_SECRET_KEY: 'sk_test_fixture', ENTITLEMENT_SIGNING_KEY: signing, CODE_HASH_PEPPER: pepper },
    db,
    paid,
    null,
    () => now,
  );
  const secondBody = (await secondRedeem.json()) as { accountId?: string };
  assert.equal(secondBody.accountId, body.accountId);
  assert.equal(await count(db, `SELECT COUNT(*) AS total FROM accounts WHERE email_normalized = 'checkout.pro@gym.test'`), 1);
});
