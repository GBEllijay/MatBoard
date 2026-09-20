import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boardIsEmpty,
  decideClockEnd,
  inferScoreReason,
  needsRefDecision,
  parseBoutOutcomeKind,
  parseMatchOutcome,
} from './outcomes.ts';

const zero = { points: 0, advantages: 0, disadvantages: 0 };

describe('decideClockEnd', () => {
  it('does not invent a winner on an empty board', () => {
    assert.equal(boardIsEmpty(zero, zero), true);
    assert.deepEqual(decideClockEnd(zero, zero), { kind: 'ref' });
  });

  it('awards the side with more points', () => {
    assert.deepEqual(
      decideClockEnd({ ...zero, points: 2 }, { ...zero, points: 4, advantages: 3 }),
      { kind: 'winner', side: 'white', reason: 'points' },
    );
    assert.deepEqual(
      decideClockEnd({ ...zero, points: 4 }, { ...zero, points: 2, advantages: 9 }),
      { kind: 'winner', side: 'blue', reason: 'points' },
    );
  });

  it('breaks a points tie with advantages', () => {
    assert.deepEqual(
      decideClockEnd({ points: 2, advantages: 1, disadvantages: 2 }, { points: 2, advantages: 0, disadvantages: 0 }),
      { kind: 'winner', side: 'blue', reason: 'advantages' },
    );
  });

  it('breaks a points+adv tie with fewer penalties', () => {
    assert.deepEqual(
      decideClockEnd({ points: 0, advantages: 0, disadvantages: 2 }, { points: 0, advantages: 0, disadvantages: 1 }),
      { kind: 'winner', side: 'white', reason: 'penalties' },
    );
  });

  it('asks for a referee when scores are fully tied', () => {
    const tied = { points: 4, advantages: 1, disadvantages: 1 };
    assert.deepEqual(decideClockEnd(tied, tied), { kind: 'ref' });
  });
});

describe('needsRefDecision', () => {
  const ended = {
    autoAnnounce: true,
    remainingMs: 0,
    running: false,
    outcome: null,
    blue: zero,
    white: zero,
  };

  it('is true for an empty board when auto-announce is on', () => {
    assert.equal(needsRefDecision(ended), true);
  });

  it('is false when auto-announce is off', () => {
    assert.equal(needsRefDecision({ ...ended, autoAnnounce: false }), false);
  });

  it('is false when a winner is already recorded', () => {
    assert.equal(
      needsRefDecision({
        ...ended,
        blue: { ...zero, points: 2 },
        outcome: { side: 'blue', method: 'score', reason: 'points', source: 'auto', at: 1 },
      }),
      false,
    );
  });
});

describe('parse helpers', () => {
  it('maps legacy tournament win to score', () => {
    assert.equal(parseBoutOutcomeKind('win'), 'score');
    assert.equal(parseBoutOutcomeKind('submission'), 'submission');
    assert.equal(parseBoutOutcomeKind('nope'), null);
  });

  it('restores a persisted match outcome', () => {
    const parsed = parseMatchOutcome({
      side: 'white',
      method: 'score',
      reason: 'advantages',
      source: 'auto',
      at: 42,
    });
    assert.deepEqual(parsed, {
      side: 'white',
      method: 'score',
      reason: 'advantages',
      source: 'auto',
      at: 42,
    });
  });

  it('infers a score reason only when that side actually leads', () => {
    const blue = { points: 2, advantages: 0, disadvantages: 0 };
    const white = { points: 0, advantages: 5, disadvantages: 0 };
    assert.equal(inferScoreReason('blue', blue, white), 'points');
    assert.equal(inferScoreReason('white', blue, white), undefined);
  });
});
