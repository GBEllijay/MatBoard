/**
 * Advantage Cloud profile backup. GET/PUT /api/profile-backup.
 *
 * Every buyer's license gets one small JSON file in the existing GYM_MEDIA
 * bucket, next to that license's other Advantage Cloud files:
 *
 *   groups/{licenseId}/profiles/backup.json
 *
 * Authentication is the device's signed entitlement pass (Bearer), the same
 * pass the app already keeps after checkout, restore, a code, or sign-in, so
 * no password login is needed and no Plus Cloud add-on is needed. The file is
 * always the pass's own license (`sub`):
 * - Buyers (Student, Instructor, Pro, Media...) and free Student licenses
 *   read and write only their own file. A free Student license has its own
 *   license id, so it never lands in the academy's folder.
 * - Coach and instructor seats are refused. A seat can never read or write a
 *   student's or the owner's profile backup, so no belt, stripe, or promotion
 *   can flow from an instructor into a student's card through this path.
 * - A refunded or revoked license (every grant row closed) is refused.
 *
 * Small JSON only (PROFILE_BACKUP_MAX_BYTES). Photos, logos, and videos are
 * dropped before writing. No D1 writes and no migration. Nothing is deleted:
 * a PUT merges into the stored file and keeps profiles the device did not send.
 */

import {
  PROFILE_BACKUP_MAX_BYTES,
  mergeProfileBackup,
  profileBackupIsEmpty,
  profileBackupKey,
  sanitizeProfileBackup,
  type ProfileBackupDoc,
} from '../lib/profileBackupDoc.ts';
import { verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { grantOpen, type StoredGrant } from './purchaseRecords.ts';
import type { InboxBucket } from './studentInbox.ts';
import { signingMaterial } from './tokenIssue.ts';

export const PROFILE_BACKUP_BODY_MAX_CHARS = 400_000;
export const PROFILE_BACKUP_SIGN_IN = 'Open Advantage on this device with your purchase first.';
export const PROFILE_BACKUP_SEAT_REFUSED = 'Profile backup is for the buyer’s own profiles. Instructor seats do not use it.';

export type ProfileBackupEnv = {
  GYM_MEDIA?: InboxBucket;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  ENTITLEMENTS_DB?: D1Database | null;
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(request: Request): string {
  const match = /^Bearer\s+(\S+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  return match?.[1] ?? '';
}

function crossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

/** Seats never own a profile backup. */
export function claimsOwnProfileBackup(claims: Pick<EntitlementClaims, 'src' | 'tier' | 'grants' | 'sub'>): boolean {
  if (claims.src === 'seat' || claims.tier === 'seat') return false;
  if (!claims.sub || !Array.isArray(claims.grants) || claims.grants.length === 0) return false;
  return true;
}

/** 'closed' only when the license has grant rows and every one is closed (refund or revoke). */
async function licenseState(db: D1Database | null | undefined, licenseId: string, now: Date): Promise<'open' | 'closed' | 'unread'> {
  if (!db || licenseId === 'owner-test') return 'open';
  try {
    const rows = await db
      .prepare(
        `SELECT license_id AS licenseId, product, source, source_ref AS sourceRef, status, ends_at AS endsAt, revoked_at AS revokedAt
         FROM grants WHERE license_id = ?`,
      )
      .bind(licenseId)
      .all<StoredGrant>();
    const list = rows.results ?? [];
    if (list.length === 0) return 'open';
    return list.some((row) => grantOpen(row, now)) ? 'open' : 'closed';
  } catch {
    return 'unread';
  }
}

async function objectText(object: { text?: () => Promise<string>; body?: ReadableStream | null }): Promise<string> {
  if (typeof object.text === 'function') return object.text();
  if (object.body) return new Response(object.body).text();
  return '';
}

async function readStored(bucket: InboxBucket, key: string): Promise<ProfileBackupDoc | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const raw = await objectText(object as { text?: () => Promise<string>; body?: ReadableStream | null });
    return raw ? sanitizeProfileBackup(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export async function handleProfileBackup(
  request: Request,
  env: ProfileBackupEnv,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'PUT') return json(405, { ok: false, error: 'Method not allowed.' });
  if (request.method === 'PUT' && crossSite(request)) return json(403, { ok: false, error: 'Forbidden.' });
  const bucket = env.GYM_MEDIA;
  if (!bucket) return json(503, { ok: false, error: 'Advantage Cloud storage is not bound.', unbound: true });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Sign-in is not set up yet.' });

  const token = bearer(request);
  if (!token) return json(401, { ok: false, error: PROFILE_BACKUP_SIGN_IN });
  const claims = await verifyToken(token, [{ kid: material.kid, jwk: material.publicJwk }]);
  const at = now();
  const seconds = Math.floor(at.getTime() / 1000);
  if (!claims || claims.exp <= seconds || claims.nbf > seconds + 300) return json(401, { ok: false, error: PROFILE_BACKUP_SIGN_IN });
  if (claims.src === 'seat' || claims.tier === 'seat') return json(403, { ok: false, error: PROFILE_BACKUP_SEAT_REFUSED });
  if (!claimsOwnProfileBackup(claims)) return json(403, { ok: false, error: PROFILE_BACKUP_SIGN_IN });

  const key = profileBackupKey(claims.sub);
  if (!key) return json(400, { ok: false, error: 'Unknown license.' });
  const state = await licenseState(env.ENTITLEMENTS_DB, claims.sub, at);
  if (state === 'unread') return json(503, { ok: false, error: 'Advantage Cloud could not be checked. Nothing on this device was changed.' });
  if (state === 'closed') return json(403, { ok: false, error: 'This purchase is no longer active.' });

  const stored = await readStored(bucket, key);
  if (request.method === 'GET') return json(200, { ok: true, backup: stored });

  const raw = await request.text();
  if (raw.length > PROFILE_BACKUP_BODY_MAX_CHARS) return json(413, { ok: false, error: 'That profile is too large to back up.' });
  let parsed: unknown;
  try {
    parsed = raw.trim() ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return json(400, { ok: false, error: 'That profile could not be read.' });
  }
  const body = parsed && typeof parsed === 'object' ? (parsed as { backup?: unknown }).backup ?? parsed : null;
  const incoming = sanitizeProfileBackup(body);
  if (!incoming) return json(400, { ok: false, error: 'That profile could not be read.' });
  // A blank device never replaces a stored backup.
  if (profileBackupIsEmpty(incoming)) return json(200, { ok: true, backup: stored, saved: false });

  const next = mergeProfileBackup(incoming, stored);
  const text = JSON.stringify(next);
  if (new TextEncoder().encode(text).byteLength > PROFILE_BACKUP_MAX_BYTES) {
    return json(413, { ok: false, error: 'That profile is too large to back up.' });
  }
  await bucket.put(key, text, { httpMetadata: { contentType: 'application/json' } });
  return json(200, { ok: true, backup: next, saved: true });
}
