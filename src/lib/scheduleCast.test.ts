import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCHEDULE_CAST_DWELL_MS,
  insertScheduleCastSlide,
  scheduleCastDwellMs,
} from './scheduleCast.ts';

describe('insertScheduleCastSlide', () => {
  it('places the week board after Gallery and before Pro Shop', () => {
    const slides = [
      { kind: 'media', id: 'g1', item: { folderId: 'gallery' } },
      { kind: 'shop', id: 's1', items: [] },
      { kind: 'media', id: 'e1', item: { folderId: 'events' } },
    ];
    const next = insertScheduleCastSlide(slides, true);
    assert.deepEqual(
      next.map((slide) => slide.kind),
      ['media', 'schedule', 'shop', 'media'],
    );
    assert.equal(next[1]?.id, 'class-schedule');
  });

  it('starts the cast with the week board when Gallery is empty', () => {
    const slides = [{ kind: 'shop', id: 's1' }];
    const next = insertScheduleCastSlide(slides, true);
    assert.equal(next[0]?.kind, 'schedule');
    assert.equal(next[1]?.kind, 'shop');
  });

  it('appends after a Gallery-only queue and stays out when the cast is off', () => {
    const slides = [{ kind: 'media', id: 'g1', item: { folderId: 'gallery' } }];
    assert.equal(insertScheduleCastSlide(slides, true).at(-1)?.kind, 'schedule');
    assert.equal(insertScheduleCastSlide(slides, false).some((slide) => slide.kind === 'schedule'), false);
    assert.equal(insertScheduleCastSlide([], true)[0]?.kind, 'schedule');
  });
});

describe('scheduleCastDwellMs', () => {
  it('holds the week board at least half a minute', () => {
    assert.equal(scheduleCastDwellMs(10_000), SCHEDULE_CAST_DWELL_MS);
    assert.equal(scheduleCastDwellMs(45_000), 45_000);
    assert.equal(SCHEDULE_CAST_DWELL_MS, 30_000);
  });
});
