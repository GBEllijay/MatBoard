import assert from 'node:assert/strict';
import test from 'node:test';
import { AXES, SHEET_AXIS_IDS, outerOctagon } from '../preview/assessmentRadar/model.ts';
import type { AssessmentScores } from './studentAssessment.ts';
import { SHAPE_CATEGORY_ORDER, shapeAxesFromLegacy, shapeAxisLabel, shapeAxisValues } from './shapeAxes.ts';

const legacy: AssessmentScores = {
  guard: 5,
  passing: 3,
  takedowns: 4,
  escapes: 2,
  submissions: 4,
  conditioning: 2,
  mindset: 3,
};

const ORDER = [
  'Guard/Control',
  'Passing',
  'Sweeps',
  'Takedowns',
  'Escapes/Defense',
  'Submissions',
  'Conditioning',
  'Mindset',
] as const;

test('the approved octagon is eight axes in the owner order', () => {
  assert.equal(outerOctagon().length, 8);
  assert.equal(AXES.length, 8);
  assert.deepEqual(
    SHEET_AXIS_IDS.map((id) => AXES.find((axis) => axis.id === id)?.label),
    [...ORDER],
  );
  assert.deepEqual(
    SHAPE_CATEGORY_ORDER.map((id) => AXES.find((axis) => axis.id === id)?.label),
    [...ORDER],
  );
});

test('a saved 7-value check-in maps guard and escapes and leaves Sweeps empty', () => {
  const frozen = JSON.stringify(legacy);
  const axes = shapeAxesFromLegacy(legacy);
  assert.deepEqual(
    axes.map((axis) => axis.label),
    [...ORDER],
  );
  assert.deepEqual(
    axes.map((axis) => axis.id),
    [...SHEET_AXIS_IDS],
  );
  assert.equal(axes.find((axis) => axis.id === 'guard-control')?.value, 5);
  assert.equal(axes.find((axis) => axis.id === 'escapes-defense')?.value, 2);
  assert.equal(axes.find((axis) => axis.id === 'passing')?.value, 3);
  const sweeps = axes.find((axis) => axis.id === 'sweeps');
  assert.equal(sweeps?.value, null);
  assert.notEqual(sweeps?.value, legacy.passing);
  assert.equal(shapeAxisValues(legacy).includes(0), false);
  assert.equal(JSON.stringify(legacy), frozen);
  assert.equal(Object.hasOwn(legacy, 'sweeps'), false);
  assert.equal(
    shapeAxisLabel(legacy),
    'Self-assessment shape, Guard/Control 5, Passing 3, Sweeps not rated, Takedowns 4, Escapes/Defense 2, Submissions 4, Conditioning 2, Mindset 3',
  );
});

test('an entered sweeps rating stays independent of passing', () => {
  const rated = { ...legacy, passing: 5, sweeps: 1 as const };
  const axes = shapeAxesFromLegacy(rated);
  assert.equal(axes.find((axis) => axis.id === 'passing')?.value, 5);
  assert.equal(axes.find((axis) => axis.id === 'sweeps')?.value, 1);
  assert.notEqual(axes.find((axis) => axis.id === 'sweeps')?.value, rated.passing);
  assert.deepEqual(shapeAxisValues(rated), [5, 5, 1, 4, 2, 4, 2, 3]);
  assert.match(shapeAxisLabel(rated), /Passing 5, Sweeps 1, Takedowns 4/);
  const untouched = shapeAxesFromLegacy({ ...legacy, passing: 5 });
  assert.equal(untouched.find((axis) => axis.id === 'sweeps')?.value, null);
  assert.equal(untouched.find((axis) => axis.id === 'passing')?.value, 5);
});

test('an empty check-in does not invent scores', () => {
  const axes = shapeAxesFromLegacy(null);
  assert.equal(axes.length, 8);
  assert.equal(axes.every((axis) => axis.value == null), true);
  assert.equal(shapeAxisLabel({}), 'Self-assessment shape. No saved ratings yet.');
  assert.equal(shapeAxisLabel({ passing: 4 }).split(', ').includes('Sweeps not rated'), true);
  assert.equal(shapeAxesFromLegacy({ passing: 4 }).find((axis) => axis.id === 'sweeps')?.value, null);
});
