import assert from 'node:assert/strict';
import test from 'node:test';
import { SHEET_AXIS_IDS } from '../preview/assessmentRadar/model.ts';
import { TOPO_R, buildTopo, faceCentroid, type Vec } from '../preview/crystallineSweeps/topo.ts';
import { DIAMOND_LAYOUT, diamondFaces } from './staticDiamond.ts';
import { buildD12Topo, buildDodecahedron, pentagonPlanarError } from './instructorD12Topo.ts';
import {
  INSTRUCTOR_D12_FACE_IDS,
  INSTRUCTOR_D12_FACES,
  d12AxesFromScores,
  d12Faces,
  d12Summary,
  type InstructorD12Scores,
} from './instructorD12.ts';

const SAMPLE: InstructorD12Scores = {
  'public-speaking': 4,
  preparation: 5,
  energy: 4,
  'technical-demonstration': 5,
  safety: 5,
  'class-growth': 3,
  'student-leadership-development': 4,
  'on-mat-presence': 5,
  'off-mat-presence': 3,
  'student-retention': 4,
  'personal-development': 4,
  'time-management': 3,
};

const FACE_LABELS = [
  'Public Speaking',
  'Preparation',
  'Energy',
  'Technical Demonstration',
  'Safety',
  'Class Growth',
  'Student Leadership Development',
  'On-Mat Presence',
  'Off-Mat Presence',
  'Student Retention',
  'Personal Development',
  'Time Management',
];

test('the instructor D12 has twelve named faces in the approved order', () => {
  assert.deepEqual(
    INSTRUCTOR_D12_FACES.map((face) => face.label),
    FACE_LABELS,
  );
  assert.deepEqual([...INSTRUCTOR_D12_FACE_IDS], [
    'public-speaking',
    'preparation',
    'energy',
    'technical-demonstration',
    'safety',
    'class-growth',
    'student-leadership-development',
    'on-mat-presence',
    'off-mat-presence',
    'student-retention',
    'personal-development',
    'time-management',
  ]);
  const axes = d12AxesFromScores(SAMPLE);
  assert.equal(axes.length, 12);
  assert.deepEqual(axes.map((axis) => axis.id), [...INSTRUCTOR_D12_FACE_IDS]);
  assert.equal(axes.find((axis) => axis.id === 'class-growth')?.value, 3);
  assert.equal(axes.find((axis) => axis.id === 'student-retention')?.value, 4);
  assert.equal(INSTRUCTOR_D12_FACES.some((face) => face.id === 'open-slot' || face.label === 'Open slot'), false);
});

test('class growth and student retention are both faces, and neither has a sub-score', () => {
  assert.equal(INSTRUCTOR_D12_FACES.some((face) => face.id === 'class-growth' && face.label === 'Class Growth'), true);
  assert.equal(INSTRUCTOR_D12_FACES.some((face) => face.id === 'student-retention' && face.label === 'Student Retention'), true);
  const faces = d12Faces(SAMPLE);
  assert.equal(faces.length, 12);
  assert.equal(faces.filter((face) => face.axis.label === 'Class Growth').length, 1);
  assert.equal(faces.filter((face) => face.axis.label === 'Student Retention').length, 1);
  assert.equal(d12Summary(SAMPLE).includes('Under '), false);
  assert.match(d12Summary(SAMPLE), /Class Growth 3/);
  assert.match(d12Summary(SAMPLE), /Student Retention 4/);
});

test('an unrated named face stays empty', () => {
  const partial = d12AxesFromScores({ preparation: 2 });
  assert.equal(partial.find((axis) => axis.id === 'preparation')?.value, 2);
  assert.equal(partial.find((axis) => axis.id === 'safety')?.value, null);
  assert.equal(partial.find((axis) => axis.id === 'student-retention')?.value, null);
  assert.equal(d12Summary(null), 'Instructor D12. No ratings yet.');
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
  assert.equal(d12Faces(SAMPLE).length, 12);
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

test('the instructor D12 topo is a regular dodecahedron in approved face order', () => {
  const mesh = buildDodecahedron();
  assert.equal(mesh.vertices.length, 20);
  assert.equal(mesh.faceCorners.length, 12);
  assert.ok(mesh.faceCorners.every((corners) => corners.length === 5));
  const edges = new Set<string>();
  for (const corners of mesh.faceCorners) {
    for (let i = 0; i < 5; i += 1) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 5]!;
      edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
    assert.ok(pentagonPlanarError(corners.map((index) => mesh.vertices[index]!)) < 1e-6, 'each face should be a planar pentagon');
  }
  assert.equal(edges.size, 30);
  const radii = mesh.vertices.map((point) => Math.hypot(...point));
  assert.ok(radii.every((radius) => Math.abs(radius - TOPO_R) < 1e-6));

  const model = buildD12Topo(SAMPLE);
  assert.equal(model.vertices.length, 20);
  assert.equal(model.faces.length, 12);
  assert.equal(model.faceCorners.length, 12);
  assert.equal(model.tiles.length, 36);
  assert.ok(model.faceCorners.every((corners) => corners.length === 5));
  assert.deepEqual(
    model.faces.map((face) => face.id),
    [...INSTRUCTOR_D12_FACE_IDS],
  );
  assert.equal(model.faces[0]?.name, 'Public Speaking');
  assert.equal(model.faces[11]?.name, 'Time Management');
  assert.ok(model.faces.some((face) => face.id === 'class-growth' && face.name === 'Class Growth'));
  assert.ok(model.faces.some((face) => face.id === 'student-retention' && face.name === 'Student Retention'));
  for (let index = 0; index < 12; index += 1) {
    const corners = model.faceCorners[index]!.map((vertex) => model.vertices[vertex]!);
    assert.ok(pentagonPlanarError(corners) < 1e-6, `face ${index} should be planar`);
    const onFace = model.tiles.filter((tile) => tile.faceIndex === index);
    assert.equal(onFace.length, 3);
    assert.ok(onFace.every((tile) => tile.move?.id === INSTRUCTOR_D12_FACE_IDS[index]));
  }
  const mid = faceCentroid([
    [0, 0, 0],
    [4, 0, 0],
    [4, 4, 0],
    [0, 4, 0],
  ] as Vec[]);
  assert.deepEqual(mid, [2, 2, 0]);
  const empty = buildD12Topo(null);
  assert.equal(empty.faces.length, 12);
  assert.ok(empty.tiles.every((tile) => tile.move == null && tile.apex == null));
});
