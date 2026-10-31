import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_AMNESTY_ENDS_AT } from '../lib/legacyUnlock.ts';
import { sha256Hex, signToken, verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { expandGrants, grantsForProduct } from './grantMatrix.ts';
import { handleCheckout, handleWebhook } from './handlers.ts';
import { memoryEmailSender } from './emailSender.ts';
import { kvEntitlementStore, memoryEntitlementStore, purchaseRecordKey, type KvBinding } from './entitlements.ts';
import { handlePublicConfig } from './publicConfig.ts';
import { handleRestoreRequest, handleRestoreVerify, RESTORE_GENERIC } from './restoreAccess.ts';
import { handleSessionRedeem } from './sessionRedeem.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken, lifetimeFor } from './tokenIssue.ts';
import { API_PRODUCT_COACH, API_PRODUCT_PRO } from './routes.ts';
import { LEGACY_UNLOCK_AMNESTY_DAYS } from './paywallDecisions.ts';

const pepper = 'phase2-pepper';

async function pair(): Promise<{ secret: string; publicJwk: PublicJwk; kid: string }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y }, kid: 'k1' };
}

test('grant matrix opens Coach and Student for Pro and keeps White closed', () => {
  assert.deepEqual(grantsForProduct('advantage-white'), ['white']);
  assert.deepEqual(grantsForProduct('advantage-student'), ['student']);
  assert.deepEqual(grantsForProduct('advantage-coach'), ['coach']);
  assert.deepEqual(grantsForProduct('advantage-pro'), ['student', 'coach', 'pro']);
  assert.deepEqual(expandGrants(['pro']), ['student', 'coach', 'pro']);
  assert.equal(expandGrants(['pro']).includes('white'), false);
  assert.deepEqual(expandGrants(['white', 'student', 'coach', 'pro']), ['white', 'student', 'coach', 'pro']);
  assert.equal(LEGACY_UNLOCK_AMNESTY_DAYS, 45);
  assert.equal(Date.parse(LEGACY_AMNESTY_ENDS_AT) - Date.parse('2026-10-28T00:00:00.000Z'), 45 * 24 * 60 * 60 * 1000);
});

test('tokens verify, reject a tampered claim, and reject the wrong key id', async () => {
  const keys = await pair();
  const now = new Date('2026-10-28T12:00:00.000Z');
  const token = await issueToken(keys.secret, {
    licenseId: 'lic-1',
    grants: ['pro', 'student', 'coach'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'device-1',
    now,
    kind: 'pro',
    subs: { state: 'active' },
  });
  assert.ok(token);
  const claims = await verifyToken(token as string, [{ kid: 'k1', jwk: keys.publicJwk }]);
  assert.equal(claims?.sub, 'lic-1');
  assert.equal(claims?.subs?.state, 'active');
  assert.equal(claims?.grants.includes('white'), false);
  const life = lifetimeFor({
    licenseId: 'lic-1',
    grants: ['pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'device-1',
    now,
    kind: 'pro',
  });
  assert.equal(life.exp - Math.floor(now.getTime() / 1000), 7 * 24 * 60 * 60);
  assert.equal(life.offline_grace, 3 * 24 * 60 * 60);
  const parts = (token as string).split('.');
  const tampered = `${parts[0]}.${parts[1].slice(0, -2)}aa.${parts[2]}`;
  assert.equal(await verifyToken(tampered, [{ kid: 'k1', jwk: keys.publicJwk }]), null);
  assert.equal(await verifyToken(token as string, [{ kid: 'other', jwk: keys.publicJwk }]), null);
  const other = await pair();
  assert.equal(await verifyToken(token as string, [{ kid: 'k1', jwk: other.publicJwk }]), null);
  const forged = await signToken(
    { ...(claims as NonNullable<typeof claims>), grants: ['white', 'pro', 'student', 'coach'] },
    JSON.parse(other.secret) as PrivateJwk,
  );
  assert.equal(await verifyToken(forged, [{ kid: 'k1', jwk: keys.publicJwk }]), null);
});

test('two overlapping purchases both remain, including Coach', async () => {
  const db = sqliteD1();
  const { recordPurchase } = await import('./purchaseRecords.ts');
  const now = new Date('2026-10-28T12:00:00.000Z');
  await Promise.all([
    recordPurchase(db, {
      email: 'white@gym.test',
      product: 'advantage-white',
      source: 'stripe_payment',
      sourceRef: 'cs_white',
      sessionId: 'cs_white',
      pepper,
      now,
    }),
    recordPurchase(db, {
      email: 'coach@gym.test',
      product: 'advantage-coach',
      source: 'stripe_payment',
      sourceRef: 'cs_coach',
      sessionId: 'cs_coach',
      pepper,
      now,
    }),
  ]);
  const rows = await db.prepare(`SELECT product, source_ref AS sourceRef FROM grants ORDER BY product`).all<{ product: string; sourceRef: string }>();
  assert.deepEqual(rows.results.map((row) => row.sourceRef).sort(), ['cs_coach', 'cs_white']);
  const again = await recordPurchase(db, {
    email: 'coach@gym.test',
    product: 'advantage-coach',
    source: 'stripe_payment',
    sourceRef: 'cs_coach',
    sessionId: 'cs_coach',
    pepper,
    now,
  });
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM grants`).first<{ total: number }>();
  assert.equal(Number(count?.total), 2);
  assert.ok(again.licenseId);

  const keys = new Map<string, string>();
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let readers = 0;
  const kv: KvBinding = {
    async get(key) {
      return keys.get(key) ?? null;
    },
    async put(key, value) {
      if (key === 'advantage-white-entitlements') {
        readers += 1;
        if (readers < 2) await gate;
        else release?.();
      }
      keys.set(key, value);
    },
  };
  const store = kvEntitlementStore(kv);
  await Promise.all([
    store.save({
      email: 'a@gym.test',
      sessionId: 'cs_a',
      product: 'advantage-white',
      amountTotal: 999,
      currency: 'usd',
      createdAt: now.toISOString(),
    }),
    store.save({
      email: 'b@gym.test',
      sessionId: 'cs_b',
      product: 'advantage-white',
      amountTotal: 999,
      currency: 'usd',
      createdAt: now.toISOString(),
    }),
  ]);
  assert.equal(await store.findBySessionId('cs_a')?.then((row) => row?.sessionId), 'cs_a');
  assert.equal((await store.findBySessionId('cs_b'))?.sessionId, 'cs_b');
  assert.equal(keys.has(purchaseRecordKey('advantage-white', 'cs_a')), true);
  assert.equal(keys.has(purchaseRecordKey('advantage-white', 'cs_b')), true);
});

test('Coach checkout webhook is recorded and the signing key stays off the config response', async () => {
  const keys = await pair();
  const store = memoryEntitlementStore();
  const db = sqliteD1();
  const now = new Date('2026-10-28T12:00:00.000Z');
  const payload = JSON.stringify({
    id: 'evt_coach',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_coach',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 2999,
        currency: 'usd',
        customer_details: { email: 'coach@gym.test' },
        metadata: { product: API_PRODUCT_COACH },
      },
    },
  });
  const { createHmac } = await import('node:crypto');
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', 'whsec_test').update(`${timestamp}.${payload}`).digest('hex');
  const response = await handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      body: payload,
    }),
    { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
    store,
    () => now,
    { db, pepper },
  );
  assert.equal(response.status, 200);
  assert.equal((await store.findCoachBySessionId('cs_test_coach'))?.email, 'coach@gym.test');
  const grant = await db.prepare(`SELECT product FROM grants WHERE source_ref = ?`).bind('cs_test_coach').first<{ product: string }>();
  assert.equal(grant?.product, API_PRODUCT_COACH);
  const duplicate = await handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      body: payload,
    }),
    { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
    store,
    () => now,
    { db, pepper },
  );
  assert.equal(duplicate.status, 200);
  assert.equal(((await duplicate.json()) as { duplicate?: boolean }).duplicate, true);

  const config = handlePublicConfig(
    new Request('http://localhost/api/config'),
    { ENTITLEMENT_SIGNING_KEY: keys.secret, CODE_HASH_PEPPER: pepper },
    db,
  );
  const body = (await config.json()) as { signing: boolean; keys: { jwk: Record<string, string> }[]; message?: string };
  assert.equal(body.signing, true);
  assert.equal(body.keys[0]?.jwk.d, undefined);
  assert.equal(JSON.stringify(body).includes(JSON.parse(keys.secret).d as string), false);
  assert.equal(body.message?.includes('Restore is not available'), true);
  void API_PRODUCT_PRO;
});

test('checkout stores the nonce hash and redeem rejects a mismatched nonce', async () => {
  const nonce = 'browser-nonce-value-1234';
  const nonceHash = await sha256Hex(nonce);
  let sent = '';
  const checkout = await handleCheckout(
    new Request('https://advantagebjjtimer.com/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ product: 'coach', nonceHash }),
    }),
    { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_PRICE_COACH: 'price_coach' },
    async (_input, init) => {
      sent = String(init?.body ?? '');
      return new Response(JSON.stringify({ id: 'cs_test_nonce', url: 'https://checkout.stripe.com/c/pay/cs_test_nonce' }), {
        status: 200,
      });
    },
  );
  assert.equal(checkout.status, 200);
  const fields = new URLSearchParams(sent);
  assert.equal(fields.get('client_reference_id'), nonceHash);
  assert.equal(fields.get('customer_creation'), 'always');
  assert.equal(fields.get('line_items[0][price]'), 'price_coach');

  const keys = await pair();
  const db = sqliteD1();
  const paid = async () =>
    new Response(
      JSON.stringify({
        id: 'cs_test_nonce',
        payment_status: 'paid',
        status: 'complete',
        mode: 'payment',
        client_reference_id: nonceHash,
        metadata: { product: 'advantage-coach' },
        customer_details: { email: 'coach@gym.test' },
      }),
      { status: 200 },
    );
  const good = await handleSessionRedeem(
    new Request('http://localhost/api/session/redeem', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'cs_test_nonce', nonce, deviceId: 'device-a' }),
    }),
    { STRIPE_SECRET_KEY: 'sk_test_123', ENTITLEMENT_SIGNING_KEY: keys.secret, CODE_HASH_PEPPER: pepper },
    db,
    paid,
  );
  assert.equal(good.status, 200);
  const goodBody = (await good.json()) as { token?: string; email?: string; sessionId?: string; grants: string[] };
  assert.ok(goodBody.token);
  assert.equal(goodBody.email, undefined);
  assert.equal(goodBody.sessionId, undefined);
  assert.equal(goodBody.grants.includes('coach'), true);
  const claims = await verifyToken(goodBody.token as string, [{ kid: 'k1', jwk: keys.publicJwk }]);
  assert.equal(claims?.did, 'device-a');

  const bad = await handleSessionRedeem(
    new Request('http://localhost/api/session/redeem', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'cs_test_nonce', nonce: 'different-nonce-value', deviceId: 'device-b' }),
    }),
    { STRIPE_SECRET_KEY: 'sk_test_123', ENTITLEMENT_SIGNING_KEY: keys.secret, CODE_HASH_PEPPER: pepper },
    db,
    paid,
  );
  assert.equal(bad.status, 400);

  const unpaid = await handleSessionRedeem(
    new Request('http://localhost/api/session/redeem', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'cs_test_unpaid', nonce, deviceId: 'device-a' }),
    }),
    { STRIPE_SECRET_KEY: 'sk_test_123', ENTITLEMENT_SIGNING_KEY: keys.secret },
    db,
    async () =>
      new Response(JSON.stringify({ id: 'cs_test_unpaid', payment_status: 'unpaid', client_reference_id: nonceHash, metadata: { product: 'advantage-coach' } }), {
        status: 200,
      }),
  );
  assert.equal(unpaid.status, 400);
});

test('restore answers are identical, codes are single use, and nothing is logged', async () => {
  const db = sqliteD1();
  const { recordPurchase } = await import('./purchaseRecords.ts');
  const sender = memoryEmailSender();
  const now = new Date('2026-10-28T12:00:00.000Z');
  await recordPurchase(db, {
    email: 'buyer@gym.test',
    product: 'advantage-white',
    source: 'stripe_payment',
    sourceRef: 'cs_buyer',
    sessionId: 'cs_buyer',
    pepper,
    now,
  });
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  const env = { CODE_HASH_PEPPER: pepper, TURNSTILE_SECRET_KEY: 'turnstile-test' };
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
  const known = await handleRestoreRequest(
    new Request('http://localhost/api/restore/request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.8' },
      body: JSON.stringify({ email: 'Buyer@Gym.test', turnstileToken: 'ok' }),
    }),
    env,
    db,
    sender,
    fetchImpl,
    () => now,
  );
  const unknown = await handleRestoreRequest(
    new Request('http://localhost/api/restore/request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({ email: 'nobody@gym.test', turnstileToken: 'ok' }),
    }),
    env,
    db,
    sender,
    fetchImpl,
    () => now,
  );
  console.log = original;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const knownBody = (await known.json()) as { ok: boolean; message: string; challengeId: string };
  const unknownBody = (await unknown.json()) as { ok: boolean; message: string; challengeId: string };
  assert.equal(known.status, unknown.status);
  assert.deepEqual(Object.keys(knownBody), Object.keys(unknownBody));
  assert.deepEqual(Object.keys(knownBody), ['ok', 'message', 'challengeId']);
  assert.equal(knownBody.ok, true);
  assert.equal(unknownBody.ok, true);
  assert.equal(knownBody.message, RESTORE_GENERIC);
  assert.equal(unknownBody.message, RESTORE_GENERIC);
  assert.match(knownBody.challengeId, uuid);
  assert.match(unknownBody.challengeId, uuid);
  assert.notEqual(knownBody.challengeId, unknownBody.challengeId);
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0]?.to, 'Buyer@Gym.test');
  assert.equal(logs.some((line) => line.includes('buyer@gym.test') || line.includes('Buyer@Gym.test')), false);
  const code = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  assert.equal(code.length, 8);
  // Code only: the email carries no link, so the challenge id comes from the response.
  assert.equal(/https?:\/\//.test(sender.sent[0]?.text ?? ''), false);
  assert.equal((sender.sent[0]?.text ?? '').includes('challenge'), false);
  const challenge = knownBody.challengeId;
  const fake = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: unknownBody.challengeId, code, deviceId: 'device-r' }),
    }),
    env,
    db,
    () => now,
  );
  assert.equal(fake.status, 400);
  assert.equal(((await fake.json()) as { error?: string }).error, "That code didn't work.");
  const get = await handleRestoreVerify(new Request(`http://localhost/restore?challenge=${challenge}`), env, db, () => now);
  assert.equal(get.status, 405);
  const keys = await pair();
  const first = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: challenge, code, deviceId: 'device-r' }),
    }),
    { ...env, ENTITLEMENT_SIGNING_KEY: keys.secret },
    db,
    () => now,
  );
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as { token?: string; email?: string };
  assert.ok(firstBody.token);
  assert.equal(firstBody.email, undefined);
  const second = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId: challenge, code, deviceId: 'device-r' }),
    }),
    { ...env, ENTITLEMENT_SIGNING_KEY: keys.secret },
    db,
    () => now,
  );
  assert.equal(second.status, 400);
  const copied = await handleTokenRefresh(
    new Request('http://localhost/api/token/refresh', { method: 'POST', body: JSON.stringify({ token: firstBody.token }) }),
    { ENTITLEMENT_SIGNING_KEY: keys.secret },
    db,
    () => new Date(now.getTime() + 60_000),
  );
  assert.equal(copied.status, 200);

  const missing = handlePublicConfig(new Request('http://localhost/api/config'), {}, null);
  const missingBody = (await missing.json()) as { signing: boolean; message: string; restoreAvailable: boolean };
  assert.equal(missingBody.signing, false);
  assert.equal(missingBody.restoreAvailable, false);
  assert.match(missingBody.message, /ENTITLEMENT_SIGNING_KEY/);
});
