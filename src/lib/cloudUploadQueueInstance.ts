/**
 * The one upload queue for this page. Media Console and the Advantage Cloud
 * home card share it, so a batch started on one shows on the other.
 */

import { abortAdvantageCloudUpload, uploadAdvantageCloudFile } from './advantageCloudMedia.ts';
import { cloudFingerprint } from './cloudFingerprint.ts';
import { createCloudUploadQueue, type CloudQueueInput, type CloudQueuePurpose } from './cloudUploadQueue.ts';
import { CLOUD_RETRY_ATTEMPTS } from './cloudUploadRetry.ts';

export const cloudUploadQueue = createCloudUploadQueue({
  upload: (job) =>
    uploadAdvantageCloudFile({
      purpose: job.purpose,
      dateKey: job.dateKey,
      file: job.file,
      fileName: job.name,
      mime: job.mime,
      fingerprint: job.fingerprint,
      signal: job.signal,
      resume: job.resume,
      onProgress: job.onProgress,
      retry: { attempts: CLOUD_RETRY_ATTEMPTS },
    }),
  fingerprint: cloudFingerprint,
  abort: async (resume) => {
    if (resume.key && resume.uploadId) await abortAdvantageCloudUpload({ key: resume.key, uploadId: resume.uploadId });
  },
});

function isVideo(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name);
}

export function cloudQueueMime(file: File): string {
  if (file.type) return file.type;
  return isVideo(file) ? 'video/mp4' : 'image/jpeg';
}

/**
 * Gallery picks: photos and videos both go to gallery/ (owner approved,
 * seats pending when the approval switch is on; the server decides).
 */
export function galleryQueueInputs(files: readonly File[], dateKey: string): CloudQueueInput[] {
  return files
    .filter((file) => file.size > 0)
    .map((file) => ({ file, name: file.name || 'photo', mime: cloudQueueMime(file), purpose: 'gallery' as const, dateKey }));
}

/** Home card "Upload daily videos and photos": videos are daily videos, photos go to the gallery. */
export function dailyQueueInputs(files: readonly File[], dateKey: string): CloudQueueInput[] {
  return files
    .filter((file) => file.size > 0)
    .map((file) => {
      const purpose: CloudQueuePurpose = isVideo(file) ? 'daily-video' : 'gallery';
      return { file, name: file.name || (purpose === 'daily-video' ? 'video.mp4' : 'photo'), mime: cloudQueueMime(file), purpose, dateKey };
    });
}
