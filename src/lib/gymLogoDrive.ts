/**
 * Save the Media Console gym logo into the connected gym Drive folder.
 * Hidden when Drive is not connected. This path is for the gym logo only.
 */

import { readDriveBinding, requestDriveToken, uploadGymLogoFile } from './googleDrive.ts';

export type GymLogoDriveStatus = 'saved' | 'needs-drive' | 'failed';

export type GymLogoDriveDeps = {
  folderId: () => string | null;
  token: () => Promise<string | null>;
  upload: (input: { token: string; folderId: string; blob: Blob }) => Promise<void>;
};

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:image/') || comma < 0) return null;
  const mime = dataUrl.slice(5, comma).split(';')[0] || 'image/jpeg';
  try {
    const binary = atob(dataUrl.slice(comma + 1).replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function liveDeps(): GymLogoDriveDeps {
  return {
    folderId: () => readDriveBinding()?.folderId ?? null,
    token: async () => (await requestDriveToken('silent')) ?? (await requestDriveToken('consent')),
    upload: async ({ token, folderId, blob }) => {
      await uploadGymLogoFile({ token, folderId, bytes: blob, mime: blob.type || 'image/jpeg' });
    },
  };
}

/** True when a gym folder is already connected. The button stays hidden otherwise. */
export function gymDriveConnected(): boolean {
  return readDriveBinding() != null;
}

/**
 * Copy the gym logo into the connected folder.
 * Returns needs-drive when the folder is not connected or sign-in is declined.
 */
export async function saveGymLogoToDrive(dataUrl: string, deps: GymLogoDriveDeps = liveDeps()): Promise<GymLogoDriveStatus> {
  const folderId = deps.folderId();
  if (!folderId) return 'needs-drive';
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return 'failed';
  const token = await deps.token();
  if (!token) return 'needs-drive';
  try {
    await deps.upload({ token, folderId, blob });
    return 'saved';
  } catch {
    return 'failed';
  }
}
