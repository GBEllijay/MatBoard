import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCHUP_AREAS,
  cleanRatings,
  compareToOpponent,
  isCompleteRatings,
  isDrawableRatings,
  matchupLabels,
  matchupLine,
} from './opponentAssessment.ts';
import { ASSESSMENT_FORM_AREAS, type AssessmentScores } from './studentAssessment.ts';

function scores(values: Partial<AssessmentScores> & Record<string, number>): AssessmentScores {
  return {
    guard: values.guard ?? 1,
    passing: values.passing ?? 1,
    sweeps: values.sweeps ?? 1,
    takedowns: values.takedowns ?? 1,
    escapes: values.escapes ?? 1,
    submissions: values.submissions ?? 1,
    conditioning: values.conditioning ?? 1,
    mindset: values.mindset ?? 1,
  };
}

test('comparison marks favored, even, and disadvantage and skips a missing area', () => {
  const mine = scores({ guard: 5, passing: 1, sweeps: 4, takedowns: 3, escapes: 4, submissions: 2, conditioning: 5, mindset: 3 });
  const theirs = scores({ guard: 2, passing: 4, sweeps: 2, takedowns: 3, escapes: 1, submissions: 5, conditioning: 5, mindset: 4 });
  const rows = compareToOpponent(mine, theirs);
  assert.equal(rows.length, 8);
  const groups = matchupLabels(rows);
  assert.deepEqual(groups.favored, ['Guard/Control', 'Sweeps', 'Escapes/Defense']);
  assert.deepEqual(groups.even, ['Takedowns', 'Conditioning']);
  assert.deepEqual(groups.disadvantage, ['Passing', 'Submissions', 'Mindset']);
  assert.equal(matchupLine(groups.favored), 'Guard/Control, Sweeps, Escapes/Defense');
  assert.equal(matchupLine([]), 'None');

  const partial = compareToOpponent(
    { guard: 4, passing: 2 },
    { guard: 4, submissions: 5 },
  );
  assert.deepEqual(partial.map((row) => [row.label, row.balance]), [['Guard/Control', 'even']]);
  assert.deepEqual(compareToOpponent(null, theirs), []);
  assert.deepEqual(compareToOpponent(mine, {}), []);
});

test('ratings keep 1 through 5 and drop anything else', () => {
  assert.deepEqual(cleanRatings({ guard: 4, passing: '2', takedowns: 9, escapes: '0', submissions: '', mindset: 'no', sweeps: '3' }), {
    guard: 4,
    passing: 2,
    sweeps: 3,
  });
  assert.equal(cleanRatings({ sweeps: 9 }).sweeps, undefined);
  assert.deepEqual(cleanRatings(null), {});
  assert.equal(isCompleteRatings({ guard: 1, passing: 2, sweeps: 3, takedowns: 3, escapes: 4, submissions: 5, conditioning: 1, mindset: 2 }), true);
  assert.equal(isCompleteRatings({ guard: 1, passing: 2, takedowns: 3, escapes: 4, submissions: 5, conditioning: 1, mindset: 2 }), false);
  assert.equal(isCompleteRatings({ guard: 1 }), false);
});

test('opponent cards rate the eight faces, Sweeps included, in check-in order', () => {
  assert.deepEqual(
    MATCHUP_AREAS.map((area) => area.id),
    ['guard', 'passing', 'sweeps', 'takedowns', 'escapes', 'submissions', 'conditioning', 'mindset'],
  );
  assert.deepEqual(
    MATCHUP_AREAS.map((area) => area.label),
    ASSESSMENT_FORM_AREAS.map((area) => area.label),
  );
  assert.equal(MATCHUP_AREAS.some((area) => area.id === 'stamina' || area.id === 'calm-focused'), false);
  assert.deepEqual(cleanRatings({ guard: 4, stamina: 5, power: 2, 'calm-focused': 3, sweeps: 1 }), { guard: 4, sweeps: 1 });

  const mine = { ...scores({ guard: 4, passing: 4 }), sweeps: 5 as const };
  const theirs = { ...scores({ guard: 4, passing: 2 }), sweeps: 1 as const };
  const rows = compareToOpponent(mine, theirs);
  assert.equal(rows.find((row) => row.id === 'sweeps')?.label, 'Sweeps');
  assert.equal(rows.find((row) => row.id === 'sweeps')?.balance, 'favored');
  assert.equal(compareToOpponent(scores({}), scores({})).some((row) => row.id === 'sweeps'), true);
  assert.equal(isCompleteRatings(scores({})), true);
});

test('an opponent card saved before Sweeps existed still loads, draws its seven, and compares them', () => {
  const old = cleanRatings({ guard: 3, passing: 3, takedowns: 3, escapes: 3, submissions: 3, conditioning: 3, mindset: 3 });
  assert.equal(old.sweeps, undefined, 'unrated, not a copied number');
  assert.equal(isCompleteRatings(old), false, 'a complete card has all eight');
  assert.equal(isDrawableRatings(old), true, 'it still draws with an unrated Sweeps corner');
  assert.equal(isDrawableRatings({ ...old, guard: undefined }), false);
  const rows = compareToOpponent(scores({ sweeps: 4 }), old);
  assert.equal(rows.length, 7);
  assert.equal(rows.some((row) => row.id === 'sweeps'), false);
  // Once the opponent has Sweeps too, it joins Me vs Them.
  assert.equal(compareToOpponent(scores({ sweeps: 4 }), { ...old, sweeps: 2 }).find((row) => row.id === 'sweeps')?.balance, 'favored');
});
