import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { memoryEntitlementStore } from './entitlements.ts';
import { handleWebhook } from './handlers.ts';
import { cloudEditionForPriceIds, matchesProPrice, proPriceIds } from './proPrices.ts';
import {
  checkoutFormFields,
  purchaseFromStripeEvent,
  readCloudAddonCart,
  readCloudMonthlyPrice,
  readOptionalCloudMonthlyDiscountPrice,
  readOptionalProMonthlyDiscountPrice,
  type StripeRuntimeEnv,
} from './stripeCheckout.ts';

const env: StripeRuntimeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_cloud',
  STRIPE_WEBHOOK_SECRET: 'whsec_cloud',
  STRIPE_PRICE_INSTRUCTOR: 'price_instructor_once',
  STRIPE_PRICE_MEDIA: 'price_media_once',
  STRIPE_PRICE_PRO: 'price_pro_once',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: 'price_pro_discount',
  STRIPE_PRICE_INSTRUCTOR_CLOUD_MONTHLY: 'price_instructor_cloud',
  STRIPE_PRICE_INSTRUCTOR_CLOUD_MONTHLY_DISCOUNT: 'price_instructor_cloud_discount',
  STRIPE_PRICE_MEDIA_CLOUD_MONTHLY: 'price_media_cloud',
  STRIPE_PRICE_MEDIA_CLOUD_MONTHLY_DISCOUNT: 'price_media_cloud_discount',
};

test('Cloud checkout picks the monthly price for that edition', () => {
  assert.equal(readCloudMonthlyPrice(env, 'coach'), 'price_instructor_cloud');
  assert.equal(readCloudMonthlyPrice(env, 'media'), 'price_media_cloud');
  assert.equal(readCloudMonthlyPrice(env, 'pro'), 'price_pro_monthly');
  const coach = readCloudAddonCart(env, 'coach');
  const media = readCloudAddonCart(env, 'media');
  const pro = readCloudAddonCart(env, 'pro');
  assert.ok(!('error' in coach) && !('error' in media) && !('error' in pro));
  if ('error' in coach || 'error' in media || 'error' in pro) return;
  assert.deepEqual(coach.priceIds, ['price_instructor_once', 'price_instructor_cloud']);
  assert.deepEqual(media.priceIds, ['price_media_once', 'price_media_cloud']);
  assert.deepEqual(pro.priceIds, ['price_pro_once', 'price_pro_monthly']);
  assert.equal(coach.mode, 'subscription');
  assert.equal(pro.productId, 'advantage-pro');
});

test('an empty or non-price Instructor Cloud var falls back to STRIPE_PRICE_PRO_MONTHLY; Media never does', () => {
  const blank = { ...env, STRIPE_PRICE_INSTRUCTOR_CLOUD_MONTHLY: '  ', STRIPE_PRICE_MEDIA_CLOUD_MONTHLY: 'not-a-price' };
  assert.equal(readCloudMonthlyPrice(blank, 'coach'), 'price_pro_monthly');
  // Media Cloud is $2.99. Falling back to the $5.99 Pro price would overcharge.
  assert.equal(readCloudMonthlyPrice(blank, 'media'), null);
  assert.ok('error' in readCloudAddonCart(blank, 'media'));
  const cart = readCloudAddonCart(blank, 'coach');
  assert.ok(!('error' in cart));
  if ('error' in cart) return;
  assert.equal(cart.priceIds[1], 'price_pro_monthly');
  const missing = readCloudAddonCart({ ...blank, STRIPE_PRICE_PRO_MONTHLY: '' }, 'media');
  assert.ok('error' in missing);
});

test('the half-off Cloud price helper is per edition and Checkout does not send it', () => {
  assert.equal(readOptionalCloudMonthlyDiscountPrice(env, 'coach'), 'price_instructor_cloud_discount');
  assert.equal(readOptionalCloudMonthlyDiscountPrice(env, 'media'), 'price_media_cloud_discount');
  assert.equal(readOptionalCloudMonthlyDiscountPrice(env, 'pro'), 'price_pro_discount');
  assert.equal(readOptionalProMonthlyDiscountPrice(env), 'price_pro_discount');
  assert.equal(readOptionalCloudMonthlyDiscountPrice({ ...env, STRIPE_PRICE_MEDIA_CLOUD_MONTHLY_DISCOUNT: 'nope' }, 'media'), null);
  const fields = checkoutFormFields({
    priceIds: ['price_instructor_once', 'price_instructor_cloud'],
    mode: 'subscription',
    productId: 'advantage-coach',
    successUrl: 'https://advantagebjjtimer.com/buy/coach?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://advantagebjjtimer.com/buy/coach?checkout=cancel',
    cloud: true,
  });
  assert.equal(fields.get('line_items[1][price]'), 'price_instructor_cloud');
  assert.doesNotMatch(fields.toString(), /price_instructor_cloud_discount|price_media_cloud_discount|price_pro_discount/);
});

test('Instructor and Media Cloud prices are not Pro prices', () => {
  const ids = proPriceIds(env);
  assert.equal(ids.has('price_pro_monthly'), true);
  assert.equal(ids.has('price_pro_discount'), true);
  assert.equal(ids.has('price_instructor_cloud'), false);
  assert.equal(ids.has('price_instructor_cloud_discount'), false);
  assert.equal(ids.has('price_media_cloud'), false);
  assert.equal(ids.has('price_media_cloud_discount'), false);
  assert.equal(matchesProPrice(['price_instructor_cloud'], env), false);
  assert.equal(matchesProPrice(['price_media_cloud_discount'], env), false);
  assert.equal(matchesProPrice(['price_pro_monthly'], env), true);
  assert.equal(cloudEditionForPriceIds(['price_instructor_cloud'], env), 'coach');
  assert.equal(cloudEditionForPriceIds(['price_instructor_cloud_discount'], env), 'coach');
  assert.equal(cloudEditionForPriceIds(['price_media_cloud'], env), 'media');
  assert.equal(cloudEditionForPriceIds(['price_pro_monthly'], env), null);
});

test('an Instructor Cloud subscription does not grant Pro, and the Pro monthly path is unchanged', () => {
  const instructor = purchaseFromStripeEvent(
    {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_instructor_cloud',
          object: 'subscription',
          status: 'active',
          metadata: { product: 'advantage-coach' },
          items: { data: [{ price: 'price_instructor_cloud' }] },
        },
      },
    },
    env,
  );
  assert.equal(instructor.action, 'sync-cloud');
  if (instructor.action !== 'sync-cloud') return;
  assert.equal(instructor.edition, 'coach');
  assert.equal(instructor.entitled, true);

  const pro = purchaseFromStripeEvent(
    {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_pro',
          object: 'subscription',
          status: 'active',
          metadata: { product: 'advantage-pro' },
          items: { data: [{ price: 'price_pro_monthly' }] },
        },
      },
    },
    env,
  );
  assert.equal(pro.action, 'sync-pro');
});

test('the Instructor Cloud webhook records Cloud and does not save a Pro entitlement', async () => {
  const store = memoryEntitlementStore();
  const payload = JSON.stringify({
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_instructor_cloud',
        object: 'subscription',
        status: 'active',
        metadata: { product: 'advantage-coach' },
        items: { data: [{ price: 'price_instructor_cloud' }] },
      },
    },
  });
  const now = new Date('2026-11-04T12:00:00.000Z');
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET ?? '').update(`${timestamp}.${payload}`).digest('hex');
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
  const body = (await response.json()) as { cloud?: boolean; edition?: string; pro?: boolean };
  assert.equal(body.cloud, true);
  assert.equal(body.edition, 'coach');
  assert.equal(body.pro, false);
  assert.equal(await store.findProBySubscriptionId('sub_instructor_cloud'), null);
});
