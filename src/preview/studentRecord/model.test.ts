import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EXAMPLE_DIRECT_TEACHERS,
  EXAMPLE_ESTIMATES,
  EXAMPLE_LOGGED_HOURS,
  EXAMPLE_TEACHERS,
  EXAMPLE_TRAINED_WITH,
  ancestryTreeLines,
  combinedHours,
  datesAreBlank,
  estimatedHours,
  formatHours,
  parseEstimate,
  trainedWithLine,
} from './model.ts';

test('the ancestry tree is who taught whom and never prints dates', () => {
  const lines = ancestryTreeLines(EXAMPLE_TEACHERS, EXAMPLE_DIRECT_TEACHERS);
  assert.deepEqual(lines, [
    'Coach Lane (example) → Teacher North (example) → Teacher West (example)',
    'Coach Ellis (example) → Teacher East (example)',
  ]);
  const dated = EXAMPLE_TRAINED_WITH.map((row) => ({ ...row, startedOn: '1999-01-01', endedOn: '2001-01-01' }));
  assert.equal(ancestryTreeLines(EXAMPLE_TEACHERS, EXAMPLE_DIRECT_TEACHERS).join(' '), lines.join(' '));
  assert.equal(lines.join(' ').includes('1999'), false);
  assert.equal(dated.some((row) => row.startedOn), true);
  assert.equal(lines.join(' ').includes('Coach Quinn'), false);
});

test('blank dates leave the trained-with line as a name, and a still-training row skips the end date', () => {
  const blank = EXAMPLE_TRAINED_WITH[2];
  assert.equal(blank && trainedWithLine(blank), 'Coach Quinn (example)');
  const still = EXAMPLE_TRAINED_WITH[0];
  assert.equal(still && trainedWithLine({ ...still, startedOn: '2024-01-02', endedOn: '2025-01-02' }), 'Coach Lane (example) · started 2024-01-02 · still training');
  const ended = EXAMPLE_TRAINED_WITH[1];
  assert.equal(ended && trainedWithLine(ended), 'Coach Ellis (example) · started 2018-03-01 · ended 2020-11-01');
  assert.equal(datesAreBlank(EXAMPLE_TRAINED_WITH.map((row) => ({ ...row, startedOn: '', endedOn: '' }))), true);
  assert.equal(datesAreBlank(EXAMPLE_TRAINED_WITH), false);
});

test('the preview routes are direct links and do not write a student record', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/preview\/student-ancestry"/);
  assert.match(app, /path="\/preview\/student-hours"/);
  const ancestry = readFileSync(new URL('./StudentAncestryPreview.tsx', import.meta.url), 'utf8');
  const hours = readFileSync(new URL('./StudentHoursPreview.tsx', import.meta.url), 'utf8');
  for (const source of [ancestry, hours]) {
    assert.equal(source.includes('localStorage'), false);
    assert.equal(source.includes('setRankLineage'), false);
    assert.equal(source.includes('writeGymProfile'), false);
    assert.match(source, /PREVIEW_NOTE/);
    assert.equal(/IBJJF|minimum hours|should be promoted/i.test(source), false);
  }
});

test('estimated hours stay separate from logged hours, and a blank belt adds nothing', () => {
  assert.equal(parseEstimate(''), null);
  assert.equal(parseEstimate('nope'), null);
  assert.equal(estimatedHours(EXAMPLE_ESTIMATES), 65);
  assert.equal(combinedHours(EXAMPLE_LOGGED_HOURS, EXAMPLE_ESTIMATES), 83.5);
  assert.equal(formatHours(83.5), '83.5');
  assert.equal(formatHours(18), '18');
  const cleared = { ...EXAMPLE_ESTIMATES, white: '', blue: '' };
  assert.equal(estimatedHours(cleared), 0);
  assert.equal(combinedHours(EXAMPLE_LOGGED_HOURS, cleared), EXAMPLE_LOGGED_HOURS);
});
