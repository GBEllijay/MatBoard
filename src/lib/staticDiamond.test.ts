import assert from 'node:assert/strict';
import test from 'node:test';
import { SHEET_AXIS_IDS } from '../preview/assessmentRadar/model.ts';
import { DIAMOND_LAYOUT, diamondFaces, diamondShade, diamondSummary, quadrantTriangle } from './staticDiamond.ts';

test('the static diamond shows all eight areas once, Sweeps included', () => {
  const faces = diamondFaces({ guard: 5, passing: 4, sweeps: 3, takedowns: 2, escapes: 5, submissions: 4, conditioning: 1, mindset: 5 });
  assert.equal(faces.length, 8);
  assert.deepEqual([...new Set(faces.map((face) => face.axis.id))].sort(), [...SHEET_AXIS_IDS].sort());
  assert.equal(faces.find((face) => face.axis.id === 'sweeps')?.axis.value, 3);
  const used = [...Object.values(DIAMOND_LAYOUT.front), ...Object.values(DIAMOND_LAYOUT.back)].sort();
  assert.deepEqual(used, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('faces that share an edge on the D8 mesh share a diamond edge', () => {
  // Front looks down +z; back is turned over left-to-right. Guard (+x+y+z) and Passing (+x+y-z) share the +x/+y edge.
  assert.equal(DIAMOND_LAYOUT.front['top-right'], 0);
  assert.equal(DIAMOND_LAYOUT.back['top-left'], 1);
});

test('an older day without Sweeps leaves that face unrated, never a copied number', () => {
  const faces = diamondFaces({ guard: 3, passing: 3, takedowns: 3, escapes: 3, submissions: 3, conditioning: 3, mindset: 3 });
  assert.equal(faces.find((face) => face.axis.id === 'sweeps')?.axis.value, null);
  assert.equal(diamondShade(null), null);
  assert.ok((diamondShade(5) ?? 0) > (diamondShade(1) ?? 1));
  assert.match(diamondSummary({ guard: 3, passing: 3, takedowns: 3, escapes: 3, submissions: 3, conditioning: 3, mindset: 3 }), /Sweeps not rated/);
  assert.equal(diamondSummary(null), 'Diamond. No saved ratings yet.');
});

test('quadrant triangles meet at the center and the diamond tips', () => {
  const tri = quadrantTriangle({ x: 100, y: 100 }, 50, 'top-right');
  assert.deepEqual(tri, [{ x: 100, y: 100 }, { x: 100, y: 50 }, { x: 150, y: 100 }]);
});
