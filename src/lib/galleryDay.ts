/**
 * Today's shared-gallery videos for Daily Lesson Plan.
 * Gallery is the on-device Media Console library (`matboard` IndexedDB, folder `gallery`).
 * Owner uploads stay on this phone — nothing is fetched from Advantage. A later
 * Drive client may point at the same day's file ids; this download does not
 * upload those bytes. A video counts for
 * today when its `addedAt` falls on the device's local calendar day.
 */

import { localDateKey } from './trainingNotesStore.ts';

export const DOWNLOAD_TODAY_LABEL = "Download today's videos";
export const GALLERY_TODAY_EMPTY = 'Nothing in the shared gallery for today.';
export const GALLERY_TODAY_CHECKING = 'Checking the shared gallery…';
export const GALLERY_TODAY_UNAVAILABLE =
  'The shared gallery could not be opened on this device.';

export type GalleryDayClip = {
  id: string;
  label: string;
  mime: string;
  addedAt: number;
};

const VIDEO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
  'video/x-m4v': '.m4v',
  'video/mpeg': '.mpeg',
};

export function isGalleryVideoMime(mime: string): boolean {
  return mime.trim().toLowerCase().startsWith('video/');
}

/** Gallery videos whose save time is on `dateKey` (local `YYYY-MM-DD`). Photos are skipped. */
export function galleryVideosForDay<T extends GalleryDayClip>(
  items: readonly T[],
  dateKey: string,
): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  return items
    .filter(
      (item) =>
        Number.isFinite(item.addedAt) &&
        isGalleryVideoMime(item.mime) &&
        localDateKey(new Date(item.addedAt)) === dateKey,
    )
    .sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
}

export function galleryTodayReadyCopy(count: number, dayLabel = 'today'): string {
  const day = dayLabel.trim() || 'today';
  if (count === 1) return `1 video in the shared gallery for ${day}.`;
  return `${count} videos in the shared gallery for ${day}.`;
}

export function galleryVideoExtension(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return VIDEO_EXT[normalized] ?? '.mp4';
}

export function galleryVideoDownloadName(label: string, mime: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const base = slug || 'video';
  const n = String(Math.max(0, index) + 1).padStart(2, '0');
  return `today-${n}-${base}${galleryVideoExtension(mime)}`;
}

/** Browser save of one gallery blob. No-op when there is no document (tests). */
export function saveBlobDownload(filename: string, blob: Blob): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadGalleryVideos(
  videos: readonly { label: string; mime: string; blob: Blob }[],
  pauseMs = 300,
): Promise<number> {
  let saved = 0;
  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];
    saveBlobDownload(galleryVideoDownloadName(video.label, video.mime, index), video.blob);
    saved += 1;
    if (index < videos.length - 1 && pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
  return saved;
}
