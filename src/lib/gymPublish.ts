/**
 * Put a file on the gym tree in the store that is connected.
 * Advantage Cloud is added when that binding exists. Until then this
 * uses Google Drive, then OneDrive, then leaves the file on the phone.
 * A missing purpose does not upload.
 */

import {
  advantageCloudReady,
  galleryUploadLane,
  notifyCloudMedia,
  parseGalleryCloudPath,
  readCloudBearer,
  uploadAdvantageCloudFile,
} from './advantageCloudMedia.ts';
import { readDriveBinding, requestDriveToken, uploadGymTreeBytes } from './googleDrive.ts';
import {
  parentSegments,
  routeUpload,
  type GymActor,
  type GymMediaKind,
  type GymPurpose,
  type GymRoute,
} from './gymTree.ts';
import {
  createOneDriveFolder,
  readOneDriveBinding,
  readOneDriveSession,
  saveOneDriveBytes,
} from './oneDrive.ts';

export type GymPublishHome = 'google-drive' | 'onedrive' | 'phone' | 'advantage-cloud';

export type GymPublishResult = {
  route: GymRoute;
  home: GymPublishHome;
  remoteId: string | null;
  failed: boolean;
  /** Why a copy failed, in words the page can show. */
  message?: string;
};

async function oneDriveParent(token: string, rootId: string, segments: readonly string[]): Promise<string> {
  let parent = rootId;
  for (const name of segments) {
    const folder = await createOneDriveFolder(token, name, fetch, parent);
    parent = folder.id;
  }
  return parent;
}

function cloudActor(role: GymActor): { kind: 'owner' | 'seat'; preset: string | null } {
  if (role === 'owner') return { kind: 'owner', preset: null };
  if (role === 'instructor') return { kind: 'seat', preset: 'instructors' };
  if (role === 'coach') return { kind: 'seat', preset: 'coach' };
  if (role === 'assistant') return { kind: 'seat', preset: 'assistant-coach' };
  if (role === 'program-director') return { kind: 'seat', preset: 'program-director' };
  return { kind: 'seat', preset: null };
}

/**
 * Class and daily photos go to Advantage Cloud when this license has Cloud.
 * Returns null when Cloud is off so Drive, OneDrive, or the phone still run.
 */
async function publishGalleryToCloud(
  input: {
    role: GymActor;
    dateKey: string;
    bytes: Blob;
    mime: string;
    cloudToken?: string;
    cloudFetcher?: typeof fetch;
  },
  route: Extract<GymRoute, { ok: true }>,
): Promise<GymPublishResult | null> {
  const token = input.cloudToken ?? readCloudBearer();
  if (!token) return null;
  const fetcher = input.cloudFetcher ?? fetch;
  if (!(await advantageCloudReady({ token, fetcher }))) return null;
  const lane = galleryUploadLane(cloudActor(input.role));
  if (!lane) return null;
  const result = await uploadAdvantageCloudFile({
    purpose: 'gallery',
    dateKey: input.dateKey,
    file: input.bytes,
    fileName: route.fileName,
    mime: input.mime,
    token,
    fetcher,
    lane,
  });
  if (!result.ok) {
    return { route: { ...route, lane }, home: 'advantage-cloud', remoteId: null, failed: true, message: result.message };
  }
  const parsed = parseGalleryCloudPath(result.path);
  notifyCloudMedia();
  return {
    route: { ...route, lane: parsed?.lane ?? lane, path: result.path, fileName: parsed?.name ?? route.fileName },
    home: 'advantage-cloud',
    remoteId: result.path,
    failed: false,
  };
}

export async function publishGymFile(input: {
  purpose: GymPurpose | '' | null | undefined;
  role: GymActor;
  kind: GymMediaKind;
  dateKey: string;
  fileName: string;
  bytes: Blob;
  mime: string;
  approvalRequired?: boolean;
  studentCode?: string;
  seatId?: string;
  /** Folder the caller already picked. Student film uses the academy link, not the coach binding. */
  target?: { provider: 'googleDrive' | 'oneDrive'; folderId: string } | null;
  /** Tests pass the signed-in token and the Cloud function. The page uses the saved sign-in. */
  cloudToken?: string;
  cloudFetcher?: typeof fetch;
  /** Gallery copies of files that came from Google Photos or Drive: Advantage Cloud only, never back to Drive. */
  cloudOnly?: boolean;
}): Promise<GymPublishResult> {
  const route = routeUpload({
    purpose: input.purpose,
    role: input.role,
    kind: input.kind,
    dateKey: input.dateKey,
    fileName: input.fileName,
    approvalRequired: input.approvalRequired,
    studentCode: input.studentCode,
    seatId: input.seatId,
  });
  if (!route.ok) return { route, home: 'phone', remoteId: null, failed: false };
  if (route.purpose === 'gallery') {
    let cloud: GymPublishResult | null;
    try {
      cloud = await publishGalleryToCloud(input, route);
    } catch {
      // A dropped connection used to throw past the page, which swallowed it.
      cloud = { route, home: 'advantage-cloud', remoteId: null, failed: true, message: 'Advantage Cloud could not be reached.' };
    }
    if (cloud) return cloud;
  }
  if (input.cloudOnly) return { route, home: 'phone', remoteId: null, failed: false };
  if (typeof window === 'undefined') return { route, home: 'phone', remoteId: null, failed: false };

  const driveId = input.target?.provider === 'googleDrive' ? input.target.folderId : input.target ? '' : readDriveBinding()?.folderId ?? '';
  if (driveId) {
    const token = await requestDriveToken('silent');
    if (token) {
      try {
        const saved = await uploadGymTreeBytes({
          token,
          rootFolderId: driveId,
          relativePath: route.path,
          bytes: input.bytes,
          mime: input.mime,
          appProperties: {
            advantage: route.purpose,
            purpose: route.purpose,
            date: input.dateKey,
            kind: input.kind,
            lane: route.lane ?? '',
          },
        });
        return { route, home: 'google-drive', remoteId: saved.id, failed: false };
      } catch {
        return { route, home: 'google-drive', remoteId: null, failed: true };
      }
    }
  }

  const oneId = input.target?.provider === 'oneDrive' ? input.target.folderId : input.target ? '' : readOneDriveBinding()?.folderId ?? '';
  const session = readOneDriveSession();
  if (oneId && session) {
    try {
      const parentId = await oneDriveParent(session.token, oneId, parentSegments(route.path));
      const saved = await saveOneDriveBytes(
        session.token,
        { name: route.fileName, bytes: input.bytes, mime: input.mime },
        parentId,
      );
      return { route, home: 'onedrive', remoteId: saved.id, failed: false };
    } catch {
      return { route, home: 'onedrive', remoteId: null, failed: true };
    }
  }

  return { route, home: 'phone', remoteId: null, failed: false };
}
