import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  HALF_OFF_CODE,
  HALF_OFF_HOME_HREF,
  HALF_OFF_NOTE,
  HALF_OFF_PROMOTION_CODE_ID,
  HALF_OFF_QUERY_KEY,
  HALF_OFF_STORAGE_KEY,
  HALF_OFF_TITLE,
  buyCheckoutBody,
  captureHalfOffSearch,
  halfOffStored,
  isAllowlistedHalfOffCode,
  isHalfOffCheckoutFlag,
  rememberHalfOff,
} from './halfOff.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('half off allowlist is only MEIA', () => {
  assert.equal(HALF_OFF_CODE, 'MEIA');
  assert.equal(HALF_OFF_PROMOTION_CODE_ID, 'promo_1UUSYNARhGonKqrOgkxlh3wo');
  assert.equal(HALF_OFF_QUERY_KEY, 'promo');
  assert.equal(HALF_OFF_HOME_HREF, '/?promo=MEIA');
  assert.equal(HALF_OFF_TITLE, 'Advantage - half off');
  assert.equal(HALF_OFF_NOTE, 'Half off code MEIA applied at checkout');
  assert.equal(isAllowlistedHalfOffCode('MEIA'), true);
  assert.equal(isAllowlistedHalfOffCode(' meia '), true);
  assert.equal(isAllowlistedHalfOffCode('MEIA2'), false);
  assert.equal(isAllowlistedHalfOffCode('WHITE499'), false);
  assert.equal(isAllowlistedHalfOffCode('promo_1UUSYNARhGonKqrOgkxlh3wo'), false);
  assert.equal(isAllowlistedHalfOffCode(''), false);
  assert.equal(isAllowlistedHalfOffCode(null), false);
  assert.equal(isHalfOffCheckoutFlag(true), true);
  assert.equal(isHalfOffCheckoutFlag('true'), false);
  assert.equal(isHalfOffCheckoutFlag('MEIA'), false);
  assert.equal(isHalfOffCheckoutFlag(1), false);
});

test('only ?promo=MEIA is remembered', () => {
  const local = memoryStore();
  const session = memoryStore();
  assert.equal(captureHalfOffSearch(new URLSearchParams('promo=SAVE50'), local, session), false);
  assert.equal(captureHalfOffSearch(new URLSearchParams('code=MEIA'), local, session), false);
  assert.equal(captureHalfOffSearch(new URLSearchParams('promo=MEIA2'), local, session), false);
  assert.equal(local.values.size, 0);
  assert.equal(session.values.size, 0);
  assert.equal(captureHalfOffSearch(new URLSearchParams('promo=meia'), local, session), true);
  assert.equal(local.values.get(HALF_OFF_STORAGE_KEY), 'MEIA');
  assert.equal(session.values.get(HALF_OFF_STORAGE_KEY), 'MEIA');
  local.values.set(HALF_OFF_STORAGE_KEY, 'OTHER');
  session.values.set(HALF_OFF_STORAGE_KEY, 'OTHER');
  assert.equal(halfOffStored(local, session), false);
  rememberHalfOff(local, session);
  assert.equal(halfOffStored(local, session), true);
  assert.equal(local.values.get(HALF_OFF_STORAGE_KEY), HALF_OFF_CODE);
});

test('checkout body never forwards an arbitrary code as the half-off flag', () => {
  assert.deepEqual(buyCheckoutBody({ halfOffActive: false }), {});
  assert.deepEqual(buyCheckoutBody({ halfOffActive: true }), { halfOff: true });
  assert.deepEqual(buyCheckoutBody({ product: 'white', halfOffActive: true }), { halfOff: true });
  assert.deepEqual(buyCheckoutBody({ product: 'student', halfOffActive: true }), {
    product: 'student',
    halfOff: true,
  });
  assert.deepEqual(buyCheckoutBody({ product: 'coach', halfOffActive: true }), {
    product: 'coach',
    halfOff: true,
  });
  assert.deepEqual(buyCheckoutBody({ product: 'pro', halfOffActive: true }), {
    product: 'pro',
    halfOff: true,
  });
  assert.deepEqual(buyCheckoutBody({ typedPromo: 'WHITE499', halfOffActive: true }), {
    promotionCode: 'WHITE499',
  });
  assert.deepEqual(buyCheckoutBody({ typedPromo: '  MEIA ', halfOffActive: true }), { halfOff: true });
  assert.deepEqual(buyCheckoutBody({ typedPromo: 'MEIA', halfOffActive: false }), { promotionCode: 'MEIA' });
  const evil = buyCheckoutBody({ typedPromo: 'promo_evil', halfOffActive: true });
  assert.equal(evil.halfOff, undefined);
  assert.equal(evil.promotionCode, 'promo_evil');
  assert.equal(typeof buyCheckoutBody({ halfOffActive: true }).halfOff, 'boolean');
});

test('buy pages keep the half-off note and the existing unlock path', () => {
  const white = readFileSync(resolve(root, 'src/pages/BuyWhite.tsx'), 'utf8');
  const tier = readFileSync(resolve(root, 'src/pages/BuyTier.tsx'), 'utf8');
  assert.match(white, /HalfOffCheckoutNote/);
  assert.match(white, /buyCheckoutBody\(/);
  assert.match(white, /redeemAccessCode\(typed\)/);
  assert.match(white, /typedPromo: typed/);
  assert.match(tier, /HalfOffCheckoutNote/);
  assert.match(tier, /buyCheckoutBody\(\{ product: tier\.product, halfOffActive: halfOff \}\)/);
  const note = readFileSync(resolve(root, 'src/components/HalfOffCheckoutNote.tsx'), 'utf8');
  assert.match(note, /HALF_OFF_NOTE/);
});
