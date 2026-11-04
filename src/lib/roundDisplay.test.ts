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
    assert.equal(roundDisplay('Semifinals', true), 'Semifinals');
  });

  it('does not double a typed Round and leaves named rounds unprefixed', () => {
    assert.equal(roundDisplay('Round 1', false), 'Round 1');
    assert.equal(roundDisplay('round 1', false), 'Round 1');
    assert.equal(roundDisplay('Round Round 1', false), 'Round 1');
    assert.equal(roundDisplay('Semifinal', false), 'Semifinal');
    assert.equal(roundDisplay('Final', false), 'Final');
    assert.equal(roundDisplay('Quarterfinal', false), 'Quarterfinal');
    assert.equal(roundDisplay('Round Semifinal', false), 'Semifinal');
    assert.equal(roundDisplay('Finals', false), 'Finals');
    assert.equal(roundDisplay('Open', false), 'Round Open');
  });

  it('keeps the scoreboard round menu labels alongside typed-round cleanup', () => {
    assert.equal(roundDisplay('1', false), 'Round 1');
    assert.equal(roundDisplay('Third place', false), 'Third place');
    assert.equal(roundDisplay('Superfight', false), 'Superfight');
    assert.equal(roundDisplay('Superfight', true), 'Superfight');
    assert.equal(roundDisplay('Round 2', false), 'Round 2');
    assert.equal(roundDisplay('Semifinal', true), 'Semifinal');
  });
});
