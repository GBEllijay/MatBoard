/**
 * Staff gallery on Advantage Cloud: gallery/{pending|approved|rejected}/{date}/{file}.
 * The owner uploads straight to approved. Coach and Instructors seats upload to pending.
 */

import { parseGalleryCloudPath, readCloudBearer, type CloudFileRow, type GalleryCloudLane } from './advantageCloudMedia.ts';

export type CloudGalleryFile = CloudFileRow & { lane: GalleryCloudLane; dateKey: string };

function authHeaders(): HeadersInit | null {
  const token = readCloudBearer();
  if (!token) return null;
  return { authorization: `Bearer ${token}` };
}

export async function listCloudGallery(input: {
  lane: GalleryCloudLane;
  dateKey?: string;
  fetcher?: typeof fetch;
  token?: string;
}): Promise<CloudGalleryFile[] | null> {
  const token = input.token ?? readCloudBearer();
  if (!token) return null;
  const fetcher = input.fetcher ?? fetch;
  const date = input.dateKey ? `&date=${encodeURIComponent(input.dateKey)}` : '';
  try {
    const response = await fetcher(
      `/api/gym/cloud?op=list&purpose=gallery&lane=${encodeURIComponent(input.lane)}${date}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { files?: CloudFileRow[] };
    const files = Array.isArray(body.files) ? body.files : [];
    const rows: CloudGalleryFile[] = [];
    for (const file of files) {
      const parsed = parseGalleryCloudPath(file.path);
      if (!parsed || parsed.lane !== input.lane) continue;
      rows.push({ ...file, lane: parsed.lane, dateKey: parsed.dateKey });
    }
    return rows;
  } catch {
    return null;
  }
}

/** Null when this device is not on Advantage Cloud. Otherwise the pending totals. */
export async function cloudGalleryPendingCount(
  dateKey?: string,
  fetcher?: typeof fetch,
): Promise<{ waiting: number; dayCount: number } | null> {
  const headers = authHeaders();
  if (!headers) return null;
  const pending = await listCloudGallery({ lane: 'pending', fetcher });
  if (!pending) return null;
  const dayCount = dateKey ? pending.filter((file) => file.dateKey === dateKey).length : 0;
  return { waiting: pending.length, dayCount };
}

export async function decideCloudGallery(input: {
  path: string;
  action: 'gallery-approve' | 'gallery-reject';
  fetcher?: typeof fetch;
}): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const headers = authHeaders();
  if (!headers) return { ok: false, message: 'Sign in on this device to use Advantage Cloud.' };
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher('/api/gym/cloud', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ action: input.action, key: input.path }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: unknown; path?: unknown };
    if (!response.ok) {
      return { ok: false, message: typeof body.error === 'string' ? body.error : 'That did not save. Try again.' };
    }
    return { ok: true, path: typeof body.path === 'string' ? body.path : input.path };
  } catch {
    return { ok: false, message: 'That did not save. Try again.' };
  }
}
