/**
 * Owner cloud storage. Advantage does not host photos or videos.
 * Bytes stay in the gym's own account. Google Photos is not a provider.
 *
 * Google Drive is the first connector. OneDrive, Dropbox, and iCloud are
 * slots for the same Connect → sign-in → pick folder flow later.
 */

import { createGoogleDriveConnector } from './googleDriveConnector.ts';

export type CloudStorageProviderId = 'googleDrive' | 'oneDrive' | 'dropbox' | 'iCloud';

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
 * Later provider. Connect and folder pick stay unimplemented until that
 * company sign-in exists. The owner still sees a plain unavailable note.
 */
function futureConnector(id: Exclude<CloudStorageProviderId, 'googleDrive'>, displayName: string): CloudStorageConnector {
  const message = `${displayName} is not available on this build yet — contact Advantage.`;
  return {
    id,
    displayName,
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
