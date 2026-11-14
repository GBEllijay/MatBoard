/**
 * feat/tier-buy-pages: one buy page per tier, built from the White /buy template.
 * Regression guards for every control touched (see the PR body).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STOREFRONT_BELT_LADDER } from './storefrontBelts.ts';
import { STOREFRONT_STEPS } from './storefront.ts';
import {
  INSTRUCTOR_DISPLAY_PRICE_CENTS,
  PRO_INCLUDES_ALL,
  TIER_BELT_CLOTH,
  TIER_BUY_PATHS,
  TIER_LADDER,
  higherTiers,
  tierEntry,
} from './tierBuyPages.ts';
import { LEARN_MORE } from './learnMore.ts';
import { EDITION_ALPHA_NOTE } from './productPrices.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../App.tsx');
const home = read('../pages/Home.tsx');
const buy = read('../pages/BuyWhite.tsx');
const edition = read('../pages/BuyEdition.tsx');
const media = read('../pages/MediaEdition.tsx');
const parts = read('../components/TierBuyParts.tsx');
const storefrontCss = read('../pages/storefront.css');
const tiersCss = read('../pages/buyTiers.css');
const studentMenus = read('../pages/student/StudentMenus.tsx');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('every tier has a Learn more label and a description page', () => {
  assert.equal(LEARN_MORE.white.label, 'Learn more about Advantage White');
  assert.equal(LEARN_MORE.white.to, '/buy');
  assert.equal(LEARN_MORE.student.label, 'Learn more about Student Edition');
  assert.equal(LEARN_MORE.student.to, '/editions/student');
  assert.equal(LEARN_MORE.media.label, 'Learn more about Media Edition');
  assert.equal(LEARN_MORE.media.to, '/editions/media');
  assert.equal(LEARN_MORE.instructor.label, 'Learn more about Instructor Edition');
  assert.equal(LEARN_MORE.instructor.to, '/editions/instructor');
  assert.equal(LEARN_MORE.pro.label, 'Learn more about Advantage Pro');
  assert.equal(LEARN_MORE.pro.to, '/editions/pro');
  assert.equal(LEARN_MORE.proCloud.label, 'Learn more about Advantage Pro + Cloud');
  assert.equal(LEARN_MORE.proCloud.to, '/editions/pro-cloud');
});

test('ladder order, names, belts and prices match the owner brief', () => {
  assert.deepEqual(
    TIER_LADDER.map((t) => [t.id, t.belt, t.price]),
    [
      ['white', 'white', '$9.99'],
      ['student', 'blue', '$19.99'],
      ['media', 'purple', '$29.99'],
      ['instructor', 'brown', '$49.99'],
      ['pro', 'black', '$99.99'],
    ],
  );
  assert.equal(tierEntry('instructor').name, 'Advantage Instructor Edition');
  assert.equal(INSTRUCTOR_DISPLAY_PRICE_CENTS, 4999);
  assert.equal(tierEntry('pro').includes, PRO_INCLUDES_ALL);
  assert.equal(PRO_INCLUDES_ALL, 'Includes all Advantage products.');
  assert.doesNotMatch(TIER_LADDER.map((t) => t.name).join(' '), /Advantage Coach/);
});

test('belt colors match the homepage ladder cloth', () => {
  assert.equal(TIER_BELT_CLOTH.blue, '#2a5cf0');
  assert.equal(TIER_BELT_CLOTH.purple, '#6b2d91');
  assert.equal(TIER_BELT_CLOTH.brown, '#6b3a1f');
  for (const [belt, hex] of Object.entries(TIER_BELT_CLOTH)) {
    assert.match(storefrontCss, new RegExp(`--sf-belt-${belt}: ${hex}`, 'i'), belt);
    assert.match(tiersCss, new RegExp(`\\.belt-tip--ladder\\.belt-tip--${belt} \\{[^}]*${hex}`, 'i'), belt);
  }
  // Ladder rungs and tier pages agree on the belt for each tier.
  // Pro Plus Cloud is a display card, not a tier buy page, so it is not in TIER_LADDER.
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.filter((r) => r.id !== 'pro-cloud').map((r) => r.belt),
    TIER_LADDER.map((t) => t.belt),
  );
  assert.equal(STOREFRONT_BELT_LADDER.at(-1)?.id, 'pro-cloud');
  assert.equal(STOREFRONT_BELT_LADDER.at(-1)?.belt, 'black');
});

test('higherTiers: only the tiers above, Pro has none', () => {
  assert.deepEqual(higherTiers('white').map((t) => t.id), ['student', 'media', 'instructor', 'pro']);
  assert.deepEqual(higherTiers('student').map((t) => t.id), ['media', 'instructor', 'pro']);
  assert.deepEqual(higherTiers('media').map((t) => t.id), ['instructor', 'pro']);
  assert.deepEqual(higherTiers('instructor').map((t) => t.id), ['pro']);
  assert.deepEqual(higherTiers('pro'), []);
});

test('tier paths route in App; gated /buy/* checkouts are untouched', () => {
  assert.deepEqual(TIER_BUY_PATHS, {
    white: '/buy',
    student: '/editions/student',
    media: '/media',
    instructor: '/editions/instructor',
    pro: '/editions/pro',
  });
  assert.match(app, /<Route path="\/editions\/student" element=\{<BuyStudentEditionPage \/>\} \/>/);
  assert.match(app, /<Route path="\/editions\/instructor" element=\{<BuyInstructorEditionPage \/>\} \/>/);
  assert.match(app, /<Route path="\/editions\/pro" element=\{<BuyProEditionPage \/>\} \/>/);
  assert.match(app, /path="\/buy" element=\{<BuyWhitePage \/>\}|path="\/buy"[\s\S]{0,80}BuyWhitePage/);
  // The guarded checkout routes keep their guards.
  assert.match(app, /path="\/buy\/student"\s*element=\{\s*<BuyStudentRoute>\s*<BuyStudentPage \/>\s*<\/BuyStudentRoute>/);
  assert.match(app, /path="\/buy\/coach"\s*element=\{\s*<CoachRoute>\s*<BuyCoachPage \/>\s*<\/CoachRoute>/);
  assert.match(app, /path="\/buy\/pro"\s*element=\{\s*<BuyProRoute>\s*<BuyProPage \/>\s*<\/BuyProRoute>/);
});

test('/buy keeps White checkout, promo, restore and Student checkout; higher tiers follow', () => {
  assert.match(buy, /<HigherTierList\s+from="white"/);
  assert.match(buy, /WHITE_CHECKOUT_API/);
  assert.match(buy, /restoreHref\(accessEmail\)/);
  assert.match(buy, /buy__restore/);
  assert.doesNotMatch(buy, /restoreWhiteByEmail/);
  assert.match(buy, /studentOpen \?/);
  assert.match(buy, /HalfOffCheckoutNote/);
  assert.doesNotMatch(buy, /<ComingSoonAd/);
});

test('Media page keeps the alpha line and can start Media checkout with optional Cloud', () => {
  assert.match(EDITION_ALPHA_NOTE, /^In alpha testing\. Email advantageappLLC@gmail\.com for a free alpha code\.$/i);
  assert.match(media, /<AlphaAccessNote note=\{EDITION_ALPHA_NOTE\} display=\{EDITION_EMAIL_DISPLAY\} \/>/);
  assert.match(media, /<AlphaCodeEntry tier="media" \/>/);
  assert.match(media, /<CloudAddonChoice/);
  assert.match(media, /product: 'media'/);
  assert.match(media, /<HigherTierList from="media" \/>/);
  assert.match(media, /to="\/restore"/);
});

test('Instructor and Pro public pages sell the one-time price with optional Cloud; Student checkout stays gated', () => {
  assert.match(edition, /const studentOpen = tier === 'student' && studentEditionEntitled\(/);
  assert.match(edition, /const sellTier = tier === 'instructor' \|\| tier === 'pro'/);
  assert.match(edition, /product: tier === 'instructor' \? 'coach' : tier === 'pro' \? 'pro' : 'student'/);
  assert.match(edition, /cloud: sellTier && includeCloud/);
  assert.match(edition, /<InstructorCloudCopy \/>/);
  assert.doesNotMatch(code(edition), /price_|STRIPE|stripe\.com/);
  assert.doesNotMatch(code(parts), /fetch\(WHITE_CHECKOUT_API/);
});

test('/products: locked Student, Instructor and Pro cards open their tier pages; Learn more is on every locked card only', () => {
  assert.match(home, /aria-label=\{`Advantage Student Edition, \$\{ALPHA_PRODUCT_STATUS\}`\}/);
  assert.match(home, /to=\{TIER_BUY_PATHS\.instructor\}\s*aria-label=\{`\$\{INSTRUCTOR_HOME_TITLE\}, \$\{ALPHA_PRODUCT_STATUS\}`\}/);
  assert.match(home, /aria-label=\{`Advantage Pro, \$\{ALPHA_PRODUCT_STATUS\}`\}/);
  assert.equal(home.match(/<LearnMoreLink tier="white" \/>/g)?.length, 1);
  assert.equal(home.match(/<LearnMoreLink tier="student" \/>/g)?.length, 2);
  assert.equal(home.match(/<LearnMoreLink tier="media" \/>/g)?.length, 1);
  assert.equal(home.match(/<LearnMoreLink tier="instructor" \/>/g)?.length, 1);
  assert.equal(home.match(/<LearnMoreLink tier="pro" \/>/g)?.length, 1);
  assert.equal(home.match(/<LearnMoreLink tier="proCloud" \/>/g)?.length ?? 0, 0);
  assert.match(home, /Try the demo/);
  assert.match(home, /Owner test unlock/);
  assert.doesNotMatch(home, /setSoon\(/);
});

test('homepage ladder opens tier pages; White and Media keep their wiring; picker stays on /products', () => {
  const to = Object.fromEntries(STOREFRONT_BELT_LADDER.map((r) => [r.id, r.to]));
  assert.equal(to.white, '/buy');
  assert.equal(to.academy, '/media');
  assert.equal(to.student, '/editions/student');
  assert.equal(to.coach, '/editions/instructor');
  assert.equal(to.pro, '/editions/pro');
  for (const s of STOREFRONT_STEPS) if (s.id !== 'white') assert.equal(s.to, '/products', s.id);
});

test('/student hub wears a blue BeltHeader "Advantage Student Edition"', () => {
  assert.match(studentMenus, /<BeltHeader kind="blue" title=\{STUDENT_EDITION_HUB_TITLE\} \/>/);
  const names = read('./productNames.ts');
  assert.match(names, /export const STUDENT_EDITION_HUB_TITLE = 'Advantage Student Edition';/);
  assert.match(read('../pages/student/hub.css'), /\.s-hub \.belt-header--blue \.belt-header__belt \{\s*--cloth: #2a5cf0;/);
});

test('tier pages import no Stripe, unlock-code, entitlement-write or OAuth module', () => {
  for (const src of [edition, parts, read('./tierBuyPages.ts')]) {
    assert.doesNotMatch(code(src), /from '[^']*(stripe|unlockCodes|codeRedeem'|entitlements|oauth|drive)[^']*'/i);
  }
});

// Regression (owner report 2026-10-31): Coach hub "Buy" opened the old Advantage Coach page.
test('Coach hub buy link opens the Instructor buy page; checkout product key stays coach', () => {
  const coach = readFileSync(new URL('../pages/Coach.tsx', import.meta.url), 'utf8');
  assert.match(coach, /to=\{TIER_BUY_PATHS\.instructor\}/);
  assert.doesNotMatch(coach, /Buy Advantage Coach/);
  const checkout = readFileSync(new URL('./checkoutProducts.ts', import.meta.url), 'utf8');
  assert.match(checkout, /coach: '\/buy\/coach'/);
});

test('TierRestoreCard links to /restore when signed out and posts when signed in', () => {
  assert.match(parts, /restoreHref\(email\)/);
  assert.match(parts, /startSignedInRestore/);
  assert.doesNotMatch(parts, /<form className="buy__card buy__restore"/);
});
