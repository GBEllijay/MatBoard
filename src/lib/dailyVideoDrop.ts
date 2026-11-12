/**
 * Program director (or any seat with "Send videos to today's videos"):
 * record or pick a video in the Media Console and send it to the day's
 * Daily Videos folder, `videos/daily/{date}/`. Instructors open that folder
 * from Daily Training Videos and add the clip to their own lesson plan.
 *
 * This does not open lesson plans and it is not Record for Review.
 * There is no approval step for daily videos on main, so a send goes
 * straight to the folder, the same as a Coach upload.
 *
 * Where it goes follows what the gym has:
 * Advantage Cloud when this license has Plus Cloud and this seat may drop there,
 * otherwise the gym's Google Drive, then OneDrive. With none of them the
 * choice is hidden. A video that only stays on this phone is not one
 * instructors can open.
 */

import {
  readCloudBearer,
  uploadAdvantageCloudFile,
  type CloudStatusBody,
} from './advantageCloudMedia.ts';
import { publishGymFile } from './gymPublish.ts';
import type { GymActor } from './gymTree.ts';
import { seatPermissionAllows, type InstructorSeat } from './instructorSeats.ts';

export type VideoDestination = 'gallery' | 'daily-videos';
export type DailyVideoHome = 'advantage-cloud' | 'google-drive' | 'onedrive';

export const VIDEO_DESTINATION_LEGEND = 'Where this video goes';
export const VIDEO_DESTINATION_GALLERY = 'Gallery';
export const VIDEO_DESTINATION_GALLERY_HINT = 'Plays in the gym slideshow.';
export const VIDEO_DESTINATION_DAILY = "Today's videos";
export const VIDEO_DESTINATION_DAILY_HINT =
  'For instructors to download and add to their own lesson plans.';

export const DAILY_VIDEO_STAY =
  "Record or pick a video. It goes to today's videos for instructors, not the Gallery.";

const HOME_LABEL: Record<DailyVideoHome, string> = {
  'advantage-cloud': 'Advantage Cloud',
  'google-drive': "the gym's Google Drive",
  onedrive: "the gym's OneDrive",
};

export function dailyVideoHomeLabel(home: DailyVideoHome): string {
  return HOME_LABEL[home];
}

/** Gallery video add on the Media Console, for a live seat with the switch on. */
export function canSendToDailyVideos(seat: Pick<InstructorSeat, 'status' | 'permissions'> | null): boolean {
  if (!seat || seat.status === 'revoked') return false;
  return seatPermissionAllows(seat.permissions, 'dailyVideoUpload');
}

/** Advantage Cloud first, then Google Drive, then OneDrive. Null hides the choice. */
export function chooseDailyVideoHome(input: {
  cloudDrop: boolean;
  driveConnected: boolean;
  oneDriveConnected: boolean;
}): DailyVideoHome | null {
  if (input.cloudDrop) return 'advantage-cloud';
  if (input.driveConnected) return 'google-drive';
  if (input.oneDriveConnected) return 'onedrive';
  return null;
}

/** Cloud status says this person may put a file in today's daily videos. */
export function statusAllowsDailyDrop(body: Partial<CloudStatusBody> | null | undefined): boolean {
  if (!body) return false;
  if (body.dailyVideoDrop === true) return true;
  return body.cloud === true && body.canUpload === true;
}

export async function probeDailyVideoCloud(
  fetcher: typeof fetch = fetch,
  token: string = readCloudBearer(),
): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetcher('/api/gym/cloud?op=status', { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) return false;
    return statusAllowsDailyDrop((await response.json()) as Partial<CloudStatusBody>);
  } catch {
    return false;
  }
}

export type DailyVideoSendResult = {
  sent: number;
  failed: number;
  skipped: number;
  message: string;
};

export function dailyVideoSentCopy(input: { sent: number; failed: number; skipped: number; home: DailyVideoHome; error?: string }): string {
  const where = dailyVideoHomeLabel(input.home);
  if (input.sent === 0) {
    if (input.error) return input.error;
    if (input.skipped && !input.failed) return "That file is not a video. Record or pick a video for today's videos.";
    return `Nothing was sent. ${where} could not take that video.`;
  }
  const count = input.sent === 1 ? 'Video' : `${input.sent} videos`;
  const tail = input.failed ? ` ${input.failed} could not be sent.` : '';
  return `${count} sent to today's videos in ${where}. Instructors add them to their lesson plans from Daily Training Videos.${tail}`;
}

/**
 * Phone cameras reuse names like IMG_0001.MOV. Stamp the send time so a
 * program director's video never lands on top of a coach's.
 */
export function dailyVideoFileName(name: string, at: number): string {
  const base = name.trim() || 'training-video.mp4';
  const stamp = new Date(at).toISOString().slice(11, 19).replace(/:/g, '');
  return `${stamp}-${base}`;
}

function isVideo(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(file.name);
}

/** Added when a seat's daily video lands in the Advantage Cloud approval lane. */
export const DAILY_VIDEO_WAITING_NOTE = 'They wait for approval in Review Inbox before anyone can play them.';

export async function sendToDailyVideos(input: {
  files: readonly File[];
  dateKey: string;
  home: DailyVideoHome;
  role: GymActor;
  cloudUpload?: typeof uploadAdvantageCloudFile;
  publish?: typeof publishGymFile;
  onProgress?: (done: number, total: number) => void;
}): Promise<DailyVideoSendResult> {
  const cloudUpload = input.cloudUpload ?? uploadAdvantageCloudFile;
  const publish = input.publish ?? publishGymFile;
  const videos = input.files.filter((file) => file.size > 0 && isVideo(file));
  const skipped = input.files.length - videos.length;
  let sent = 0;
  let failed = 0;
  let waiting = 0;
  let error = '';
  for (let index = 0; index < videos.length; index += 1) {
    const file = videos[index];
    input.onProgress?.(index, videos.length);
    const mime = file.type || 'video/mp4';
    const fileName = dailyVideoFileName(file.name, Date.now() + index);
    if (input.home === 'advantage-cloud') {
      const result = await cloudUpload({ purpose: 'daily-video', dateKey: input.dateKey, file, fileName, mime });
      if (result.ok) {
        sent += 1;
        if (result.lane === 'pending') waiting += 1;
      } else {
        failed += 1;
        error = result.message;
      }
      continue;
    }
    const published = await publish({
      purpose: 'daily-video',
      role: input.role,
      kind: 'video',
      dateKey: input.dateKey,
      fileName,
      bytes: file,
      mime,
    }).catch(() => null);
    if (published && published.route.ok && published.home !== 'phone' && !published.failed && published.remoteId) sent += 1;
    else failed += 1;
  }
  input.onProgress?.(videos.length, videos.length);
  return {
    sent,
    failed,
    skipped,
    message: `${dailyVideoSentCopy({ sent, failed, skipped, home: input.home, error })}${waiting ? ` ${DAILY_VIDEO_WAITING_NOTE}` : ''}`,
  };
}
