import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { memoryEntitlementStore, type EntitlementStore } from './entitlements.ts';
import { handleCheckout, handleWebhook } from './handlers.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { checkoutFormFields, priceEnvKeys, readStripeConfig, type StripeRuntimeEnv } from './stripeCheckout.ts';
import {
  capUpgradeCredit,
  computeUpgradeQuote,
  creditBeatsHalfOff,
  handleUpgradeQuote,
  MIN_UPGRADE_CHARGE_CENTS,
  rawUpgradeCredit,
  readUpgradeEmail,
  upgradeCouponFields,
  type PaidPurchase,
} from './upgradeCredit.ts';

/** Fake test values only. Nothing here talks to Stripe. */
const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_upgrade',
  STRIPE_WEBHOOK_SECRET: 'whsec_upgrade',
  STRIPE_PRICE_WHITE: 'price_white',
  STRIPE_PRICE_STUDENT: 'price_student',
  STRIPE_PRICE_MEDIA: 'price_media',
  STRIPE_PRICE_COACH: 'price_coach_old_2999',
  STRIPE_PRICE_INSTRUCTOR: 'price_instructor_4999',
  STRIPE_PRICE_PRO: 'price_pro_once',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
};

const LIST: Record<string, number> = {
  price_white: 999,
  price_student: 1999,
  price_media: 2999,
  price_coach_old_2999: 2999,
  price_instructor_4999: 4999,
  price_pro_once: 9999,
  price_pro_monthly: 599,
};

const NOW = new Date('2026-11-01T17:00:00.000Z');
const SITE = 'https://advantagebjjtimer.com/api/checkout';
const MEIA_ID = 'promo_1UUSYNARhGonKqrOgkxlh3wo';

type Calls = {
  prices: string[];
  coupons: URLSearchParams[];
  sessions: URLSearchParams[];
  promoLookups: string[];
};

function fakeStripe(options: { meia?: boolean; typedPromo?: string } = {}): { fetchImpl: typeof fetch; calls: Calls } {
  const calls: Calls = { prices: [], coupons: [], sessions: [], promoLookups: [] };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    assert.match(url, /^https:\/\/api\.stripe\.com\/v1\//);
    if (url.includes('/v1/prices/')) {
      assert.equal(method, 'GET');
      const id = decodeURIComponent(url.split('/v1/prices/')[1] ?? '');
      calls.prices.push(id);
      return new Response(JSON.stringify({ id, unit_amount: LIST[id], currency: 'usd', product: `prod_${id}` }), {
        status: 200,
      });
    }
    if (url.includes('/v1/promotion_codes')) {
      calls.promoLookups.push(url);
      if (/code=MEIA/.test(url)) {
        return new Response(
          JSON.stringify({ data: options.meia ? [{ id: MEIA_ID, code: 'MEIA', active: true }] : [] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: options.typedPromo ? [{ id: options.typedPromo, code: 'FRIEND', active: true }] : [],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/v1/coupons')) {
      assert.equal(method, 'POST');
      const fields = new URLSearchParams(String(init?.body ?? ''));
      calls.coupons.push(fields);
      return new Response(JSON.stringify({ id: `coupon_upgrade_${calls.coupons.length}` }), { status: 200 });
    }
    if (url.endsWith('/v1/checkout/sessions')) {
      const fields = new URLSearchParams(String(init?.body ?? ''));
      calls.sessions.push(fields);
      return new Response(JSON.stringify({ id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/cs_new' }), {
        status: 200,
      });
    }
    throw new Error(`unexpected Stripe call ${method} ${url}`);
  };
  return { fetchImpl, calls };
}

function signedWebhook(payload: string): Request {
  const timestamp = Math.floor(NOW.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '').update(`${timestamp}.${payload}`).digest('hex');
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

const META: Record<string, string> = {
  white: 'advantage-white',
  student: 'advantage-student',
  media: 'advantage-media',
  coach: 'advantage-coach',
  pro: 'advantage-pro',
};

/** Records a paid purchase through the real webhook path, so amount_total is what the store saw. */
async function buy(
  store: EntitlementStore,
  db: D1Database | null,
  tier: 'white' | 'student' | 'media' | 'coach' | 'pro',
  email: string,
  amountTotal: number,
  sessionId = `cs_${tier}_${amountTotal}`,
): Promise<void> {
  const payload = JSON.stringify({
    id: `evt_${sessionId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        mode: tier === 'pro' ? 'subscription' : 'payment',
        payment_status: 'paid',
        amount_total: amountTotal,
        currency: 'usd',
        ...(tier === 'pro' ? { subscription: `sub_${sessionId}` } : {}),
        customer_details: { email },
        metadata: { product: META[tier] },
      },
    },
  });
  const response = await handleWebhook(signedWebhook(payload), env, store, () => NOW, { db, pepper: 'test-pepper' });
  assert.equal(response.status, 200, `webhook for ${tier}`);
}

function checkoutRequest(body: Record<string, unknown>): Request {
  return new Request(SITE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function checkout(
  store: EntitlementStore,
  db: D1Database | null,
  body: Record<string, unknown>,
  stripe = fakeStripe(),
  runtimeEnv: StripeRuntimeEnv = env,
): Promise<{ status: number; body: Record<string, unknown>; calls: Calls }> {
  const response = await handleCheckout(checkoutRequest(body), runtimeEnv, stripe.fetchImpl, store, { db, now: () => NOW });
  return { status: response.status, body: (await response.json()) as Record<string, unknown>, calls: stripe.calls };
}

function amountDue(listCents: number, calls: Calls): number {
  const coupon = calls.coupons[0];
  return listCents - (coupon ? Number(coupon.get('amount_off')) : 0);
}

const LADDER: {
  name: string;
  owned: { tier: 'white' | 'student' | 'media' | 'coach'; paid: number }[];
  target: 'student' | 'media' | 'coach' | 'pro';
  list: number;
  dueCents: number;
}[] = [
  { name: 'White -> Student', owned: [{ tier: 'white', paid: 999 }], target: 'student', list: 1999, dueCents: 1000 },
  { name: 'Student -> Media', owned: [{ tier: 'student', paid: 1999 }], target: 'media', list: 2999, dueCents: 1000 },
  { name: 'Media -> Instructor', owned: [{ tier: 'media', paid: 2999 }], target: 'coach', list: 4999, dueCents: 2000 },
  { name: 'Instructor -> Pro', owned: [{ tier: 'coach', paid: 4999 }], target: 'pro', list: 9999, dueCents: 5000 },
  { name: 'White -> Pro', owned: [{ tier: 'white', paid: 999 }], target: 'pro', list: 9999, dueCents: 9000 },
  { name: 'half-off White ($4.99) -> Pro', owned: [{ tier: 'white', paid: 499 }], target: 'pro', list: 9999, dueCents: 9500 },
  {
    name: 'White + Student + Media -> Instructor uses the highest single payment, not the sum',
    owned: [
      { tier: 'white', paid: 999 },
      { tier: 'student', paid: 1999 },
      { tier: 'media', paid: 2999 },
    ],
    target: 'coach',
    list: 4999,
    dueCents: 2000,
  },
];

for (const row of LADDER) {
  test(`upgrade credit: ${row.name} costs $${(row.dueCents / 100).toFixed(2)}`, async () => {
    const store = memoryEntitlementStore();
    const db = sqliteD1();
    const email = 'climber@gym.test';
    for (const owned of row.owned) await buy(store, db, owned.tier, email, owned.paid);

    const result = await checkout(store, db, { product: row.target, email: 'Climber@Gym.test ' });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const { coupons, sessions, prices } = result.calls;
    assert.equal(coupons.length, 1);
    const coupon = coupons[0];
    assert.equal(coupon.get('duration'), 'once');
    assert.equal(coupon.get('max_redemptions'), '1');
    assert.equal(coupon.get('currency'), 'usd');
    assert.equal(coupon.get('percent_off'), null);
    assert.equal(coupon.get('metadata[kind]'), 'upgrade_credit');
    assert.equal(coupon.get('metadata[tier]'), row.target);
    assert.equal(Number(coupon.get('redeem_by')), Math.floor(NOW.getTime() / 1000) + 25 * 60 * 60);
    assert.equal(amountDue(row.list, result.calls), row.dueCents);

    // Only the one-time line's product is discounted; it is the first configured price.
    const oneTime = prices[0];
    assert.equal(LIST[oneTime], row.list);
    assert.equal(coupon.get('applies_to[products][0]'), `prod_${oneTime}`);
    assert.equal(coupon.get('applies_to[products][1]'), null);

    assert.equal(sessions.length, 1);
    const session = sessions[0];
    assert.equal(session.get('discounts[0][coupon]'), 'coupon_upgrade_1');
    assert.equal(session.get('discounts[0][promotion_code]'), null);
    assert.equal(session.get('allow_promotion_codes'), null);
    assert.equal(session.get('customer_email'), email);
    assert.equal(session.get('metadata[upgrade_coupon]'), 'coupon_upgrade_1');
    if (row.target === 'pro') {
      // $5.99/month line is unchanged: same price, not a product the coupon applies to.
      assert.equal(session.get('line_items[0][price]'), 'price_pro_once');
      assert.equal(session.get('line_items[1][price]'), 'price_pro_monthly');
      assert.notEqual(coupon.get('applies_to[products][0]'), 'prod_price_pro_monthly');
      assert.equal(session.get('mode'), 'subscription');
    }
  });
}

test('Instructor checkout charges STRIPE_PRICE_INSTRUCTOR ($49.99)', async () => {
  assert.deepEqual(priceEnvKeys(env, 'coach'), ['STRIPE_PRICE_INSTRUCTOR']);
  const config = readStripeConfig(env, 'coach');
  assert.ok(!('error' in config));
  assert.deepEqual(config.priceIds, ['price_instructor_4999']);
  const result = await checkout(memoryEntitlementStore(), null, { product: 'coach' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.calls.prices, ['price_instructor_4999'], 'one read-only GET to verify the amount');
  assert.equal(result.calls.sessions[0].get('line_items[0][price]'), 'price_instructor_4999');
  assert.equal(result.calls.sessions[0].get('metadata[product]'), 'advantage-coach');
});

test('Instructor fallback: STRIPE_PRICE_INSTRUCTOR unset never charges the old $29.99 price', async () => {
  const unset = { ...env, STRIPE_PRICE_INSTRUCTOR: undefined };
  const config = readStripeConfig(unset, 'coach');
  assert.ok('error' in config);
  assert.match(config.error, /STRIPE_PRICE_INSTRUCTOR/);
  const stripe = fakeStripe();
  const result = await checkout(memoryEntitlementStore(), null, { product: 'coach' }, stripe, unset);
  assert.equal(result.status, 503);
  assert.deepEqual(stripe.calls.sessions, []);
  assert.deepEqual(stripe.calls.prices, []);
});

test('Instructor guard: a STRIPE_PRICE_INSTRUCTOR that is not $49.99 opens no session', async () => {
  const wrong = { ...env, STRIPE_PRICE_INSTRUCTOR: 'price_coach_old_2999' };
  const stripe = fakeStripe();
  const result = await checkout(memoryEntitlementStore(), null, { product: 'coach' }, stripe, wrong);
  assert.equal(result.status, 503);
  assert.match(String(result.body.error), /not configured/);
  assert.deepEqual(stripe.calls.sessions, []);
  assert.deepEqual(stripe.calls.coupons, []);
});

test('Media checkout is a one-time hosted session that grants Media', async () => {
  const store = memoryEntitlementStore();
  const result = await checkout(store, null, { product: 'media' });
  assert.equal(result.status, 200);
  const session = result.calls.sessions[0];
  assert.equal(session.get('mode'), 'payment');
  assert.equal(session.get('line_items[0][price]'), 'price_media');
  assert.equal(session.get('line_items[1][price]'), null);
  assert.equal(session.get('metadata[product]'), 'advantage-media');
  assert.equal(session.get('allow_promotion_codes'), 'true');
  assert.equal(session.get('success_url'), 'https://advantagebjjtimer.com/buy/media?checkout=success&session_id={CHECKOUT_SESSION_ID}');
});

test('webhook records Media with amount_total and mirrors an active D1 grant', async () => {
  const store = memoryEntitlementStore();
  const db = sqliteD1();
  await buy(store, db, 'media', 'media@gym.test', 2999, 'cs_media_1');
  const saved = await store.findMediaByEmail('media@gym.test');
  assert.equal(saved?.sessionId, 'cs_media_1');
  assert.equal(saved?.amountTotal, 2999);
  assert.equal(saved?.currency, 'usd');
  assert.equal((await store.findMediaBySessionId('cs_media_1'))?.email, 'media@gym.test');
  const grant = await db
    .prepare(`SELECT product, status FROM grants WHERE source_ref = ?`)
    .bind('cs_media_1')
    .first<{ product: string; status: string }>();
  assert.equal(grant?.product, 'advantage-media');
  assert.equal(grant?.status, 'active');
});

test('old $29.99 and new $49.99 coach purchases both grant coach and keep what was paid', async () => {
  const store = memoryEntitlementStore();
  await buy(store, null, 'coach', 'old@gym.test', 2999, 'cs_coach_old');
  await buy(store, null, 'coach', 'new@gym.test', 4999, 'cs_coach_new');
  assert.equal((await store.findCoachByEmail('old@gym.test'))?.amountTotal, 2999);
  assert.equal((await store.findCoachByEmail('new@gym.test'))?.amountTotal, 4999);
  assert.equal((await store.findCoachBySessionId('cs_coach_old'))?.product, 'advantage-coach');
  assert.equal((await store.findCoachBySessionId('cs_coach_new'))?.product, 'advantage-coach');
});

test('a new buyer (no email or unknown email) sees no change and causes no extra Stripe call', async () => {
  for (const body of [{ product: 'pro' }, { product: 'pro', email: 'nobody@gym.test' }]) {
    const result = await checkout(memoryEntitlementStore(), sqliteD1(), body);
    assert.equal(result.status, 200);
    assert.equal(result.calls.prices.length, 0);
    assert.equal(result.calls.coupons.length, 0);
    const session = result.calls.sessions[0];
    assert.equal(session.get('allow_promotion_codes'), 'true');
    assert.equal(session.get('discounts[0][coupon]'), null);
    assert.equal(session.get('customer_email'), null);
  }
});

test('alpha or code access only (no Stripe purchase) pays full price and is not blocked', async () => {
  const store = memoryEntitlementStore();
  const db = sqliteD1();
  // A redeemed code writes a D1 grant with source 'code', never a store purchase with an amount.
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind('g_alpha', 'lic_alpha', 'advantage-coach', 'code', 'code_alpha', 'active', NOW.toISOString())
    .run()
    .catch(() => undefined);
  const result = await checkout(store, db, { product: 'coach', email: 'alpha@gym.test' });
  assert.equal(result.status, 200);
  assert.equal(result.calls.coupons.length, 0);
  assert.equal(result.calls.sessions[0].get('allow_promotion_codes'), 'true');
});

test('a $0 (100%-off code) purchase earns no credit', async () => {
  const store = memoryEntitlementStore();
  await buy(store, null, 'white', 'free@gym.test', 0);
  const result = await checkout(store, null, { product: 'student', email: 'free@gym.test' });
  assert.equal(result.status, 200);
  assert.equal(result.calls.coupons.length, 0);
  assert.equal(result.calls.sessions[0].get('allow_promotion_codes'), 'true');
});

test('already owning the tier (or a tier that includes it) blocks checkout with a clear message', async () => {
  const store = memoryEntitlementStore();
  await buy(store, null, 'coach', 'coach@gym.test', 4999);
  const same = await checkout(store, null, { product: 'coach', email: 'coach@gym.test' });
  assert.equal(same.status, 409);
  assert.equal(same.body.owned, true);
  assert.match(String(same.body.error), /already owns Instructor Edition/);
  assert.equal(same.calls.sessions.length, 0);
  assert.equal(same.calls.coupons.length, 0);

  await buy(store, null, 'pro', 'pro@gym.test', 10598);
  for (const tier of ['student', 'media', 'coach', 'pro']) {
    const blocked = await checkout(store, null, { product: tier, email: 'pro@gym.test' });
    assert.equal(blocked.status, 409, tier);
    assert.equal(blocked.calls.sessions.length, 0);
  }
});

test('a refunded purchase neither blocks nor earns credit', async () => {
  const store = memoryEntitlementStore();
  const db = sqliteD1();
  await buy(store, db, 'white', 'refund@gym.test', 999, 'cs_refunded');
  await db
    .prepare(`UPDATE grants SET status = 'inactive', revoked_at = ? WHERE source_ref = ?`)
    .bind(NOW.toISOString(), 'cs_refunded')
    .run();
  const result = await checkout(store, db, { product: 'student', email: 'refund@gym.test' });
  assert.equal(result.status, 200);
  assert.equal(result.calls.coupons.length, 0);
});

test('a typed promo code keeps its discount and skips the credit', async () => {
  const store = memoryEntitlementStore();
  await buy(store, null, 'white', 'promo@gym.test', 999);
  const stripe = fakeStripe({ typedPromo: 'promo_friend' });
  const result = await checkout(store, null, { product: 'student', email: 'promo@gym.test', promotionCode: 'FRIEND' }, stripe);
  assert.equal(result.status, 200);
  assert.equal(result.calls.coupons.length, 0);
  assert.equal(result.calls.sessions[0].get('discounts[0][promotion_code]'), 'promo_friend');
  assert.equal(result.calls.sessions[0].get('discounts[0][coupon]'), null);
});

test('MEIA half off stays unless the credit saves more', async () => {
  const store = memoryEntitlementStore();
  await buy(store, null, 'white', 'meia@gym.test', 999);
  // White $9.99 credit on Pro is less than half of $99.99: half off wins.
  const halfWins = await checkout(store, null, { product: 'pro', email: 'meia@gym.test', halfOff: true }, fakeStripe({ meia: true }));
  assert.equal(halfWins.status, 200);
  assert.equal(halfWins.calls.coupons.length, 0);
  assert.equal(halfWins.calls.sessions[0].get('discounts[0][promotion_code]'), MEIA_ID);

  // Instructor $49.99 on Pro is less than $49.99 (floor half of 9999 = 4999): not more, half off stays.
  await buy(store, null, 'coach', 'meia2@gym.test', 4999);
  const tie = await checkout(store, null, { product: 'pro', email: 'meia2@gym.test', halfOff: true }, fakeStripe({ meia: true }));
  assert.equal(tie.calls.coupons.length, 0);

  // Media $29.99 on Instructor $49.99 beats half ($24.99): credit wins.
  await buy(store, null, 'media', 'meia3@gym.test', 2999);
  const credit = await checkout(store, null, { product: 'coach', email: 'meia3@gym.test', halfOff: true }, fakeStripe({ meia: true }));
  assert.equal(credit.calls.coupons.length, 1);
  assert.equal(credit.calls.sessions[0].get('discounts[0][coupon]'), 'coupon_upgrade_1');
  assert.equal(credit.calls.sessions[0].get('discounts[0][promotion_code]'), null);
});

test('a bad email is rejected; a blank email is the normal checkout', async () => {
  const bad = await checkout(memoryEntitlementStore(), null, { product: 'student', email: 'not-an-email' });
  assert.equal(bad.status, 400);
  assert.equal(bad.calls.sessions.length, 0);
  const blank = await checkout(memoryEntitlementStore(), null, { product: 'student', email: '' });
  assert.equal(blank.status, 200);
  assert.equal(readUpgradeEmail(' A@B.co '), 'a@b.co');
  assert.equal(readUpgradeEmail(42), null);
});

test('credit math: max lower-tier payment, capped below the list price, USD only', () => {
  const p = (tier: PaidPurchase['tier'], amountPaid: number | null, extra: Partial<PaidPurchase> = {}): PaidPurchase => ({
    tier,
    sessionId: `cs_${tier}`,
    amountPaid,
    currency: 'usd',
    active: true,
    ...extra,
  });
  assert.equal(rawUpgradeCredit('pro', [p('white', 999), p('media', 2999)]), 2999);
  assert.equal(rawUpgradeCredit('student', [p('media', 2999)]), 0); // higher rank never credits a lower tier
  assert.equal(rawUpgradeCredit('coach', [p('media', 2999, { currency: 'eur' })]), 0);
  assert.equal(rawUpgradeCredit('coach', [p('media', 2999, { active: false })]), 0);
  assert.equal(rawUpgradeCredit('coach', [p('media', null)]), 0);
  assert.equal(capUpgradeCredit(5000, 4999), 4999 - MIN_UPGRADE_CHARGE_CENTS);
  assert.equal(capUpgradeCredit(-5, 4999), 0);
  const quote = computeUpgradeQuote('coach', 4999, [p('media', 2999)]);
  assert.equal(quote.owned, false);
  if (!quote.owned) assert.equal(quote.dueCents, 2000);
  assert.equal(creditBeatsHalfOff(2999, 4999), true);
  assert.equal(creditBeatsHalfOff(999, 9999), false);
});

test('coupon fields never set percent_off and expire after 25 hours', () => {
  const fields = upgradeCouponFields({ creditCents: 999, currency: 'usd', productId: 'prod_x', tier: 'pro', nowSeconds: 100 });
  assert.equal(fields.get('amount_off'), '999');
  assert.equal(fields.get('duration'), 'once');
  assert.equal(fields.get('max_redemptions'), '1');
  assert.equal(fields.get('redeem_by'), String(100 + 25 * 3600));
  assert.equal(fields.get('applies_to[products][0]'), 'prod_x');
  assert.equal(fields.get('percent_off'), null);
});

test('checkoutFormFields: a coupon replaces allow_promotion_codes and wins over a promo', () => {
  const base = {
    priceIds: ['price_pro_once', 'price_pro_monthly'],
    mode: 'subscription' as const,
    productId: 'advantage-pro',
    successUrl: 'https://x.test/s',
    cancelUrl: 'https://x.test/c',
  };
  const plain = checkoutFormFields(base);
  assert.equal(plain.get('allow_promotion_codes'), 'true');
  assert.equal(plain.get('discounts[0][coupon]'), null);
  const withCoupon = checkoutFormFields({ ...base, couponId: 'coupon_1', promotionCodeId: 'promo_x', customerEmail: 'a@b.co' });
  assert.equal(withCoupon.get('discounts[0][coupon]'), 'coupon_1');
  assert.equal(withCoupon.get('discounts[0][promotion_code]'), null);
  assert.equal(withCoupon.get('allow_promotion_codes'), null);
  assert.equal(withCoupon.get('customer_email'), 'a@b.co');
  assert.equal(withCoupon.get('line_items[1][price]'), 'price_pro_monthly');
});

test('/api/upgrade-quote returns only prices, or the owned message', async () => {
  const store = memoryEntitlementStore();
  await buy(store, null, 'student', 'quote@gym.test', 1999);
  const stripe = fakeStripe();
  const post = (body: unknown) =>
    handleUpgradeQuote(
      new Request('https://advantagebjjtimer.com/api/upgrade-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
        body: JSON.stringify(body),
      }),
      env,
      store,
      null,
      stripe.fetchImpl,
      null,
      () => NOW,
    );
  const media = await post({ tier: 'media', email: 'quote@gym.test' });
  assert.equal(media.status, 200);
  const body = (await media.json()) as Record<string, unknown>;
  assert.deepEqual(body, { ok: true, tier: 'media', listPriceCents: 2999, upgradePriceCents: 1000, creditApplied: 1999 });
  assert.equal(stripe.calls.coupons.length, 0); // a quote never creates a coupon

  const instructor = (await (await post({ tier: 'instructor', email: 'quote@gym.test' })).json()) as Record<string, unknown>;
  assert.equal(instructor.tier, 'coach');
  assert.equal(instructor.upgradePriceCents, 3000);

  const owned = (await (await post({ tier: 'student', email: 'quote@gym.test' })).json()) as Record<string, unknown>;
  assert.equal(owned.owned, true);
  assert.match(String(owned.message), /already owns/);

  const stranger = (await (await post({ tier: 'pro', email: 'new@gym.test' })).json()) as Record<string, unknown>;
  assert.equal(stranger.creditApplied, 0);
  assert.equal(stranger.upgradePriceCents, 9999);

  assert.equal((await post({ tier: 'white', email: 'quote@gym.test' })).status, 400);
  assert.equal((await post({ tier: 'pro', email: 'nope' })).status, 400);
});
