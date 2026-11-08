import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EXAMPLE_ESTIMATES,
  EXAMPLE_LOGGED_HOURS,
  EXAMPLE_STUDENT,
  EXAMPLE_TREES,
  addHeadTree,
  addUpwardTeacher,
  chainLine,
  combinedHours,
  estimatedHours,
  exampleAncestry,
  formatHours,
  parseEstimate,
  setLineageVisible,
  timelineLine,
  timelinesOverlap,
} from './model.ts';

test('each lineage tree starts with you and goes upward only as far as known', () => {
  const [lane, ellis] = EXAMPLE_TREES;
  assert.ok(lane && ellis);
  assert.equal(chainLine(EXAMPLE_STUDENT, lane), 'You (example student) → Coach Lane (example) → Teacher North (example) → Teacher West (example)');
  assert.equal(chainLine(EXAMPLE_STUDENT, ellis), 'You (example student) → Coach Ellis (example) → Teacher East (example)');
  assert.equal(chainLine(EXAMPLE_STUDENT, { ...ellis, upward: [] }), 'You (example student) → Coach Ellis (example)');
  assert.equal(chainLine(EXAMPLE_STUDENT, lane).includes(lane.startedOn), false);
  assert.equal(/Gracie|Carlos/i.test(JSON.stringify(EXAMPLE_TREES)), false);
});

test('two head instructors can overlap, and hiding lineage keeps the trees', () => {
  const [lane, ellis] = EXAMPLE_TREES;
  assert.ok(lane && ellis);
  assert.equal(timelinesOverlap(lane, ellis), true);
  assert.match(timelineLine(lane), /started 2022-02-01/);
  assert.match(timelineLine(lane), /still training/);
  assert.equal(timelineLine({ ...lane, startedOn: '', endedOn: '', stillTraining: false }), '');
  const hidden = setLineageVisible(exampleAncestry(), false);
  assert.equal(hidden.visible, false);
  assert.deepEqual(hidden.trees.map((tree) => tree.headName), ['Coach Lane (example)', 'Coach Ellis (example)']);
  assert.deepEqual(hidden.trees[0]?.upward, ['Teacher North (example)', 'Teacher West (example)']);
  const shown = setLineageVisible(hidden, true);
  assert.equal(shown.visible, true);
  assert.equal(shown.trees[1]?.headName, 'Coach Ellis (example)');
});

test('a new head instructor is another tree, and a teacher can be added above any level', () => {
  const added = addHeadTree(EXAMPLE_TREES);
  assert.equal(added.length, 3);
  assert.equal(added[2]?.headName, '');
  assert.deepEqual(added[2]?.upward, []);
  const taller = addUpwardTeacher(EXAMPLE_TREES[0]!);
  assert.equal(taller.upward.length, 3);
  assert.equal(chainLine(EXAMPLE_STUDENT, { ...taller, upward: [...taller.upward.slice(0, 2), 'Teacher Far (example)'] }).endsWith('Teacher Far (example)'), true);
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
  const hours = readFileSync(new URL('./StudentHoursPreview.tsx', import.meta.url), 'utf8');
  assert.match(hours, /fictional examples for this screen/);
  assert.match(hours, /not a recommended amount of training/);
  assert.match(hours, /not a promotion benchmark/);
  assert.equal(EXAMPLE_ESTIMATES.white, '40');
  assert.equal(EXAMPLE_ESTIMATES.blue, '25');
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
