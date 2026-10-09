/**
 * Gallery show dates and linked technique clips.
 * A link stores the clip id and that clip's loop timer. The bytes stay in
 * Daily Training Videos. The gallery does not keep a second copy.
 */

export type GallerySchedule = 'always' | 'date' | 'next-class';

export const GALLERY_CAPTION_MAX = 200;
export const GALLERY_SHOW_ON_DATE = 'Show on date';
export const GALLERY_NEXT_CLASS = 'Next class';
export const GALLERY_LINK_TECHNIQUES = "Link this day's technique clips";
export const GALLERY_LINK_DONE = 'Linked. The gallery plays those clips with their loop timer and does not copy the files.';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function gallerySchedule(value: unknown): GallerySchedule {
  return value === 'date' || value === 'next-class' ? value : 'always';
}

export function galleryShowDate(value: unknown): string {
  return typeof value === 'string' && DATE_KEY.test(value) ? value : '';
}

export function galleryCaption(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, GALLERY_CAPTION_MAX) : '';
}

export function galleryLoopSec(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(30 * 60, Math.round(value));
}

export function galleryClipId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

/**
 * Unscheduled gallery items still play. A date or next-class choice plays only
 * on that day. Other folders are not filtered here.
 */
export function galleryItemShows(
  item: { folderId?: string; schedule?: unknown; showDate?: unknown },
  todayKey: string,
  nextClass: string | null,
): boolean {
  if (item.folderId && item.folderId !== 'gallery') return true;
  const schedule = gallerySchedule(item.schedule);
  if (schedule === 'always') return true;
  if (schedule === 'date') return galleryShowDate(item.showDate) === todayKey;
  return Boolean(nextClass && nextClass === todayKey);
}

/** Soonest class date on or after today. */
export function nextClassFromDays(dateKeys: readonly string[], todayKey: string): string | null {
  return [...dateKeys].filter((dateKey) => dateKey >= todayKey).sort()[0] ?? null;
}

export function clipsNotYetLinked<T extends { clipId: string }>(
  existingClipIds: readonly string[],
  clips: readonly T[],
): T[] {
  const seen = new Set(existingClipIds.filter(Boolean));
  const next: T[] = [];
  for (const clip of clips) {
    const id = clip.clipId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(clip);
  }
  return next;
}
