/**
 * Google Drive as a CloudStorageConnector.
 * Sign-in uses the Advantage-owned browser client id from the build.
 */

import type {
  CloudBinding,
  CloudConnectResult,
  CloudFolderRef,
  CloudItemRef,
  CloudStorageConnector,
  CloudTextSave,
} from './cloudStorage.ts';
import {
  DRIVE_FOLDER_EMPTY,
  DRIVE_SETUP_NEEDED,
  LESSON_ROOT_NAME,
  clearDriveSession,
  createLessonRoot,
  driveAccountEmail,
  driveOwnerFacingError,
  driveSignInFailureCopy,
  getDriveBindingSnapshot,
  googleClientId,
  listDriveFolders,
  listFolderFiles,
  readDriveBinding,
  requestDriveConsent,
  saveDriveTextFile,
  subscribeDriveBinding,
  writeDriveBinding,
  type DriveBinding,
} from './googleDrive.ts';
import { driveFolderWebUrl } from './openMyDrive.ts';

function toCloudBinding(binding: DriveBinding): CloudBinding {
  return {
    providerId: 'googleDrive',
    folderId: binding.folderId,
    folderName: binding.folderName,
    accountLabel: binding.email,
  };
}

export function createGoogleDriveConnector(): CloudStorageConnector {
  let snapshotSource: DriveBinding | null | undefined;
  let snapshot: CloudBinding | null = null;

  const getBindingSnapshot = (): CloudBinding | null => {
    const source = getDriveBindingSnapshot();
    if (snapshotSource === source) return snapshot;
    snapshotSource = source;
    snapshot = source ? toCloudBinding(source) : null;
    return snapshot;
  };

  return {
    id: 'googleDrive',
    displayName: 'Google Drive',
    phase: 'live',
    isAvailable: () => Boolean(googleClientId()),
    unavailableMessage: () => DRIVE_SETUP_NEEDED,
    emptyFolderMessage: DRIVE_FOLDER_EMPTY,
    isConnected: () => readDriveBinding() !== null,
    binding: () => {
      const stored = readDriveBinding();
      return stored ? toCloudBinding(stored) : null;
    },
    getBindingSnapshot,
    subscribe: (listener) => subscribeDriveBinding(listener),
    async connect(): Promise<CloudConnectResult> {
      if (!googleClientId()) {
        return { ok: false, reason: 'unavailable', message: DRIVE_SETUP_NEEDED };
      }
      const auth = await requestDriveConsent();
      if (!auth.ok) {
        return {
          ok: false,
          reason: auth.code === 'missing-client' ? 'unavailable' : auth.code === 'cancelled' ? 'cancelled' : 'failed',
          message: driveSignInFailureCopy(auth),
        };
      }
      try {
        const folders = await listDriveFolders(auth.token);
        return { ok: true, session: auth.token, folders };
      } catch (reason) {
        return { ok: false, reason: 'failed', message: driveOwnerFacingError(reason) };
      }
    },
    async pickFolder(session: string, folder: CloudFolderRef): Promise<CloudBinding> {
      const email = await driveAccountEmail(session).catch(() => null);
      const stored: DriveBinding = {
        folderId: folder.id,
        folderName: folder.name,
        email,
      };
      writeDriveBinding(stored);
      return toCloudBinding(stored);
    },
    async createFolder(session: string): Promise<CloudFolderRef> {
      return createLessonRoot(session);
    },
    createFolderLabel: `Create ${LESSON_ROOT_NAME}`,
    async save(session: string, file: CloudTextSave, folderId?: string): Promise<CloudItemRef> {
      if (!googleClientId()) throw new Error(DRIVE_SETUP_NEEDED);
      return saveDriveTextFile(session, { name: file.name, text: file.text, parentId: folderId });
    },
    async open(session: string, folderId?: string): Promise<CloudItemRef[]> {
      if (!googleClientId()) throw new Error(DRIVE_SETUP_NEEDED);
      if (!folderId) return listDriveFolders(session);
      const files = await listFolderFiles(session, folderId);
      return files.filter((file) => file.id && file.name).map((file) => ({ id: file.id, name: file.name }));
    },
    openFolderUrl: (folderId) => driveFolderWebUrl(folderId),
    disconnect: () => {
      clearDriveSession();
    },
  };
}
