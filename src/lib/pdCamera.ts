/**
 * Program director Camera window.
 *
 * A program director does not open lesson plans (dailyLessonPlanAccess stays
 * off) and does not open Daily Training Videos (/techniques). Instead the
 * Media Console offers a Camera window:
 * - Take a photo: it goes to the Gallery, through the same approval lane as
 *   any other program director gallery add.
 * - Take a video: Gallery or Today's videos, the same choice and send code as
 *   the Media Console video add (src/lib/dailyVideoDrop.ts).
 * - Pick from this phone stays as the fallback in the same sheet.
 * - Today's videos: list and play the day's videos with the same looping
 *   player, TV fullscreen, and mute as Daily Training Videos.
 *
 * Playing today's videos follows the same seat switch as sending them,
 * "Send videos to today's videos" (dailyVideoUpload). The server only sees
 * the seat preset, so Advantage Cloud enforces it per preset: a live program
 * director seat on a Plus Cloud license may list and open videos/daily/* and
 * nothing else.
 */

import { readCloudBearer, type CloudStatusBody } from './advantageCloudMedia.ts';
import { canSendToDailyVideos, type DailyVideoHome, type VideoDestination } from './dailyVideoDrop.ts';
import { isProgramDirectorSeat, seatPermissionAllows, type InstructorSeat } from './instructorSeats.ts';

export const CAMERA_TITLE = 'Camera';
export const CAMERA_PATH = '/camera';
/** The Camera window is a view of the Media Console page, so it stays in that paid chunk. */
export const CAMERA_HREF = '/slideshow?camera=1';
export const CAMERA_PARAM = 'camera';

export const CAMERA_TAKE_PHOTO = 'Take a photo';
export const CAMERA_TAKE_VIDEO = 'Take a video';
export const CAMERA_PHOTO_HINT = 'Photos go to the Gallery.';
export const TODAYS_VIDEOS_TITLE = "Today's videos";
export const TODAYS_VIDEOS_EMPTY = 'No videos in today\'s videos yet.';
export const TODAYS_VIDEOS_FROM_DRIVE = "Play from the gym's Google Drive";
export const TODAYS_VIDEOS_FROM_DEVICE = 'Play a video from this phone';
export const TODAYS_VIDEOS_LOOP_LABEL = 'Loop';
export const TODAYS_VIDEOS_LOOP_ALWAYS = 'Always';

type CameraSeat = Pick<InstructorSeat, 'status' | 'presetId' | 'permissions'>;

/** Photo capture lands in the Gallery, so the Gallery switch must be on. */
export function cameraPhotoAllowed(seat: CameraSeat | null): boolean {
  return isProgramDirectorSeat(seat) && seatPermissionAllows(seat?.permissions ?? null, 'galleryUpload');
}

/** Today's videos send and play follow "Send videos to today's videos". */
export function cameraDailyVideosAllowed(seat: CameraSeat | null): boolean {
  return isProgramDirectorSeat(seat) && canSendToDailyVideos(seat);
}

/** The Camera entry shows for a live program director with Gallery or today's videos on. */
export function cameraWindowOpen(seat: CameraSeat | null): boolean {
  return cameraPhotoAllowed(seat) || cameraDailyVideosAllowed(seat);
}

/** Menu entry for the program director's Media Console home. */
export function cameraHubs(seat: CameraSeat | null): { title: string; to: string; belt: 'purple' }[] {
  return cameraWindowOpen(seat) ? [{ title: CAMERA_TITLE, to: CAMERA_HREF, belt: 'purple' }] : [];
}

/** True only when the page was opened as the Camera window by a seat that may open it. */
export function cameraModeRequested(param: string | null, seat: CameraSeat | null): boolean {
  return param === '1' && cameraWindowOpen(seat);
}

/** A photo always goes to the Gallery. */
export function cameraPhotoDestinations(seat: CameraSeat | null): VideoDestination[] {
  return cameraPhotoAllowed(seat) ? ['gallery'] : [];
}

/**
 * Video destinations. Both when the Gallery switch is on and today's videos
 * has a home (Cloud, Drive, or OneDrive). Only one when the other is closed.
 */
export function cameraVideoDestinations(seat: CameraSeat | null, dailyHome: DailyVideoHome | null): VideoDestination[] {
  const out: VideoDestination[] = [];
  if (cameraPhotoAllowed(seat)) out.push('gallery');
  if (cameraDailyVideosAllowed(seat) && dailyHome) out.push('daily-videos');
  return out;
}

/** Cloud status says this person may list and play today's videos. */
export function statusAllowsDailyPlay(body: Partial<CloudStatusBody> | null | undefined): boolean {
  if (!body) return false;
  return body.dailyVideoPlay === true || body.cloud === true;
}

export type TodaysVideoRow = { name: string; path: string; size: number; mime: string };

/** Null when Advantage Cloud is not open to this person. An empty list is a real answer. */
export async function listTodaysCloudVideos(input: {
  dateKey: string;
  fetcher?: typeof fetch;
  token?: string;
}): Promise<TodaysVideoRow[] | null> {
  const fetcher = input.fetcher ?? fetch;
  const token = input.token ?? readCloudBearer();
  if (!token) return null;
  const headers = { authorization: `Bearer ${token}` };
  try {
    const status = await fetcher('/api/gym/cloud?op=status', { headers });
    if (!status.ok) return null;
    if (!statusAllowsDailyPlay((await status.json()) as Partial<CloudStatusBody>)) return null;
    const listed = await fetcher(
      `/api/gym/cloud?op=list&purpose=daily-video&date=${encodeURIComponent(input.dateKey)}`,
      { headers },
    );
    if (!listed.ok) return null;
    const body = (await listed.json()) as { files?: TodaysVideoRow[] };
    return (body.files ?? []).filter((file) => /^videos\/daily\//.test(file.path));
  } catch {
    return null;
  }
}

export async function openTodaysCloudVideo(input: {
  path: string;
  fetcher?: typeof fetch;
  token?: string;
}): Promise<Blob | null> {
  const fetcher = input.fetcher ?? fetch;
  const token = input.token ?? readCloudBearer();
  if (!token || !/^videos\/daily\//.test(input.path)) return null;
  try {
    const response = await fetcher(`/api/gym/cloud?op=file&path=${encodeURIComponent(input.path)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** Loop choices: forever, or a timed loop like a Daily Training Videos drill slot. */
export function loopChoices(drillPresetsSec: readonly number[]): (number | null)[] {
  return [null, ...drillPresetsSec];
}

/**
 * Playback controls the Camera window offers on today's videos. They are the
 * Daily Training Videos controls, minus lesson-plan slot editing.
 */
export const TODAYS_VIDEOS_CONTROLS = ['play', 'stop', 'loop', 'loop-timer', 'mute', 'fullscreen', 'tv-tip'] as const;
