import assert from 'node:assert/strict';
import test from 'node:test';
import { COMING_SOON_ADS, COMING_SOON_LABEL, PRODUCT_TEASERS } from './comingSoonAds.ts';
import { GYM_CONSOLE_NAME } from './productNames.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ...ad.features.flatMap((f) => [f.title, f.body])].join('\n');
}

test('Coach ad sells bout tools, Daily Techniques, and no price', () => {
  const text = adText('coach');
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.coach.kicker, COMING_SOON_LABEL);
  assert.equal(COMING_SOON_LABEL, 'Coming Soon');
  assert.match(
    text,
    /Run a Mock Tournament, Record Daily Techniques for Screencasting with Competitor Management System/,
  );
  assert.match(text, /Competitor Management System/);
  assert.match(text, /Mock Tournament/i);
  assert.match(
    text,
    /Score each bout and track winners on the same easy to use scoreboard/,
  );
  assert.match(text, /Daily Techniques/);
  assert.match(text, /screencasting/i);
  assert.match(text, /loop/i);
  assert.match(text, /timer/i);
  assert.match(text, /own bank/i);
  assert.doesNotMatch(text, /membership app/i);
  assert.doesNotMatch(text, /student progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.doesNotMatch(PRODUCT_TEASERS.coach, /\$\d/);
  assert.match(PRODUCT_TEASERS.coach, /Mock Tournament/);
  assert.match(PRODUCT_TEASERS.coach, /Daily Techniques/);
  assert.match(PRODUCT_TEASERS.coach, /Competitor Management/);
});

test('Pro ad sells the Console paragraph and no price', () => {
  const text = adText('pro');
  assert.equal(COMING_SOON_ADS.pro.title, 'Advantage Pro');
  assert.match(text, new RegExp(GYM_CONSOLE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /cast to your gym TV and display/i);
  assert.match(text, /Pro-Shop/);
  assert.match(text, /Class Schedules/);
  assert.match(text, /Recent Promotions/);
  assert.match(text, /Upcoming Events and Competitions/);
  assert.match(text, /In-House Tournament Management Suite/i);
  assert.match(text, /Auto-Fill Bracketing/i);
  assert.match(text, /Result Tracking/i);
  assert.match(text, /Instructor Licenses/i);
  assert.match(text, /Cross Platform Access/i);
  assert.doesNotMatch(text, /Owner.?s Toolbox/i);
  assert.doesNotMatch(text, /student progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /checkout/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.equal(COMING_SOON_ADS.pro.kicker, COMING_SOON_LABEL);
  assert.equal(PRODUCT_TEASERS.pro, GYM_CONSOLE_NAME);
  assert.match(PRODUCT_TEASERS.proUnlocked, /Console/);
  assert.doesNotMatch(PRODUCT_TEASERS.proUnlocked, /Toolbox/i);
});
