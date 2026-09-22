import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roundDisplay } from './roundDisplay.ts';

describe('roundDisplay', () => {
  it('omits an empty round instead of a placeholder', () => {
    assert.equal(roundDisplay('', false), '');
    assert.equal(roundDisplay('   ', false), '');
    assert.equal(roundDisplay('', true), '');
  });

  it('prefixes a gym round and leaves a linked label as typed', () => {
    assert.equal(roundDisplay('1', false), 'Round 1');
    assert.equal(roundDisplay(' Finals ', false), 'Round Finals');
    assert.equal(roundDisplay('Semifinals', true), 'Semifinals');
  });
});
