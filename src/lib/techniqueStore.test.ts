import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withFolderOrder } from './playlist.ts';
import {
  assignOrphanClips,
  canAssignClip,
  clampDrillSec,
  clipCount,
  COOLDOWN_SLOT_ID,
  DEFAULT_DRILL_SEC,
  DRILL_PRESETS_SEC,
  emptyVideoPlan,
  insertTechniqueSlot,
  isDrillPreset,
  MAX_DRILL_SEC,
  MAX_TECHNIQUE_SLOTS,
  MIN_DRILL_SEC,
  nextTechniqueSlotId,
  pickAddableVideos,
  planFromFlatClips,
  remainingOnStart,
  resolveSelectedId,
  sanitizeVideoPlan,
  setSlotClip,
  tickRemainingMs,
  WARMUP_SLOT_ID,
} from './techniqueLogic.ts';

const TECHNIQUE_FOLDER_ID = 'techniques';

function video(name: string, type = 'video/mp4'): File {
  return new File(['clip'], name, { type });
}

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

describe('video slot plan', () => {
  it('starts with warm-up, three techniques, and cool down last', () => {
    const plan = emptyVideoPlan();
    assert.deepEqual(
      plan.slots.map((slot) => slot.kind),
      ['warmup', 'technique', 'technique', 'technique', 'cooldown'],
    );
    assert.equal(plan.slots[0]?.slotId, WARMUP_SLOT_ID);
    assert.equal(plan.slots.at(-1)?.slotId, COOLDOWN_SLOT_ID);
    assert.equal(plan.selectedSlotId, 'tech-1');
    assert.equal(clipCount(plan), 0);
  });

  it('maps a flat clip list onto technique cards and keeps warm-up and cool down empty', () => {
    const plan = planFromFlatClips({
      clipIds: ['c1', 'c2', 'c3', 'c4'],
      selectedClipId: 'c2',
      drillSec: 150,
    });
    const techniques = plan.slots.filter((slot) => slot.kind === 'technique');
    assert.equal(techniques.length, 4);
    assert.deepEqual(
      techniques.map((slot) => slot.clipId),
      ['c1', 'c2', 'c3', 'c4'],
    );
    assert.ok(techniques.every((slot) => slot.drillSec === 150));
    assert.equal(plan.slots[0]?.clipId, null);
    assert.equal(plan.slots.at(-1)?.clipId, null);
    assert.equal(plan.selectedSlotId, 'tech-2');
    assert.equal(plan.slots.at(-1)?.kind, 'cooldown');
  });

  it('inserts another technique immediately before cool down', () => {
    const plan = emptyVideoPlan();
    const next = insertTechniqueSlot(plan, nextTechniqueSlotId(plan));
    assert.ok(next);
    assert.deepEqual(
      next.slots.map((slot) => slot.slotId),
      ['warmup', 'tech-1', 'tech-2', 'tech-3', 'tech-4', 'cooldown'],
    );
  });

  it('stops adding technique cards at 10', () => {
    const ids = Array.from({ length: MAX_TECHNIQUE_SLOTS }, (_, index) => `c${index}`);
    const full = planFromFlatClips({ clipIds: ids });
    assert.equal(full.slots.filter((slot) => slot.kind === 'technique').length, MAX_TECHNIQUE_SLOTS);
    assert.equal(insertTechniqueSlot(full, 'tech-extra'), null);
  });

  it('still allows a warm-up clip when every technique card already has one', () => {
    const plan = planFromFlatClips({
      clipIds: Array.from({ length: MAX_TECHNIQUE_SLOTS }, (_, index) => `c${index}`),
    });
    const warmupId = plan.slots[0]?.slotId ?? WARMUP_SLOT_ID;
    assert.equal(clipCount(plan), MAX_TECHNIQUE_SLOTS);
    assert.equal(canAssignClip(plan, warmupId), true);
    assert.equal(canAssignClip(plan, 'tech-1'), true);
    const moved = setSlotClip(plan, warmupId, 'c0');
    assert.equal(moved.slots[0]?.clipId, 'c0');
    assert.equal(moved.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, null);
    assert.equal(clipCount(moved), MAX_TECHNIQUE_SLOTS);
  });

  it('places orphan clips on empty technique cards before warm-up', () => {
    const plan = emptyVideoPlan();
    const placed = assignOrphanClips(plan, ['old-a', 'old-b']);
    assert.equal(placed.changed, true);
    assert.equal(placed.plan.slots[0]?.clipId, null);
    assert.equal(placed.plan.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, 'old-a');
    assert.equal(placed.plan.slots.find((slot) => slot.slotId === 'tech-2')?.clipId, 'old-b');
    assert.equal(placed.plan.slots.at(-1)?.clipId, null);
  });

  it('leaves a valid plan unchanged and drops unknown clip ids', () => {
    const plan = emptyVideoPlan();
    const same = sanitizeVideoPlan(plan, []);
    assert.equal(same.changed, false);
    assert.equal(same.plan.selectedSlotId, plan.selectedSlotId);

    const dirty = setSlotClip(plan, 'tech-1', 'missing');
    const repaired = sanitizeVideoPlan(dirty, []);
    assert.equal(repaired.changed, true);
    assert.equal(repaired.plan.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, null);
    assert.equal(repaired.plan.slots.at(-1)?.kind, 'cooldown');
  });
});
