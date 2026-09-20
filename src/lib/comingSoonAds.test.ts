import assert from 'node:assert/strict';
import test from 'node:test';
import { COMING_SOON_ADS, PRODUCT_TEASERS } from './comingSoonAds.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ...ad.features.flatMap((f) => [f.title, f.body])].join('\n');
}

test('Coach ad sells bout tools, Daily Techniques, and no price', () => {
  const text = adText('coach');
  assert.match(text, /Competitor Management System/);
  assert.match(text, /not GB Members/i);
  assert.match(text, /not student progress/i);
  assert.match(text, /Mock tournaments/i);
  assert.match(text, /Daily Techniques/);
  assert.match(text, /loop/i);
  assert.match(text, /timer/i);
  assert.match(text, /own bank/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.doesNotMatch(PRODUCT_TEASERS.coach, /\$\d/);
  assert.match(PRODUCT_TEASERS.coach, /Mock tournaments/);
  assert.match(PRODUCT_TEASERS.coach, /Daily Techniques/);
});

test('Pro ad sells owner TV tools, ProShop display, and no price', () => {
  const text = adText('pro');
  assert.match(text, /Class Schedule/);
  assert.match(text, /logo/i);
  assert.match(text, /QR/);
  assert.match(text, /multi-mat/i);
  assert.match(text, /Gallery and Videos/);
  assert.match(text, /ProShop display/);
  assert.match(text, /Events and flyers/);
  assert.match(text, /Instructor seats/);
  assert.match(text, /You control who gets a seat/);
  assert.match(text, /Competitor tools/);
  assert.doesNotMatch(text, /\$\d/);
  assert.match(PRODUCT_TEASERS.pro, /ProShop display/);
  assert.match(PRODUCT_TEASERS.proUnlocked, /ProShop display/);
});
