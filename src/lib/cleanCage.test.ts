import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CAGE_AXES,
  CAGE_CX,
  CAGE_CY,
  CAGE_DATA,
  CAGE_FENCE,
  CAGE_FRAME,
  CAGE_MAT,
  CAGE_ME,
  CAGE_OPPONENT,
  CAGE_OUTER,
  CAGE_TILE,
  cagePoint,
  cageRuns,
  cageSeriesPoints,
  eightValues,
  fencePaths,
  octagonAt,
  scoutCageLabel,
} from './cleanCage.ts';
import type { AssessmentScores } from './studentAssessment.ts';

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

test('the clean cage is an eight-vertex octagon with a post at 12 o clock', () => {
  const posts = octagonAt(CAGE_OUTER);
  assert.equal(posts.length, CAGE_AXES);
  assert.equal(CAGE_AXES, 8);
  assert.ok(Math.abs(posts[0].x - CAGE_CX) < 1e-6);
  assert.ok(posts[0].y < CAGE_CY);
  assert.ok(posts[2].x > CAGE_CX);
  assert.ok(Math.abs(posts[2].y - CAGE_CY) < 1e-6);
  assert.ok(posts[4].y > CAGE_CY);
  assert.ok(posts[6].x < CAGE_CX);
  for (let index = 0; index < posts.length; index += 1) {
    const here = Math.atan2(posts[index].y - CAGE_CY, posts[index].x - CAGE_CX);
    const next = posts[(index + 1) % posts.length];
    const there = Math.atan2(next.y - CAGE_CY, next.x - CAGE_CX);
    let turn = there - here;
    if (turn < 0) turn += Math.PI * 2;
    assert.ok(Math.abs(turn - Math.PI / 4) < 1e-6);
  }
});

test('a score of 5 stays inside the mat, and the frame is thinner than the mockup rim', () => {
  assert.ok(CAGE_FRAME < 11);
  assert.equal(CAGE_TILE, CAGE_FENCE);
  assert.ok(CAGE_DATA < CAGE_MAT);
  assert.ok(CAGE_MAT < CAGE_OUTER - CAGE_FRAME / 2);
  const top = cagePoint(0, 5);
  assert.ok(Math.abs(top.x - CAGE_CX) < 1e-6);
  assert.ok(Math.abs(CAGE_CY - top.y - CAGE_DATA) < 1e-6);
  const one = cagePoint(0, 1);
  assert.ok(Math.abs(CAGE_CY - one.y - CAGE_DATA / 5) < 1e-6);
  const origin = cagePoint(0, 0);
  assert.ok(Math.abs(origin.x - CAGE_CX) < 1e-6);
  assert.ok(Math.abs(origin.y - CAGE_CY) < 1e-6);
});

test('seven numbers do not close as a heptagon, and an unrated Sweeps is not zero', () => {
  const seven = eightValues([5, 4, 3, 3, 4, 5, 4]);
  assert.equal(seven.length, 8);
  assert.equal(seven[7], null);
  assert.equal(cageSeriesPoints(seven), null);
  const open = eightValues([5, 3, null, 4, 2, 4, 2, 3]);
  assert.equal(open[2], null);
  assert.equal(cageSeriesPoints(open), null);
  const runs = cageRuns(open);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].includes(2), false);
  assert.equal(runs[0].length, 7);
  const center = `${CAGE_CX.toFixed(2)},${CAGE_CY.toFixed(2)}`;
  const line = runs[0].map((index) => cagePoint(index, open[index] ?? 0));
  assert.equal(line.some((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}` === center), false);
  const closed = cageSeriesPoints([5, 4, 3, 3, 4, 5, 4, 4]);
  assert.equal(closed?.length, 8);
});

test('the fence mesh is the clean-cage diamond, and the series colors stay Me and Opponent', () => {
  const tile = CAGE_TILE;
  const paths = fencePaths(tile);
  assert.match(paths.a, new RegExp(`M0,${tile} L${tile},0`));
  assert.match(paths.b, new RegExp(`M0,0 L${tile},${tile}`));
  assert.equal(CAGE_ME, '#6ea8ff');
  assert.equal(CAGE_OPPONENT, '#ff8a3d');
});

test('the opponent cage names all eight factors, including an unrated Sweeps', () => {
  const mine: AssessmentScores = {
    guard: 5,
    passing: 4,
    takedowns: 3,
    escapes: 2,
    submissions: 4,
    conditioning: 5,
    mindset: 3,
  };
  const theirs: AssessmentScores = {
    guard: 2,
    passing: 5,
    sweeps: 3,
    takedowns: 3,
    escapes: 4,
    submissions: 1,
    conditioning: 4,
    mindset: 5,
  };
  const open = scoutCageLabel('Sam', mine, theirs);
  assert.match(open, /^Me versus Sam\. /);
  for (const label of ORDER) assert.match(open, new RegExp(label.replace('/', '\\/')));
  assert.match(open, /Sweeps not rated/);
  assert.match(open, /Sweeps 3/);
  assert.equal(open.includes('Sweeps 0'), false);
  const closed = scoutCageLabel('Sam', { ...mine, sweeps: 1 }, theirs);
  assert.match(closed, /Sweeps 1/);
  assert.match(closed, /Sam: Guard\/Control 2, Passing 5, Sweeps 3/);
  assert.equal(scoutCageLabel('Riley', null, null), 'Riley has no ratings');
});

test('the profile radar and the opponent spider share one cage component', () => {
  const octagon = readFileSync(new URL('../preview/assessmentRadar/OctagonChart.tsx', import.meta.url), 'utf8');
  const scout = readFileSync(new URL('../pages/student/ScoutingPage.tsx', import.meta.url), 'utf8');
  const cage = readFileSync(new URL('../components/CleanCage.tsx', import.meta.url), 'utf8');
  assert.match(octagon, /CageFigure/);
  assert.match(scout, /ScoutCage/);
  assert.match(cage, /export function CageFigure/);
  assert.match(cage, /export function ScoutCage/);
  assert.equal(scout.includes('RadarChart'), false);
  assert.match(scout, />\s*Spider\s*</);
});
