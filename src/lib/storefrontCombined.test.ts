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

test('combined homepage order: hero on top, existing middle sections, belt ladder at the bottom', () => {
  const hero = tsx.indexOf('<StorefrontHero');
  const board = tsx.indexOf('id="scoreboard"');
  const timer = tsx.indexOf('id="round-timer"');
  const ladder = tsx.indexOf('id="progression"');
  const footer = tsx.indexOf('<footer');
  for (const at of [hero, board, timer, ladder, footer]) assert.ok(at > 0);
  assert.ok(hero < board && board < timer && timer < ladder && ladder < footer);
});

test('hero e stacks the real round timer asset under the board', () => {
  assert.match(heroTsx, /const ROUND_TIMER = \{ src: '\/storefront\/round-timer\.png', width: 1280, height: 720 \}/);
  assert.match(heroTsx, /variant === 'e'/);
});

test('combined ladder strings and prices are final', () => {
  const rows = STOREFRONT_BELT_LADDER.map((r) => [r.belt, r.title, r.blurb, r.cardPrice]);
  assert.deepEqual(rows.map((r) => r[0]), ['white', 'blue', 'purple', 'brown', 'black']);
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
  assert.equal(byId.pro.cardPrice, '$99.99 + $5.99/mo');
  for (const r of STOREFRONT_BELT_LADDER) {
    if (r.id !== 'pro') assert.match(r.cardPrice ?? '', /one-time$/);
  }
});

test('every ladder card links somewhere that exists (no 404s)', () => {
  const byId = Object.fromEntries(STOREFRONT_BELT_LADDER.map((r) => [r.id, r]));
  assert.equal(byId.white.to, STOREFRONT_BUY_PATH);
  // Media Edition has no page yet: it uses the alpha-code email path until one is built.
  assert.equal(byId.academy.to, null);
  assert.match(tsx, /step\.to === null[\s\S]*href=\{alphaRequestMailto\(\)\}/);
  for (const r of STOREFRONT_BELT_LADDER) {
    if (r.to === null) continue;
    assert.ok([STOREFRONT_BUY_PATH, PRODUCTS_PATH].includes(r.to), `${r.id} -> ${r.to}`);
    assert.match(app, new RegExp(`path="${r.to}"`), `route ${r.to} exists`);
  }
});

test('Media purple matches the Pro gallery purple belt cloth', () => {
  const index = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');
  assert.match(index, /\.belt-header--purple \.belt-header__belt \{\s*--cloth: #6b2d91;/);
  assert.match(css, /#6b2d91/);
});
