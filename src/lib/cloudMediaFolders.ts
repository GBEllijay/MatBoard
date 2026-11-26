/**
 * Networked Media Console folders.
 *
 * With Advantage Cloud on and this device signed in, the top Gallery, Pro Shop,
 * and Events folders show the gym's Advantage Cloud folders, so every phone,
 * computer, and TV sees the same items and details. Without Cloud (or signed
 * out) they stay on this device, exactly as before, and say so.
 *
 * Also: the one-time "send this device's items to Advantage Cloud" step, which
 * copies device items with their names, buy links, and QR links. It never
 * deletes anything on the device, and running it twice sends nothing twice.
 */

import {
  CLOUD_SIGN_IN_MESSAGE,
  cloudUrl,
  readCloudBearer,
  uploadAdvantageCloudFile,
  type CloudUploadResult,
} from './advantageCloudMedia.ts';
import type { CloudFolderId, CloudFolderItem, CloudFolderListing } from './advantageCloudFolders.ts';
import {
  normalizeCloudIndex,
  type CloudEvent,
  type CloudIndexFolder,
  type CloudIndexPatch,
  type CloudItemDetails,
  type CloudMediaIndex,
} from './cloudMediaIndex.ts';
import type { FolderId, StoredPhoto } from './photoStore.ts';

type Fetcher = typeof fetch;

/** The networked top folders. Class Schedule is the schedule board, not a media folder. */
export const NETWORKED_FOLDERS: readonly FolderId[] = ['gallery', 'shop', 'events'];

const CLOUD_OF: Record<FolderId, CloudIndexFolder> = { gallery: 'gallery', shop: 'pro-shop', events: 'events' };

export function cloudFolderOfDevice(folderId: FolderId): CloudIndexFolder {
  return CLOUD_OF[folderId];
}

export function deviceFolderOfCloud(folder: CloudFolderId): FolderId | null {
  if (folder === 'gallery') return 'gallery';
  if (folder === 'pro-shop') return 'shop';
  if (folder === 'events') return 'events';
  return null;
}

export type MediaBacking = 'cloud' | 'device';

/**
 * Which store the top folders show. Cloud only when the license has Cloud,
 * this device holds a Cloud sign-in, and the folders answered. Anything else
 * keeps this device's folders, so a signed-out phone still works offline.
 */
export function chooseMediaBacking(input: { cloudEntitled: boolean; signedIn: boolean; cloudAnswered: boolean }): MediaBacking {
  return input.cloudEntitled && input.signedIn && input.cloudAnswered ? 'cloud' : 'device';
}

export const DEVICE_ONLY_NOTE = 'Saved on this device only. Other phones, computers, and TVs do not see these.';
export const DEVICE_ONLY_SIGN_IN_NOTE =
  'Saved on this device only. Sign in on this device to share Gallery, Pro Shop, and Events with every device through Advantage Cloud.';
export const CLOUD_BACKED_NOTE = 'Advantage Cloud: every signed-in phone, computer, and TV sees this folder.';
export const CLOUD_VIDEO_DEVICE_ONLY = 'Videos stay on this device. They are never sent to Advantage Cloud from here.';

/** What the folder says about where it saves. */
export function folderBackingNote(input: { backing: MediaBacking; cloudEntitled: boolean }): string {
  if (input.backing === 'cloud') return CLOUD_BACKED_NOTE;
  return input.cloudEntitled ? DEVICE_ONLY_SIGN_IN_NOTE : DEVICE_ONLY_NOTE;
}

const CLOUD_ROW_PREFIX = 'cloud:';

export function cloudRowId(path: string): string {
  return `${CLOUD_ROW_PREFIX}${path}`;
}

export function isCloudRow(row: { id: string; cloudPath?: string }): boolean {
  return Boolean(row.cloudPath) || row.id.startsWith(CLOUD_ROW_PREFIX);
}

export function cloudPathOfRowId(id: string): string | null {
  return id.startsWith(CLOUD_ROW_PREFIX) ? id.slice(CLOUD_ROW_PREFIX.length) : null;
}

/** `Rash-guard-black.jpg` → `Rash guard black`. */
export function labelFromFileName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[-_]+/g, ' ').trim();
  return base || 'Photo';
}

let emptyBlob: Blob | null = null;
function placeholderBlob(): Blob {
  emptyBlob ??= new Blob([]);
  return emptyBlob;
}

export type CloudFolderSnapshot = {
  folderId: FolderId;
  listing: CloudFolderListing;
  index: CloudMediaIndex;
  canEdit: boolean;
};

function playableInFolder(folderId: FolderId, item: CloudFolderItem): boolean {
  if (item.kind === 'photo') return true;
  // Gallery videos already in Cloud keep playing. Pro Shop and Events are photo cards.
  return folderId === 'gallery' && item.kind === 'video';
}

/** The event a path is grouped under (first match). */
export function eventOfPath(events: readonly CloudEvent[], path: string): CloudEvent | null {
  return events.find((event) => event.items.includes(path)) ?? null;
}

/**
 * Cloud files shaped as Media Console rows, with their saved details.
 * Events: photos grouped into an event play together in the event's order,
 * named with the event title and showing the event's QR links unless the photo
 * has its own. Ungrouped photos follow.
 */
export function cloudRowsForFolder(snapshot: CloudFolderSnapshot): StoredPhoto[] {
  const { folderId, listing, index } = snapshot;
  const rows: StoredPhoto[] = [];
  const listed = listing.items.filter((item) => playableInFolder(folderId, item));
  const BASE_ORDER = 1_000_000;
  for (const [position, item] of listed.entries()) {
    const details: CloudItemDetails = index.items[item.path] ?? {};
    rows.push({
      id: cloudRowId(item.path),
      cloudPath: item.path,
      mime: item.mime,
      blob: placeholderBlob(),
      addedAt: 0,
      label: details.label?.trim() ? details.label : labelFromFileName(item.name),
      folderId,
      sortOrder: typeof details.sortOrder === 'number' ? details.sortOrder : BASE_ORDER + position,
      playEnabled: details.playEnabled !== false,
      buyUrl: folderId === 'shop' ? details.buyUrl ?? '' : '',
      startsSlide: folderId === 'shop' ? details.startsSlide !== false : true,
      qrLinks: folderId === 'events' ? details.qrLinks ?? [] : [],
      driveFileId: null,
      caption: folderId === 'gallery' ? details.caption ?? '' : '',
      schedule: folderId === 'gallery' ? details.schedule ?? 'always' : 'always',
      showDate: folderId === 'gallery' ? details.showDate ?? '' : '',
      techniqueClipId: '',
      loopSec: 0,
    });
  }
  if (folderId !== 'events' || !index.events.length) return rows;
  return groupEventRows(rows, index.events);
}

/** Events first (in event order, photos in the event's order), then ungrouped photos in list order. */
export function groupEventRows(rows: StoredPhoto[], events: readonly CloudEvent[]): StoredPhoto[] {
  const byPath = new Map(rows.map((row) => [row.cloudPath ?? '', row]));
  const used = new Set<string>();
  const out: StoredPhoto[] = [];
  let order = 0;
  for (const event of [...events].sort((a, b) => a.order - b.order)) {
    for (const path of event.items) {
      const row = byPath.get(path);
      if (!row || used.has(path)) continue;
      used.add(path);
      out.push({
        ...row,
        cloudEventId: event.id,
        label: event.title.trim() || row.label,
        qrLinks: row.qrLinks.length ? row.qrLinks : [...event.qrLinks],
        sortOrder: order,
      });
      order += 1;
    }
  }
  const rest = rows.filter((row) => !used.has(row.cloudPath ?? '')).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const row of rest) {
    out.push({ ...row, sortOrder: order });
    order += 1;
  }
  return out;
}

/** The rows the console shows: Cloud rows for the networked folders plus this device's videos and technique links. */
export function mergeBackedRows(input: {
  backing: MediaBacking;
  deviceRows: readonly StoredPhoto[];
  cloudRows: readonly StoredPhoto[];
}): StoredPhoto[] {
  if (input.backing === 'device') return [...input.deviceRows];
  const deviceOnly = input.deviceRows.filter((row) => row.folderId === 'gallery' && (row.mime.startsWith('video/') || row.techniqueClipId));
  return [...input.cloudRows, ...deviceOnly];
}

/** Details a device row carries into Cloud. Gallery: caption and schedule; Pro Shop: buy link; Events: QR links. */
export function detailsOfDeviceRow(row: StoredPhoto): CloudItemDetails {
  const base: CloudItemDetails = { label: row.label, playEnabled: row.playEnabled !== false, sortOrder: row.sortOrder };
  if (row.folderId === 'shop') return { ...base, buyUrl: row.buyUrl, startsSlide: row.startsSlide };
  if (row.folderId === 'events') return { ...base, qrLinks: [...row.qrLinks] };
  return { ...base, caption: row.caption, schedule: row.schedule, showDate: row.showDate };
}

/** Patch for one row's edit (name, links, play, gallery details). */
export function detailsPatchOf(fields: Partial<StoredPhoto>): CloudItemDetails {
  const out: CloudItemDetails = {};
  if (fields.label !== undefined) out.label = fields.label;
  if (fields.buyUrl !== undefined) out.buyUrl = fields.buyUrl;
  if (fields.startsSlide !== undefined) out.startsSlide = fields.startsSlide;
  if (fields.qrLinks !== undefined) out.qrLinks = [...fields.qrLinks];
  if (fields.caption !== undefined) out.caption = fields.caption;
  if (fields.schedule !== undefined) out.schedule = fields.schedule;
  if (fields.showDate !== undefined) out.showDate = fields.showDate;
  if (fields.playEnabled !== undefined) out.playEnabled = fields.playEnabled;
  if (fields.sortOrder !== undefined) out.sortOrder = fields.sortOrder;
  return out;
}

/** Folder order after a drag: every listed Cloud row gets its new position. */
export function reorderPatch(orderedIds: readonly string[]): CloudIndexPatch {
  const items: Record<string, CloudItemDetails> = {};
  for (const [i, id] of orderedIds.entries()) {
    const path = cloudPathOfRowId(id);
    if (path) items[path] = { sortOrder: i };
  }
  return { items };
}

/**
 * Put files into one event (a file sits in one event at a time).
 * `event` may be new (no stored copy yet) or an existing one.
 */
export function addToEventPatch(events: readonly CloudEvent[], event: CloudEvent, paths: readonly string[]): CloudIndexPatch {
  const wanted = paths.filter((path, i) => paths.indexOf(path) === i);
  const upsert: Partial<CloudEvent>[] = [];
  for (const other of events) {
    if (other.id === event.id) continue;
    const kept = other.items.filter((path) => !wanted.includes(path));
    if (kept.length !== other.items.length) upsert.push({ id: other.id, items: kept });
  }
  const current = events.find((row) => row.id === event.id);
  const items = [...(current?.items ?? event.items)];
  for (const path of wanted) if (!items.includes(path)) items.push(path);
  upsert.push({ ...event, items });
  return { events: { upsert } };
}

export function removeFromEventPatch(event: CloudEvent, paths: readonly string[]): CloudIndexPatch {
  return { events: { upsert: [{ id: event.id, items: event.items.filter((path) => !paths.includes(path)) }] } };
}

// --- Network ---------------------------------------------------------------

export const CLOUD_INDEX_READ_ERROR = 'Could not read the Advantage Cloud folder details. Nothing on this device was changed.';
export const CLOUD_INDEX_SAVE_ERROR = 'That change did not save to Advantage Cloud. Try again.';

export type CloudIndexRead = { index: CloudMediaIndex; canEdit: boolean };

export async function readCloudMediaIndex(input: {
  folder: CloudIndexFolder;
  token?: string;
  fetcher?: Fetcher;
}): Promise<CloudIndexRead | null | { error: string }> {
  const token = input.token ?? readCloudBearer();
  if (!token) return null;
  try {
    const response = await (input.fetcher ?? fetch)(cloudUrl(`/api/gym/cloud?op=media-index&folder=${encodeURIComponent(input.folder)}`), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403 || response.status === 503) return null;
    if (!response.ok) return { error: CLOUD_INDEX_READ_ERROR };
    const body = (await response.json()) as { index?: unknown; canEdit?: unknown };
    return { index: normalizeCloudIndex(input.folder, body.index), canEdit: body.canEdit === true };
  } catch {
    return { error: CLOUD_INDEX_READ_ERROR };
  }
}

export type CloudIndexSave = { ok: true; index: CloudMediaIndex } | { ok: false; message: string };

export async function patchCloudMediaIndex(input: {
  folder: CloudIndexFolder;
  patch: CloudIndexPatch;
  token?: string;
  fetcher?: Fetcher;
}): Promise<CloudIndexSave> {
  const token = input.token ?? readCloudBearer();
  if (!token) return { ok: false, message: CLOUD_SIGN_IN_MESSAGE };
  try {
    const response = await (input.fetcher ?? fetch)(cloudUrl('/api/gym/cloud'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'media-index', folder: input.folder, patch: input.patch }),
    });
    const body = (await response.json().catch(() => ({}))) as { index?: unknown; error?: unknown };
    if (!response.ok) return { ok: false, message: typeof body.error === 'string' && body.error ? body.error : CLOUD_INDEX_SAVE_ERROR };
    return { ok: true, index: normalizeCloudIndex(input.folder, body.index) };
  } catch {
    return { ok: false, message: CLOUD_INDEX_SAVE_ERROR };
  }
}

// --- Uploads from the top folders ------------------------------------------

function extensionOf(mime: string, name: string): string {
  const fromName = /\.([A-Za-z0-9]{2,5})$/.exec(name)?.[1]?.toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime.startsWith('image/')) return 'jpg';
  return fromName ?? 'bin';
}

function slug(text: string, max: number): string {
  return text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/**
 * A new file name in a Cloud folder that will not replace another device's file
 * with the same camera name (IMG_0001.jpg on two phones).
 */
export function uniqueCloudFileName(name: string, mime: string, random: () => number = Math.random): string {
  const base = slug(name.replace(/\.[A-Za-z0-9]{1,5}$/, ''), 48) || 'photo';
  const tag = Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0');
  return `${base}-${tag}.${extensionOf(mime, name)}`;
}

/** Stable Cloud name for one device item, so a re-run lands on the same path. */
export function migrationFileName(row: Pick<StoredPhoto, 'id' | 'label' | 'mime'>): string {
  const base = slug(row.label, 48) || 'item';
  const tag = slug(row.id, 12).toLowerCase() || 'device';
  return `${base}-${tag}.${extensionOf(row.mime, '')}`;
}

/** The path a migrated item lands on in an approved folder (the owner's lane). */
export function migrationTargetPath(folder: CloudIndexFolder, row: Pick<StoredPhoto, 'id' | 'label' | 'mime'>, dateKey: string): string {
  const name = migrationFileName(row);
  return folder === 'gallery' ? `gallery/approved/${dateKey}/${name}` : `${folder}/${name}`;
}

// --- One-time send from this device ----------------------------------------

export type MigrationPlan = {
  /** Device items to upload, then record. */
  send: StoredPhoto[];
  /** Already uploaded under the stable name but not recorded (a run that stopped early): record only. */
  relink: { row: StoredPhoto; path: string }[];
  /** Already in Cloud from an earlier run. */
  skip: { row: StoredPhoto; path: string }[];
  /** Videos, technique clip links, and empty rows. These never leave the device. */
  deviceOnly: StoredPhoto[];
};

export function migrationEligible(row: StoredPhoto): boolean {
  return row.mime.startsWith('image/') && !row.techniqueClipId && !row.cloudPath && row.blob.size > 0;
}

/**
 * What a "send this device's items" run would do. Pure: the same inputs give
 * the same plan, and a plan after a finished run sends nothing.
 */
export function planDeviceMigration(input: {
  rows: readonly StoredPhoto[];
  folderId: FolderId;
  index: CloudMediaIndex;
  listedPaths: ReadonlySet<string>;
  fingerprints?: ReadonlyMap<string, string>;
  dateKey: string;
}): MigrationPlan {
  const plan: MigrationPlan = { send: [], relink: [], skip: [], deviceOnly: [] };
  const folder = cloudFolderOfDevice(input.folderId);
  for (const row of input.rows) {
    if (row.folderId !== input.folderId) continue;
    if (!migrationEligible(row)) {
      if (!row.cloudPath) plan.deviceOnly.push(row);
      continue;
    }
    const byDevice = input.index.migrated[`dev:${row.id}`];
    const print = input.fingerprints?.get(row.id);
    const byPrint = print ? input.index.migrated[`sha:${print}`] : undefined;
    const known = [byDevice, byPrint].find((path) => path && input.listedPaths.has(path));
    if (known) {
      plan.skip.push({ row, path: known });
      continue;
    }
    const already = [...input.listedPaths].find((path) => path.endsWith(`/${migrationFileName(row)}`) && path.startsWith(folder === 'gallery' ? 'gallery/approved/' : `${folder}/`));
    if (already) {
      plan.relink.push({ row, path: already });
      continue;
    }
    plan.send.push(row);
  }
  return plan;
}

export type MigrationProgress = { done: number; total: number; label: string };

export type MigrationSummary = {
  sent: number;
  relinked: number;
  skipped: number;
  waiting: number;
  failed: { label: string; message: string }[];
  deviceOnly: number;
};

export type MigrationUpload = (input: {
  folder: CloudIndexFolder;
  file: File;
  dateKey: string;
  fingerprint?: string;
}) => Promise<CloudUploadResult>;

export const defaultMigrationUpload: MigrationUpload = async ({ folder, file, dateKey, fingerprint }) =>
  uploadAdvantageCloudFile({
    purpose: folder === 'gallery' ? 'gallery' : 'cloud-folder',
    ...(folder === 'gallery' ? {} : { folder }),
    dateKey,
    file,
    fileName: file.name,
    mime: file.type || 'image/jpeg',
    ...(fingerprint ? { fingerprint } : {}),
    retry: { attempts: 3 },
  });

/**
 * Send planned device items to Cloud with every detail. One item at a time:
 * upload the bytes, then save its name and links and mark it sent. A failure
 * on one item is reported and the rest still go. Device items are never deleted.
 */
export async function runDeviceMigration(input: {
  plan: MigrationPlan;
  folderId: FolderId;
  dateKey: string;
  upload?: MigrationUpload;
  patch: (patch: CloudIndexPatch) => Promise<CloudIndexSave>;
  fingerprints?: ReadonlyMap<string, string>;
  onProgress?: (progress: MigrationProgress) => void;
  signal?: { aborted: boolean };
}): Promise<MigrationSummary> {
  const folder = cloudFolderOfDevice(input.folderId);
  const upload = input.upload ?? defaultMigrationUpload;
  const summary: MigrationSummary = {
    sent: 0,
    relinked: 0,
    skipped: input.plan.skip.length,
    waiting: 0,
    failed: [],
    deviceOnly: input.plan.deviceOnly.length,
  };
  const total = input.plan.send.length + input.plan.relink.length;
  let done = 0;
  const record = async (row: StoredPhoto, path: string): Promise<boolean> => {
    const print = input.fingerprints?.get(row.id);
    const saved = await input.patch({
      items: { [path]: detailsOfDeviceRow(row) },
      migrated: { [`dev:${row.id}`]: path, ...(print ? { [`sha:${print}`]: path } : {}) },
    });
    if (!saved.ok) summary.failed.push({ label: row.label, message: saved.message });
    return saved.ok;
  };
  for (const { row, path } of input.plan.relink) {
    if (input.signal?.aborted) break;
    input.onProgress?.({ done, total, label: row.label });
    if (await record(row, path)) summary.relinked += 1;
    done += 1;
  }
  for (const row of input.plan.send) {
    if (input.signal?.aborted) break;
    input.onProgress?.({ done, total, label: row.label });
    const file = new File([row.blob], migrationFileName(row), { type: row.mime || 'image/jpeg' });
    const result = await upload({ folder, file, dateKey: input.dateKey, fingerprint: input.fingerprints?.get(row.id) });
    if (!result.ok) {
      summary.failed.push({ label: row.label, message: result.message });
    } else if (result.lane === 'pending') {
      // A seat with approval on: the file waits for the owner, details cannot be saved yet.
      summary.waiting += 1;
    } else if (await record(row, result.path)) {
      // Cloud already had this photo (maybe under another name): link the device item to it, nothing was added.
      if (result.duplicate) summary.relinked += 1;
      else summary.sent += 1;
    }
    done += 1;
  }
  input.onProgress?.({ done, total, label: '' });
  return summary;
}

export function migrationSummaryLine(summary: MigrationSummary, folderLabel: string): string {
  const parts: string[] = [];
  if (summary.sent) parts.push(`Sent ${summary.sent} to Advantage Cloud ${folderLabel}`);
  if (summary.relinked) parts.push(`reconnected ${summary.relinked} already uploaded`);
  if (summary.skipped) parts.push(`skipped ${summary.skipped} already in Cloud`);
  if (summary.waiting) parts.push(`${summary.waiting} waiting for the owner's approval`);
  if (summary.failed.length) parts.push(`${summary.failed.length} did not send (${summary.failed[0].message})`);
  if (summary.deviceOnly) parts.push(`${summary.deviceOnly} videos or technique links stayed on this device`);
  const line = parts.length ? `${parts.join(', ')}.` : `Nothing new to send from ${folderLabel}.`;
  return `${line.charAt(0).toUpperCase()}${line.slice(1)} This device kept every copy.`;
}
