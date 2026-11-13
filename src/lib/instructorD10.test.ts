import assert from 'node:assert/strict';
import test from 'node:test';
import { SHEET_AXIS_IDS } from '../preview/assessmentRadar/model.ts';
import { TOPO_R, buildTopo, faceCentroid, type Vec } from '../preview/crystallineSweeps/topo.ts';
import { DIAMOND_LAYOUT, diamondFaces } from './staticDiamond.ts';
import { buildD10Topo, kiteVolume } from './instructorD10Topo.ts';
import {
  D10_LAYOUT,
  D10_SECTORS,
  INSTRUCTOR_D10_FACE_IDS,
  INSTRUCTOR_D10_FACES,
  INSTRUCTOR_D10_SUBMETRICS,
  d10AxesFromScores,
  d10Faces,
  d10Kite,
  d10Submetrics,
  d10SubmetricsForFace,
  d10Summary,
  type InstructorD10Scores,
} from './instructorD10.ts';

const SAMPLE: InstructorD10Scores = {
  'public-speaking': 4,
  preparation: 5,
  energy: 4,
  'technical-demonstration': 5,
  safety: 5,
  'class-building': 3,
  mentor: 4,
  'on-mat-presence': 5,
  'off-mat-presence': 3,
  'student-retention': 4,
  classGrowth: 3,
};

test('the instructor D10 has ten faces in the approved order', () => {
  assert.deepEqual(
    INSTRUCTOR_D10_FACES.map((face) => face.label),
    [
      'Public speaking',
      'Preparation',
      'Energy',
      'Technical demonstration',
      'Safety',
      'Class building',
      'Mentor',
      'On-mat presence',
      'Off-mat presence',
      'Student retention',
    ],
  );
  assert.deepEqual([...INSTRUCTOR_D10_FACE_IDS], [
    'public-speaking',
    'preparation',
    'energy',
    'technical-demonstration',
    'safety',
    'class-building',
    'mentor',
    'on-mat-presence',
    'off-mat-presence',
    'student-retention',
  ]);
  const axes = d10AxesFromScores(SAMPLE);
  assert.equal(axes.length, 10);
  assert.deepEqual(axes.map((axis) => axis.id), [...INSTRUCTOR_D10_FACE_IDS]);
  assert.equal(axes.find((axis) => axis.id === 'student-retention')?.value, 4);
});

test('class growth is a sub-metric under student retention, not a face', () => {
  assert.equal(INSTRUCTOR_D10_FACE_IDS.includes('class-growth' as (typeof INSTRUCTOR_D10_FACE_IDS)[number]), false);
  assert.equal(
    INSTRUCTOR_D10_FACES.some((face) => face.id === 'class-growth' || face.label === 'Class growth'),
    false,
  );
  assert.deepEqual(
    INSTRUCTOR_D10_SUBMETRICS.map((row) => ({ id: row.id, faceId: row.faceId })),
    [{ id: 'class-growth', faceId: 'student-retention' }],
  );
  const faces = d10Faces(SAMPLE);
  assert.equal(faces.length, 10);
  assert.equal(faces.some((face) => face.axis.id === ('class-growth' as typeof faces[number]['axis']['id'])), false);
  assert.equal(d10AxesFromScores(SAMPLE).some((axis) => axis.label === 'Class growth'), false);
  const under = d10SubmetricsForFace('student-retention', SAMPLE);
  assert.equal(under.length, 1);
  assert.equal(under[0]?.id, 'class-growth');
  assert.equal(under[0]?.value, 3);
  assert.equal(d10SubmetricsForFace('mentor', SAMPLE).length, 0);
  assert.match(d10Summary(SAMPLE), /Under Student retention, class growth 3/);
});

test('front and back use even and odd faces, and an unrated face stays empty', () => {
  const used = [
    ...D10_SECTORS.map((sector) => D10_LAYOUT.front[sector]),
    ...D10_SECTORS.map((sector) => D10_LAYOUT.back[sector]),
  ].sort((a, b) => a - b);
  assert.deepEqual(used, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(D10_SECTORS.every((sector) => D10_LAYOUT.front[sector] % 2 === 0));
  assert.ok(D10_SECTORS.every((sector) => D10_LAYOUT.back[sector] % 2 === 1));
  // Left-to-right flip: the pair of a front sector appears in the mirrored sector.
  assert.equal(D10_LAYOUT.front[0], 0);
  assert.equal(D10_LAYOUT.back[0], 1);
  assert.equal(D10_LAYOUT.back[1], 9);
  const partial = d10AxesFromScores({ preparation: 2, classGrowth: 5 });
  assert.equal(partial.find((axis) => axis.id === 'preparation')?.value, 2);
  assert.equal(partial.find((axis) => axis.id === 'safety')?.value, null);
  assert.equal(d10Submetrics({ preparation: 2 }).find((row) => row.id === 'class-growth')?.value, null);
  const kite = d10Kite({ x: 100, y: 100 }, 50, 0);
  assert.equal(kite.length, 4);
  assert.deepEqual(kite[0], { x: 100, y: 100 });
  assert.ok(kite[2]!.y < kite[0]!.y);
});

test('the student D8 face count, order, and diamond layout are unchanged', () => {
  assert.deepEqual([...SHEET_AXIS_IDS], [
    'guard-control',
    'passing',
    'sweeps',
    'takedowns',
    'escapes-defense',
    'submissions',
    'conditioning',
    'mindset',
  ]);
  const faces = diamondFaces({
    guard: 5,
    passing: 4,
    sweeps: 3,
    takedowns: 2,
    escapes: 5,
    submissions: 4,
    conditioning: 1,
    mindset: 5,
  });
  assert.equal(faces.length, 8);
  assert.equal(faces.find((face) => face.axis.id === 'sweeps')?.axis.value, 3);
  assert.deepEqual(DIAMOND_LAYOUT.front, { 'top-right': 0, 'bottom-right': 2, 'top-left': 4, 'bottom-left': 6 });
  assert.deepEqual(DIAMOND_LAYOUT.back, { 'top-left': 1, 'bottom-left': 3, 'top-right': 5, 'bottom-right': 7 });
  assert.equal(d10Faces(SAMPLE).length, 10);
});

test('the student D8 topo still has eight triangular faces and the same vertices', () => {
  const model = buildTopo(() => 3);
  assert.equal(model.vertices.length, 6);
  assert.deepEqual(model.vertices, [
    [TOPO_R, 0, 0],
    [-TOPO_R, 0, 0],
    [0, TOPO_R, 0],
    [0, -TOPO_R, 0],
    [0, 0, TOPO_R],
    [0, 0, -TOPO_R],
  ]);
  const faceCorners: number[][] = [];
  for (const sx of [0, 1]) {
    for (const sy of [2, 3]) {
      for (const sz of [4, 5]) {
        const odd = (sx + sy - 2 + sz - 4) % 2;
        faceCorners.push(odd ? [sx, sz, sy] : [sx, sy, sz]);
      }
    }
  }
  assert.equal(model.faces.length, 8);
  assert.equal(model.faceCorners.length, 8);
  assert.ok(model.faceCorners.every((corners) => corners.length === 3));
  assert.deepEqual(model.faceCorners, faceCorners);
  assert.deepEqual(
    model.faces.map((face) => face.id),
    [...SHEET_AXIS_IDS],
  );
  const mid = faceCentroid([
    [3, 0, 0],
    [0, 3, 0],
    [0, 0, 3],
  ]);
  assert.deepEqual(mid, [1, 1, 1]);
});

test('the instructor D10 topo is a ten-faced trapezohedron in approved face order', () => {
  const model = buildD10Topo(SAMPLE);
  assert.equal(model.vertices.length, 12);
  assert.equal(model.faces.length, 10);
  assert.equal(model.faceCorners.length, 10);
  assert.equal(model.tiles.length, 20);
  assert.ok(model.faceCorners.every((corners) => corners.length === 4));
  assert.deepEqual(
    model.faces.map((face) => face.id),
    [...INSTRUCTOR_D10_FACE_IDS],
  );
  assert.equal(model.faces.some((face) => face.id === 'class-growth' || face.name === 'Class growth'), false);
  for (let index = 0; index < 10; index += 1) {
    const corners = model.faceCorners[index]!.map((vertex) => model.vertices[vertex]!);
    assert.ok(Math.abs(kiteVolume(corners)) < 1e-8, `face ${index} should be planar`);
    const onFace = model.tiles.filter((tile) => tile.faceIndex === index);
    assert.equal(onFace.length, 2);
    assert.ok(onFace.every((tile) => tile.move?.id === INSTRUCTOR_D10_FACE_IDS[index]));
  }
  const mid = faceCentroid([
    [0, 0, 0],
    [4, 0, 0],
    [4, 4, 0],
    [0, 4, 0],
  ] as Vec[]);
  assert.deepEqual(mid, [2, 2, 0]);
  const empty = buildD10Topo(null);
  assert.equal(empty.faces.length, 10);
  assert.ok(empty.tiles.every((tile) => tile.move == null && tile.apex == null));
});
