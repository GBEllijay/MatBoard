import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHITE_IAP_PLACEHOLDER_PRODUCT_ID,
  WHITE_IAP_PRICE_LABEL,
  isUsStorefront,
  isUsStorefrontCountryCode,
  nativeWhiteIapStub,
} from './nativeWhiteIap.ts';
import { readFileSync } from 'node:fs';

test('placeholder product id uses the confirmed bundle id spelling with two j’s', () => {
  assert.equal(WHITE_IAP_PLACEHOLDER_PRODUCT_ID, 'com.advantagebjjtimer.white.unlock');
  assert.match(WHITE_IAP_PLACEHOLDER_PRODUCT_ID, /^com\.advantagebjjtimer\.white\./);
  assert.doesNotMatch(WHITE_IAP_PLACEHOLDER_PRODUCT_ID, /advantagebjtimer[^j]|advantageapp/);
  assert.equal(WHITE_IAP_PRICE_LABEL, '$15.99');
});

test('US storefront gate accepts only Apple’s USA country code', () => {
  assert.equal(isUsStorefrontCountryCode('USA'), true);
  assert.equal(isUsStorefrontCountryCode('US'), false);
  assert.equal(isUsStorefrontCountryCode('BRA'), false);
  assert.equal(isUsStorefrontCountryCode(null), false);
  assert.equal(isUsStorefrontCountryCode(undefined), false);
});

test('the stub never pretends a purchase or restore succeeded', async () => {
  const purchase = await nativeWhiteIapStub.purchaseWhiteUnlock();
  const restore = await nativeWhiteIapStub.restoreWhitePurchases();
  const storefront = await nativeWhiteIapStub.currentStorefrontCountryCode();
  assert.deepEqual(purchase, { ok: false, error: 'In-app purchase is not wired yet.' });
  assert.deepEqual(restore, { ok: false, error: 'In-app purchase is not wired yet.' });
  assert.equal(storefront, null);
  assert.equal(await isUsStorefront(nativeWhiteIapStub), false);
});

test('the stub source has no runtime checkout, restore-request, or StoreKit calls', () => {
  const source = readFileSync(new URL('./nativeWhiteIap.ts', import.meta.url), 'utf8');
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`[^`]*`/g, '')
    .replace(/['"][^'"]*['"]/g, '');
  assert.doesNotMatch(code, /fetch\s*\(|\/api\/checkout|\/api\/restore\/request|SKPayment|StoreKit/);
  assert.match(source, /TODO\(native-iap\)/);
});
