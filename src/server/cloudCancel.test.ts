import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyToken, type Door, type PrivateJwk, type PublicJwk } from '../lib/entitlementToken.ts';
import { cloudLapsePhase, readCloudLapse, syncCloudLapse } from '../lib/cloudLapse.ts';
import { chooseGymHome } from '../lib/gymHome.ts';
import { APP_VERSION_HEADER, MEDIA_APP_VERSION } from '../lib/appCapability.ts';
import { cloudAccessForLicense, recordCloudGrant } from './cloudSubscription.ts';
import { memoryEntitlementStore } from './entitlements.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { handleWebhook } from './handlers.ts';
import { doorsFromStored, grantOpen, grantsForLicense, recordPurchase } from './purchaseRecords.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { purchaseFromStripeEvent, type StripeRuntimeEnv } from './stripeCheckout.ts';
import { readSubscription, readSubscriptionForLicense } from './subscriptionSync.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { issueToken } from './tokenIssue.ts';

if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    configurable: true,
  });
}
const { proPlusCloudDoorOpen } = await import('../lib/proPlusCloud.ts');

const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_cloud_cancel',
  STRIPE_WEBHOOK_SECRET: 'whsec_cloud_cancel',
  STRIPE_PRICE_INSTRUCTOR: 'price_instructor_once',
  STRIPE_PRICE_MEDIA: 'price_media_once',
  STRIPE_PRICE_PRO: 'price_pro_once',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_env',
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: 'price_pro_299',
  STRIPE_PRICE_INSTRUCTOR_CLOUD_MONTHLY: 'price_instructor_cloud',
  STRIPE_PRICE_MEDIA_CLOUD_MONTHLY: 'price_media_cloud',
};

const DAY = 24 * 60 * 60 * 1000;
const start = new Date('2026-11-01T12:00:00.000Z');

type Edition = {
  name: 'media' | 'coach';
  product: 'advantage-media' | 'advantage-coach';
  price: string;
  door: Door;
};
const MEDIA: Edition = { name: 'media', product: 'advantage-media', price: 'price_media_cloud', door: 'media' as Door };
const COACH: Edition = { name: 'coach', product: 'advantage-coach', price: 'price_instructor_cloud', door: 'coach' as Door };

function signed(payload: string, now: Date): Request {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '').update(`${timestamp}.${payload}`).digest('hex');
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

function subscription(id: string, product: string, price: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    object: 'subscription',
    status,
    customer: 'cus_buyer',
    cancel_at_period_end: false,
    metadata: product ? { product, cloud: '1' } : {},
    items: { data: [{ price: { id: price }, current_period_end: Math.floor((start.getTime() + 30 * DAY) / 1000) }] },
    ...extra,
  };
}

function event(id: string, type: string, object: Record<string, unknown>, at: Date): string {
  return JSON.stringify({ id, created: Math.floor(at.getTime() / 1000), type, data: { object } });
}

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: publicJwk.x, y: publicJwk.y } };
}

/** A buyer who finished Checkout for the edition with Cloud, the way /api/session/redeem leaves D1. */
async function cloudBuyer(edition: Edition) {
  const db = sqliteD1();
  const store = memoryEntitlementStore();
  const subId = `sub_${edition.name}_cloud`;
  const { licenseId } = await recordPurchase(db, {
    email: `${edition.name}@gym.test`,
    product: edition.product,
    source: 'stripe_subscription',
    sourceRef: `cs_${edition.name}`,
    sessionId: `cs_${edition.name}`,
    subscriptionId: subId,
    stripeCustomerId: 'cus_buyer',
    pepper: 'pepper',
    now: start,
    status: 'active',
  });
  await recordCloudGrant(db, { licenseId, edition: edition.name, subscriptionId: subId, now: start });
  // Stripe, by subscription id. An unknown id is a 404.
  const stripe = new Map<string, Record<string, unknown>>([[subId, subscription(subId, edition.product, edition.price, 'active')]]);
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const id = decodeURIComponent(url.split('/subscriptions/')[1]?.split('?')[0] ?? '');
    const found = stripe.get(id);
    return found
      ? new Response(JSON.stringify(found), { status: 200 })
      : new Response(JSON.stringify({ error: { code: 'resource_missing' } }), { status: 404 });
  };
  const setStripe = (next: Record<string, unknown>) => {
    stripe.set(String(next.id), next);
  };
  const send = async (payload: string, at: Date) => {
    const response = await handleWebhook(signed(payload, at), env, store, () => at, { db, pepper: 'pepper', fetchImpl });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { db, store, subId, licenseId, fetchImpl, setStripe, send };
}

async function editionOpen(db: ReturnType<typeof sqliteD1>, licenseId: string, product: string, at: Date): Promise<boolean> {
  const rows = await grantsForLicense(db, licenseId, at);
  return rows.some((row) => row.product === product && grantOpen(row, at));
}

async function refresh(
  buyer: Awaited<ReturnType<typeof cloudBuyer>>,
  edition: Edition,
  at: Date,
  claimsCloud = true,
) {
  const pair = await keys();
  const doors = expandGrants([edition.door]);
  const token = await issueToken(pair.secret, {
    licenseId: buyer.licenseId,
    grants: doors,
    tier: tierForGrants(doors, 'stripe'),
    src: 'stripe',
    deviceId: 'dev_cloud',
    now: start,
    kind: 'onetime',
    subs: claimsCloud ? { state: 'active', cloud: true } : undefined,
    appVersion: MEDIA_APP_VERSION,
  });
  assert.ok(token);
  const response = await handleTokenRefresh(
    new Request('http://localhost/api/token/refresh', {
      method: 'POST',
      headers: { [APP_VERSION_HEADER]: MEDIA_APP_VERSION },
      body: JSON.stringify({ token }),
    }),
    { ...env, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1' },
    buyer.db,
    () => at,
    buyer.fetchImpl,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: string };
  const claims = await verifyToken(body.token, [{ kid: 'k1', jwk: pair.publicJwk }]);
  assert.ok(claims);
  return claims;
}

for (const edition of [MEDIA, COACH]) {
  const label = edition === MEDIA ? 'Media Cloud' : 'Instructor Cloud';

  test(`${label}: canceling clears Cloud in D1 and KV and keeps the one-time edition`, async () => {
    const buyer = await cloudBuyer(edition);
    const before = await refresh(buyer, edition, new Date(start.getTime() + 60_000));
    assert.equal(before.subs?.cloud, true);
    assert.equal(before.grants.includes('pro' as Door), false, 'a Cloud buyer never reads as Pro');

    const at = new Date(start.getTime() + 3 * DAY);
    buyer.setStripe(subscription(buyer.subId, edition.product, edition.price, 'canceled'));
    const deleted = await buyer.send(
      event('evt_deleted', 'customer.subscription.deleted', subscription(buyer.subId, edition.product, edition.price, 'canceled'), at),
      at,
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.cloud, false);
    assert.equal(deleted.body.edition, edition.name);
    assert.equal(deleted.body.pro, false);
    assert.equal(deleted.body.state, 'locked');

    // D1: Cloud is off with a lapse time. The edition grant is untouched.
    const cloud = await cloudAccessForLicense(buyer.db, buyer.licenseId, at);
    assert.deepEqual(cloud, { tracked: true, entitled: false, edition: edition.name, lapsedAt: at.toISOString() });
    assert.equal(await editionOpen(buyer.db, buyer.licenseId, edition.product, at), true);
    assert.equal(await readSubscriptionForLicense(buyer.db, buyer.licenseId), null, 'Cloud is not a Pro subscription');
    assert.equal((await readSubscription(buyer.db, buyer.subId))?.status, 'canceled');

    // KV: a Cloud record goes inactive. No Pro record is written.
    const kv = await buyer.store.findCloudBySubscriptionId?.(buyer.subId);
    assert.equal(kv?.status, 'inactive');
    assert.equal(kv?.cloudLapsedAt, at.toISOString());
    assert.equal(await buyer.store.findProBySubscriptionId(buyer.subId), null);

    // Token refresh: Cloud drops, the edition doors stay, no Pro.
    const after = await refresh(buyer, edition, new Date(at.getTime() + 60_000));
    assert.equal(after.subs?.cloud, undefined);
    assert.notEqual(after.subs?.state, 'locked', 'the one-time edition is not a locked subscription');
    assert.deepEqual([...after.grants].sort(), [...expandGrants([edition.door])].sort());
    assert.equal(after.grants.includes('pro' as Door), false);
    assert.deepEqual(doorsFromStored(await grantsForLicense(buyer.db, buyer.licenseId, at)).includes(edition.door), true);
  });

  test(`${label}: unpaid or a 7-day failed invoice clears Cloud; cancel at period end waits for the end`, async () => {
    const buyer = await cloudBuyer(edition);
    const periodEnd = Math.floor((start.getTime() + 10 * DAY) / 1000);
    const pending = subscription(buyer.subId, edition.product, edition.price, 'active', {
      cancel_at_period_end: true,
      items: { data: [{ price: { id: edition.price }, current_period_end: periodEnd }] },
    });
    buyer.setStripe(pending);
    const at = new Date(start.getTime() + DAY);
    const scheduled = await buyer.send(event('evt_cape', 'customer.subscription.updated', pending, at), at);
    assert.equal(scheduled.body.cloud, true, 'still paid through the period');
    assert.equal((await refresh(buyer, edition, new Date(at.getTime() + 60_000))).subs?.cloud, true);
    const afterEnd = new Date(periodEnd * 1000 + 60_000);
    const ended = await refresh(buyer, edition, afterEnd);
    assert.equal(ended.subs?.cloud, undefined);
    assert.equal(await editionOpen(buyer.db, buyer.licenseId, edition.product, afterEnd), true);

    const unpaid = await cloudBuyer(edition);
    unpaid.setStripe(subscription(unpaid.subId, edition.product, edition.price, 'unpaid'));
    const u = await unpaid.send(
      event('evt_unpaid', 'customer.subscription.updated', subscription(unpaid.subId, edition.product, edition.price, 'unpaid'), at),
      at,
    );
    assert.equal(u.body.cloud, false);
    assert.equal(await editionOpen(unpaid.db, unpaid.licenseId, edition.product, at), true);

    const dunning = await cloudBuyer(edition);
    dunning.setStripe(subscription(dunning.subId, edition.product, edition.price, 'past_due'));
    // A bare invoice: no price on it, only the subscription id.
    const failed = await dunning.send(
      event('evt_fail', 'invoice.payment_failed', { object: 'invoice', subscription: dunning.subId, amount_due: 299, currency: 'usd' }, at),
      at,
    );
    assert.equal(failed.status, 200);
    assert.equal(failed.body.state, 'grace');
    assert.equal(failed.body.cloud, true);
    assert.equal(failed.body.pro, false);
    assert.equal(await dunning.store.findProBySubscriptionId(dunning.subId), null);
    const day8 = new Date(at.getTime() + 7 * DAY + 60_000);
    const lockedPayload = event('evt_day8', 'customer.subscription.updated', subscription(dunning.subId, edition.product, edition.price, 'past_due'), day8);
    const locked = await dunning.send(lockedPayload, day8);
    assert.equal(locked.body.state, 'locked');
    assert.equal(locked.body.cloud, false);
    assert.equal(await editionOpen(dunning.db, dunning.licenseId, edition.product, day8), true);
  });
}

test('a repeated cancel webhook is idempotent and keeps the first lapse time', async () => {
  const buyer = await cloudBuyer(MEDIA);
  buyer.setStripe(subscription(buyer.subId, MEDIA.product, MEDIA.price, 'canceled'));
  const at = new Date(start.getTime() + 2 * DAY);
  const payload = event('evt_same', 'customer.subscription.deleted', subscription(buyer.subId, MEDIA.product, MEDIA.price, 'canceled'), at);
  const first = await buyer.send(payload, at);
  assert.equal(first.body.cloud, false);
  const again = await buyer.send(payload, new Date(at.getTime() + 60_000));
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  // Stripe can also send the same state under a new event id.
  const later = new Date(at.getTime() + DAY);
  const resent = await buyer.send(
    event('evt_other', 'customer.subscription.deleted', subscription(buyer.subId, MEDIA.product, MEDIA.price, 'canceled'), later),
    later,
  );
  assert.equal(resent.body.cloud, false);
  const cloud = await cloudAccessForLicense(buyer.db, buyer.licenseId, later);
  assert.equal(cloud.lapsedAt, at.toISOString());
  assert.equal((await buyer.store.findCloudBySubscriptionId?.(buyer.subId))?.cloudLapsedAt, at.toISOString());
  assert.equal(await editionOpen(buyer.db, buyer.licenseId, MEDIA.product, later), true);
  const rows = await buyer.db
    .prepare(`SELECT revoked_at AS revokedAt FROM grants WHERE license_id = ? AND product = 'advantage-cloud-media'`)
    .bind(buyer.licenseId)
    .all<{ revokedAt: string | null }>();
  assert.deepEqual(rows.results.map((row) => row.revokedAt), [at.toISOString()], 'one Cloud row, stamped once');
});

test('an unrelated subscription event does not clear Cloud', async () => {
  const buyer = await cloudBuyer(MEDIA);
  const at = new Date(start.getTime() + DAY);
  // Some other subscription on the account, with no MatBoard price or metadata.
  const other = subscription('sub_unrelated', '', 'price_someone_else', 'canceled');
  buyer.setStripe(other);
  const response = await buyer.send(event('evt_unrelated', 'customer.subscription.deleted', other, at), at);
  assert.equal(response.status, 200);
  const cloud = await cloudAccessForLicense(buyer.db, buyer.licenseId, at);
  assert.equal(cloud.entitled, true);
  assert.equal((await refresh(buyer, MEDIA, new Date(at.getTime() + 60_000))).subs?.cloud, true);
});

test('Pro is unchanged: a Pro cancel still locks Pro, and it leaves a Cloud add-on alone', async () => {
  const buyer = await cloudBuyer(MEDIA);
  await recordPurchase(buyer.db, {
    email: 'media@gym.test',
    product: 'advantage-pro',
    source: 'stripe_subscription',
    sourceRef: 'sub_pro',
    sessionId: 'cs_pro',
    subscriptionId: 'sub_pro',
    pepper: 'pepper',
    now: start,
  });
  const pro = {
    id: 'sub_pro',
    object: 'subscription',
    status: 'canceled',
    customer: 'cus_buyer',
    cancel_at_period_end: false,
    metadata: { product: 'advantage-pro' },
    items: { data: [{ price: { id: 'price_pro_monthly_env' }, current_period_end: Math.floor((start.getTime() + 30 * DAY) / 1000) }] },
  };
  const decision = purchaseFromStripeEvent({ type: 'customer.subscription.deleted', data: { object: pro } }, env);
  assert.equal(decision.action, 'sync-pro');
  buyer.setStripe(pro);
  const at = new Date(start.getTime() + DAY);
  const response = await buyer.send(event('evt_pro_deleted', 'customer.subscription.deleted', pro, at), at);
  assert.equal(response.status, 200);
  assert.equal(response.body.entitled, false);
  assert.equal(response.body.state, 'locked');
  assert.equal((await buyer.store.findProBySubscriptionId('sub_pro'))?.status, 'inactive');
  assert.equal((await readSubscriptionForLicense(buyer.db, buyer.licenseId))?.subscriptionId, 'sub_pro');
  const cloud = await cloudAccessForLicense(buyer.db, buyer.licenseId, at);
  assert.equal(cloud.entitled, true, 'the Media Cloud add-on is its own subscription');
});

test('Cloud checkout links the subscription, and edition metadata finds Cloud when the price is not ours', () => {
  const media = purchaseFromStripeEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_media_cloud',
          object: 'checkout.session',
          mode: 'subscription',
          payment_status: 'paid',
          status: 'complete',
          subscription: 'sub_media_cloud',
          customer_details: { email: 'media@gym.test' },
          metadata: { product: 'advantage-media', cloud: '1' },
          amount_total: 1299,
          currency: 'usd',
        },
      },
    },
    env,
  );
  assert.equal(media.action, 'record-media');
  if (media.action === 'record-media') {
    assert.equal(media.cloud, true);
    assert.equal(media.subscriptionId, 'sub_media_cloud');
  }
  const coachUpdate = purchaseFromStripeEvent(
    {
      type: 'customer.subscription.updated',
      data: { object: subscription('sub_coach_meta', 'advantage-coach', 'price_not_ours', 'canceled') },
    },
    env,
  );
  assert.equal(coachUpdate.action, 'sync-cloud', 'metadata names the edition when the price does not');
  if (coachUpdate.action === 'sync-cloud') {
    assert.equal(coachUpdate.edition, 'coach');
    assert.equal(coachUpdate.entitled, false);
  }
});

test('the client stops offering Cloud after a lapse and shows the own-Drive or local prompt', () => {
  const pass = { src: 'stripe' as const, tier: 'media' as const, grants: expandGrants(['media']) };
  assert.equal(proPlusCloudDoorOpen({ ...pass, subs: { state: 'active', cloud: true } }), true);
  assert.equal(proPlusCloudDoorOpen({ ...pass, subs: undefined }), false);
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  };
  syncCloudLapse(storage, true, start.getTime());
  const lapse = start.getTime() + DAY;
  syncCloudLapse(storage, false, lapse);
  assert.deepEqual(readCloudLapse(storage, lapse + DAY), { phase: 'download', daysLeft: 59 });
  assert.deepEqual(cloudLapsePhase({ seenActive: true, lapsedAt: lapse, now: lapse + DAY, cloudActive: false }).phase, 'download');
  assert.equal(
    chooseGymHome({ plusCloudActive: false, cloudBound: true, cloudLapsed: true, driveConnected: false, oneDriveConnected: false }),
    'phone',
  );
  assert.equal(
    chooseGymHome({ plusCloudActive: false, cloudBound: true, cloudLapsed: true, driveConnected: true, oneDriveConnected: false }),
    'google-drive',
  );
});
