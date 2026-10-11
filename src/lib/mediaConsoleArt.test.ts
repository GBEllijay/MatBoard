import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MEDIA_CONSOLE_ARTS, pickMediaConsoleArt } from './mediaConsoleArt.ts';

test('the Media Console header picker returns one of the three illustrations', () => {
  for (let i = 0; i < 24; i += 1) {
    assert.ok(MEDIA_CONSOLE_ARTS.includes(pickMediaConsoleArt(null)));
  }
});

test('the Media Console header picker does not repeat the last illustration', () => {
  for (const last of MEDIA_CONSOLE_ARTS) {
    for (let i = 0; i < 16; i += 1) {
      assert.notEqual(pickMediaConsoleArt(last), last);
    }
  }
  assert.equal(pickMediaConsoleArt(null, () => 0), 'tv');
  assert.equal(pickMediaConsoleArt('tv', () => 0), 'monitor');
  assert.equal(pickMediaConsoleArt('tv', () => 0.99), 'roster');
  assert.equal(pickMediaConsoleArt('monitor', () => 0), 'tv');
  assert.equal(pickMediaConsoleArt('not-a-variant', () => 0), 'tv');
});
