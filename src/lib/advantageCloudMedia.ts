/**
 * Advantage Cloud files for daily videos and lesson-plan media.
 * Bytes stay in the gym's R2 prefix and are read through a signed-in Function.
 * Google Drive, OneDrive, and this phone stay the default until a coach picks Cloud.
 */

import { lessonMediaPath, lessonWeekId, routeUpload, isCalendarDateKey, type GymActor } from './gymTree.ts';

/** Same storage key as src/lib/entitlement.ts. Kept here so the server handler does not import the browser entitlement module. */
const ENTITLEMENT_TOKEN_KEY = 'advantage.entitlement.token';

export const CLOUD_MEDIA_HOME_KEY = 'matboard.plusCloud.mediaHome.v1';
export const CLOUD_MEDIA_EVENT = 'matboard-advantage-cloud';

/** 8 GB, decimal, under R2's 10 GB free tier. Override with GYM_MEDIA_CAP_BYTES (bytes). */
export const DEFAULT_CLOUD_CAP_BYTES = 8_000_000_000;

/** One phone video. Override with GYM_MEDIA_MAX_UPLOAD_BYTES (bytes). */
export const DEFAULT_MAX_UPLOAD_BYTES = 512_000_000;

/**
 * R2 requires each part except the last to be at least 5 MiB.
 * 8 MiB stays above that and under the Worker request limit.
 */
export const CLOUD_CHUNK_BYTES = 8 * 1024 * 1024;

export const CLOUD_SIGN_IN_MESSAGE = 'Sign in on this device to use Advantage Cloud.';
export const CLOUD_ROLE_MESSAGE = 'Assistant coaches can play and download these files. A coach uploads them.';
export const CLOUD_SAVED_MESSAGE = 'Saved to Advantage Cloud. This phone keeps a copy.';
export const CLOUD_UNAVAILABLE_MESSAGE = 'Advantage Cloud is not on this license.';
export const CLOUD_HOME_UNBOUND = 'Advantage Cloud is not connected on this site.';
export const CLOUD_HOME_CONNECTED =
  'Advantage Cloud is connected. Sign in on this device to see how much space this license is using.';
export const CLOUD_ROLE_HOME =
  'The gym owner, a Coach, and Instructors can upload daily videos and lesson-plan media. An assistant coach can play and download them. A program director does not use this lane.';

export type CloudMediaPurpose = 'daily-video' | 'lesson' | 'lesson-media';
export type CloudMediaHome = 'device' | 'advantage-cloud';

export type CloudAccess = { read: boolean; upload: boolean };

let uploadReady = false;

export function setCloudUploadReady(ready: boolean): void {
  uploadReady = ready;
}

/** True only after this page has confirmed Plus Cloud and this person can upload. */
export function cloudUploadSelected(storage?: { getItem(key: string): string | null } | null): boolean {
  if (!uploadReady) return false;
  const store = storage === undefined ? browserStorage() : storage;
  return store?.getItem(CLOUD_MEDIA_HOME_KEY) === 'advantage-cloud';
}

export function readCloudMediaHome(storage: { getItem(key: string): string | null } | null | undefined): CloudMediaHome {
  return storage?.getItem(CLOUD_MEDIA_HOME_KEY) === 'advantage-cloud' ? 'advantage-cloud' : 'device';
}

export function writeCloudMediaHome(
  storage: { setItem(key: string, value: string): void } | null | undefined,
  home: CloudMediaHome,
): void {
  storage?.setItem(CLOUD_MEDIA_HOME_KEY, home);
  notifyCloudMedia();
}

export function notifyCloudMedia(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLOUD_MEDIA_EVENT));
}

function browserStorage(): { getItem(key: string): string | null } | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readCloudBearer(storage?: { getItem(key: string): string | null } | null): string {
  const store = storage === undefined ? browserStorage() : storage;
  return store?.getItem(ENTITLEMENT_TOKEN_KEY)?.trim() ?? '';
}

/**
 * Plus Cloud on a license token. Seats are not Plus Cloud by themselves.
 * This matches the product door without reading the owner-test flag on this phone.
 */
export function claimsOpenPlusCloud(claims: {
  src: string;
  tier: string;
  grants: readonly string[];
  subs?: { state?: string } | null;
} | null): boolean {
  if (!claims) return false;
  if (claims.src === 'seat' || claims.tier === 'seat') return false;
  if (claims.subs?.state === 'locked') return false;
  if (claims.src === 'owner' || claims.tier === 'owner') return true;
  return claims.src === 'code' && claims.grants.includes('pro');
}

/** A stored grant that means this license has Plus Cloud. Stripe Pro does not. */
export function grantRowOpensPlusCloud(row: { product: string; source: string }): boolean {
  return (row.source === 'code' || row.source === 'owner') && row.product === 'advantage-pro';
}

/**
 * Assistant coach can play and download. Coach and Instructors can upload.
 * The owner can upload. A program director does not use daily videos or lesson plans.
 */
export function cloudMediaAccess(input: {
  plusCloud: boolean;
  kind: 'owner' | 'seat';
  preset?: string | null;
}): CloudAccess {
  if (!input.plusCloud) return { read: false, upload: false };
  if (input.kind === 'owner') return { read: true, upload: true };
  const preset = input.preset ?? '';
  if (preset === 'program-director') return { read: false, upload: false };
  if (preset === 'coach' || preset === 'instructors') return { read: true, upload: true };
  if (preset === 'assistant-coach') return { read: true, upload: false };
  return { read: true, upload: false };
}

export function gymActorForCloud(kind: 'owner' | 'seat', preset: string | null): GymActor {
  if (kind === 'owner') return 'owner';
  if (preset === 'instructors') return 'instructor';
  if (preset === 'coach') return 'coach';
  if (preset === 'assistant-coach') return 'assistant';
  if (preset === 'program-director') return 'program-director';
  return 'assistant';
}

export function cloudCapBytes(raw: string | undefined | null): number {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return DEFAULT_CLOUD_CAP_BYTES;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_CLOUD_CAP_BYTES;
  return Math.floor(value);
}

export function cloudMaxUploadBytes(raw: string | undefined | null): number {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return DEFAULT_MAX_UPLOAD_BYTES;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.floor(value);
}

export function formatCloudBytes(bytes: number): string {
  const safe = Math.max(0, Math.floor(bytes));
  if (safe < 1000) return `${safe} B`;
  if (safe < 1_000_000) return `${trimNumber(safe / 1000)} KB`;
  if (safe < 1_000_000_000) return `${trimNumber(safe / 1_000_000)} MB`;
  return `${trimNumber(safe / 1_000_000_000)} GB`;
}

function trimNumber(value: number): string {
  const fixed = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function cloudUsageLine(licenseUsed: number, bucketUsed: number, cap: number): string {
  return `This license is using ${formatCloudBytes(licenseUsed)}. Advantage Cloud is using ${formatCloudBytes(bucketUsed)} of ${formatCloudBytes(cap)}.`;
}

export function cloudFullMessage(bucketUsed: number, cap: number): string {
  return `Advantage Cloud is full. This file was not saved. Advantage Cloud is using ${formatCloudBytes(bucketUsed)} of ${formatCloudBytes(cap)}. Remove older files, then try again.`;
}

export function cloudTooLargeMessage(maxBytes: number): string {
  return `That file is too large. Keep each phone video under ${formatCloudBytes(maxBytes)}.`;
}

export function cloudPartPlan(size: number, partSize = CLOUD_CHUNK_BYTES): {
  mode: 'single' | 'multipart';
  partSize: number;
  partCount: number;
} {
  if (size <= partSize) return { mode: 'single', partSize, partCount: 1 };
  return { mode: 'multipart', partSize, partCount: Math.ceil(size / partSize) };
}

const LICENSE_ID = /^[A-Za-z0-9_-]{4,80}$/;
const DAILY_KEY = /^videos\/daily\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;
const LESSON_JSON_KEY = /^lessons\/current\/\d{4}-W\d{2}\/\d{4}-\d{2}-\d{2}\.json$/;
const LESSON_MEDIA_KEY = /^lessons\/current\/\d{4}-W\d{2}\/media\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;
const SKIN_IMAGE_KEY = /^skins\/[a-z0-9]{8,40}$/;
const SKIN_META_KEY = /^skins\/[a-z0-9]{8,40}\.json$/;

/** Uploaded skins per license. The bytes still use the bucket cap below. */
export const CUSTOM_SKIN_CLOUD_CAP = 10;
/** Name file beside the picture. Kept tiny on purpose. */
export const CUSTOM_SKIN_META_MAX_BYTES = 4_000;

export function isCustomSkinImagePath(relativePath: string): boolean {
  return SKIN_IMAGE_KEY.test(relativePath);
}

export function isCustomSkinMetaPath(relativePath: string): boolean {
  return SKIN_META_KEY.test(relativePath);
}

export function customSkinIdFromPath(relativePath: string): string | null {
  const image = /^skins\/([a-z0-9]{8,40})$/.exec(relativePath);
  if (image?.[1]) return image[1];
  const meta = /^skins\/([a-z0-9]{8,40})\.json$/.exec(relativePath);
  return meta?.[1] ?? null;
}

export function cloudObjectKey(licenseId: string, relativePath: string): string | null {
  if (!LICENSE_ID.test(licenseId)) return null;
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..') || relativePath.includes('\\')) return null;
  if (
    !DAILY_KEY.test(relativePath) &&
    !LESSON_JSON_KEY.test(relativePath) &&
    !LESSON_MEDIA_KEY.test(relativePath) &&
    !SKIN_IMAGE_KEY.test(relativePath) &&
    !SKIN_META_KEY.test(relativePath)
  ) {
    return null;
  }
  return `groups/${licenseId}/${relativePath}`;
}

export function cloudRelativePath(input: {
  purpose: CloudMediaPurpose;
  role: GymActor;
  dateKey: string;
  fileName: string;
}): { ok: true; path: string } | { ok: false; error: string } {
  if (input.purpose === 'lesson-media') {
    if (input.role === 'student' || input.role === 'program-director' || input.role === 'none') {
      return { ok: false, error: CLOUD_ROLE_MESSAGE };
    }
    const path = lessonMediaPath(input.dateKey, input.fileName);
    if (!path) return { ok: false, error: 'Choose a real date.' };
    return { ok: true, path };
  }
  const route = routeUpload({
    purpose: input.purpose === 'lesson' ? 'lesson' : 'daily-video',
    role: input.role,
    kind: input.purpose === 'lesson' ? 'json' : 'video',
    dateKey: input.dateKey,
    fileName: input.fileName,
  });
  if (!route.ok) {
    if (route.reason === 'bad-date') return { ok: false, error: 'Choose a real date.' };
    return { ok: false, error: CLOUD_ROLE_MESSAGE };
  }
  return { ok: true, path: route.path };
}

export function cloudListPrefix(purpose: 'daily-video' | 'lesson', dateKey: string): { media: string; plan: string | null } | null {
  if (!isCalendarDateKey(dateKey)) return null;
  if (purpose === 'daily-video') return { media: `videos/daily/${dateKey}/`, plan: null };
  const week = lessonWeekId(dateKey);
  if (!week) return null;
  return {
    media: `lessons/current/${week}/media/${dateKey}/`,
    plan: `lessons/current/${week}/${dateKey}.json`,
  };
}

export function safeCloudMime(value: string, fallback: string): string {
  const mime = value.split(';')[0]?.trim().toLowerCase() ?? '';
  if (/^(video|image|application)\/[a-z0-9.+-]{1,40}$/.test(mime)) return mime;
  return fallback;
}

export type CloudFileRow = {
  name: string;
  path: string;
  size: number;
  mime: string;
};

export type CloudHomeView =
  | { phase: 'unbound' }
  | { phase: 'connected' }
  | {
      phase: 'ready';
      canUpload: boolean;
      licenseUsedBytes: number;
      bucketUsedBytes: number;
      capBytes: number;
    };

/** Probe the bucket, then read this license's space when the device is signed in. */
export async function loadAdvantageCloudHome(fetcher: CloudFetcher = fetch): Promise<CloudHomeView> {
  let bound = false;
  try {
    const probe = await fetcher('/api/gym/media?probe=1');
    if (probe.ok) {
      const body = (await probe.json()) as { bound?: unknown };
      bound = body.bound === true;
    }
  } catch {
    bound = false;
  }
  if (!bound) return { phase: 'unbound' };
  const token = readCloudBearer();
  if (!token) return { phase: 'connected' };
  try {
    const response = await fetcher('/api/gym/cloud?op=status', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { phase: 'connected' };
    const body = (await response.json()) as CloudStatusBody;
    if (!body.cloud) return { phase: 'connected' };
    return {
      phase: 'ready',
      canUpload: Boolean(body.canUpload),
      licenseUsedBytes: body.licenseUsedBytes ?? 0,
      bucketUsedBytes: body.bucketUsedBytes ?? 0,
      capBytes: body.capBytes ?? DEFAULT_CLOUD_CAP_BYTES,
    };
  } catch {
    return { phase: 'connected' };
  }
}

export type CloudStatusBody = {
  ok: true;
  cloud: boolean;
  canUpload?: boolean;
  licenseUsedBytes?: number;
  bucketUsedBytes?: number;
  capBytes?: number;
  maxUploadBytes?: number;
};

export type CloudUploadResult = { ok: true; path: string } | { ok: false; message: string };

type CloudFetcher = typeof fetch;

function cloudUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://advantagebjjtimer.com';
  return new URL(path, origin).toString();
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    /* The Function sometimes answers with plain text. */
  }
  return fallback;
}

export async function uploadAdvantageCloudFile(input: {
  purpose: CloudMediaPurpose;
  dateKey: string;
  file: Blob;
  fileName: string;
  mime: string;
  token?: string;
  fetcher?: CloudFetcher;
  onProgress?: (sent: number, total: number) => void;
}): Promise<CloudUploadResult> {
  const token = input.token ?? readCloudBearer();
  if (!token) return { ok: false, message: CLOUD_SIGN_IN_MESSAGE };
  const fetcher = input.fetcher ?? fetch;
  const headers = { authorization: `Bearer ${token}` };
  const start = await fetcher(cloudUrl('/api/gym/cloud'), {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'start',
      purpose: input.purpose,
      dateKey: input.dateKey,
      fileName: input.fileName,
      size: input.file.size,
      mime: input.mime,
    }),
  });
  if (!start.ok) return { ok: false, message: await readError(start, 'Advantage Cloud could not take that file.') };
  const opened = (await start.json()) as {
    mode?: string;
    key?: string;
    path?: string;
    uploadId?: string;
    partSize?: number;
  };
  if (!opened.key || !opened.path) return { ok: false, message: 'Advantage Cloud could not take that file.' };
  if (opened.mode === 'multipart') {
    const partSize = opened.partSize && opened.partSize > 0 ? opened.partSize : CLOUD_CHUNK_BYTES;
    const parts: { partNumber: number; etag: string }[] = [];
    let partNumber = 1;
    for (let offset = 0; offset < input.file.size; offset += partSize) {
      const chunk = input.file.slice(offset, Math.min(input.file.size, offset + partSize));
      const put = await fetcher(
        cloudUrl(
          `/api/gym/cloud?op=part&key=${encodeURIComponent(opened.key)}&uploadId=${encodeURIComponent(opened.uploadId ?? '')}&partNumber=${partNumber}`,
        ),
        { method: 'PUT', headers, body: chunk },
      );
      if (!put.ok) return { ok: false, message: await readError(put, 'Advantage Cloud stopped during that upload.') };
      const part = (await put.json()) as { etag?: string };
      if (!part.etag) return { ok: false, message: 'Advantage Cloud stopped during that upload.' };
      parts.push({ partNumber, etag: part.etag });
      partNumber += 1;
      input.onProgress?.(Math.min(input.file.size, offset + chunk.size), input.file.size);
    }
    const done = await fetcher(cloudUrl('/api/gym/cloud'), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        key: opened.key,
        uploadId: opened.uploadId,
        parts,
        size: input.file.size,
      }),
    });
    if (!done.ok) return { ok: false, message: await readError(done, 'Advantage Cloud could not finish that file.') };
    return { ok: true, path: opened.path };
  }
  const put = await fetcher(cloudUrl(`/api/gym/cloud?op=put&key=${encodeURIComponent(opened.key)}`), {
    method: 'PUT',
    headers: { ...headers, 'content-type': input.mime || 'application/octet-stream' },
    body: input.file,
  });
  if (!put.ok) return { ok: false, message: await readError(put, 'Advantage Cloud could not take that file.') };
  input.onProgress?.(input.file.size, input.file.size);
  return { ok: true, path: opened.path };
}

let lessonTimer: ReturnType<typeof setTimeout> | null = null;
let lessonPending: { dateKey: string; json: string } | null = null;

/** Debounced lesson-plan text. No-ops unless this page confirmed Cloud uploads. */
export function scheduleCloudLessonSave(input: { dateKey: string; json: string; token?: string }): void {
  if (!cloudUploadSelected()) return;
  lessonPending = { dateKey: input.dateKey, json: input.json };
  if (lessonTimer) clearTimeout(lessonTimer);
  const token = input.token;
  lessonTimer = setTimeout(() => {
    lessonTimer = null;
    const pending = lessonPending;
    lessonPending = null;
    if (!pending || !cloudUploadSelected()) return;
    void uploadAdvantageCloudFile({
      purpose: 'lesson',
      dateKey: pending.dateKey,
      file: new Blob([pending.json], { type: 'application/json' }),
      fileName: `${pending.dateKey}.json`,
      mime: 'application/json',
      token,
    }).then((result) => {
      if (result.ok) notifyCloudMedia();
    });
  }, 500);
}
