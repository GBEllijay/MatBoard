/**
 * Wires device skins to Advantage Cloud, or to the gym's Drive / OneDrive
 * when that is the home. Called when a Media-and-above picker opens.
 * A preview with no GYM_MEDIA binding resolves to device (or the gym's own
 * folder when that session can already save).
 */

import { entitlementSnapshot } from './entitlement.ts';
import {
  deleteCustomSkinFromAdvantageCloud,
  downloadAdvantageCloudSkin,
  listAdvantageCloudSkins,
  resolveCustomSkinHome,
  uploadCustomSkinToAdvantageCloud,
} from './customSkinCloud.ts';
import { ownSkinFromRecord, saveCustomSkinToDrive, saveCustomSkinToOneDrive } from './customSkinOwnStorage.ts';
import { prepareCustomSkinFile, type CustomSkinHome } from './customSkin.ts';
import {
  listCustomSkins,
  readCustomSkin,
  savePreparedCustomSkin,
  setCustomSkinPublisher,
  setCustomSkinRemover,
  type CustomSkinRecord,
} from './customSkinStore.ts';

function licenseId(): string | null {
  const claims = entitlementSnapshot().claims;
  if (!claims?.sub) return null;
  if (claims.src === 'seat' || claims.tier === 'seat') return claims.gym || claims.sub;
  return claims.sub;
}

async function publish(record: CustomSkinRecord): Promise<CustomSkinHome> {
  const home = await resolveCustomSkinHome();
  if (home === 'advantage-cloud') {
    const id = licenseId();
    if (!id) return 'device';
    const saved = await uploadCustomSkinToAdvantageCloud({
      licenseId: id,
      id: record.id,
      name: record.name,
      image: record.image,
      mime: record.mime,
      updatedAt: record.updatedAt,
    });
    return saved.ok ? 'advantage-cloud' : 'device';
  }
  if (home === 'google-drive') return (await saveCustomSkinToDrive(ownSkinFromRecord(record))) ? 'google-drive' : 'device';
  if (home === 'onedrive') return (await saveCustomSkinToOneDrive(ownSkinFromRecord(record))) ? 'onedrive' : 'device';
  return 'device';
}

let installed = false;

export function installCustomSkinSync(): void {
  if (installed) return;
  installed = true;
  setCustomSkinPublisher(publish);
  setCustomSkinRemover(async (id, remote) => {
    if (remote === 'advantage-cloud') await deleteCustomSkinFromAdvantageCloud({ id });
  });
}

/** Copy cloud skins that this device does not have yet. Stops at the cap of 10. */
export async function pullCustomSkins(): Promise<void> {
  installCustomSkinSync();
  if ((await resolveCustomSkinHome()) !== 'advantage-cloud') return;
  const remote = await listAdvantageCloudSkins();
  for (const row of remote) {
    if (listCustomSkins().length >= 10 && !listCustomSkins().some((skin) => skin.id === row.id)) break;
    const local = await readCustomSkin(row.id);
    if (local && local.name === row.name) continue;
    const blob = local?.image ?? (await downloadAdvantageCloudSkin({ id: row.id }));
    if (!blob) continue;
    const file = new File([blob], `${row.id}.jpg`, { type: blob.type || row.mime || 'image/jpeg' });
    const prepared = await prepareCustomSkinFile(file);
    const image = 'error' in prepared ? blob : prepared.image;
    const thumb = 'error' in prepared ? blob : prepared.thumb;
    await savePreparedCustomSkin({
      id: row.id,
      name: row.name,
      image,
      thumb,
      mime: image.type || row.mime || 'image/jpeg',
      remote: 'advantage-cloud',
      publish: false,
    });
  }
}
