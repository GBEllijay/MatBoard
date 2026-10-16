/** Where the Class Schedule week board sits in the Media Console cast. */

export const SCHEDULE_CAST_SLIDE_ID = 'class-schedule';

/** Long enough to read a full week. Photo interval still wins when it is longer. */
export const SCHEDULE_CAST_DWELL_MS = 30_000;

export type ScheduleCastSlide = {
  kind: 'schedule';
  id: typeof SCHEDULE_CAST_SLIDE_ID;
};

type CastLike = {
  kind: string;
  item?: { folderId?: string };
};

export function scheduleCastDwellMs(photoIntervalMs: number): number {
  const interval = Number.isFinite(photoIntervalMs) ? photoIntervalMs : 0;
  return Math.max(interval, SCHEDULE_CAST_DWELL_MS);
}

/**
 * Insert one week-board slide after Gallery and before Pro Shop / Events.
 * `include` is false when the owner turned the cast off or there are no classes.
 */
export function insertScheduleCastSlide<T extends CastLike>(
  slides: readonly T[],
  include: boolean,
): Array<T | ScheduleCastSlide> {
  if (!include) return [...slides];
  const schedule: ScheduleCastSlide = { kind: 'schedule', id: SCHEDULE_CAST_SLIDE_ID };
  const insertAt = slides.findIndex((slide) => {
    if (slide.kind === 'shop') return true;
    if (slide.kind === 'media') {
      const folder = slide.item?.folderId;
      return Boolean(folder && folder !== 'gallery');
    }
    return false;
  });
  if (insertAt < 0) return [...slides, schedule];
  return [...slides.slice(0, insertAt), schedule, ...slides.slice(insertAt)];
}
