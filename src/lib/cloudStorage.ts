/**
 * Owner cloud storage. Advantage does not host photos or videos.
 * Bytes stay in the gym's own account. Adding a photo still uses Google
 * Photos and the phone gallery. Google Drive is an additional folder.
 *
 * Google Drive is the first connector. OneDrive, Dropbox, and iCloud are
 * slots for the same Connect → sign-in → pick folder flow later.
 */

import { createGoogleDriveConnector } from './googleDriveConnector.ts';

export type CloudStorageProviderId = 'googleDrive' | 'oneDrive' | 'dropbox' | 'iCloud';

/** `live` is a real connect choice. `coming-soon` stays in the same list, disabled. */
export type CloudStoragePhase = 'live' | 'coming-soon';

export const CONNECT_WITH_KICKER = 'Your folder';
export const CONNECT_WITH_TITLE = 'Connect with';
export const CONNECT_WITH_BODY =
  'Choose a folder the gym already owns. Lesson plans, photos, and videos stay there. Advantage does not host photos or videos. Adding a photo still includes Google Photos and the phone gallery. Google Drive is an additional folder.';
export const CONNECT_COMING_SOON = 'Coming soon';
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

export type CloudBinding = {
  providerId: CloudStorageProviderId;
  folderId: string;
  folderName: string;
  accountLabel: string | null;
};

export type CloudConnectResult =
  | { ok: true; session: string; folders: CloudFolderRef[] }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed'; message: string };

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
  openFolderUrl(folderId: string): string | null;
  disconnect(): void;
}

/**
 * Later provider. Shown in the Connect with list as coming soon.
 * Connect and folder pick stay unimplemented until that sign-in exists.
 */
function futureConnector(id: Exclude<CloudStorageProviderId, 'googleDrive'>, displayName: string): CloudStorageConnector {
  const message = `${displayName} is coming soon.`;
  return {
    id,
    displayName,
    phase: 'coming-soon',
    isAvailable: () => false,
    unavailableMessage: () => message,
    isConnected: () => false,
    binding: () => null,
    getBindingSnapshot: () => null,
    subscribe: () => () => {},
    connect: () => Promise.resolve({ ok: false, reason: 'unavailable', message }),
    pickFolder: () => Promise.reject(new Error(message)),
    openFolderUrl: () => null,
    disconnect: () => {},
  };
}

const registry: Record<CloudStorageProviderId, CloudStorageConnector> = {
  googleDrive: createGoogleDriveConnector(),
  oneDrive: futureConnector('oneDrive', 'OneDrive'),
  dropbox: futureConnector('dropbox', 'Dropbox'),
  iCloud: futureConnector('iCloud', 'iCloud'),
};

export const CLOUD_STORAGE_PROVIDER_IDS: readonly CloudStorageProviderId[] = [
  'googleDrive',
  'oneDrive',
  'dropbox',
  'iCloud',
];

/** Google Drive is the default. Pass another id when that provider is wired. */
export function cloudStorage(id: CloudStorageProviderId = 'googleDrive'): CloudStorageConnector {
  return registry[id];
}

/** Owner list order: live Google Drive, then the coming-soon choices. */
export function cloudStorageChoices(): readonly CloudStorageConnector[] {
  return CLOUD_STORAGE_PROVIDER_IDS.map((id) => registry[id]);
}
