import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMING_SOON_ADS,
  COMING_SOON_LABEL,
  PRODUCT_TEASERS,
  PRO_CONSOLE_PREVIEW_LABEL,
  PRO_CONSOLE_PREVIEW_NOTE,
} from './comingSoonAds.ts';
import { COACH_AD_LEAD, COACH_HOME_TEASER } from './coachCopy.ts';
import {
  COMPETITOR_SYSTEM_NAME,
  GYM_CONSOLE_NAME,
  INSTRUCTOR_COLLAB_NAME,
  MEDIA_CONSOLE_NAME,
  PRO_COMING_SOON_LINES,
  PRO_HOME_DETAIL,
  TOURNAMENT_SUITE_NAME,
} from './productNames.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ...ad.features.flatMap((f) => [f.title, f.body])].join('\n');
}

test('Coach ad sells the hub tools and no price', () => {
  const text = adText('coach');
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.coach.kicker, COMING_SOON_LABEL);
  assert.equal(COMING_SOON_LABEL, 'Coming Soon');
  assert.equal(COMING_SOON_ADS.coach.lead, COACH_AD_LEAD);
  assert.deepEqual(
    COMING_SOON_ADS.coach.features.map((feature) => feature.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Mock Tournament', 'Competitor Roster'],
  );
  assert.match(text, /Mock Tournament/i);
  assert.match(text, /Competitor Roster/);
  assert.doesNotMatch(text, /Competitor Management/);
  assert.match(text, /Daily Lesson Plan/);
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
  const teaser = PRODUCT_TEASERS.coach;
  const lesson = teaser.indexOf('Daily Lesson Plan');
  const videos = teaser.indexOf('Daily Training Videos');
  const mock = teaser.indexOf('Mock Tournament');
  const roster = teaser.indexOf('Roster');
  assert.ok(lesson === 0 && videos > lesson && mock > videos && roster > mock);
  assert.ok(PRODUCT_TEASERS.coach.length < 70);
});

test('Pro ad sells the Console paragraph and no price', () => {
  const text = adText('pro');
  assert.equal(COMING_SOON_ADS.pro.title, 'Advantage Pro');
  assert.equal(COMING_SOON_ADS.pro.lead, `${PRO_HOME_DETAIL}. ${PRO_COMING_SOON_LINES.join(' ')}`);
  assert.equal(PRO_CONSOLE_PREVIEW_LABEL, 'Pro console preview — coming soon');
  assert.equal(PRO_CONSOLE_PREVIEW_NOTE, 'Placeholder — real art is coming.');
  assert.match(text, new RegExp(GYM_CONSOLE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /Coming Soon/);
  assert.match(text, /Cast to your Gym TV/i);
  assert.match(text, /Media Console/);
  assert.deepEqual(
    COMING_SOON_ADS.pro.features.map((feature) => feature.title),
    [MEDIA_CONSOLE_NAME, TOURNAMENT_SUITE_NAME, COMPETITOR_SYSTEM_NAME, INSTRUCTOR_COLLAB_NAME],
  );
  assert.match(text, /ProShop Inventory/);
  assert.match(text, /Class Schedules/);
  assert.match(text, /Recent Promotions/);
  assert.match(text, /Upcoming Events and Competitions/);
  assert.match(text, /In-House Tournament Management Suite/i);
  assert.match(text, /Class Schedule/);
  assert.match(text, /Competitor Management System/);
  assert.match(text, /Instructor Collaboration and Cloud Access/);
  assert.doesNotMatch(text, /Mock Tournament/);
  assert.match(text, /Auto-Fill Bracketing/i);
  assert.match(text, /Result Tracking/i);
  assert.match(text, /Instructor Licenses/i);
  assert.match(text, /Cross Platform Access/i);
  assert.match(text, /Shared Training Videos/);
  assert.doesNotMatch(text, /Much More!/);
  assert.doesNotMatch(text, /Pro Shop Inventory/);
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
