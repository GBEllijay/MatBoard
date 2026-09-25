import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCoachSwipe,
  coachSwipeTarget,
  swipeStartsInBrowserEdge,
  SWIPE_EDGE_PX,
  SWIPE_MIN_PX,
} from './coachSwipe.ts';

test('only a clear horizontal swipe counts', () => {
  assert.equal(classifyCoachSwipe(-SWIPE_MIN_PX, 10), 'left');
  assert.equal(classifyCoachSwipe(SWIPE_MIN_PX + 20, 12), 'right');
  assert.equal(classifyCoachSwipe(40, 0), null);
  assert.equal(classifyCoachSwipe(-120, 90), null);
  assert.equal(classifyCoachSwipe(0, 200), null);
});

test('screen-edge starts stay with the browser', () => {
  assert.equal(swipeStartsInBrowserEdge(0, 400), true);
  assert.equal(swipeStartsInBrowserEdge(SWIPE_EDGE_PX - 1, 400), true);
  assert.equal(swipeStartsInBrowserEdge(390, 400), true);
  assert.equal(swipeStartsInBrowserEdge(80, 400), false);
});

test('coach tools swipe in order, and roster only goes right to the bracket', () => {
  assert.equal(coachSwipeTarget('/notes', 'left'), '/techniques');
  assert.equal(coachSwipeTarget('/notes', 'right'), null);
  assert.equal(coachSwipeTarget('/techniques', 'left'), '/technique-tree');
  assert.equal(coachSwipeTarget('/techniques', 'right'), '/notes');
  assert.equal(coachSwipeTarget('/technique-tree', 'left'), null);
  assert.equal(coachSwipeTarget('/technique-tree', 'right'), '/techniques');
  assert.equal(coachSwipeTarget('/roster', 'right'), '/tournament');
  assert.equal(coachSwipeTarget('/roster', 'left'), null);
  assert.equal(coachSwipeTarget('/tournament', 'left'), null);
  assert.equal(coachSwipeTarget('/tournament', 'right'), null);
});
