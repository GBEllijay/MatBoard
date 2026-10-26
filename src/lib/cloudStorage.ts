/**
 * Owner cloud storage. Advantage does not host photos or videos.
 * Bytes stay in the gym's own account. Advantage does not manage that account.
 *
 * Coach Unlimited and Advantage Pro stay in alpha until Google Drive,
 * OneDrive, Google Photos, and iCloud all work. Google Drive is live.
 * OneDrive can connect on a build that has the Microsoft client id.
 * Google Photos can connect on a build that has the Google client id
 * and picks albums through the Photos Picker API. iCloud stays on the
 * Connect with list as Coming for launch until that connect is live.
 *
 * Dropbox is a reserved slot from an earlier note. It is not on the launch
 * list and it is not half-built. The owner order is OneDrive, then Google
 * Photos, then iCloud.
 */

import { createGoogleDriveConnector } from './googleDriveConnector.ts';
import { createGooglePhotosConnector } from './googlePhotosConnector.ts';
import { createOneDriveConnector } from './oneDriveConnector.ts';

export type CloudStorageProviderId = 'googleDrive' | 'oneDrive' | 'googlePhotos' | 'iCloud' | 'dropbox';

/** `live` can connect. `coming-for-launch` stays visible and disabled. */
export type CloudStoragePhase = 'live' | 'coming-for-launch' | 'reserved';

export const CONNECT_WITH_KICKER = 'Your folder';
export const CONNECT_WITH_TITLE = 'Connect with';
export const CONNECT_WITH_BODY =
  'Choose a folder the gym already owns. Lesson plans, photos, and videos stay there. Advantage does not host photos or videos, and Advantage does not manage the gym cloud account. Adding a photo still includes Google Photos and the phone gallery. Google Drive is an additional folder. iCloud is coming for launch.';
export const CONNECT_ACCOUNT_NOTE =
  'Advantage does not host photos or videos. The gym uses its own cloud account. Advantage does not manage that account.';
/** Gold label on the iCloud row only. Google Photos is a live connect and does not use this. */
export const CONNECT_LAUNCH_BADGE = 'Coming for launch';
/** @deprecated Display string is `CONNECT_LAUNCH_BADGE`. Only iCloud shows it. */
export const CONNECT_COMING_SOON_BADGE = CONNECT_LAUNCH_BADGE;
/** @deprecated Display string is `CONNECT_LAUNCH_BADGE`. */
export const CONNECT_COMING_SOON = CONNECT_LAUNCH_BADGE;
export const CONNECT_CHOOSE_FOLDER = 'Choose a folder.';
/**
 * Temporary owner heads-up while Advantage’s Google app is in Testing
 * and verification is still pending. Shown above the Google Drive button.
 */
export const CONNECT_GOOGLE_UNVERIFIED_NOTE =
  'Google may show a notice that this connection isn’t verified yet. Tap Continue, or Advanced then Continue, to proceed. This is temporary.';

export type CloudFolderRef = {
  id: string;
  name: string;
};

/** A file or folder the gym owns. */
export type CloudItemRef = {
  id: string;
  name: string;
};

export type CloudTextSave = {
  name: string;
  text: string;
};

export type CloudBinding = {
  providerId: CloudStorageProviderId;
  folderId: string;
  folderName: string;
  accountLabel: string | null;
};

export type CloudConnectResult =
  | { ok: true; session: string; folders: CloudFolderRef[] }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' | 'redirecting'; message: string };

/**
 * What Coach Unlimited and Advantage Pro call. Callers pass a provider id.
 * They do not call Google Drive or Microsoft Graph themselves.
 *
 * `connect` signs in and lists folders. `save` writes a text file the gym owns.
 * `open` lists names in a folder. `disconnect` forgets the link on this phone.
 * Google Drive day packages still run through `googleDrive.ts` until OneDrive
 * has the same date-folder layout.
 */
export interface CloudStorageConnector {
  readonly id: CloudStorageProviderId;
  readonly displayName: string;
  /** Where this provider sits in the owner “Connect with” list. */
  readonly phase: CloudStoragePhase;
  /** False when this build has no sign-in for the provider. */
  isAvailable(): boolean;
  /** Plain sentence for the gym owner when sign-in is not on this build. */
  unavailableMessage(): string;
  isConnected(): boolean;
  binding(): CloudBinding | null;
  /** Stable snapshot for React. Same reference until the binding changes. */
  getBindingSnapshot(): CloudBinding | null;
  subscribe(listener: () => void): () => void;
  /** Provider sign-in, then the folders the owner can pick. */
  connect(): Promise<CloudConnectResult>;
  pickFolder(session: string, folder: CloudFolderRef): Promise<CloudBinding>;
  /** Present when this provider can create the gym folder from the picker. */
  createFolder?(session: string): Promise<CloudFolderRef>;
  createFolderLabel?: string;
  /** Shown when connect returns no folders. */
  emptyFolderMessage?: string;
  /** Replaces “Choose a folder.” when this provider is not a Drive-style folder. */
  choosePrompt?: string;
  /** Write a text file into a folder the gym owns. Omit folderId for the account root. */
  save(session: string, file: CloudTextSave, folderId?: string): Promise<CloudItemRef>;
  /** List names in a folder the gym owns. Omit folderId to list the account root. */
  open(session: string, folderId?: string): Promise<CloudItemRef[]>;
  openFolderUrl(folderId: string): string | null;
  disconnect(): void;
}

/** On the Connect with list, but not a live sign-in. iCloud until that connect is live. */
function launchConnector(id: 'iCloud', displayName: string, message: string): CloudStorageConnector {
  return {
    id,
    displayName,
    phase: 'coming-for-launch',
    isAvailable: () => false,
    unavailableMessage: () => message,
    isConnected: () => false,
    binding: () => null,
    getBindingSnapshot: () => null,
    subscribe: () => () => {},
    connect: () => Promise.resolve({ ok: false, reason: 'unavailable', message }),
    pickFolder: () => Promise.reject(new Error(message)),
    save: () => Promise.reject(new Error(message)),
    open: () => Promise.reject(new Error(message)),
    openFolderUrl: () => null,
    disconnect: () => {},
  };
}

/** Earlier product note. Not half-built, and not on the launch list. */
function reservedConnector(id: 'dropbox', displayName: string): CloudStorageConnector {
  const message = `${displayName} is not on the Coach and Pro launch list.`;
  return {
    id,
    displayName,
    phase: 'reserved',
    isAvailable: () => false,
    unavailableMessage: () => message,
    isConnected: () => false,
    binding: () => null,
    getBindingSnapshot: () => null,
    subscribe: () => () => {},
    connect: () => Promise.resolve({ ok: false, reason: 'unavailable', message }),
    pickFolder: () => Promise.reject(new Error(message)),
    save: () => Promise.reject(new Error(message)),
    open: () => Promise.reject(new Error(message)),
    openFolderUrl: () => null,
    disconnect: () => {},
  };
}

const registry: Record<CloudStorageProviderId, CloudStorageConnector> = {
  googleDrive: createGoogleDriveConnector(),
  oneDrive: createOneDriveConnector(),
  googlePhotos: createGooglePhotosConnector(),
  iCloud: launchConnector(
    'iCloud',
    'iCloud',
    'iCloud is coming for launch. It is not a live connect in this build. Advantage does not host photos or videos.',
  ),
  dropbox: reservedConnector('dropbox', 'Dropbox'),
};

/** Owner list: live Drive, OneDrive, and Google Photos, then iCloud (Coming for launch). */
export const CLOUD_STORAGE_PROVIDER_IDS: readonly CloudStorageProviderId[] = [
  'googleDrive',
  'oneDrive',
  'googlePhotos',
  'iCloud',
];

/** Gold Coming for launch label for iCloud. Google Photos is a live connect and gets none. */
export function connectListBadge(provider: CloudStorageConnector): string | null {
  return provider.phase === 'coming-for-launch' ? CONNECT_LAUNCH_BADGE : null;
}

/** Google Drive is the default. Pass another id when that provider is wired. */
export function cloudStorage(id: CloudStorageProviderId = 'googleDrive'): CloudStorageConnector {
  return registry[id];
}

/** Connect with list. Dropbox is reserved and stays off this list. */
export function cloudStorageChoices(): readonly CloudStorageConnector[] {
  return CLOUD_STORAGE_PROVIDER_IDS.map((id) => registry[id]);
}
