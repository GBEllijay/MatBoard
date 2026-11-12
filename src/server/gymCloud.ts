/**
 * Signed-in Advantage Cloud files for one license.
 * The browser never receives a public bucket URL.
 * Gallery list, upload, and approval for staff stay on this route.
 * Slideshow bytes for an approved photo still use functions/api/gym/media.ts.
 */

import {
  CLOUD_CHUNK_BYTES,
  CLOUD_DAILY_DROP_ONLY,
  CLOUD_ROLE_MESSAGE,
  CLOUD_SIGN_IN_MESSAGE,
  CLOUD_UNAVAILABLE_MESSAGE,
  cloudCapBytes,
  cloudDailyVideoDrop,
  cloudFullMessage,
  cloudListPrefix,
  cloudMaxUploadBytes,
  cloudMediaAccess,
  cloudReplayUpload,
  approvedReplayPath,
  parsePendingReplayPath,
  pendingReplayPath,
  pendingStatusPath,
  type PendingReplayRow,
  type PendingReplayStatus,
  type ReplayCloudUpload,
  cloudObjectKey,
  cloudRelativePath,
  cloudTooLargeMessage,
  CUSTOM_SKIN_CLOUD_CAP,
  CUSTOM_SKIN_META_MAX_BYTES,
  customSkinIdFromPath,
  isCustomSkinImagePath,
  isCustomSkinMetaPath,
  isDailyVideoCloudPath,
  dailyVideoMarkerKey,
  dailyVideoUploadLane,
  parseDailyVideoMarkerPath,
  galleryCloudPath,
  galleryDecisionAllowed,
  galleryDecisionPath,
  galleryUploadLane,
  parseGalleryCloudPath,
  instructorCloudPath,
  parseInstructorCloudPath,
  instructorFolderAccess,
  canSendCloudFileToStudent,
  fromInstructorCloudPath,
  parseFromInstructorCloudPath,
  isLessonMediaCloudPath,
  claimsOpenPlusCloud,
  grantRowOpensPlusCloud,
  ownerCloudGrantOpen,
  gymActorForCloud,
  safeCloudMime,
  type CloudFileRow,
  type CloudMediaPurpose,
} from '../lib/advantageCloudMedia.ts';
import { laneFromMarkers, mediaKindOf, sortForGallery, type ApprovalLane, type ApprovalSource } from '../lib/approvalLanes.ts';
import {
  DEFAULT_VIDEO_CLEANUP_DAYS,
  MEDIA_DELETE_BATCH_MAX,
  OLD_VIDEO_LIST_MAX,
  isOnOrBeforeDateKey,
  isVideoCleanupDays,
  parseVideoCleanupDays,
  videoCleanupCutoffDate,
  type OldCloudVideo,
} from '../lib/cloudVideoCleanup.ts';
import { STUDENT_CLOUD_REFUSED, STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import { verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { cloudAccessForLicense } from './cloudSubscription.ts';
import { grantsForLicense } from './purchaseRecords.ts';
import { signingMaterial } from './tokenIssue.ts';

export type R2HttpMetadata = { contentType?: string };

export type R2UploadedPart = { partNumber: number; etag: string };

export type R2MultipartUpload = {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ArrayBuffer | Uint8Array): Promise<R2UploadedPart>;
  complete(parts: R2UploadedPart[]): Promise<unknown>;
  abort(): Promise<void>;
};

export type GymMediaObject = {
  body: ReadableStream;
  size: number;
  httpMetadata?: R2HttpMetadata;
};

export type GymMediaBucket = {
  head(key: string): Promise<{ size: number; httpMetadata?: R2HttpMetadata } | null>;
  /** `range` reads part of an object, so a large approval copy never holds the whole file. */
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<GymMediaObject | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: R2HttpMetadata }): Promise<unknown>;
  /** One key, or up to 1,000 keys, matching R2's batch delete. */
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string; size: number; httpMetadata?: R2HttpMetadata }[];
    truncated: boolean;
    cursor?: string;
  }>;
  createMultipartUpload(key: string, options?: { httpMetadata?: R2HttpMetadata }): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
  /** Present on the real R2 binding. Used to abort leftover chunked uploads. */
  listMultipartUploads?(options?: { prefix?: string; limit?: number }): Promise<{
    uploads: { key: string; uploadId: string }[];
  }>;
};

export type GymCloudEnv = {
  GYM_MEDIA?: GymMediaBucket;
  GYM_MEDIA_CAP_BYTES?: string;
  GYM_MEDIA_MAX_UPLOAD_BYTES?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  ENTITLEMENTS_DB?: D1Database | null;
};

export type GymCloudActor = {
  licenseId: string;
  kind: 'owner' | 'seat';
  preset: string | null;
  read: boolean;
  upload: boolean;
  /** Seat id from the token; empty for the owner. */
  seatId: string;
  /** Replay clips and markup pictures only: direct, pending owner approval, or none. */
  replayUpload: ReplayCloudUpload;
  /** Program director: upload to today's daily videos only. */
  dailyDrop: boolean;
  /** This license has Advantage Cloud (Pro Plus Cloud). Used by the gym roster function. */
  plusCloud: boolean;
};
type Actor = GymCloudActor;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? '';
}

/**
 * Plus Cloud for one academy license.
 * Owner and alpha-pro codes keep the `advantage-pro` exemption.
 * A paid add-on is the `advantage-cloud-*` row plus its subscription:
 * active and trialing are on, past_due stays on for the existing 7-day grace,
 * cancel-at-period-end stays on until that end, and paused, unpaid, canceled,
 * and incomplete are off. This does not call Stripe and does not create a license.
 */
/** `unread` is a database failure. It is not a decision that Cloud is absent. */
async function lookupPlusCloud(env: GymCloudEnv, licenseId: string, now: Date): Promise<'on' | 'off' | 'unread'> {
  if (licenseId === 'owner-test') return 'on';
  const db = env.ENTITLEMENTS_DB;
  if (!db) return 'off';
  try {
    const grants = await grantsForLicense(db, licenseId, now);
    if (grants.some((row) => grantRowOpensPlusCloud(row) || ownerCloudGrantOpen(row))) return 'on';
    const cloud = await cloudAccessForLicense(db, licenseId, now);
    return cloud.entitled ? 'on' : 'off';
  } catch {
    return 'unread';
  }
}

async function seatIsActive(env: GymCloudEnv, licenseId: string, seatId: string): Promise<boolean> {
  const db = env.ENTITLEMENTS_DB;
  if (!db) return licenseId === 'owner-test';
  try {
    const row = await db
      .prepare(
        `SELECT status, revoked_at AS revokedAt FROM seats WHERE id = ? AND gym_license_id = ? LIMIT 1`,
      )
      .bind(seatId, licenseId)
      .first<{ status: string; revokedAt: string | null }>();
    if (!row) return licenseId === 'owner-test';
    if (row.revokedAt) return false;
    return row.status === 'claimed' || row.status === 'active';
  } catch {
    return false;
  }
}

/** Signed-in actor for the gym cloud functions. Revoked seats get 403 here. */
export async function readGymCloudActor(request: Request, env: GymCloudEnv, now: Date): Promise<GymCloudActor | Response> {
  return readActor(request, env, now);
}

/** Bytes used under one prefix of the gym bucket. */
export function gymBytesUnder(bucket: GymMediaBucket, prefix: string): Promise<number> {
  return bytesUnder(bucket, prefix);
}

async function readActor(request: Request, env: GymCloudEnv, now: Date): Promise<Actor | Response> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Sign-in is not set up yet.' });
  const token = bearer(request);
  if (!token) return json(401, { ok: false, error: CLOUD_SIGN_IN_MESSAGE });
  const claims = await verifyToken(token, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(401, { ok: false, error: CLOUD_SIGN_IN_MESSAGE });
  const seconds = Math.floor(now.getTime() / 1000);
  if (claims.exp <= seconds || claims.nbf > seconds + 300) return json(401, { ok: false, error: CLOUD_SIGN_IN_MESSAGE });
  return actorForClaims(env, claims, now);
}

async function actorForClaims(env: GymCloudEnv, claims: EntitlementClaims, now: Date): Promise<Actor | Response> {
  // A free Student license is not the gym owner and not a coach seat.
  if (claims.preset === STUDENT_LICENSE_PRESET) return json(403, { ok: false, error: STUDENT_CLOUD_REFUSED });
  const seat = claims.src === 'seat' || claims.tier === 'seat';
  const licenseId = seat ? claims.gym || claims.sub : claims.sub;
  if (!licenseId) return json(401, { ok: false, error: CLOUD_SIGN_IN_MESSAGE });
  // The license row wins when entitlement storage is bound. A stale `subs.cloud`
  // flag cannot keep a lapsed add-on open, and a missing flag cannot hide an
  // active one. With no database, the signed pass is the only record.
  const lookup = await lookupPlusCloud(env, licenseId, now);
  if (lookup === 'unread') {
    return json(503, { ok: false, error: 'Advantage Cloud could not be checked. Nothing on this device was changed.' });
  }
  const plusCloud = lookup === 'on' || (!seat && !env.ENTITLEMENTS_DB && claimsOpenPlusCloud(claims));
  if (seat) {
    const seatId = claims.sid ?? '';
    if (!seatId || !(await seatIsActive(env, licenseId, seatId))) {
      return json(403, { ok: false, error: 'This seat is not active.' });
    }
  }
  const access = cloudMediaAccess({
    plusCloud,
    kind: seat ? 'seat' : 'owner',
    preset: claims.preset ?? null,
  });
  return {
    licenseId,
    kind: seat ? 'seat' : 'owner',
    preset: claims.preset ?? null,
    read: access.read,
    upload: access.upload,
    seatId: seat ? claims.sid ?? '' : '',
    replayUpload: cloudReplayUpload({ plusCloud, kind: seat ? 'seat' : 'owner', preset: claims.preset ?? null }),
    dailyDrop: cloudDailyVideoDrop({ plusCloud, kind: seat ? 'seat' : 'owner', preset: claims.preset ?? null }),
    plusCloud,
  };
}

async function bytesUnder(bucket: GymMediaBucket, prefix: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of listed.objects) total += object.size;
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return total;
}

async function roomFor(bucket: GymMediaBucket, key: string, size: number, cap: number): Promise<{ ok: true; bucketUsed: number } | { ok: false; bucketUsed: number }> {
  const [bucketUsed, existing] = await Promise.all([bytesUnder(bucket, ''), bucket.head(key)]);
  const next = bucketUsed - (existing?.size ?? 0) + size;
  if (next > cap) return { ok: false, bucketUsed };
  return { ok: true, bucketUsed };
}

export function streamFrom(bytes: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function fileResponse(object: GymMediaObject): Response {
  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, no-store');
  headers.set('vary', 'authorization');
  return new Response(object.body, { status: 200, headers });
}

function ownedKey(actor: Actor, raw: string): string | null {
  if (!raw.startsWith(`groups/${actor.licenseId}/`)) return null;
  const relative = raw.slice(`groups/${actor.licenseId}/`.length);
  const key = cloudObjectKey(actor.licenseId, relative);
  if (key !== raw) return null;
  return key;
}

async function listFiles(
  bucket: GymMediaBucket,
  actor: Actor,
  purpose: 'daily-video' | 'lesson',
  dateKey: string,
  includeUnapproved = false,
): Promise<CloudFileRow[] | Response> {
  const prefix = cloudListPrefix(purpose, dateKey);
  if (!prefix) return json(400, { ok: false, error: 'Choose a real date.' });
  const files: CloudFileRow[] = [];
  const lanes = purpose === 'daily-video' ? await dailyLaneSets(bucket, actor.licenseId, dateKey) : null;
  const mediaKeyPrefix = `groups/${actor.licenseId}/${prefix.media}`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: mediaKeyPrefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = object.key.startsWith(`groups/${actor.licenseId}/`)
        ? object.key.slice(`groups/${actor.licenseId}/`.length)
        : '';
      if (!cloudObjectKey(actor.licenseId, relative)) continue;
      const lane = lanes && isDailyVideoCloudPath(relative) ? laneOfDaily(lanes, relative) : null;
      // Pending and rejected daily videos stay out of every list except an approver's review.
      if (lane && lane !== 'approved' && !includeUnapproved) continue;
      files.push({
        name: relative.split('/').pop() ?? relative,
        path: relative,
        size: object.size,
        mime: object.httpMetadata?.contentType || 'application/octet-stream',
        ...(lane ? { lane } : {}),
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  if (prefix.plan) {
    const planKey = cloudObjectKey(actor.licenseId, prefix.plan);
    if (planKey) {
      const plan = await bucket.head(planKey);
      if (plan) {
        files.unshift({
          name: prefix.plan.split('/').pop() ?? prefix.plan,
          path: prefix.plan,
          size: plan.size,
          mime: plan.httpMetadata?.contentType || 'application/json',
        });
      }
    }
  }
  return files;
}

type DailyLaneSets = { pending: Set<string>; rejected: Set<string> };

/** Video paths that have a pending or rejected marker. One list call per lane. */
async function dailyLaneSets(bucket: GymMediaBucket, licenseId: string, dateKey: string): Promise<DailyLaneSets> {
  const sets: DailyLaneSets = { pending: new Set(), rejected: new Set() };
  const base = `groups/${licenseId}/`;
  for (const lane of ['pending', 'rejected'] as const) {
    let cursor: string | undefined;
    const prefix = `${base}pending/daily/${lane}/${dateKey ? `${dateKey}/` : ''}`;
    for (let page = 0; page < 20; page += 1) {
      const listed = await bucket.list({ prefix, cursor, limit: 1000 });
      for (const object of listed.objects) {
        const parsed = parseDailyVideoMarkerPath(object.key.slice(base.length));
        if (parsed && parsed.lane === lane) sets[lane].add(parsed.videoPath);
      }
      if (!listed.truncated || !listed.cursor) break;
      cursor = listed.cursor;
    }
  }
  return sets;
}

function laneOfDaily(sets: DailyLaneSets, videoPath: string): ApprovalLane {
  return laneFromMarkers({ pending: sets.pending.has(videoPath), rejected: sets.rejected.has(videoPath) });
}

/** One video's lane. No marker is approved, which covers every legacy upload. */
async function dailyVideoLane(bucket: GymMediaBucket, licenseId: string, videoPath: string): Promise<ApprovalLane> {
  const pendingKey = dailyVideoMarkerKey(licenseId, videoPath, 'pending');
  const rejectedKey = dailyVideoMarkerKey(licenseId, videoPath, 'rejected');
  if (!pendingKey || !rejectedKey) return 'approved';
  const [pending, rejected] = await Promise.all([bucket.head(pendingKey), bucket.head(rejectedKey)]);
  return laneFromMarkers({ pending: Boolean(pending), rejected: Boolean(rejected) });
}

/** A pending marker whose upload never finished. Called after abort or a refused complete. */
async function dropOrphanDailyMarker(bucket: GymMediaBucket, licenseId: string, key: string): Promise<void> {
  const relative = relativePath(licenseId, key);
  if (!isDailyVideoCloudPath(relative)) return;
  const markerKey = dailyVideoMarkerKey(licenseId, relative, 'pending');
  if (!markerKey) return;
  if (await bucket.head(key)) return;
  await bucket.delete(markerKey);
}

/** Copies at most this many bytes in one read. Larger files copy part by part. */
const BUFFERED_COPY_MAX = 2 * CLOUD_CHUNK_BYTES;

/**
 * Server-side copy inside the bucket. Small files are read once. Larger files
 * use ranged reads into a multipart upload, so a 100 MB video never sits in
 * Worker memory (the old approve path read the whole file and could hit the
 * 128 MB Worker limit).
 */
export async function copyGymObject(
  bucket: GymMediaBucket,
  sourceKey: string,
  targetKey: string,
  size: number,
  contentType: string,
): Promise<boolean> {
  if (size <= BUFFERED_COPY_MAX) {
    const object = await bucket.get(sourceKey);
    if (!object) return false;
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    await bucket.put(targetKey, bytes, { httpMetadata: { contentType } });
    return true;
  }
  const upload = await bucket.createMultipartUpload(targetKey, { httpMetadata: { contentType } });
  try {
    const parts: R2UploadedPart[] = [];
    let partNumber = 1;
    for (let offset = 0; offset < size; offset += CLOUD_CHUNK_BYTES) {
      const length = Math.min(CLOUD_CHUNK_BYTES, size - offset);
      const piece = await bucket.get(sourceKey, { range: { offset, length } });
      if (!piece) throw new Error('missing source');
      const bytes = new Uint8Array(await new Response(piece.body).arrayBuffer());
      parts.push(await upload.uploadPart(partNumber, bytes));
      partNumber += 1;
    }
    await upload.complete(parts);
    return true;
  } catch {
    await upload.abort().catch(() => undefined);
    return false;
  }
}

export type ApprovedMediaRow = CloudFileRow & {
  source: ApprovalSource;
  lane: 'approved';
  dateKey: string;
  kind: 'photo' | 'video';
};

/** Most approved items one gallery list returns, newest day first. */
const APPROVED_MEDIA_LIMIT = 500;

/**
 * Everything approved for display: gallery/approved/ plus daily videos with no
 * pending or rejected marker (legacy daily videos included). Pending and
 * rejected files never appear here.
 */
async function listApprovedMedia(bucket: GymMediaBucket, actor: Actor): Promise<ApprovedMediaRow[]> {
  const rows: ApprovedMediaRow[] = [];
  for (const file of await listGallery(bucket, actor, 'approved', '')) {
    const parsed = parseGalleryCloudPath(file.path);
    if (!parsed) continue;
    rows.push({ ...file, source: 'gallery', lane: 'approved', dateKey: parsed.dateKey, kind: mediaKindOf(file.mime, file.name) });
  }
  const lanes = await dailyLaneSets(bucket, actor.licenseId, '');
  const base = `groups/${actor.licenseId}/`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: `${base}videos/daily/`, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = relativePath(actor.licenseId, object.key);
      if (!isDailyVideoCloudPath(relative) || laneOfDaily(lanes, relative) !== 'approved') continue;
      const [, , dateKey = '', name = relative] = relative.split('/');
      const mime = object.httpMetadata?.contentType || 'application/octet-stream';
      rows.push({ name, path: relative, size: object.size, mime, source: 'daily-video', lane: 'approved', dateKey, kind: mediaKindOf(mime, name) });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return sortForGallery(rows).slice(0, APPROVED_MEDIA_LIMIT);
}

/** Daily videos waiting for approval, every day. Markers with no finished upload are skipped. */
async function listDailyReview(bucket: GymMediaBucket, actor: Actor): Promise<(CloudFileRow & { dateKey: string; lane: 'pending' })[]> {
  const base = `groups/${actor.licenseId}/`;
  const rows: (CloudFileRow & { dateKey: string; lane: 'pending' })[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: `${base}pending/daily/pending/`, cursor, limit: 1000 });
    for (const marker of listed.objects) {
      const parsed = parseDailyVideoMarkerPath(marker.key.slice(base.length));
      if (!parsed || parsed.lane !== 'pending') continue;
      const video = await bucket.head(`${base}${parsed.videoPath}`);
      if (!video) continue;
      rows.push({
        name: parsed.name,
        path: parsed.videoPath,
        size: video.size,
        mime: video.httpMetadata?.contentType || 'video/mp4',
        dateKey: parsed.dateKey,
        lane: 'pending',
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return sortForGallery(rows);
}

async function listGallery(
  bucket: GymMediaBucket,
  actor: Actor,
  lane: 'pending' | 'approved' | 'rejected',
  dateKey: string,
): Promise<CloudFileRow[]> {
  const files: CloudFileRow[] = [];
  const mediaKeyPrefix = `groups/${actor.licenseId}/gallery/${lane}/${dateKey ? `${dateKey}/` : ''}`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: mediaKeyPrefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = relativePath(actor.licenseId, object.key);
      const parsed = parseGalleryCloudPath(relative);
      if (!parsed || parsed.lane !== lane) continue;
      if (dateKey && parsed.dateKey !== dateKey) continue;
      files.push({
        name: parsed.name,
        path: relative,
        size: object.size,
        mime: object.httpMetadata?.contentType || 'application/octet-stream',
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return files;
}

async function listInstructor(
  bucket: GymMediaBucket,
  actor: Actor,
  kind: 'videos' | 'photos',
  dateKey: string,
  seatId: string,
): Promise<CloudFileRow[]> {
  const files: CloudFileRow[] = [];
  const mediaKeyPrefix = seatId
    ? `groups/${actor.licenseId}/instructors/${seatId}/${kind}/${dateKey ? `${dateKey}/` : ''}`
    : `groups/${actor.licenseId}/instructors/`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: mediaKeyPrefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = relativePath(actor.licenseId, object.key);
      const parsed = parseInstructorCloudPath(relative);
      if (!parsed || parsed.kind !== kind) continue;
      if (dateKey && parsed.dateKey !== dateKey) continue;
      if (seatId && parsed.seatId !== seatId) continue;
      files.push({
        name: parsed.name,
        path: relative,
        size: object.size,
        mime: object.httpMetadata?.contentType || 'application/octet-stream',
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return files;
}

type StartBody = {
  action?: string;
  purpose?: string;
  dateKey?: string;
  fileName?: string;
  size?: number;
  mime?: string;
  key?: string;
  keys?: unknown;
  studentId?: string;
  uploadId?: string;
  id?: string;
  parts?: { partNumber?: number; etag?: string }[];
  required?: boolean;
  days?: unknown;
};

function isPurpose(value: string): value is CloudMediaPurpose {
  return (
    value === 'daily-video' ||
    value === 'lesson' ||
    value === 'lesson-media' ||
    value === 'replay-pending' ||
    value === 'gallery' ||
    value === 'instructor-video' ||
    value === 'instructor-photo' ||
    value === 'from-instructor'
  );
}

/**
 * License-level Cloud approval. No row, a missing database, or a read
 * failure means approval is required, which is today's Cloud behavior.
 */
export async function licenseGalleryApprovalRequired(env: GymCloudEnv, licenseId: string): Promise<boolean> {
  const db = env.ENTITLEMENTS_DB;
  if (!db) return true;
  try {
    const row = await db
      .prepare(`SELECT required FROM gallery_approval WHERE license_id = ? LIMIT 1`)
      .bind(licenseId)
      .first<{ required: number | boolean | null }>();
    if (!row) return true;
    return row.required !== 0 && row.required !== false;
  } catch {
    return true;
  }
}

async function writeLicenseGalleryApproval(
  env: GymCloudEnv,
  licenseId: string,
  required: boolean,
  now: Date,
): Promise<'ok' | 'missing'> {
  const db = env.ENTITLEMENTS_DB;
  if (!db) return 'missing';
  try {
    await db
      .prepare(
        `INSERT INTO gallery_approval (license_id, required, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(license_id) DO UPDATE SET required = excluded.required, updated_at = excluded.updated_at`,
      )
      .bind(licenseId, required ? 1 : 0, now.toISOString())
      .run();
    return 'ok';
  } catch {
    return 'missing';
  }
}

/** Owner may write approved only. Seats may write the lane the license setting allows. */
async function refuseGalleryWrite(env: GymCloudEnv, actor: Actor, key: string): Promise<Response | null> {
  const parsed = parseGalleryCloudPath(relativePath(actor.licenseId, key));
  if (!parsed) return null;
  const approvalRequired = await licenseGalleryApprovalRequired(env, actor.licenseId);
  const lane = galleryUploadLane({ kind: actor.kind, preset: actor.preset, approvalRequired });
  if (lane !== parsed.lane) return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
  return null;
}

/**
 * A seat whose daily video must wait may only write bytes after `start`
 * left a pending marker. Without this, a direct op=put would skip review.
 */
async function refuseDailyWrite(env: GymCloudEnv, actor: Actor, key: string): Promise<Response | null> {
  const relative = relativePath(actor.licenseId, key);
  if (!isDailyVideoCloudPath(relative) || actor.kind === 'owner') return null;
  const lane = dailyVideoUploadLane({ kind: actor.kind, approvalRequired: await licenseGalleryApprovalRequired(env, actor.licenseId) });
  if (lane === 'approved') return null;
  const markerKey = dailyVideoMarkerKey(actor.licenseId, relative, 'pending');
  if (!markerKey || !env.GYM_MEDIA || !(await env.GYM_MEDIA.head(markerKey))) {
    return json(403, { ok: false, error: 'Start that upload again so it can wait for approval.' });
  }
  return null;
}

async function refuseFolderWrite(env: GymCloudEnv, actor: Actor, key: string): Promise<Response | null> {
  const gallery = await refuseGalleryWrite(env, actor, key);
  if (gallery) return gallery;
  const daily = await refuseDailyWrite(env, actor, key);
  if (daily) return daily;
  const relative = relativePath(actor.licenseId, key);
  const instructor = parseInstructorCloudPath(relative);
  if (instructor) {
    const allowed = instructorFolderAccess({
      kind: actor.kind,
      seatId: actor.seatId,
      targetSeatId: instructor.seatId,
      mode: 'write',
    });
    if (!allowed) return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
  }
  if (parseFromInstructorCloudPath(relative) && !canSendCloudFileToStudent({ kind: actor.kind, preset: actor.preset })) {
    return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
  }
  return null;
}

/** A pending-only seat may only write under its own pending prefix. */
function ownPendingKey(actor: Actor, key: string): boolean {
  if (!actor.seatId) return false;
  return key.startsWith(`groups/${actor.licenseId}/pending/replays/${actor.seatId}/`);
}

async function readStatus(bucket: GymMediaBucket, licenseId: string, path: string): Promise<PendingReplayStatus> {
  const statusPath = pendingStatusPath(path);
  const key = statusPath ? cloudObjectKey(licenseId, statusPath) : null;
  if (!key) return 'pending';
  const object = await bucket.get(key);
  if (!object) return 'pending';
  try {
    const parsed = JSON.parse(await new Response(object.body).text()) as { status?: string };
    return parsed.status === 'approved' || parsed.status === 'declined' ? parsed.status : 'pending';
  } catch {
    return 'pending';
  }
}

/** Owner: every seat's pending clips. A pending seat: only its own. Nobody else sees them. */
async function listPending(bucket: GymMediaBucket, actor: Actor): Promise<PendingReplayRow[]> {
  const base = `groups/${actor.licenseId}/`;
  const prefix = actor.kind === 'owner' ? `${base}pending/replays/` : `${base}pending/replays/${actor.seatId}/`;
  const rows: PendingReplayRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const path = object.key.slice(base.length);
      const parsed = parsePendingReplayPath(path);
      if (!parsed) continue;
      rows.push({
        path,
        ...parsed,
        size: object.size,
        mime: object.httpMetadata?.contentType || 'application/octet-stream',
        status: await readStatus(bucket, actor.licenseId, path),
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return rows;
}

function mimeAllowed(purpose: CloudMediaPurpose, mime: string): boolean {
  if (purpose === 'lesson') return mime === 'application/json';
  if (purpose === 'gallery') return mime.startsWith('image/') || mime.startsWith('video/');
  if (purpose === 'instructor-photo') return mime.startsWith('image/');
  if (purpose === 'instructor-video') return mime.startsWith('video/') || mime === 'application/octet-stream';
  if (purpose === 'from-instructor') {
    return mime.startsWith('video/') || mime.startsWith('image/') || mime === 'application/octet-stream' || mime === 'application/pdf';
  }
  if (purpose === 'daily-video') return mime.startsWith('video/') || mime === 'application/octet-stream';
  if (purpose === 'replay-pending') return mime.startsWith('video/') || mime.startsWith('image/');
  return mime.startsWith('video/') || mime.startsWith('image/') || mime === 'application/octet-stream';
}

const SKIN_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function relativePath(licenseId: string, key: string): string {
  const prefix = `groups/${licenseId}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : '';
}

async function countCustomSkins(bucket: GymMediaBucket, licenseId: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  const prefix = `groups/${licenseId}/skins/`;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      if (isCustomSkinImagePath(relativePath(licenseId, object.key))) count += 1;
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return count;
}

async function listCustomSkins(bucket: GymMediaBucket, licenseId: string): Promise<{ id: string; name: string; mime: string; bytes: number; updatedAt: number }[]> {
  const skins: { id: string; name: string; mime: string; bytes: number; updatedAt: number }[] = [];
  let cursor: string | undefined;
  const prefix = `groups/${licenseId}/skins/`;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = relativePath(licenseId, object.key);
      const id = isCustomSkinImagePath(relative) ? customSkinIdFromPath(relative) : null;
      if (!id) continue;
      let name = 'My skin';
      let updatedAt = 0;
      const metaKey = cloudObjectKey(licenseId, `skins/${id}.json`);
      if (metaKey) {
        const meta = await bucket.get(metaKey);
        if (meta) {
          try {
            const parsed = JSON.parse(await new Response(meta.body).text()) as { name?: unknown; updatedAt?: unknown };
            if (typeof parsed.name === 'string' && parsed.name.trim()) name = parsed.name.trim().slice(0, 40);
            if (typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)) updatedAt = parsed.updatedAt;
          } catch {
            /* a missing or broken name file still leaves the picture */
          }
        }
      }
      skins.push({
        id,
        name,
        mime: object.httpMetadata?.contentType || 'image/jpeg',
        bytes: object.size,
        updatedAt,
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return skins;
}

/** A class photo or daily video the owner (or an Instructors seat) may delete. */
export function deletableCloudMediaPath(path: string): { source: 'gallery' | 'daily-video'; dateKey: string; name: string } | null {
  if (isDailyVideoCloudPath(path)) {
    const parts = path.split('/');
    return { source: 'daily-video', dateKey: parts[2] ?? '', name: parts[3] ?? '' };
  }
  const gallery = parseGalleryCloudPath(path);
  if (gallery) return { source: 'gallery', dateKey: gallery.dateKey, name: gallery.name };
  return null;
}

function mediaObjectKey(licenseId: string, path: string): string | null {
  return deletableCloudMediaPath(path) ? cloudObjectKey(licenseId, path) : null;
}

/** The file plus daily-video markers, or every gallery lane copy of the same name. */
export function companionKeysForDelete(licenseId: string, path: string): string[] {
  const parsed = deletableCloudMediaPath(path);
  if (!parsed) return [];
  const keys: string[] = [];
  const add = (key: string | null) => {
    if (key && !keys.includes(key)) keys.push(key);
  };
  if (parsed.source === 'daily-video') {
    add(cloudObjectKey(licenseId, path));
    add(dailyVideoMarkerKey(licenseId, path, 'pending'));
    add(dailyVideoMarkerKey(licenseId, path, 'rejected'));
    return keys;
  }
  for (const lane of ['pending', 'approved', 'rejected'] as const) {
    const sibling = galleryCloudPath(lane, parsed.dateKey, parsed.name);
    add(sibling ? cloudObjectKey(licenseId, sibling) : null);
  }
  return keys;
}

async function abortLeftoverUploads(bucket: GymMediaBucket, keys: string[]): Promise<void> {
  if (!bucket.listMultipartUploads || keys.length === 0) return;
  const wanted = new Set(keys);
  const prefixes = new Set(keys.map((key) => key.slice(0, key.lastIndexOf('/') + 1) || key));
  for (const prefix of prefixes) {
    const listed = await bucket.listMultipartUploads({ prefix, limit: 1000 });
    for (const upload of listed.uploads) {
      if (!wanted.has(upload.key)) continue;
      try {
        await bucket.resumeMultipartUpload(upload.key, upload.uploadId).abort();
      } catch {
        // The upload may already have been completed or aborted.
      }
    }
  }
}

async function deleteKeyList(bucket: GymMediaBucket, keys: string[]): Promise<void> {
  if (!keys.length) return;
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await bucket.delete(keys.slice(offset, offset + 1000));
  }
  await abortLeftoverUploads(bucket, keys);
}

async function listOldVideos(bucket: GymMediaBucket, actor: Actor, cutoff: string): Promise<{ items: OldCloudVideo[]; count: number; totalBytes: number; truncated: boolean }> {
  const base = `groups/${actor.licenseId}/`;
  const matched: OldCloudVideo[] = [];
  const take = (row: OldCloudVideo) => {
    matched.push(row);
  };

  const lanes = await dailyLaneSets(bucket, actor.licenseId, '');
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: `${base}videos/daily/`, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = object.key.startsWith(base) ? object.key.slice(base.length) : '';
      if (!isDailyVideoCloudPath(relative) || !cloudObjectKey(actor.licenseId, relative)) continue;
      const dateKey = relative.split('/')[2] ?? '';
      if (!isOnOrBeforeDateKey(dateKey, cutoff)) continue;
      const lane = laneOfDaily(lanes, relative);
      if (lane === 'pending') continue;
      take({
        name: relative.split('/').pop() ?? relative,
        path: relative,
        size: object.size,
        mime: object.httpMetadata?.contentType || 'video/mp4',
        dateKey,
        source: 'daily-video',
        kind: 'video',
        lane: lane === 'rejected' ? 'rejected' : 'approved',
      });
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }

  for (const folder of ['approved', 'rejected'] as const) {
    cursor = undefined;
    for (let page = 0; page < 20; page += 1) {
      const listed = await bucket.list({ prefix: `${base}gallery/${folder}/`, cursor, limit: 1000 });
      for (const object of listed.objects) {
        const relative = object.key.startsWith(base) ? object.key.slice(base.length) : '';
        const parsed = parseGalleryCloudPath(relative);
        if (!parsed || !cloudObjectKey(actor.licenseId, relative)) continue;
        if (!isOnOrBeforeDateKey(parsed.dateKey, cutoff)) continue;
        if (mediaKindOf(object.httpMetadata?.contentType || '', parsed.name) !== 'video') continue;
        take({
          name: parsed.name,
          path: relative,
          size: object.size,
          mime: object.httpMetadata?.contentType || 'video/mp4',
          dateKey: parsed.dateKey,
          source: 'gallery',
          kind: 'video',
          lane: folder,
        });
      }
      if (!listed.truncated || !listed.cursor) break;
      cursor = listed.cursor;
    }
  }

  matched.sort((a, b) => (a.dateKey === b.dateKey ? a.name.localeCompare(b.name) : a.dateKey.localeCompare(b.dateKey)));
  const truncated = matched.length > OLD_VIDEO_LIST_MAX;
  const totalBytes = matched.reduce((sum, item) => sum + item.size, 0);
  return { items: matched.slice(0, OLD_VIDEO_LIST_MAX), count: matched.length, totalBytes, truncated };
}

export async function handleGymCloud(request: Request, env: GymCloudEnv, now: () => Date = () => new Date()): Promise<Response> {
  const bucket = env.GYM_MEDIA;
  if (!bucket) return json(503, { ok: false, reason: 'unbound', error: 'Advantage Cloud is not connected.' });
  const stamp = now();
  const actor = await readActor(request, env, stamp);
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const cap = cloudCapBytes(env.GYM_MEDIA_CAP_BYTES);
  const maxUpload = cloudMaxUploadBytes(env.GYM_MEDIA_MAX_UPLOAD_BYTES);

  if (request.method === 'GET') {
    const op = url.searchParams.get('op') ?? 'status';
    if (op === 'status') {
      if (!actor.read) {
        const pendingReplay = actor.replayUpload === 'pending';
        if (!actor.dailyDrop && !pendingReplay) return json(200, { ok: true, cloud: false });
        // Upload-only lanes. No usage numbers, no list, no files.
        return json(200, {
          ok: true,
          cloud: false,
          ...(pendingReplay ? { replayUpload: 'pending' as const } : {}),
          ...(actor.dailyDrop ? { dailyVideoDrop: true, dailyVideoPlay: true, maxUploadBytes: maxUpload } : {}),
        });
      }
      const [licenseUsedBytes, bucketUsedBytes, galleryApprovalRequired] = await Promise.all([
        bytesUnder(bucket, `groups/${actor.licenseId}/`),
        bytesUnder(bucket, ''),
        licenseGalleryApprovalRequired(env, actor.licenseId),
      ]);
      return json(200, {
        ok: true,
        cloud: true,
        canUpload: actor.upload,
        replayUpload: actor.replayUpload,
        galleryApprovalRequired,
        licenseUsedBytes,
        bucketUsedBytes,
        capBytes: cap,
        maxUploadBytes: maxUpload,
      });
    }
    if (op === 'gallery-approval') {
      const required = await licenseGalleryApprovalRequired(env, actor.licenseId);
      return json(200, { ok: true, required });
    }
    if (op === 'pending') {
      if (actor.kind !== 'owner' && actor.replayUpload !== 'pending') return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
      return json(200, { ok: true, pending: await listPending(bucket, actor) });
    }
    if (op === 'file' && (url.searchParams.get('path') ?? '').startsWith('pending/')) {
      const path = url.searchParams.get('path') ?? '';
      const key = cloudObjectKey(actor.licenseId, path);
      const allowed = actor.kind === 'owner' ? actor.read : actor.replayUpload === 'pending' && key !== null && ownPendingKey(actor, key);
      if (!key || !allowed || !parsePendingReplayPath(path)) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      const object = await bucket.get(key);
      if (!object) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      return fileResponse(object);
    }
    if (op === 'list' && url.searchParams.get('purpose') === 'instructor') {
      const kind = url.searchParams.get('kind') === 'photos' ? 'photos' : 'videos';
      const date = url.searchParams.get('date') ?? '';
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok: false, error: 'Choose a real date.' });
      const requestedSeat = url.searchParams.get('seat') ?? '';
      if (requestedSeat && !/^[A-Za-z0-9_-]{1,80}$/.test(requestedSeat)) {
        return json(400, { ok: false, error: 'That seat is not in this license.' });
      }
      if (actor.kind === 'seat' && requestedSeat && requestedSeat !== actor.seatId) {
        return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
      }
      if (actor.kind === 'seat' && !instructorFolderAccess({ kind: 'seat', seatId: actor.seatId, targetSeatId: actor.seatId, mode: 'read' })) {
        return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
      }
      const files = await listInstructor(bucket, actor, kind, date, actor.kind === 'owner' ? requestedSeat : actor.seatId);
      return json(200, { ok: true, files });
    }
    if (op === 'file') {
      const path = url.searchParams.get('path') ?? '';
      const instructor = parseInstructorCloudPath(path);
      const fromInstructor = parseFromInstructorCloudPath(path);
      if (instructor || fromInstructor) {
        const allowed = instructor
          ? instructorFolderAccess({ kind: actor.kind, seatId: actor.seatId, targetSeatId: instructor.seatId, mode: 'read' })
          : canSendCloudFileToStudent({ kind: actor.kind, preset: actor.preset });
        if (!allowed) return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
        const key = cloudObjectKey(actor.licenseId, path);
        if (!key) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
        const object = await bucket.get(key);
        if (!object) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
        return fileResponse(object);
      }
    }
    // The display gallery: approved class photos and approved daily videos, every day.
    if (op === 'list' && url.searchParams.get('purpose') === 'approved-media') {
      if (!actor.read && !actor.dailyDrop) return json(403, { ok: false, cloud: false, error: CLOUD_UNAVAILABLE_MESSAGE });
      return json(200, { ok: true, items: await listApprovedMedia(bucket, actor) });
    }
    if (op === 'list' && url.searchParams.get('purpose') === 'daily-review') {
      if (!actor.read || !galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset })) {
        return json(403, { ok: false, error: 'Only the owner or an Instructors seat can approve or reject.' });
      }
      return json(200, { ok: true, files: await listDailyReview(bucket, actor) });
    }
    if (op === 'list' && url.searchParams.get('purpose') === 'old-videos') {
      if (!actor.read || !galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset })) {
        return json(403, { ok: false, error: 'Only the owner or an Instructors seat can delete Cloud photos and videos.' });
      }
      const rawDays = url.searchParams.get('days');
      if (rawDays !== null && rawDays !== '' && !isVideoCleanupDays(Number(rawDays))) {
        return json(400, { ok: false, error: 'Choose 30, 60, 90, or 180 days.' });
      }
      const days = parseVideoCleanupDays(rawDays, DEFAULT_VIDEO_CLEANUP_DAYS);
      const cutoff = videoCleanupCutoffDate(days, stamp);
      const listed = await listOldVideos(bucket, actor, cutoff);
      return json(200, { ok: true, days, cutoff, ...listed });
    }
    // Program director Camera window: list and play today's videos only. Lessons, skins, and other paths stay closed.
    if (!actor.read && actor.dailyDrop && (op === 'list' || op === 'file')) {
      if (op === 'list') {
        if ((url.searchParams.get('purpose') ?? 'daily-video') !== 'daily-video') {
          return json(403, { ok: false, cloud: false, error: CLOUD_UNAVAILABLE_MESSAGE });
        }
        const files = await listFiles(bucket, actor, 'daily-video', url.searchParams.get('date') ?? '');
        if (files instanceof Response) return files;
        return json(200, { ok: true, files: files.filter((file) => isDailyVideoCloudPath(file.path)) });
      }
      const path = url.searchParams.get('path') ?? '';
      // Approved daily videos and approved class photos. Pending work stays closed.
      const approvedGallery = parseGalleryCloudPath(path)?.lane === 'approved';
      const key = isDailyVideoCloudPath(path) || approvedGallery ? cloudObjectKey(actor.licenseId, path) : null;
      if (!key) return json(403, { ok: false, cloud: false, error: CLOUD_UNAVAILABLE_MESSAGE });
      if (!approvedGallery && (await dailyVideoLane(bucket, actor.licenseId, path)) !== 'approved') {
        return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      }
      const object = await bucket.get(key);
      if (!object) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      return fileResponse(object);
    }
    if (!actor.read) return json(403, { ok: false, cloud: false, error: CLOUD_UNAVAILABLE_MESSAGE });
    if (op === 'list' && url.searchParams.get('purpose') === 'gallery') {
      const lane = url.searchParams.get('lane') ?? 'pending';
      if (lane !== 'pending' && lane !== 'approved' && lane !== 'rejected') {
        return json(400, { ok: false, error: 'Choose a gallery lane.' });
      }
      const date = url.searchParams.get('date') ?? '';
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok: false, error: 'Choose a real date.' });
      const files = await listGallery(bucket, actor, lane, date);
      return json(200, { ok: true, files });
    }
    if (op === 'list') {
      const purpose = url.searchParams.get('purpose') === 'lesson' ? 'lesson' : 'daily-video';
      // Approvers may ask for pending and rejected rows too, each tagged with its lane.
      const includeUnapproved =
        url.searchParams.get('lanes') === 'all' && galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset });
      const files = await listFiles(bucket, actor, purpose, url.searchParams.get('date') ?? '', includeUnapproved);
      if (files instanceof Response) return files;
      return json(200, { ok: true, files });
    }
    if (op === 'file') {
      const path = url.searchParams.get('path') ?? '';
      const key = ownedKey(actor, cloudObjectKey(actor.licenseId, path) ?? '');
      if (!key) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      if (
        isDailyVideoCloudPath(path) &&
        !galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset }) &&
        (await dailyVideoLane(bucket, actor.licenseId, path)) !== 'approved'
      ) {
        return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      }
      const object = await bucket.get(key);
      if (!object) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      return fileResponse(object);
    }
    if (op === 'skins') {
      return json(200, { ok: true, skins: await listCustomSkins(bucket, actor.licenseId) });
    }
    return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
  }

  /** Assistant coach / program director: replay clips and pictures only, and only as pending. */
  const pendingOnly = !actor.upload && actor.replayUpload === 'pending';
  if (!actor.upload && !actor.dailyDrop && !pendingOnly) {
    return json(403, { ok: false, error: actor.read ? CLOUD_ROLE_MESSAGE : CLOUD_UNAVAILABLE_MESSAGE });
  }
  /**
   * Upload-only actors touch only their lanes: daily-video keys (program director, #390)
   * and their own pending replay keys (assistant coach / program director, #387).
   */
  const dropOnly = !actor.upload;
  const dropRefused = () => json(403, { ok: false, error: CLOUD_DAILY_DROP_ONLY });
  const isDropKey = (key: string) => actor.dailyDrop && isDailyVideoCloudPath(relativePath(actor.licenseId, key));
  const isOwnPendingKey = (key: string) => pendingOnly && ownPendingKey(actor, key);
  const laneRefused = (key: string) =>
    !dropOnly || isDropKey(key) || isOwnPendingKey(key)
      ? null
      : pendingOnly && !actor.dailyDrop
        ? json(403, { ok: false, error: CLOUD_ROLE_MESSAGE })
        : dropRefused();

  if (request.method === 'PUT') {
    const key = ownedKey(actor, url.searchParams.get('key') ?? '');
    if (!key) return json(400, { ok: false, error: 'That file is not in this license.' });
    const refused = laneRefused(key);
    if (refused) return refused;
    const folderRefused = await refuseFolderWrite(env, actor, key);
    if (folderRefused) return folderRefused;
    const op = url.searchParams.get('op');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (op === 'part') {
      if (bytes.byteLength > CLOUD_CHUNK_BYTES) return json(413, { ok: false, error: cloudTooLargeMessage(maxUpload) });
      const partNumber = Number(url.searchParams.get('partNumber'));
      const uploadId = url.searchParams.get('uploadId') ?? '';
      if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
        return json(400, { ok: false, error: 'Advantage Cloud could not take that part.' });
      }
      try {
        const upload = bucket.resumeMultipartUpload(key, uploadId);
        const part = await upload.uploadPart(partNumber, bytes);
        return json(200, { ok: true, etag: part.etag, partNumber });
      } catch {
        return json(400, { ok: false, error: 'Advantage Cloud could not take that part.' });
      }
    }
    if (bytes.byteLength > maxUpload) return json(413, { ok: false, error: cloudTooLargeMessage(maxUpload) });
    const relative = relativePath(actor.licenseId, key);
    const mime = safeCloudMime(request.headers.get('content-type') ?? '', 'application/octet-stream');
    if (dropOnly && !isOwnPendingKey(key) && !mimeAllowed('daily-video', mime)) {
      return json(400, { ok: false, error: 'Daily videos are video files.' });
    }
    if (isCustomSkinImagePath(relative)) {
      if (!SKIN_IMAGE_MIME.has(mime)) return json(400, { ok: false, error: 'Use a JPG, PNG, or WebP.' });
      const existing = await bucket.head(key);
      if (!existing && (await countCustomSkins(bucket, actor.licenseId)) >= CUSTOM_SKIN_CLOUD_CAP) {
        return json(409, { ok: false, error: 'Delete one first.' });
      }
    }
    if (isCustomSkinMetaPath(relative) && bytes.byteLength > CUSTOM_SKIN_META_MAX_BYTES) {
      return json(413, { ok: false, error: 'That skin name is too large.' });
    }
    const room = await roomFor(bucket, key, bytes.byteLength, cap);
    if (!room.ok) return json(409, { ok: false, error: cloudFullMessage(room.bucketUsed, cap) });
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    return json(200, { ok: true });
  }

  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const raw = await request.text();
  if (raw.length > 200_000) return json(413, { ok: false, error: 'That upload request is too large.' });
  let body: StartBody = {};
  try {
    body = JSON.parse(raw) as StartBody;
  } catch {
    return json(400, { ok: false, error: 'Advantage Cloud could not read that upload.' });
  }

  if (body.action === 'approve' || body.action === 'decline') {
    if (actor.kind !== 'owner') return json(403, { ok: false, error: 'Only the head coach can approve or decline.' });
    const path = typeof body.key === 'string' ? body.key : '';
    const pendingKey = parsePendingReplayPath(path) ? cloudObjectKey(actor.licenseId, path) : null;
    const statusPath = pendingStatusPath(path);
    const statusKey = statusPath ? cloudObjectKey(actor.licenseId, statusPath) : null;
    if (!pendingKey || !statusKey) return json(400, { ok: false, error: 'That clip is not waiting for approval.' });
    const object = await bucket.head(pendingKey);
    if (!object) return json(404, { ok: false, error: 'That clip is not waiting for approval.' });
    let approvedPath: string | null = null;
    if (body.action === 'approve') {
      approvedPath = approvedReplayPath(path);
      const targetKey = approvedPath ? cloudObjectKey(actor.licenseId, approvedPath) : null;
      if (!approvedPath || !targetKey) return json(400, { ok: false, error: 'That clip cannot be approved.' });
      const room = await roomFor(bucket, targetKey, object.size, cap);
      if (!room.ok) return json(409, { ok: false, error: cloudFullMessage(room.bucketUsed, cap) });
      const copied = await copyGymObject(bucket, pendingKey, targetKey, object.size, object.httpMetadata?.contentType || 'video/mp4');
      if (!copied) return json(500, { ok: false, error: 'That clip could not be approved. Try again.' });
    }
    // Never deletes the pending object: the decision is a small marker beside it.
    const status: PendingReplayStatus = body.action === 'approve' ? 'approved' : 'declined';
    await bucket.put(statusKey, new TextEncoder().encode(JSON.stringify({ status, at: new Date().toISOString() })), {
      httpMetadata: { contentType: 'application/json' },
    });
    return json(200, { ok: true, status, ...(approvedPath ? { path: approvedPath } : {}) });
  }

  if (body.action === 'gallery-approval') {
    if (actor.kind !== 'owner') return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
    if (typeof body.required !== 'boolean') return json(400, { ok: false, error: 'Choose whether approval is required.' });
    const written = await writeLicenseGalleryApproval(env, actor.licenseId, body.required, stamp);
    if (written !== 'ok') {
      return json(503, {
        ok: false,
        error: 'Gallery approval storage is not set up yet. Apply migrations/0007_gallery_approval.sql.',
      });
    }
    return json(200, { ok: true, required: body.required });
  }

  if (body.action === 'gallery-approve' || body.action === 'gallery-reject') {
    if (!galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset })) {
      return json(403, { ok: false, error: 'Only the owner or an Instructors seat can approve or reject.' });
    }
    const path = typeof body.key === 'string' ? body.key : '';
    const sourceKey = parseGalleryCloudPath(path)?.lane === 'pending' ? cloudObjectKey(actor.licenseId, path) : null;
    if (!sourceKey) return json(400, { ok: false, error: 'That photo is not waiting for approval.' });
    const object = await bucket.head(sourceKey);
    if (!object) return json(404, { ok: false, error: 'That photo is not waiting for approval.' });
    if (body.action === 'gallery-reject') {
      // Reject deletes the pending file instead of parking a hidden copy.
      await deleteKeyList(bucket, companionKeysForDelete(actor.licenseId, path));
      return json(200, { ok: true, lane: 'rejected', deleted: true, path });
    }
    const targetPath = galleryDecisionPath(path, 'approved');
    const targetKey = targetPath ? cloudObjectKey(actor.licenseId, targetPath) : null;
    if (!targetKey || !targetPath) return json(400, { ok: false, error: 'That photo is not waiting for approval.' });
    const [bucketUsed, existing] = await Promise.all([bytesUnder(bucket, ''), bucket.head(targetKey)]);
    const next = bucketUsed - object.size - (existing?.size ?? 0) + object.size;
    if (next > cap) return json(409, { ok: false, error: cloudFullMessage(bucketUsed, cap) });
    // Copy first, delete second: a failed copy leaves the pending file where it was.
    const copied = await copyGymObject(bucket, sourceKey, targetKey, object.size, object.httpMetadata?.contentType || 'image/jpeg');
    if (!copied) return json(500, { ok: false, error: 'That did not save. Try again.' });
    await bucket.delete(sourceKey);
    return json(200, { ok: true, lane: 'approved', path: targetPath });
  }

  if (body.action === 'daily-approve' || body.action === 'daily-reject') {
    if (!galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset })) {
      return json(403, { ok: false, error: 'Only the owner or an Instructors seat can approve or reject.' });
    }
    const path = typeof body.key === 'string' ? body.key : '';
    const videoKey = isDailyVideoCloudPath(path) ? cloudObjectKey(actor.licenseId, path) : null;
    const pendingKey = videoKey ? dailyVideoMarkerKey(actor.licenseId, path, 'pending') : null;
    if (!videoKey || !pendingKey) return json(400, { ok: false, error: 'That video is not waiting for approval.' });
    const [video, marker] = await Promise.all([bucket.head(videoKey), bucket.head(pendingKey)]);
    if (!video || !marker) return json(404, { ok: false, error: 'That video is not waiting for approval.' });
    if (body.action === 'daily-reject') {
      // Reject deletes the video and its pending marker, instead of hiding a kept copy.
      await deleteKeyList(bucket, companionKeysForDelete(actor.licenseId, path));
      return json(200, { ok: true, lane: 'rejected', deleted: true, path });
    }
    // The video never moves. Approving removes the pending marker.
    await bucket.delete(pendingKey);
    return json(200, { ok: true, lane: 'approved', path });
  }

  if (body.action === 'delete-media') {
    if (!actor.read || !galleryDecisionAllowed({ kind: actor.kind, preset: actor.preset })) {
      return json(403, { ok: false, error: 'Only the owner or an Instructors seat can delete Cloud photos and videos.' });
    }
    const rawKeys = Array.isArray(body.keys) ? body.keys : typeof body.key === 'string' ? [body.key] : [];
    if (!rawKeys.length) return json(400, { ok: false, error: 'Choose a file to delete.' });
    if (rawKeys.length > MEDIA_DELETE_BATCH_MAX) {
      return json(400, { ok: false, error: `Delete up to ${MEDIA_DELETE_BATCH_MAX} files at a time.` });
    }
    const paths: string[] = [];
    const keys: string[] = [];
    for (const raw of rawKeys) {
      if (typeof raw !== 'string') return json(400, { ok: false, error: 'That file is not in this license.' });
      // Accept a license-relative path, or a full groups/{license}/ key for this license only.
      const prefix = `groups/${actor.licenseId}/`;
      const relative = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
      if (!mediaObjectKey(actor.licenseId, relative)) {
        return json(400, { ok: false, error: 'That file is not in this license.' });
      }
      paths.push(relative);
      for (const key of companionKeysForDelete(actor.licenseId, relative)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    await deleteKeyList(bucket, keys);
    const [licenseUsedBytes, bucketUsedBytes] = await Promise.all([
      bytesUnder(bucket, `groups/${actor.licenseId}/`),
      bytesUnder(bucket, ''),
    ]);
    return json(200, { ok: true, deleted: paths.length, licenseUsedBytes, bucketUsedBytes, capBytes: cap });
  }

  if (body.action === 'send-to-student') {
    if (!canSendCloudFileToStudent({ kind: actor.kind, preset: actor.preset })) {
      return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
    }
    const sourcePath = typeof body.key === 'string' ? body.key : '';
    if (!isDailyVideoCloudPath(sourcePath) && !isLessonMediaCloudPath(sourcePath)) {
      return json(400, { ok: false, error: 'Send a daily video or a lesson video.' });
    }
    const sourceKey = cloudObjectKey(actor.licenseId, sourcePath);
    if (isDailyVideoCloudPath(sourcePath) && (await dailyVideoLane(bucket, actor.licenseId, sourcePath)) !== 'approved') {
      return json(409, { ok: false, error: 'That video is waiting for approval.' });
    }
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    const dateKey = typeof body.dateKey === 'string' && body.dateKey ? body.dateKey : sourcePath.split('/').at(-2) ?? '';
    const fileName = sourcePath.split('/').pop() ?? '';
    const targetPath = fromInstructorCloudPath(studentId, dateKey, fileName);
    const targetKey = sourceKey && targetPath ? cloudObjectKey(actor.licenseId, targetPath) : null;
    if (!sourceKey || !targetKey || !targetPath) return json(400, { ok: false, error: 'Choose one student and a real date.' });
    const object = await bucket.head(sourceKey);
    if (!object) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
    const room = await roomFor(bucket, targetKey, object.size, cap);
    if (!room.ok) return json(409, { ok: false, error: cloudFullMessage(room.bucketUsed, cap) });
    const copied = await copyGymObject(bucket, sourceKey, targetKey, object.size, object.httpMetadata?.contentType || 'application/octet-stream');
    if (!copied) return json(500, { ok: false, error: 'That did not send. Try again.' });
    return json(200, { ok: true, path: targetPath });
  }

  if (dropOnly && body.action !== 'start' && body.action !== 'complete' && body.action !== 'abort') {
    return actor.dailyDrop ? dropRefused() : json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
  }

  if (body.action === 'delete-skin') {
    const id = typeof body.id === 'string' ? body.id : '';
    const imageKey = cloudObjectKey(actor.licenseId, `skins/${id}`);
    const metaKey = cloudObjectKey(actor.licenseId, `skins/${id}.json`);
    if (!imageKey || !metaKey) return json(400, { ok: false, error: 'That skin is not in this license.' });
    await bucket.delete(imageKey);
    await bucket.delete(metaKey);
    return json(200, { ok: true });
  }

  if (body.action === 'abort') {
    const key = ownedKey(actor, body.key ?? '');
    if (!key || !body.uploadId) return json(400, { ok: false, error: 'That upload is already closed.' });
    const refused = laneRefused(key);
    if (refused) return refused;
    const folderRefused = await refuseFolderWrite(env, actor, key);
    if (folderRefused) return folderRefused;
    await bucket.resumeMultipartUpload(key, body.uploadId).abort();
    await dropOrphanDailyMarker(bucket, actor.licenseId, key);
    return json(200, { ok: true });
  }

  if (body.action === 'complete') {
    const key = ownedKey(actor, body.key ?? '');
    if (!key || !body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return json(400, { ok: false, error: 'Advantage Cloud could not finish that file.' });
    }
    const refused = laneRefused(key);
    if (refused) return refused;
    const folderRefused = await refuseFolderWrite(env, actor, key);
    if (folderRefused) return folderRefused;
    const parts = body.parts
      .map((part) => ({ partNumber: Number(part.partNumber), etag: typeof part.etag === 'string' ? part.etag : '' }))
      .filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag)
      .sort((a, b) => a.partNumber - b.partNumber);
    if (!parts.length) return json(400, { ok: false, error: 'Advantage Cloud could not finish that file.' });
    const upload = bucket.resumeMultipartUpload(key, body.uploadId);
    try {
      await upload.complete(parts);
    } catch {
      return json(400, { ok: false, error: 'Advantage Cloud could not finish that file.' });
    }
    const saved = await bucket.head(key);
    const size = saved?.size ?? 0;
    if (size > maxUpload) {
      await bucket.delete(key);
      await dropOrphanDailyMarker(bucket, actor.licenseId, key);
      return json(413, { ok: false, error: cloudTooLargeMessage(maxUpload) });
    }
    const bucketUsed = await bytesUnder(bucket, '');
    if (bucketUsed > cap) {
      await bucket.delete(key);
      await dropOrphanDailyMarker(bucket, actor.licenseId, key);
      return json(409, { ok: false, error: cloudFullMessage(Math.max(0, bucketUsed - size), cap) });
    }
    return json(200, { ok: true });
  }

  if (body.action !== 'start') return json(400, { ok: false, error: 'Advantage Cloud could not read that upload.' });
  const purpose = typeof body.purpose === 'string' && isPurpose(body.purpose) ? body.purpose : null;
  const dateKey = typeof body.dateKey === 'string' ? body.dateKey : '';
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const size = typeof body.size === 'number' && Number.isFinite(body.size) ? Math.floor(body.size) : -1;
  if (!purpose || size < 1) return json(400, { ok: false, error: 'Choose a file.' });
  if (dropOnly) {
    const ownInstructor = purpose === 'instructor-video' || purpose === 'instructor-photo';
    const laneOk =
      (purpose === 'daily-video' && actor.dailyDrop) ||
      (purpose === 'replay-pending' && pendingOnly) ||
      (ownInstructor &&
        instructorFolderAccess({ kind: actor.kind, seatId: actor.seatId, targetSeatId: actor.seatId, mode: 'write' }));
    if (!laneOk) return actor.dailyDrop ? dropRefused() : json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
  }
  if (size > maxUpload) return json(413, { ok: false, error: cloudTooLargeMessage(maxUpload) });
  const mime = safeCloudMime(typeof body.mime === 'string' ? body.mime : '', purpose === 'lesson' ? 'application/json' : 'video/mp4');
  if (!mimeAllowed(purpose, mime)) {
    const error =
      purpose === 'daily-video'
        ? 'Daily videos are video files.'
        : purpose === 'gallery'
          ? 'Class photos are photo or video files.'
          : 'That file type cannot go in the lesson plan.';
    return json(400, { ok: false, error });
  }
  if (purpose === 'replay-pending' && actor.replayUpload !== 'pending') {
    return json(403, { ok: false, error: actor.replayUpload === 'direct' ? 'Save replays to lesson media.' : CLOUD_ROLE_MESSAGE });
  }
  if (purpose === 'gallery') {
    const approvalRequired = await licenseGalleryApprovalRequired(env, actor.licenseId);
    const lane = galleryUploadLane({ kind: actor.kind, preset: actor.preset, approvalRequired });
    if (!lane) return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
    const galleryPath = galleryCloudPath(lane, dateKey, fileName);
    const galleryKey = galleryPath ? cloudObjectKey(actor.licenseId, galleryPath) : null;
    if (!galleryPath || !galleryKey) return json(400, { ok: false, error: 'That file name cannot be saved.' });
    const galleryRoom = await roomFor(bucket, galleryKey, size, cap);
    if (!galleryRoom.ok) return json(409, { ok: false, error: cloudFullMessage(galleryRoom.bucketUsed, cap) });
    if (size > CLOUD_CHUNK_BYTES) {
      const upload = await bucket.createMultipartUpload(galleryKey, { httpMetadata: { contentType: mime } });
      return json(200, {
        ok: true,
        mode: 'multipart',
        key: galleryKey,
        path: galleryPath,
        uploadId: upload.uploadId,
        partSize: CLOUD_CHUNK_BYTES,
        lane,
      });
    }
    return json(200, { ok: true, mode: 'single', key: galleryKey, path: galleryPath, lane });
  }
  if (purpose === 'instructor-video' || purpose === 'instructor-photo') {
    const kind = purpose === 'instructor-video' ? 'videos' : 'photos';
    if (!instructorFolderAccess({ kind: actor.kind, seatId: actor.seatId, targetSeatId: actor.seatId, mode: 'write' })) {
      return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
    }
    const instructorPath = instructorCloudPath(actor.seatId, kind, dateKey, fileName);
    const instructorKey = instructorPath ? cloudObjectKey(actor.licenseId, instructorPath) : null;
    if (!instructorPath || !instructorKey) return json(400, { ok: false, error: 'That file name cannot be saved.' });
    const instructorRoom = await roomFor(bucket, instructorKey, size, cap);
    if (!instructorRoom.ok) return json(409, { ok: false, error: cloudFullMessage(instructorRoom.bucketUsed, cap) });
    if (size > CLOUD_CHUNK_BYTES) {
      const upload = await bucket.createMultipartUpload(instructorKey, { httpMetadata: { contentType: mime } });
      return json(200, { ok: true, mode: 'multipart', key: instructorKey, path: instructorPath, uploadId: upload.uploadId, partSize: CLOUD_CHUNK_BYTES });
    }
    return json(200, { ok: true, mode: 'single', key: instructorKey, path: instructorPath });
  }
  if (purpose === 'from-instructor') {
    if (!canSendCloudFileToStudent({ kind: actor.kind, preset: actor.preset })) {
      return json(403, { ok: false, error: CLOUD_ROLE_MESSAGE });
    }
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    const sentPath = fromInstructorCloudPath(studentId, dateKey, fileName);
    const sentKey = sentPath ? cloudObjectKey(actor.licenseId, sentPath) : null;
    if (!sentPath || !sentKey) return json(400, { ok: false, error: 'Choose one student and a real date.' });
    const sentRoom = await roomFor(bucket, sentKey, size, cap);
    if (!sentRoom.ok) return json(409, { ok: false, error: cloudFullMessage(sentRoom.bucketUsed, cap) });
    if (size > CLOUD_CHUNK_BYTES) {
      const upload = await bucket.createMultipartUpload(sentKey, { httpMetadata: { contentType: mime } });
      return json(200, { ok: true, mode: 'multipart', key: sentKey, path: sentPath, uploadId: upload.uploadId, partSize: CLOUD_CHUNK_BYTES });
    }
    return json(200, { ok: true, mode: 'single', key: sentKey, path: sentPath });
  }
  const relative =
    purpose === 'replay-pending'
      ? ((path: string | null) => (path ? { ok: true as const, path } : { ok: false as const, error: 'Choose a real date.' }))(
          pendingReplayPath(actor.seatId, dateKey, fileName),
        )
      : cloudRelativePath({
    purpose,
    role: gymActorForCloud(actor.kind, actor.preset),
    dateKey,
    fileName,
  });
  if (!relative.ok) return json(400, { ok: false, error: relative.error });
  const key = cloudObjectKey(actor.licenseId, relative.path);
  if (!key) return json(400, { ok: false, error: 'That file name cannot be saved.' });
  // A program director cannot see the folder, so never let a drop replace a coach's video.
  const dailyLane =
    purpose === 'daily-video'
      ? dailyVideoUploadLane({ kind: actor.kind, approvalRequired: await licenseGalleryApprovalRequired(env, actor.licenseId) })
      : null;
  // A pending upload must never replace a video that is already showing.
  if ((dropOnly || dailyLane === 'pending') && purpose === 'daily-video' && (await bucket.head(key))) {
    return json(409, { ok: false, error: "A video with that name is already in today's videos. Rename it and send again." });
  }
  const room = await roomFor(bucket, key, size, cap);
  if (!room.ok) return json(409, { ok: false, error: cloudFullMessage(room.bucketUsed, cap) });
  if (dailyLane) {
    const pendingMarker = dailyVideoMarkerKey(actor.licenseId, relative.path, 'pending');
    const rejectedMarker = dailyVideoMarkerKey(actor.licenseId, relative.path, 'rejected');
    if (!pendingMarker || !rejectedMarker) return json(400, { ok: false, error: 'That file name cannot be saved.' });
    if (dailyLane === 'pending') {
      // The marker is written before any bytes, so the video is hidden from its first byte.
      await bucket.put(
        pendingMarker,
        new TextEncoder().encode(JSON.stringify({ lane: 'pending', seat: actor.seatId, at: stamp.toISOString() })),
        { httpMetadata: { contentType: 'application/json' } },
      );
    } else {
      // The owner (or a seat with approval off) re-sending a name is approved as sent.
      await Promise.all([bucket.delete(pendingMarker), bucket.delete(rejectedMarker)]);
    }
  }
  const laneField = dailyLane ? { lane: dailyLane } : {};
  const plan = size > CLOUD_CHUNK_BYTES ? 'multipart' : 'single';
  if (plan === 'single') {
    return json(200, { ok: true, mode: 'single', key, path: relative.path, ...laneField });
  }
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
  return json(200, {
    ok: true,
    mode: 'multipart',
    key,
    path: relative.path,
    uploadId: upload.uploadId,
    partSize: CLOUD_CHUNK_BYTES,
    ...laneField,
  });
}
