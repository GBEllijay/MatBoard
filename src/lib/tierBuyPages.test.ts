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

test('ladder order, names, belts and prices match the owner brief', () => {
  assert.deepEqual(
    TIER_LADDER.map((t) => [t.id, t.belt, t.price]),
    [
      ['white', 'white', '$9.99'],
      ['student', 'blue', '$19.99'],
      ['media', 'purple', '$29.99'],
      ['instructor', 'brown', '$49.99'],
      ['pro', 'black', '$99.99 + $5.99/mo'],
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
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.belt),
    TIER_LADDER.map((t) => (t.belt === 'black' ? 'black' : t.belt)),
  );
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
  assert.match(buy, /restoreWhiteByEmail|TierRestoreCard|buy__restore/);
  assert.match(buy, /studentOpen \?/);
  assert.match(buy, /HalfOffCheckoutNote/);
  assert.doesNotMatch(buy, /<ComingSoonAd/);
});

test('Media page: EDITION alpha line, restore link, then Instructor and Pro only; still not for sale', () => {
  assert.match(EDITION_ALPHA_NOTE, /^In alpha testing\. Email advantageappLLC@gmail\.com for a free alpha code\.$/i);
  assert.match(media, /<AlphaAccessNote note=\{EDITION_ALPHA_NOTE\} display=\{EDITION_EMAIL_DISPLAY\} \/>/);
  assert.match(media, /<HigherTierList from="media" \/>/);
  assert.match(media, /to="\/restore"/);
  assert.doesNotMatch(code(media), /checkout|stripe|fetch\(/i);
});

test('Instructor and Pro pages have no checkout; Student checkout only when entitled', () => {
  assert.match(edition, /const studentOpen = tier === 'student' && studentEditionEntitled\(/);
  assert.match(edition, /if \(studentPending \|\| !studentOpen\) return;/);
  assert.match(edition, /\{studentOpen \? \(\s*<form/);
  // The only checkout call is the Student one; product kind is the existing student product.
  assert.equal(code(edition).match(/fetch\(/g)?.length, 1);
  assert.doesNotMatch(code(edition), /price_|STRIPE|stripe\.com/);
  assert.doesNotMatch(code(parts), /fetch\(WHITE_CHECKOUT_API/);
});

test('/products: locked Student, Instructor and Pro cards open their tier pages; sheets stay reachable', () => {
  assert.match(home, /<Link className="mode-card__hit" to=\{TIER_BUY_PATHS\.student\} aria-label="Advantage Student Edition, coming soon" \/>/);
  assert.match(home, /to=\{TIER_BUY_PATHS\.instructor\}\s*aria-label=\{`\$\{INSTRUCTOR_HOME_TITLE\}, coming soon`\}/);
  assert.match(home, /<Link className="mode-card__hit" to=\{TIER_BUY_PATHS\.pro\} aria-label="Advantage Pro, coming soon" \/>/);
  assert.match(home, /onClick=\{onSoon\}>\s*Learn more about Student Edition/);
  assert.equal(home.match(/setSoon\('coach'\)\}>\s*Learn more about Instructor Edition/g)?.length, 2);
  assert.equal(home.match(/setSoon\('pro'\)\}>\s*Learn more about Advantage Pro/g)?.length, 2);
  assert.match(home, /Try the demo/);
  assert.match(home, /Owner test unlock/);
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
