import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  STOREFRONT_BRACKETS,
  STOREFRONT_TIMER,
  STOREFRONT_WOODBLOCKS,
} from './storefront.ts';
import { WHITE_BUY_PATH, WHITE_PRICE_LABEL } from './whitePurchase.ts';

test('storefront sells White once and sends Buy Now to the existing checkout', () => {
  assert.equal(STOREFRONT_PRICE_LABEL, '$19.99');
  assert.equal(STOREFRONT_PRICE_LABEL, WHITE_PRICE_LABEL);
  assert.equal(STOREFRONT_BUY_PATH, '/buy');
  assert.equal(STOREFRONT_BUY_PATH, WHITE_BUY_PATH);
  assert.equal(STOREFRONT_BUY_LABEL, 'Buy Advantage BJJ Scoreboard — $19.99');
  assert.equal(STOREFRONT_HERO.title, 'Win by Advantage.');
  assert.equal(STOREFRONT_HERO.clock, '05:00');
  assert.equal(STOREFRONT_HERO.leadBeforeBreak, 'Your Scoreboard, Round Timer and Mock Tournament Software.');
  assert.equal(STOREFRONT_HERO.leadAfterBreak, 'Cast to your TV from your phone or PC.');
  assert.equal(
    `${STOREFRONT_HERO.leadBeforeBreak} ${STOREFRONT_HERO.leadAfterBreak}`,
    'Your Scoreboard, Round Timer and Mock Tournament Software. Cast to your TV from your phone or PC.',
  );
});

test('Pass 2 sections use the approved copy and woodblocks', () => {
  assert.equal(STOREFRONT_PROGRESS_EYEBROW, 'Progression');
  assert.equal(STOREFRONT_PROGRESS_HEADING, 'Start with White. Grow into Pro.');
  assert.equal(STOREFRONT_ALPHA_NOTE, 'Student, Instructor Edition and Pro are in alpha testing.');
  assert.deepEqual(
    STOREFRONT_NAV.map((item) => item.label),
    ['Scoreboard', 'Round timer', 'Brackets'],
  );
  assert.deepEqual(
    STOREFRONT_NAV.map((item) => item.href),
    ['/white#scoreboard', '/white#round-timer', '/white#brackets'],
  );
  assert.equal(
    STOREFRONT_NAV.some((item) => /mock tournament/i.test(item.label)),
    false,
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
  assert.equal(STOREFRONT_BRACKETS.eyebrow, 'Brackets');
  assert.equal(STOREFRONT_BRACKETS.title, 'Mock tournament');
  assert.match(STOREFRONT_BRACKETS.body, /Build a bracket from your roster/);
  assert.match(STOREFRONT_BRACKETS.body, /mock tournaments/);
  assert.doesNotMatch(STOREFRONT_BRACKETS.body, /official|sanctioned|IBJJF|franchise/i);
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.webp, '/homepage/woodblock-scoreboard.webp');
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.jpg, '/homepage/woodblock-scoreboard.jpg');
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.width, 1280);
  assert.equal(STOREFRONT_WOODBLOCKS.scoreboard.height, 720);
  assert.match(STOREFRONT_WOODBLOCKS.scoreboard.alt, /Advantage scoreboard runs on the wall TV/);
  assert.equal(STOREFRONT_WOODBLOCKS.timer.webp, '/homepage/woodblock-timer.webp');
  assert.equal(STOREFRONT_WOODBLOCKS.timer.jpg, '/homepage/woodblock-timer.jpg');
  assert.match(STOREFRONT_WOODBLOCKS.timer.alt, /Advantage round timer runs on the wall TV/);
  assert.equal(STOREFRONT_WOODBLOCKS.brackets.webp, '/homepage/woodblock-brackets.webp');
  assert.equal(STOREFRONT_WOODBLOCKS.brackets.jpg, '/homepage/woodblock-brackets.jpg');
  assert.equal(STOREFRONT_WOODBLOCKS.brackets.width, 1280);
  assert.equal(STOREFRONT_WOODBLOCKS.brackets.height, 720);
  assert.match(STOREFRONT_WOODBLOCKS.brackets.alt, /Advantage bracket runs on the wall TV/);
  assert.doesNotMatch(STOREFRONT_WOODBLOCKS.scoreboard.jpg, /hero-still|hero-poster/);
  assert.doesNotMatch(STOREFRONT_WOODBLOCKS.timer.jpg, /hero-still|hero-poster/);
  assert.doesNotMatch(STOREFRONT_WOODBLOCKS.brackets.jpg, /hero-still|hero-poster/);
});

test('the three owner CTAs open the pre-Pass-2 picker and nothing else', () => {
  assert.deepEqual(
    STOREFRONT_PICKER_LINKS.map((link) => link.label),
    ['Start with White. Grow into Pro.', 'Advantage – Student Edition', 'Advantage Instructor Edition'],
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
    ['Advantage – Student Edition', 'Advantage Instructor Edition', 'Advantage Pro'],
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
  assert.equal(STOREFRONT_COMING_SOON[1]?.price, '$49.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[2]?.price, '$99.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[2]?.cardPrice, '$99.99 one-time');
  assert.equal(STOREFRONT_COMING_SOON[0]?.blurb, 'A personal BJJ training journal.');
  assert.equal(
    STOREFRONT_COMING_SOON[1]?.blurb,
    'Daily lesson plans, training videos and a technique tree. Includes Advantage BJJ Scoreboard.',
  );
  assert.match(STOREFRONT_COMING_SOON[2]?.blurb ?? '', /shared drive/);
  assert.match(STOREFRONT_COMING_SOON[2]?.blurb ?? '', /Includes Instructor Edition/);
  assert.equal(STOREFRONT_COMING_SOON[0]?.status, 'This product is in alpha');
  assert.equal(STOREFRONT_COMING_SOON[1]?.status, 'This product is in alpha');
  assert.equal(STOREFRONT_COMING_SOON[2]?.status, 'This product is in alpha');
  assert.equal(STOREFRONT_COMING_SOON.some((item) => item.forSale), false);
  assert.match(STUDENT_HOME_DESCRIPTION, /rank and stripes/);
  assert.match(COACH_HOME_DESCRIPTION, /everything in Media, Student and Advantage BJJ Scoreboard/);
  assert.match(PRO_HOME_LINES.join(' '), /Includes all Advantage products\./);
  assert.notEqual(STOREFRONT_COMING_SOON[0]?.blurb, STUDENT_HOME_DESCRIPTION);
});

test('alpha requests keep the existing inbox and the prefilled subject', () => {
  assert.equal(ALPHA_REQUEST_SUBJECT, 'Advantage alpha testing request');
  assert.equal(SITE_FEEDBACK_EMAIL, 'advantageappllc@gmail.com');
  const href = alphaRequestMailto();
  assert.equal(href, `mailto:${SITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`);
  assert.equal(href.startsWith('mailto:advantageappllc@gmail.com?subject='), true);
});

test('phone-width storefront nav keeps Scoreboard, Round timer, and Brackets on one line', () => {
  const css = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');
  assert.match(css, /\.home\.home--store \.sf-nav-links \{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(css, /\.home\.home--store \.sf-nav-links a \{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /@media \(max-width: 600px\) \{\s*\.home\.home--store \.sf-nav-links \{[^}]*gap:\s*8px/s);
});

test('the homepage footer has an Alpha testers link to /products and a 44px tap target', () => {
  const page = readFileSync(new URL('../pages/Storefront.tsx', import.meta.url), 'utf8');
  assert.match(page, /to=\{PRODUCTS_PATH\}>Alpha testers</);
  assert.match(page, /to="\/privacy">Privacy Policy</);
  assert.match(page, /to="\/terms">Terms of Service</);
  const css = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');
  assert.match(css, /\.home\.home--store \.sf-footer-links a \{[^}]*min-height:\s*44px/s);
});

test('the homepage hero has a plain Coming soon to the App Store line, not a badge or link', () => {
  const hero = readFileSync(new URL('../pages/StorefrontHero.tsx', import.meta.url), 'utf8');
  assert.match(hero, /<p className="sfh-appstore">Coming soon to the App Store<\/p>/);
  assert.doesNotMatch(hero, /apps\.apple\.com|App Store badge|Download on the App Store/i);
  const around = hero.slice(hero.indexOf('sfh-appstore') - 80, hero.indexOf('sfh-appstore') + 80);
  assert.doesNotMatch(around, /<Link[^>]*>Coming soon to the App Store/);
});

test('the homepage hero has no Student Edition or other edition CTAs, and See how it works scrolls the page', () => {
  const hero = readFileSync(new URL('../pages/StorefrontHero.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../pages/Storefront.tsx', import.meta.url), 'utf8');
  assert.match(hero, /See how it works ↓/);
  assert.match(hero, /href="#scoreboard"/);
  assert.doesNotMatch(hero, /Open Student Edition|studentUnlocked|Advantage Pro|Instructor Edition/);
  assert.doesNotMatch(page, /useStudentEditionUnlocked|Open Student Edition|Instructor Edition|Advantage Pro/);
  const css = readFileSync(new URL('../pages/storefrontHero.css', import.meta.url), 'utf8');
  assert.match(css, /\.home\.home--store \.sfh-links \{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.home\.home--store \.sfh-more \{[^}]*min-height:\s*44px/s);
});
