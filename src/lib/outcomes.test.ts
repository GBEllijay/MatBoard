import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boardIsEmpty,
  decideClockEnd,
  inferScoreReason,
  needsRefDecision,
  outcomeSplashLine,
  parseBoutOutcome,
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
    outcome: null as null,
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
        outcome: {
          side: 'blue',
          call: 'win',
          method: 'points',
          scoreReason: 'points',
          source: 'auto',
          at: 1,
        },
      }),
      false,
    );
  });
});

describe('parse helpers', () => {
  it('maps legacy tournament kinds into Win/DQ', () => {
    assert.deepEqual(parseBoutOutcome('win'), { call: 'win', method: 'points' });
    assert.deepEqual(parseBoutOutcome('score'), { call: 'win', method: 'points' });
    assert.deepEqual(parseBoutOutcome('submission'), { call: 'win', method: 'submission' });
    assert.deepEqual(parseBoutOutcome('dq'), { call: 'dq', reason: 'technical' });
    assert.deepEqual(parseBoutOutcome('tech'), { call: 'dq', reason: 'technical' });
    assert.equal(parseBoutOutcome('nope'), null);
  });

  it('restores a persisted points win', () => {
    const parsed = parseMatchOutcome({
      side: 'white',
      call: 'win',
      method: 'points',
      scoreReason: 'advantages',
      source: 'auto',
      at: 42,
    });
    assert.deepEqual(parsed, {
      side: 'white',
      call: 'win',
      method: 'points',
      scoreReason: 'advantages',
      source: 'auto',
      at: 42,
    });
  });

  it('migrates the previous match score method', () => {
    const parsed = parseMatchOutcome({
      side: 'blue',
      method: 'score',
      reason: 'penalties',
      source: 'auto',
      at: 7,
    });
    assert.deepEqual(parsed, {
      side: 'blue',
      call: 'win',
      method: 'points',
      scoreReason: 'penalties',
      source: 'auto',
      at: 7,
    });
  });

  it('migrates a bare submission and T-loss', () => {
    assert.equal(parseMatchOutcome({ side: 'blue', method: 'submission', source: 'manual', at: 1 })?.call, 'win');
    assert.equal(parseMatchOutcome({ side: 'blue', method: 'submission', source: 'manual', at: 1 })?.method, 'submission');
    const tloss = parseMatchOutcome({ side: 'white', method: 'tech', source: 'manual', at: 1 });
    assert.deepEqual(tloss && { call: tloss.call, reason: tloss.call === 'dq' ? tloss.reason : null }, {
      call: 'dq',
      reason: 'technical',
    });
  });

  it('infers a score reason only when that side actually leads', () => {
    const blue = { points: 2, advantages: 0, disadvantages: 0 };
    const white = { points: 0, advantages: 5, disadvantages: 0 };
    assert.equal(inferScoreReason('blue', blue, white), 'points');
    assert.equal(inferScoreReason('white', blue, white), undefined);
  });
});

describe('outcomeSplashLine', () => {
  it('names the win method, including auto points', () => {
    assert.equal(
      outcomeSplashLine({
        side: 'blue',
        call: 'win',
        method: 'points',
        scoreReason: 'advantages',
        source: 'auto',
        at: 1,
      }),
      'Winner by points',
    );
    assert.equal(
      outcomeSplashLine({
        side: 'white',
        call: 'win',
        method: 'submission',
        source: 'manual',
        at: 1,
      }),
      'Winner by submission',
    );
    assert.equal(
      outcomeSplashLine({
        side: 'blue',
        call: 'win',
        method: 'decision',
        source: 'manual',
        at: 1,
      }),
      'Winner by decision',
    );
  });

  it('names the disqualified athlete’s reason and never says loser', () => {
    const technical = outcomeSplashLine({
      side: 'white',
      call: 'dq',
      reason: 'technical',
      source: 'manual',
      at: 1,
    });
    const medical = outcomeSplashLine({
      side: 'blue',
      call: 'dq',
      reason: 'medical',
      source: 'manual',
      at: 1,
    });
    assert.equal(technical, 'Disqualified — Technical');
    assert.equal(medical, 'Disqualified — Medical');
    assert.equal(/loser/i.test(`${technical} ${medical}`), false);
  });
});
