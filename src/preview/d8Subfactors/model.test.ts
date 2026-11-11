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
  DUPLICATE_NAME,
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
  labelsOnFace,
  reviewAddedName,
  sampleRatings,
  scoreFace,
} from './model.ts';
import { DIAMOND_CAP, ZOOM_LIST, averageRating, moreCount, moreLabel, strongestCards, type FaceCard } from './cards.ts';
import { FACE_GRID_MAX, FACE_GRID_MIN, applySubfactorScore, buildSubfactorTopo, faceGridSize, faceSlots, faceTileCap, placeOnEmptySlot, showOnDiamond } from './topoModel.ts';

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
  for (const name of ['model.ts', 'topoModel.ts', 'cards.ts', 'FaceIndexCard.tsx', 'D8SubfactorsPreview.tsx']) {
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

test('a blank name is ignored and a duplicate stays on its own face', () => {
  const sweeps = faceById('sweeps');
  const labels = labelsOnFace(sweeps, []);
  assert.deepEqual(reviewAddedName(labels, '   '), { error: 'blank' });
  assert.deepEqual(reviewAddedName(labels, ' Scissor   sweep '), { error: 'duplicate' });
  assert.deepEqual(reviewAddedName(labels, 'scissor sweep'), { error: 'duplicate' });
  assert.deepEqual(reviewAddedName(labels, 'De La Riva'), { label: 'De La Riva' });
  assert.deepEqual(reviewAddedName(labels, 'Mount'), { label: 'Mount' });
  const withAdded = labelsOnFace(sweeps, [{ id: 'added.sweeps.1', faceId: 'sweeps', label: 'De La Riva', tileIndex: 1 }]);
  assert.deepEqual(reviewAddedName(withAdded, 'de la riva'), { error: 'duplicate' });
  assert.equal(DUPLICATE_NAME, 'Already on this face.');
});

test('an added neutral 3 stays on the empty slot and joins the face average', () => {
  const ratings = sampleRatings();
  const model = buildSubfactorTopo(FACES, (id) => ratings[id] ?? null);
  const faceIndex = model.faces.findIndex((face) => face.id === 'sweeps');
  const before = faceSlots(model, faceIndex);
  const empty = before.filter((slot) => !slot.label);
  const filled = before.filter((slot) => slot.label);
  assert.equal(empty.length, 3);
  assert.equal(filled.length, 6);
  const center = {
    x: before.reduce((sum, slot) => sum + slot.x, 0) / before.length,
    y: before.reduce((sum, slot) => sum + slot.y, 0) / before.length,
  };
  const distance = (slot: { x: number; y: number }) => Math.hypot(slot.x - center.x, slot.y - center.y);
  assert.ok(Math.min(...empty.map(distance)) + 1e-6 >= Math.max(...filled.map(distance)));
  const target = empty[0];
  assert.ok(target);
  assert.equal(placeOnEmptySlot(model, target.tileIndex, 'added.sweeps.1', 'De La Riva'), true);
  assert.equal(placeOnEmptySlot(model, target.tileIndex, 'added.sweeps.2', 'Again'), false);
  const after = faceSlots(model, faceIndex);
  const placed = after.find((slot) => slot.tileIndex === target.tileIndex);
  assert.equal(placed?.label, 'De La Riva');
  assert.equal(placed?.moveId, 'added.sweeps.1');
  assert.equal(placed?.x, target.x);
  assert.equal(placed?.y, target.y);
  assert.equal(model.tiles.find((tile) => tile.move?.id === 'sweep.scissor')?.move?.name, 'Scissor sweep');
  assert.equal(model.tiles[target.tileIndex]?.offset, TOPO_LEVEL[3]);
  assert.equal(model.faces[faceIndex]?.moves.length, 7);
  const sweeps = faceById('sweeps');
  const added = [{ id: 'added.sweeps.1', faceId: 'sweeps' as const, label: 'De La Riva', tileIndex: target.tileIndex }];
  assert.equal(scoreFace(sweeps, ratings), 4);
  assert.equal(scoreFace(sweeps, { ...ratings, 'added.sweeps.1': 3 }, added), 3);
  assert.equal(scoreFace(sweeps, { ...ratings, 'added.sweeps.1': 5 }, added), 4);
  assert.equal(scoreFace(faceById('passing'), { ...ratings, 'added.sweeps.1': 3 }, added), scoreFace(faceById('passing'), ratings));
});

function faceCard(id: string, rating: AssessmentScore, addedAt: number): FaceCard {
  return { id, faceId: 'sweeps', name: id, rating, addedAt, journal: [], video: null, tree: null };
}

test('twelve cards keep nine on the diamond and average every card', () => {
  assert.equal(DIAMOND_CAP, 9);
  assert.equal(ZOOM_LIST, 1.8);
  const cards = [
    faceCard('a5', 5, 1),
    faceCard('a4', 4, 2),
    faceCard('b4', 4, 3),
    faceCard('a3', 3, 4),
    faceCard('b3', 3, 5),
    faceCard('a2', 2, 6),
    ...[1, 2, 3, 4, 5, 6].map((index) => faceCard(`low-${index}`, 1, 10 + index)),
  ];
  assert.equal(cards.length, 12);
  const shown = strongestCards(cards);
  assert.equal(shown.length, 9);
  assert.deepEqual(
    shown.map((card) => card.id),
    ['a5', 'b4', 'a4', 'b3', 'a3', 'a2', 'low-6', 'low-5', 'low-4'],
  );
  assert.equal(moreCount(12), 3);
  assert.equal(moreLabel(12), '+3 more');
  assert.equal(moreLabel(9), null);
  assert.equal(averageRating(cards), 2);
  assert.equal(averageRating(shown), 3);
  const model = buildSubfactorTopo(FACES, () => 3);
  const faceIndex = model.faces.findIndex((face) => face.id === 'sweeps');
  showOnDiamond(
    model,
    faceIndex,
    shown.map((card) => ({ id: card.id, name: card.name, rating: card.rating })),
  );
  const slots = faceSlots(model, faceIndex);
  assert.equal(slots.length, 9);
  assert.equal(slots.filter((slot) => slot.label).length, 9);
  assert.equal(model.faces[faceIndex]?.moves.length, 9);
  showOnDiamond(
    model,
    faceIndex,
    cards.map((card) => ({ id: card.id, name: card.name, rating: card.rating })),
  );
  assert.equal(model.faces[faceIndex]?.moves.length, 9);
  assert.equal(model.tiles.filter((tile) => tile.faceIndex === faceIndex).length, 9);
});

test('a face splits 3x3 up to 9 cards, 4x4 up to 16, 5x5 from 17, and never past 5x5', () => {
  assert.equal(FACE_GRID_MIN, 3);
  assert.equal(FACE_GRID_MAX, 5);
  for (const count of [0, 1, 6, 9]) assert.equal(faceGridSize(count), 3, String(count));
  for (const count of [10, 12, 16]) assert.equal(faceGridSize(count), 4, String(count));
  for (const count of [17, 25, 26, 100]) assert.equal(faceGridSize(count), 5, String(count));
  assert.equal(faceGridSize(Number.NaN), 3);
  assert.equal(faceTileCap(9), 9);
  assert.equal(faceTileCap(10), 16);
  assert.equal(faceTileCap(17), 25);
  assert.equal(faceTileCap(400), 25);
});

test('gridFor sets each face split, and the rows lay out 1, 3, 5, 7, 9 from the apex', () => {
  const grids = FACES.map((_, index) => [3, 4, 5][index % 3]);
  const model = buildSubfactorTopo(FACES, () => null, (faceIndex) => grids[faceIndex]);
  FACES.forEach((_, faceIndex) => {
    const n = grids[faceIndex];
    assert.equal(model.tiles.filter((tile) => tile.faceIndex === faceIndex).length, n * n);
    const slots = faceSlots(model, faceIndex);
    assert.ok(slots.every((slot) => slot.grid === n));
    const perRow = Array.from({ length: n }, (_, row) => slots.filter((slot) => slot.row === row).length);
    assert.deepEqual(perRow, Array.from({ length: n }, (_, row) => 2 * row + 1));
  });
  // Without gridFor the old split stays: six lines is 3x3.
  const plain = buildSubfactorTopo(FACES, () => null);
  assert.equal(plain.tiles.length, FACES.length * 9);
  assert.ok(faceSlots(plain, 0).every((slot) => slot.grid === 3));
});

test('a 5x5 face holds 25 cards and drops the rest', () => {
  const model = buildSubfactorTopo(FACES, () => null, () => 5);
  const faceIndex = model.faces.findIndex((face) => face.id === 'sweeps');
  const cards = Array.from({ length: 30 }, (_, index) => ({ id: `c${index}`, name: `Card ${index}`, rating: 3 as const }));
  showOnDiamond(model, faceIndex, cards);
  assert.equal(model.faces[faceIndex]?.moves.length, 25);
  assert.equal(faceSlots(model, faceIndex).filter((slot) => slot.label).length, 25);
  const small = buildSubfactorTopo(FACES, () => null, () => 4);
  showOnDiamond(small, faceIndex, cards.slice(0, 11));
  const slots = faceSlots(small, faceIndex);
  assert.equal(slots.filter((slot) => slot.label).length, 11);
  assert.equal(slots.length, 16);
});
