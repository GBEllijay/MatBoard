/**
 * Signed-in Advantage Cloud files for one license.
 * The browser never receives a public bucket URL.
 * Gallery reads stay on functions/api/gym/media.ts.
 */

import {
  CLOUD_CHUNK_BYTES,
  CLOUD_ROLE_MESSAGE,
  CLOUD_SIGN_IN_MESSAGE,
  CLOUD_UNAVAILABLE_MESSAGE,
  cloudCapBytes,
  cloudFullMessage,
  cloudListPrefix,
  cloudMaxUploadBytes,
  cloudMediaAccess,
  cloudObjectKey,
  cloudRelativePath,
  cloudTooLargeMessage,
  claimsOpenPlusCloud,
  grantRowOpensPlusCloud,
  gymActorForCloud,
  safeCloudMime,
  type CloudFileRow,
  type CloudMediaPurpose,
} from '../lib/advantageCloudMedia.ts';
import { verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { grantOpen, grantsForLicense } from './purchaseRecords.ts';
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
  get(key: string): Promise<GymMediaObject | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: R2HttpMetadata }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string; size: number; httpMetadata?: R2HttpMetadata }[];
    truncated: boolean;
    cursor?: string;
  }>;
  createMultipartUpload(key: string, options?: { httpMetadata?: R2HttpMetadata }): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
};

export type GymCloudEnv = {
  GYM_MEDIA?: GymMediaBucket;
  GYM_MEDIA_CAP_BYTES?: string;
  GYM_MEDIA_MAX_UPLOAD_BYTES?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  ENTITLEMENTS_DB?: D1Database | null;
};

type Actor = {
  licenseId: string;
  kind: 'owner' | 'seat';
  preset: string | null;
  read: boolean;
  upload: boolean;
};

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

async function licenseHasPlusCloud(env: GymCloudEnv, licenseId: string, now: Date): Promise<boolean> {
  if (licenseId === 'owner-test') return true;
  const db = env.ENTITLEMENTS_DB;
  if (!db) return false;
  try {
    const grants = await grantsForLicense(db, licenseId, now);
    return grants.some((row) => grantRowOpensPlusCloud(row) && grantOpen(row, now));
  } catch {
    return false;
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
  const seat = claims.src === 'seat' || claims.tier === 'seat';
  const licenseId = seat ? claims.gym || claims.sub : claims.sub;
  if (!licenseId) return json(401, { ok: false, error: CLOUD_SIGN_IN_MESSAGE });
  const plusCloud = seat ? await licenseHasPlusCloud(env, licenseId, now) : claimsOpenPlusCloud(claims);
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

async function listFiles(bucket: GymMediaBucket, actor: Actor, purpose: 'daily-video' | 'lesson', dateKey: string): Promise<CloudFileRow[] | Response> {
  const prefix = cloudListPrefix(purpose, dateKey);
  if (!prefix) return json(400, { ok: false, error: 'Choose a real date.' });
  const files: CloudFileRow[] = [];
  const mediaKeyPrefix = `groups/${actor.licenseId}/${prefix.media}`;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await bucket.list({ prefix: mediaKeyPrefix, cursor, limit: 1000 });
    for (const object of listed.objects) {
      const relative = object.key.startsWith(`groups/${actor.licenseId}/`)
        ? object.key.slice(`groups/${actor.licenseId}/`.length)
        : '';
      if (!cloudObjectKey(actor.licenseId, relative)) continue;
      files.push({
        name: relative.split('/').pop() ?? relative,
        path: relative,
        size: object.size,
        mime: object.httpMetadata?.contentType || 'application/octet-stream',
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

type StartBody = {
  action?: string;
  purpose?: string;
  dateKey?: string;
  fileName?: string;
  size?: number;
  mime?: string;
  key?: string;
  uploadId?: string;
  parts?: { partNumber?: number; etag?: string }[];
};

function isPurpose(value: string): value is CloudMediaPurpose {
  return value === 'daily-video' || value === 'lesson' || value === 'lesson-media';
}

function mimeAllowed(purpose: CloudMediaPurpose, mime: string): boolean {
  if (purpose === 'lesson') return mime === 'application/json';
  if (purpose === 'daily-video') return mime.startsWith('video/') || mime === 'application/octet-stream';
  return mime.startsWith('video/') || mime.startsWith('image/') || mime === 'application/octet-stream';
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
      if (!actor.read) return json(200, { ok: true, cloud: false });
      const [licenseUsedBytes, bucketUsedBytes] = await Promise.all([
        bytesUnder(bucket, `groups/${actor.licenseId}/`),
        bytesUnder(bucket, ''),
      ]);
      return json(200, {
        ok: true,
        cloud: true,
        canUpload: actor.upload,
        licenseUsedBytes,
        bucketUsedBytes,
        capBytes: cap,
        maxUploadBytes: maxUpload,
      });
    }
    if (!actor.read) return json(403, { ok: false, cloud: false, error: CLOUD_UNAVAILABLE_MESSAGE });
    if (op === 'list') {
      const purpose = url.searchParams.get('purpose') === 'lesson' ? 'lesson' : 'daily-video';
      const files = await listFiles(bucket, actor, purpose, url.searchParams.get('date') ?? '');
      if (files instanceof Response) return files;
      return json(200, { ok: true, files });
    }
    if (op === 'file') {
      const key = ownedKey(actor, cloudObjectKey(actor.licenseId, url.searchParams.get('path') ?? '') ?? '');
      if (!key) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      const object = await bucket.get(key);
      if (!object) return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
      return fileResponse(object);
    }
    return json(404, { ok: false, error: 'That file is not in Advantage Cloud.' });
  }

  if (!actor.upload) {
    return json(403, { ok: false, error: actor.read ? CLOUD_ROLE_MESSAGE : CLOUD_UNAVAILABLE_MESSAGE });
  }

  if (request.method === 'PUT') {
    const key = ownedKey(actor, url.searchParams.get('key') ?? '');
    if (!key) return json(400, { ok: false, error: 'That file is not in this license.' });
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
    const room = await roomFor(bucket, key, bytes.byteLength, cap);
    if (!room.ok) return json(409, { ok: false, error: cloudFullMessage(room.bucketUsed, cap) });
    const mime = safeCloudMime(request.headers.get('content-type') ?? '', 'application/octet-stream');
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

  if (body.action === 'abort') {
    const key = ownedKey(actor, body.key ?? '');
    if (!key || !body.uploadId) return json(400, { ok: false, error: 'That upload is already closed.' });
    await bucket.resumeMultipartUpload(key, body.uploadId).abort();
    return json(200, { ok: true });
  }

  if (body.action === 'complete') {
    const key = ownedKey(actor, body.key ?? '');
    if (!key || !body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return json(400, { ok: false, error: 'Advantage Cloud could not finish that file.' });
    }
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
      return json(413, { ok: false, error: cloudTooLargeMessage(maxUpload) });
    }
    const bucketUsed = await bytesUnder(bucket, '');
    if (bucketUsed > cap) {
      await bucket.delete(key);
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
  if (size > maxUpload) return json(413, { ok: false, error: cloudTooLargeMessage(maxUpload) });
  const mime = safeCloudMime(typeof body.mime === 'string' ? body.mime : '', purpose === 'lesson' ? 'application/json' : 'video/mp4');
  if (!mimeAllowed(purpose, mime)) {
    return json(400, { ok: false, error: purpose === 'daily-video' ? 'Daily videos are video files.' : 'That file type cannot go in the lesson plan.' });
  }
  const relative = cloudRelativePath({
    purpose,
    role: gymActorForCloud(actor.kind, actor.preset),
    dateKey,
    fileName,
  });
  if (!relative.ok) return json(400, { ok: false, error: relative.error });
  const key = cloudObjectKey(actor.licenseId, relative.path);
  if (!key) return json(400, { ok: false, error: 'That file name cannot be saved.' });
  const room = await roomFor(bucket, key, size, cap);
  if (!room.ok) return json(409, { ok: false, error: cloudFullMessage(room.bucketUsed, cap) });
  const plan = size > CLOUD_CHUNK_BYTES ? 'multipart' : 'single';
  if (plan === 'single') {
    return json(200, { ok: true, mode: 'single', key, path: relative.path });
  }
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
  return json(200, {
    ok: true,
    mode: 'multipart',
    key,
    path: relative.path,
    uploadId: upload.uploadId,
    partSize: CLOUD_CHUNK_BYTES,
  });
}
