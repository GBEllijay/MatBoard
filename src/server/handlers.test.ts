import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { memoryEntitlementStore } from './entitlements.ts';
import { handleCheckout, handleEntitlement, handleWebhook } from './handlers.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_WHITE: 'price_white',
  STRIPE_PRICE_COACH: 'price_coach',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('checkout reports missing Stripe configuration', async () => {
  const response = await handleCheckout(jsonRequest('http://localhost/api/checkout', {}), {});
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /STRIPE_SECRET_KEY/);
});

test('checkout creates a session and can attach a promotion code', async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/v1/promotion_codes')) {
      return new Response(JSON.stringify({ data: [{ id: 'promo_499', code: 'WHITE499' }] }), { status: 200 });
    }
    const fields = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(fields.get('line_items[0][price]'), 'price_white');
    assert.equal(fields.get('discounts[0][promotion_code]'), 'promo_499');
    assert.equal(fields.get('allow_promotion_codes'), null);
    return new Response(
      JSON.stringify({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('http://localhost:5173/api/checkout', { promotionCode: 'WHITE499' }),
    env,
    fetchImpl,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url: string };
  assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
  assert.equal(calls.length, 2);
});

test('WHITEFREE records a $0 entitlement without Stripe', async () => {
  const store = memoryEntitlementStore();
  let calledStripe = false;
  const fetchImpl: typeof fetch = async () => {
    calledStripe = true;
    return new Response('stripe should not be called', { status: 500 });
  };
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { promotionCode: 'whitefree' }),
    {},
    fetchImpl,
    store,
  );
  assert.equal(response.status, 200);
  assert.equal(calledStripe, false);
  const body = (await response.json()) as { entitled: boolean; amountTotal: number; sessionId: string; email: string };
  assert.equal(body.entitled, true);
  assert.equal(body.amountTotal, 0);
  assert.equal(body.email, '');
  assert.match(body.sessionId, /^free_[a-z0-9]+$/);
  const saved = await store.findBySessionId(body.sessionId);
  assert.equal(saved?.amountTotal, 0);
  assert.equal(saved?.product, 'advantage-white');
  const lookup = await handleEntitlement(
    new Request(`http://localhost/api/entitlement?session_id=${body.sessionId}`),
    store,
  );
  assert.equal(lookup.status, 200);
  const status = (await lookup.json()) as { entitled: boolean; sessionId: string };
  assert.equal(status.entitled, true);
  assert.equal(status.sessionId, body.sessionId);
});

test('WHITEFREE without a store does not call Stripe', async () => {
  const response = await handleCheckout(jsonRequest('http://localhost/api/checkout', { promotionCode: 'WHITEFREE' }), {});
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /Entitlement store/);
});

test('omitted product still checks out Advantage White', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const fields = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(fields.get('mode'), 'payment');
    assert.equal(fields.get('line_items[0][price]'), 'price_white');
    assert.equal(fields.get('line_items[1][price]'), null);
    assert.equal(fields.get('metadata[product]'), 'advantage-white');
    assert.equal(fields.get('allow_promotion_codes'), 'true');
    return new Response(
      JSON.stringify({ id: 'cs_test_white', url: 'https://checkout.stripe.com/c/pay/cs_test_white' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', {}),
    env,
    fetchImpl,
  );
  assert.equal(response.status, 200);
});

test('Coach checkout is a one-time hosted session', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const fields = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(fields.get('mode'), 'payment');
    assert.equal(fields.get('line_items[0][price]'), 'price_coach');
    assert.equal(fields.get('line_items[1][price]'), null);
    assert.equal(fields.get('metadata[product]'), 'advantage-coach');
    assert.equal(fields.get('allow_promotion_codes'), 'true');
    assert.equal(
      fields.get('success_url'),
      'https://advantagebjjtimer.com/buy/coach?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    );
    assert.equal(fields.get('cancel_url'), 'https://advantagebjjtimer.com/buy/coach?checkout=cancel');
    return new Response(
      JSON.stringify({ id: 'cs_test_coach', url: 'https://checkout.stripe.com/c/pay/cs_test_coach' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'coach' }),
    {
      ...env,
      STRIPE_SUCCESS_URL: 'https://advantagebjjtimer.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      STRIPE_CANCEL_URL: 'https://advantagebjjtimer.com/buy?checkout=cancel',
    },
    fetchImpl,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url: string };
  assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_coach');
});

test('Pro checkout puts the one-time price and the monthly price in one session', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const fields = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(fields.get('mode'), 'subscription');
    assert.equal(fields.get('line_items[0][price]'), 'price_pro');
    assert.equal(fields.get('line_items[1][price]'), 'price_pro_monthly');
    assert.equal(fields.get('metadata[product]'), 'advantage-pro');
    assert.equal(fields.get('subscription_data[metadata][product]'), 'advantage-pro');
    assert.equal(fields.get('payment_intent_data[metadata][product]'), null);
    assert.equal(
      fields.get('success_url'),
      'https://advantagebjjtimer.com/buy/pro?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    );
    assert.equal(fields.get('cancel_url'), 'https://advantagebjjtimer.com/buy/pro?checkout=cancel');
    return new Response(
      JSON.stringify({ id: 'cs_test_pro', url: 'https://checkout.stripe.com/c/pay/cs_test_pro' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'Pro' }),
    env,
    fetchImpl,
  );
  assert.equal(response.status, 200);
});

test('Coach checkout names the missing Price id', async () => {
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'coach' }),
    { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_PRICE_WHITE: 'price_white' },
  );
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /STRIPE_PRICE_COACH/);
});

test('Pro checkout requires both Price ids', async () => {
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'pro' }),
    { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_PRICE_PRO: 'price_pro' },
  );
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /STRIPE_PRICE_PRO_MONTHLY/);
});

test('an unknown product does not open Checkout', async () => {
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'bundle' }),
    env,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /white, coach, or pro/);
});

test('WHITEFREE does not unlock Coach', async () => {
  const store = memoryEntitlementStore();
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { product: 'coach', promotionCode: 'WHITEFREE' }),
    env,
    async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    store,
  );
  assert.equal(response.status, 400);
  assert.equal(await store.findByEmail(''), null);
});

test('an unknown promo code does not open Checkout', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { promotionCode: 'NOPE' }),
    env,
    fetchImpl,
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /not active/);
});

test('webhook stores email and session id and entitlement lookup finds it', async () => {
  const store = memoryEntitlementStore();
  const now = new Date('2026-10-01T12:00:00.000Z');
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_abc',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 99,
        currency: 'usd',
        customer_details: { email: 'buyer@gym.test' },
        metadata: { product: 'advantage-white' },
      },
    },
  });
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '')
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  const response = await handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      body: payload,
    }),
    env,
    store,
    () => now,
  );
  assert.equal(response.status, 200);
  const saved = await store.findByEmail('buyer@gym.test');
  assert.equal(saved?.sessionId, 'cs_test_abc');
  assert.equal(saved?.amountTotal, 99);

  const lookup = await handleEntitlement(
    new Request('http://localhost/api/entitlement?session_id=cs_test_abc'),
    store,
  );
  assert.equal(lookup.status, 200);
  const body = (await lookup.json()) as { entitled: boolean; email: string };
  assert.equal(body.entitled, true);
  assert.equal(body.email, 'buyer@gym.test');
});

test('webhook rejects a bad signature and does not record a purchase', async () => {
  const store = memoryEntitlementStore();
  const response = await handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      body: '{}',
    }),
    env,
    store,
    () => new Date(1000),
  );
  assert.equal(response.status, 400);
  assert.equal(await store.findBySessionId('cs_test_abc'), null);
});

test('entitlement lookup without a store explains the missing binding', async () => {
  const response = await handleEntitlement(new Request('http://localhost/api/entitlement?email=a@b.co'), null);
  assert.equal(response.status, 503);
});
