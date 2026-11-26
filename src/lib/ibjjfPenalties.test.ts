import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADULT_PENALTY_DQ,
  applyPenaltyDelta,
  isKidsPenaltyLadder,
  KIDS_PENALTY_DQ,
  penaltyDqThreshold,
  penaltyLadderFor,
} from './ibjjfPenalties.ts';
import { decideClockEnd } from './outcomes.ts';

test('penaltyLadderFor distinguishes Adults/Juvenile (16+) from Kids under 15 divisions and skins', () => {
  assert.equal(penaltyLadderFor({ division: '' }), 'adult');
  assert.equal(penaltyLadderFor({ division: 'Adult Blue Belt' }), 'adult');
  assert.equal(penaltyLadderFor({ division: 'Master 1 Purple' }), 'adult');
  assert.equal(penaltyLadderFor({ division: 'Juvenile 1 Blue' }), 'adult');
  assert.equal(penaltyDqThreshold('adult'), ADULT_PENALTY_DQ);

  assert.equal(penaltyLadderFor({ division: 'Kids 2 White' }), 'kids');
  assert.equal(penaltyLadderFor({ division: 'Pee Wee' }), 'kids');
  assert.equal(penaltyLadderFor({ division: 'Infanto-Juvenil' }), 'kids');
  assert.equal(penaltyLadderFor({ division: 'Youth No-Gi' }), 'kids');
  assert.equal(penaltyLadderFor({ division: 'U15 Open' }), 'kids');
  assert.equal(penaltyLadderFor({ skin: 'kids-arcade' }), 'kids');
  assert.equal(penaltyLadderFor({ skin: 'kids-sticker' }), 'kids');
  assert.equal(penaltyLadderFor({ kidsRules: true, division: '' }), 'kids');
  assert.equal(penaltyLadderFor({ kidsBracketActive: true, division: 'Spring Open' }), 'kids');
  assert.equal(isKidsPenaltyLadder({ kidsBracketActive: true, division: 'Adult Blue' }), false);
  assert.equal(penaltyDqThreshold('kids'), KIDS_PENALTY_DQ);
});

test('Adult / Juvenile (16+) IBJJF penalty ladder: 1 marked, 2 +1 adv, 3 +2 pts, 4 DQ, and -1 reverses', () => {
  let pen = 0;
  let oppPts = 0;
  let oppAdv = 0;

  // 1st penalty: marked only
  let step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: 1 });
  assert.deepEqual(step, { penalties: 1, opponentPoints: 0, opponentAdvantages: 0, triggerDq: false, clearAutoDq: false });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // 2nd penalty: opponent gets 1 advantage
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: 1 });
  assert.deepEqual(step, { penalties: 2, opponentPoints: 0, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // 3rd penalty: opponent gets 2 points
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: 1 });
  assert.deepEqual(step, { penalties: 3, opponentPoints: 2, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // 4th penalty: disqualification
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: 1 });
  assert.deepEqual(step, { penalties: 4, opponentPoints: 2, opponentAdvantages: 1, triggerDq: true, clearAutoDq: false });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // Capped at 4
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: 1 });
  assert.deepEqual(step, { penalties: 4, opponentPoints: 2, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false });

  // Undo 4 -> 3 clears auto-DQ
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: -1 });
  assert.deepEqual(step, { penalties: 3, opponentPoints: 2, opponentAdvantages: 1, triggerDq: false, clearAutoDq: true });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // Undo 3 -> 2 removes 2 points
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: -1 });
  assert.deepEqual(step, { penalties: 2, opponentPoints: 0, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // Undo 2 -> 1 removes 1 advantage
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: -1 });
  assert.deepEqual(step, { penalties: 1, opponentPoints: 0, opponentAdvantages: 0, triggerDq: false, clearAutoDq: false });
  ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);

  // Undo 1 -> 0 leaves score untouched
  step = applyPenaltyDelta({ ladder: 'adult', currentPenalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv, delta: -1 });
  assert.deepEqual(step, { penalties: 0, opponentPoints: 0, opponentAdvantages: 0, triggerDq: false, clearAutoDq: false });
});

test('Kids (<15) IBJJF penalty ladder: 1 marked, 2 +1 adv, 3/4/5 +2 pts each, 6 DQ, and -1 reverses', () => {
  // Opponent already scored 3 pts and 1 adv on their own
  let pen = 0;
  let oppPts = 3;
  let oppAdv = 1;

  const expected = [
    { penalties: 1, opponentPoints: 3, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false },
    { penalties: 2, opponentPoints: 3, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 3, opponentPoints: 5, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 4, opponentPoints: 7, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 5, opponentPoints: 9, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 6, opponentPoints: 9, opponentAdvantages: 2, triggerDq: true, clearAutoDq: false },
  ];

  for (const exp of expected) {
    const step = applyPenaltyDelta({
      ladder: 'kids',
      currentPenalties: pen,
      opponentPoints: oppPts,
      opponentAdvantages: oppAdv,
      delta: 1,
    });
    assert.deepEqual(step, exp);
    ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);
  }

  // Undo back down 6 -> 5 -> 4 -> 3 -> 2 -> 1 -> 0 restores exact pre-penalty opponent score (3 pts, 1 adv)
  const undoExpected = [
    { penalties: 5, opponentPoints: 9, opponentAdvantages: 2, triggerDq: false, clearAutoDq: true },
    { penalties: 4, opponentPoints: 7, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 3, opponentPoints: 5, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 2, opponentPoints: 3, opponentAdvantages: 2, triggerDq: false, clearAutoDq: false },
    { penalties: 1, opponentPoints: 3, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false },
    { penalties: 0, opponentPoints: 3, opponentAdvantages: 1, triggerDq: false, clearAutoDq: false },
  ];

  for (const exp of undoExpected) {
    const step = applyPenaltyDelta({
      ladder: 'kids',
      currentPenalties: pen,
      opponentPoints: oppPts,
      opponentAdvantages: oppAdv,
      delta: -1,
    });
    assert.deepEqual(step, exp);
    ({ penalties: pen, opponentPoints: oppPts, opponentAdvantages: oppAdv } = step);
  }
});

test('penalties still break ties after points and advantages', () => {
  assert.deepEqual(
    decideClockEnd(
      { points: 2, advantages: 1, disadvantages: 1 },
      { points: 2, advantages: 1, disadvantages: 0 },
    ),
    { kind: 'winner', side: 'white', reason: 'penalties' },
  );
});

