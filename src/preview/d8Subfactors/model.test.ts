/**
 * Face averages and sample branch targets. No page, no storage.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SHEET_AXIS_IDS } from '../assessmentRadar/model.ts';
import {
  CONDITIONING_ITEMS,
  MINDSET_GOALS,
  conditioningScoreFromItems,
  mindsetScoreFromGoals,
  type AssessmentScore,
  type ConditioningItemScores,
  type MindsetGoalScores,
} from '../../lib/studentAssessment.ts';
import { TOPO_LEVEL } from '../crystallineSweeps/topo.ts';
import {
  BRANCH_LINKS,
  D8_SUBFACTORS_PATH,
  FACES,
  PROPOSED_NOTE,
  SAMPLE_CHAINS,
  SCISSOR_CHAIN_ID,
  SUBFACTORS_PER_FACE,
  allSubfactors,
  brokenBranchTargets,
  chainById,
  chainFaceIds,
  faceById,
  faceScoreFromLines,
  sampleRatings,
  scoreFace,
} from './model.ts';
import { applySubfactorScore, buildSubfactorTopo } from './topoModel.ts';

test('six lines round to the same average as the conditioning and mindset rollup', () => {
  const vectors: readonly (readonly AssessmentScore[])[] = [
    [1, 1, 1, 1, 1, 1],
    [5, 5, 5, 5, 5, 5],
    [1, 1, 1, 1, 1, 2],
    [2, 2, 2, 2, 2, 3],
    [2, 2, 2, 3, 3, 3],
    [3, 3, 3, 4, 4, 4],
    [1, 2, 3, 4, 5, 5],
    [4, 5, 5, 5, 5, 5],
    [3, 3, 3, 3, 3, 4],
    [4, 4, 4, 4, 4, 5],
  ];
  for (const values of vectors) {
    assert.equal(values.length, SUBFACTORS_PER_FACE);
    const conditioning = Object.fromEntries(CONDITIONING_ITEMS.map((item, index) => [item.id, values[index]])) as ConditioningItemScores;
    const mindset = Object.fromEntries(MINDSET_GOALS.map((goal, index) => [goal.id, values[index]])) as MindsetGoalScores;
    const rounded = faceScoreFromLines(values);
    assert.equal(rounded, conditioningScoreFromItems(conditioning));
    assert.equal(rounded, mindsetScoreFromGoals(mindset));
    assert.equal(rounded, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
  }
  assert.equal(faceScoreFromLines([]), null);
  assert.equal(faceScoreFromLines([0, 6, null]), null);
  assert.equal(faceScoreFromLines([2, 2, 2, 3, 3, 3]), 3);
  assert.equal(faceScoreFromLines([3, 3, 3, 4, 4, 4]), 4);
});

test('each face has six lines and the sample score is their rounded average', () => {
  assert.equal(FACES.length, 8);
  assert.deepEqual(FACES.map((face) => face.id), [...SHEET_AXIS_IDS]);
  const ratings = sampleRatings();
  for (const face of FACES) {
    assert.equal(face.subfactors.length, SUBFACTORS_PER_FACE);
    const values = face.subfactors.map((line) => {
      assert.ok(line.sample >= 1 && line.sample <= 5);
      return ratings[line.id];
    });
    assert.equal(values.length, 6);
    assert.equal(scoreFace(face, ratings), faceScoreFromLines(values));
  }
  assert.deepEqual(
    faceById('conditioning').subfactors.map((line) => line.label),
    CONDITIONING_ITEMS.map((item) => item.label),
  );
  assert.deepEqual(
    faceById('mindset').subfactors.map((line) => line.label),
    MINDSET_GOALS.map((goal) => goal.label),
  );
  assert.equal(faceById('conditioning').proposed, false);
  assert.equal(faceById('mindset').proposed, false);
  for (const face of FACES) {
    if (face.id === 'conditioning' || face.id === 'mindset') continue;
    assert.equal(face.proposed, true);
    for (const line of face.subfactors) assert.ok(line.definition);
  }
  assert.match(PROPOSED_NOTE, /Proposed/);
  const sweeps = faceById('sweeps');
  assert.deepEqual(
    sweeps.subfactors.map((line) => line.label),
    ['Scissor sweep', 'Hip bump sweep', 'Pendulum sweep', 'Flower sweep', 'Tripod sweep', 'Butterfly sweep'],
  );
  assert.equal(scoreFace(sweeps, ratings), 4);
});

test('every branch target exists on another face', () => {
  const lines = allSubfactors();
  assert.equal(brokenBranchTargets(BRANCH_LINKS, lines).length, 0);
  assert.ok(BRANCH_LINKS.length > 4);
  const chain = chainById(SCISSOR_CHAIN_ID);
  assert.ok(chain);
  assert.deepEqual(
    BRANCH_LINKS.filter((link) => link.chainId === SCISSOR_CHAIN_ID).map((link) => [link.fromId, link.toId]),
    [
      ['sweep.scissor', 'pos.mount'],
      ['pos.mount', 'sub.armbar-mount'],
      ['pos.mount', 'sub.cross-collar'],
      ['pos.mount', 'sub.americana'],
    ],
  );
  assert.deepEqual(chainFaceIds(chain), ['sweeps', 'guard-control', 'submissions']);
  for (const sample of SAMPLE_CHAINS) {
    const ids = [...sample.steps, ...sample.fan];
    assert.ok(ids.length >= 2);
    for (const id of ids) assert.ok(lines.some((line) => line.id === id), id);
  }
  const broken = brokenBranchTargets(
    [{ id: 'bad', fromId: 'sweep.scissor', toId: 'missing', chainId: 'bad' }],
    lines,
  );
  assert.deepEqual(broken, ['missing']);
});

test('diamond tiles use the sample rating, and a new rating changes that tile only', () => {
  const ratings = sampleRatings();
  const model = buildSubfactorTopo(FACES, (id) => ratings[id] ?? null);
  assert.equal(model.faces.length, 8);
  for (const face of model.faces) assert.equal(face.moves.length, 6);
  const scissor = model.tiles.find((tile) => tile.move?.id === 'sweep.scissor');
  const mount = model.tiles.find((tile) => tile.move?.id === 'pos.mount');
  assert.ok(scissor?.offset != null && mount?.offset != null);
  assert.equal(scissor.offset, TOPO_LEVEL[4]);
  assert.equal(mount.offset, TOPO_LEVEL[5]);
  const before = mount.offset;
  applySubfactorScore(model, 'sweep.scissor', 1);
  assert.equal(scissor.offset, TOPO_LEVEL[1]);
  assert.equal(mount.offset, before);
});

test('the preview route is direct and the page does not write storage', () => {
  for (const name of ['model.ts', 'topoModel.ts', 'D8SubfactorsPreview.tsx']) {
    const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /localStorage|writeAssessments|saveAssessment|saveStudentReport/);
  }
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const at = app.indexOf('D8_SUBFACTORS_PATH');
  assert.ok(at > 0);
  const route = app.slice(app.lastIndexOf('D8_SUBFACTORS_PATH'), app.lastIndexOf('D8_SUBFACTORS_PATH') + 180);
  assert.match(route, /D8SubfactorsPreview/);
  assert.doesNotMatch(route, /CoachRoute|StudentRoute/);
  assert.equal(D8_SUBFACTORS_PATH, '/preview/d8-subfactors');
});
