/**
 * Custom skins in Advantage Cloud.
 * The image key is `groups/<license>/skins/<id>`. A tiny JSON next to it holds the name.
 * Both count toward the existing GYM_MEDIA byte cap. The server also refuses an 11th skin.
 * A preview probe that is unbound never calls this. The skin stays on the device.
 */

import { cloudObjectKey, readCloudBearer } from './advantageCloudMedia.ts';
import { probeAdvantageCloud } from './gymHome.ts';
import { proPlusCloudUnlocked } from './proPlusCloud.ts';
import { readDriveBinding } from './googleDrive.ts';
import { readOneDriveBinding } from './oneDrive.ts';
import {
  chooseCustomSkinHome,
  type CustomSkinHome,
} from './customSkin.ts';

export type CloudSkinRow = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  updatedAt: number;
};

type CloudFetcher = typeof fetch;

function originUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://advantagebjjtimer.com';
  return new URL(path, origin).toString();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    /* plain text */
  }
  return 'Advantage Cloud could not save that skin.';
}

export async function resolveCustomSkinHome(fetcher: CloudFetcher = fetch): Promise<CustomSkinHome> {
  let cloudBound = false;
  try {
    cloudBound = await probeAdvantageCloud(fetcher);
  } catch {
    cloudBound = false;
  }
  return chooseCustomSkinHome({
    plusCloud: proPlusCloudUnlocked(),
    cloudBound,
    driveConnected: readDriveBinding() != null,
    oneDriveConnected: readOneDriveBinding() != null,
  });
}

export function customSkinCloudKey(licenseId: string, id: string, meta = false): string | null {
  return cloudObjectKey(licenseId, meta ? `skins/${id}.json` : `skins/${id}`);
}

export async function uploadCustomSkinToAdvantageCloud(input: {
  licenseId: string;
  id: string;
  name: string;
  image: Blob;
  mime: string;
  updatedAt: number;
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const fetcher = input.fetcher ?? fetch;
  const token = input.token ?? readCloudBearer();
  const imageKey = customSkinCloudKey(input.licenseId, input.id);
  const metaKey = customSkinCloudKey(input.licenseId, input.id, true);
  if (!token || !imageKey || !metaKey) return { ok: false, message: 'Sign in on this device to use Advantage Cloud.' };
  const imagePut = await fetcher(originUrl(`/api/gym/cloud?op=put&key=${encodeURIComponent(imageKey)}`), {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': input.mime },
    body: input.image,
  });
  if (!imagePut.ok) return { ok: false, message: await readError(imagePut) };
  const meta = JSON.stringify({ id: input.id, name: input.name, updatedAt: input.updatedAt });
  const metaPut = await fetcher(originUrl(`/api/gym/cloud?op=put&key=${encodeURIComponent(metaKey)}`), {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: meta,
  });
  if (!metaPut.ok) return { ok: false, message: await readError(metaPut) };
  return { ok: true };
}

export async function deleteCustomSkinFromAdvantageCloud(input: {
  id: string;
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<void> {
  const token = input.token ?? readCloudBearer();
  if (!token) return;
  const fetcher = input.fetcher ?? fetch;
  await fetcher(originUrl('/api/gym/cloud'), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete-skin', id: input.id }),
  });
}

export async function listAdvantageCloudSkins(input: { token?: string; fetcher?: CloudFetcher } = {}): Promise<CloudSkinRow[]> {
  const token = input.token ?? readCloudBearer();
  if (!token) return [];
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(originUrl('/api/gym/cloud?op=skins'), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { skins?: CloudSkinRow[] };
  return Array.isArray(body.skins) ? body.skins : [];
}

export async function downloadAdvantageCloudSkin(input: {
  id: string;
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<Blob | null> {
  const token = input.token ?? readCloudBearer();
  if (!token) return null;
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(originUrl(`/api/gym/cloud?op=file&path=${encodeURIComponent(`skins/${input.id}`)}`), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.blob();
}
