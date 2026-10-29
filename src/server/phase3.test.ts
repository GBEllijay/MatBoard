import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { memoryEntitlementStore } from './entitlements.ts';
import { handleWebhook } from './handlers.ts';
import { PRO_MONTHLY_PRICE_ID, matchesProPrice } from './proPrices.ts';
import { accessForSubscription, nextPastDueSince } from './subscriptionAccess.ts';
import { readSubscription } from './subscriptionSync.ts';
import { readCurrentPeriodEnd } from './stripeSubscription.ts';
import { sqliteD1 } from './sqliteD1.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_phase3',
  STRIPE_WEBHOOK_SECRET: 'whsec_phase3',
  STRIPE_PRICE_PRO: 'price_pro_once',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_env',
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: 'price_pro_299',
};

const DAY = 24 * 60 * 60 * 1000;
const failure = new Date('2026-10-01T00:00:00.000Z');

function signed(payload: string, now: Date): Request {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '').update(`${timestamp}.${payload}`).digest('hex');
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

function subscriptionBody(status: string, priceId: string, periodEnd: number, extra: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_pro',
    object: 'subscription',
    status,
    customer: 'cus_owner',
    cancel_at_period_end: false,
    metadata: {},
    items: {
      data: [{ price: { id: priceId }, current_period_end: periodEnd }],
    },
    ...extra,
  };
}

test('period end is read from the subscription or from its items', () => {
  assert.equal(readCurrentPeriodEnd({ current_period_end: 1_800_000_000 }), new Date(1_800_000_000 * 1000).toISOString());
  assert.equal(
    readCurrentPeriodEnd({
      items: { data: [{ current_period_end: 1_700_000_000 }, { current_period_end: 1_800_000_000 }] },
    }),
    new Date(1_800_000_000 * 1000).toISOString(),
  );
  assert.equal(readCurrentPeriodEnd({}), null);
});

test('Pro prices are a set: current monthly, legacy discount, and the one-time line', () => {
  assert.equal(matchesProPrice([PRO_MONTHLY_PRICE_ID], env), true);
  assert.equal(matchesProPrice(['price_pro_299'], env), true);
  assert.equal(matchesProPrice(['price_pro_once'], env), true);
  assert.equal(matchesProPrice(['price_pro_monthly_env'], env), true);
  assert.equal(matchesProPrice(['price_unrelated'], env), false);
});

test('grace lasts 7 days from the first failure and locks on day 8', () => {
  const row = {
    status: 'past_due',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    pastDueSince: failure.toISOString(),
  };
  assert.equal(accessForSubscription(row, failure).state, 'grace');
  assert.equal(accessForSubscription(row, new Date(failure.getTime() + 7 * DAY - 1)).state, 'grace');
  assert.equal(accessForSubscription(row, new Date(failure.getTime() + 7 * DAY)).state, 'locked');
  assert.equal(accessForSubscription(row, new Date(failure.getTime() + 8 * DAY)).entitled, false);
  for (const status of ['paused', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired']) {
    assert.equal(accessForSubscription({ ...row, status, pastDueSince: null }, failure).state, 'locked', status);
  }
  const periodEnd = new Date(failure.getTime() + 10 * DAY).toISOString();
  assert.equal(
    accessForSubscription(
      { status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd, pastDueSince: null },
      failure,
    ).state,
    'active',
  );
  assert.equal(
    accessForSubscription(
      { status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd, pastDueSince: null },
      new Date(failure.getTime() + 10 * DAY),
    ).state,
    'locked',
  );
  assert.equal(nextPastDueSince({ previous: failure.toISOString(), eventKind: 'failed', status: 'past_due', now: new Date(failure.getTime() + DAY) }), failure.toISOString());
  assert.equal(nextPastDueSince({ previous: null, eventKind: 'failed', status: 'past_due', now: failure }), failure.toISOString());
  assert.equal(nextPastDueSince({ previous: failure.toISOString(), eventKind: 'paid', status: 'active', now: failure }), null);
});

test('dunning timeline: first failure sticks, a retry does not move it, payment clears it', async () => {
  const db = sqliteD1();
  const store = memoryEntitlementStore();
  let stripe = subscriptionBody('past_due', PRO_MONTHLY_PRICE_ID, Math.floor(failure.getTime() / 1000) + 30 * 24 * 60 * 60);
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(stripe), { status: 200 });
  const fail = (id: string, when: Date) =>
    JSON.stringify({
      id,
      created: Math.floor(when.getTime() / 1000),
      type: 'invoice.payment_failed',
      data: {
        object: {
          object: 'invoice',
          subscription: 'sub_test_pro',
          customer_email: 'owner@gym.test',
          amount_due: 599,
          currency: 'usd',
        },
      },
    });

  const first = await handleWebhook(signed(fail('evt_fail_1', failure), failure), env, store, () => failure, {
    db,
    pepper: 'pepper',
    fetchImpl,
  });
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as { state: string; entitled: boolean; duplicate?: boolean };
  assert.equal(firstBody.state, 'grace');
  assert.equal(firstBody.entitled, true);
  const row = await readSubscription(db, 'sub_test_pro');
  assert.equal(row?.pastDueSince, failure.toISOString());
  assert.equal(row?.status, 'past_due');
  assert.equal(row?.priceId, PRO_MONTHLY_PRICE_ID);
  assert.ok(row?.currentPeriodEnd);

  const again = await handleWebhook(signed(fail('evt_fail_1', failure), failure), env, store, () => failure, {
    db,
    pepper: 'pepper',
    fetchImpl,
  });
  assert.equal(((await again.json()) as { duplicate?: boolean }).duplicate, true);

  const retryAt = new Date(failure.getTime() + 3 * DAY);
  const retry = await handleWebhook(signed(fail('evt_fail_2', retryAt), retryAt), env, store, () => retryAt, {
    db,
    pepper: 'pepper',
    fetchImpl,
  });
  assert.equal(((await retry.json()) as { state: string }).state, 'grace');
  assert.equal((await readSubscription(db, 'sub_test_pro'))?.pastDueSince, failure.toISOString());

  const day8 = new Date(failure.getTime() + 7 * DAY);
  const locked = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_day8',
        created: Math.floor(day8.getTime() / 1000),
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_test_pro', object: 'subscription', status: 'past_due' } },
      }),
      day8,
    ),
    env,
    store,
    () => day8,
    { db, pepper: 'pepper', fetchImpl },
  );
  const lockedBody = (await locked.json()) as { state: string; entitled: boolean };
  assert.equal(lockedBody.state, 'locked');
  assert.equal(lockedBody.entitled, false);
  assert.equal((await readSubscription(db, 'sub_test_pro'))?.pastDueSince, failure.toISOString());
  assert.equal((await store.findProBySubscriptionId('sub_test_pro'))?.status, 'inactive');

  stripe = subscriptionBody('active', 'price_pro_299', Math.floor(day8.getTime() / 1000) + 20 * DAY);
  const paidAt = new Date(failure.getTime() + 9 * DAY);
  const paid = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_paid',
        created: Math.floor(paidAt.getTime() / 1000),
        type: 'invoice.paid',
        data: { object: { object: 'invoice', subscription: 'sub_test_pro', amount_paid: 299, currency: 'usd' } },
      }),
      paidAt,
    ),
    env,
    store,
    () => paidAt,
    { db, pepper: 'pepper', fetchImpl },
  );
  const paidBody = (await paid.json()) as { state: string; entitled: boolean };
  assert.equal(paidBody.state, 'active');
  assert.equal(paidBody.entitled, true);
  assert.equal((await readSubscription(db, 'sub_test_pro'))?.pastDueSince, null);
  assert.equal((await readSubscription(db, 'sub_test_pro'))?.priceId, 'price_pro_299');
  assert.equal((await store.findProBySubscriptionId('sub_test_pro'))?.status, 'active');
});

test('a late invoice.paid after cancellation does not restore Pro', async () => {
  const db = sqliteD1();
  const store = memoryEntitlementStore();
  let stripe: Record<string, unknown> | null = subscriptionBody('active', 'price_pro_once', Math.floor(failure.getTime() / 1000) + 30 * DAY);
  const fetchImpl: typeof fetch = async () => {
    if (!stripe) return new Response('missing', { status: 404 });
    return new Response(JSON.stringify(stripe), { status: 200 });
  };
  const opened = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_open',
        created: Math.floor(failure.getTime() / 1000),
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_test_pro', object: 'subscription', status: 'active' } },
      }),
      failure,
    ),
    env,
    store,
    () => failure,
    { db, pepper: 'pepper', fetchImpl },
  );
  assert.equal(((await opened.json()) as { entitled: boolean }).entitled, true);

  stripe = null;
  const deletedAt = new Date(failure.getTime() + DAY);
  await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_deleted',
        created: Math.floor(deletedAt.getTime() / 1000),
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_test_pro', object: 'subscription', status: 'canceled' } },
      }),
      deletedAt,
    ),
    env,
    store,
    () => deletedAt,
    { db, pepper: 'pepper', fetchImpl },
  );
  const lateAt = new Date(failure.getTime() + 2 * DAY);
  const late = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_late_paid',
        created: Math.floor(lateAt.getTime() / 1000),
        type: 'invoice.paid',
        data: {
          object: {
            object: 'invoice',
            subscription: 'sub_test_pro',
            amount_paid: 599,
            currency: 'usd',
            lines: { data: [{ metadata: { product: 'advantage-pro' } }] },
          },
        },
      }),
      lateAt,
    ),
    env,
    store,
    () => lateAt,
    { db, pepper: 'pepper', fetchImpl },
  );
  const body = (await late.json()) as { entitled: boolean; state: string };
  assert.equal(body.entitled, false);
  assert.equal(body.state, 'locked');
  assert.equal((await store.findProBySubscriptionId('sub_test_pro'))?.status, 'inactive');
});

test('an unrelated subscription price is ignored and a stored subscriber is kept', async () => {
  const db = sqliteD1();
  const store = memoryEntitlementStore();
  const fetchImpl: typeof fetch = async (input) => {
    const id = String(input).split('/v1/subscriptions/')[1] ?? '';
    const price = id === 'sub_old' ? 'price_not_in_set' : 'price_other_product';
    return new Response(JSON.stringify(subscriptionBody('active', price, 1_900_000_000, { id })), { status: 200 });
  };
  const ignored = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_other',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_other', object: 'subscription', status: 'active' } },
      }),
      failure,
    ),
    env,
    store,
    () => failure,
    { db, pepper: 'pepper', fetchImpl },
  );
  assert.equal(((await ignored.json()) as { ignored?: boolean }).ignored, true);
  assert.equal(await readSubscription(db, 'sub_other'), null);

  const stamp = failure.toISOString();
  await db.exec(
    `INSERT INTO licenses (id, created_at) VALUES ('lic_old', '${stamp}');
     INSERT INTO subscriptions (stripe_subscription_id, license_id, status, price_id, cancel_at_period_end, last_event_at, last_synced_at)
     VALUES ('sub_old', 'lic_old', 'active', 'price_retired', 0, '${stamp}', '${stamp}')`,
  );
  const kept = await handleWebhook(
    signed(
      JSON.stringify({
        id: 'evt_old',
        created: Math.floor(failure.getTime() / 1000),
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_old', object: 'subscription', status: 'active' } },
      }),
      failure,
    ),
    env,
    store,
    () => failure,
    { db, pepper: 'pepper', fetchImpl },
  );
  const keptBody = (await kept.json()) as { entitled?: boolean; ignored?: boolean };
  assert.equal(keptBody.ignored, undefined);
  assert.equal(keptBody.entitled, true);
  assert.equal((await readSubscription(db, 'sub_old'))?.status, 'active');
});
