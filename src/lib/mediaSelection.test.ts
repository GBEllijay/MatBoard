import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLEAR_SELECTION_LABEL,
  SELECT_ALL_LABEL,
  allVisibleSelected,
  anyVisibleSelected,
  clearVisibleSelection,
  selectAllVisible,
  toggleSelection,
  visibleSelectionCounts,
} from './mediaSelection.ts';

const photo = (id: string) => ({ id, name: `${id}.jpg` });

test('Select all and Clear use one pair of labels', () => {
  assert.equal(SELECT_ALL_LABEL, 'Select all');
  assert.equal(CLEAR_SELECTION_LABEL, 'Clear');
});

test('Select all adds the folder on screen and leaves other folders selected', () => {
  const here = [photo('a'), photo('b'), photo('b')];
  const elsewhere = [photo('keep')];
  const selected = selectAllVisible(elsewhere, here);
  assert.deepEqual(
    selected.map((item) => item.id),
    ['keep', 'a', 'b'],
  );
  assert.equal(allVisibleSelected(selected, [photo('a'), photo('b')]), true);
  assert.equal(anyVisibleSelected(selected, [photo('a')]), true);
  assert.deepEqual(visibleSelectionCounts(selected, [photo('a'), photo('missing')]), {
    chosen: 1,
    total: 2,
  });
  const again = selectAllVisible(selected, here);
  assert.equal(again.length, selected.length);
});

test('Clear drops only the folder on screen', () => {
  const selected = [photo('keep'), photo('a'), photo('b')];
  const cleared = clearVisibleSelection(selected, [photo('a'), photo('b')]);
  assert.deepEqual(
    cleared.map((item) => item.id),
    ['keep'],
  );
  assert.equal(anyVisibleSelected(cleared, [photo('a'), photo('b')]), false);
  assert.equal(allVisibleSelected(cleared, [photo('a'), photo('b')]), false);
  assert.deepEqual(clearVisibleSelection(cleared, []), cleared);
});

test('one tap still selects or deselects a single item', () => {
  const once = toggleSelection([], photo('a'));
  const both = toggleSelection(once, photo('b'));
  const back = toggleSelection(both, photo(' a '));
  assert.deepEqual(
    both.map((item) => item.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    back.map((item) => item.id),
    ['b'],
  );
  assert.deepEqual(toggleSelection([], photo('  ')), []);
});
