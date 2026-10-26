import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanRatings,
  compareToOpponent,
  isCompleteRatings,
  matchupLabels,
  matchupLine,
} from './opponentAssessment.ts';
import type { AssessmentScores } from './studentAssessment.ts';

function scores(values: Partial<AssessmentScores> & Record<string, number>): AssessmentScores {
  return {
    guard: values.guard ?? 1,
    passing: values.passing ?? 1,
    takedowns: values.takedowns ?? 1,
    escapes: values.escapes ?? 1,
    submissions: values.submissions ?? 1,
    conditioning: values.conditioning ?? 1,
    mindset: values.mindset ?? 1,
  };
}

test('comparison marks favored, even, and disadvantage and skips a missing area', () => {
  const mine = scores({ guard: 5, passing: 1, takedowns: 3, escapes: 4, submissions: 2, conditioning: 5, mindset: 3 });
  const theirs = scores({ guard: 2, passing: 4, takedowns: 3, escapes: 1, submissions: 5, conditioning: 5, mindset: 4 });
  const rows = compareToOpponent(mine, theirs);
  const groups = matchupLabels(rows);
  assert.deepEqual(groups.favored, ['Guard', 'Escapes']);
  assert.deepEqual(groups.even, ['Takedowns', 'Conditioning']);
  assert.deepEqual(groups.disadvantage, ['Passing', 'Submissions', 'Mindset']);
  assert.equal(matchupLine(groups.favored), 'Guard, Escapes');
  assert.equal(matchupLine([]), 'None');

  const partial = compareToOpponent(
    { guard: 4, passing: 2 },
    { guard: 4, submissions: 5 },
  );
  assert.deepEqual(partial.map((row) => [row.label, row.balance]), [['Guard', 'even']]);
  assert.deepEqual(compareToOpponent(null, theirs), []);
  assert.deepEqual(compareToOpponent(mine, {}), []);
});

test('ratings keep 1 through 5 and drop anything else', () => {
  assert.deepEqual(cleanRatings({ guard: 4, passing: '2', takedowns: 9, escapes: '0', submissions: '', mindset: 'no' }), {
    guard: 4,
    passing: 2,
  });
  assert.deepEqual(cleanRatings(null), {});
  assert.equal(isCompleteRatings({ guard: 1, passing: 2, takedowns: 3, escapes: 4, submissions: 5, conditioning: 1, mindset: 2 }), true);
  assert.equal(isCompleteRatings({ guard: 1 }), false);
});
