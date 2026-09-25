import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMING_SOON_ADS,
  COMING_SOON_LABEL,
  PRODUCT_TEASERS,
  PRO_CONSOLE_PREVIEW_LABEL,
  PRO_CONSOLE_PREVIEW_NOTE,
} from './comingSoonAds.ts';
import { COACH_HOME_TEASER } from './coachCopy.ts';
import {
  COMPETITOR_SYSTEM_NAME,
  GYM_CONSOLE_NAME,
  INSTRUCTOR_COLLAB_NAME,
  MEDIA_CONSOLE_NAME,
  TOURNAMENT_SUITE_NAME,
} from './productNames.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ...ad.features.flatMap((f) => [f.title, f.body])].join('\n');
}

test('Coach ad sells the hub tools and no price', () => {
  const text = adText('coach');
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.coach.kicker, '');
  assert.equal(COMING_SOON_LABEL, 'Coming Soon');
  assert.doesNotMatch(text, /Coming Soon/i);
  assert.equal(COMING_SOON_ADS.coach.lead, '');
  assert.doesNotMatch(text, /training videos, Technique Tree, mock brackets, and a roster/i);
  assert.doesNotMatch(text, /^Coach tools:/m);
  assert.deepEqual(
    COMING_SOON_ADS.coach.features.map((feature) => feature.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Mock Tournament', 'Competitor Roster'],
  );
  assert.equal(COMING_SOON_ADS.coach.features[0]?.title, 'Daily Lesson Plan');
  assert.match(COMING_SOON_ADS.coach.features[0]?.body ?? '', /everything you need/i);
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

test('Pro ad keeps the splash and descriptor boxes without the middle paragraph', () => {
  const text = adText('pro');
  assert.equal(COMING_SOON_ADS.pro.title, 'Advantage Pro');
  assert.equal(COMING_SOON_ADS.pro.lead, '');
  assert.equal(PRO_CONSOLE_PREVIEW_LABEL, "Gym Owner and Instructor's Console");
  assert.equal(
    PRO_CONSOLE_PREVIEW_NOTE,
    'Media Console, competitors, instructor access, and the tournament suite.',
  );
  assert.doesNotMatch(PRO_CONSOLE_PREVIEW_NOTE, /placeholder|wireframe|coming/i);
  assert.match(text, /Coming Soon/);
  assert.match(text, /Media Console/);
  assert.deepEqual(
    COMING_SOON_ADS.pro.features.map((feature) => feature.title),
    [MEDIA_CONSOLE_NAME, COMPETITOR_SYSTEM_NAME, INSTRUCTOR_COLLAB_NAME, TOURNAMENT_SUITE_NAME],
  );
  assert.doesNotMatch(text, /Cast to your Gym TV/i);
  assert.doesNotMatch(text, /ProShop Inventory/);
  assert.doesNotMatch(text, /Auto-Fill Bracketing/i);
  assert.doesNotMatch(text, /Shared Training Videos/);
  assert.match(text, /In-House Tournament Management Suite/i);
  assert.match(text, /Class Schedule/);
  assert.match(text, /Competitor Management System/);
  assert.match(text, /Instructor Collaboration and Cloud Access/);
  assert.doesNotMatch(text, /Mock Tournament/);
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
