import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  STUDENT_LAUNCH_PRICE_NOTE,
  STUDENT_PREVIEW_LABEL,
  STUDENT_PREVIEW_NOTE,
} from './comingSoonAds.ts';
import { COACH_ALPHA_ACCESS_NOTE } from './productPrices.ts';
import { COACH_HOME_TEASER } from './coachCopy.ts';
import {
  GYM_CONSOLE_NAME,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  INSTRUCTOR_COACH_ENTRY,
  PRO_INSTRUCTOR_HUB_LABEL,
  MEDIA_CONSOLE_NAME,
  PRO_LADDER_DETAIL,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
} from './productNames.ts';

function adText(product: keyof typeof COMING_SOON_ADS): string {
  const ad = COMING_SOON_ADS[product];
  return [ad.title, ad.kicker, ad.lead, ad.includes, ad.aside ?? '', ...ad.features.flatMap((f) => [f.title, f.body])].join(
    '\n',
  );
}

/** Every user-facing string on the locked Coach splash, including price and alpha notes. */
function coachSplashText(): string {
  const ad = COMING_SOON_ADS.coach;
  return [
    ad.title,
    ad.kicker,
    ad.lead,
    ad.includes,
    ad.aside ?? '',
    ad.dismiss,
    COACH_PREVIEW_LABEL,
    COACH_PREVIEW_NOTE,
    COACH_LAUNCH_PRICE_NOTE,
    COACH_ALPHA_ACCESS_NOTE,
    ALPHA_TRIAL_NOTE,
    ...ad.features.flatMap((feature) => [feature.title, feature.body]),
  ].join('\n');
}

test('Coach ad lists basic Coach tools, student roster, and no checkout price', () => {
  const text = adText('coach');
  const splash = coachSplashText();
  assert.equal(COMING_SOON_ADS.coach.title, 'Advantage Coach');
  assert.equal(COMING_SOON_ADS.coach.kicker, '');
  assert.equal(COMING_SOON_LABEL, 'Coming Soon');
  assert.doesNotMatch(splash, /coming soon/i);
  assert.doesNotMatch(text, /coming soon/i);
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
    'Email advantageappllc@gmail.com to request an alpha code.',
  );
  assert.equal(
    COACH_ALPHA_ACCESS_NOTE,
    'Coach is in alpha testing. Email advantageappllc@gmail.com to request an alpha code.',
  );
  assert.match(splash, /Email advantageappllc@gmail.com to request an alpha code/);
  assert.match(splash, /\$29\.99 one-time when it launches/);
  const splashSource = readFileSync(new URL('../components/ComingSoonAd.tsx', import.meta.url), 'utf8');
  assert.match(splashSource, /ad\.kicker \? <p className="soon-ad__kicker">\{ad\.kicker\}<\/p> : null/);
  assert.doesNotMatch(splashSource, /coming soon/i);
  const buy = readFileSync(new URL('../pages/BuyWhite.tsx', import.meta.url), 'utf8');
  const coachHeading = buy.indexOf('<h2>Advantage Coach</h2>');
  const proHeading = buy.indexOf('<h2>Advantage Pro</h2>');
  const coachDetails = buy.lastIndexOf('<details', coachHeading);
  const proDetails = buy.lastIndexOf('<details', proHeading);
  const coachSection = buy.slice(coachDetails, proDetails);
  const proSection = buy.slice(proDetails);
  assert.doesNotMatch(coachSection, /coming soon/i);
  assert.match(coachSection, /<ComingSoonAd product="coach" \/>/);
  assert.match(proSection, /<span className="buy__kicker">Coming soon<\/span>/);
  assert.match(proSection, /<h2>Advantage Pro<\/h2>/);
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
    'Media Console, Advantage Instructor Edition, instructor invites, and Tournament Management Pro.',
  );
  assert.doesNotMatch(PRO_CONSOLE_PREVIEW_NOTE, /placeholder|wireframe|coming/i);
  assert.match(text, /Coming Soon/);
  assert.match(text, /Media Console/);
  assert.deepEqual(
    COMING_SOON_ADS.pro.features.map((feature) => feature.title),
    [MEDIA_CONSOLE_NAME, PRO_INSTRUCTOR_HUB_LABEL, INSTRUCTOR_COLLAB_HUB_LABEL, TOURNAMENT_MANAGEMENT_PRO_LABEL],
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
    (feature) => feature.title === PRO_INSTRUCTOR_HUB_LABEL,
  );
  assert.match(unlimitedFeature?.body ?? '', /Competition Class Curriculum/);
  assert.match(unlimitedFeature?.body ?? '', /Google Drive/);
  assert.doesNotMatch(text, /OneDrive|iCloud/i);
  assert.doesNotMatch(text, /Match Controller/);
  assert.doesNotMatch(text, /Round Controller/);
  assert.match(text, /Class Schedule/);
  // Display only: Pro's feature list says Instructor Edition, not Coach Unlimited.
  assert.match(text, /Advantage Instructor Edition/);
  assert.doesNotMatch(text, /Advantage Coach Unlimited/);
  assert.equal(INSTRUCTOR_COACH_ENTRY, 'Advantage Coach Unlimited');
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
    'Price: $99.99 one-time, plus $5.99/month when it launches. Not for sale on this page.',
  );
  assert.equal(COMING_SOON_ADS.pro.kicker, COMING_SOON_LABEL);
  assert.equal(PRODUCT_TEASERS.pro, GYM_CONSOLE_NAME);
  assert.match(PRODUCT_TEASERS.proUnlocked, /Console/);
  assert.doesNotMatch(PRODUCT_TEASERS.proUnlocked, /Toolbox/i);
});

test('Student Edition ad lists the journal and is not a checkout', () => {
  const text = adText('student');
  assert.equal(COMING_SOON_ADS.student.title, STUDENT_EDITION_NAME);
  assert.equal(COMING_SOON_ADS.student.kicker, COMING_SOON_LABEL);
  assert.equal(COMING_SOON_ADS.student.lead, STUDENT_HOME_DESCRIPTION);
  assert.equal(STUDENT_PREVIEW_LABEL, STUDENT_EDITION_NAME);
  assert.match(STUDENT_PREVIEW_NOTE, /Journal/);
  assert.match(STUDENT_PREVIEW_NOTE, /belt progress/i);
  assert.deepEqual(
    COMING_SOON_ADS.student.features.map((feature) => feature.title),
    ['Journal', 'Journal cards', 'Fundamentals', 'Calendar', 'Belt progress'],
  );
  assert.match(text, /Coming Soon/);
  assert.match(text, /Days with journal cards are marked/);
  assert.match(text, /Filled checkpoints between belts/);
  assert.doesNotMatch(text, /Coming soon\./);
  assert.doesNotMatch(text, /\$\d/);
  assert.doesNotMatch(text, /\bstripe\b/i);
  assert.equal(
    STUDENT_LAUNCH_PRICE_NOTE,
    'Price: $19.99 one-time when it launches. Not for sale on this page.',
  );
});
