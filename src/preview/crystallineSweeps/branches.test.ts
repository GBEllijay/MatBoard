import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopo, demoLevel, TOPO_R, type Vec } from './topo.ts';
import {
  BRANCH_SEGMENTS,
  arcControl,
  arcPoints,
  branchArcs,
  branchStroke,
  branchesFromTree,
  hitBranch,
  nextBranchSelection,
  proximity,
  segmentDepth,
  tileTip,
  withAlpha,
} from './branches.ts';

const model = buildTopo((id) => demoLevel(id));
const norm = (x: number, y: number, z: number) => Math.hypot(x, y, z);

test('branches come from the example tree and always join two different faces', () => {
  const branches = branchesFromTree(model);
  assert.ok(branches.length >= 6, `expected several cross-face branches, got ${branches.length}`);
  for (const branch of branches) {
    assert.notEqual(model.tiles[branch.from].faceIndex, model.tiles[branch.to].faceIndex);
    assert.equal(model.tiles[branch.from].move?.name, branch.fromName);
    assert.equal(model.tiles[branch.to].move?.name, branch.toName);
  }
  const keys = branches.map((b) => [b.from, b.to].sort((x, y) => x - y).join(':'));
  assert.equal(new Set(keys).size, keys.length, 'a pair is drawn once');
  assert.ok(branches.some((b) => b.fromName === 'Closed guard' && b.toName === 'Scissor sweep'));
  assert.ok(!branches.some((b) => b.fromName === 'Scissor sweep' && b.toName === 'Closed guard'), 'reverse duplicate dropped');
});

test('same-face edges are left on the surface', () => {
  const branches = branchesFromTree(model, [
    { from: 'Closed guard', to: 'Mount' },
    { from: 'Scissor sweep', to: 'Flower sweep' },
    { from: 'Nope', to: 'Mount' },
  ]);
  assert.deepEqual(branches, []);
});

test('arc starts and ends on the two tips and bows through the middle', () => {
  const a: Vec = [1.2, 0.5, 0.3];
  const b: Vec = [-0.4, -1.1, 0.6];
  const points = arcPoints(a, b, 16);
  assert.equal(points.length, 17 * 3);
  assert.deepEqual([...points.slice(0, 3)], a);
  assert.deepEqual([...points.slice(-3)].map((v) => Number(v.toFixed(12))), b);
  const chordMid = norm((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const arcMid = norm(points[8 * 3], points[8 * 3 + 1], points[8 * 3 + 2]);
  assert.ok(arcMid < chordMid * 0.6, `arc middle ${arcMid} should sit well inside the chord middle ${chordMid}`);
  const control = arcControl(a, b, 1);
  assert.deepEqual(control.map((v) => Math.abs(v)), [0, 0, 0]);
  const reused = new Float64Array(17 * 3);
  assert.equal(arcPoints(a, b, 16, undefined, reused), reused, 'a big enough buffer is reused');
});

test('every model arc runs from apex to apex inside the diamond', () => {
  const branches = branchesFromTree(model);
  const arcs = branchArcs(model, branches, 1);
  arcs.forEach((arc, index) => {
    assert.equal(arc.length, (BRANCH_SEGMENTS + 1) * 3);
    const from = tileTip(model.tiles[branches[index].from], 1);
    const to = tileTip(model.tiles[branches[index].to], 1);
    assert.deepEqual([...arc.slice(0, 3)], from);
    const mid = Math.floor(BRANCH_SEGMENTS / 2) * 3;
    // The octahedron's inscribed radius is R/sqrt(3). The arc middle is inside it.
    assert.ok(norm(arc[mid], arc[mid + 1], arc[mid + 2]) < TOPO_R / Math.sqrt(3), 'middle of the branch is inside the solid');
    const middle = norm(arc[mid], arc[mid + 1], arc[mid + 2]);
    assert.ok(middle < norm(...from) && middle < norm(...to), 'middle is nearer the center than either tip');
    assert.deepEqual([...arc.slice(-3)].map((v) => Number(v.toFixed(12))), to.map((v) => Number(v.toFixed(12))));
  });
});

test('segments sort behind front faces and in front of back faces', () => {
  const branches = branchesFromTree(model);
  const arcs = branchArcs(model, branches, 1);
  const faces = model.tiles.map((tile) => ({
    kind: 'face' as const,
    z: (tile.tri[0].p[2] + tile.tri[1].p[2] + tile.tri[2].p[2]) / 3,
  }));
  for (const arc of arcs) {
    const mid = Math.floor(BRANCH_SEGMENTS / 2) * 3;
    const segment = { kind: 'branch' as const, z: segmentDepth(arc[mid + 2], arc[mid + 5]) };
    const list = [...faces, segment].sort((a, b) => a.z - b.z);
    const at = list.indexOf(segment);
    assert.ok(list.slice(0, at).some((item) => item.kind === 'face' && item.z < -0.5), 'a back face is painted before it');
    assert.ok(list.slice(at + 1).some((item) => item.kind === 'face' && item.z > 0.5), 'a front face is painted after it');
  }
  assert.equal(segmentDepth(-1, 0.5), -0.25);
});

test('nearer lines are brighter and wider', () => {
  assert.equal(proximity(-TOPO_R), 0);
  assert.equal(proximity(TOPO_R), 1);
  assert.equal(proximity(99), 1);
  const far = branchStroke(-1, false);
  const near = branchStroke(1, false);
  assert.ok(near.alpha > far.alpha && near.width > far.width);
  assert.ok(branchStroke(0, true).width > branchStroke(0, false).width);
});

test('tap picks the nearest branch within reach, and toggles', () => {
  const hits = [
    { branch: 0, a: [0, 0] as [number, number], b: [100, 0] as [number, number] },
    { branch: 1, a: [0, 10] as [number, number], b: [100, 10] as [number, number] },
  ];
  assert.equal(hitBranch([50, 2], hits), 0);
  assert.equal(hitBranch([50, 8], hits), 1);
  assert.equal(hitBranch([50, 60], hits), -1);
  assert.equal(hitBranch([130, 0], hits, 14), -1);
  assert.equal(nextBranchSelection(-1, 1), 1);
  assert.equal(nextBranchSelection(1, 1), -1, 'tap the same line again clears');
  assert.equal(nextBranchSelection(1, 0), 0);
  assert.equal(nextBranchSelection(1, -1), -1, 'empty space clears');
});

test('x-ray swaps only the alpha of a fill', () => {
  assert.equal(withAlpha('rgba(10,20,30,0.55)', 0.12), 'rgba(10,20,30,0.12)');
  assert.equal(withAlpha('#ffffff', 0.12), '#ffffff');
});
