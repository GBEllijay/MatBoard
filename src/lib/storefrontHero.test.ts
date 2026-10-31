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
  assert.equal(heroVariantOf(null), DEFAULT_HERO_VARIANT);
  assert.equal(heroVariantOf('z'), DEFAULT_HERO_VARIANT);
});

test('a, b and c stay selectable, d is added, and the default does not move', () => {
  assert.deepEqual([...HERO_VARIANTS], ['a', 'b', 'c', 'd']);
  assert.equal(DEFAULT_HERO_VARIANT, 'a');
  for (const v of HERO_VARIANTS) assert.match(tsx, new RegExp(`variant === '${v}'`));
});

test('?hero= keeps the public storefront instead of redirecting to the app', () => {
  assert.equal(preservesAppHomeQuery(new URLSearchParams('hero=b')), false);
  assert.equal(preservesAppHomeQuery(new URLSearchParams('hero=d')), false);
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

test('C on the mats: transparent hero, black text backdrop, timer kept off the scores', () => {
  assert.match(rule('.home.home--store .sf-hero.sfh--c'), /background: transparent/);
  assert.match(css, /\.sfh--c \.sfh-text \{[^}]*background: rgba\(0, 0, 0, 0\.6\);[^}]*backdrop-filter: blur\(8px\)/);
  assert.match(css, /\.sfh--c \.sfh-stage \{[^}]*padding-bottom: calc\(26\.5% \+ 30px\)/);
});
