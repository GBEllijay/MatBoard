/**
 * Extra profile slots and academy half-off codes. Stripe is a fixture.
 * No charge is created for Pro's free instructor seats or free Student licenses.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { FREE_INSTRUCTOR_SEATS, FREE_STUDENT_LICENSES } from '../lib/proBundleMath.ts';
import { verifyToken } from '../lib/entitlementToken.ts';
import { handleCheckout, handleWebhook } from './handlers.ts';
import { handleCheckoutConfirm } from './checkoutConfirm.ts';
import { memoryEmailSender } from './emailSender.ts';
import { memoryEntitlementStore } from './entitlements.ts';
import { readHalfOffCode } from './proBundle.ts';
import { countExtraProfileSlots } from './profileSlots.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';
import { handleRestoreRequest, handleRestoreVerify } from './restoreAccess.ts';
import { API_PRODUCT_COACH, API_PRODUCT_EXTRA_PROFILE, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from './routes.ts';
import { checkoutFormFields } from './stripeCheckout.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleStudentLicenseIssue, handleStudentLicenseList } from './studentLicenses.ts';
import { issueToken } from './tokenIssue.ts';

const PEPPER = 'academy-checkout-pepper';
const NOW = new Date('2026-11-11T12:00:00.000Z');

type Call = { method: string; url: string; body: string };

function signed(payload: string, secret = 'whsec_test'): { body: string; header: string } {
  const timestamp = Math.floor(NOW.getTime() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return { body: payload, header: `t=${timestamp},v1=${signature}` };
}

function webhook(payload: string, env: Record<string, string>, db: ReturnType<typeof sqliteD1>, fetchImpl?: typeof fetch) {
  const signedPayload = signed(payload);
  return handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signedPayload.header },
      body: signedPayload.body,
    }),
    { STRIPE_WEBHOOK_SECRET: 'whsec_test', ...env },
    memoryEntitlementStore(),
    () => NOW,
    { db, pepper: PEPPER, fetchImpl },
  );
}

function session(input: {
  id: string;
  product: string;
  mode?: string;
  email?: string;
  subscription?: string;
  accountId?: string;
  promotionCodeId?: string;
  amount?: number;
}): string {
  return JSON.stringify({
    id: `evt_${input.id}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: input.id,
        object: 'checkout.session',
        mode: input.mode ?? 'payment',
        payment_status: 'paid',
        amount_total: input.amount ?? 599,
        currency: 'usd',
        ...(input.subscription ? { subscription: input.subscription } : {}),
        customer_details: { email: input.email ?? 'owner@gym.test' },
        metadata: {
          product: input.product,
          ...(input.accountId ? { account_id: input.accountId } : {}),
        },
        ...(input.promotionCodeId ? { discounts: [{ promotion_code: input.promotionCodeId }] } : {}),
      },
    },
  });
}

function stripeFixture(calls: Call[], priceCents = 599): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ method, url, body });
    if (url.includes('/v1/coupons/')) {
      return new Response(JSON.stringify({ id: 'coupon_half', percent_off: 50, duration: 'once' }), { status: 200 });
    }
    if (url.includes('/v1/promotion_codes') && method === 'POST') {
      const params = new URLSearchParams(body);
      return new Response(JSON.stringify({ id: `promo_${params.get('code')}`, code: params.get('code') }), { status: 200 });
    }
    if (url.includes('/v1/prices/')) {
      return new Response(
        JSON.stringify({ id: 'price_extra', unit_amount: priceCents, currency: 'usd', product: 'prod_extra' }),
        { status: 200 },
      );
    }
    if (url.includes('/v1/checkout/sessions') && method === 'POST') {
      return new Response(JSON.stringify({ id: 'cs_test_extra', url: 'https://checkout.stripe.com/c/pay/cs_test_extra' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${method} ${url}` } }), { status: 400 });
  };
}

async function keys(): Promise<{ secret: string; publicJwk: PublicJwk }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } };
}

test('Student Edition checkout still accepts a promotion code', () => {
  const fields = checkoutFormFields({
    priceIds: ['price_student'],
    mode: 'payment',
    productId: API_PRODUCT_STUDENT,
    successUrl: 'https://advantagebjjtimer.com/buy/student?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://advantagebjjtimer.com/buy/student?checkout=cancel',
  });
  assert.equal(fields.get('allow_promotion_codes'), 'true');
  assert.equal(fields.get('discounts[0][promotion_code]'), null);
});

test('Pro purchase creates one 100-use promotion code and does not charge the free seats', async () => {
  const db = sqliteD1();
  const calls: Call[] = [];
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_academy',
    STRIPE_COUPON_ACADEMY_HALF_OFF: 'coupon_half',
  };
  const response = await webhook(
    session({ id: 'cs_test_pro_code', product: API_PRODUCT_PRO, amount: 9999, email: 'owner@gym.test' }),
    env,
    db,
    stripeFixture(calls),
  );
  assert.equal(response.status, 200);
  const license = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ?`)
    .bind('cs_test_pro_code')
    .first<{ licenseId: string }>();
  assert.ok(license?.licenseId);
  const row = await readHalfOffCode(db, license.licenseId);
  assert.ok(row);
  assert.equal(row.maxUses, 100);
  assert.equal(row.percentOff, 50);
  assert.equal(row.couponId, 'coupon_half');
  assert.match(row.code, /^ADVH-[A-Z0-9]{12}$/);
  assert.match(row.promoId ?? '', /^promo_ADVH-/);
  assert.ok(row.accountId);
  const promoPosts = calls.filter((call) => call.url.includes('/v1/promotion_codes') && call.method === 'POST');
  assert.equal(promoPosts.length, 1);
  const params = new URLSearchParams(promoPosts[0]?.body);
  assert.equal(params.get('coupon'), 'coupon_half');
  assert.equal(params.get('max_redemptions'), '100');
  assert.equal(params.get('code'), row.code);
  assert.equal(calls.some((call) => call.url.includes('/v1/checkout/sessions') || call.url.includes('/v1/payment_intents')), false);

  const again = await webhook(
    session({ id: 'cs_test_pro_code', product: API_PRODUCT_PRO, amount: 9999 }),
    env,
    db,
    stripeFixture(calls),
  );
  assert.equal(again.status, 200);
  assert.equal((await again.json() as { duplicate?: boolean }).duplicate, true);
  assert.equal(calls.filter((call) => call.method === 'POST' && call.url.includes('/v1/promotion_codes')).length, 1);
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM half_off_codes`).first<{ total: number }>();
  assert.equal(Number(count?.total), 1);

  const pair = await keys();
  const owner = await issueToken(pair.secret, {
    licenseId: license.licenseId,
    grants: ['pro', 'coach', 'student', 'white'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner-phone',
    now: NOW,
    kind: 'pro',
    subs: { state: 'active' },
  });
  const beforeIssue = calls.length;
  const issued = await handleStudentLicenseIssue(
    new Request('http://localhost/api/student-licenses/issue', {
      method: 'POST',
      body: JSON.stringify({ token: owner }),
    }),
    { ENTITLEMENT_SIGNING_KEY: pair.secret, CODE_HASH_PEPPER: PEPPER },
    db,
    () => NOW,
  );
  assert.equal(issued.status, 200);
  assert.equal(calls.length, beforeIssue);
  assert.equal(FREE_INSTRUCTOR_SEATS, 5);
  assert.equal(FREE_STUDENT_LICENSES, 5);

  await db
    .prepare(`INSERT INTO seats (id, gym_license_id, preset, status, created_at) VALUES ('seat-1', ?, 'coach', 'claimed', ?)`)
    .bind(license.licenseId, NOW.toISOString())
    .run();
  const seat = await issueToken(pair.secret, {
    licenseId: license.licenseId,
    grants: ['pro', 'coach', 'student', 'white'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-phone',
    now: NOW,
    kind: 'seat',
    gym: license.licenseId,
    sid: 'seat-1',
    preset: 'coach',
    subs: { state: 'active' },
  });
  const seatList = await handleStudentLicenseList(
    new Request('http://localhost/api/student-licenses/list', { method: 'POST', body: JSON.stringify({ token: seat }) }),
    { ENTITLEMENT_SIGNING_KEY: pair.secret, CODE_HASH_PEPPER: PEPPER },
    db,
  );
  const seatBody = (await seatList.json()) as { halfOff?: unknown };
  assert.equal(seatBody.halfOff, undefined);
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) AS total FROM half_off_codes`).first<{ total: number }>())?.total), 1);

  const student = await webhook(
    session({
      id: 'cs_test_student_code',
      product: API_PRODUCT_STUDENT,
      amount: 999,
      email: 'student@gym.test',
      promotionCodeId: row.promoId ?? '',
    }),
    env,
    db,
    stripeFixture(calls),
  );
  assert.equal(student.status, 200);
  const used = await readHalfOffCode(db, license.licenseId);
  assert.equal(used?.studentUses, 1);
  assert.equal((used?.maxUses ?? 0) - (used?.studentUses ?? 0), 99);
});

test('Instructor Edition creates one 25-use code and a seat does not', async () => {
  const db = sqliteD1();
  const calls: Call[] = [];
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_academy',
    STRIPE_COUPON_ACADEMY_HALF_OFF: 'coupon_half',
  };
  const response = await webhook(
    session({ id: 'cs_test_instructor', product: API_PRODUCT_COACH, amount: 4999, email: 'coach@gym.test' }),
    env,
    db,
    stripeFixture(calls),
  );
  assert.equal(response.status, 200);
  const license = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ?`)
    .bind('cs_test_instructor')
    .first<{ licenseId: string }>();
  assert.ok(license?.licenseId);
  const row = await readHalfOffCode(db, license.licenseId);
  assert.equal(row?.maxUses, 25);
  assert.equal(row?.couponId, 'coupon_half');
  assert.equal(row?.percentOff, 50);
  const params = new URLSearchParams(calls.find((call) => call.method === 'POST' && call.url.includes('/v1/promotion_codes'))?.body);
  assert.equal(params.get('max_redemptions'), '25');
  const pair = await keys();
  const token = await issueToken(pair.secret, {
    licenseId: license.licenseId,
    grants: ['coach', 'white'],
    tier: 'coach',
    src: 'stripe',
    deviceId: 'coach-phone',
    now: NOW,
    kind: 'onetime',
  });
  const listed = await handleStudentLicenseList(
    new Request('http://localhost/api/student-licenses/list', { method: 'POST', body: JSON.stringify({ token }) }),
    { ENTITLEMENT_SIGNING_KEY: pair.secret, CODE_HASH_PEPPER: PEPPER },
    db,
  );
  const body = (await listed.json()) as { halfOff?: { code: string; maxUses: number; usesLeft: number }; left?: number; cap?: number };
  assert.equal(body.halfOff?.code, row?.code);
  assert.equal(body.halfOff?.maxUses, 25);
  assert.equal(body.halfOff?.usesLeft, 25);
  assert.equal(body.left, 0);
  assert.equal(body.cap, 0);
  const issued = await handleStudentLicenseIssue(
    new Request('http://localhost/api/student-licenses/issue', { method: 'POST', body: JSON.stringify({ token }) }),
    { ENTITLEMENT_SIGNING_KEY: pair.secret, CODE_HASH_PEPPER: PEPPER },
    db,
    () => NOW,
  );
  assert.equal(issued.status, 403);
});

test('extra profile checkout is $5.99 and the webhook keeps every slot on the account', async () => {
  resetRateLimitsForTests();
  const db = sqliteD1();
  const calls: Call[] = [];
  const env = { STRIPE_SECRET_KEY: 'sk_test_academy', STRIPE_PRICE_EXTRA_PROFILE: 'price_extra_profile' };
  const accountId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await db
    .prepare(`INSERT INTO accounts (id, email_normalized, email_hash, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`)
    .bind(accountId, 'family@gym.test', NOW.toISOString(), NOW.toISOString())
    .run();
  const opened = await handleCheckout(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ product: 'extra-profile', accountId }),
    }),
    env,
    stripeFixture(calls),
    null,
    { db },
  );
  assert.equal(opened.status, 200);
  const openedBody = (await opened.json()) as { url?: string };
  assert.match(openedBody.url ?? '', /^https:\/\/checkout\.stripe\.com\//);
  const checkout = calls.find((call) => call.method === 'POST' && call.url.includes('/v1/checkout/sessions'));
  const fields = new URLSearchParams(checkout?.body);
  assert.equal(fields.get('mode'), 'payment');
  assert.equal(fields.get('line_items[0][price]'), 'price_extra_profile');
  assert.equal(fields.get('metadata[product]'), API_PRODUCT_EXTRA_PROFILE);
  assert.equal(fields.get('metadata[account_id]'), accountId);
  assert.match(fields.get('success_url') ?? '', /\/student\/profile\?checkout=success/);

  calls.length = 0;
  const refused = await handleCheckout(
    new Request('http://localhost/api/checkout', { method: 'POST', body: JSON.stringify({ product: 'extra-profile' }) }),
    env,
    stripeFixture(calls, 999),
    null,
    { db },
  );
  assert.equal(refused.status, 503);
  assert.equal(calls.some((call) => call.url.includes('/v1/checkout/sessions')), false);

  const first = await webhook(
    session({ id: 'cs_test_slot_1', product: API_PRODUCT_EXTRA_PROFILE, email: 'family@gym.test', accountId }),
    env,
    db,
  );
  assert.equal(first.status, 200);
  assert.equal(((await first.json()) as { extraProfileSlots?: number }).extraProfileSlots, 1);
  const duplicate = await webhook(
    session({ id: 'cs_test_slot_1', product: API_PRODUCT_EXTRA_PROFILE, email: 'family@gym.test', accountId }),
    env,
    db,
  );
  assert.equal(((await duplicate.json()) as { duplicate?: boolean }).duplicate, true);
  const second = await webhook(
    session({ id: 'cs_test_slot_2', product: API_PRODUCT_EXTRA_PROFILE, email: 'family@gym.test', accountId }),
    env,
    db,
  );
  assert.equal(((await second.json()) as { extraProfileSlots?: number }).extraProfileSlots, 2);
  assert.equal(await countExtraProfileSlots(db, accountId), 2);

  const confirmFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'cs_test_slot_2',
        payment_status: 'paid',
        status: 'complete',
        metadata: { product: API_PRODUCT_EXTRA_PROFILE, account_id: accountId },
        customer_details: { email: 'family@gym.test' },
      }),
      { status: 200 },
    );
  const confirmed = await handleCheckoutConfirm(
    new Request('http://localhost/api/checkout-confirm', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '198.51.100.77' },
      body: JSON.stringify({ sessionId: 'cs_test_slot_2' }),
    }),
    { ...env, CODE_HASH_PEPPER: PEPPER },
    confirmFetch,
    null,
    () => NOW,
    { db },
  );
  const confirmedBody = (await confirmed.json()) as { entitled?: boolean; extraProfileSlots?: number; accountId?: string; email?: string };
  assert.equal(confirmed.status, 200);
  assert.equal(confirmedBody.entitled, false);
  assert.equal(confirmedBody.extraProfileSlots, 2);
  assert.equal(confirmedBody.accountId, accountId);
  assert.equal(confirmedBody.email, undefined);
  assert.equal(JSON.stringify(confirmedBody).includes('cs_test_slot_2'), false);

  const pair = await keys();
  const student = await webhook(
    session({ id: 'cs_test_family_student', product: API_PRODUCT_STUDENT, amount: 1999, email: 'family@gym.test' }),
    env,
    db,
  );
  assert.equal(student.status, 200);
  const sender = memoryEmailSender();
  const restoreEnv = {
    CODE_HASH_PEPPER: PEPPER,
    ENTITLEMENT_SIGNING_KEY: pair.secret,
    ENTITLEMENT_KEY_ID: 'k1',
    TURNSTILE_SECRET_KEY: 'turnstile-test',
  };
  const requested = await handleRestoreRequest(
    new Request('http://localhost/api/restore/request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.40' },
      body: JSON.stringify({ email: 'family@gym.test', turnstileToken: 'ok' }),
    }),
    restoreEnv,
    db,
    sender,
    async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    () => NOW,
  );
  assert.equal(requested.status, 200);
  const mailed = sender.sent[0]?.text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
  const challengeId = ((await requested.json()) as { challengeId?: string }).challengeId ?? '';
  const restored = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code: mailed, deviceId: 'home-screen' }),
    }),
    restoreEnv,
    db,
    () => NOW,
  );
  assert.equal(restored.status, 200, await restored.clone().text());
  const restoredBody = (await restored.json()) as { extraProfileSlots?: number; accountId?: string; token?: string };
  assert.equal(restoredBody.extraProfileSlots, 2);
  assert.equal(restoredBody.accountId, accountId);
  const claims = await verifyToken(restoredBody.token ?? '', [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.equal(claims?.grants.includes('student'), true);
  assert.equal(claims?.grants.includes('pro'), false);
});
