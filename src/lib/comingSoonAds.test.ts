import assert from 'node:assert/strict';
import test from 'node:test';
import { COMING_SOON_ADS, COMING_SOON_LABEL, PRODUCT_TEASERS } from './comingSoonAds.ts';
import { COACH_AD_LEAD, COACH_HOME_TEASER } from './coachCopy.ts';
import { GYM_CONSOLE_NAME } from './productNames.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ...ad.features.flatMap((f) => [f.title, f.body])].join('\n');
}

test('Coach ad sells the four hub tools and no price', () => {
  const text = adText('coach');
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.coach.kicker, COMING_SOON_LABEL);
  assert.equal(COMING_SOON_LABEL, 'Coming Soon');
  assert.equal(COMING_SOON_ADS.coach.lead, COACH_AD_LEAD);
  assert.match(text, /Mock Tournament/i);
  assert.match(text, /Competitor Management/);
  assert.match(text, /Training Notes/);
  assert.match(
    text,
    /Score each bout and track winners on the same easy to use scoreboard/,
  );
  assert.match(text, /Daily Training Videos/);
  assert.match(text, /2:30/);
  assert.match(text, /5:00/);
  assert.match(text, /7:00/);
  assert.match(text, /loop/i);
  assert.match(text, /timer/i);
  assert.doesNotMatch(text, /Daily Techniques/);
  assert.doesNotMatch(text, /membership app/i);
  assert.doesNotMatch(text, /student progress/i);
  assert.doesNotMatch(text, /\bstudents?\b/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /Gallery/i);
  assert.doesNotMatch(text, /Pro-Shop|Pro Shop/i);
  assert.doesNotMatch(text, /Class Schedule/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.doesNotMatch(PRODUCT_TEASERS.coach, /\$\d/);
  assert.equal(PRODUCT_TEASERS.coach, COACH_HOME_TEASER);
  assert.equal(PRODUCT_TEASERS.coachUnlocked, COACH_HOME_TEASER);
  assert.match(PRODUCT_TEASERS.coach, /Mock Tournament/);
  assert.match(PRODUCT_TEASERS.coach, /Daily Videos/);
  assert.match(PRODUCT_TEASERS.coach, /Roster/);
  assert.match(PRODUCT_TEASERS.coach, /Notes/);
  assert.ok(PRODUCT_TEASERS.coach.length < 55);
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
