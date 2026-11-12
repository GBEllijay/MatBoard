/**
 * Advantage Cloud as an ApprovalLaneStore.
 *
 * Gallery: gallery/{pending|approved|rejected}/{date}/{file}. Approving copies
 * the file to approved/ on the server and removes the pending copy. Rejecting
 * deletes the pending file.
 * Daily videos: the file stays at videos/daily/{date}/{file}. The server keeps
 * a tiny pending marker beside it; approving removes the marker, so no video
 * bytes are copied. Rejecting deletes the video and its marker. Daily videos
 * with no marker (everything uploaded before lanes existed) are approved.
 */

import {
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalLane,
  type ApprovalLaneStore,
  type ApprovalResult,
  type ApprovalSource,
  decisionLane,
  mediaKindOf,
  sortForGallery,
} from './approvalLanes.ts';
import { notifyCloudMedia, parseGalleryCloudPath, readCloudBearer, type CloudFileRow } from './advantageCloudMedia.ts';

type Fetcher = typeof fetch;

export const CLOUD_GALLERY_READ_ERROR = 'Could not read the Advantage Cloud gallery. Nothing on this device was changed.';

function itemFrom(row: CloudFileRow & { dateKey?: string; source?: string }, source: ApprovalSource, lane: ApprovalLane): ApprovalItem | null {
  const dateKey = row.dateKey || (source === 'gallery' ? parseGalleryCloudPath(row.path)?.dateKey : row.path.split('/')[2]) || '';
  if (!dateKey) return null;
  return {
    provider: 'advantage-cloud',
    source,
    lane,
    path: row.path,
    name: row.name,
    dateKey,
    mime: row.mime,
    size: row.size,
    kind: mediaKindOf(row.mime, row.name),
  };
}

/**
 * Approved photos and daily videos for the display gallery.
 * Null: this device is not signed in to Cloud, or the license has no Cloud.
 * `{ error }`: Cloud answered with a failure the page should show.
 */
export async function listApprovedCloudMedia(input?: {
  token?: string;
  fetcher?: Fetcher;
}): Promise<ApprovalItem[] | null | { error: string }> {
  const token = input?.token ?? readCloudBearer();
  if (!token) return null;
  const fetcher = input?.fetcher ?? fetch;
  try {
    const response = await fetcher('/api/gym/cloud?op=list&purpose=approved-media', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403 || response.status === 503) return null;
    if (!response.ok) return { error: CLOUD_GALLERY_READ_ERROR };
    const body = (await response.json()) as { items?: (CloudFileRow & { source?: string; dateKey?: string })[] };
    const rows = Array.isArray(body.items) ? body.items : [];
    const items: ApprovalItem[] = [];
    for (const row of rows) {
      const source: ApprovalSource = row.source === 'daily-video' ? 'daily-video' : 'gallery';
      const item = itemFrom(row, source, 'approved');
      if (item) items.push(item);
    }
    return sortForGallery(items);
  } catch {
    return { error: CLOUD_GALLERY_READ_ERROR };
  }
}

async function listLane(lane: ApprovalLane, source: ApprovalSource | undefined, token: string, fetcher: Fetcher): Promise<ApprovalItem[] | null> {
  const headers = { authorization: `Bearer ${token}` };
  const items: ApprovalItem[] = [];
  if (!source || source === 'gallery') {
    const response = await fetcher(`/api/gym/cloud?op=list&purpose=gallery&lane=${encodeURIComponent(lane)}`, { headers });
    if (!response.ok) return null;
    const body = (await response.json()) as { files?: CloudFileRow[] };
    for (const row of Array.isArray(body.files) ? body.files : []) {
      if (parseGalleryCloudPath(row.path)?.lane !== lane) continue;
      const item = itemFrom(row, 'gallery', lane);
      if (item) items.push(item);
    }
  }
  if ((!source || source === 'daily-video') && lane === 'pending') {
    const response = await fetcher('/api/gym/cloud?op=list&purpose=daily-review', { headers });
    // Only approvers get this list. Anyone else simply has no daily rows to review.
    if (response.ok) {
      const body = (await response.json()) as { files?: (CloudFileRow & { dateKey?: string })[] };
      for (const row of Array.isArray(body.files) ? body.files : []) {
        const item = itemFrom(row, 'daily-video', 'pending');
        if (item) items.push(item);
      }
    } else if (source === 'daily-video') {
      return null;
    }
  }
  return sortForGallery(items);
}

export function advantageCloudLaneStore(input?: { token?: string; fetcher?: Fetcher }): ApprovalLaneStore {
  const tokenOf = () => input?.token ?? readCloudBearer();
  const fetcherOf = () => input?.fetcher ?? fetch;
  return {
    provider: 'advantage-cloud',
    async list({ lane, source }) {
      const token = tokenOf();
      if (!token) return null;
      if (lane === 'approved') {
        const approved = await listApprovedCloudMedia({ token, fetcher: fetcherOf() });
        if (!approved || !Array.isArray(approved)) return null;
        return source ? approved.filter((item) => item.source === source) : approved;
      }
      try {
        return await listLane(lane, source, token, fetcherOf());
      } catch {
        return null;
      }
    },
    async decide(item: ApprovalItem, decision: ApprovalDecision): Promise<ApprovalResult> {
      const token = tokenOf();
      if (!token) return { ok: false, message: 'Sign in on this device to use Advantage Cloud.' };
      const action =
        item.source === 'daily-video'
          ? decision === 'approve'
            ? 'daily-approve'
            : 'daily-reject'
          : decision === 'approve'
            ? 'gallery-approve'
            : 'gallery-reject';
      try {
        const response = await fetcherOf()('/api/gym/cloud', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ action, key: item.path }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: unknown; path?: unknown };
        if (!response.ok) {
          return { ok: false, message: typeof body.error === 'string' ? body.error : 'That did not save. Try again.' };
        }
        notifyCloudMedia();
        return {
          ok: true,
          item: { ...item, lane: decisionLane(decision), path: typeof body.path === 'string' ? body.path : item.path },
        };
      } catch {
        return { ok: false, message: 'That did not save. Try again.' };
      }
    },
    async open(item: ApprovalItem): Promise<Blob | null> {
      const token = tokenOf();
      if (!token) return null;
      try {
        const response = await fetcherOf()(`/api/gym/cloud?op=file&path=${encodeURIComponent(item.path)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        return await response.blob();
      } catch {
        return null;
      }
    },
  };
}
