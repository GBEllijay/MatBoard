import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_HERO_VARIANT, HERO_VARIANTS, heroVariantOf } from './storefrontHero.ts';
import { preservesAppHomeQuery } from './submenuNav.ts';

const css = readFileSync(new URL('../pages/storefrontHero.css', import.meta.url), 'utf8');
const tsx = readFileSync(new URL('../pages/StorefrontHero.tsx', import.meta.url), 'utf8');

/** Body of the first rule whose selector line ends with `selector {`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing rule ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

test('hero variant comes from ?hero= and falls back to the default', () => {
  assert.equal(heroVariantOf('a'), 'a');
  assert.equal(heroVariantOf('B'), 'b');
  assert.equal(heroVariantOf(' c '), 'c');
  assert.equal(heroVariantOf('d'), 'd');
  assert.equal(heroVariantOf(' D '), 'd');
  assert.equal(heroVariantOf('e'), 'e');
  assert.equal(heroVariantOf(' E '), 'e');
  assert.equal(heroVariantOf(null), DEFAULT_HERO_VARIANT);
  assert.equal(heroVariantOf('z'), DEFAULT_HERO_VARIANT);
});

test('a, b, c and d stay selectable, and e (mats + board + timer) is the default', () => {
  assert.deepEqual([...HERO_VARIANTS], ['a', 'b', 'c', 'd', 'e']);
  assert.equal(DEFAULT_HERO_VARIANT, 'e');
  assert.equal(heroVariantOf(null), 'e');
  assert.equal(heroVariantOf(''), 'e');
  assert.equal(heroVariantOf('a'), 'a');
  for (const v of HERO_VARIANTS) assert.match(tsx, new RegExp(`variant === '${v}'`));
});

test('?hero= keeps the public storefront instead of redirecting to the app', () => {
  assert.equal(preservesAppHomeQuery(new URLSearchParams('hero=b')), false);
  assert.equal(preservesAppHomeQuery(new URLSearchParams('hero=d')), false);
  assert.equal(preservesAppHomeQuery(new URLSearchParams('hero=e')), false);
});

test('B v2 (d): headline outside the board, no duplicate paragraph, real round timer', () => {
  const d = tsx.slice(tsx.indexOf("variant === 'd'"));
  assert.match(d, /<RevealCopy \/>/);
  assert.doesNotMatch(d, /sfh-frame--caption/);
  const reveal = tsx.slice(tsx.indexOf('function RevealCopy'), tsx.indexOf('function Copy'));
  assert.doesNotMatch(reveal, /STOREFRONT_HERO\.sub/);
  assert.match(tsx, /round-timer-live\.png/);
});

test('B v2 (d): board is never faded, and the tablet sits outside the board', () => {
  assert.match(rule('.home.home--store .sfh-frame--board'), /mask-image: none/);
  assert.match(rule('.home.home--store .sfh-frame--board'), /opacity: 1/);
  assert.match(rule('.home.home--store .sfh--d .sfh-tablet'), /left: calc\(100% \+ 32px\)/);
  assert.match(rule('.home.home--store .sfh-tablet'), /display: none/);
});

test('B v2 (d): entrance runs once and only without reduced motion', () => {
  assert.doesNotMatch(css, /infinite/);
  const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.match(motion, /sfh-d-in 700ms cubic-bezier\(0\.2, 0\.7, 0\.2, 1\) both/);
  assert.match(motion, /sfh-d-in 700ms cubic-bezier\(0\.2, 0\.7, 0\.2, 1\) 120ms both/);
});

test('C on the mats: transparent hero, black text backdrop, stacked app cards behind the board', () => {
  assert.match(rule('.home.home--store .sf-hero.sfh--c'), /background: transparent/);
  assert.match(css, /\.sfh--c \.sfh-text \{[^}]*background: rgba\(0, 0, 0, 0\.6\);[^}]*backdrop-filter: blur\(8px\)/);
  const c = tsx.slice(tsx.indexOf("variant === 'c'"), tsx.indexOf("variant === 'd'"));
  // Back to front: journal card, brackets card, TV, then the timer over Competitor 2's row.
  const order = ['sfh-card--journal', 'sfh-card--brackets', 'sfh-tv', 'sfh-frame--timer'].map((k) => c.indexOf(k));
  assert.ok(order.every((n) => n > -1), 'C stack is complete');
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.match(tsx, /brackets-live\.png/);
  assert.match(tsx, /journal-live\.png/);
  assert.match(rule('.home.home--store .sfh-card--brackets'), /z-index: 1/);
  assert.match(rule('.home.home--store .sfh-card--journal'), /z-index: 0/);
  assert.match(css, /\.sfh--c \.sfh-tv \{\s*z-index: 2;/);
  assert.match(css, /\.sfh--c \.sfh-frame--timer \{\s*z-index: 3;[^}]*left: 48%;[^}]*margin-top: 29%;/);
  // The board itself is never dimmed; only the cards behind it are.
  assert.doesNotMatch(rule('.home.home--store .sfh-frame--tv'), /filter|opacity/);
});

test('E: board and the whole black round timer stacked as two equal 16:9 blocks on the mats, no cards', () => {
  const e = tsx.slice(tsx.indexOf("variant === 'e'"));
  assert.equal((e.match(/className="sfh-block/g) ?? []).length, 2);
  assert.match(e, /<Shot shot=\{SCOREBOARD\}[^>]*className="sfh-frame--block"/);
  assert.match(e, /<Shot shot=\{ROUND_TIMER\}[^>]*className="sfh-frame--block"/);
  assert.match(tsx, /const ROUND_TIMER = \{ src: '\/storefront\/round-timer\.png', width: 1280, height: 720 \}/);
  assert.doesNotMatch(e, /ROUND_TIMER_LIVE|sfh-timer-label|sfh-frame--wide|<Card /);
  assert.doesNotMatch(css, /sfh-timer-label|sfh-frame--wide/);
  assert.match(e, /<Copy \/>/);
  assert.match(rule('.home.home--store .sf-hero.sfh--e'), /background: transparent/);
  assert.match(css, /\.sfh--e \.sfh-text \{[^}]*background: rgba\(0, 0, 0, 0\.6\);/);
  assert.match(rule('.home.home--store .sfh--e .sfh-stage'), /flex-direction: column;[^}]*gap: 14px;/);
  // Neither block is cropped: both frames keep the shared 16:9 ratio and the stage is narrowed instead.
  assert.match(rule('.home.home--store .sfh-frame'), /aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.sfh--e \.sfh-stage \{\s*width: 76%;/);
  assert.match(css, /\.sfh--e \.sfh-stage \{\s*width: min\(100%, 300px\);/);
});
