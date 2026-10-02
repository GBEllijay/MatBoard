import assert from 'node:assert/strict';
import test from 'node:test';
import { API_CHECKOUT_PATH, API_ENTITLEMENT_PATH, API_FREE_CODE, API_PRODUCT_ID } from '../server/routes.ts';
import {
  WHITE_CHECKOUT_API,
  WHITE_ENTITLEMENT_API,
  WHITE_FEATURES,
  WHITE_FREE_CODE,
  WHITE_INCLUDED,
  WHITE_LAUNCH_PROMOS,
  WHITE_LIST_PRICE_CENTS,
  WHITE_PRICE_LABEL,
  WHITE_PRODUCT_ID,
  WHITE_UPGRADE_NOTE,
  formatUsdFromCents,
  isWhiteFreeCode,
  priceAfterAmountOff,
} from './whitePurchase.ts';

test('Advantage White list price is $9.99', () => {
  assert.equal(WHITE_LIST_PRICE_CENTS, 999);
  assert.equal(formatUsdFromCents(WHITE_LIST_PRICE_CENTS), WHITE_PRICE_LABEL);
  assert.equal(formatUsdFromCents(WHITE_LIST_PRICE_CENTS), '$9.99');
});

test('launch promos land on $4.99 and $0.99', () => {
  const byCode = Object.fromEntries(WHITE_LAUNCH_PROMOS.map((promo) => [promo.code, promo]));
  assert.equal(priceAfterAmountOff(WHITE_LIST_PRICE_CENTS, byCode.WHITE499.amountOffCents), 499);
  assert.equal(priceAfterAmountOff(WHITE_LIST_PRICE_CENTS, byCode.WHITE099.amountOffCents), 99);
  assert.equal(formatUsdFromCents(499), byCode.WHITE499.label);
  assert.equal(formatUsdFromCents(99), byCode.WHITE099.label);
  assert.equal(byCode.WHITE499.couponId, 'advantage_white_499');
  assert.equal(byCode.WHITE099.couponId, 'advantage_white_099');
});

test('buy page lists included tools, browser install, and the Coach and Pro footer', () => {
  assert.deepEqual(WHITE_INCLUDED, [
    'Tournament Style BJJ Scoreboard',
    'Fully Customizable Round Timer',
  ]);
  assert.equal(
    WHITE_FEATURES[0],
    'Installs on Phone or Desktop from your browser — Add to Home Screen / Install.',
  );
  assert.match(WHITE_FEATURES[1], /TV or monitor/);
  assert.match(WHITE_FEATURES[2], /music app/);
  assert.equal(
    WHITE_UPGRADE_NOTE,
    "Advantage Coach and Advantage Pro are separate products. This purchase is White only; you can add Coach or Pro later when they're for sale.",
  );
});

test('WHITEFREE is the in-app $0 unlock and matches the server', () => {
  assert.equal(WHITE_FREE_CODE, 'WHITEFREE');
  assert.equal(WHITE_FREE_CODE, API_FREE_CODE);
  assert.equal(isWhiteFreeCode(' whitefree '), true);
  assert.equal(isWhiteFreeCode('WHITE499'), false);
  assert.equal(isWhiteFreeCode(''), false);
});

test('client and server agree on product id and API paths', () => {
  assert.equal(WHITE_PRODUCT_ID, API_PRODUCT_ID);
  assert.equal(WHITE_CHECKOUT_API, API_CHECKOUT_PATH);
  assert.equal(WHITE_ENTITLEMENT_API, API_ENTITLEMENT_PATH);
});
