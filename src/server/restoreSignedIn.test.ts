import assert from 'node:assert/strict';
import test from 'node:test';
import { keyedHash, normalizeEmail } from './codeCrypto.ts';
import { memoryEmailSender } from './emailSender.ts';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { signToken } from '../lib/entitlementToken.ts';
import { handleRestoreRequest, RESTORE_GENERIC, RESTORE_SESSION_INVALID, RESTORE_SIGNED_IN } from './restoreAccess.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { issueToken } from './tokenIssue.ts';

const pepper = 'restore-signed-in-pepper';
const now = new Date('2026-11-14T12:00:00.000Z');

async function pair(): Promise<{ secret: string; publicJwk: PublicJwk; kid: string }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return {
    secret: JSON.stringify(privateJwk),
    publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y },
    kid: 'k1',
  };
}

function env(secret: string) {
  return {
    CODE_HASH_PEPPER: pepper,
    TURNSTILE_SECRET_KEY: 'turnstile-test',
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: 'k1',
  };
}

const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });

function post(body: unknown, ip = '203.0.113.40') {
  return new Request('http://localhost/api/restore/request', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

test('a signed-in session emails the address on file without an email input or Turnstile', async () => {
  const db = sqliteD1();
  const keys = await pair();
  const sender = memoryEmailSender();
  const purchase = await recordPurchase(db, {
    email: 'Owner@Gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_owner',
    sessionId: 'cs_owner',
    pepper,
    now,
  });
  const token = await issueToken(keys.secret, {
    licenseId: purchase.licenseId,
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'phone-1',
    now,
    kind: 'pro',
  });
  assert.ok(token);
  const response = await handleRestoreRequest(
    post({ sessionToken: token, email: 'attacker@evil.test' }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  const body = (await response.json()) as { ok: boolean; message: string; challengeId: string; emailHint?: string };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.message, RESTORE_SIGNED_IN);
  assert.equal(body.emailHint, 'o***@gym.test');
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]?.to, 'owner@gym.test');
  assert.equal((sender.sent[0]?.to ?? '').includes('attacker'), false);
});

test('a signed-out request still requires an email and Turnstile', async () => {
  const db = sqliteD1();
  const keys = await pair();
  const sender = memoryEmailSender();
  await recordPurchase(db, {
    email: 'buyer@gym.test',
    product: 'advantage-white',
    source: 'stripe_payment',
    sourceRef: 'cs_buyer',
    sessionId: 'cs_buyer',
    pepper,
    now,
  });
  const missingEmail = await handleRestoreRequest(
    post({ turnstileToken: 'ok' }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  assert.equal(missingEmail.status, 400);
  assert.equal(((await missingEmail.json()) as { error?: string }).error, 'Enter the email from your purchase.');
  assert.equal(sender.sent.length, 0);

  const missingTurnstile = await handleRestoreRequest(
    post({ email: 'buyer@gym.test', turnstileToken: '' }),
    env(keys.secret),
    db,
    sender,
    async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
    () => now,
  );
  assert.equal(missingTurnstile.status, 400);
  assert.equal(((await missingTurnstile.json()) as { error?: string }).error, 'Confirm you are a person and try again.');
  assert.equal(sender.sent.length, 0);

  const ok = await handleRestoreRequest(
    post({ email: 'buyer@gym.test', turnstileToken: 'ok' }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  const body = (await ok.json()) as { ok: boolean; message: string; emailHint?: string };
  assert.equal(ok.status, 200);
  assert.equal(body.message, RESTORE_GENERIC);
  assert.equal(body.emailHint, undefined);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]?.to, 'buyer@gym.test');
});

test('a forged or mismatched session is rejected and no email is sent', async () => {
  const db = sqliteD1();
  const keys = await pair();
  const other = await pair();
  const sender = memoryEmailSender();
  const purchase = await recordPurchase(db, {
    email: 'buyer@gym.test',
    product: 'advantage-white',
    source: 'stripe_payment',
    sourceRef: 'cs_forged',
    sessionId: 'cs_forged',
    pepper,
    now,
  });
  const valid = await issueToken(keys.secret, {
    licenseId: purchase.licenseId,
    grants: ['white'],
    tier: 'white',
    src: 'stripe',
    deviceId: 'phone-2',
    now,
    kind: 'onetime',
  });
  assert.ok(valid);

  const forged = await handleRestoreRequest(
    post({ sessionToken: 'not-a-token' }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  assert.equal(forged.status, 400);
  assert.equal(((await forged.json()) as { error?: string }).error, RESTORE_SESSION_INVALID);

  const wrongKey = await issueToken(other.secret, {
    licenseId: purchase.licenseId,
    grants: ['white'],
    tier: 'white',
    src: 'stripe',
    deviceId: 'phone-2',
    now,
    kind: 'onetime',
  });
  assert.ok(wrongKey);
  const mismatched = await handleRestoreRequest(
    post({ sessionToken: wrongKey }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  assert.equal(mismatched.status, 400);
  assert.equal(((await mismatched.json()) as { error?: string }).error, RESTORE_SESSION_INVALID);

  const claims = (await (await import('../lib/entitlementToken.ts')).verifyToken(valid, [
    { kid: 'k1', jwk: keys.publicJwk },
  ]))!;
  const expired = await signToken({ ...claims, exp: Math.floor(now.getTime() / 1000) - 10 }, JSON.parse(keys.secret) as PrivateJwk);
  const stale = await handleRestoreRequest(
    post({ sessionToken: expired }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  assert.equal(stale.status, 400);
  assert.equal(((await stale.json()) as { error?: string }).error, RESTORE_SESSION_INVALID);
  assert.equal(sender.sent.length, 0);
});

test('a hash-only license accepts a matching stored email and rejects a different one', async () => {
  const db = sqliteD1();
  const keys = await pair();
  const sender = memoryEmailSender();
  const email = 'legacy@gym.test';
  const hash = await keyedHash(normalizeEmail(email), pepper, 'email');
  const licenseId = crypto.randomUUID();
  await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(licenseId, now.toISOString()).run();
  await db
    .prepare(`INSERT INTO identities (license_id, email_hash, created_at) VALUES (?, ?, ?)`)
    .bind(licenseId, hash, now.toISOString())
    .run();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), licenseId, 'advantage-white', 'stripe_payment', 'cs_legacy', 'active', now.toISOString())
    .run();
  const token = await issueToken(keys.secret, {
    licenseId,
    grants: ['white'],
    tier: 'white',
    src: 'stripe',
    deviceId: 'phone-3',
    now,
    kind: 'onetime',
  });
  assert.ok(token);

  const missing = await handleRestoreRequest(
    post({ sessionToken: token }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as { needsEmail?: boolean }).needsEmail, true);
  assert.equal(sender.sent.length, 0);

  const wrong = await handleRestoreRequest(
    post({ sessionToken: token, email: 'other@gym.test' }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  assert.equal(wrong.status, 400);
  assert.equal(sender.sent.length, 0);

  const matched = await handleRestoreRequest(
    post({ sessionToken: token, email }),
    env(keys.secret),
    db,
    sender,
    fetchImpl,
    () => now,
  );
  const body = (await matched.json()) as { ok: boolean; message: string; emailHint?: string };
  assert.equal(matched.status, 200);
  assert.equal(body.message, RESTORE_SIGNED_IN);
  assert.equal(body.emailHint, 'l***@gym.test');
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]?.to, email);
});
