/**
 * Google Photos as a CloudStorageConnector.
 * Sign-in uses the same Advantage-owned browser client id as Google Drive.
 * The connected “folder” is the gym’s Photos library. Albums are picked
 * later from Media Console. Lesson text is not written into Photos.
 */

import type {
  CloudBinding,
  CloudConnectResult,
  CloudFolderRef,
  CloudItemRef,
  CloudStorageConnector,
  CloudTextSave,
} from './cloudStorage.ts';
import { googleClientId } from './googleDrive.ts';
import {
  PHOTOS_CHOOSE_LIBRARY,
  PHOTOS_LESSON_STAYS,
  PHOTOS_LIBRARY_ID,
  PHOTOS_LIBRARY_NAME,
  PHOTOS_SETUP_NEEDED,
  PHOTOS_WEB_URL,
  clearPhotosSession,
  getPhotosBindingSnapshot,
  photosLibraryChoice,
  photosSignInFailureCopy,
  readPhotosBinding,
  requestPhotosConsent,
  subscribePhotosBinding,
  writePhotosBinding,
  type PhotosBinding,
} from './googlePhotos.ts';

function toCloudBinding(binding: PhotosBinding): CloudBinding {
  return {
    providerId: 'googlePhotos',
    folderId: binding.libraryId,
    folderName: binding.libraryName,
    accountLabel: binding.email,
  };
}

export function createGooglePhotosConnector(): CloudStorageConnector {
  let snapshotSource: PhotosBinding | null | undefined;
  let snapshot: CloudBinding | null = null;

  const getBindingSnapshot = (): CloudBinding | null => {
    const source = getPhotosBindingSnapshot();
    if (snapshotSource === source) return snapshot;
    snapshotSource = source;
    snapshot = source ? toCloudBinding(source) : null;
    return snapshot;
  };

  return {
    id: 'googlePhotos',
    displayName: 'Google Photos',
    phase: 'live',
    isAvailable: () => Boolean(googleClientId()),
    unavailableMessage: () => PHOTOS_SETUP_NEEDED,
    choosePrompt: PHOTOS_CHOOSE_LIBRARY,
    isConnected: () => readPhotosBinding() !== null,
    binding: () => {
      const stored = readPhotosBinding();
      return stored ? toCloudBinding(stored) : null;
    },
    getBindingSnapshot,
    subscribe: (listener) => subscribePhotosBinding(listener),
    async connect(): Promise<CloudConnectResult> {
      if (!googleClientId()) {
        return { ok: false, reason: 'unavailable', message: PHOTOS_SETUP_NEEDED };
      }
      const auth = await requestPhotosConsent();
      if (!auth.ok) {
        return {
          ok: false,
          reason: auth.code === 'missing-client' ? 'unavailable' : auth.code === 'cancelled' ? 'cancelled' : 'failed',
          message: photosSignInFailureCopy(auth),
        };
      }
      return { ok: true, session: auth.token, folders: [photosLibraryChoice()] };
    },
    async pickFolder(session: string, folder: CloudFolderRef): Promise<CloudBinding> {
      if (!session || folder.id !== PHOTOS_LIBRARY_ID) {
        throw new Error(PHOTOS_CHOOSE_LIBRARY);
      }
      const stored: PhotosBinding = {
        libraryId: PHOTOS_LIBRARY_ID,
        libraryName: folder.name.trim() || PHOTOS_LIBRARY_NAME,
        email: null,
      };
      writePhotosBinding(stored);
      return toCloudBinding(stored);
    },
    async save(_session: string, _file: CloudTextSave, _folderId?: string): Promise<CloudItemRef> {
      if (!googleClientId()) throw new Error(PHOTOS_SETUP_NEEDED);
      throw new Error(PHOTOS_LESSON_STAYS);
    },
    async open(_session: string, _folderId?: string): Promise<CloudItemRef[]> {
      if (!googleClientId()) throw new Error(PHOTOS_SETUP_NEEDED);
      throw new Error(PHOTOS_LESSON_STAYS);
    },
    openFolderUrl: (folderId) => (folderId === PHOTOS_LIBRARY_ID ? PHOTOS_WEB_URL : null),
    disconnect: () => {
      clearPhotosSession();
    },
  };
}
