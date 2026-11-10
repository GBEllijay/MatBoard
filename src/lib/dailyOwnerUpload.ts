/**
 * Daily videos go to Advantage Cloud.
 * Photos use the gallery publish path. When this license has Advantage Cloud,
 * the owner lands in gallery/approved and a Coach or Instructors seat lands
 * in gallery/pending. With no Cloud, the photo stays on this phone, or in
 * Google Drive or OneDrive, and those notes say Cloud did not store it.
 * A Cloud save refreshes the usage counter.
 */

import { CLOUD_SAVED_MESSAGE, gymActorForCloud, notifyCloudMedia, uploadAdvantageCloudFile } from './advantageCloudMedia.ts';
import { publishGymFile } from './gymPublish.ts';
import { readCurrentSeat } from './instructorSeats.ts';
import { localDateKey } from './trainingNotesStore.ts';
import type { GymActor } from './gymTree.ts';

export const CLOUD_DAILY_MEDIA_LABEL = 'Upload daily videos and photos';
export const CLOUD_PHOTO_PHONE_NOTE = 'Saved on this phone. Advantage Cloud did not store this photo.';
export const CLOUD_PHOTO_DRIVE_NOTE = 'Saved in the gallery folder. Advantage Cloud did not store this photo.';
export const CLOUD_PHOTO_CLOUD_NOTE = 'Uploaded to Advantage Cloud.';
export const CLOUD_PHOTO_FAILED_NOTE =
  'Saved on this phone. The gallery folder could not take this photo. Advantage Cloud did not store it.';

export function isDailyPhoto(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

export function isDailyVideo(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name);
}

export function dailyMediaDateKey(now = new Date()): string {
  return localDateKey(now);
}

function dailyPhotoActor(): GymActor {
  try {
    const seat = readCurrentSeat();
    if (!seat) return 'owner';
    return gymActorForCloud('seat', seat.presetId);
  } catch {
    return 'owner';
  }
}

function cloudPhotoNote(lane: string | null): string {
  if (lane === 'approved') return `${CLOUD_PHOTO_CLOUD_NOTE} Approved.`;
  if (lane === 'pending') return `${CLOUD_PHOTO_CLOUD_NOTE} Pending.`;
  return CLOUD_PHOTO_CLOUD_NOTE;
}

export async function uploadDailyMediaFile(
  file: File,
  dateKey = dailyMediaDateKey(),
  cloud?: { token?: string; fetcher?: typeof fetch; role?: GymActor },
): Promise<{ ok: boolean; message: string; cloud: boolean }> {
  if (isDailyPhoto(file)) {
    const published = await publishGymFile({
      purpose: 'gallery',
      role: cloud?.role ?? dailyPhotoActor(),
      kind: 'photo',
      dateKey,
      fileName: file.name.trim() || 'class-photo',
      bytes: file,
      mime: file.type || 'image/jpeg',
      cloudToken: cloud?.token,
      cloudFetcher: cloud?.fetcher,
    });
    const home = published.home as string;
    if (home === 'advantage-cloud' && !published.failed && published.remoteId) {
      notifyCloudMedia();
      const lane = published.route.ok ? published.route.lane : null;
      return { ok: true, message: cloudPhotoNote(lane), cloud: true };
    }
    if (published.failed) return { ok: false, message: CLOUD_PHOTO_FAILED_NOTE, cloud: false };
    if (home === 'google-drive' || home === 'onedrive') return { ok: true, message: CLOUD_PHOTO_DRIVE_NOTE, cloud: false };
    return { ok: true, message: CLOUD_PHOTO_PHONE_NOTE, cloud: false };
  }
  if (!isDailyVideo(file)) return { ok: false, message: 'That file is not a photo or a video.', cloud: false };
  const result = await uploadAdvantageCloudFile({
    purpose: 'daily-video',
    dateKey,
    file,
    fileName: file.name,
    mime: file.type || 'video/mp4',
  });
  return { ok: result.ok, message: result.ok ? CLOUD_SAVED_MESSAGE : result.message, cloud: result.ok };
}
