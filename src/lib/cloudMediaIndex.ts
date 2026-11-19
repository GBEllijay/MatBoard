/**
 * Advantage Cloud media index: the details that ride with each file in the
 * networked Media Console folders (Gallery, Pro Shop, Events).
 *
 * One small JSON per license and folder at `groups/{license}/media-index/{folder}.json`.
 * The files themselves keep their existing flat keys (`gallery/{lane}/{date}/{file}`,
 * `pro-shop/{file}`, `events/{file}`), so nothing already uploaded moves.
 *
 * Shared by the server (merge + write) and the page (read + show). No DOM here.
 */

import { normalizeQrLinks } from './eventSlides.ts';
import { galleryCaption, gallerySchedule, galleryShowDate } from './gallerySchedule.ts';
import { buyLinkForQr, normalizeStartsSlide } from './shopSlides.ts';

export const CLOUD_INDEX_FOLDERS = ['gallery', 'pro-shop', 'events'] as const;
export type CloudIndexFolder = (typeof CLOUD_INDEX_FOLDERS)[number];

/** Names on Pro Shop cards often carry the price and a short description, so keep room for them. */
export const CLOUD_ITEM_LABEL_MAX = 500;
export const CLOUD_EVENT_TITLE_MAX = 120;
export const CLOUD_EVENTS_MAX = 100;
export const CLOUD_EVENT_ITEMS_MAX = 500;
export const CLOUD_INDEX_ITEMS_MAX = 3000;
export const CLOUD_INDEX_MIGRATED_MAX = 6000;
/** The stored JSON never grows past this. Larger patches are refused. */
export const CLOUD_INDEX_MAX_BYTES = 900_000;

export type CloudItemDetails = {
  label?: string;
  /** Pro Shop buy link (one QR per card). */
  buyUrl?: string;
  /** Pro Shop: false shares the previous card's TV page. */
  startsSlide?: boolean;
  /** Events QR links, up to 6. */
  qrLinks?: string[];
  /** Gallery caption and when it shows. */
  caption?: string;
  schedule?: 'always' | 'date' | 'next-class';
  showDate?: string;
  playEnabled?: boolean;
  sortOrder?: number;
};

export type CloudEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD or empty. */
  date: string;
  qrLinks: string[];
  /** File paths in this folder, in play order. */
  items: string[];
  order: number;
};

export type CloudMediaIndex = {
  version: 1;
  folder: CloudIndexFolder;
  items: Record<string, CloudItemDetails>;
  events: CloudEvent[];
  /**
   * One-time "send this device's items" bookkeeping: `dev:{deviceItemId}` and
   * `sha:{fingerprint}` point at the Cloud path the item became. Re-running skips them.
   */
  migrated: Record<string, string>;
  updatedAt: string;
};

export type CloudIndexPatch = {
  /** Per-file changes. `null` drops that file's details. Fields not sent are kept. */
  items?: Record<string, CloudItemDetails | null>;
  events?: { upsert?: Partial<CloudEvent>[]; remove?: string[] };
  migrated?: Record<string, string>;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MIGRATED_KEY = /^(dev|sha):[A-Za-z0-9._:-]{1,160}$/;
/** Paths stay inside the folder's own keys. The server re-checks the license prefix. */
const ITEM_PATH: Record<CloudIndexFolder, RegExp> = {
  gallery: /^gallery\/(approved|pending)\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/,
  'pro-shop': /^pro-shop\/(pending\/)?[A-Za-z0-9._-]{1,80}$/,
  events: /^events\/(pending\/)?[A-Za-z0-9._-]{1,80}$/,
};

export function isCloudIndexFolder(value: unknown): value is CloudIndexFolder {
  return typeof value === 'string' && (CLOUD_INDEX_FOLDERS as readonly string[]).includes(value);
}

export function cloudIndexItemPathOk(folder: CloudIndexFolder, path: unknown): path is string {
  return typeof path === 'string' && !path.includes('..') && ITEM_PATH[folder].test(path);
}

/** R2 key for one folder's index. Null for a bad license id or folder. */
export function cloudIndexKey(licenseId: string, folder: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(licenseId) || !isCloudIndexFolder(folder)) return null;
  return `groups/${licenseId}/media-index/${folder}.json`;
}

export function emptyCloudIndex(folder: CloudIndexFolder): CloudMediaIndex {
  return { version: 1, folder, items: {}, events: [], migrated: {}, updatedAt: '' };
}

function cleanLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return raw.trim().slice(0, CLOUD_ITEM_LABEL_MAX);
}

/** Keeps only the fields this folder uses, each in its device-store shape. */
export function normalizeItemDetails(folder: CloudIndexFolder, raw: unknown): CloudItemDetails {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: CloudItemDetails = {};
  const label = cleanLabel(row.label);
  if (label !== undefined) out.label = label;
  if (typeof row.playEnabled === 'boolean') out.playEnabled = row.playEnabled;
  if (typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)) out.sortOrder = Math.round(row.sortOrder);
  if (folder === 'pro-shop') {
    if (typeof row.buyUrl === 'string') out.buyUrl = buyLinkForQr(row.buyUrl);
    if (typeof row.startsSlide === 'boolean') out.startsSlide = normalizeStartsSlide(row.startsSlide);
  }
  if (folder === 'events' && Array.isArray(row.qrLinks)) out.qrLinks = normalizeQrLinks(row.qrLinks);
  if (folder === 'gallery') {
    if (typeof row.caption === 'string') out.caption = galleryCaption(row.caption);
    if (row.schedule !== undefined) out.schedule = gallerySchedule(row.schedule);
    if (typeof row.showDate === 'string') out.showDate = galleryShowDate(row.showDate);
  }
  return out;
}

export function normalizeCloudEvent(folder: CloudIndexFolder, raw: unknown, fallbackOrder = 0): CloudEvent | null {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!row || typeof row.id !== 'string' || !EVENT_ID.test(row.id)) return null;
  const items: string[] = [];
  for (const path of Array.isArray(row.items) ? row.items : []) {
    if (cloudIndexItemPathOk(folder, path) && !items.includes(path)) items.push(path);
    if (items.length >= CLOUD_EVENT_ITEMS_MAX) break;
  }
  return {
    id: row.id,
    title: typeof row.title === 'string' ? row.title.trim().slice(0, CLOUD_EVENT_TITLE_MAX) : '',
    date: typeof row.date === 'string' && DATE_KEY.test(row.date) ? row.date : '',
    qrLinks: normalizeQrLinks(row.qrLinks),
    items,
    order: typeof row.order === 'number' && Number.isFinite(row.order) ? Math.round(row.order) : fallbackOrder,
  };
}

/** Reads any stored JSON (or nothing) into a safe index for this folder. */
export function normalizeCloudIndex(folder: CloudIndexFolder, raw: unknown): CloudMediaIndex {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const index = emptyCloudIndex(folder);
  const items = row.items && typeof row.items === 'object' ? (row.items as Record<string, unknown>) : {};
  for (const [path, details] of Object.entries(items)) {
    if (!cloudIndexItemPathOk(folder, path)) continue;
    if (Object.keys(index.items).length >= CLOUD_INDEX_ITEMS_MAX) break;
    index.items[path] = normalizeItemDetails(folder, details);
  }
  if (folder === 'events' && Array.isArray(row.events)) {
    for (const [i, raw] of row.events.entries()) {
      const event = normalizeCloudEvent(folder, raw, i);
      if (event && !index.events.some((e) => e.id === event.id)) index.events.push(event);
      if (index.events.length >= CLOUD_EVENTS_MAX) break;
    }
    index.events.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  const migrated = row.migrated && typeof row.migrated === 'object' ? (row.migrated as Record<string, unknown>) : {};
  for (const [key, path] of Object.entries(migrated)) {
    if (!MIGRATED_KEY.test(key) || !cloudIndexItemPathOk(folder, path)) continue;
    if (Object.keys(index.migrated).length >= CLOUD_INDEX_MIGRATED_MAX) break;
    index.migrated[key] = path;
  }
  index.updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt.slice(0, 40) : '';
  return index;
}

export type CloudIndexPatchResult = { ok: true; index: CloudMediaIndex } | { ok: false; error: string };

/**
 * Merge one patch into the stored index. Field-level: a phone renaming one card
 * never wipes the price link another device just saved on a different card.
 */
export function applyCloudIndexPatch(
  current: CloudMediaIndex,
  rawPatch: unknown,
  now: Date,
): CloudIndexPatchResult {
  const folder = current.folder;
  const patch = rawPatch && typeof rawPatch === 'object' ? (rawPatch as Record<string, unknown>) : null;
  if (!patch) return { ok: false, error: 'Nothing to save.' };
  const next: CloudMediaIndex = {
    ...current,
    items: { ...current.items },
    events: current.events.map((event) => ({ ...event, items: [...event.items], qrLinks: [...event.qrLinks] })),
    migrated: { ...current.migrated },
  };
  const items = patch.items && typeof patch.items === 'object' ? (patch.items as Record<string, unknown>) : {};
  for (const [path, details] of Object.entries(items)) {
    if (!cloudIndexItemPathOk(folder, path)) return { ok: false, error: 'That file is not in this folder.' };
    if (details === null) {
      delete next.items[path];
      for (const event of next.events) event.items = event.items.filter((item) => item !== path);
      continue;
    }
    const merged = { ...(next.items[path] ?? {}), ...normalizeItemDetails(folder, details) };
    if (!next.items[path] && Object.keys(next.items).length >= CLOUD_INDEX_ITEMS_MAX) {
      return { ok: false, error: 'This folder has too many items to save more details.' };
    }
    next.items[path] = merged;
  }
  const events = patch.events && typeof patch.events === 'object' ? (patch.events as Record<string, unknown>) : null;
  if (events) {
    if (folder !== 'events') return { ok: false, error: 'Only Events can group files into events.' };
    const remove = Array.isArray(events.remove) ? events.remove.filter((id): id is string => typeof id === 'string') : [];
    next.events = next.events.filter((event) => !remove.includes(event.id));
    for (const [i, raw] of (Array.isArray(events.upsert) ? events.upsert : []).entries()) {
      const at = next.events.findIndex((event) => event.id === (raw as { id?: unknown })?.id);
      const base = at >= 0 ? next.events[at] : null;
      const merged = normalizeCloudEvent(folder, { ...(base ?? { order: next.events.length + i }), ...(raw as object) }, next.events.length + i);
      if (!merged) return { ok: false, error: 'That event could not be saved.' };
      if (at >= 0) next.events[at] = merged;
      else if (next.events.length >= CLOUD_EVENTS_MAX) return { ok: false, error: `Up to ${CLOUD_EVENTS_MAX} events.` };
      else next.events.push(merged);
    }
    next.events.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  const migrated = patch.migrated && typeof patch.migrated === 'object' ? (patch.migrated as Record<string, unknown>) : {};
  for (const [key, path] of Object.entries(migrated)) {
    if (!MIGRATED_KEY.test(key) || !cloudIndexItemPathOk(folder, path)) continue;
    if (!next.migrated[key] && Object.keys(next.migrated).length >= CLOUD_INDEX_MIGRATED_MAX) break;
    next.migrated[key] = path;
  }
  next.updatedAt = now.toISOString();
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > CLOUD_INDEX_MAX_BYTES) {
    return { ok: false, error: 'Those details are too large to save.' };
  }
  return { ok: true, index: next };
}

/** A fresh id for a new event. */
export function newCloudEventId(random: () => number = Math.random): string {
  return `ev-${Date.now().toString(36)}-${Math.floor(random() * 1e8).toString(36)}`;
}
