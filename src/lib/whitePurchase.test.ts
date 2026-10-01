import assert from 'node:assert/strict';
import test from 'node:test';
import { API_CHECKOUT_PATH, API_ENTITLEMENT_PATH, API_PRODUCT_ID } from '../server/routes.ts';
import {
  WHITE_CHECKOUT_API,
  WHITE_ENTITLEMENT_API,
  WHITE_INCLUDED,
  WHITE_LAUNCH_PROMOS,
  WHITE_LIST_PRICE_CENTS,
  WHITE_NOT_INCLUDED,
  WHITE_PRICE_LABEL,
  WHITE_PRODUCT_ID,
  WHITE_UPGRADE_NOTE,
  formatUsdFromCents,
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

test('buy page copy names White inclusions and leaves Coach and Pro out', () => {
  assert.ok(WHITE_INCLUDED.includes('Round Timer with Advantage branding'));
  assert.ok(WHITE_INCLUDED.includes('Basic Match Scoreboard'));
  assert.ok(WHITE_INCLUDED.includes('Cast / TV'));
  assert.ok(WHITE_NOT_INCLUDED.some((line) => line.includes('Old School')));
  assert.ok(WHITE_NOT_INCLUDED.includes('Master Carlos'));
  assert.ok(WHITE_NOT_INCLUDED.includes('Advantage Coach'));
  assert.ok(WHITE_NOT_INCLUDED.includes('Advantage Pro'));
  assert.match(WHITE_UPGRADE_NOTE, /White only/);
  assert.match(WHITE_UPGRADE_NOTE, /Coach/);
  assert.match(WHITE_UPGRADE_NOTE, /Pro/);
});

test('client and server agree on product id and API paths', () => {
  assert.equal(WHITE_PRODUCT_ID, API_PRODUCT_ID);
  assert.equal(WHITE_CHECKOUT_API, API_CHECKOUT_PATH);
  assert.equal(WHITE_ENTITLEMENT_API, API_ENTITLEMENT_PATH);
});
