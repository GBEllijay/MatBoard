import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EARLIER_HOURS_PLAYFUL,
  EXAMPLE_ESTIMATES,
  EXAMPLE_LOGGED_HOURS,
  EXAMPLE_STUDENT,
  EXAMPLE_TREES,
  addHeadTree,
  addUpwardTeacher,
  chainLine,
  HOURS_PER_WEEK,
  PLANNING_SPANS,
  combinedHours,
  estimateStatus,
  estimatedHours,
  exampleAncestry,
  formatHours,
  parseEstimate,
  planningHours,
  planningWeeks,
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
    assert.equal(/minimum hours|should be promoted/i.test(source), false);
  }
  assert.equal(/IBJJF/i.test(ancestry), false);
  assert.match(hours, /not a guaranteed promotion/);
});

test('estimated hours stay separate from logged hours, and a blank belt adds nothing', () => {
  assert.equal(estimateStatus(''), 'blank');
  assert.equal(estimateStatus('10'), 'counted');
  assert.equal(estimateStatus('nope'), 'ignored');
  assert.equal(parseEstimate(''), null);
  assert.equal(parseEstimate('nope'), null);
  assert.deepEqual(Object.values(EXAMPLE_ESTIMATES), ['', '', '', '', '']);
  assert.equal(estimatedHours(EXAMPLE_ESTIMATES), 0);
  assert.equal(combinedHours(EXAMPLE_LOGGED_HOURS, EXAMPLE_ESTIMATES), EXAMPLE_LOGGED_HOURS);
  assert.equal(EXAMPLE_LOGGED_HOURS, 18.5);
  assert.equal(formatHours(18.5), '18.5');
  assert.equal(formatHours(18), '18');
  const typed = { ...EXAMPLE_ESTIMATES, white: '10' };
  assert.equal(estimatedHours(typed), 10);
  assert.equal(combinedHours(EXAMPLE_LOGGED_HOURS, typed), 28.5);
  assert.equal(EARLIER_HOURS_PLAYFUL, 'On your honor—count the mat time, not the drive there. If you’re unsure, round down.');
  assert.equal(EARLIER_HOURS_PLAYFUL.includes('\u2014'), true);
  assert.equal(EARLIER_HOURS_PLAYFUL.includes('\u2019'), true);
  const hours = readFileSync(new URL('./StudentHoursPreview.tsx', import.meta.url), 'utf8');
  const earlierAt = hours.indexOf('aria-label="Pre-Advantage estimated hours"');
  const combinedAt = hours.indexOf('aria-label="Combined total"');
  const beforeEarlier = hours.slice(0, earlierAt);
  const earlier = hours.slice(earlierAt, combinedAt);
  assert.equal(beforeEarlier.includes('{EARLIER_HOURS_PLAYFUL}'), false);
  assert.equal(beforeEarlier.includes('These hours are estimated.'), false);
  assert.equal(earlier.includes('{EARLIER_HOURS_PLAYFUL}'), true);
  assert.equal(earlier.includes('These hours are estimated.'), false);
  assert.equal(beforeEarlier.includes('Optional. Type your own history or leave the belt blank.'), false);
  assert.match(earlier, /<h2>Pre-Advantage estimated hours<\/h2>/);
  assert.match(earlier, /Optional\. Type your own history or leave the belt blank\./);
  assert.equal(earlier.includes('A blank belt adds nothing'), false);
  assert.equal(earlier.includes('do not take the planning model'), false);
});

test('the hours preview shows the four requested labels', () => {
  const hours = readFileSync(new URL('./StudentHoursPreview.tsx', import.meta.url), 'utf8');
  assert.match(hours, /<h1[^>]*>Training hours<\/h1>/);
  assert.match(hours, /<h2>Training hours based on general calendar minimums \(for reference\)<\/h2>/);
  assert.equal(hours.includes('>General model<'), false);
  assert.match(hours, /<h3[^>]*>General timelines<\/h3>/);
  assert.match(hours, /<h2>Advantage hours logged<\/h2>/);
  assert.match(hours, /<span>Advantage hours logged<\/span>/);
  assert.equal(hours.includes('>Planning model<'), false);
  assert.equal(hours.includes('From the example journal. Not editable here.'), false);
  assert.equal(hours.includes('>Advantage logged hours<'), false);
  assert.match(hours, /PREVIEW_NOTE/);
  assert.match(hours, /<h2>Pre-Advantage estimated hours<\/h2>/);
  assert.match(hours, /Optional\. Type your own history or leave the belt blank\./);
  assert.equal(hours.includes('pre-advantage hour log'), false);
  assert.match(hours, /\{EARLIER_HOURS_PLAYFUL\}/);
});

test('the planning model is 2, 3, and 4 hours a week across the four belt spans', () => {
  assert.deepEqual(PLANNING_SPANS.map((span) => planningWeeks(span.years)), [104, 104, 78, 52]);
  assert.deepEqual(
    HOURS_PER_WEEK.map((rate) => PLANNING_SPANS.map((span) => planningHours(span.years, rate))),
    [
      [208, 208, 156, 104],
      [312, 312, 234, 156],
      [416, 416, 312, 208],
    ],
  );
  const at2 = PLANNING_SPANS.map((span) => planningHours(span.years, 2));
  assert.deepEqual(
    PLANNING_SPANS.map((span) => planningHours(span.years, 3)),
    at2.map((hours) => hours * 1.5),
  );
  assert.deepEqual(
    PLANNING_SPANS.map((span) => planningHours(span.years, 4)),
    at2.map((hours) => hours * 2),
  );
  assert.equal(PLANNING_SPANS[0]?.basis, 'assumption');
  assert.deepEqual(
    PLANNING_SPANS.slice(1).map((span) => span.basis),
    ['ibjjf', 'ibjjf', 'ibjjf'],
  );
});
