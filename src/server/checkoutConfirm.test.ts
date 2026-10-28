import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCheckoutConfirm } from './checkoutConfirm.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';

const env = { STRIPE_SECRET_KEY: 'sk_test_123' };

function post(sessionId: string): Request {
  return new Request('http://localhost/api/checkout-confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.40' },
    body: JSON.stringify({ sessionId }),
  });
}

test('checkout confirm grants only a paid Stripe session and hides the email', async () => {
  resetRateLimitsForTests();
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'cs_test_paid',
        payment_status: 'paid',
        status: 'complete',
        metadata: { product: 'advantage-pro' },
        customer_details: { email: 'buyer@gym.test' },
      }),
      { status: 200 },
    );
  const yes = await handleCheckoutConfirm(post('cs_test_paid'), env, fetchImpl);
  assert.equal(yes.status, 200);
  const body = (await yes.json()) as { entitled: boolean; grants: string[]; email?: string; product: string };
  assert.equal(body.entitled, true);
  assert.equal(body.product, 'advantage-pro');
  assert.deepEqual(body.grants, ['pro', 'student']);
  assert.equal(body.email, undefined);
  assert.equal(JSON.stringify(body).includes('buyer@gym.test'), false);
  assert.equal(JSON.stringify(body).includes('cs_test_paid'), false);

  const missing: typeof fetch = async () => new Response('{}', { status: 404 });
  const no = await handleCheckoutConfirm(post('cs_test_missing'), env, missing);
  const unpaid: typeof fetch = async () =>
    new Response(JSON.stringify({ id: 'cs_test_unpaid', payment_status: 'unpaid', metadata: { product: 'advantage-white' } }), {
      status: 200,
    });
  const held = await handleCheckoutConfirm(post('cs_test_unpaid'), env, unpaid);
  assert.equal(no.status, 400);
  assert.equal(held.status, 400);
  assert.deepEqual(await no.json(), await held.json());
});

test('confirm does nothing when Stripe is not configured', async () => {
  resetRateLimitsForTests();
  const response = await handleCheckoutConfirm(post('cs_test_paid'), {}, async () => new Response('no', { status: 500 }));
  assert.equal(response.status, 503);
  const body = (await response.json()) as { entitled: boolean; error: string };
  assert.equal(body.entitled, false);
  assert.match(body.error, /STRIPE_SECRET_KEY/);
});
