import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_HOME_DESCRIPTION, PRO_HOME_LINES, STUDENT_HOME_DESCRIPTION } from './productNames.ts';
import { ALPHA_REQUEST_SUBJECT, alphaRequestMailto, SITE_FEEDBACK_EMAIL } from './siteFooter.ts';
import {
  STOREFRONT_ALPHA_NOTE,
  STOREFRONT_BUY_LABEL,
  STOREFRONT_BUY_PATH,
  STOREFRONT_COMING_SOON,
  STOREFRONT_HERO,
  STOREFRONT_NAV,
  STOREFRONT_PICKER_LINKS,
  STOREFRONT_POINTS,
  STOREFRONT_PRICE_LABEL,
  STOREFRONT_PROGRESS_EYEBROW,
  STOREFRONT_PROGRESS_HEADING,
  STOREFRONT_STEPS,
  STOREFRONT_TIMER,
  STOREFRONT_WOODBLOCKS,
} from './storefront.ts';
import { WHITE_BUY_PATH, WHITE_FREE_CODE, WHITE_LAUNCH_PROMOS, WHITE_PRICE_LABEL } from './whitePurchase.ts';
import { FULL_OWNER_UNLOCK_CODE } from './proUnlock.ts';

test('storefront sells White once and sends Buy Now to the existing checkout', () => {
  assert.equal(STOREFRONT_PRICE_LABEL, '$9.99');
  assert.equal(STOREFRONT_PRICE_LABEL, WHITE_PRICE_LABEL);
  assert.equal(STOREFRONT_BUY_PATH, '/buy');
  assert.equal(STOREFRONT_BUY_PATH, WHITE_BUY_PATH);
  assert.equal(STOREFRONT_BUY_LABEL, 'Buy Advantage White — $9.99');
  assert.equal(STOREFRONT_HERO.title, 'Win by Advantage.');
  assert.equal(STOREFRONT_HERO.clock, '05:00');
  assert.match(STOREFRONT_HERO.leadBeforeBreak, /scoreboard and timer/);
  assert.match(STOREFRONT_HERO.leadAfterBreak, /from your phone/);
});

test('Pass 2 sections use the approved copy and woodblocks', () => {
  assert.equal(STOREFRONT_PROGRESS_EYEBROW, 'Progression');
  assert.equal(STOREFRONT_PROGRESS_HEADING, 'Start with White. Grow into Pro.');
  assert.equal(STOREFRONT_ALPHA_NOTE, 'Student, Coach and Pro are in alpha testing.');
  assert.deepEqual(
    STOREFRONT_NAV.map((item) => item.label),
    ['Scoreboard', 'Round timer'],
  );
  assert.equal(
    STOREFRONT_NAV.some((item) => /belt progression/i.test(item.label)),
    false,
  );
  assert.deepEqual(
    STOREFRONT_POINTS.map((point) => point.title),
    ['Points', 'Advantages', 'Penalties'],
  );
  assert.equal(STOREFRONT_TIMER.title, 'Round timer');
  assert.match(STOREFRONT_TIMER.body, /Music in another app keeps playing/);
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.webp, '/homepage/woodblock-scoreboard.webp');
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.jpg, '/homepage/woodblock-scoreboard.jpg');
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.width, 1280);
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.height, 720);
  assert.match(STOREFRONT_WOODBLOCKS.scoreboard.alt, /Advantage scoreboard runs on the wall TV/);
  assert.equal(STOREFRONT_WOODBLOCKS.timer.webp, '/homepage/woodblock-timer.webp');
  assert.equal(STOREFRONT_WOODBLOCKS.timer.jpg, '/homepage/woodblock-timer.jpg');
  assert.match(STOREFRONT_WOODBLOCKS.timer.alt, /Advantage round timer runs on the wall TV/);
  assert.doesNotMatch(STOREFRONT_WOODBLOCKS.scoreboard.jpg, /hero-still|hero-poster/);
  assert.doesNotMatch(STOREFRONT_WOODBLOCKS.timer.jpg, /hero-still|hero-poster/);
});

test('the three owner CTAs open the pre-Pass-2 picker and nothing else', () => {
  assert.deepEqual(
    STOREFRONT_PICKER_LINKS.map((link) => link.label),
    ['Start with White. Grow into Pro.', 'Advantage – Student Edition', 'Advantage Coach'],
  );
  for (const link of STOREFRONT_PICKER_LINKS) {
    assert.equal(link.to, '/products');
    assert.notEqual(link.to, '/buy');
    assert.notEqual(link.to, '/student');
    assert.notEqual(link.to, '/coming-soon');
    assert.equal(String(link.to).startsWith('#'), false);
  }
  assert.equal(STOREFRONT_STEPS.find((step) => step.id === 'student')?.to, '/products');
  assert.equal(STOREFRONT_STEPS.find((step) => step.id === 'coach')?.to, '/products');
  assert.equal(STOREFRONT_STEPS.find((step) => step.id === 'pro')?.to, '/products');
  assert.equal(STOREFRONT_STEPS.find((step) => step.id === 'white')?.to, '/buy');
  assert.equal(STOREFRONT_STEPS.find((step) => step.id === 'white')?.to, STOREFRONT_BUY_PATH);
});

test('coming soon stays Student, Coach, Pro and does not sell Coach or Pro', () => {
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.id),
    ['student', 'coach', 'pro'],
  );
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.title),
    ['Advantage – Student Edition', 'Advantage Coach', 'Advantage Pro'],
  );
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.to),
    ['/products', '/products', '/products'],
  );
  assert.deepEqual(
    STOREFRONT_COMING_SOON.map((item) => item.forSale),
    [false, false, false],
  );
  assert.equal(STOREFRONT_COMING_SOON[0]?.price, '$19.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[1]?.price, '$29.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[2]?.price, '$99.99 one-time, plus $5.99/month');
  assert.equal(STOREFRONT_COMING_SOON[2]?.cardPrice, '$99.99 + $5.99/mo');
  assert.equal(STOREFRONT_COMING_SOON[0]?.blurb, 'A personal BJJ training journal.');
  assert.equal(
    STOREFRONT_COMING_SOON[1]?.blurb,
    'Daily lesson plans, training videos and a technique tree. Includes White.',
  );
  assert.match(STOREFRONT_COMING_SOON[2]?.blurb ?? '', /shared drive/);
  assert.match(STOREFRONT_COMING_SOON[2]?.blurb ?? '', /Includes Coach/);
  assert.equal(STOREFRONT_COMING_SOON[0]?.status, 'Coming soon');
  assert.equal(STOREFRONT_COMING_SOON[1]?.status, 'Coming soon');
  assert.equal(STOREFRONT_COMING_SOON[2]?.status, 'Coming soon');
  assert.equal(STOREFRONT_COMING_SOON.some((item) => item.forSale), false);
  assert.match(STUDENT_HOME_DESCRIPTION, /rank and stripes/);
  assert.match(COACH_HOME_DESCRIPTION, /everything in Advantage White/);
  assert.match(PRO_HOME_LINES.join(' '), /everything in Advantage Coach/);
  assert.notEqual(STOREFRONT_COMING_SOON[0]?.blurb, STUDENT_HOME_DESCRIPTION);
});

test('alpha requests keep the existing inbox and the prefilled subject', () => {
  assert.equal(ALPHA_REQUEST_SUBJECT, 'Advantage alpha testing request');
  assert.equal(SITE_FEEDBACK_EMAIL, 'advantageappllc@gmail.com');
  const href = alphaRequestMailto();
  assert.equal(href, `mailto:${SITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`);
  assert.doesNotMatch(href, new RegExp(WHITE_FREE_CODE, 'i'));
  assert.doesNotMatch(href, new RegExp(FULL_OWNER_UNLOCK_CODE, 'i'));
  for (const promo of WHITE_LAUNCH_PROMOS) {
    assert.doesNotMatch(href, new RegExp(promo.code, 'i'));
  }
});
