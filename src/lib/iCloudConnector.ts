/**
 * iCloud as a CloudStorageConnector.
 * Connect lists Advantage folders in the gym’s iCloud. Choosing one writes
 * a small proof note there. Those notes are CloudKit records, not iCloud
 * Drive files. Day packages and Media Console uploads are a later milestone.
 */

import type { CloudBinding, CloudConnectResult, CloudFolderRef, CloudItemRef, CloudStorageConnector, CloudTextSave } from './cloudStorage.ts';
import { beginICloudSignIn, iCloudConsentFailure, requestICloudConsent } from './iCloudAuth.ts';
import { isAppleSignInUrl } from './appleCloudKitPublic.ts';
import {
  ICLOUD_CONNECT_FILE_NAME,
  ICLOUD_CONNECT_FILE_TEXT,
  ICLOUD_FOLDER_EMPTY,
  ICLOUD_ROOT_NAME,
  ICLOUD_SETUP_NEEDED,
  allowICloudReauth,
  clearICloudBinding,
  clearICloudResumeFlag,
  createICloudFolder,
  getICloudBindingSnapshot,
  iCloudConfig,
  iCloudCurrentUser,
  iCloudOwnerFacingError,
  listICloudFiles,
  listICloudFolders,
  loadICloudConfig,
  readICloudBinding,
  rememberICloudWebAuthToken,
  saveICloudText,
  subscribeICloudBinding,
  writeICloudBinding,
  type ICloudBinding,
} from './iCloud.ts';

function toCloudBinding(binding: ICloudBinding): CloudBinding {
  return {
    providerId: 'iCloud',
    folderId: binding.folderId,
    folderName: binding.folderName,
    accountLabel: binding.email,
  };
}

function redirectTarget(reason: unknown): string | null {
  if (!reason || typeof reason !== 'object') return null;
  const url = (reason as { redirectURL?: unknown }).redirectURL;
  return typeof url === 'string' && isAppleSignInUrl(url) ? url : null;
}

export function createICloudConnector(): CloudStorageConnector {
  let snapshotSource: ICloudBinding | null | undefined;
  let snapshot: CloudBinding | null = null;

  const getBindingSnapshot = (): CloudBinding | null => {
    const source = getICloudBindingSnapshot();
    if (snapshotSource === source) return snapshot;
    snapshotSource = source;
    snapshot = source ? toCloudBinding(source) : null;
    return snapshot;
  };

  return {
    id: 'iCloud',
    displayName: 'iCloud',
    phase: 'live',
    isAvailable: () => iCloudConfig() !== null,
    unavailableMessage: () => ICLOUD_SETUP_NEEDED,
    isConnected: () => readICloudBinding() !== null,
    binding: () => {
      const stored = readICloudBinding();
      return stored ? toCloudBinding(stored) : null;
    },
    getBindingSnapshot,
    subscribe: (listener) => subscribeICloudBinding(listener),
    emptyFolderMessage: ICLOUD_FOLDER_EMPTY,
    async connect(): Promise<CloudConnectResult> {
      const config = await loadICloudConfig();
      if (!config) return { ok: false, reason: 'unavailable', message: ICLOUD_SETUP_NEEDED };
      const auth = await requestICloudConsent();
      if (!auth.ok) {
        if (auth.code === 'redirecting') return { ok: false, reason: 'redirecting', message: '' };
        return {
          ok: false,
          reason: auth.code === 'missing-config' ? 'unavailable' : auth.code === 'cancelled' ? 'cancelled' : 'failed',
          message: iCloudConsentFailure(auth),
        };
      }
      try {
        const listed = await listICloudFolders(auth.token);
        return { ok: true, session: listed.token, folders: listed.folders };
      } catch (reason) {
        const redirectURL = redirectTarget(reason);
        if (redirectURL && typeof window !== 'undefined' && allowICloudReauth()) {
          rememberICloudWebAuthToken(null);
          clearICloudResumeFlag();
          beginICloudSignIn(redirectURL);
          return { ok: false, reason: 'redirecting', message: '' };
        }
        return { ok: false, reason: 'failed', message: iCloudOwnerFacingError(reason) };
      }
    },
    async pickFolder(session: string, folder: CloudFolderRef): Promise<CloudBinding> {
      await saveICloudText(session, { name: ICLOUD_CONNECT_FILE_NAME, text: ICLOUD_CONNECT_FILE_TEXT }, folder.id);
      const who = await iCloudCurrentUser(session).catch(() => null);
      const stored: ICloudBinding = {
        folderId: folder.id,
        folderName: folder.name,
        email: who?.label ?? null,
      };
      writeICloudBinding(stored);
      return toCloudBinding(stored);
    },
    async createFolder(session: string): Promise<CloudFolderRef> {
      return createICloudFolder(session, ICLOUD_ROOT_NAME);
    },
    createFolderLabel: `Create ${ICLOUD_ROOT_NAME}`,
    async save(session: string, file: CloudTextSave, folderId?: string): Promise<CloudItemRef> {
      if (!iCloudConfig()) throw new Error(ICLOUD_SETUP_NEEDED);
      return saveICloudText(session, file, folderId);
    },
    async open(session: string, folderId?: string): Promise<CloudItemRef[]> {
      if (!iCloudConfig()) throw new Error(ICLOUD_SETUP_NEEDED);
      if (!folderId) {
        const listed = await listICloudFolders(session);
        return listed.folders;
      }
      return listICloudFiles(session, folderId);
    },
    openFolderUrl: () => null,
    disconnect: () => {
      clearICloudBinding();
      clearICloudResumeFlag();
    },
  };
}
