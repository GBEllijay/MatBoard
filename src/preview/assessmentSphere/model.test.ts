import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ASSESSMENT_AREAS,
  areaById,
  demoEdges,
  pointerIntent,
  projectArea,
  rotatePoint,
  areaDirection,
} from './model.ts';

test('the sphere uses the eight approved areas and fictional scores', () => {
  assert.deepEqual(
    ASSESSMENT_AREAS.map((area) => area.title),
    [
      'Guard/Control',
      'Passing',
      'Sweeps',
      'Takedowns',
      'Escapes/Defense',
      'Submissions',
      'Conditioning',
      'Mindset',
    ],
  );
  for (const area of ASSESSMENT_AREAS) {
    assert.ok(area.exampleScore >= 1 && area.exampleScore <= 5);
  }
  const conditioning = areaById('conditioning');
  const mindset = areaById('mindset');
  assert.equal(conditioning?.kind, 'benchmark');
  assert.equal(conditioning?.tree, null);
  assert.match(conditioning?.benchmark?.detail ?? '', /Not a technique/);
  assert.equal(mindset?.kind, 'benchmark');
  assert.equal(mindset?.tree, null);
  assert.deepEqual(demoEdges(conditioning!), []);
  assert.deepEqual(demoEdges(mindset!), []);
});

test('submissions opens Mount to three choices and nothing else', () => {
  const area = areaById('submissions');
  assert.ok(area?.tree);
  assert.equal(area?.tree?.base.title, 'Mount');
  assert.deepEqual(demoEdges(area!), [
    ['Mount', 'Americana'],
    ['Mount', 'Armbar'],
    ['Mount', 'Cross-collar choke'],
  ]);
});

test('a drag past the threshold orbits and a small movement stays a tap', () => {
  assert.equal(pointerIntent(2, 3), 'tap');
  assert.equal(pointerIntent(20, 0), 'orbit');
  assert.equal(pointerIntent(0, 13), 'orbit');
});

test('turning the sphere moves a point and can bring each area to the front', () => {
  const front = projectArea(5, 0, 0, 340);
  const turned = projectArea(5, 1.2, 0.4, 340);
  assert.notEqual(Math.round(front.x), Math.round(turned.x));
  for (let index = 0; index < ASSESSMENT_AREAS.length; index += 1) {
    let facing = false;
    for (let step = 0; step < 16 && !facing; step += 1) {
      const yaw = (Math.PI * 2 * step) / 16;
      for (let pitchStep = -4; pitchStep <= 4; pitchStep += 1) {
        const spot = rotatePoint(areaDirection(index), yaw, pitchStep * 0.25);
        if (spot.z > 0.45) facing = true;
      }
    }
    assert.equal(facing, true, ASSESSMENT_AREAS[index]?.title);
  }
});

test('the preview page does not write a student file', () => {
  const page = readFileSync(new URL('./AssessmentSpherePreview.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.equal(page.includes('setItem'), false);
  assert.equal(page.includes('saveStudentReport'), false);
  assert.match(page, /Back to sphere/);
  assert.match(app, /path="\/preview\/assessment-sphere"/);
  assert.doesNotMatch(page, /assessment-radar/);
});
