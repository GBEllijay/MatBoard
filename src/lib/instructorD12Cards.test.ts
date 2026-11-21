import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INSTRUCTOR_D12_STORAGE_KEY,
  loadInstructorD12Scores,
  saveInstructorD12Scores,
} from './instructorD12.ts';
import { TOPO_LEVEL } from '../preview/crystallineSweeps/topo.ts';
import {
  D12_FACE_GRID_SAFE,
  D12_FACE_SLICES,
  D12_FACE_TILE_SAFE,
  applyD12ShapeMetric,
  buildD12Topo,
  d12FaceGridSize,
  d12FaceSlots,
  d12FaceTileCap,
  pentagonPlanarError,
  placeOnEmptyD12Slot,
  showOnD12Face,
} from './instructorD12Topo.ts';
import {
  D12_CONFIRM_DELETE_CARD,
  D12_DEFAULT_FACE_VIEW,
  D12_DEFAULT_SHAPE_METRIC,
  D12_DELETE_CARD,
  D12_FACE_VIEWS,
  D12_KEEP_CARD,
  D12_SHAPE_METRICS,
  DUPLICATE_NAME,
  INSTRUCTOR_D12_CARDS_STORAGE_KEY,
  INSTRUCTOR_D12_STARTER_CARDS,
  NEUTRAL_RATING,
  addInstructorD12Card,
  d12CardFaceAverage,
  d12CardFaceAverageExact,
  d12CardFaceScore,
  d12CardFaceScoreExact,
  d12CardFaceScoreLine,
  d12CardsInPlaceOrder,
  d12CardsOnFace,
  d12FaceRelief,
  instructorD12StarterCards,
  loadInstructorD12Cards,
  rateInstructorD12Card,
  removeInstructorD12Card,
  reviewD12CardName,
  saveInstructorD12Cards,
  shownD12CardRating,
  type InstructorD12Card,
} from './instructorD12Cards.ts';

function memoryStorage(start: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map(Object.entries(start));
  return {
    map,
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function card(partial: Partial<InstructorD12Card> & Pick<InstructorD12Card, 'id' | 'name'>): InstructorD12Card {
  return {
    faceId: 'energy',
    addedAt: 1,
    ...partial,
  };
}

test('a face holds 5, 20, 45, then 80 tiles, and never more than the safety cap', () => {
  assert.equal(D12_FACE_SLICES, 5);
  assert.equal(D12_FACE_GRID_SAFE, 18);
  assert.equal(D12_FACE_TILE_SAFE, 1620);
  for (const count of [0, 1, 5]) assert.equal(d12FaceGridSize(count), 1, String(count));
  for (const count of [6, 12, 20]) assert.equal(d12FaceGridSize(count), 2, String(count));
  for (const count of [21, 45]) assert.equal(d12FaceGridSize(count), 3, String(count));
  for (const count of [46, 80]) assert.equal(d12FaceGridSize(count), 4, String(count));
  assert.equal(d12FaceGridSize(81), 5);
  assert.equal(d12FaceGridSize(Number.NaN), 1);
  assert.equal(d12FaceTileCap(5), 5);
  assert.equal(d12FaceTileCap(6), 20);
  assert.equal(d12FaceTileCap(21), 45);
  assert.equal(d12FaceTileCap(46), 80);
  assert.equal(d12FaceTileCap(81), 125);
  assert.equal(d12FaceGridSize(D12_FACE_TILE_SAFE), D12_FACE_GRID_SAFE);
  assert.equal(d12FaceGridSize(D12_FACE_TILE_SAFE + 1), D12_FACE_GRID_SAFE);
  assert.equal(d12FaceTileCap(D12_FACE_TILE_SAFE + 100), D12_FACE_TILE_SAFE);
  assert.ok(d12FaceTileCap(D12_FACE_TILE_SAFE + 100) < 5 * 19 * 19);

  const counts = [5, 20, 45, 80];
  counts.forEach((tiles, index) => {
    const n = index + 1;
    const model = buildD12Topo(null, { gridFor: () => n });
    for (let faceIndex = 0; faceIndex < 12; faceIndex += 1) {
      assert.equal(model.tiles.filter((tile) => tile.faceIndex === faceIndex).length, tiles, `n=${n} face ${faceIndex}`);
    }
    assert.equal(model.tiles.length, 12 * tiles);
  });
  const capped = buildD12Topo(null, { gridFor: () => D12_FACE_GRID_SAFE + 8 });
  assert.equal(capped.tiles.filter((tile) => tile.faceIndex === 0).length, D12_FACE_TILE_SAFE);
});

test('pizza-slice tiles stay on the pentagon, and existing cards keep their seats when a card is added', () => {
  const first = [
    card({ id: 'a', name: 'Alpha', faceId: 'energy', addedAt: 1, rating: 5 }),
    card({ id: 'b', name: 'Bravo', faceId: 'energy', addedAt: 2, rating: 4 }),
    card({ id: 'c', name: 'Charlie', faceId: 'energy', addedAt: 3, rating: 2 }),
  ];
  const model = buildD12Topo(null, { cards: first });
  const faceIndex = model.faces.findIndex((face) => face.id === 'energy');
  assert.equal(faceIndex, 2);
  const corners = model.faceCorners[faceIndex]!.map((index) => model.vertices[index]!);
  assert.ok(pentagonPlanarError(corners) < 1e-6);
  const onFace = model.tiles.filter((tile) => tile.faceIndex === faceIndex);
  assert.equal(onFace.length, 5);
  const mid = corners.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]] as typeof sum, [0, 0, 0] as (typeof corners)[0]);
  const center = mid.map((value) => value / 5) as (typeof corners)[0];
  for (const tile of onFace) {
    for (const point of tile.tri) {
      const planar = pentagonPlanarError([...corners, point.p]);
      assert.ok(planar < 1e-5, 'each tile vertex should stay on the face plane');
    }
  }
  const before = new Map(d12FaceSlots(model, faceIndex).filter((slot) => slot.moveId).map((slot) => [slot.moveId, slot.tileIndex]));
  assert.deepEqual([...before.keys()].sort(), ['a', 'b', 'c']);
  const added = card({ id: 'd', name: 'Delta', faceId: 'energy', addedAt: 4, rating: 3 });
  const empty = d12FaceSlots(model, faceIndex).find((slot) => !slot.moveId);
  assert.ok(empty);
  assert.equal(placeOnEmptyD12Slot(model, empty.tileIndex, added), true);
  assert.equal(placeOnEmptyD12Slot(model, empty.tileIndex, card({ id: 'e', name: 'Echo', addedAt: 5 })), false);
  const after = new Map(d12FaceSlots(model, faceIndex).filter((slot) => slot.moveId).map((slot) => [slot.moveId, slot.tileIndex]));
  assert.equal(after.get('a'), before.get('a'));
  assert.equal(after.get('b'), before.get('b'));
  assert.equal(after.get('c'), before.get('c'));
  assert.equal(after.get('d'), empty.tileIndex);

  const sixth = card({ id: 'f', name: 'Foxtrot', faceId: 'energy', addedAt: 6, rating: 1 });
  const grownCards = [...first, added, card({ id: 'e', name: 'Echo', faceId: 'energy', addedAt: 5 }), sixth];
  const grown = buildD12Topo(null, { cards: grownCards });
  assert.equal(grown.tiles.filter((tile) => tile.faceIndex === faceIndex).length, 20);
  const grownSlots = d12FaceSlots(grown, faceIndex).filter((slot) => slot.moveId);
  assert.equal(grownSlots.length, 6);
  const order = d12CardsInPlaceOrder(grownCards).map((item) => item.id);
  // Center-out place order: oldest cards stay on the innermost tiles after the split.
  const ranked = [...grownSlots].sort((left, right) => {
    const leftTile = grown.tiles[left.tileIndex]!;
    const rightTile = grown.tiles[right.tileIndex]!;
    const leftMid = [0, 1, 2].map((axis) => (leftTile.tri[0].p[axis] + leftTile.tri[1].p[axis] + leftTile.tri[2].p[axis]) / 3);
    const rightMid = [0, 1, 2].map((axis) => (rightTile.tri[0].p[axis] + rightTile.tri[1].p[axis] + rightTile.tri[2].p[axis]) / 3);
    const leftDistance = Math.hypot(leftMid[0] - center[0], leftMid[1] - center[1], leftMid[2] - center[2]);
    const rightDistance = Math.hypot(rightMid[0] - center[0], rightMid[1] - center[1], rightMid[2] - center[2]);
    const leftAngle = Math.atan2(leftMid[1] - center[1], leftMid[0] - center[0]);
    const rightAngle = Math.atan2(rightMid[1] - center[1], rightMid[0] - center[0]);
    return leftDistance - rightDistance || leftAngle - rightAngle || left.tileIndex - right.tileIndex;
  });
  assert.deepEqual(ranked.map((slot) => slot.moveId), order);

  showOnD12Face(grown, faceIndex, first);
  const painted = d12FaceSlots(grown, faceIndex).filter((slot) => slot.moveId);
  assert.equal(painted.length, 3);
  assert.equal(grown.faces[faceIndex]?.moves.length, 3);
});

test('only Public Speaking and Preparation start with the agreed cards; other faces stay blank', () => {
  const starters = instructorD12StarterCards();
  assert.equal(INSTRUCTOR_D12_STARTER_CARDS.length, 6);
  assert.deepEqual(
    d12CardsOnFace(starters, 'public-speaking').map((card) => card.name),
    [
      'Intro / end-of-class message',
      'Speaking in front of class and keeping attention',
      'Communicating with parents off the mat',
    ],
  );
  assert.deepEqual(
    d12CardsOnFace(starters, 'preparation').map((card) => card.name),
    ['Clean uniform / laundry', 'Mat inspection', 'Lesson plan / video review'],
  );
  assert.ok(starters.every((card) => card.rating == null));
  assert.equal(d12CardsOnFace(starters, 'energy').length, 0);
  assert.equal(d12CardsOnFace(starters, 'safety').length, 0);
  assert.equal(d12CardsOnFace(starters, 'time-management').length, 0);
  const model = buildD12Topo(null, { cards: starters });
  assert.equal(model.faces[0]?.moves.length, 3);
  assert.equal(model.faces[1]?.moves.length, 3);
  for (let index = 2; index < 12; index += 1) {
    assert.equal(model.faces[index]?.moves.length, 0);
    assert.equal(model.tiles.filter((tile) => tile.faceIndex === index && tile.move).length, 0);
  }
  assert.deepEqual(reviewD12CardName(starters, 'preparation', '  mat   inspection '), { error: 'duplicate' });
  assert.equal(DUPLICATE_NAME, 'Already on this face.');
  assert.deepEqual(reviewD12CardName(starters, 'preparation', '   '), { error: 'blank' });
  assert.deepEqual(reviewD12CardName(starters, 'safety', 'Mat inspection'), { label: 'Mat inspection' });
});

test('a face score is the rounded average of its cards, with unrated cards counting as 3', () => {
  assert.equal(d12CardFaceAverage([]), NEUTRAL_RATING);
  assert.equal(d12CardFaceAverageExact([]), 3);
  assert.equal(d12CardFaceAverage([5, 3, 2]), 3);
  assert.equal(d12CardFaceAverageExact([5, 3, 2]), 3.3);
  assert.equal(d12CardFaceAverage([5, null, 2]), 3);
  assert.equal(d12CardFaceAverageExact([5, undefined, 2]), 3.3);
  assert.equal(shownD12CardRating(null), 3);
  const cards: InstructorD12Card[] = [
    card({ id: 'a', name: 'Alpha', faceId: 'energy', rating: 5 }),
    card({ id: 'b', name: 'Bravo', faceId: 'energy', rating: 3 }),
    card({ id: 'c', name: 'Charlie', faceId: 'energy', rating: 2 }),
  ];
  assert.equal(d12CardFaceScore(cards, 'energy'), 3);
  assert.equal(d12CardFaceScoreExact(cards, 'energy'), 3.3);
  assert.equal(d12CardFaceScoreLine(cards, 'energy'), 'Face score 3.3 / 5');
  assert.equal(d12CardFaceScore(cards, 'safety'), 3);
  assert.equal(d12CardFaceScoreExact([], 'energy'), 3);
  const unrated = [card({ id: 'u', name: 'Untouched', faceId: 'safety' })];
  assert.equal(d12CardFaceScore(unrated, 'safety'), 3);
  assert.equal(d12CardFaceScoreExact(unrated, 'safety'), 3);
});

test('cards save under their own key and leave the check-in file untouched', () => {
  const storage = memoryStorage();
  assert.equal(INSTRUCTOR_D12_CARDS_STORAGE_KEY, 'matboard.instructor.d12.cards.v1');
  assert.equal(INSTRUCTOR_D12_STORAGE_KEY, 'matboard.instructor.d12.v1');
  const starters = loadInstructorD12Cards(storage, 'owner');
  assert.deepEqual(
    starters.map((card) => card.id),
    INSTRUCTOR_D12_STARTER_CARDS.map((card) => card.id),
  );
  assert.equal(storage.map.has(INSTRUCTOR_D12_CARDS_STORAGE_KEY), false);
  saveInstructorD12Scores({ preparation: 5, safety: 4 }, storage, 'owner');
  const added = addInstructorD12Card(starters, 'safety', 'Mat-side first aid', 4, 20);
  assert.ok('card' in added);
  const saved = saveInstructorD12Cards(added.cards, storage, 'owner');
  assert.equal(saved.some((card) => card.name === 'Mat-side first aid'), true);
  assert.equal(loadInstructorD12Scores(storage, 'owner')?.preparation, 5);
  assert.equal(loadInstructorD12Scores(storage, 'owner')?.safety, 4);
  const reloaded = loadInstructorD12Cards(storage, 'owner');
  assert.equal(reloaded.find((card) => card.name === 'Mat-side first aid')?.rating, 4);
  assert.equal(d12CardsOnFace(reloaded, 'public-speaking').length, 3);
  assert.equal(storage.map.get(INSTRUCTOR_D12_STORAGE_KEY)?.includes('Mat-side first aid') ?? false, false);
  assert.equal(loadInstructorD12Cards(storage, 'seat-9').length, 6);
  saveInstructorD12Cards([], storage, 'seat-9');
  assert.deepEqual(loadInstructorD12Cards(storage, 'seat-9'), []);
  assert.equal(d12CardsOnFace(loadInstructorD12Cards(storage, 'owner'), 'preparation').length, 3);
  const rated = rateInstructorD12Card(reloaded, 'starter.preparation.mat-inspection', 5);
  saveInstructorD12Cards(rated, storage, 'owner');
  assert.equal(loadInstructorD12Cards(storage, 'owner').find((card) => card.id === 'starter.preparation.mat-inspection')?.rating, 5);
  assert.equal(loadInstructorD12Scores(storage, 'owner')?.preparation, 5);
});

test('deleting a card only rewrites the cards key and the face score re-averages', () => {
  const storage = memoryStorage();
  saveInstructorD12Scores({ energy: 5, safety: 4 }, storage, 'owner');
  const checkIn = storage.map.get(INSTRUCTOR_D12_STORAGE_KEY)!;
  const cards: InstructorD12Card[] = [
    card({ id: 'a', name: 'Alpha', faceId: 'energy', addedAt: 1, rating: 5 }),
    card({ id: 'b', name: 'Bravo', faceId: 'energy', addedAt: 2, rating: 3 }),
    card({ id: 'c', name: 'Charlie', faceId: 'energy', addedAt: 3, rating: 2 }),
    card({ id: 'd', name: 'Delta', faceId: 'energy', addedAt: 4, rating: 4 }),
  ];
  assert.equal(d12CardFaceScoreExact(cards, 'energy'), 3.5);
  const kept = removeInstructorD12Card(cards, 'a');
  assert.deepEqual(kept.map((item) => item.id), ['b', 'c', 'd']);
  assert.equal(d12CardFaceScoreExact(kept, 'energy'), 3);
  assert.equal(d12CardFaceScore(kept, 'energy'), 3);
  saveInstructorD12Cards(kept, storage, 'owner');
  assert.equal(storage.map.get(INSTRUCTOR_D12_STORAGE_KEY), checkIn);
  assert.equal(loadInstructorD12Scores(storage, 'owner')?.energy, 5);
  assert.deepEqual(loadInstructorD12Cards(storage, 'owner').map((item) => item.id), ['b', 'c', 'd']);
  assert.equal(removeInstructorD12Card(kept, 'missing').length, 3);
});

test('after a removal, remaining cards are re-laid center-out until the grid shrinks', () => {
  // Same rule as LiveD8 showOnDiamond: the mesh is only rebuilt when the count
  // crosses a square-number threshold. On a stable grid the remaining cards are
  // painted center-out again. D8 ranks by rating; this D12 ranks by addedAt.
  const first: InstructorD12Card[] = [
    card({ id: 'a', name: 'Alpha', faceId: 'energy', addedAt: 1, rating: 5 }),
    card({ id: 'b', name: 'Bravo', faceId: 'energy', addedAt: 2, rating: 4 }),
    card({ id: 'c', name: 'Charlie', faceId: 'energy', addedAt: 3, rating: 2 }),
    card({ id: 'd', name: 'Delta', faceId: 'energy', addedAt: 4, rating: 3 }),
  ];
  const model = buildD12Topo(null, { cards: first });
  const faceIndex = model.faces.findIndex((face) => face.id === 'energy');
  assert.equal(model.tiles.filter((tile) => tile.faceIndex === faceIndex).length, 5);
  const before = new Map(d12FaceSlots(model, faceIndex).filter((slot) => slot.moveId).map((slot) => [slot.moveId!, slot.tileIndex]));
  const kept = removeInstructorD12Card(first, 'b');
  showOnD12Face(model, faceIndex, d12CardsInPlaceOrder(kept));
  assert.equal(model.tiles.filter((tile) => tile.faceIndex === faceIndex).length, 5);
  const after = new Map(d12FaceSlots(model, faceIndex).filter((slot) => slot.moveId).map((slot) => [slot.moveId!, slot.tileIndex]));
  assert.equal(after.has('b'), false);
  // a stays on the innermost seat; later cards shift in to fill the hole, like D8.
  assert.equal(after.get('a'), before.get('a'));
  assert.equal(after.get('c'), before.get('b'));
  assert.equal(after.get('d'), before.get('c'));

  const crowded = [
    ...first,
    card({ id: 'e', name: 'Echo', faceId: 'energy', addedAt: 5, rating: 1 }),
    card({ id: 'f', name: 'Foxtrot', faceId: 'energy', addedAt: 6, rating: 5 }),
  ];
  const grown = buildD12Topo(null, { cards: crowded });
  assert.equal(grown.tiles.filter((tile) => tile.faceIndex === faceIndex).length, 20);
  const shrunkCards = removeInstructorD12Card(crowded, 'f');
  const shrunk = buildD12Topo(null, { cards: shrunkCards });
  assert.equal(shrunk.tiles.filter((tile) => tile.faceIndex === faceIndex).length, 5);
  assert.equal(d12FaceSlots(shrunk, faceIndex).filter((slot) => slot.moveId).length, 5);
});

test('shape metric and face-view labels default like the live D8, and the toggle never writes storage', () => {
  assert.deepEqual(
    D12_SHAPE_METRICS.map((item) => [item.id, item.label]),
    [
      ['card-ratings', 'Card ratings'],
      ['check-ins', 'Check-ins'],
    ],
  );
  assert.equal(D12_DEFAULT_SHAPE_METRIC, 'card-ratings');
  assert.deepEqual(
    D12_FACE_VIEWS.map((item) => [item.id, item.label]),
    [
      ['map', 'Map'],
      ['cards', 'Cards'],
    ],
  );
  assert.equal(D12_DEFAULT_FACE_VIEW, 'cards');
  assert.equal(D12_DELETE_CARD, 'Delete');
  assert.equal(D12_CONFIRM_DELETE_CARD, 'Confirm delete');
  assert.equal(D12_KEEP_CARD, 'Keep card');

  const storage = memoryStorage();
  const cards: InstructorD12Card[] = [
    card({ id: 'a', name: 'Alpha', faceId: 'energy', rating: 5 }),
    card({ id: 'b', name: 'Bravo', faceId: 'energy', rating: 1 }),
  ];
  saveInstructorD12Cards(cards, storage, 'owner');
  saveInstructorD12Scores({ energy: 4, safety: 2 }, storage, 'owner');
  const cardsRaw = storage.map.get(INSTRUCTOR_D12_CARDS_STORAGE_KEY)!;
  const scoresRaw = storage.map.get(INSTRUCTOR_D12_STORAGE_KEY)!;
  const scores = loadInstructorD12Scores(storage, 'owner');

  assert.equal(d12FaceRelief('energy', 'card-ratings', cards, scores), 3);
  assert.equal(d12FaceRelief('energy', 'check-ins', cards, scores), 4);
  assert.equal(d12FaceRelief('safety', 'card-ratings', cards, scores), 3);
  assert.equal(d12FaceRelief('safety', 'check-ins', cards, scores), 2);
  assert.equal(d12FaceRelief('preparation', 'check-ins', cards, scores), null);

  const model = buildD12Topo(scores, { cards });
  const energy = model.faces.findIndex((face) => face.id === 'energy');
  const safety = model.faces.findIndex((face) => face.id === 'safety');
  applyD12ShapeMetric(model, 'card-ratings', cards, scores);
  assert.ok(model.tiles.filter((tile) => tile.faceIndex === energy).every((tile) => tile.offset === TOPO_LEVEL[3]));
  applyD12ShapeMetric(model, 'check-ins', cards, scores);
  assert.ok(model.tiles.filter((tile) => tile.faceIndex === energy).every((tile) => tile.offset === TOPO_LEVEL[4]));
  assert.ok(model.tiles.filter((tile) => tile.faceIndex === safety).every((tile) => tile.offset === TOPO_LEVEL[2]));
  const prep = model.faces.findIndex((face) => face.id === 'preparation');
  assert.ok(model.tiles.filter((tile) => tile.faceIndex === prep).every((tile) => tile.offset == null && tile.apex == null));

  assert.equal(storage.map.get(INSTRUCTOR_D12_CARDS_STORAGE_KEY), cardsRaw);
  assert.equal(storage.map.get(INSTRUCTOR_D12_STORAGE_KEY), scoresRaw);
});
