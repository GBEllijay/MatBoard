/**
 * Put a file on the gym tree in the store that is connected.
 * Advantage Cloud is added when that binding exists. Until then this
 * uses Google Drive, then OneDrive, then leaves the file on the phone.
 * A missing purpose does not upload.
 */

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

export type GymPublishHome = 'google-drive' | 'onedrive' | 'phone';

export type GymPublishResult = {
  route: GymRoute;
  home: GymPublishHome;
  remoteId: string | null;
  failed: boolean;
};

async function oneDriveParent(token: string, rootId: string, segments: readonly string[]): Promise<string> {
  let parent = rootId;
  for (const name of segments) {
    const folder = await createOneDriveFolder(token, name, fetch, parent);
    parent = folder.id;
  }
  return parent;
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
