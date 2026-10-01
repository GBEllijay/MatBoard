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
    priceId: 'price_white',
    successUrl: 'https://advantagebjjtimer.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://advantagebjjtimer.com/buy?checkout=cancel',
  });
  assert.equal(fields.get('mode'), 'payment');
  assert.equal(fields.get('line_items[0][price]'), 'price_white');
  assert.equal(fields.get('line_items[0][quantity]'), '1');
  assert.equal(fields.get('metadata[product]'), 'advantage-white');
  assert.equal(fields.get('allow_promotion_codes'), 'true');
  assert.equal(fields.get('discounts[0][promotion_code]'), null);
  assert.match(fields.get('success_url') ?? '', /\{CHECKOUT_SESSION_ID\}/);
});

test('a known promotion code is attached and the Stripe promo box is not also enabled', () => {
  const fields = checkoutFormFields({
    priceId: 'price_white',
    successUrl: 'https://example.com/buy?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://example.com/buy?checkout=cancel',
    promotionCodeId: 'promo_499',
  });
  assert.equal(fields.get('discounts[0][promotion_code]'), 'promo_499');
  assert.equal(fields.get('allow_promotion_codes'), null);
});

test('default return URLs come back to the buy page', () => {
  const urls = checkoutReturnUrls('http://localhost:5173/api/checkout', {});
  assert.ok(!('error' in urls));
  if ('error' in urls) return;
  assert.equal(urls.cancelUrl, 'http://localhost:5173/buy?checkout=cancel');
  assert.match(urls.successUrl, /^http:\/\/localhost:5173\/buy\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
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
});
