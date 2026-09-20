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
  assert.match(text, /Mock tournaments/i);
  assert.match(
    text,
    /Score each bout and track winners on the same easy to use scoreboard/,
  );
  assert.match(text, /Daily Techniques/);
  assert.match(text, /loop/i);
  assert.match(text, /timer/i);
  assert.match(text, /own bank/i);
  assert.doesNotMatch(text, /membership app/i);
  assert.doesNotMatch(text, /student progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.doesNotMatch(PRODUCT_TEASERS.coach, /\$\d/);
  assert.match(PRODUCT_TEASERS.coach, /Mock brackets/);
  assert.match(PRODUCT_TEASERS.coach, /Daily Techniques/);
});

test('Pro ad sells owner TV tools, ProShop display, and no price', () => {
  const text = adText('pro');
  assert.match(
    text,
    /Gym owner tools for black belts, instructors and program managers who run the gym/,
  );
  assert.match(text, /Class Schedule/);
  assert.match(text, /logo/i);
  assert.match(text, /QR/);
  assert.match(text, /multi-mat/i);
  assert.match(text, /Gallery and Videos/);
  assert.match(text, /ProShop display/);
  assert.match(text, /QR to your shop/);
  assert.match(text, /Events and flyers/);
  assert.match(text, /Instructor seats/);
  assert.match(text, /instructors you add and revoke/);
  assert.match(text, /Competitor tools/);
  assert.match(text, /instructors you seat/);
  assert.doesNotMatch(text, /coaches you seat/);
  assert.doesNotMatch(text, /checkout/i);
  assert.doesNotMatch(text, /free-for-all/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.match(PRODUCT_TEASERS.pro, /instructor seats/);
  assert.match(PRODUCT_TEASERS.pro, /ProShop/);
  assert.match(PRODUCT_TEASERS.proUnlocked, /Toolbox/);
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.pro.title, 'Advantage Pro');
});
