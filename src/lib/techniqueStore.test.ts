import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withFolderOrder } from './playlist.ts';
import {
  clampDrillSec,
  clipSlotsLeft,
  DEFAULT_DRILL_SEC,
  DRILL_PRESETS_SEC,
  isDrillPreset,
  MAX_DRILL_SEC,
  MAX_TECHNIQUE_CLIPS,
  MIN_DRILL_SEC,
  pickAddableVideos,
  remainingOnStart,
  resolveSelectedId,
  tickRemainingMs,
} from './techniqueLogic.ts';

const TECHNIQUE_FOLDER_ID = 'techniques';

function video(name: string, type = 'video/mp4'): File {
  return new File(['clip'], name, { type });
}

describe('clipSlotsLeft', () => {
  it('caps the list at 10 clips', () => {
    assert.equal(clipSlotsLeft(0), 10);
    assert.equal(clipSlotsLeft(7), 3);
    assert.equal(clipSlotsLeft(MAX_TECHNIQUE_CLIPS), 0);
    assert.equal(clipSlotsLeft(99), 0);
  });
});

describe('pickAddableVideos', () => {
  it('keeps videos and drops other files', () => {
    const picked = pickAddableVideos(
      [video('armbar.mp4'), new File(['x'], 'notes.txt', { type: 'text/plain' }), video('sweep.webm', 'video/webm')],
      10,
    );
    assert.deepEqual(
      picked.map((file) => file.name),
      ['armbar.mp4', 'sweep.webm'],
    );
  });

  it('accepts common gym-TV extensions when the MIME type is empty', () => {
    const picked = pickAddableVideos([new File(['x'], 'pass.MOV'), new File(['x'], 'photo.jpg')], 10);
    assert.deepEqual(
      picked.map((file) => file.name),
      ['pass.MOV'],
    );
  });

  it('does not add more than the remaining slots', () => {
    const picked = pickAddableVideos([video('a.mp4'), video('b.mp4'), video('c.mp4')], 2);
    assert.equal(picked.length, 2);
    assert.deepEqual(
      picked.map((file) => file.name),
      ['a.mp4', 'b.mp4'],
    );
  });

  it('adds nothing when the list is full', () => {
    assert.deepEqual(pickAddableVideos([video('extra.mp4')], 0), []);
  });
});

describe('resolveSelectedId', () => {
  it('keeps a selected clip that is still in the list', () => {
    assert.equal(resolveSelectedId('b', ['a', 'b', 'c']), 'b');
  });

  it('falls back to the first clip after a remove', () => {
    assert.equal(resolveSelectedId('gone', ['a', 'c']), 'a');
    assert.equal(resolveSelectedId(null, ['a']), 'a');
  });

  it('clears selection when the list is empty', () => {
    assert.equal(resolveSelectedId('a', []), null);
  });
});

describe('drill timer', () => {
  it('keeps 2:30, 5:00, and 7:00 as presets', () => {
    assert.deepEqual([...DRILL_PRESETS_SEC], [150, 300, 420]);
    assert.equal(isDrillPreset(300), true);
    assert.equal(isDrillPreset(90), false);
  });

  it('clamps custom drill length', () => {
    assert.equal(clampDrillSec(Number.NaN), DEFAULT_DRILL_SEC);
    assert.equal(clampDrillSec(1), MIN_DRILL_SEC);
    assert.equal(clampDrillSec(99_999), MAX_DRILL_SEC);
  });

  it('resumes leftover time, then resets after 0:00', () => {
    assert.equal(remainingOnStart(45_000, 300_000), 45_000);
    assert.equal(remainingOnStart(0, 300_000), 300_000);
  });

  it('counts down to zero and stops there', () => {
    assert.equal(tickRemainingMs(250, 100), 150);
    assert.equal(tickRemainingMs(80, 100), 0);
    assert.equal(tickRemainingMs(0, 100), 0);
  });
});

describe('technique order', () => {
  it('reuses the shared playlist reorder helper', () => {
    const clips = [
      { id: 'a', label: 'A', sortOrder: 0, addedAt: 1, folderId: TECHNIQUE_FOLDER_ID },
      { id: 'b', label: 'B', sortOrder: 1, addedAt: 2, folderId: TECHNIQUE_FOLDER_ID },
      { id: 'c', label: 'C', sortOrder: 2, addedAt: 3, folderId: TECHNIQUE_FOLDER_ID },
    ];
    const next = withFolderOrder(clips, TECHNIQUE_FOLDER_ID, ['c', 'a', 'b'], [TECHNIQUE_FOLDER_ID]);
    assert.deepEqual(
      next.map((clip) => clip.id),
      ['c', 'a', 'b'],
    );
    assert.deepEqual(
      next.map((clip) => clip.sortOrder),
      [0, 1, 2],
    );
  });
});
