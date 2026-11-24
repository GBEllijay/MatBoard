import assert from 'node:assert/strict';
import test from 'node:test';
import { API_CHECKOUT_PATH, API_ENTITLEMENT_PATH, API_PRODUCT_ID } from '../server/routes.ts';
import {
  WHITE_CHECKOUT_API,
  WHITE_ENTITLEMENT_API,
  WHITE_FEATURES,
  WHITE_INCLUDED,
  WHITE_LAUNCH_PRICE_CENTS,
  WHITE_LIST_PRICE_CENTS,
  WHITE_PRICE_LABEL,
  whiteBuyCtaLabel,
  WHITE_PRODUCT_ID,
  WHITE_UPGRADE_NOTE,
  formatUsdFromCents,
  priceAfterAmountOff,
} from './whitePurchase.ts';

test('Advantage White list price is $19.99 and the launch price is $15.99', () => {
  assert.equal(WHITE_LIST_PRICE_CENTS, 1999);
  assert.equal(WHITE_LAUNCH_PRICE_CENTS, 1599);
  assert.equal(formatUsdFromCents(WHITE_LIST_PRICE_CENTS), WHITE_PRICE_LABEL);
  assert.equal(formatUsdFromCents(WHITE_LIST_PRICE_CENTS), '$19.99');
  assert.equal(formatUsdFromCents(WHITE_LAUNCH_PRICE_CENTS), '$15.99');
  assert.equal(whiteBuyCtaLabel(), 'Buy Advantage White — $19.99');
  assert.equal(whiteBuyCtaLabel(WHITE_LAUNCH_PRICE_CENTS), 'Buy Advantage White — $15.99');
});

test('amount-off helper subtracts a fixed coupon from the current list price', () => {
  assert.equal(priceAfterAmountOff(WHITE_LIST_PRICE_CENTS, 500), 1499);
  assert.equal(priceAfterAmountOff(WHITE_LIST_PRICE_CENTS, 900), 1099);
  assert.equal(priceAfterAmountOff(WHITE_LAUNCH_PRICE_CENTS, 500), 1099);
  assert.equal(formatUsdFromCents(499), '$4.99');
  assert.equal(formatUsdFromCents(99), '$0.99');
});

test('buy page lists included tools, browser install, and the Coach and Pro footer', () => {
  assert.deepEqual(WHITE_INCLUDED, [
    'Tournament Style BJJ Scoreboard',
    'Fully Customizable Round Timer',
  ]);
  assert.equal(
    WHITE_FEATURES[0],
    'Installs on Phone or Desktop from your browser — Add to Home Screen or Install.',
  );
  assert.match(WHITE_FEATURES[1], /TV or monitor/);
  assert.match(WHITE_FEATURES[2], /music app/);
  assert.equal(
    WHITE_UPGRADE_NOTE,
    'Instructor Edition and Pro are in alpha testing. Email advantageappllc@gmail.com to request an alpha code.',
  );
});

test('client and server agree on product id and API paths', () => {
  assert.equal(WHITE_PRODUCT_ID, API_PRODUCT_ID);
  assert.equal(WHITE_CHECKOUT_API, API_CHECKOUT_PATH);
  assert.equal(WHITE_ENTITLEMENT_API, API_ENTITLEMENT_PATH);
});
