import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STOREFRONT_BUY_PATH } from './storefront.ts';
import { DEFAULT_BELTS_VARIANT, STOREFRONT_BELT_LADDER, beltsVariantOf } from './storefrontBelts.ts';
import { DEFAULT_HERO_VARIANT, heroVariantOf } from './storefrontHero.ts';
import { PRODUCTS_PATH } from './productNames.ts';

const tsx = readFileSync(new URL('../pages/Storefront.tsx', import.meta.url), 'utf8');
const heroTsx = readFileSync(new URL('../pages/StorefrontHero.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('combined homepage: hero e and belts b are the defaults with no query params', () => {
  assert.equal(DEFAULT_HERO_VARIANT, 'e');
  assert.equal(heroVariantOf(null), 'e');
  assert.equal(DEFAULT_BELTS_VARIANT, 'b');
  assert.equal(beltsVariantOf(null), 'b');
});

test('combined homepage order: hero, scoreboard art, round timer art, mock tournament card, footer', () => {
  const hero = tsx.indexOf('<StorefrontHero');
  const board = tsx.indexOf('id="scoreboard"');
  const timer = tsx.indexOf('id="round-timer"');
  const brackets = tsx.indexOf('id="brackets"');
  const footer = tsx.indexOf('<footer');
  for (const at of [hero, board, timer, brackets, footer]) assert.ok(at > 0);
  assert.ok(hero < board && board < timer && timer < brackets && brackets < footer);
  assert.equal(tsx.includes('id="progression"'), false);
  assert.doesNotMatch(tsx, /STOREFRONT_BELT_LADDER/);
  assert.doesNotMatch(tsx, /Start with White\. Grow into Pro\./);
  assert.match(tsx, /STOREFRONT_WOODBLOCKS\.brackets/);
});

test('hero e stacks the real round timer asset under the board', () => {
  assert.match(heroTsx, /const ROUND_TIMER = \{ src: '\/storefront\/round-timer\.png', width: 1280, height: 720 \}/);
  assert.match(heroTsx, /variant === 'e'/);
});

test('combined ladder strings and prices are final', () => {
  const rows = STOREFRONT_BELT_LADDER.map((r) => [r.belt, r.title, r.blurb, r.cardPrice]);
  assert.deepEqual(rows.map((r) => r[0]), ['white', 'blue', 'purple', 'brown', 'black', 'black']);
  const byId = Object.fromEntries(STOREFRONT_BELT_LADDER.map((r) => [r.id, r]));
  assert.equal(byId.white.blurb, 'BJJ scoreboard and round timer.');
  assert.equal(byId.white.cardPrice, '$9.99 one-time');
  assert.equal(byId.white.status, 'Available now');
  assert.equal(byId.student.blurb, 'Personal BJJ Training Journal and More.');
  assert.equal(byId.student.cardPrice, '$19.99 one-time');
  assert.equal(byId.academy.title, 'Advantage Media Edition');
  assert.equal(byId.academy.blurb, 'Scoreboard, round timer, and media console.');
  assert.equal(byId.academy.cardPrice, '$29.99 one-time');
  assert.equal(byId.coach.title, 'Advantage Instructor Edition');
  assert.equal(byId.coach.blurb, 'Daily lesson plans, videos, and enhanced training tools.');
  assert.equal(byId.coach.cardPrice, '$49.99 one-time');
  assert.equal(byId.pro.blurb, 'Academy Enhancement Software for Gym Owners and Jiu-Jitsu Professionals.');
  assert.equal(byId.pro.cardPrice, '$99.99 one-time');
  assert.equal(byId.pro.detail, 'Requires your own Google Drive or OneDrive. Advantage does not host it.');
  assert.equal(byId['pro-cloud'].title, 'Advantage Pro + Cloud');
  assert.equal(byId['pro-cloud'].cardPrice, '$5.99/month');
  assert.equal(byId['pro-cloud'].to, '/editions/pro-cloud');
  assert.equal(byId.coach.detail, 'Requires gym setup with a third-party drive (Google Drive or OneDrive). Advantage does not host it.');
  for (const r of STOREFRONT_BELT_LADDER) {
    if (r.id !== 'pro' && r.id !== 'pro-cloud') assert.match(r.cardPrice ?? '', /one-time$/);
  }
});

test('every ladder card links somewhere that exists (no 404s)', () => {
  const byId = Object.fromEntries(STOREFRONT_BELT_LADDER.map((r) => [r.id, r]));
  assert.equal(byId.white.to, STOREFRONT_BUY_PATH);
  // Media Edition opens its own public page (not for sale; the page's CTA is the alpha-code email).
  assert.equal(byId.academy.to, '/media');
  // The public homepage no longer renders the belt ladder; destinations still have routes.
  for (const r of STOREFRONT_BELT_LADDER) {
    if (r.to === null) continue;
    assert.ok(
      [STOREFRONT_BUY_PATH, PRODUCTS_PATH, '/media', '/editions/student', '/editions/instructor', '/editions/pro', '/editions/pro-cloud'].includes(r.to),
      `${r.id} -> ${r.to}`,
    );
    const routed = r.to === '/media' ? /<Route path=\{MEDIA_EDITION_PATH\}/ : new RegExp(`path="${r.to}"`);
    assert.match(app, routed, `route ${r.to} exists`);
  }
});

test('Media purple matches the Pro gallery purple belt cloth', () => {
  const index = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');
  assert.match(index, /\.belt-header--purple \.belt-header__belt \{\s*--cloth: #6b2d91;/);
  assert.match(css, /#6b2d91/);
});

test('the public homepage header renders AccountLink at the top right', () => {
  const css = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');
  const products = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
  assert.match(tsx, /import \{ AccountLink \} from '\.\.\/components\/AccountLink'/);
  const pin = tsx.indexOf('className="sf-pin"');
  const account = tsx.indexOf('<AccountLink');
  const hero = tsx.indexOf('<StorefrontHero');
  assert.ok(pin > 0 && account > pin && account < hero, 'AccountLink sits in the storefront header, above the hero');
  assert.match(tsx, /<AccountLink className="sf-signin" \/>/);
  // AccountLink already goes to /account. ACCOUNT_SIGN_IN_FROM_HOME would return to /products.
  assert.doesNotMatch(tsx, /to=\{ACCOUNT_SIGN_IN_FROM_HOME\}/);
  assert.match(css, /\.home\.home--store \.sf-signin \{[\s\S]*position: absolute;[\s\S]*right: 20px;/);
  assert.match(css, /@media \(min-width: 601px\) \{[\s\S]*\.sf-signin \{[\s\S]*right: 40px;/);
  // /products keeps its existing AccountLink and is otherwise unchanged by this work.
  assert.match(products, /<AccountLink \/>/);
  assert.doesNotMatch(products, /sf-signin/);
});
