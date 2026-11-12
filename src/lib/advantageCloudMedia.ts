/**
 * Advantage Cloud files for daily videos and lesson-plan media.
 * Bytes stay in the gym's R2 prefix and are read through a signed-in Function.
 * Google Drive, OneDrive, and this phone stay the default until a coach picks Cloud.
 */

import { canDecideApproval, uploadLaneFor, type ApprovalLane } from './approvalLanes.ts';
import { cloudPathScope } from './cloudDataOwnership.ts';
import { fetchWithRetry, isCanceled, retryableStatus, type RetryOptions } from './cloudUploadRetry.ts';
import { lessonMediaPath, lessonWeekId, routeUpload, isCalendarDateKey, safePathSegment, type GymActor } from './gymTree.ts';
import { INSTRUCTOR_LESSON_KEY, type LessonPlanSource, type LessonPlanTarget } from './lessonPlanCopies.ts';

/** Same storage key as src/lib/entitlement.ts. Kept here so the server handler does not import the browser entitlement module. */
const ENTITLEMENT_TOKEN_KEY = 'advantage.entitlement.token';

export const CLOUD_MEDIA_HOME_KEY = 'matboard.plusCloud.mediaHome.v1';
export const CLOUD_MEDIA_EVENT = 'matboard-advantage-cloud';

/**
 * Per-gym (per-license) Cloud limits, decimal bytes. Every key for a license
 * lives under groups/{licenseId}/, so each gym is measured on its own.
 * Over the soft limit, uploads still save but the owner is asked to delete
 * old videos. At the hard limit an upload is refused.
 */
export const CLOUD_LICENSE_SOFT_LIMIT_BYTES = 50_000_000_000;
export const CLOUD_LICENSE_HARD_LIMIT_BYTES = 100_000_000_000;

/** Hard limit per license. Override with GYM_MEDIA_LICENSE_CAP_BYTES (bytes). */
export const DEFAULT_CLOUD_CAP_BYTES = CLOUD_LICENSE_HARD_LIMIT_BYTES;

/** Where the owner deletes old Cloud videos. Null until that screen ships on main. */
export const CLOUD_CLEANUP_ROUTE: string | null = null;

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
export const CLOUD_SENT_FOR_APPROVAL =
  'Sent to Advantage Cloud for approval. It shows after the owner or an Instructors seat approves it in Review Inbox.';
export const CLOUD_DAILY_DROP_ONLY =
  "A program director can send videos to today's daily videos. Lesson plans and other Cloud files stay with the coaches.";
export const CLOUD_UNAVAILABLE_MESSAGE = 'Advantage Cloud is not on this license.';
export const CLOUD_HOME_UNBOUND = 'Advantage Cloud is not connected on this site.';
export const CLOUD_HOME_ERROR = 'Could not read Cloud usage. Nothing on this device was changed.';
export const CLOUD_HOME_CONNECTED =
  'Advantage Cloud is connected. Sign in on this device to see how much space this license is using.';
export const CLOUD_ROLE_HOME =
  'The gym owner, a Coach, and Instructors can upload daily videos and lesson-plan media. An assistant coach can play and download them. A program director can send videos to today\'s daily videos, without opening lesson plans.';

export type CloudMediaPurpose =
  | 'daily-video'
  | 'lesson'
  | 'lesson-media'
  | 'replay-pending'
  | 'gallery'
  | 'instructor-video'
  | 'instructor-photo'
  | 'from-instructor';
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
 * Plus Cloud on a signed pass when this request has no entitlement database.
 * Seats are not Plus Cloud by themselves. A purchased add-on is `subs.cloud`
 * on the owner pass. Owner and alpha-pro codes stay open without that flag.
 * This does not read the owner-test flag on this phone.
 */
export function claimsOpenPlusCloud(claims: {
  src: string;
  tier: string;
  grants: readonly string[];
  subs?: { state?: string; cloud?: boolean } | null;
} | null): boolean {
  if (!claims) return false;
  if (claims.src === 'seat' || claims.tier === 'seat') return false;
  if (claims.subs?.state === 'locked') return false;
  if (claims.src === 'owner' || claims.tier === 'owner') return true;
  if (claims.subs?.cloud === true) return true;
  return claims.src === 'code' && claims.grants.includes('pro');
}

/**
 * A stored one-time grant that means this license has Plus Cloud.
 * Stripe Pro does not. The paid add-on is `advantage-cloud-*` and is read
 * with the subscription row, not this exemption.
 */
export function grantRowOpensPlusCloud(row: { product: string; source: string }): boolean {
  return (row.source === 'code' || row.source === 'owner') && row.product === 'advantage-pro';
}

/**
 * Cloud recorded for an owner unlock. Same product names as the paid add-on.
 * There is no Stripe subscription on this row.
 */
export function ownerCloudGrantOpen(row: { product: string; source: string }): boolean {
  return row.source === 'owner' && (row.product === 'advantage-cloud-pro' || row.product === 'advantage-cloud-media' || row.product === 'advantage-cloud-coach');
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

/**
 * Program director's one Cloud lane: put a video in `videos/daily/{date}/`
 * for instructors to download. No list, play, lesson plan, lesson media,
 * skins, or replay. A revoked seat is refused before this is asked.
 */
export function cloudDailyVideoDrop(input: {
  plusCloud: boolean;
  kind: 'owner' | 'seat';
  preset?: string | null;
}): boolean {
  return input.plusCloud && input.kind === 'seat' && input.preset === 'program-director';
}

/** A daily-video object path (`videos/daily/{date}/{file}`). Nothing else. */
export function isDailyVideoCloudPath(relativePath: string): boolean {
  return DAILY_KEY.test(relativePath);
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

/** Soft limit when the cap was lowered below it (tests, a small trial). */
export function cloudSoftLimitBytes(cap: number): number {
  return Math.min(CLOUD_LICENSE_SOFT_LIMIT_BYTES, Math.floor(cap / 2));
}

export function cloudOverSoftLimit(licenseUsed: number, cap: number): boolean {
  return licenseUsed >= cloudSoftLimitBytes(cap);
}

export function cloudSoftLimitWarning(licenseUsed: number, cap: number): string {
  return `This gym is using ${formatCloudBytes(licenseUsed)} of ${formatCloudBytes(cap)} in Advantage Cloud. Past ${formatCloudBytes(cloudSoftLimitBytes(cap))}, please delete old videos you no longer need. At ${formatCloudBytes(cap)} new uploads stop.`;
}

export function cloudUsageLine(licenseUsed: number, cap: number): string {
  const line = `This gym is using ${formatCloudBytes(licenseUsed)} of ${formatCloudBytes(cap)} in Advantage Cloud.`;
  return cloudOverSoftLimit(licenseUsed, cap) ? `${line} Please delete old videos you no longer need.` : line;
}

export function cloudFullMessage(licenseUsed: number, cap: number): string {
  return `Advantage Cloud is full for this gym. This file was not saved. This gym is using ${formatCloudBytes(licenseUsed)} of ${formatCloudBytes(cap)}. Delete old videos, then try again.`;
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
const PENDING_REPLAY_KEY = /^pending\/replays\/[A-Za-z0-9_-]{1,80}\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;
const PENDING_STATUS_KEY = /^pending\/status\/[A-Za-z0-9_-]{1,80}\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}\.json$/;
const LESSON_MEDIA_KEY = /^lessons\/current\/\d{4}-W\d{2}\/media\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;
const SKIN_IMAGE_KEY = /^skins\/[a-z0-9]{8,40}$/;
const SKIN_META_KEY = /^skins\/[a-z0-9]{8,40}\.json$/;
const GALLERY_KEY = /^gallery\/(pending|approved|rejected)\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;
const INSTRUCTOR_FOLDER_KEY = /^instructors\/[A-Za-z0-9_-]{1,80}\/(videos|photos)\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;
const FROM_INSTRUCTOR_KEY = /^students\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}\/from-instructor\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]{1,80}$/;

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
    !INSTRUCTOR_LESSON_KEY.test(relativePath) &&
    !LESSON_MEDIA_KEY.test(relativePath) &&
    !SKIN_IMAGE_KEY.test(relativePath) &&
    !SKIN_META_KEY.test(relativePath) &&
    !PENDING_REPLAY_KEY.test(relativePath) &&
    !PENDING_STATUS_KEY.test(relativePath) &&
    !GALLERY_KEY.test(relativePath) &&
    !INSTRUCTOR_FOLDER_KEY.test(relativePath) &&
    !FROM_INSTRUCTOR_KEY.test(relativePath)
  ) {
    return null;
  }
  const scope = cloudPathScope(relativePath);
  // A from-instructor file is a shared copy, and it still counts against the bucket cap.
  if (scope === 'refused') return null;
  if (scope === 'shared' && !FROM_INSTRUCTOR_KEY.test(relativePath)) return null;
  if (scope !== 'academy' && !FROM_INSTRUCTOR_KEY.test(relativePath)) return null;
  return `groups/${licenseId}/${relativePath}`;
}

export type GalleryCloudLane = 'pending' | 'approved' | 'rejected';

/**
 * Owner photos go straight to approved. Coach and Instructors seats land in
 * pending when Cloud approval is on (the default), or approved when the owner
 * has turned that gym-wide setting off. The client cannot choose the lane.
 * Assistant coaches and program directors do not upload class photos.
 */
export function galleryUploadLane(input: {
  kind: 'owner' | 'seat';
  preset?: string | null;
  /** License-level Cloud setting. Omit or true keeps today's pending-for-seats rule. */
  approvalRequired?: boolean;
}): 'pending' | 'approved' | null {
  if (input.kind === 'owner') return 'approved';
  if (input.preset === 'coach' || input.preset === 'instructors') {
    return input.approvalRequired === false ? 'approved' : 'pending';
  }
  return null;
}

/** Owner, or an Instructors seat. A coach cannot approve their own upload. */
export function galleryDecisionAllowed(input: { kind: 'owner' | 'seat'; preset?: string | null }): boolean {
  return canDecideApproval(input);
}

/**
 * Daily videos use the same rule as class photos: the owner is approved, and
 * a seat that may upload daily videos (Coach, Instructors, program director)
 * lands in pending while the license approval switch is on.
 */
export function dailyVideoUploadLane(input: { kind: 'owner' | 'seat'; approvalRequired?: boolean }): 'pending' | 'approved' {
  return uploadLaneFor(input);
}

const DAILY_MARKER = /^pending\/daily\/(pending|rejected)\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9._-]{1,80})$/;

/**
 * Decision marker beside a daily video. The video bytes never move:
 * `videos/daily/{date}/{file}` stays the one copy. A pending or rejected
 * marker hides it; no marker (every video uploaded before lanes) is approved.
 * Built only by the server. `cloudObjectKey` refuses these paths, so a
 * browser cannot write or delete a marker through op=put.
 */
export function dailyVideoMarkerPath(videoPath: string, lane: 'pending' | 'rejected'): string | null {
  if (!DAILY_KEY.test(videoPath)) return null;
  const [, , dateKey, name] = videoPath.split('/');
  if (!dateKey || !name) return null;
  const path = `pending/daily/${lane}/${dateKey}/${name}`;
  return DAILY_MARKER.test(path) ? path : null;
}

export function parseDailyVideoMarkerPath(
  path: string,
): { lane: 'pending' | 'rejected'; dateKey: string; name: string; videoPath: string } | null {
  const match = DAILY_MARKER.exec(path);
  if (!match) return null;
  const lane = match[1] === 'rejected' ? 'rejected' : 'pending';
  const videoPath = `videos/daily/${match[2]}/${match[3]}`;
  if (!DAILY_KEY.test(videoPath)) return null;
  return { lane, dateKey: match[2], name: match[3], videoPath };
}

/** `groups/{license}/pending/daily/...` for a marker. Null for anything else. */
export function dailyVideoMarkerKey(licenseId: string, videoPath: string, lane: 'pending' | 'rejected'): string | null {
  if (!LICENSE_ID.test(licenseId)) return null;
  const path = dailyVideoMarkerPath(videoPath, lane);
  return path ? `groups/${licenseId}/${path}` : null;
}

export function galleryCloudPath(lane: GalleryCloudLane, dateKey: string, fileName: string): string | null {
  if (!isCalendarDateKey(dateKey)) return null;
  const name = safePathSegment((fileName.split(/[/\\]/).pop() ?? '').trim(), 'class-photo');
  const path = `gallery/${lane}/${dateKey}/${name}`;
  return GALLERY_KEY.test(path) ? path : null;
}

export function parseGalleryCloudPath(path: string): { lane: GalleryCloudLane; dateKey: string; name: string } | null {
  const match = /^gallery\/(pending|approved|rejected)\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9._-]{1,80})$/.exec(path);
  if (!match) return null;
  const lane = match[1];
  if (lane !== 'pending' && lane !== 'approved' && lane !== 'rejected') return null;
  return { lane, dateKey: match[2], name: match[3] };
}

export function instructorCloudPath(
  seatId: string,
  kind: 'videos' | 'photos',
  dateKey: string,
  fileName: string,
): string | null {
  if (!SEAT_SEGMENT.test(seatId) || !isCalendarDateKey(dateKey)) return null;
  if (kind !== 'videos' && kind !== 'photos') return null;
  const name = safePathSegment((fileName.split(/[/\\]/).pop() ?? '').trim(), kind === 'videos' ? 'clip' : 'photo');
  const path = `instructors/${seatId}/${kind}/${dateKey}/${name}`;
  return INSTRUCTOR_FOLDER_KEY.test(path) ? path : null;
}

export function parseInstructorCloudPath(
  path: string,
): { seatId: string; kind: 'videos' | 'photos'; dateKey: string; name: string } | null {
  const match = /^instructors\/([A-Za-z0-9_-]{1,80})\/(videos|photos)\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9._-]{1,80})$/.exec(path);
  if (!match || (match[2] !== 'videos' && match[2] !== 'photos')) return null;
  return { seatId: match[1], kind: match[2], dateKey: match[3], name: match[4] };
}

/** A claimed seat reads and writes only its own folder. The owner reads every seat. */
export function instructorFolderAccess(input: {
  kind: 'owner' | 'seat';
  seatId?: string;
  targetSeatId: string;
  mode: 'read' | 'write';
}): boolean {
  if (!SEAT_SEGMENT.test(input.targetSeatId)) return false;
  if (input.mode === 'read' && input.kind === 'owner') return true;
  return input.kind === 'seat' && Boolean(input.seatId) && input.seatId === input.targetSeatId;
}

/** Owner, Coach, and Instructors. Assistant coach and program director cannot send. */
export function canSendCloudFileToStudent(input: { kind: 'owner' | 'seat'; preset?: string | null }): boolean {
  if (input.kind === 'owner') return true;
  return input.preset === 'coach' || input.preset === 'instructors';
}

export function fromInstructorCloudPath(studentId: string, dateKey: string, fileName: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(studentId) || !isCalendarDateKey(dateKey)) return null;
  const name = safePathSegment((fileName.split(/[/\\]/).pop() ?? '').trim(), 'file');
  const path = `students/${studentId}/from-instructor/${dateKey}/${name}`;
  return FROM_INSTRUCTOR_KEY.test(path) ? path : null;
}

export function parseFromInstructorCloudPath(path: string): { studentId: string; dateKey: string; name: string } | null {
  const match = /^students\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/from-instructor\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9._-]{1,80})$/.exec(path);
  if (!match) return null;
  return { studentId: match[1], dateKey: match[2], name: match[3] };
}

export function isLessonMediaCloudPath(relativePath: string): boolean {
  return LESSON_MEDIA_KEY.test(relativePath);
}

export function galleryDecisionPath(pendingPath: string, lane: 'approved' | 'rejected'): string | null {
  const parsed = parseGalleryCloudPath(pendingPath);
  if (!parsed || parsed.lane !== 'pending') return null;
  const next = `gallery/${lane}/${parsed.dateKey}/${parsed.name}`;
  return parseGalleryCloudPath(next) ? next : null;
}

/** True when this signed-in license has Advantage Cloud. A missing sign-in is off. */
export async function advantageCloudReady(input?: { token?: string; fetcher?: CloudFetcher }): Promise<boolean> {
  const token = input?.token ?? readCloudBearer();
  if (!token) return false;
  const fetcher = input?.fetcher ?? fetch;
  try {
    const response = await fetcher(cloudUrl('/api/gym/cloud?op=status'), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { cloud?: unknown };
    return body.cloud === true;
  } catch {
    return false;
  }
}


/** The gym-wide Cloud approval setting. Missing or unread is treated as on. */
export async function fetchCloudGalleryApproval(input?: {
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<{ ok: true; required: boolean } | { ok: false }> {
  const token = input?.token ?? readCloudBearer();
  if (!token) return { ok: false };
  const fetcher = input?.fetcher ?? fetch;
  try {
    const response = await fetcher(cloudUrl('/api/gym/cloud?op=gallery-approval'), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as { required?: unknown };
    return { ok: true, required: body.required !== false };
  } catch {
    return { ok: false };
  }
}

/** Owner only. Seats are refused by the server. */
export async function saveCloudGalleryApproval(
  required: boolean,
  input?: { token?: string; fetcher?: CloudFetcher },
): Promise<{ ok: true; required: boolean } | { ok: false; error: string; status?: number }> {
  const token = input?.token ?? readCloudBearer();
  if (!token) return { ok: false, error: CLOUD_SIGN_IN_MESSAGE };
  const fetcher = input?.fetcher ?? fetch;
  try {
    const response = await fetcher(cloudUrl('/api/gym/cloud'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'gallery-approval', required }),
    });
    if (!response.ok) {
      return { ok: false, error: await readError(response, 'Advantage Cloud could not save that setting.'), status: response.status };
    }
    const body = (await response.json()) as { required?: unknown };
    return { ok: true, required: body.required !== false };
  } catch {
    return { ok: false, error: 'Advantage Cloud could not save that setting.' };
  }
}

export function cloudRelativePath(input: {
  purpose: CloudMediaPurpose;
  role: GymActor;
  dateKey: string;
  fileName: string;
}): { ok: true; path: string } | { ok: false; error: string } {
  if (
    input.purpose === 'replay-pending' ||
    input.purpose === 'gallery' ||
    input.purpose === 'instructor-video' ||
    input.purpose === 'instructor-photo' ||
    input.purpose === 'from-instructor'
  ) {
    return { ok: false, error: CLOUD_ROLE_MESSAGE };
  }
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
  /** Daily videos and gallery items. Missing means approved (older servers). */
  lane?: ApprovalLane;
  /** Lesson plan JSON rows: the gym template or the signed-in instructor's own copy. */
  lessonPlan?: LessonPlanSource;
};

export type CloudHomeView =
  | { phase: 'unbound' }
  | { phase: 'error' }
  | { phase: 'connected' }
  | { phase: 'unavailable' }
  | {
      phase: 'ready';
      canUpload: boolean;
      licenseUsedBytes: number;
      capBytes: number;
    };

/** Words for the owner Cloud status. A fixture result is not a live connection. */
export function cloudHomeStatusLine(view: CloudHomeView | null): string {
  if (!view) return 'Checking Advantage Cloud…';
  if (view.phase === 'unbound') return CLOUD_HOME_UNBOUND;
  if (view.phase === 'error') return CLOUD_HOME_ERROR;
  if (view.phase === 'unavailable') return CLOUD_UNAVAILABLE_MESSAGE;
  if (view.phase === 'connected') return CLOUD_HOME_CONNECTED;
  return cloudUsageLine(view.licenseUsedBytes, view.capBytes);
}

export type CloudUsageFigure = {
  /** Hero figure, same role as the other academy stat numbers. */
  value: string;
  /** Unit beside the figure. Empty when there is no measurement yet. */
  unit: string;
  /** Short line under the figure. */
  label: string;
};

function splitCloudBytes(bytes: number): { value: string; unit: string } {
  const text = formatCloudBytes(bytes);
  const space = text.lastIndexOf(' ');
  if (space < 0) return { value: text, unit: '' };
  return { value: text.slice(0, space), unit: text.slice(space + 1) };
}

/**
 * Compact academy-card figures for a Cloud owner.
 * Ready: this license, then the bucket used of the quota.
 * Anything else stays a single tappable figure with no invented bytes.
 */
export function cloudUsageFigures(view: CloudHomeView | null): CloudUsageFigure[] {
  if (!view) return [{ value: '…', unit: '', label: 'Advantage Cloud' }];
  if (view.phase !== 'ready') {
    const label =
      view.phase === 'unbound'
        ? 'Not connected'
        : view.phase === 'error'
          ? 'Could not read Cloud usage'
          : view.phase === 'connected'
            ? 'Sign in'
            : 'Not on this license';
    return [{ value: '—', unit: '', label }];
  }
  const license = splitCloudBytes(view.licenseUsedBytes);
  const cap = splitCloudBytes(view.capBytes);
  return [
    { value: license.value, unit: license.unit, label: 'This gym' },
    { value: cap.value, unit: cap.unit, label: cloudOverSoftLimit(view.licenseUsedBytes, view.capBytes) ? 'Limit · delete old videos' : 'Limit' },
  ];
}

/**
 * The academy card shows Cloud usage only for the owner of an entitled, active
 * Advantage Cloud license. A Google Drive or OneDrive academy, a lapsed Cloud
 * license, and a signed-in seat do not get the tile.
 */
export function academyCloudTileVisible(input: { owner: boolean; cloudEntitled: boolean; lapsed: boolean }): boolean {
  return input.owner && input.cloudEntitled && !input.lapsed;
}

/**
 * Probe the site bucket, then read this license when the device is signed in.
 * Numbers come only from `/api/gym/media?probe=1` and `/api/gym/cloud?op=status`.
 * This does not invent usage and does not call Google Drive or OneDrive.
 */
export async function loadAdvantageCloudHome(fetcher: CloudFetcher = fetch): Promise<CloudHomeView> {
  let bound = false;
  try {
    const probe = await fetcher('/api/gym/media?probe=1');
    if (probe.status === 503) return { phase: 'unbound' };
    if (!probe.ok) return { phase: 'error' };
    const body = (await probe.json()) as { bound?: unknown };
    bound = body.bound === true;
  } catch {
    return { phase: 'error' };
  }
  if (!bound) return { phase: 'unbound' };
  const token = readCloudBearer();
  if (!token) return { phase: 'connected' };
  try {
    const response = await fetcher('/api/gym/cloud?op=status', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) return { phase: 'connected' };
    if (!response.ok) return { phase: 'error' };
    const body = (await response.json()) as CloudStatusBody;
    if (!body.cloud) return { phase: 'unavailable' };
    const licenseUsedBytes = body.licenseUsedBytes;
    const capBytes = body.capBytes;
    if (
      typeof licenseUsedBytes !== 'number' ||
      typeof capBytes !== 'number' ||
      !Number.isFinite(licenseUsedBytes) ||
      !Number.isFinite(capBytes)
    ) {
      return { phase: 'error' };
    }
    return {
      phase: 'ready',
      canUpload: Boolean(body.canUpload),
      licenseUsedBytes,
      capBytes,
    };
  } catch {
    return { phase: 'error' };
  }
}

export type CloudStatusBody = {
  ok: true;
  cloud: boolean;
  canUpload?: boolean;
  /** License-level Cloud approval. Default true when the owner has never saved a choice. */
  galleryApprovalRequired?: boolean;
  /** Program director: may put a video in today's daily videos, nothing else. */
  dailyVideoDrop?: boolean;
  /** Program director: may list and play today's daily videos, nothing else. */
  dailyVideoPlay?: boolean;
  licenseUsedBytes?: number;
  /** Older builds read this. It now equals licenseUsedBytes; the whole bucket is no longer scanned. */
  bucketUsedBytes?: number;
  /** Per-license hard limit. */
  capBytes?: number;
  /** Per-license soft limit: past this the owner is asked to delete old videos. */
  softLimitBytes?: number;
  maxUploadBytes?: number;
  replayUpload?: ReplayCloudUpload;
};

export type CloudUploadResult =
  | { ok: true; path: string; lane?: 'pending' | 'approved'; duplicate?: boolean }
  | { ok: false; message: string; retryable?: boolean; canceled?: boolean };

/**
 * Where a multipart upload got to. The queue keeps this between tries so a
 * manual Retry resumes from the last good part instead of starting over.
 */
export type CloudUploadResume = {
  key?: string;
  path?: string;
  uploadId?: string;
  partSize?: number;
  lane?: 'pending' | 'approved';
  parts?: { partNumber: number; etag: string }[];
};

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

const CLOUD_UNREACHABLE = 'Advantage Cloud could not be reached. Check the connection, then retry.';

async function failure(response: Response, fallback: string): Promise<CloudUploadResult> {
  return { ok: false, message: await readError(response, fallback), retryable: retryableStatus(response.status) };
}

/** Abort the server-side multipart upload. Best effort: R2 also expires it after a week. */
export async function abortAdvantageCloudUpload(input: {
  key: string;
  uploadId: string;
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<void> {
  const token = input.token ?? readCloudBearer();
  if (!token) return;
  const fetcher = input.fetcher ?? fetch;
  try {
    await fetcher(cloudUrl('/api/gym/cloud'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'abort', key: input.key, uploadId: input.uploadId }),
    });
  } catch {
    /* Expires on its own. */
  }
}

export async function uploadAdvantageCloudFile(input: {
  purpose: CloudMediaPurpose;
  dateKey: string;
  file: Blob;
  fileName: string;
  mime: string;
  token?: string;
  fetcher?: CloudFetcher;
  /** Ignored for the object path. The server picks the lane from the license setting and the actor role. */
  lane?: 'pending' | 'approved';
  studentId?: string;
  onProgress?: (sent: number, total: number) => void;
  /** Content fingerprint (cloudFingerprint.ts). The server skips a file this gym already has. */
  fingerprint?: string;
  /** Cancel. A multipart upload is aborted on the server too. */
  signal?: AbortSignal;
  /** Per-request retry with backoff. Default: one try, as before. */
  retry?: RetryOptions;
  /** Kept between tries so a retry resumes a multipart upload. */
  resume?: CloudUploadResume;
  /** Lesson plan JSON only. Default `mine`: the instructor's own copy. `template` is owner / Coach only. */
  planTarget?: LessonPlanTarget;
}): Promise<CloudUploadResult> {
  const token = input.token ?? readCloudBearer();
  if (!token) return { ok: false, message: CLOUD_SIGN_IN_MESSAGE };
  const fetcher = input.fetcher ?? fetch;
  const headers = { authorization: `Bearer ${token}` };
  const resume: CloudUploadResume = input.resume ?? {};
  const send = (url: string, init: RequestInit) =>
    fetchWithRetry(fetcher, cloudUrl(url), init, { ...input.retry, signal: input.signal });
  const canceled = async (): Promise<CloudUploadResult> => {
    if (resume.key && resume.uploadId) {
      await abortAdvantageCloudUpload({ key: resume.key, uploadId: resume.uploadId, token, fetcher });
      resume.uploadId = undefined;
      resume.parts = [];
    }
    return { ok: false, message: 'Canceled.', canceled: true };
  };
  try {
    if (!resume.key || !resume.path || (resume.partSize && !resume.uploadId)) {
      const start = await send('/api/gym/cloud', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          purpose: input.purpose,
          dateKey: input.dateKey,
          fileName: input.fileName,
          size: input.file.size,
          mime: input.mime,
          ...(input.lane ? { lane: input.lane } : {}),
          ...(input.studentId ? { studentId: input.studentId } : {}),
          ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
          ...(input.purpose === 'lesson' ? { planTarget: input.planTarget === 'template' ? 'template' : 'mine' } : {}),
        }),
      });
      if (!start.ok) return failure(start, 'Advantage Cloud could not take that file.');
      const opened = (await start.json()) as {
        mode?: string;
        key?: string;
        path?: string;
        uploadId?: string;
        partSize?: number;
        lane?: string;
      };
      const openedLane = opened.lane === 'pending' || opened.lane === 'approved' ? opened.lane : undefined;
      if (opened.mode === 'duplicate' && opened.path) {
        input.onProgress?.(input.file.size, input.file.size);
        return { ok: true, path: opened.path, duplicate: true, ...(openedLane ? { lane: openedLane } : {}) };
      }
      if (!opened.key || !opened.path) return { ok: false, message: 'Advantage Cloud could not take that file.' };
      resume.key = opened.key;
      resume.path = opened.path;
      resume.lane = openedLane;
      resume.parts = [];
      if (opened.mode === 'multipart') {
        resume.uploadId = opened.uploadId ?? '';
        resume.partSize = opened.partSize && opened.partSize > 0 ? opened.partSize : CLOUD_CHUNK_BYTES;
      } else {
        resume.uploadId = undefined;
        resume.partSize = undefined;
      }
    }
    const key = resume.key as string;
    const path = resume.path as string;
    const lane: { lane?: 'pending' | 'approved' } = resume.lane ? { lane: resume.lane } : {};
    const print = input.fingerprint ? `&fingerprint=${encodeURIComponent(input.fingerprint)}` : '';
    if (resume.uploadId && resume.partSize) {
      const partSize = resume.partSize;
      const parts = resume.parts ?? (resume.parts = []);
      const done = new Set(parts.map((part) => part.partNumber));
      let partNumber = 1;
      for (let offset = 0; offset < input.file.size; offset += partSize) {
        const end = Math.min(input.file.size, offset + partSize);
        if (!done.has(partNumber)) {
          const chunk = input.file.slice(offset, end);
          const put = await send(
            `/api/gym/cloud?op=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(resume.uploadId)}&partNumber=${partNumber}`,
            { method: 'PUT', headers, body: chunk },
          );
          if (!put.ok) return failure(put, 'Advantage Cloud stopped during that upload.');
          const part = (await put.json()) as { etag?: string };
          if (!part.etag) return { ok: false, message: 'Advantage Cloud stopped during that upload.', retryable: true };
          parts.push({ partNumber, etag: part.etag });
        }
        partNumber += 1;
        input.onProgress?.(end, input.file.size);
      }
      const finished = await send('/api/gym/cloud', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          key,
          uploadId: resume.uploadId,
          parts: [...parts].sort((a, b) => a.partNumber - b.partNumber),
          size: input.file.size,
          ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
        }),
      });
      if (!finished.ok) {
        // A refused complete (full, too large) closes the upload on the server. Start fresh next time.
        if (!retryableStatus(finished.status)) {
          resume.key = undefined;
          resume.uploadId = undefined;
          resume.parts = [];
        }
        return failure(finished, 'Advantage Cloud could not finish that file.');
      }
      notifyCloudMedia();
      return { ok: true, path, ...lane };
    }
    const put = await send(`/api/gym/cloud?op=put&key=${encodeURIComponent(key)}${print}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': input.mime || 'application/octet-stream' },
      body: input.file,
    });
    if (!put.ok) return failure(put, 'Advantage Cloud could not take that file.');
    input.onProgress?.(input.file.size, input.file.size);
    notifyCloudMedia();
    return { ok: true, path, ...lane };
  } catch (error) {
    if (isCanceled(error, input.signal)) return canceled();
    return { ok: false, message: CLOUD_UNREACHABLE, retryable: true };
  }
}

let lessonTimer: ReturnType<typeof setTimeout> | null = null;
let lessonPending: { dateKey: string; json: string } | null = null;

/** Debounced lesson-plan text, saved to the instructor's own copy. No-ops unless this page confirmed Cloud uploads. */
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
      // Edits never touch the gym template. They go to this instructor's own copy.
      planTarget: 'mine',
    }).then((result) => {
      if (result.ok) notifyCloudMedia();
    });
  }, 500);
}

export type CloudLessonPlanRead = {
  ok: true;
  instructorId: string;
  canEditTemplate: boolean;
  template: { path: string; exists: boolean; plan: unknown | null };
  mine: { path: string; exists: boolean; plan: unknown | null };
};

/** The gym template and this instructor's own copy for one day. Null when Cloud cannot be read. */
export async function fetchCloudLessonPlan(input: {
  dateKey: string;
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<CloudLessonPlanRead | null> {
  const token = input.token ?? readCloudBearer();
  if (!token || !isCalendarDateKey(input.dateKey)) return null;
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(cloudUrl(`/api/gym/cloud?op=lesson-plan&date=${encodeURIComponent(input.dateKey)}`), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<CloudLessonPlanRead> | null;
    if (!body?.ok || !body.template || !body.mine || typeof body.instructorId !== 'string') return null;
    return body as CloudLessonPlanRead;
  } catch {
    return null;
  }
}

/** Owner / Coach: replace the gym template for one day with this plan. */
export function saveCloudLessonTemplate(input: { dateKey: string; json: string; token?: string; fetcher?: CloudFetcher }): Promise<CloudUploadResult> {
  return uploadAdvantageCloudFile({
    purpose: 'lesson',
    dateKey: input.dateKey,
    file: new Blob([input.json], { type: 'application/json' }),
    fileName: `${input.dateKey}.json`,
    mime: 'application/json',
    token: input.token,
    fetcher: input.fetcher,
    planTarget: 'template',
  });
}

/** Drop this instructor's own copy for one day, so the gym template opens again. The template is never touched. */
export async function resetMyCloudLessonPlan(input: {
  dateKey: string;
  token?: string;
  fetcher?: CloudFetcher;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = input.token ?? readCloudBearer();
  if (!token) return { ok: false, message: CLOUD_SIGN_IN_MESSAGE };
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(cloudUrl('/api/gym/cloud'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'lesson-reset', dateKey: input.dateKey }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, message: body?.error || 'Advantage Cloud could not reset that plan.' };
    }
    notifyCloudMedia();
    return { ok: true };
  } catch {
    return { ok: false, message: CLOUD_UNREACHABLE };
  }
}

/**
 * Replay clips only (Record for replay / Record for Review). Owner, Coach and
 * Instructors upload straight to lesson media. Assistant coaches and program
 * directors upload as pending: only the uploader and the owner see it until
 * the owner approves. This does not change `cloudMediaAccess` or any preset.
 */
export type ReplayCloudUpload = 'direct' | 'pending' | 'none';

export function cloudReplayUpload(input: { plusCloud: boolean; kind: 'owner' | 'seat'; preset?: string | null }): ReplayCloudUpload {
  if (!input.plusCloud) return 'none';
  if (input.kind === 'owner') return 'direct';
  const preset = input.preset ?? '';
  if (preset === 'coach' || preset === 'instructors') return 'direct';
  if (preset === 'assistant-coach' || preset === 'program-director') return 'pending';
  return 'none';
}

export type PendingReplayStatus = 'pending' | 'approved' | 'declined';
export type PendingReplayRow = {
  path: string;
  seatId: string;
  dateKey: string;
  name: string;
  size: number;
  mime: string;
  status: PendingReplayStatus;
};

const SEAT_SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;

/** `pending/replays/{seatId}/{date}/{file}` for one seat's clip, or null. */
export function pendingReplayPath(seatId: string, dateKey: string, fileName: string): string | null {
  if (!SEAT_SEGMENT.test(seatId) || !isCalendarDateKey(dateKey)) return null;
  const media = lessonMediaPath(dateKey, fileName);
  const name = media?.split('/').pop() ?? '';
  const path = `pending/replays/${seatId}/${dateKey}/${name}`;
  return PENDING_REPLAY_KEY.test(path) ? path : null;
}

/** Status marker beside a pending clip. Decline writes a marker; the clip object is never deleted. */
export function pendingStatusPath(pendingPath: string): string | null {
  const m = /^pending\/replays\/(.+)$/.exec(pendingPath);
  if (!m || !PENDING_REPLAY_KEY.test(pendingPath)) return null;
  return `pending/status/${m[1]}.json`;
}

export function parsePendingReplayPath(path: string): { seatId: string; dateKey: string; name: string } | null {
  if (!PENDING_REPLAY_KEY.test(path)) return null;
  const [, , seatId, dateKey, name] = path.split('/');
  return { seatId, dateKey, name };
}

/** Where an approved clip lands: the normal lesson-media path for that date. */
export function approvedReplayPath(pendingPath: string): string | null {
  const parsed = parsePendingReplayPath(pendingPath);
  return parsed ? lessonMediaPath(parsed.dateKey, parsed.name) : null;
}

let replayPending = false;

/** Set by the Cloud status check when this seat uploads replay clips as pending. */
export function setCloudReplayPending(pending: boolean): void {
  replayPending = pending;
}

export function cloudReplayPendingSelected(): boolean {
  return replayPending;
}
