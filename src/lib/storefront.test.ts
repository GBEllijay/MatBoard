import assert from 'node:assert/strict';
import test from 'node:test';
import { ALPHA_REQUEST_SUBJECT, alphaRequestMailto, SITE_FEEDBACK_EMAIL } from './siteFooter.ts';
import { STOREFRONT_BUY_PATH, STOREFRONT_COMING_SOON, STOREFRONT_PRICE_LABEL } from './storefront.ts';
import { WHITE_BUY_PATH, WHITE_FREE_CODE, WHITE_LAUNCH_PROMOS, WHITE_PRICE_LABEL } from './whitePurchase.ts';
import { FULL_OWNER_UNLOCK_CODE } from './proUnlock.ts';

test('storefront sells White once and sends Buy Now to the existing checkout', () => {
  assert.equal(STOREFRONT_PRICE_LABEL, '$9.99');
  assert.equal(STOREFRONT_PRICE_LABEL, WHITE_PRICE_LABEL);
  assert.equal(STOREFRONT_BUY_PATH, '/buy');
  assert.equal(STOREFRONT_BUY_PATH, WHITE_BUY_PATH);
});

test('coming soon stays Student, Coach, Pro and does not sell Coach or Pro', () => {
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.id),
    ['student', 'coach', 'pro'],
  );
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.title),
    ['Advantage – Student Edition', 'Advantage Coach', 'Advantage Pro'],
  );
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.to),
    ['/products', '/products', '/products'],
  );
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.forSale),
    [false, false, false],
  );
  assert.equal(STOREFRONT_COMING_SOON[0]?.price, '$19.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[1]?.price, '$29.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[2]?.price, '$99.99 one-time, plus $5.99/month');
  assert.match(STOREFRONT_COMING_SOON[0]?.teaser ?? '', /personal BJJ training journal/);
  assert.match(STOREFRONT_COMING_SOON[0]?.teaser ?? '', /rank and stripes/);
  assert.match(STOREFRONT_COMING_SOON[0]?.teaser ?? '', /fundamentals proficiency/);
  assert.match(STOREFRONT_COMING_SOON[0]?.teaser ?? '', /competitor prep/);
  assert.match(STOREFRONT_COMING_SOON[1]?.teaser ?? '', /lesson plans/);
  assert.match(STOREFRONT_COMING_SOON[1]?.teaser ?? '', /everything in Advantage White/);
  assert.match(STOREFRONT_COMING_SOON[2]?.teaser ?? '', /shared drive/);
  assert.match(STOREFRONT_COMING_SOON[2]?.teaser ?? '', /everything in Advantage Coach/);
  assert.equal(STOREFRONT_COMING_SOON[1]?.status, 'Not for sale yet');
  assert.equal(STOREFRONT_COMING_SOON[2]?.status, 'Not for sale yet');
  assert.equal(STOREFRONT_COMING_SOON.some((item) => item.forSale), false);
});

test('alpha requests keep the existing inbox and the prefilled subject', () => {
  assert.equal(ALPHA_REQUEST_SUBJECT, 'Advantage alpha testing request');
  assert.equal(SITE_FEEDBACK_EMAIL, 'advantageappllc@gmail.com');
  const href = alphaRequestMailto();
  assert.equal(href, `mailto:${SITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`);
  assert.doesNotMatch(href, new RegExp(WHITE_FREE_CODE, 'i'));
  assert.doesNotMatch(href, new RegExp(FULL_OWNER_UNLOCK_CODE, 'i'));
  for (const promo of WHITE_LAUNCH_PROMOS) {
    assert.doesNotMatch(href, new RegExp(promo.code, 'i'));
  }
});
