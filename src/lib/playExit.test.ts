import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAY_EXIT_HOLD_MS,
  PLAY_EXIT_HOME,
  playExitDestination,
  playExitKeepsParentExit,
  playExitLabel,
} from './playExit.ts';

test('short press keeps the parent page', () => {
  assert.equal(playExitDestination('/slideshow?folder=gallery', false), '/slideshow?folder=gallery');
  assert.equal(playExitDestination('/white', false), '/white');
  assert.equal(playExitDestination('/schedule', false), '/schedule');
  assert.equal(playExitKeepsParentExit('/pro', false), true);
});

test('long press goes home and skips the parent exit', () => {
  assert.equal(PLAY_EXIT_HOME, '/products');
  assert.equal(playExitDestination('/schedule', true), '/products');
  assert.equal(playExitDestination('/slideshow?folder=gallery', true), '/products');
  assert.equal(playExitDestination('/white', true), '/products');
  assert.equal(playExitKeepsParentExit('/schedule', true), false);
  assert.equal(playExitKeepsParentExit('/slideshow?folder=gallery', true), false);
});

test('long press on a mark that already goes home keeps that exit', () => {
  assert.equal(playExitDestination('/products', true), '/products');
  assert.equal(playExitKeepsParentExit('/products', true), true);
  assert.equal(playExitLabel('/products'), 'Home');
});

test('corner mark names back and hold-for-home when the parent is not home', () => {
  assert.equal(playExitLabel('/white'), 'Back. Hold for Home.');
  assert.equal(playExitLabel('/slideshow?folder=gallery'), 'Back. Hold for Home.');
  assert.ok(PLAY_EXIT_HOLD_MS >= 400);
  assert.ok(PLAY_EXIT_HOLD_MS < 1000);
});
