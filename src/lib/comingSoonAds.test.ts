import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALPHA_TRIAL_NOTE,
  COACH_LAUNCH_PRICE_NOTE,
  COACH_PREVIEW_LABEL,
  COACH_PREVIEW_NOTE,
  COMING_SOON_ADS,
  COMING_SOON_LABEL,
  PRODUCT_TEASERS,
  PRO_CONSOLE_PREVIEW_LABEL,
  PRO_CONSOLE_PREVIEW_NOTE,
  PRO_LAUNCH_PRICE_NOTE,
} from './comingSoonAds.ts';
import { COACH_HOME_TEASER } from './coachCopy.ts';
import {
  GYM_CONSOLE_NAME,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  INSTRUCTOR_COACH_ENTRY,
  MEDIA_CONSOLE_NAME,
  PRO_LADDER_DETAIL,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
} from './productNames.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ad.includes, ad.aside ?? '', ...ad.features.flatMap((f) => [f.title, f.body])].join(
    '\n',
  );
}

test('Coach ad lists basic Coach tools, student roster, and no checkout price', () => {
  const text = adText('coach');
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.coach.kicker, COMING_SOON_LABEL);
  assert.equal(COMING_SOON_LABEL, 'Coming Soon');
  assert.match(COMING_SOON_ADS.coach.lead, /Tools and templates for coaches/);
  assert.equal(COMING_SOON_ADS.coach.includes, 'Includes everything in Advantage White.');
  assert.match(COMING_SOON_ADS.coach.aside ?? '', /Competition Class Curriculum/);
  assert.match(COMING_SOON_ADS.coach.aside ?? '', /Competition Team Management/);
  assert.equal(COACH_PREVIEW_LABEL, 'Advantage Coach');
  assert.equal(
    COACH_PREVIEW_NOTE,
    'Daily Lesson Plan, training videos, Technique Tree, Student Roster, and a plain mock tournament.',
  );
  assert.doesNotMatch(text, /^Coach tools:/m);
  assert.deepEqual(
    COMING_SOON_ADS.coach.features.map((feature) => feature.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Student Roster', 'Mock Tournament'],
  );
  assert.match(text, /Student Roster/);
  assert.match(text, /Student Notes/);
  assert.match(text, /other belt/);
  assert.match(text, /Division/);
  assert.match(text, /gym name or nickname/);
  assert.match(text, /last promotion/);
  assert.match(text, /No photo on basic Coach/);
  assert.match(text, /No skins and no rankings/);
  assert.doesNotMatch(text, /competitor roster/i);
  assert.doesNotMatch(text, /Daily Techniques/);
  assert.doesNotMatch(text, /membership app/i);
  assert.doesNotMatch(text, /student progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /Gallery/i);
  assert.doesNotMatch(text, /Pro-Shop|Pro Shop/i);
  assert.doesNotMatch(text, /Class Schedule/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.equal(
    COACH_LAUNCH_PRICE_NOTE,
    'Price: $29.99 one-time when it launches. Not for sale on this page.',
  );
  assert.equal(
    ALPHA_TRIAL_NOTE,
    'Free trial: request an alpha testing code by emailing advantageappllc@gmail.com.',
  );
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

test('Pro ad lists the live Pro hubs and keeps launch pricing off the feature copy', () => {
  const text = adText('pro');
  assert.equal(COMING_SOON_ADS.pro.title, 'Advantage Pro');
  assert.equal(COMING_SOON_ADS.pro.lead, PRO_LADDER_DETAIL);
  assert.equal(COMING_SOON_ADS.pro.includes, 'Includes everything in Advantage Coach and Advantage White.');
  assert.equal(PRO_CONSOLE_PREVIEW_LABEL, 'Advantage Pro');
  assert.equal(
    PRO_CONSOLE_PREVIEW_NOTE,
    'Media Console, Advantage Coach Unlimited, instructor invites, and Tournament Management Pro.',
  );
  assert.doesNotMatch(PRO_CONSOLE_PREVIEW_NOTE, /placeholder|wireframe|coming/i);
  assert.match(text, /Coming Soon/);
  assert.match(text, /Media Console/);
  assert.deepEqual(
    COMING_SOON_ADS.pro.features.map((feature) => feature.title),
    [MEDIA_CONSOLE_NAME, INSTRUCTOR_COACH_ENTRY, INSTRUCTOR_COLLAB_HUB_LABEL, TOURNAMENT_MANAGEMENT_PRO_LABEL],
  );
  assert.doesNotMatch(text, /Cast to your Gym TV/i);
  assert.doesNotMatch(text, /ProShop Inventory/);
  assert.doesNotMatch(text, /Auto-Fill Bracketing/i);
  assert.doesNotMatch(text, /Shared Training Videos/);
  assert.doesNotMatch(text, /Competition Management Pro/);
  const tournamentFeature = COMING_SOON_ADS.pro.features.find(
    (feature) => feature.title === TOURNAMENT_MANAGEMENT_PRO_LABEL,
  );
  assert.match(tournamentFeature?.body ?? '', /Pro brackets/);
  assert.doesNotMatch(tournamentFeature?.body ?? '', /roster/i);
  const unlimitedFeature = COMING_SOON_ADS.pro.features.find(
    (feature) => feature.title === INSTRUCTOR_COACH_ENTRY,
  );
  assert.match(unlimitedFeature?.body ?? '', /Competition Class Curriculum/);
  assert.match(unlimitedFeature?.body ?? '', /Google Drive/);
  assert.doesNotMatch(text, /OneDrive|iCloud/i);
  assert.doesNotMatch(text, /Match Controller/);
  assert.doesNotMatch(text, /Round Controller/);
  assert.match(text, /Class Schedule/);
  assert.match(text, /Advantage Coach Unlimited/);
  assert.match(text, /Instructor Invitation and Access Management/);
  assert.doesNotMatch(text, /Competitor Management System/);
  assert.doesNotMatch(text, /competitor roster/i);
  assert.doesNotMatch(text, /Cloud Access/);
  assert.doesNotMatch(text, /Mock Tournament/);
  assert.doesNotMatch(text, /Owner.?s Toolbox/i);
  assert.doesNotMatch(text, /student progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /checkout/i);
  assert.doesNotMatch(text, /\$\d/);
  assert.equal(
    PRO_LAUNCH_PRICE_NOTE,
    'Price: $99.99 one-time, plus $2.99/month when it launches. Not for sale on this page.',
  );
  assert.equal(COMING_SOON_ADS.pro.kicker, COMING_SOON_LABEL);
  assert.equal(PRODUCT_TEASERS.pro, GYM_CONSOLE_NAME);
  assert.match(PRODUCT_TEASERS.proUnlocked, /Console/);
  assert.doesNotMatch(PRODUCT_TEASERS.proUnlocked, /Toolbox/i);
});
