/**
 * The Gallery page keeps every picked photo on the phone, then copies it to
 * Advantage Cloud. That copy used to run with `.catch(() => undefined)` and
 * ignored a `failed: true` result, so a refused or dropped upload left no
 * trace: the live bucket had no gallery/ objects at all. Google Photos and
 * Drive imports never copied to Cloud. This helper copies, counts, and says
 * what happened in one line the page shows.
 */

import { publishGymFile, type GymPublishResult } from './gymPublish.ts';
import type { GymActor } from './gymTree.ts';

export type CloudCopySummary = {
  attempted: number;
  copied: number;
  waiting: number;
  failed: number;
  /** The last server reason for a failed copy. */
  message: string;
};

export const CLOUD_COPY_UNREACHABLE = 'Advantage Cloud could not be reached.';

/**
 * Null when Advantage Cloud is not in play on this device (not signed in, or
 * no Cloud on this license). Then the copy went to Drive, OneDrive, or nowhere,
 * exactly as before, and the page shows nothing new.
 */
export async function copyFilesToCloudGallery(
  files: readonly File[],
  input: {
    dateKey: string;
    role?: GymActor;
    /** Google Photos and Drive imports: Cloud only, never back to Drive. */
    cloudOnly?: boolean;
    publish?: typeof publishGymFile;
  },
): Promise<CloudCopySummary | null> {
  const publish = input.publish ?? publishGymFile;
  const summary: CloudCopySummary = { attempted: 0, copied: 0, waiting: 0, failed: 0, message: '' };
  for (const file of files) {
    const mime = file.type || (/\.(mp4|mov|m4v|webm)$/i.test(file.name) ? 'video/mp4' : 'image/jpeg');
    let result: GymPublishResult | null;
    try {
      result = await publish({
        purpose: 'gallery',
        role: input.role ?? 'owner',
        kind: mime.startsWith('video/') ? 'video' : 'photo',
        dateKey: input.dateKey,
        fileName: file.name || 'photo',
        bytes: file,
        mime,
        cloudOnly: input.cloudOnly,
      });
    } catch {
      result = null;
      summary.attempted += 1;
      summary.failed += 1;
      summary.message = CLOUD_COPY_UNREACHABLE;
      continue;
    }
    if (result.home !== 'advantage-cloud') continue;
    summary.attempted += 1;
    if (result.failed || !result.remoteId) {
      summary.failed += 1;
      summary.message = result.message || 'Advantage Cloud did not take that file.';
      continue;
    }
    summary.copied += 1;
    if (result.route.ok && result.route.lane === 'pending') summary.waiting += 1;
  }
  return summary.attempted ? summary : null;
}

export function cloudCopyLine(summary: CloudCopySummary): { tone: 'saved' | 'error'; text: string } {
  if (summary.failed) {
    const copied = summary.copied ? ` ${summary.copied} copied.` : '';
    return {
      tone: 'error',
      text: `Saved on this phone. ${summary.failed} of ${summary.attempted} did not copy to Advantage Cloud: ${summary.message}${copied}`,
    };
  }
  const waiting = summary.waiting ? ` ${summary.waiting} wait for approval in Review Inbox.` : '';
  return { tone: 'saved', text: `Copied ${summary.copied} to Advantage Cloud.${waiting}` };
}
