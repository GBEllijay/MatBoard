import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCHEDULE_SCROLL_EDGE_PAUSE_MS,
  SCHEDULE_SCROLL_SPEED_PX,
  SCHEDULE_SCROLL_START_PAUSE_MS,
  createScheduleScroll,
  stepScheduleScroll,
  type ScheduleScroll,
} from './scheduleScroll.ts';

const FRAME_MS = 1000 / 60;

function frames(scroll: ScheduleScroll, max: number, count: number, start = 0): ScheduleScroll {
  let last = start;
  let now = start;
  let motion = scroll;
  for (let i = 0; i < count; i += 1) {
    now += FRAME_MS;
    motion = stepScheduleScroll(motion, max, now, last);
    last = now;
  }
  return motion;
}

function advance(scroll: ScheduleScroll, max: number, ms: number, start: number): { motion: ScheduleScroll; now: number } {
  const count = Math.ceil(ms / FRAME_MS);
  let last = start;
  let now = start;
  let motion = scroll;
  for (let i = 0; i < count; i += 1) {
    now += FRAME_MS;
    motion = stepScheduleScroll(motion, max, now, last);
    last = now;
  }
  return { motion, now };
}

describe('stepScheduleScroll', () => {
  it('holds at the top, then scrolls down', () => {
    const start = createScheduleScroll(0, 0);
    const held = frames(start, 400, 60);
    assert.equal(held.pos, 0);
    assert.equal(held.dir, 1);
    const moving = frames(start, 400, 120);
    assert.ok(moving.pos > 0);
    assert.equal(moving.dir, 1);
    assert.equal(SCHEDULE_SCROLL_START_PAUSE_MS, 1600);
  });

  it('pauses at the bottom, then scrolls back up without re-arming the pause', () => {
    const max = 400;
    const arriving = stepScheduleScroll({ pos: max - 0.2, dir: 1, holdUntil: 0 }, max, 1000, 1000 - FRAME_MS);
    assert.equal(arriving.pos, max);
    assert.equal(arriving.dir, -1);
    assert.equal(arriving.holdUntil, 1000 + SCHEDULE_SCROLL_EDGE_PAUSE_MS);

    const stillHeld = stepScheduleScroll(arriving, max, arriving.holdUntil - 1, arriving.holdUntil - 1 - FRAME_MS);
    assert.equal(stillHeld, arriving);

    const rising = stepScheduleScroll(arriving, max, arriving.holdUntil, arriving.holdUntil - FRAME_MS);
    const step = SCHEDULE_SCROLL_SPEED_PX * (FRAME_MS / 1000);
    assert.ok(step < 1, 'a frame step stays inside the old 1px bottom band');
    assert.equal(rising.pos, max - 1);
    assert.equal(rising.dir, -1);
    assert.equal(rising.holdUntil, arriving.holdUntil);

    const stillRising = stepScheduleScroll(rising, max, arriving.holdUntil + FRAME_MS, arriving.holdUntil);
    assert.ok(stillRising.pos < rising.pos);
    assert.equal(stillRising.dir, -1);
    assert.equal(stillRising.holdUntil, arriving.holdUntil);
  });

  it('pauses at the top, then scrolls down again', () => {
    const arriving = stepScheduleScroll({ pos: 0.2, dir: -1, holdUntil: 0 }, 400, 5000, 5000 - FRAME_MS);
    assert.equal(arriving.pos, 0);
    assert.equal(arriving.dir, 1);
    assert.equal(arriving.holdUntil, 5000 + SCHEDULE_SCROLL_EDGE_PAUSE_MS);

    const falling = stepScheduleScroll(arriving, 400, arriving.holdUntil, arriving.holdUntil - FRAME_MS);
    assert.equal(falling.pos, 1);
    assert.equal(falling.dir, 1);
    assert.equal(falling.holdUntil, arriving.holdUntil);
  });

  it('bounces for several round trips instead of parking at the bottom', () => {
    const max = 72;
    const tripMs = (max / SCHEDULE_SCROLL_SPEED_PX) * 1000;
    let now = 0;
    let last = 0;
    let motion = createScheduleScroll(0, 0);
    let bottomSince: number | null = null;
    let bottomDepartures = 0;
    let topDepartures = 0;
    const cap = SCHEDULE_SCROLL_START_PAUSE_MS + (tripMs + SCHEDULE_SCROLL_EDGE_PAUSE_MS) * 8;
    while (now < cap && (bottomDepartures < 3 || topDepartures < 3)) {
      now += FRAME_MS;
      const prev = motion.pos;
      motion = stepScheduleScroll(motion, max, now, last);
      last = now;
      const atBottom = motion.pos >= max - 0.01;
      if (atBottom && bottomSince == null) bottomSince = now;
      if (!atBottom && bottomSince != null) {
        assert.ok(now - bottomSince <= SCHEDULE_SCROLL_EDGE_PAUSE_MS + FRAME_MS * 2);
        bottomSince = null;
        bottomDepartures += 1;
      }
      if (prev <= 0.01 && motion.pos > 0) topDepartures += 1;
    }
    assert.ok(bottomDepartures >= 3);
    assert.ok(topDepartures >= 3);
    assert.equal(bottomSince, null);
  });

  it('still bounces when the screen keeps only whole pixels', () => {
    const max = 80;
    let now = 0;
    let last = 0;
    let motion = createScheduleScroll(0, 0);
    let applied = 0;
    let sawBottom = false;
    let rose = false;
    const end = SCHEDULE_SCROLL_START_PAUSE_MS + (max / SCHEDULE_SCROLL_SPEED_PX) * 1000 + SCHEDULE_SCROLL_EDGE_PAUSE_MS + 800;
    while (now < end) {
      now += FRAME_MS;
      motion = stepScheduleScroll(motion, max, now, last);
      last = now;
      applied = Math.round(motion.pos);
      if (applied >= max) sawBottom = true;
      if (sawBottom && applied <= max - 2) rose = true;
    }
    assert.equal(sawBottom, true);
    assert.equal(rose, true);
    assert.equal(motion.dir, -1);
  });

  it('loops down, pause, up, pause, down', () => {
    const max = 90;
    const downMs = (max / SCHEDULE_SCROLL_SPEED_PX) * 1000;
    let now = 0;
    let motion = createScheduleScroll(0, 0);

    ({ motion, now } = advance(motion, max, SCHEDULE_SCROLL_START_PAUSE_MS + downMs + 100, now));
    assert.equal(motion.pos, max);
    assert.equal(motion.dir, -1);

    ({ motion, now } = advance(motion, max, SCHEDULE_SCROLL_EDGE_PAUSE_MS + 400, now));
    assert.ok(motion.pos < max);
    assert.equal(motion.dir, -1);

    ({ motion, now } = advance(motion, max, downMs + 200, now));
    assert.equal(motion.pos, 0);
    assert.equal(motion.dir, 1);

    ({ motion, now } = advance(motion, max, SCHEDULE_SCROLL_EDGE_PAUSE_MS + 400, now));
    assert.ok(motion.pos > 0);
    assert.equal(motion.dir, 1);
  });

  it('leaves a board that already fits on screen', () => {
    const start = { pos: 0, dir: 1 as const, holdUntil: 0 };
    assert.equal(stepScheduleScroll(start, 4, 1000, 0), start);
    assert.equal(stepScheduleScroll(start, 0, 1000, 0), start);
  });
});
