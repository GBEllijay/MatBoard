/**
 * Delete and clean up Advantage Cloud photos and videos.
 *
 * Cutoff is the class or recording date in the file path, not the upload
 * time. The calendar day is taken from the server clock in UTC. Pending
 * files stay in Review Inbox until someone approves or rejects them.
 */
import { formatCloudBytes, notifyCloudMedia, readCloudBearer, type CloudFileRow } from './advantageCloudMedia.ts';

type Fetcher = typeof fetch;

export const VIDEO_CLEANUP_DAYS = [30, 60, 90, 180] as const;
export type VideoCleanupDays = (typeof VIDEO_CLEANUP_DAYS)[number];
export const DEFAULT_VIDEO_CLEANUP_DAYS: VideoCleanupDays = 90;
/** Paths in one delete request. Each path may also remove a marker or two. */
export const MEDIA_DELETE_BATCH_MAX = 100;
/** Old-video list rows returned in one response. The rest wait for another pass. */
export const OLD_VIDEO_LIST_MAX = 200;

export const CLOUD_DELETE_CONFIRM_PHOTO = 'Delete this photo from Advantage Cloud? This cannot be undone.';
export const CLOUD_DELETE_CONFIRM_VIDEO = 'Delete this video from Advantage Cloud? This cannot be undone.';
export const CLOUD_REJECT_DELETE_CONFIRM = 'Reject and delete this file from Advantage Cloud? This cannot be undone.';
export const CLOUD_REJECT_DELETED_MESSAGE = 'Rejected and deleted. It will not play.';
export const CLOUD_DELETE_DONE = 'Deleted from Advantage Cloud.';
export const CLOUD_DELETE_FAILED = 'That file could not be deleted. Try again.';
export const CLOUD_CLEANUP_READ_ERROR = 'Could not list old videos. Try again.';
export const CLOUD_CLEANUP_EMPTY = (days: number) => `No videos are older than ${days} days.`;

export type OldCloudVideo = CloudFileRow & {
  dateKey: string;
  source: 'gallery' | 'daily-video';
  kind: 'video';
  lane: 'approved' | 'rejected';
};

export type OldCloudVideoList = {
  days: VideoCleanupDays;
  cutoff: string;
  count: number;
  totalBytes: number;
  items: OldCloudVideo[];
  truncated: boolean;
  /** This gym's whole Cloud usage, the same per-license measure as op=status (PR 517). */
  licenseUsedBytes?: number;
  capBytes?: number;
};

/** Window event the soft-limit link fires so an already-mounted cleanup panel opens. */
export const CLOUD_CLEANUP_OPEN_EVENT = 'matboard-cloud-cleanup-open';
/** Query flag on CLOUD_CLEANUP_ROUTE that opens the cleanup panel on arrival. */
export const CLOUD_CLEANUP_QUERY = 'cleanup';

export function cloudCleanupRequested(search: string): boolean {
  return new URLSearchParams(search).get(CLOUD_CLEANUP_QUERY) === 'old-videos';
}

export type CloudDeleteResult =
  | { ok: true; deleted: number; licenseUsedBytes?: number; bucketUsedBytes?: number; capBytes?: number }
  | { ok: false; message: string };

export function isVideoCleanupDays(value: number): value is VideoCleanupDays {
  return (VIDEO_CLEANUP_DAYS as readonly number[]).includes(value);
}

export function parseVideoCleanupDays(raw: string | null | undefined, fallback: VideoCleanupDays = DEFAULT_VIDEO_CLEANUP_DAYS): VideoCleanupDays {
  const value = Number(raw);
  return isVideoCleanupDays(value) ? value : fallback;
}

/**
 * Inclusive cutoff date: a file whose date is this day or earlier is old
 * enough. `2026-11-12` minus 90 days is `2026-08-14`.
 */
export function videoCleanupCutoffDate(days: number, now: Date): string {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

export function isOnOrBeforeDateKey(dateKey: string, cutoff: string): boolean {
  return dateKey <= cutoff;
}

export function cloudCleanupSummary(count: number, totalBytes: number, truncated = false): string {
  const size = formatCloudBytes(totalBytes);
  if (count === 0) return '0 videos';
  const noun = count === 1 ? 'video' : 'videos';
  const base = `${count} ${noun} · ${size}`;
  return truncated ? `At least ${base}. Showing the first ${Math.min(count, OLD_VIDEO_LIST_MAX)}.` : base;
}

export function cloudCleanupConfirm(count: number, totalBytes: number): string {
  const noun = count === 1 ? 'video' : 'videos';
  return `Permanently delete ${count} ${noun} (${formatCloudBytes(totalBytes)}) from Advantage Cloud? This cannot be undone.`;
}

export async function listOldCloudVideos(input: {
  days: number;
  token?: string;
  fetcher?: Fetcher;
}): Promise<OldCloudVideoList | null | { error: string }> {
  const token = input.token ?? readCloudBearer();
  if (!token) return null;
  const days = isVideoCleanupDays(input.days) ? input.days : DEFAULT_VIDEO_CLEANUP_DAYS;
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(`/api/gym/cloud?op=list&purpose=old-videos&days=${days}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403 || response.status === 503) return null;
    if (!response.ok) return { error: CLOUD_CLEANUP_READ_ERROR };
    const body = (await response.json()) as Partial<OldCloudVideoList> & { ok?: boolean };
    const items = Array.isArray(body.items) ? body.items.filter(isOldCloudVideo) : [];
    return {
      days,
      cutoff: typeof body.cutoff === 'string' ? body.cutoff : videoCleanupCutoffDate(days, new Date()),
      count: typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : items.length,
      totalBytes: typeof body.totalBytes === 'number' && Number.isFinite(body.totalBytes) ? body.totalBytes : items.reduce((sum, item) => sum + item.size, 0),
      items,
      truncated: body.truncated === true,
      ...(typeof body.licenseUsedBytes === 'number' && Number.isFinite(body.licenseUsedBytes) ? { licenseUsedBytes: body.licenseUsedBytes } : {}),
      ...(typeof body.capBytes === 'number' && Number.isFinite(body.capBytes) ? { capBytes: body.capBytes } : {}),
    };
  } catch {
    return { error: CLOUD_CLEANUP_READ_ERROR };
  }
}

function isOldCloudVideo(row: unknown): row is OldCloudVideo {
  if (!row || typeof row !== 'object') return false;
  const item = row as Partial<OldCloudVideo>;
  return (
    typeof item.path === 'string' &&
    typeof item.name === 'string' &&
    typeof item.dateKey === 'string' &&
    typeof item.size === 'number' &&
    (item.source === 'gallery' || item.source === 'daily-video')
  );
}

export async function deleteCloudMedia(input: { paths: string[]; token?: string; fetcher?: Fetcher }): Promise<CloudDeleteResult> {
  const token = input.token ?? readCloudBearer();
  if (!token) return { ok: false, message: 'Sign in on this device to use Advantage Cloud.' };
  if (!input.paths.length) return { ok: false, message: 'Choose a file to delete.' };
  if (input.paths.length > MEDIA_DELETE_BATCH_MAX) {
    return { ok: false, message: `Delete up to ${MEDIA_DELETE_BATCH_MAX} files at a time.` };
  }
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher('/api/gym/cloud', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-media', keys: input.paths }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: unknown;
      deleted?: unknown;
      licenseUsedBytes?: unknown;
      bucketUsedBytes?: unknown;
      capBytes?: unknown;
    };
    if (!response.ok) {
      return { ok: false, message: typeof body.error === 'string' ? body.error : CLOUD_DELETE_FAILED };
    }
    notifyCloudMedia();
    return {
      ok: true,
      deleted: typeof body.deleted === 'number' && Number.isFinite(body.deleted) ? body.deleted : input.paths.length,
      ...(typeof body.licenseUsedBytes === 'number' ? { licenseUsedBytes: body.licenseUsedBytes } : {}),
      ...(typeof body.bucketUsedBytes === 'number' ? { bucketUsedBytes: body.bucketUsedBytes } : {}),
      ...(typeof body.capBytes === 'number' ? { capBytes: body.capBytes } : {}),
    };
  } catch {
    return { ok: false, message: CLOUD_DELETE_FAILED };
  }
}

export async function deleteCloudMediaInBatches(input: {
  paths: string[];
  token?: string;
  fetcher?: Fetcher;
}): Promise<CloudDeleteResult> {
  let deleted = 0;
  let usage: Pick<Extract<CloudDeleteResult, { ok: true }>, 'licenseUsedBytes' | 'bucketUsedBytes' | 'capBytes'> = {};
  for (let offset = 0; offset < input.paths.length; offset += MEDIA_DELETE_BATCH_MAX) {
    const slice = input.paths.slice(offset, offset + MEDIA_DELETE_BATCH_MAX);
    const result = await deleteCloudMedia({ ...input, paths: slice });
    if (!result.ok) return deleted ? { ok: false, message: `${result.message} Deleted ${deleted} first.` } : result;
    deleted += result.deleted;
    usage = {
      licenseUsedBytes: result.licenseUsedBytes,
      bucketUsedBytes: result.bucketUsedBytes,
      capBytes: result.capBytes,
    };
  }
  return { ok: true, deleted, ...usage };
}
