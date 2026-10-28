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
  STRIPE_PRICE_STUDENT: 'price_student',
  STRIPE_PRICE_COACH: 'price_coach',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: 'price_kept_monthly',
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

test('checkout does not grant a code locally', async () => {
  const store = memoryEntitlementStore();
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { promotionCode: 'not-a-stripe-code' }),
    {},
    async () => new Response('stripe should not be called', { status: 500 }),
    store,
  );
  assert.equal(response.status, 503);
  const body = (await response.json()) as { entitled?: boolean; error: string };
  assert.notEqual(body.entitled, true);
  assert.match(body.error, /STRIPE_SECRET_KEY/);
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
    assert.equal(fields.get('line_items[2][price]'), null);
    assert.doesNotMatch(fields.toString(), /price_kept_monthly/);
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
  assert.match(body.error, /white, student, coach, or pro/);
});

test('a code on Coach checkout is a Stripe promo lookup, not a local grant', async () => {
  const store = memoryEntitlementStore();
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { product: 'coach', promotionCode: 'not-a-stripe-code' }),
    env,
    async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    store,
  );
  assert.equal(response.status, 400);
  assert.equal(await store.findByEmail(''), null);
});

test('half off applies MEIA with discounts and does not also allow promotion codes', async () => {
  let session = '';
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/v1/promotion_codes')) {
      assert.match(url, /code=MEIA/);
      assert.doesNotMatch(url, /EVIL/);
      return new Response(
        JSON.stringify({ data: [{ id: 'promo_1UUSYNARhGonKqrOgkxlh3wo', code: 'MEIA', active: true }] }),
        { status: 200 },
      );
    }
    const fields = new URLSearchParams(String(init?.body ?? ''));
    session = fields.toString();
    assert.equal(fields.get('line_items[0][price]'), 'price_white');
    assert.equal(fields.get('discounts[0][promotion_code]'), 'promo_1UUSYNARhGonKqrOgkxlh3wo');
    assert.equal(fields.get('allow_promotion_codes'), null);
    assert.doesNotMatch(session, /EVIL/);
    return new Response(
      JSON.stringify({ id: 'cs_test_half', url: 'https://checkout.stripe.com/c/pay/cs_test_half' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { halfOff: true, promotionCode: 'EVIL' }),
    env,
    fetchImpl,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url: string };
  assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_half');
});

test('half off falls back to normal checkout when MEIA is inactive or the lookup fails', async () => {
  for (const mode of ['empty', 'error'] as const) {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/promotion_codes')) {
        assert.match(url, /code=MEIA/);
        if (mode === 'error') return new Response('nope', { status: 500 });
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      const fields = new URLSearchParams(String(init?.body ?? ''));
      assert.equal(fields.get('allow_promotion_codes'), 'true');
      assert.equal(fields.get('discounts[0][promotion_code]'), null);
      assert.doesNotMatch(fields.toString(), /promo_1UUSYNARhGonKqrOgkxlh3wo/);
      return new Response(
        JSON.stringify({ id: 'cs_test_plain', url: 'https://checkout.stripe.com/c/pay/cs_test_plain' }),
        { status: 200 },
      );
    };
    const response = await handleCheckout(
      jsonRequest('https://advantagebjjtimer.com/api/checkout', { halfOff: true }),
      env,
      fetchImpl,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { error?: string; url: string };
    assert.equal(body.error, undefined);
    assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_plain');
  }
});

test('a half-off string is not an allowlisted code', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const fields = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(fields.get('allow_promotion_codes'), 'true');
    assert.equal(fields.get('discounts[0][promotion_code]'), null);
    return new Response(
      JSON.stringify({ id: 'cs_test_plain', url: 'https://checkout.stripe.com/c/pay/cs_test_plain' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { halfOff: 'MEIA' }),
    env,
    fetchImpl,
  );
  assert.equal(response.status, 200);
});

test('half off discounts White, Student, Coach, and Pro without changing prices', async () => {
  const cases = [
    {
      product: 'student',
      price: 'price_student',
      mode: 'payment',
      meta: 'advantage-student',
    },
    {
      product: 'coach',
      price: 'price_coach',
      mode: 'payment',
      meta: 'advantage-coach',
    },
    {
      product: 'pro',
      price: 'price_pro',
      mode: 'subscription',
      meta: 'advantage-pro',
    },
  ] as const;
  for (const item of cases) {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/promotion_codes')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'promo_1UUSYNARhGonKqrOgkxlh3wo', code: 'MEIA', active: true }] }),
          { status: 200 },
        );
      }
      const fields = new URLSearchParams(String(init?.body ?? ''));
      assert.equal(fields.get('mode'), item.mode);
      assert.equal(fields.get('line_items[0][price]'), item.price);
      assert.equal(fields.get('metadata[product]'), item.meta);
      assert.equal(fields.get('discounts[0][promotion_code]'), 'promo_1UUSYNARhGonKqrOgkxlh3wo');
      assert.equal(fields.get('allow_promotion_codes'), null);
      assert.doesNotMatch(fields.toString(), /price_kept_monthly/);
      if (item.product === 'pro') {
        assert.equal(fields.get('line_items[1][price]'), 'price_pro_monthly');
        assert.equal(fields.get('subscription_data[metadata][product]'), 'advantage-pro');
        assert.equal(fields.get('payment_intent_data[metadata][product]'), null);
      }
      return new Response(
        JSON.stringify({ id: 'cs_test_half', url: 'https://checkout.stripe.com/c/pay/cs_test_half' }),
        { status: 200 },
      );
    };
    const response = await handleCheckout(
      jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: item.product, halfOff: true }),
      env,
      fetchImpl,
    );
    assert.equal(response.status, 200);
  }
});

test('half off does not grant a typed code locally', async () => {
  const store = memoryEntitlementStore();
  let calledStripe = false;
  const fetchImpl: typeof fetch = async () => {
    calledStripe = true;
    return new Response('stripe down', { status: 500 });
  };
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { halfOff: true, promotionCode: 'not-a-stripe-code' }),
    env,
    fetchImpl,
    store,
  );
  assert.equal(calledStripe, true);
  const body = (await response.json()) as { entitled?: boolean };
  assert.notEqual(body.entitled, true);
  assert.notEqual(response.status, 200);
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

  const bySession = await store.findBySessionId('cs_test_abc');
  assert.equal(bySession?.email, 'buyer@gym.test');
  const lookup = await handleEntitlement(new Request('http://localhost/api/entitlement?email=buyer@gym.test'), store);
  assert.equal(lookup.status, 200);
  const body = (await lookup.json()) as { entitled?: boolean; email?: string; message: string };
  assert.equal(body.entitled, undefined);
  assert.equal(body.email, undefined);
  assert.match(body.message, /does not say/);
});

function signedWebhook(payload: string, now: Date): Request {
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '')
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

test('Pro checkout webhook unlocks Pro and a renewal stays entitled', async () => {
  const store = memoryEntitlementStore();
  const now = new Date('2026-10-01T12:00:00.000Z');
  const checkout = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_pro',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        amount_total: 10298,
        currency: 'usd',
        subscription: 'sub_test_pro',
        customer_details: { email: 'owner@gym.test' },
        metadata: { product: 'advantage-pro' },
      },
    },
  });
  const granted = await handleWebhook(signedWebhook(checkout, now), env, store, () => now);
  assert.equal(granted.status, 200);
  const status = await store.findProBySessionId('cs_test_pro');
  assert.equal(status?.status, 'active');
  assert.equal(status?.product, 'advantage-pro');
  assert.equal(status?.email, 'owner@gym.test');
  assert.equal(await store.findByEmail('owner@gym.test'), null);

  const renewal = JSON.stringify({
    type: 'invoice.paid',
    data: {
      object: {
        object: 'invoice',
        subscription: 'sub_test_pro',
        customer_email: 'owner@gym.test',
        amount_paid: 299,
        currency: 'usd',
      },
    },
  });
  const renewedAt = new Date('2026-11-01T12:00:00.000Z');
  const renewed = await handleWebhook(signedWebhook(renewal, renewedAt), env, store, () => renewedAt);
  assert.equal(renewed.status, 200);
  const still = await store.findProBySubscriptionId('sub_test_pro');
  assert.equal(still?.status, 'active');
  assert.equal(still?.sessionId, 'cs_test_pro');
  assert.equal(still?.amountTotal, 10298);

  const ended = JSON.stringify({
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_test_pro',
        object: 'subscription',
        status: 'canceled',
        metadata: { product: 'advantage-pro' },
      },
    },
  });
  const endedAt = new Date('2026-12-01T12:00:00.000Z');
  const revoked = await handleWebhook(signedWebhook(ended, endedAt), env, store, () => endedAt);
  assert.equal(revoked.status, 200);
  assert.equal((await store.findProBySessionId('cs_test_pro'))?.status, 'inactive');
});

test('an unknown subscription invoice does not create a Pro entitlement', async () => {
  const store = memoryEntitlementStore();
  const now = new Date('2026-10-01T12:00:00.000Z');
  const payload = JSON.stringify({
    type: 'invoice.paid',
    data: {
      object: {
        object: 'invoice',
        subscription: 'sub_unknown',
        customer_email: 'owner@gym.test',
        amount_paid: 299,
        currency: 'usd',
      },
    },
  });
  const response = await handleWebhook(signedWebhook(payload, now), env, store, () => now);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ignored: boolean };
  assert.equal(body.ignored, true);
  assert.equal(await store.findProByEmail('owner@gym.test'), null);
});

test('a paid Pro Checkout session without a subscription id is retried', async () => {
  const store = memoryEntitlementStore();
  const now = new Date('2026-10-01T12:00:00.000Z');
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_pro',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        metadata: { product: 'advantage-pro' },
      },
    },
  });
  const response = await handleWebhook(signedWebhook(payload, now), env, store, () => now);
  assert.equal(response.status, 500);
  assert.equal(await store.findProBySessionId('cs_test_pro'), null);
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

test('entitlement lookup does not require a store and does not reveal a purchase', async () => {
  const response = await handleEntitlement(new Request('http://localhost/api/entitlement?email=a@b.co'), null);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { entitled?: boolean; message: string };
  assert.equal(body.entitled, undefined);
  assert.match(body.message, /does not say/);
});

test('Student checkout is a one-time hosted session', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const fields = new URLSearchParams(String(init?.body ?? ''));
    assert.equal(fields.get('mode'), 'payment');
    assert.equal(fields.get('line_items[0][price]'), 'price_student');
    assert.equal(fields.get('line_items[1][price]'), null);
    assert.equal(fields.get('metadata[product]'), 'advantage-student');
    assert.equal(fields.get('payment_intent_data[metadata][product]'), 'advantage-student');
    assert.equal(fields.get('allow_promotion_codes'), 'true');
    assert.equal(
      fields.get('success_url'),
      'https://advantagebjjtimer.com/buy/student?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    );
    assert.equal(fields.get('cancel_url'), 'https://advantagebjjtimer.com/buy/student?checkout=cancel');
    return new Response(
      JSON.stringify({ id: 'cs_test_student', url: 'https://checkout.stripe.com/c/pay/cs_test_student' }),
      { status: 200 },
    );
  };
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'Student' }),
    {
      ...env,
      STRIPE_SUCCESS_URL: 'https://advantagebjjtimer.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      STRIPE_CANCEL_URL: 'https://advantagebjjtimer.com/buy?checkout=cancel',
    },
    fetchImpl,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url: string };
  assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_student');
});

test('Student checkout names the missing Price id', async () => {
  const response = await handleCheckout(
    jsonRequest('https://advantagebjjtimer.com/api/checkout', { product: 'student' }),
    { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_PRICE_WHITE: 'price_white' },
  );
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /STRIPE_PRICE_STUDENT/);
});

test('a code on Student checkout is a Stripe promo lookup, not a local grant', async () => {
  const store = memoryEntitlementStore();
  const response = await handleCheckout(
    jsonRequest('http://localhost/api/checkout', { product: 'student', promotionCode: 'not-a-stripe-code' }),
    env,
    async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    store,
  );
  assert.equal(response.status, 400);
  assert.equal(await store.findStudentByEmail(''), null);
  assert.equal(await store.findByEmail(''), null);
});

test('Student checkout webhook unlocks Student Edition and leaves White and Pro alone', async () => {
  const store = memoryEntitlementStore();
  const now = new Date('2026-10-12T12:00:00.000Z');
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_student',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 1999,
        currency: 'usd',
        customer_details: { email: 'student@gym.test' },
        metadata: { product: 'advantage-student' },
      },
    },
  });
  const response = await handleWebhook(signedWebhook(payload, now), env, store, () => now);
  assert.equal(response.status, 200);
  const saved = await store.findStudentByEmail('Student@Gym.test');
  assert.equal(saved?.sessionId, 'cs_test_student');
  assert.equal(saved?.product, 'advantage-student');
  assert.equal(saved?.amountTotal, 1999);
  assert.equal(await store.findByEmail('student@gym.test'), null);
  assert.equal(await store.findProByEmail('student@gym.test'), null);

  const status = await store.findStudentBySessionId('cs_test_student');
  assert.equal(status?.product, 'advantage-student');
  assert.equal(status?.email, 'student@gym.test');
  const hidden = await handleEntitlement(
    new Request('http://localhost/api/entitlement?email=student@gym.test&product=student'),
    store,
  );
  const hiddenBody = (await hidden.json()) as { entitled?: boolean; product?: string; email?: string };
  assert.equal(hiddenBody.entitled, undefined);
  assert.equal(hiddenBody.product, undefined);
  assert.equal(hiddenBody.email, undefined);
});
