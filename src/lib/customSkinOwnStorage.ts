/**
 * Gyms that keep files in their own Google Drive or OneDrive.
 * This uses the byte uploads those connections already have. It does not
 * change OAuth. A missing token or folder leaves the skin on the device;
 * the next class on this phone still has it.
 *
 * Drive files land at `<connected folder>/skins/<id>.jpg` plus a small JSON
 * name file. OneDrive uses an "Advantage skins" folder in the connected folder.
 * Deleting a skin removes the device copy always. The remote file is removed
 * when this device still has the id from the save. A later pass can sweep
 * orphans if that id was never stored.
 */

import { uploadGymTreeBytes, readDriveBinding, requestDriveToken } from './googleDrive.ts';
import {
  createOneDriveFolder,
  readOneDriveBinding,
  readOneDriveSession,
  saveOneDriveBytes,
} from './oneDrive.ts';
import type { CustomSkinRecord } from './customSkinStore.ts';

export type OwnSkinSave = {
  id: string;
  name: string;
  bytes: Blob;
  mime: string;
  updatedAt: number;
};

export async function saveCustomSkinToDrive(skin: OwnSkinSave): Promise<boolean> {
  const binding = readDriveBinding();
  if (!binding) return false;
  const token = await requestDriveToken('silent');
  if (!token) return false;
  const ext = skin.mime === 'image/png' ? 'png' : skin.mime === 'image/webp' ? 'webp' : 'jpg';
  try {
    await uploadGymTreeBytes({
      token,
      rootFolderId: binding.folderId,
      relativePath: `skins/${skin.id}.${ext}`,
      bytes: skin.bytes,
      mime: skin.mime,
      appProperties: { advantage: 'custom-skin', skinId: skin.id, skinName: skin.name.slice(0, 80) },
    });
    await uploadGymTreeBytes({
      token,
      rootFolderId: binding.folderId,
      relativePath: `skins/${skin.id}.json`,
      bytes: new Blob([JSON.stringify({ id: skin.id, name: skin.name, updatedAt: skin.updatedAt })], { type: 'application/json' }),
      mime: 'application/json',
      appProperties: { advantage: 'custom-skin', skinId: skin.id },
    });
    return true;
  } catch {
    return false;
  }
}

export async function saveCustomSkinToOneDrive(skin: OwnSkinSave): Promise<boolean> {
  const binding = readOneDriveBinding();
  const session = readOneDriveSession();
  if (!binding || !session) return false;
  const ext = skin.mime === 'image/png' ? 'png' : skin.mime === 'image/webp' ? 'webp' : 'jpg';
  try {
    const folder = await createOneDriveFolder(session.token, 'Advantage skins', fetch, binding.folderId);
    await saveOneDriveBytes(session.token, { name: `${skin.id}.${ext}`, bytes: skin.bytes, mime: skin.mime }, folder.id);
    await saveOneDriveBytes(
      session.token,
      {
        name: `${skin.id}.json`,
        bytes: new Blob([JSON.stringify({ id: skin.id, name: skin.name, updatedAt: skin.updatedAt })], { type: 'application/json' }),
        mime: 'application/json',
      },
      folder.id,
    );
    return true;
  } catch {
    return false;
  }
}

export function ownSkinFromRecord(record: CustomSkinRecord): OwnSkinSave {
  return {
    id: record.id,
    name: record.name,
    bytes: record.image,
    mime: record.mime,
    updatedAt: record.updatedAt,
  };
}
