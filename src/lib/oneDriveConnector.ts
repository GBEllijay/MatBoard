/**
 * OneDrive as a CloudStorageConnector.
 * Connect lists the gym's folders. Choosing one writes a small proof file
 * in that folder. Day packages are a later milestone.
 */

import type { CloudBinding, CloudConnectResult, CloudFolderRef, CloudItemRef, CloudStorageConnector, CloudTextSave } from './cloudStorage.ts';
import { clearOneDriveMsalCache, requestOneDriveConsent } from './oneDriveAuth.ts';
import {
  ONEDRIVE_CONNECT_FILE_NAME,
  ONEDRIVE_CONNECT_FILE_TEXT,
  ONEDRIVE_FOLDER_EMPTY,
  ONEDRIVE_ROOT_NAME,
  ONEDRIVE_SETUP_NEEDED,
  clearOneDriveBinding,
  createOneDriveFolder,
  getOneDriveBindingSnapshot,
  listOneDriveItems,
  microsoftClientId,
  oneDriveAccountLabel,
  oneDriveOwnerFacingError,
  oneDriveSignInFailureCopy,
  readOneDriveBinding,
  saveOneDriveText,
  subscribeOneDriveBinding,
  writeOneDriveBinding,
  type OneDriveBinding,
} from './oneDrive.ts';

function toCloudBinding(binding: OneDriveBinding): CloudBinding {
  return {
    providerId: 'oneDrive',
    folderId: binding.folderId,
    folderName: binding.folderName,
    accountLabel: binding.email,
  };
}

export function createOneDriveConnector(): CloudStorageConnector {
  let snapshotSource: OneDriveBinding | null | undefined;
  let snapshot: CloudBinding | null = null;

  const getBindingSnapshot = (): CloudBinding | null => {
    const source = getOneDriveBindingSnapshot();
    if (snapshotSource === source) return snapshot;
    snapshotSource = source;
    snapshot = source ? toCloudBinding(source) : null;
    return snapshot;
  };

  return {
    id: 'oneDrive',
    displayName: 'OneDrive',
    phase: 'live',
    isAvailable: () => Boolean(microsoftClientId()),
    unavailableMessage: () => ONEDRIVE_SETUP_NEEDED,
    isConnected: () => readOneDriveBinding() !== null,
    binding: () => {
      const stored = readOneDriveBinding();
      return stored ? toCloudBinding(stored) : null;
    },
    getBindingSnapshot,
    subscribe: (listener) => subscribeOneDriveBinding(listener),
    emptyFolderMessage: ONEDRIVE_FOLDER_EMPTY,
    async connect(): Promise<CloudConnectResult> {
      if (!microsoftClientId()) {
        return { ok: false, reason: 'unavailable', message: ONEDRIVE_SETUP_NEEDED };
      }
      const auth = await requestOneDriveConsent();
      if (!auth.ok) {
        return {
          ok: false,
          reason: auth.code === 'missing-client' ? 'unavailable' : auth.code === 'cancelled' ? 'cancelled' : 'failed',
          message: oneDriveSignInFailureCopy(auth),
        };
      }
      try {
        const folders = await listOneDriveItems(auth.token, { foldersOnly: true });
        return { ok: true, session: auth.token, folders };
      } catch (reason) {
        return { ok: false, reason: 'failed', message: oneDriveOwnerFacingError(reason) };
      }
    },
    async pickFolder(session: string, folder: CloudFolderRef): Promise<CloudBinding> {
      await saveOneDriveText(
        session,
        { name: ONEDRIVE_CONNECT_FILE_NAME, text: ONEDRIVE_CONNECT_FILE_TEXT },
        folder.id,
      );
      const email = await oneDriveAccountLabel(session).catch(() => null);
      const stored: OneDriveBinding = {
        folderId: folder.id,
        folderName: folder.name,
        email,
      };
      writeOneDriveBinding(stored);
      return toCloudBinding(stored);
    },
    async createFolder(session: string): Promise<CloudFolderRef> {
      return createOneDriveFolder(session, ONEDRIVE_ROOT_NAME);
    },
    createFolderLabel: `Create ${ONEDRIVE_ROOT_NAME}`,
    async save(session: string, file: CloudTextSave, folderId?: string): Promise<CloudItemRef> {
      if (!microsoftClientId()) throw new Error(ONEDRIVE_SETUP_NEEDED);
      return saveOneDriveText(session, file, folderId);
    },
    async open(session: string, folderId?: string): Promise<CloudItemRef[]> {
      if (!microsoftClientId()) throw new Error(ONEDRIVE_SETUP_NEEDED);
      return listOneDriveItems(session, { folderId });
    },
    openFolderUrl: () => null,
    disconnect: () => {
      clearOneDriveBinding();
      void clearOneDriveMsalCache();
    },
  };
}
