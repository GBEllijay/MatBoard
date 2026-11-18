/**
 * Advantage Cloud folders on the Gallery page: Gallery, Pro Shop, Events, Schedule.
 *
 * Gallery is the one folder the TV slideshow plays. It keeps the existing
 * `gallery/{lane}/{date}/{file}` keys (it used to be labeled "Class photos"), so
 * every file already uploaded stays where it is and keeps playing. Only approved
 * Gallery files are listed. Daily videos are not part of Gallery; they keep their
 * own folder (`videos/daily/`) and their own pages.
 *
 * Pro Shop, Events, and Schedule are flat folders (`pro-shop/`, `events/`,
 * `schedule/`), the same layout the gym tree uses in Google Drive and OneDrive.
 * Everyone who can open the folders may upload. While the owner's approval
 * switch is on, a seat's upload waits (`gallery/pending/…`, `{folder}/pending/…`)
 * until the owner approves it in Review Inbox. The server decides; this file only asks.
 */

import type { ApprovalItem } from './approvalLanes.ts';
import {
  CLOUD_SIGN_IN_MESSAGE,
  cloudUrl,
  notifyCloudMedia,
  readCloudBearer,
  uploadAdvantageCloudFile,
  type CloudSideFolder,
  type CloudUploadResult,
} from './advantageCloudMedia.ts';

type Fetcher = typeof fetch;

export type CloudFolderId = 'gallery' | CloudSideFolder;

export type CloudFolderInfo = {
  id: CloudFolderId;
  label: string;
  hint: string;
};

export const CLOUD_FOLDERS: readonly CloudFolderInfo[] = [
  {
    id: 'gallery',
    label: 'Gallery',
    hint: 'Photos and videos that play on the TV slideshow. Daily photo uploads land here too.',
  },
  { id: 'pro-shop', label: 'Pro Shop', hint: 'Product photos, price lists, and gear for the Pro Shop.' },
  { id: 'events', label: 'Events', hint: 'Flyers and photos for seminars, tournaments, and gym events.' },
  { id: 'schedule', label: 'Schedule', hint: 'The class schedule as a photo or PDF.' },
];

export const CLOUD_FOLDERS_TITLE = 'Advantage Cloud';
export const CLOUD_FOLDERS_HINT = 'Tap a folder to open it. Any signed-in phone, tablet, or TV sees the same folders.';
export const CLOUD_FOLDER_EMPTY = 'Nothing in this folder yet.';
export const CLOUD_FOLDER_READ_ERROR = 'Could not read that Advantage Cloud folder. Nothing on this device was changed.';
export const CLOUD_GALLERY_FOLDER_ACCEPT = 'image/*,video/*';
export const CLOUD_SIDE_FOLDER_ACCEPT = 'image/*,video/*,application/pdf';

export function cloudFolderInfo(id: CloudFolderId): CloudFolderInfo {
  return CLOUD_FOLDERS.find((folder) => folder.id === id) ?? CLOUD_FOLDERS[0];
}

/** One file in a Cloud folder. Shaped like an approved Cloud lane item so the same opener reads its bytes. */
export type CloudFolderItem = Omit<ApprovalItem, 'kind'> & {
  folder: CloudFolderId;
  kind: 'photo' | 'video' | 'file';
};

export type CloudFolderListing = {
  folder: CloudFolderId;
  items: CloudFolderItem[];
  canUpload: boolean;
  canDelete: boolean;
  /** Where a new upload from this seat lands: pending while the owner's approval switch is on. */
  uploadLane: 'approved' | 'pending' | null;
};

type FolderRow = {
  name?: unknown;
  path?: unknown;
  size?: unknown;
  mime?: unknown;
  dateKey?: unknown;
  kind?: unknown;
};

function itemOf(folder: CloudFolderId, row: FolderRow): CloudFolderItem | null {
  if (typeof row.path !== 'string' || typeof row.name !== 'string') return null;
  const mime = typeof row.mime === 'string' ? row.mime : 'application/octet-stream';
  const kind = row.kind === 'photo' || row.kind === 'video' || row.kind === 'file' ? row.kind : mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'file';
  return {
    provider: 'advantage-cloud',
    source: 'gallery',
    lane: 'approved',
    folder,
    path: row.path,
    name: row.name,
    dateKey: typeof row.dateKey === 'string' ? row.dateKey : '',
    mime,
    size: typeof row.size === 'number' ? row.size : 0,
    kind,
  };
}

/**
 * Files in one Cloud folder.
 * Null: this device is not signed in to Cloud, or the license has no Cloud.
 * `{ error }`: Cloud answered with a failure the page should show.
 */
export async function listCloudFolder(input: {
  folder: CloudFolderId;
  token?: string;
  fetcher?: Fetcher;
}): Promise<CloudFolderListing | null | { error: string }> {
  const token = input.token ?? readCloudBearer();
  if (!token) return null;
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(cloudUrl(`/api/gym/cloud?op=list&purpose=folder&folder=${encodeURIComponent(input.folder)}`), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403 || response.status === 503) return null;
    if (!response.ok) return { error: CLOUD_FOLDER_READ_ERROR };
    const body = (await response.json()) as {
      items?: FolderRow[];
      canUpload?: unknown;
      canDelete?: unknown;
      uploadLane?: unknown;
    };
    const items: CloudFolderItem[] = [];
    for (const row of Array.isArray(body.items) ? body.items : []) {
      const item = itemOf(input.folder, row);
      if (item) items.push(item);
    }
    return {
      folder: input.folder,
      items,
      canUpload: body.canUpload === true,
      canDelete: body.canDelete === true,
      uploadLane: body.uploadLane === 'approved' || body.uploadLane === 'pending' ? body.uploadLane : null,
    };
  } catch {
    return { error: CLOUD_FOLDER_READ_ERROR };
  }
}

/**
 * What the TV slideshow plays: Gallery photos and videos, nothing else.
 * Pro Shop, Events, Schedule, daily videos, and PDFs never join it.
 */
export function gallerySlideshowItems(items: readonly CloudFolderItem[]): CloudFolderItem[] {
  return items.filter((item) => item.folder === 'gallery' && item.lane === 'approved' && (item.kind === 'photo' || item.kind === 'video'));
}

/**
 * Upload one file into a Cloud folder from this phone or any signed-in device.
 * The owner's upload is live. A seat's upload waits for the owner while approval
 * is on, and is live when it is off. Gallery uses `gallery`; the others `cloud-folder`.
 */
export async function uploadToCloudFolder(input: {
  folder: CloudFolderId;
  file: File;
  dateKey: string;
  token?: string;
  fetcher?: Fetcher;
  upload?: typeof uploadAdvantageCloudFile;
}): Promise<CloudUploadResult> {
  const token = input.token ?? readCloudBearer();
  if (!token) return { ok: false, message: CLOUD_SIGN_IN_MESSAGE };
  const upload = input.upload ?? uploadAdvantageCloudFile;
  const fileName = input.file.name.trim() || (input.folder === 'gallery' ? 'gallery-photo' : 'file');
  const mime = input.file.type || (/\.pdf$/i.test(fileName) ? 'application/pdf' : /\.(mp4|mov|m4v|webm)$/i.test(fileName) ? 'video/mp4' : 'image/jpeg');
  const result = await upload({
    purpose: input.folder === 'gallery' ? 'gallery' : 'cloud-folder',
    ...(input.folder === 'gallery' ? {} : { folder: input.folder }),
    dateKey: input.dateKey,
    file: input.file,
    fileName,
    mime,
    token,
    fetcher: input.fetcher,
    retry: { attempts: 3 },
  });
  if (result.ok) notifyCloudMedia();
  return result;
}
