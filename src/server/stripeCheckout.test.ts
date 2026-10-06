import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  checkoutFormFields,
  checkoutReturnUrls,
  isStripeCheckoutUrl,
  purchaseFromStripeEvent,
  verifyStripeSignature,
} from './stripeCheckout.ts';

const secret = 'whsec_test_secret';

function signed(payload: string, timestamp: number, key = secret): string {
  const hex = createHmac('sha256', key).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${hex}`;
}

test('checkout form uses the White price and allows a promo code field', () => {
  const fields = checkoutFormFields({
    priceIds: ['price_white'],
    mode: 'payment',
    productId: 'advantage-white',
    successUrl: 'https://advantagebjjtimer.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://advantagebjjtimer.com/buy?checkout=cancel',
  });
  assert.equal(fields.get('mode'), 'payment');
  assert.equal(fields.get('line_items[0][price]'), 'price_white');
  assert.equal(fields.get('line_items[0][quantity]'), '1');
  assert.equal(fields.get('metadata[product]'), 'advantage-white');
  assert.equal(fields.get('payment_intent_data[metadata][product]'), 'advantage-white');
  assert.equal(fields.get('allow_promotion_codes'), 'true');
  assert.equal(fields.get('discounts[0][promotion_code]'), null);
  assert.match(fields.get('success_url') ?? '', /\{CHECKOUT_SESSION_ID\}/);
});

test('a known promotion code is attached and the Stripe promo box is not also enabled', () => {
  const fields = checkoutFormFields({
    priceIds: ['price_white'],
    mode: 'payment',
    productId: 'advantage-white',
    successUrl: 'https://example.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://example.com/buy?checkout=cancel',
    promotionCodeId: 'promo_499',
  });
  assert.equal(fields.get('discounts[0][promotion_code]'), 'promo_499');
  assert.equal(fields.get('allow_promotion_codes'), null);
});

test('Pro checkout is one session with the one-time price and the monthly price', () => {
  const fields = checkoutFormFields({
    priceIds: ['price_pro', 'price_pro_monthly'],
    mode: 'subscription',
    productId: 'advantage-pro',
    successUrl: 'https://advantagebjjtimer.com/buy/pro?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://advantagebjjtimer.com/buy/pro?checkout=cancel',
  });
  assert.equal(fields.get('mode'), 'subscription');
  assert.equal(fields.get('line_items[0][price]'), 'price_pro');
  assert.equal(fields.get('line_items[0][quantity]'), '1');
  assert.equal(fields.get('line_items[1][price]'), 'price_pro_monthly');
  assert.equal(fields.get('line_items[1][quantity]'), '1');
  assert.equal(fields.get('metadata[product]'), 'advantage-pro');
  assert.equal(fields.get('subscription_data[metadata][product]'), 'advantage-pro');
  assert.equal(fields.get('payment_intent_data[metadata][product]'), null);
  assert.equal(fields.get('allow_promotion_codes'), 'true');
});

test('default return URLs come back to the buy page', () => {
  const urls = checkoutReturnUrls('http://localhost:5173/api/checkout', {});
  assert.ok(!('error' in urls));
  if ('error' in urls) return;
  assert.equal(urls.cancelUrl, 'http://localhost:5173/buy?checkout=cancel');
  assert.match(urls.successUrl, /^http:\/\/localhost:5173\/buy\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('Coach and Pro return to their buy paths on the request origin', () => {
  const coach = checkoutReturnUrls('https://advantagebjjtimer.com/api/checkout', {
    STRIPE_SUCCESS_URL: 'https://advantagebjjtimer.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    STRIPE_CANCEL_URL: 'https://advantagebjjtimer.com/buy?checkout=cancel',
  }, 'coach');
  const pro = checkoutReturnUrls('https://www.advantagebjjtimer.com/api/checkout', {}, 'pro');
  assert.ok(!('error' in coach) && !('error' in pro));
  if ('error' in coach || 'error' in pro) return;
  assert.equal(coach.cancelUrl, 'https://advantagebjjtimer.com/buy/coach?checkout=cancel');
  assert.equal(
    coach.successUrl,
    'https://advantagebjjtimer.com/buy/coach?checkout=success&session_id={CHECKOUT_SESSION_ID}',
  );
  assert.equal(pro.cancelUrl, 'https://www.advantagebjjtimer.com/buy/pro?checkout=cancel');
  assert.match(pro.successUrl, /\/buy\/pro\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('checkout URLs must be Stripe-hosted', () => {
  assert.equal(isStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'), true);
  assert.equal(isStripeCheckoutUrl('https://evil.example/checkout'), false);
  assert.equal(isStripeCheckoutUrl('http://checkout.stripe.com/c/pay/cs_test_123'), false);
});

test('webhook signature matches Stripe HMAC and rejects a stale or wrong secret', async () => {
  const payload = '{"id":"evt_1"}';
  const now = 1_700_000_000;
  assert.equal(await verifyStripeSignature(payload, signed(payload, now), secret, now), true);
  assert.equal(await verifyStripeSignature(payload, signed(payload, now, 'other'), secret, now), false);
  assert.equal(await verifyStripeSignature(payload, signed(payload, now - 301), secret, now), false);
  assert.equal(await verifyStripeSignature(payload, null, secret, now), false);
});

test('checkout.session.completed records the paid White email and session', () => {
  const parsed = purchaseFromStripeEvent({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 499,
        currency: 'usd',
        customer_details: { email: 'Gym@Example.com' },
        metadata: { product: 'advantage-white' },
      },
    },
  });
  assert.equal(parsed.action, 'record');
  if (parsed.action !== 'record') return;
  assert.equal(parsed.purchase.email, 'gym@example.com');
  assert.equal(parsed.purchase.sessionId, 'cs_test_123');
  assert.equal(parsed.purchase.amountTotal, 499);
});

test('a 100 percent off Checkout session still records White at $0', () => {
  const parsed = purchaseFromStripeEvent({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_free',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'no_payment_required',
        amount_total: 0,
        currency: 'usd',
        customer_details: { email: 'friend@gym.test' },
        metadata: { product: 'advantage-white' },
      },
    },
  });
  assert.equal(parsed.action, 'record');
  if (parsed.action !== 'record') return;
  assert.equal(parsed.purchase.amountTotal, 0);
  assert.equal(parsed.purchase.email, 'friend@gym.test');
});

test('other events and unpaid sessions are ignored', () => {
  assert.equal(purchaseFromStripeEvent({ type: 'payment_intent.succeeded', data: { object: {} } }).action, 'ignore');
  assert.equal(
    purchaseFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'unpaid',
          metadata: { product: 'advantage-white' },
        },
      },
    }).action,
    'ignore',
  );
  assert.equal(
    purchaseFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          metadata: { product: 'advantage-pro' },
        },
      },
    }).action,
    'ignore',
  );
  assert.equal(
    purchaseFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_coach',
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          metadata: { product: 'advantage-coach' },
        },
      },
    }).action,
    'ignore',
  );
  assert.equal(
    purchaseFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_pro',
          object: 'checkout.session',
          mode: 'subscription',
          payment_status: 'unpaid',
          subscription: 'sub_test_pro',
          metadata: { product: 'advantage-pro' },
        },
      },
    }).action,
    'ignore',
  );
});

test('a paid Pro Checkout session grants the subscription', () => {
  const parsed = purchaseFromStripeEvent({
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
        customer_details: { email: 'Owner@Gym.test' },
        metadata: { product: 'advantage-pro' },
      },
    },
  });
  assert.equal(parsed.action, 'grant-pro');
  if (parsed.action !== 'grant-pro') return;
  assert.equal(parsed.grant.email, 'owner@gym.test');
  assert.equal(parsed.grant.sessionId, 'cs_test_pro');
  assert.equal(parsed.grant.subscriptionId, 'sub_test_pro');
  assert.equal(parsed.grant.amountTotal, 10298);
});

test('a paid Pro Checkout session without a subscription id is retried', () => {
  assert.equal(
    purchaseFromStripeEvent({
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
    }).action,
    'retry',
  );
});

test('invoice.paid keeps a Pro subscription entitled', () => {
  const legacy = purchaseFromStripeEvent({
    type: 'invoice.paid',
    data: {
      object: {
        object: 'invoice',
        subscription: 'sub_test_pro',
        customer_email: 'owner@gym.test',
        amount_paid: 299,
        currency: 'usd',
        lines: { data: [{ metadata: { product: 'advantage-pro' } }] },
      },
    },
  });
  assert.equal(legacy.action, 'sync-pro');
  if (legacy.action !== 'sync-pro') return;
  assert.equal(legacy.sync.entitled, true);
  assert.equal(legacy.sync.productKnown, true);
  assert.equal(legacy.sync.subscriptionId, 'sub_test_pro');
  assert.equal(legacy.sync.amountTotal, 299);

  const basil = purchaseFromStripeEvent({
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        object: 'invoice',
        customer_email: 'owner@gym.test',
        amount_paid: 299,
        currency: 'usd',
        parent: {
          subscription_details: {
            subscription: 'sub_test_pro',
            metadata: { product: 'advantage-pro' },
          },
        },
      },
    },
  });
  assert.equal(basil.action, 'sync-pro');
  if (basil.action !== 'sync-pro') return;
  assert.equal(basil.sync.subscriptionId, 'sub_test_pro');
  assert.equal(basil.sync.productKnown, true);
});

test('subscription status updates grant, keep, or revoke Pro', () => {
  const active = purchaseFromStripeEvent({
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_test_pro',
        object: 'subscription',
        status: 'active',
        metadata: { product: 'advantage-pro' },
      },
    },
  });
  assert.equal(active.action, 'sync-pro');
  if (active.action === 'sync-pro') assert.equal(active.sync.entitled, true);

  const pastDue = purchaseFromStripeEvent({
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_test_pro',
        object: 'subscription',
        status: 'past_due',
        metadata: { product: 'advantage-pro' },
      },
    },
  });
  assert.equal(pastDue.action, 'sync-pro');
  if (pastDue.action === 'sync-pro') assert.equal(pastDue.sync.entitled, true);

  const canceled = purchaseFromStripeEvent({
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
  assert.equal(canceled.action, 'sync-pro');
  if (canceled.action === 'sync-pro') assert.equal(canceled.sync.entitled, false);

  assert.equal(
    purchaseFromStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_pro',
          object: 'subscription',
          status: 'incomplete',
          metadata: { product: 'advantage-pro' },
        },
      },
    }).action,
    'ignore',
  );
  assert.equal(
    purchaseFromStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_other',
          object: 'subscription',
          status: 'active',
          metadata: { product: 'advantage-white' },
        },
      },
    }).action,
    'ignore',
  );
  assert.equal(
    purchaseFromStripeEvent({
      type: 'invoice.paid',
      data: { object: { object: 'invoice', customer_email: 'owner@gym.test', amount_paid: 999 } },
    }).action,
    'ignore',
  );
});
