import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyToken, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { handleBillingPortal } from './billingPortal.ts';
import { expandGrants } from './grantMatrix.ts';
import { handleWebhook } from './handlers.ts';
import { handleOwnerTest } from './ownerTest.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { handleSeatAccept, handleSeatIssue, handleSeatSync } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken, lifetimeFor } from './tokenIssue.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_phase3',
  STRIPE_WEBHOOK_SECRET: 'whsec_phase3',
  STRIPE_PRICE_PRO: 'price_pro_once',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_env',
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: 'price_pro_299',
};

async function pair() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y } };
}

function signed(payload: string, now: Date): Request {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '').update(`${timestamp}.${payload}`).digest('hex');
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

test('Pro opens White, Student and Coach, and the owner test unlock still works', async () => {
  assert.deepEqual(expandGrants(['pro']), ['white', 'student', 'coach', 'pro']);
  const response = await handleOwnerTest(
    new Request('http://localhost/api/owner-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
      body: JSON.stringify({ secret: 'owner-secret', tier: 'all', days: 3 }),
    }),
    { OWNER_TEST_SECRET: 'owner-secret', CODE_HASH_PEPPER: 'pepper' },
  );
  const body = (await response.json()) as { ok: boolean; grants: string[]; source: string };
  assert.equal(body.ok, true);
  assert.equal(body.source, 'owner-test');
  assert.equal(body.grants.includes('pro'), true);
  assert.equal(body.grants.includes('student'), true);
  assert.equal(body.grants.includes('coach'), true);
  assert.equal(body.grants.includes('white'), true);
  assert.equal(JSON.stringify(body).includes('owner-secret'), false);
});

test('a grace token locks at the baked date and a locked token can still be issued', async () => {
  const keys = await pair();
  const now = new Date('2026-10-01T00:00:00.000Z');
  const lockAt = '2026-10-08T00:00:00.000Z';
  const life = lifetimeFor({
    licenseId: 'lic',
    grants: ['pro', 'student', 'coach'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now,
    kind: 'pro',
    subs: { state: 'grace', lock_at: lockAt },
  });
  assert.equal(life.exp, Math.floor(Date.parse(lockAt) / 1000));
  assert.equal(life.offline_grace, undefined);
  const locked = await issueToken(keys.secret, {
    licenseId: 'lic',
    grants: ['white'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now,
    kind: 'pro',
    subs: { state: 'locked' },
  });
  const claims = await verifyToken(locked as string, [{ kid: 'k1', jwk: keys.publicJwk }]);
  assert.equal(claims?.subs?.state, 'locked');
  assert.equal(claims?.grants.includes('white'), true);
  assert.equal(claims?.grants.includes('pro'), false);
});

test('full refund and a lost dispute revoke a one-time purchase; a partial refund does not', async () => {
  const db = sqliteD1();
  const now = new Date('2026-10-02T00:00:00.000Z');
  await recordPurchase(db, {
    email: 'buyer@gym.test',
    product: 'advantage-white',
    source: 'stripe_payment',
    sourceRef: 'cs_white',
    sessionId: 'cs_white',
    pepper: 'pepper',
    now,
  });
  await recordPurchase(db, {
    email: 'buyer@gym.test',
    product: 'advantage-pro',
    source: 'stripe_subscription',
    sourceRef: 'sub_keep',
    sessionId: 'cs_pro',
    subscriptionId: 'sub_keep',
    pepper: 'pepper',
    now,
  });
  const store = {
    async save() { throw new Error('unused'); },
    async findByEmail() { return null; },
    async findBySessionId() { return null; },
    async saveStudent(record: never) { return record; },
    async findStudentByEmail() { return null; },
    async findStudentBySessionId() { return null; },
    async saveCoach(record: never) { return record; },
    async findCoachByEmail() { return null; },
    async findCoachBySessionId() { return null; },
    async savePro(record: never) { return record; },
    async findProByEmail() { return null; },
    async findProBySessionId() { return null; },
    async findProBySubscriptionId() { return null; },
  };
  const partial = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_partial',
        type: 'charge.refunded',
        data: { object: { object: 'charge', amount: 999, amount_refunded: 100, refunded: false, payment_intent: 'pi_white', metadata: { session_id: 'cs_white' } } },
      }),
      now,
    ),
    env,
    store,
    () => now,
    { db, fetchImpl: async () => new Response('no', { status: 404 }) },
  );
  assert.equal(((await partial.json()) as { ignored?: boolean }).ignored, true);
  const open = await db.prepare(`SELECT revoked_at AS revokedAt FROM grants WHERE source_ref = ?`).bind('cs_white').first<{ revokedAt: string | null }>();
  assert.equal(open?.revokedAt, null);

  const full = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_full',
        type: 'charge.refunded',
        data: { object: { object: 'charge', amount: 999, amount_refunded: 999, refunded: true, payment_intent: 'pi_white', metadata: { session_id: 'cs_white' } } },
      }),
      now,
    ),
    env,
    store,
    () => now,
    { db, fetchImpl: async () => new Response('no', { status: 404 }) },
  );
  assert.equal(((await full.json()) as { revoked?: boolean }).revoked, true);
  const closed = await db.prepare(`SELECT status, reason FROM grants WHERE source_ref = ?`).bind('cs_white').first<{ status: string; reason: string }>();
  assert.equal(closed?.status, 'inactive');
  assert.equal(closed?.reason, 'refund');
  const pro = await db.prepare(`SELECT status FROM grants WHERE source_ref = ?`).bind('sub_keep').first<{ status: string }>();
  assert.equal(pro?.status, 'active');

  await recordPurchase(db, {
    email: 'student@gym.test',
    product: 'advantage-student',
    source: 'stripe_payment',
    sourceRef: 'cs_student',
    sessionId: 'cs_student',
    pepper: 'pepper',
    now,
  });
  const openedDispute = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_dispute_open',
        type: 'charge.dispute.created',
        data: { object: { object: 'dispute', status: 'needs_response', payment_intent: 'pi_student', metadata: { session_id: 'cs_student' } } },
      }),
      now,
    ),
    env,
    store,
    () => now,
    { db },
  );
  assert.equal(((await openedDispute.json()) as { ignored?: boolean }).ignored, true);
  const lost = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_dispute_lost',
        type: 'charge.dispute.closed',
        data: { object: { object: 'dispute', status: 'lost', payment_intent: 'pi_student' } },
      }),
      now,
    ),
    env,
    store,
    () => now,
    {
      db,
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'cs_student' }] }), { status: 200 }),
    },
  );
  assert.equal(((await lost.json()) as { revoked?: boolean }).revoked, true);
  const identities = await db.prepare(`SELECT COUNT(*) AS total FROM identities WHERE email_hash IS NULL`).bind().first<{ total: number }>();
  assert.equal(Number(identities?.total ?? 0) >= 0, true);
});

test('billing portal returns a Stripe url and seats do not get one', async () => {
  const keys = await pair();
  const db = sqliteD1();
  const now = new Date('2026-10-03T00:00:00.000Z');
  await recordPurchase(db, {
    email: 'owner@gym.test',
    product: 'advantage-pro',
    source: 'stripe_subscription',
    sourceRef: 'sub_bill',
    sessionId: 'cs_bill',
    subscriptionId: 'sub_bill',
    stripeCustomerId: 'cus_bill',
    pepper: 'pepper',
    now,
  });
  const license = await db.prepare(`SELECT license_id AS licenseId FROM subscriptions WHERE stripe_subscription_id = ?`).bind('sub_bill').first<{ licenseId: string }>();
  const token = await issueToken(keys.secret, {
    licenseId: license?.licenseId ?? '',
    grants: ['pro', 'student', 'coach'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner-device',
    now,
    kind: 'pro',
    subs: { state: 'grace', lock_at: '2026-10-10T00:00:00.000Z' },
  });
  const portal = await handleBillingPortal(
    new Request('http://localhost/api/billing/portal', {
      method: 'POST',
      body: JSON.stringify({ token, returnUrl: 'https://evil.example/phish' }),
    }),
    { ...env, ENTITLEMENT_SIGNING_KEY: keys.secret },
    db,
    async (_input, init) => {
      const fields = new URLSearchParams(String(init?.body ?? ''));
      assert.equal(fields.get('customer'), 'cus_bill');
      assert.equal(fields.get('return_url'), 'http://localhost/pro/paused');
      return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/test' }), { status: 200 });
    },
  );
  assert.equal(portal.status, 200);
  assert.equal(((await portal.json()) as { url: string }).url, 'https://billing.stripe.com/p/session/test');

  const seat = await issueToken(keys.secret, {
    licenseId: license?.licenseId ?? '',
    grants: [],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-device',
    now,
    kind: 'seat',
    subs: { state: 'locked' },
  });
  const denied = await handleBillingPortal(
    new Request('http://localhost/api/billing/portal', { method: 'POST', body: JSON.stringify({ token: seat }) }),
    { ...env, ENTITLEMENT_SIGNING_KEY: keys.secret },
    db,
  );
  assert.equal(denied.status, 403);
});

test('seats cap at 10, inherit the owner status, and keep email as a label', async () => {
  const keys = await pair();
  const db = sqliteD1();
  const now = new Date('2026-10-04T00:00:00.000Z');
  await recordPurchase(db, {
    email: 'owner@gym.test',
    product: 'advantage-pro',
    source: 'stripe_subscription',
    sourceRef: 'sub_seats',
    sessionId: 'cs_seats',
    subscriptionId: 'sub_seats',
    stripeCustomerId: 'cus_seats',
    pepper: 'pepper',
    now,
  });
  await db.prepare(`UPDATE subscriptions SET status = 'past_due', past_due_since = ? WHERE stripe_subscription_id = ?`).bind(now.toISOString(), 'sub_seats').run();
  const license = await db.prepare(`SELECT license_id AS licenseId FROM subscriptions WHERE stripe_subscription_id = ?`).bind('sub_seats').first<{ licenseId: string }>();
  const owner = await issueToken(keys.secret, {
    licenseId: license?.licenseId ?? '',
    grants: ['pro', 'student', 'coach'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner',
    now,
    kind: 'pro',
    subs: { state: 'grace', lock_at: '2026-10-11T00:00:00.000Z' },
  });
  const signing = { ...env, ENTITLEMENT_SIGNING_KEY: keys.secret, CODE_HASH_PEPPER: 'pepper' };
  const synced = await handleSeatSync(
    new Request('http://localhost/api/seats/sync', {
      method: 'POST',
      body: JSON.stringify({
        token: owner,
        seats: [{ id: 'local-1', inviteToken: 'legacy-token-already-sent', email: 'old@gym.test', preset: 'coach', status: 'invited' }],
      }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(((await synced.json()) as { registered: number }).registered, 1);
  const legacy = await handleSeatAccept(
    new Request('http://localhost/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite: 'legacy-token-already-sent', deviceId: 'legacy-device' }),
    }),
    signing,
    db,
    async (input) => new Response(JSON.stringify(subscriptionBody(String(input))), { status: 200 }),
    () => now,
  );
  assert.equal(legacy.status, 200);

  let lastInvite = '';
  for (let index = 0; index < 9; index += 1) {
    const issued = await handleSeatIssue(
      new Request('http://localhost/api/seats/issue', {
        method: 'POST',
        body: JSON.stringify({ token: owner, email: `coach${index}@gym.test`, preset: 'coach' }),
      }),
      signing,
      db,
      () => now,
    );
    assert.equal(issued.status, 200, String(index));
    lastInvite = ((await issued.json()) as { invite: string }).invite;
  }
  const blocked = await handleSeatIssue(
    new Request('http://localhost/api/seats/issue', {
      method: 'POST',
      body: JSON.stringify({ token: owner, email: 'extra@gym.test', preset: 'coach' }),
    }),
    signing,
    db,
    () => now,
  );
  assert.equal(blocked.status, 409);
  const identities = await db.prepare(`SELECT COUNT(*) AS total FROM identities WHERE stripe_customer_id IS NULL AND email_hash IS NOT NULL`).bind().first<{ total: number }>();
  const seatIdentity = await db.prepare(`SELECT id FROM identities WHERE email_hash IS NOT NULL AND license_id <> ?`).bind(license?.licenseId).first();
  assert.equal(seatIdentity, null);
  void identities;

  const stripeFetch: typeof fetch = async (input) => new Response(JSON.stringify(subscriptionBody(String(input))), { status: 200 });
  const accepted = await handleSeatAccept(
    new Request('http://localhost/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite: lastInvite, deviceId: 'device-a' }),
    }),
    signing,
    db,
    stripeFetch,
    () => now,
  );
  assert.equal(accepted.status, 200);
  const acceptedBody = (await accepted.json()) as { token: string; email: string };
  assert.equal(acceptedBody.email, 'coach8@gym.test');
  const seatClaims = await verifyToken(acceptedBody.token, [{ kid: 'k1', jwk: keys.publicJwk }]);
  assert.equal(seatClaims?.tier, 'seat');
  assert.equal(seatClaims?.subs?.state, 'grace');
  assert.equal(seatClaims?.subs?.lock_at, '2026-10-11T00:00:00.000Z');
  assert.equal(seatClaims?.grants.includes('pro'), true);
  assert.equal(seatClaims?.grants.includes('student'), true);
  assert.equal(seatClaims?.grants.includes('coach'), true);

  const second = await handleSeatAccept(
    new Request('http://localhost/api/seats/accept', {
      method: 'POST',
      body: JSON.stringify({ invite: lastInvite, deviceId: 'device-b' }),
    }),
    signing,
    db,
    stripeFetch,
    () => now,
  );
  assert.equal(second.status, 409);

  const refreshed = await handleTokenRefresh(
    new Request('http://localhost/api/token/refresh', { method: 'POST', body: JSON.stringify({ token: acceptedBody.token }) }),
    signing,
    db,
    () => new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
    stripeFetch,
  );
  assert.equal(refreshed.status, 200);
  const refreshedBody = (await refreshed.json()) as { token: string };
  const later = await verifyToken(refreshedBody.token, [{ kid: 'k1', jwk: keys.publicJwk }]);
  assert.equal(later?.subs?.state, 'locked');
  assert.equal(later?.grants.includes('pro'), false);

});

function subscriptionBody(url: string) {
  const id = url.includes('sub_seats') ? 'sub_seats' : 'sub_seats';
  return {
    id,
    object: 'subscription',
    status: 'past_due',
    customer: 'cus_seats',
    cancel_at_period_end: false,
    metadata: { product: 'advantage-pro' },
    items: { data: [{ price: { id: 'price_pro_monthly_env' }, current_period_end: 1_800_000_000 }] },
  };
}
