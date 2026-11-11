import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { APP_VERSION_HEADER, MEDIA_APP_VERSION } from '../lib/appCapability.ts';
import { proPlusCloudDoorOpen } from '../lib/proPlusCloud.ts';
import { sha256Hex, verifyToken, type Door, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { cloudAccessForLicense, CLOUD_GRANT_PRODUCT } from './cloudSubscription.ts';
import { memoryEmailSender } from './emailSender.ts';
import { memoryEntitlementStore } from './entitlements.ts';
import { handleWebhook } from './handlers.ts';
import { readHalfOffCode } from './proBundle.ts';
import { grantsForLicense } from './purchaseRecords.ts';
import { handleRestoreRequest, handleRestoreVerify } from './restoreAccess.ts';
import { handleSessionRedeem } from './sessionRedeem.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { purchaseFromStripeEvent, type StripeRuntimeEnv } from './stripeCheckout.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';

/**
 * Isolated fixtures. No Stripe charge, no Resend call, no production database.
 * Owner-test grants are not used as proof that a purchase can be restored.
 */

const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_pro_cloud',
  STRIPE_WEBHOOK_SECRET: 'whsec_pro_cloud',
  STRIPE_PRICE_PRO: 'price_pro_once',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: 'price_pro_monthly_discount',
  STRIPE_PRICE_MEDIA: 'price_media_once',
  STRIPE_PRICE_INSTRUCTOR: 'price_instructor_once',
  STRIPE_PRICE_MEDIA_CLOUD_MONTHLY: 'price_media_cloud',
  STRIPE_PRICE_INSTRUCTOR_CLOUD_MONTHLY: 'price_instructor_cloud',
};

const PEPPER = 'pepper';
const START = new Date('2026-11-07T15:00:00.000Z');
const PRO_DOORS: Door[] = ['white', 'student', 'coach', 'pro', 'media'];

function signed(payload: string, at: Date): Request {
  const timestamp = Math.floor(at.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '').update(`${timestamp}.${payload}`).digest('hex');
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

function event(id: string, type: string, object: Record<string, unknown>, at: Date): string {
  return JSON.stringify({ id, created: Math.floor(at.getTime() / 1000), type, data: { object } });
}

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return {
    secret: JSON.stringify(privateJwk),
    publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y },
  };
}

function restoreEnv(secret: string) {
  return { CODE_HASH_PEPPER: PEPPER, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', TURNSTILE_SECRET_KEY: 'turnstile-test' };
}

const turnstile: typeof fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });

type GrantRow = { product: string; source: string; sourceRef: string | null; status: string; revokedAt: string | null };

async function licenseForSource(db: D1Database, sourceRef: string): Promise<string> {
  const row = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ? LIMIT 1`)
    .bind(sourceRef)
    .first<{ licenseId: string }>();
  return row?.licenseId ?? '';
}

async function grantRows(db: D1Database, licenseId: string): Promise<GrantRow[]> {
  const rows = await db
    .prepare(
      `SELECT product, source, source_ref AS sourceRef, status, revoked_at AS revokedAt
       FROM grants WHERE license_id = ? ORDER BY product, source`,
    )
    .bind(licenseId)
    .all<GrantRow>();
  return rows.results;
}

async function postWebhook(db: D1Database, payload: string, at: Date, fetchImpl?: typeof fetch) {
  const store = memoryEntitlementStore();
  const response = await handleWebhook(signed(payload, at), env, store, () => at, {
    db,
    pepper: PEPPER,
    fetchImpl,
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body, store };
}

function codeFrom(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => /^[A-Z0-9]{8}$/.test(line)) ?? '';
}

async function requestCode(db: D1Database, email: string, at: Date, ip: string) {
  const sender = memoryEmailSender();
  const response = await handleRestoreRequest(
    new Request('http://localhost/api/restore/request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': ip },
      body: JSON.stringify({ email, turnstileToken: 'ok' }),
    }),
    restoreEnv('unused'),
    db,
    sender,
    turnstile,
    () => at,
  );
  const body = (await response.json()) as { ok?: boolean; message?: string; challengeId?: string; error?: string };
  return { status: response.status, body, sender };
}

async function verifyCode(
  db: D1Database,
  secret: string,
  challengeId: string,
  code: string,
  at: Date,
  deviceId: string,
) {
  const response = await handleRestoreVerify(
    new Request('http://localhost/api/restore/verify', {
      method: 'POST',
      headers: { [APP_VERSION_HEADER]: MEDIA_APP_VERSION },
      body: JSON.stringify({ challengeId, code, deviceId }),
    }),
    restoreEnv(secret),
    db,
    () => at,
  );
  const body = (await response.json()) as { ok?: boolean; token?: string; error?: string; grants?: string[] };
  return { status: response.status, body };
}

async function claimsFrom(token: string, publicJwk: { kty: 'EC'; crv: 'P-256'; x?: string; y?: string }) {
  return verifyToken(token, [{ kid: 'k1', jwk: publicJwk }]);
}

test('Pro Cloud checkout is a one-time Pro grant plus a Cloud subscription, not a Pro subscription', () => {
  const parsed = purchaseFromStripeEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_pro_cloud',
          object: 'checkout.session',
          mode: 'subscription',
          payment_status: 'paid',
          subscription: 'sub_pro_cloud',
          customer_details: { email: 'Buyer@Gym.test' },
          metadata: { product: 'advantage-pro', cloud: '1' },
          amount_total: 10598,
          currency: 'usd',
        },
      },
    },
    env,
  );
  assert.equal(parsed.action, 'record-pro');
  if (parsed.action !== 'record-pro') return;
  assert.equal(parsed.cloud, true);
  assert.equal(parsed.subscriptionId, 'sub_pro_cloud');
  assert.equal(parsed.purchase.email, 'buyer@gym.test');

  const legacy = purchaseFromStripeEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_legacy',
          object: 'checkout.session',
          mode: 'subscription',
          payment_status: 'paid',
          subscription: 'sub_legacy',
          customer_details: { email: 'legacy@gym.test' },
          metadata: { product: 'advantage-pro' },
        },
      },
    },
    env,
  );
  assert.equal(legacy.action, 'grant-pro');
  if (legacy.action === 'grant-pro') assert.equal(legacy.cloud, undefined);

  const base = purchaseFromStripeEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_base',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          customer_details: { email: 'base@gym.test' },
          metadata: { product: 'advantage-pro' },
        },
      },
    },
    env,
  );
  assert.equal(base.action, 'record-pro');
  if (base.action === 'record-pro') assert.equal(base.cloud, undefined);

  const priced = purchaseFromStripeEvent(
    {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_legacy_price',
          object: 'subscription',
          status: 'active',
          metadata: { product: 'advantage-pro' },
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        },
      },
    },
    env,
  );
  assert.equal(priced.action, 'sync-pro');

  const cloudEvent = purchaseFromStripeEvent(
    {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_pro_cloud',
          object: 'subscription',
          status: 'canceled',
          metadata: { product: 'advantage-pro', cloud: '1' },
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        },
      },
    },
    env,
  );
  assert.equal(cloudEvent.action, 'sync-cloud');
  if (cloudEvent.action === 'sync-cloud') {
    assert.equal(cloudEvent.edition, 'pro');
    assert.equal(cloudEvent.entitled, false);
  }
});

test('webhook, wiped phone, and a second install restore Pro doors and active Cloud from server rows', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const at = new Date(START);
  const paid = await postWebhook(
    db,
    event(
      'evt_pro_cloud_paid',
      'checkout.session.completed',
      {
        id: 'cs_pro_cloud',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_pro_cloud',
        customer_details: { email: 'Buyer@Gym.test' },
        metadata: { product: 'advantage-pro', cloud: '1' },
        amount_total: 10598,
        currency: 'usd',
      },
      at,
    ),
    at,
  );
  assert.equal(paid.status, 200);
  assert.equal(paid.body.cloud, true);
  const licenseId = String(paid.body.licenseId);
  const rows = await grantRows(db, licenseId);
  assert.deepEqual(
    rows.map((row) => [row.product, row.source, row.status]),
    [
      ['advantage-cloud-pro', 'stripe_subscription', 'active'],
      ['advantage-pro', 'stripe_payment', 'active'],
    ],
  );
  assert.equal(rows.some((row) => row.product === 'advantage-pro' && row.source === 'stripe_subscription'), false);
  assert.equal(await paid.store.findProBySubscriptionId('sub_pro_cloud'), null);
  const half = await readHalfOffCode(db, licenseId);
  assert.ok(half);

  const again = await postWebhook(
    db,
    event(
      'evt_pro_cloud_paid',
      'checkout.session.completed',
      {
        id: 'cs_pro_cloud',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_pro_cloud',
        customer_details: { email: 'Buyer@Gym.test' },
        metadata: { product: 'advantage-pro', cloud: '1' },
      },
      at,
    ),
    at,
  );
  assert.equal(again.body.duplicate, true);
  assert.equal((await grantRows(db, licenseId)).length, 2);

  const first = await requestCode(db, 'buyer@gym.test', at, '203.0.113.10');
  assert.equal(first.status, 200);
  assert.equal(first.sender.sent.length, 1);
  assert.equal(/https?:\/\//.test(first.sender.sent[0]?.text ?? ''), false);
  const code = codeFrom(first.sender.sent[0]?.text ?? '');
  const opened = await verifyCode(db, pair.secret, first.body.challengeId ?? '', code, at, 'phone-wiped');
  assert.equal(opened.status, 200);
  const claims = await claimsFrom(opened.body.token ?? '', pair.publicJwk);
  assert.ok(claims);
  assert.deepEqual([...claims.grants].sort(), [...PRO_DOORS].sort());
  assert.equal(claims.subs?.cloud, true);
  assert.equal(claims.subs?.state, 'active');
  assert.equal(proPlusCloudDoorOpen(claims), true);
  assert.equal(claims.src, 'stripe');

  const reused = await verifyCode(db, pair.secret, first.body.challengeId ?? '', code, at, 'phone-again');
  assert.equal(reused.status, 400);
  assert.equal(reused.body.token, undefined);

  const reinstall = await requestCode(db, 'Buyer@Gym.test', at, '203.0.113.11');
  const secondCode = codeFrom(reinstall.sender.sent[0]?.text ?? '');
  const second = await verifyCode(db, pair.secret, reinstall.body.challengeId ?? '', secondCode, at, 'phone-reinstall');
  const secondClaims = await claimsFrom(second.body.token ?? '', pair.publicJwk);
  assert.equal(secondClaims?.subs?.cloud, true);
  assert.equal(secondClaims?.grants.includes('pro'), true);
  assert.notEqual(secondClaims?.did, claims.did);

  const bare = await issueToken(pair.secret, {
    licenseId,
    grants: PRO_DOORS,
    tier: 'pro',
    src: 'stripe',
    deviceId: 'phone-wiped',
    now: at,
    kind: 'pro',
    subs: { state: 'active' },
    appVersion: MEDIA_APP_VERSION,
  });
  assert.ok(bare);
  const refreshed = await handleTokenRefresh(
    new Request('http://localhost/api/token/refresh', {
      method: 'POST',
      headers: { [APP_VERSION_HEADER]: MEDIA_APP_VERSION },
      body: JSON.stringify({ token: bare }),
    }),
    { ...env, ...restoreEnv(pair.secret) },
    db,
    () => at,
  );
  assert.equal(refreshed.status, 200);
  const refreshedBody = (await refreshed.json()) as { token?: string };
  const refreshedClaims = await claimsFrom(refreshedBody.token ?? '', pair.publicJwk);
  assert.equal(refreshedClaims?.subs?.cloud, true, 'Cloud is read from the server row, not the token that was sent');

  const later = new Date(at.getTime() + 24 * 60 * 60 * 1000);
  const canceled = await postWebhook(
    db,
    event(
      'evt_pro_cloud_cancel',
      'customer.subscription.deleted',
      {
        id: 'sub_pro_cloud',
        object: 'subscription',
        status: 'canceled',
        metadata: { product: 'advantage-pro', cloud: '1' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      },
      later,
    ),
    later,
  );
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.cloud, false);
  assert.equal(canceled.body.pro, false);
  const after = await grantRows(db, licenseId);
  const payment = after.find((row) => row.product === 'advantage-pro');
  const cloud = after.find((row) => row.product === CLOUD_GRANT_PRODUCT.pro);
  assert.equal(payment?.status, 'active');
  assert.equal(payment?.revokedAt, null);
  assert.equal(cloud?.status, 'inactive');
  assert.ok(cloud?.revokedAt);
  const view = await cloudAccessForLicense(db, licenseId, later);
  assert.equal(view.entitled, false);
  assert.equal(view.tracked, true);

  const stale = await issueToken(pair.secret, {
    licenseId,
    grants: PRO_DOORS,
    tier: 'pro',
    src: 'stripe',
    deviceId: 'phone-wiped',
    now: at,
    kind: 'pro',
    subs: { state: 'active', cloud: true },
    appVersion: MEDIA_APP_VERSION,
  });
  const dropped = await handleTokenRefresh(
    new Request('http://localhost/api/token/refresh', {
      method: 'POST',
      headers: { [APP_VERSION_HEADER]: MEDIA_APP_VERSION },
      body: JSON.stringify({ token: stale }),
    }),
    { ...env, ...restoreEnv(pair.secret) },
    db,
    () => later,
  );
  const droppedClaims = await claimsFrom(((await dropped.json()) as { token?: string }).token ?? '', pair.publicJwk);
  assert.equal(droppedClaims?.subs?.cloud, undefined);
  assert.equal(droppedClaims?.grants.includes('pro'), true);
  assert.equal(proPlusCloudDoorOpen(droppedClaims), false);

  const recovered = await requestCode(db, 'buyer@gym.test', later, '203.0.113.12');
  const recoveredCode = codeFrom(recovered.sender.sent[0]?.text ?? '');
  const kept = await verifyCode(db, pair.secret, recovered.body.challengeId ?? '', recoveredCode, later, 'phone-after-cancel');
  const keptClaims = await claimsFrom(kept.body.token ?? '', pair.publicJwk);
  assert.equal(keptClaims?.grants.includes('pro'), true);
  assert.equal(keptClaims?.subs?.cloud, undefined);
  assert.equal(proPlusCloudDoorOpen(keptClaims), false);
});

test('a restore code expires, a wrong code does not unlock, and five misses burn the challenge', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const at = new Date(START);
  await postWebhook(
    db,
    event(
      'evt_base_for_codes',
      'checkout.session.completed',
      {
        id: 'cs_codes',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        customer_details: { email: 'codes@gym.test' },
        metadata: { product: 'advantage-pro' },
        amount_total: 9999,
        currency: 'usd',
      },
      at,
    ),
    at,
  );
  const asked = await requestCode(db, 'codes@gym.test', at, '203.0.113.20');
  const code = codeFrom(asked.sender.sent[0]?.text ?? '');
  const expiredAt = new Date(at.getTime() + 16 * 60 * 1000);
  const expired = await verifyCode(db, pair.secret, asked.body.challengeId ?? '', code, expiredAt, 'phone-late');
  assert.equal(expired.status, 400);
  assert.equal(expired.body.token, undefined);

  const fresh = await requestCode(db, 'codes@gym.test', expiredAt, '203.0.113.21');
  const freshCode = codeFrom(fresh.sender.sent[0]?.text ?? '');
  const wrong = await verifyCode(db, pair.secret, fresh.body.challengeId ?? '', 'ZZZZZZZZ', expiredAt, 'phone-wrong');
  assert.equal(wrong.status, 400);
  const still = await verifyCode(db, pair.secret, fresh.body.challengeId ?? '', freshCode, expiredAt, 'phone-right');
  assert.equal(still.status, 200);
  const stillClaims = await claimsFrom(still.body.token ?? '', pair.publicJwk);
  assert.equal(stillClaims?.subs?.cloud, undefined);
  assert.equal(proPlusCloudDoorOpen(stillClaims), false);

  const burned = await requestCode(db, 'codes@gym.test', expiredAt, '203.0.113.22');
  const burnedCode = codeFrom(burned.sender.sent[0]?.text ?? '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const miss = await verifyCode(db, pair.secret, burned.body.challengeId ?? '', 'AAAAAAAA', expiredAt, 'phone-miss');
    assert.equal(miss.status, 400);
  }
  const tooLate = await verifyCode(db, pair.secret, burned.body.challengeId ?? '', burnedCode, expiredAt, 'phone-miss');
  assert.equal(tooLate.status, 400);
  assert.equal(tooLate.body.token, undefined);
});

test('legacy monthly Pro without cloud metadata stays a subscription and does not gain Cloud or a one-time grant', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const at = new Date(START);
  const paid = await postWebhook(
    db,
    event(
      'evt_legacy_paid',
      'checkout.session.completed',
      {
        id: 'cs_legacy',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_legacy',
        customer_details: { email: 'legacy@gym.test' },
        metadata: { product: 'advantage-pro' },
        amount_total: 599,
        currency: 'usd',
      },
      at,
    ),
    at,
  );
  assert.equal(paid.status, 200);
  assert.equal(paid.body.cloud, undefined);
  const licenseId = await licenseForSource(db, 'cs_legacy');
  assert.ok(licenseId);
  const rows = await grantRows(db, licenseId);
  assert.deepEqual(rows.map((row) => [row.product, row.source]), [['advantage-pro', 'stripe_subscription']]);
  assert.ok(await readHalfOffCode(db, licenseId));
  const opened = await requestCode(db, 'legacy@gym.test', at, '203.0.113.30');
  const claims = await claimsFrom(
    (
      await verifyCode(db, pair.secret, opened.body.challengeId ?? '', codeFrom(opened.sender.sent[0]?.text ?? ''), at, 'legacy-phone')
    ).body.token ?? '',
    pair.publicJwk,
  );
  assert.equal(claims?.grants.includes('pro'), true);
  assert.equal(claims?.subs?.cloud, undefined);
  assert.equal(proPlusCloudDoorOpen(claims), false);

  const later = new Date(at.getTime() + 60_000);
  const canceled = await postWebhook(
    db,
    event(
      'evt_legacy_cancel',
      'customer.subscription.deleted',
      {
        id: 'sub_legacy',
        object: 'subscription',
        status: 'canceled',
        metadata: { product: 'advantage-pro' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      },
      later,
    ),
    later,
    async () =>
      new Response(
        JSON.stringify({
          id: 'sub_legacy',
          object: 'subscription',
          status: 'canceled',
          metadata: { product: 'advantage-pro' },
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        }),
        { status: 200 },
      ),
  );
  assert.equal(canceled.body.entitled, false);
  const closed = await grantsForLicense(db, licenseId, later);
  assert.equal(closed.some((row) => row.product === 'advantage-pro'), false);
  const mail = await requestCode(db, 'legacy@gym.test', later, '203.0.113.31');
  const denied = await verifyCode(db, pair.secret, mail.body.challengeId ?? '', codeFrom(mail.sender.sent[0]?.text ?? ''), later, 'legacy-phone');
  assert.equal(denied.status, 400);
  assert.equal(denied.body.token, undefined);
  assert.equal((await grantRows(db, licenseId)).some((row) => row.product === CLOUD_GRANT_PRODUCT.pro), false);
});

test('base Pro restores Pro doors and never Cloud', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const at = new Date(START);
  const paid = await postWebhook(
    db,
    event(
      'evt_base_paid',
      'checkout.session.completed',
      {
        id: 'cs_base',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        customer_details: { email: 'base@gym.test' },
        metadata: { product: 'advantage-pro' },
        amount_total: 9999,
        currency: 'usd',
      },
      at,
    ),
    at,
  );
  const licenseId = String(paid.body.licenseId);
  assert.deepEqual((await grantRows(db, licenseId)).map((row) => [row.product, row.source]), [['advantage-pro', 'stripe_payment']]);
  const half = await readHalfOffCode(db, licenseId);
  assert.equal(half?.maxUses, 100);
  assert.equal(half?.promoId ?? null, null);
  const asked = await requestCode(db, 'base@gym.test', at, '203.0.113.40');
  const claims = await claimsFrom(
    (await verifyCode(db, pair.secret, asked.body.challengeId ?? '', codeFrom(asked.sender.sent[0]?.text ?? ''), at, 'base-phone')).body.token ?? '',
    pair.publicJwk,
  );
  assert.equal(claims?.grants.includes('pro'), true);
  assert.equal(claims?.subs?.cloud, undefined);
  assert.equal(proPlusCloudDoorOpen(claims), false);
});

test('Media and Instructor Cloud restore Cloud from the server and keep the edition when Cloud ends', async () => {
  const pair = await keys();
  const editions = [
    { name: 'media' as const, product: 'advantage-media', door: 'media' as const, price: 'price_media_cloud' },
    { name: 'coach' as const, product: 'advantage-coach', door: 'coach' as const, price: 'price_instructor_cloud' },
  ];
  for (const edition of editions) {
    const db = sqliteD1();
    const at = new Date(START);
    const paid = await postWebhook(
      db,
      event(
        `evt_${edition.name}_paid`,
        'checkout.session.completed',
        {
          id: `cs_${edition.name}_cloud`,
          object: 'checkout.session',
          mode: 'subscription',
          payment_status: 'paid',
          subscription: `sub_${edition.name}_cloud`,
          customer_details: { email: `${edition.name}@gym.test` },
          metadata: { product: edition.product, cloud: '1' },
          amount_total: 3598,
          currency: 'usd',
        },
        at,
      ),
      at,
    );
    assert.equal(paid.body.cloud, true);
    const licenseId = await licenseForSource(db, `cs_${edition.name}_cloud`);
    const asked = await requestCode(db, `${edition.name}@gym.test`, at, `203.0.113.${edition.name === 'media' ? '50' : '51'}`);
    const claims = await claimsFrom(
      (
        await verifyCode(
          db,
          pair.secret,
          asked.body.challengeId ?? '',
          codeFrom(asked.sender.sent[0]?.text ?? ''),
          at,
          `${edition.name}-phone`,
        )
      ).body.token ?? '',
      pair.publicJwk,
    );
    assert.equal(claims?.subs?.cloud, true);
    assert.equal(claims?.grants.includes(edition.door), true);
    assert.equal(claims?.grants.includes('pro'), false);
    assert.equal(proPlusCloudDoorOpen(claims), true);

    const later = new Date(at.getTime() + 60_000);
    await postWebhook(
      db,
      event(
        `evt_${edition.name}_cancel`,
        'customer.subscription.deleted',
        {
          id: `sub_${edition.name}_cloud`,
          object: 'subscription',
          status: 'canceled',
          metadata: { product: edition.product, cloud: '1' },
          items: { data: [{ price: { id: edition.price } }] },
        },
        later,
      ),
      later,
    );
    const editionRows = await grantRows(db, licenseId);
    assert.equal(editionRows.find((row) => row.product === edition.product)?.status, 'active');
    assert.equal(editionRows.find((row) => row.product === CLOUD_GRANT_PRODUCT[edition.name])?.status, 'inactive');
    const after = await requestCode(db, `${edition.name}@gym.test`, later, `203.0.113.${edition.name === 'media' ? '52' : '53'}`);
    const kept = await claimsFrom(
      (
        await verifyCode(
          db,
          pair.secret,
          after.body.challengeId ?? '',
          codeFrom(after.sender.sent[0]?.text ?? ''),
          later,
          `${edition.name}-phone-2`,
        )
      ).body.token ?? '',
      pair.publicJwk,
    );
    assert.equal(kept?.grants.includes(edition.door), true);
    assert.equal(kept?.grants.includes('pro'), false);
    assert.equal(kept?.subs?.cloud, undefined);
    assert.equal(proPlusCloudDoorOpen(kept), false);
  }
});

test('an unknown address gets the same reply and no unlock, and a checkout with no email cannot be guessed', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const at = new Date(START);
  await postWebhook(
    db,
    event(
      'evt_no_email',
      'checkout.session.completed',
      {
        id: 'cs_no_email',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        metadata: { product: 'advantage-pro' },
        amount_total: 9999,
        currency: 'usd',
      },
      at,
    ),
    at,
  );
  const knownShape = await requestCode(db, 'buyer@gym.test', at, '203.0.113.60');
  const unknown = await requestCode(db, 'nobody@gym.test', at, '203.0.113.61');
  assert.equal(knownShape.status, unknown.status);
  assert.deepEqual(Object.keys(knownShape.body), Object.keys(unknown.body));
  assert.equal(knownShape.body.ok, true);
  assert.equal(unknown.body.ok, true);
  assert.equal(knownShape.sender.sent.length, 0);
  assert.equal(unknown.sender.sent.length, 0);
  const denied = await verifyCode(db, pair.secret, unknown.body.challengeId ?? '', 'ABCDEFGH', at, 'stranger');
  assert.equal(denied.status, 400);
  assert.equal(denied.body.token, undefined);
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM identities`).first<{ total: number }>();
  assert.equal(Number(count?.total), 0);
});

test('a pre-fix Pro Cloud subscription is not rewritten into one-time Pro, and cancel does not delete that Pro grant', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const at = new Date(START);
  const { recordPurchase } = await import('./purchaseRecords.ts');
  const { licenseId } = await recordPurchase(db, {
    email: 'prefix@gym.test',
    product: 'advantage-pro',
    source: 'stripe_subscription',
    sourceRef: 'cs_prefix',
    sessionId: 'cs_prefix',
    subscriptionId: 'sub_prefix',
    pepper: PEPPER,
    now: at,
    status: 'active',
  });
  const updated = await postWebhook(
    db,
    event(
      'evt_prefix_cloud',
      'customer.subscription.updated',
      {
        id: 'sub_prefix',
        object: 'subscription',
        status: 'active',
        metadata: { product: 'advantage-pro', cloud: '1' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      },
      at,
    ),
    at,
  );
  assert.equal(updated.body.edition, 'pro');
  assert.equal(updated.body.cloud, true);
  const mid = await grantRows(db, licenseId);
  assert.equal(mid.some((row) => row.source === 'stripe_payment'), false);
  assert.equal(mid.find((row) => row.product === 'advantage-pro')?.status, 'active');
  assert.equal(mid.find((row) => row.product === CLOUD_GRANT_PRODUCT.pro)?.status, 'active');

  const later = new Date(at.getTime() + 60_000);
  await postWebhook(
    db,
    event(
      'evt_prefix_cancel',
      'customer.subscription.deleted',
      {
        id: 'sub_prefix',
        object: 'subscription',
        status: 'canceled',
        metadata: { product: 'advantage-pro', cloud: '1' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      },
      later,
    ),
    later,
  );
  const after = await grantRows(db, licenseId);
  assert.equal(after.some((row) => row.source === 'stripe_payment'), false);
  assert.equal(after.find((row) => row.product === 'advantage-pro')?.status, 'active');
  assert.equal(after.find((row) => row.product === CLOUD_GRANT_PRODUCT.pro)?.status, 'inactive');
  const asked = await requestCode(db, 'prefix@gym.test', later, '203.0.113.70');
  const claims = await claimsFrom(
    (await verifyCode(db, pair.secret, asked.body.challengeId ?? '', codeFrom(asked.sender.sent[0]?.text ?? ''), later, 'prefix-phone')).body.token ?? '',
    pair.publicJwk,
  );
  assert.equal(claims?.grants.includes('pro'), true);
  assert.equal(claims?.subs?.cloud, undefined);
});

test('an unrelated subscription and a cloud event with no license do not grant Pro or Cloud', async () => {
  const db = sqliteD1();
  const at = new Date(START);
  const unrelated = await postWebhook(
    db,
    event(
      'evt_unrelated',
      'customer.subscription.deleted',
      {
        id: 'sub_other',
        object: 'subscription',
        status: 'canceled',
        metadata: {},
        items: { data: [{ price: { id: 'price_someone_else' } }] },
      },
      at,
    ),
    at,
    async () => new Response(JSON.stringify({ error: { code: 'resource_missing' } }), { status: 404 }),
  );
  assert.equal(unrelated.status, 200);
  assert.equal(unrelated.body.ignored, true);
  const orphan = await postWebhook(
    db,
    event(
      'evt_orphan_cloud',
      'customer.subscription.updated',
      {
        id: 'sub_orphan',
        object: 'subscription',
        status: 'active',
        metadata: { product: 'advantage-pro', cloud: '1' },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      },
      at,
    ),
    at,
  );
  assert.equal(orphan.status, 200);
  const grants = await db.prepare(`SELECT COUNT(*) AS total FROM grants`).first<{ total: number }>();
  const identities = await db.prepare(`SELECT COUNT(*) AS total FROM identities`).first<{ total: number }>();
  assert.equal(Number(grants?.total), 0);
  assert.equal(Number(identities?.total), 0);
  assert.equal(await orphan.store.findProBySubscriptionId('sub_orphan'), null);
});

test('checkout return writes the same Pro payment and Cloud rows the webhook writes', async () => {
  const db = sqliteD1();
  const pair = await keys();
  const nonce = 'nonce-for-pro-cloud-session';
  const nonceHash = await sha256Hex(nonce);
  const response = await handleSessionRedeem(
    new Request('http://localhost/api/session/redeem', {
      method: 'POST',
      headers: { [APP_VERSION_HEADER]: MEDIA_APP_VERSION },
      body: JSON.stringify({ sessionId: 'cs_redeem_pro_cloud', nonce, deviceId: 'checkout-phone' }),
    }),
    { ...env, ENTITLEMENT_SIGNING_KEY: pair.secret, CODE_HASH_PEPPER: PEPPER },
    db,
    async () =>
      new Response(
        JSON.stringify({
          id: 'cs_redeem_pro_cloud',
          payment_status: 'paid',
          status: 'complete',
          mode: 'subscription',
          client_reference_id: nonceHash,
          subscription: 'sub_redeem_cloud',
          customer_details: { email: 'redeem@gym.test' },
          metadata: { product: 'advantage-pro', cloud: '1' },
        }),
        { status: 200 },
      ),
    () => START,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token?: string };
  const bought = await claimsFrom(body.token ?? '', pair.publicJwk);
  assert.equal(bought?.subs?.cloud, true);
  assert.equal(bought?.grants.includes('pro'), true);
  const license = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ?`)
    .bind('cs_redeem_pro_cloud')
    .first<{ licenseId: string }>();
  assert.ok(license);
  const rows = await grantRows(db, license.licenseId);
  assert.deepEqual(
    rows.map((row) => [row.product, row.source]),
    [
      ['advantage-cloud-pro', 'stripe_subscription'],
      ['advantage-pro', 'stripe_payment'],
    ],
  );
  const asked = await requestCode(db, 'redeem@gym.test', START, '203.0.113.80');
  const restored = await claimsFrom(
    (
      await verifyCode(db, pair.secret, asked.body.challengeId ?? '', codeFrom(asked.sender.sent[0]?.text ?? ''), START, 'redeem-wiped')
    ).body.token ?? '',
    pair.publicJwk,
  );
  assert.equal(restored?.subs?.cloud, true);
  assert.equal(restored?.grants.includes('pro'), true);
  assert.equal(proPlusCloudDoorOpen(restored), true);
});
