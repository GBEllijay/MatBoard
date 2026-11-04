/**
 * Save a Video replay analysis clip off this device using paths the app
 * already has. Nothing here adds a binding, an OAuth scope, or a migration.
 *
 * - Advantage Cloud: the #370 `lesson-media` upload (R2), only after the page
 *   confirmed Plus Cloud and this person can upload (`cloudUploadSelected`).
 *   The server still checks the role.
 * - Google Drive: the connected gym folder, at the same lesson-media path the
 *   Cloud copy uses (`lessons/current/{week}/media/{date}/…`).
 * - OneDrive: an "Advantage replays" folder inside the connected folder.
 *
 * A missing token or folder leaves the clip on the device and says so.
 */

import { cloudReplayPendingSelected, cloudUploadSelected, notifyCloudMedia, uploadAdvantageCloudFile } from './advantageCloudMedia.ts';
import { readDriveBinding, requestDriveToken, uploadGymTreeBytes } from './googleDrive.ts';
import { lessonMediaPath } from './gymTree.ts';
import { createOneDriveFolder, readOneDriveBinding, readOneDriveSession, saveOneDriveBytes } from './oneDrive.ts';
import { replaySaveTargets, type ReplaySaveKind } from './replayAnalysis.ts';

export const ONEDRIVE_REPLAY_FOLDER = 'Advantage replays';

export type ReplaySaveResult = { ok: true; kind: ReplaySaveKind; ref: string; pending?: true } | { ok: false; message: string };

export const REPLAY_PENDING_MESSAGE = 'Sent to the head coach for approval.';

export function availableReplaySaveTargets(): ReplaySaveKind[] {
  let oneDriveConnected = false;
  let driveConnected = false;
  try {
    driveConnected = Boolean(readDriveBinding());
    oneDriveConnected = Boolean(readOneDriveBinding() && readOneDriveSession());
  } catch {
    /* Private mode without storage: device only. */
  }
  return replaySaveTargets({ cloudUpload: cloudUploadSelected() || cloudReplayPendingSelected(), driveConnected, oneDriveConnected });
}

/** `video/webm;codecs=vp9` → `video/webm`; anything odd → `video/mp4`. */
export function plainVideoMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return /^video\/[\w.+-]+$/.test(base) ? base : 'video/mp4';
}

export async function saveReplayClip(input: {
  kind: ReplaySaveKind;
  dateKey: string;
  fileName: string;
  blob: Blob;
  mime: string;
  replayId: string;
  onProgress?: (sent: number, total: number) => void;
  /** A markup picture (PNG) instead of a clip. */
  picture?: boolean;
}): Promise<ReplaySaveResult> {
  const mime = input.picture ? (/^image\/[\w.+-]+$/.test(input.mime) ? input.mime : 'image/png') : plainVideoMime(input.mime);
  try {
    if (input.kind === 'advantage-cloud') {
      // Owner, Coach, Instructors: straight to lesson media. Assistant coach / program director: pending approval.
      const direct = cloudUploadSelected();
      const pending = !direct && cloudReplayPendingSelected();
      if (!direct && !pending) return { ok: false, message: 'Advantage Cloud is not on for this coach here.' };
      const result = await uploadAdvantageCloudFile({
        purpose: pending ? 'replay-pending' : 'lesson-media',
        dateKey: input.dateKey,
        file: input.blob,
        fileName: input.fileName,
        mime,
        onProgress: input.onProgress,
      });
      if (!result.ok) return { ok: false, message: result.message };
      notifyCloudMedia();
      return pending ? { ok: true, kind: 'advantage-cloud', ref: result.path, pending: true } : { ok: true, kind: 'advantage-cloud', ref: result.path };
    }
    if (input.kind === 'google-drive') {
      const binding = readDriveBinding();
      if (!binding) return { ok: false, message: 'Connect Google Drive in Settings first.' };
      const relativePath = lessonMediaPath(input.dateKey, input.fileName);
      if (!relativePath) return { ok: false, message: 'Choose a real date.' };
      const token = await requestDriveToken('silent');
      if (!token) return { ok: false, message: 'Google Drive needs you to sign in again. The clip stays on this device.' };
      const saved = await uploadGymTreeBytes({
        token,
        rootFolderId: binding.folderId,
        relativePath,
        bytes: input.blob,
        mime,
        appProperties: { advantage: 'replay-analysis', date: input.dateKey, replayId: input.replayId.slice(0, 80) },
      });
      return { ok: true, kind: 'google-drive', ref: saved.id };
    }
    const binding = readOneDriveBinding();
    const session = readOneDriveSession();
    if (!binding || !session) return { ok: false, message: 'OneDrive needs you to sign in again. The clip stays on this device.' };
    const folder = await createOneDriveFolder(session.token, ONEDRIVE_REPLAY_FOLDER, fetch, binding.folderId);
    const saved = await saveOneDriveBytes(session.token, { name: input.fileName, bytes: input.blob, mime }, folder.id);
    return { ok: true, kind: 'onedrive', ref: saved.id };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'That save did not finish.';
    return { ok: false, message: `${message} The clip stays on this device.` };
  }
}
