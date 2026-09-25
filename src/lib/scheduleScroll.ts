/** Auto-scroll for the Class Schedule week and month boards on a gym TV. */

/** Pixels per second. Slow enough to read a class card while the board drifts. */
export const SCHEDULE_SCROLL_SPEED_PX = 18;

/** Hold at the top before the first downward pass. */
export const SCHEDULE_SCROLL_START_PAUSE_MS = 1600;

/** Hold at the top or bottom before reversing. A few seconds, long enough to read the edge. */
export const SCHEDULE_SCROLL_EDGE_PAUSE_MS = 2400;

export type ScheduleScrollDir = 1 | -1;

export type ScheduleScroll = {
  pos: number;
  /** 1 moves toward the bottom. -1 moves toward the top. */
  dir: ScheduleScrollDir;
  holdUntil: number;
};

export function createScheduleScroll(now: number, pos = 0): ScheduleScroll {
  return {
    pos,
    dir: 1,
    holdUntil: now + SCHEDULE_SCROLL_START_PAUSE_MS,
  };
}

/**
 * Advance one frame of the cast auto-scroll.
 *
 * Reverse only while still traveling into an edge. Checking "within 1px of
 * the bottom" re-armed the pause on every frame: the upward step is a fraction
 * of a pixel, so the board reached the bottom and sat there.
 */
export function stepScheduleScroll(
  scroll: ScheduleScroll,
  max: number,
  now: number,
  last: number,
): ScheduleScroll {
  if (!(max > 4) || now < scroll.holdUntil) return scroll;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  const moved = scroll.pos + scroll.dir * SCHEDULE_SCROLL_SPEED_PX * dt;
  if (scroll.dir > 0 && moved >= max) {
    return { pos: max, dir: -1, holdUntil: now + SCHEDULE_SCROLL_EDGE_PAUSE_MS };
  }
  if (scroll.dir < 0 && moved <= 0) {
    return { pos: 0, dir: 1, holdUntil: now + SCHEDULE_SCROLL_EDGE_PAUSE_MS };
  }
  const pos = Math.min(max, Math.max(0, moved));
  if (pos === scroll.pos) return scroll;
  return { pos, dir: scroll.dir, holdUntil: scroll.holdUntil };
}
