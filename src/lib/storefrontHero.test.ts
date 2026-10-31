import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_HERO_VARIANT, heroVariantOf } from './storefrontHero.ts';
import { preservesAppHomeQuery } from './submenuNav.ts';

test('hero variant comes from ?hero= and falls back to the default', () => {
  assert.equal(heroVariantOf('a'), 'a');
  assert.equal(heroVariantOf('B'), 'b');
  assert.equal(heroVariantOf(' c '), 'c');
  assert.equal(heroVariantOf(null), DEFAULT_HERO_VARIANT);
  assert.equal(heroVariantOf('z'), DEFAULT_HERO_VARIANT);
});

test('?hero= keeps the public storefront instead of redirecting to the app', () => {
  assert.equal(preservesAppHomeQuery(new URLSearchParams('hero=b')), false);
});
