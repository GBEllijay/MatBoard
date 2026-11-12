/**
 * Owner-issued free Student Edition licenses.
 *
 * One row in student_codes (migrations/0003_pro_bundle.sql, already in production).
 * No new table and no new column. The claim code is the primary key. The student's
 * email is stored only as the existing identities hash so Restore can find it.
 * Revoke sets status to revoked and, once claimed, inactivates that grant.
 * That ends academy access for the code. The student's own journal, photos, and backup stay theirs.
 * A revoked code stays revoked. The seat returns to the pool of 5 either way.
 */

import { appVersionOf } from '../lib/appCapability.ts';
import { readSignedJson, signJson, verifyToken, type EntitlementClaims } from '../lib/entitlementToken.ts';
import {
  FREE_STUDENT_LICENSES,
  STUDENT_LICENSE_EMPTY,
  STUDENT_LICENSE_OWNER_ONLY,
  STUDENT_INVITE_TYP,
  STUDENT_LICENSE_PRESET,
  STUDENT_LICENSE_REVOKED_MESSAGE,
  STUDENT_LICENSE_TAKEN_MESSAGE,
  freeStudentLicensesLeft,
  isStudentLicenseCode,
  studentLicenseSourceRef,
} from '../lib/studentLicensePool.ts';
import { grantRowOpensPlusCloud } from '../lib/advantageCloudMedia.ts';
import type { D1Database } from './d1.ts';
import { isCloudGrantProduct } from './cloudSubscription.ts';
import { expandGrants } from './grantMatrix.ts';
import { API_PRODUCT_STUDENT } from './routes.ts';
import { grantOpen, grantsForLicense, recordPurchase, type StoredGrant } from './purchaseRecords.ts';
import { readHalfOffCode } from './proBundle.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const SETUP_MESSAGE = 'Free Student licenses are not set up on this site yet.';
const RESTORE_EMAIL_MESSAGE = 'This site cannot save a restore email yet.';
const EMAIL_REQUIRED = 'Enter the email you will use inside the installed app.';
const SIGNING_MESSAGE = 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.';
const STORAGE_MESSAGE = 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.';
const INVALID_CODE = 'This link is not a free Student license.';
const ALREADY_REVOKED = 'That code was already revoked. Issue a new one.';

export type StudentLicenseEnv = {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  CODE_HASH_PEPPER?: string;
};

type CodeRow = {
  code: string;
  licenseId: string;
  status: string;
  claimedDevice: string | null;
  createdAt: string;
};

type Caller = { role: 'owner' | 'seat'; licenseId: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function missingStudentCodes(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message) && message.includes('student_codes');
}

async function readBody(request: Request, limit: number): Promise<Record<string, unknown> | Response> {
  const raw = await request.text();
  if (raw.length > limit) return json(413, { ok: false, error: 'That request is too large.' });
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { ok: false, error: 'Request body must be JSON.' });
    return parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'Request body must be JSON.' });
  }
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (!email || email.length > 320 || !email.includes('@') || /\s/.test(email)) return null;
  return email;
}

function cleanDevice(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return crypto.randomUUID();
  return value.trim().slice(0, 80);
}

function mintCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Signed student invite. No exp: the link works until it is claimed or revoked. Single-use. */
async function signStudentInvite(env: StudentLicenseEnv, input: { code: string; gym: string }): Promise<string | null> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return null;
  return signJson(material.kid, { typ: STUDENT_INVITE_TYP, code: input.code, gym: input.gym, v: 1 }, material.privateJwk);
}

type StudentInvitePayload = { typ?: string; code?: string; gym?: string; v?: number };

async function readStudentInviteCode(raw: unknown, env: StudentLicenseEnv): Promise<string | null> {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (isStudentLicenseCode(value.toLowerCase())) return value.toLowerCase();
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return null;
  const parsed = await readSignedJson(value, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as StudentInvitePayload;
  if (row.typ !== STUDENT_INVITE_TYP) return null;
  const code = typeof row.code === 'string' ? row.code.trim().toLowerCase() : '';
  return isStudentLicenseCode(code) ? code : null;
}

async function verifyCaller(requestToken: unknown, env: StudentLicenseEnv): Promise<EntitlementClaims | Response> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: SIGNING_MESSAGE });
  if (typeof requestToken !== 'string' || !requestToken.trim()) {
    return json(400, { ok: false, error: 'This device needs to restore access.' });
  }
  const claims = await verifyToken(requestToken, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(400, { ok: false, error: 'This device needs to restore access.' });
  return claims;
}

async function seatIsActive(db: D1Database, licenseId: string, seatId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT status, revoked_at AS revokedAt FROM seats WHERE id = ? AND gym_license_id = ? LIMIT 1`)
    .bind(seatId, licenseId)
    .first<{ status: string; revokedAt: string | null }>();
  if (!row || row.revokedAt) return false;
  return row.status === 'claimed' || row.status === 'active';
}

async function readCaller(
  claims: EntitlementClaims,
  db: D1Database,
  allowSeat: boolean,
  allowCoachOwner = false,
): Promise<Caller | Response> {
  if (claims.subs?.state === 'locked') return json(403, { ok: false, error: STUDENT_LICENSE_OWNER_ONLY });
  const seat = claims.src === 'seat' || claims.tier === 'seat';
  if (seat) {
    if (!allowSeat) return json(403, { ok: false, error: STUDENT_LICENSE_OWNER_ONLY });
    const gym = claims.gym ?? '';
    const seatId = claims.sid ?? '';
    if (!gym || !seatId || !(await seatIsActive(db, gym, seatId))) {
      return json(403, { ok: false, error: STUDENT_LICENSE_OWNER_ONLY });
    }
    return { role: 'seat', licenseId: gym };
  }
  if (!claims.grants.includes('pro')) {
    // Instructor Edition owns its own half-off code. It does not own Pro's free pool.
    if (allowCoachOwner && claims.grants.includes('coach') && claims.sub && claims.src !== 'seat' && claims.tier !== 'seat') {
      return { role: 'owner', licenseId: claims.sub };
    }
    return json(403, { ok: false, error: STUDENT_LICENSE_OWNER_ONLY });
  }
  if (!claims.sub) return json(403, { ok: false, error: STUDENT_LICENSE_OWNER_ONLY });
  return { role: 'owner', licenseId: claims.sub };
}

async function occupiedCount(db: D1Database, licenseId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM student_codes
       WHERE license_id = ? AND status IN ('issued', 'claimed')`,
    )
    .bind(licenseId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

async function readCode(db: D1Database, code: string): Promise<CodeRow | null> {
  return db
    .prepare(
      `SELECT code, license_id AS licenseId, status, claimed_device AS claimedDevice, created_at AS createdAt
       FROM student_codes WHERE code = ?`,
    )
    .bind(code)
    .first<CodeRow>();
}

export async function gymHasCloud(db: D1Database, licenseId: string, now: Date): Promise<boolean> {
  if (licenseId === 'owner-test') return true;
  try {
    const grants = await grantsForLicense(db, licenseId, now);
    return grants.some((row) => grantRowOpensPlusCloud(row) || isCloudGrantProduct(row.product));
  } catch {
    return false;
  }
}

async function signInboxPass(env: StudentLicenseEnv, gym: string, studentId: string, now: Date): Promise<string | null> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return null;
  const exp = Math.floor(now.getTime() / 1000) + 180 * 24 * 60 * 60;
  return signJson(material.kid, { typ: 'student-inbox', v: 1, gym, studentId, exp }, material.privateJwk);
}

async function issueStudentToken(
  env: StudentLicenseEnv,
  input: { studentLicenseId: string; gymLicenseId: string; deviceId: string; now: Date; request: Request },
): Promise<string | null> {
  return issueToken(
    env.ENTITLEMENT_SIGNING_KEY,
    {
      licenseId: input.studentLicenseId,
      grants: expandGrants(['student']),
      tier: 'student',
      src: 'free',
      deviceId: input.deviceId,
      now: input.now,
      kind: 'onetime',
      gym: input.gymLicenseId,
      preset: STUDENT_LICENSE_PRESET,
      appVersion: appVersionOf(input.request),
    },
    env.ENTITLEMENT_KEY_ID,
  );
}

type GrantLookup = StoredGrant;

async function readStudentGrant(db: D1Database, code: string): Promise<GrantLookup | null> {
  return db
    .prepare(
      `SELECT license_id AS licenseId, product, source, source_ref AS sourceRef, status, ends_at AS endsAt, revoked_at AS revokedAt
       FROM grants WHERE source = 'free' AND source_ref = ? AND product = ? LIMIT 1`,
    )
    .bind(studentLicenseSourceRef(code), API_PRODUCT_STUDENT)
    .first<GrantLookup>();
}

/** Create the grant once. A dead grant stays dead. Returns null when it must not be reopened. */
async function ensureGrant(
  db: D1Database,
  env: StudentLicenseEnv,
  code: string,
  email: string,
  now: Date,
): Promise<string | null> {
  const existing = await readStudentGrant(db, code);
  if (existing) return grantOpen(existing, now) ? existing.licenseId : null;
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  if (!pepper || !email) return null;
  const recorded = await recordPurchase(db, {
    email,
    product: API_PRODUCT_STUDENT,
    source: 'free',
    sourceRef: studentLicenseSourceRef(code),
    sessionId: studentLicenseSourceRef(code),
    pepper,
    now,
    status: 'active',
  });
  return recorded.licenseId;
}

async function claimPayload(
  db: D1Database,
  env: StudentLicenseEnv,
  row: CodeRow,
  studentLicenseId: string,
  deviceId: string,
  now: Date,
  request: Request,
): Promise<Response> {
  const token = await issueStudentToken(env, {
    studentLicenseId,
    gymLicenseId: row.licenseId,
    deviceId,
    now,
    request,
  });
  if (!token) return json(503, { ok: false, error: SIGNING_MESSAGE });
  const cloud = await gymHasCloud(db, row.licenseId, now);
  const studentPass = cloud ? await signInboxPass(env, row.licenseId, studentLicenseId, now) : null;
  return json(200, {
    ok: true,
    token,
    grants: ['student'],
    gymId: row.licenseId,
    deviceId,
    cloud,
    ...(studentPass ? { studentPass } : {}),
  });
}

async function halfOffForOwner(db: D1Database, licenseId: string): Promise<{ code: string; usesLeft: number; maxUses: number } | null> {
  const row = await readHalfOffCode(db, licenseId);
  if (!row) return null;
  return {
    code: row.code,
    maxUses: row.maxUses,
    usesLeft: Math.max(0, row.maxUses - row.instructorUses - row.studentUses),
    ...(typeof row.percentOff === 'number' ? { percentOff: row.percentOff } : {}),
  };
}

function poolBody(occupied: number): { left: number; cap: number } {
  return { left: freeStudentLicensesLeft(occupied), cap: FREE_STUDENT_LICENSES };
}

export async function handleStudentLicenseIssue(
  request: Request,
  env: StudentLicenseEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: STORAGE_MESSAGE });
  const body = await readBody(request, 8_000);
  if (body instanceof Response) return body;
  const verified = await verifyCaller(body.token, env);
  if (verified instanceof Response) return verified;
  try {
    const caller = await readCaller(verified, db, false);
    if (caller instanceof Response) return caller;
    const stamp = now().toISOString();
    const code = mintCode();
    const inserted = await db
      .prepare(
        `INSERT INTO student_codes (code, license_id, issuing_seat_id, status, claimed_device, created_at)
         SELECT ?, ?, NULL, 'issued', NULL, ?
         WHERE (
           SELECT COUNT(*) FROM student_codes
           WHERE license_id = ? AND status IN ('issued', 'claimed')
         ) < ?`,
      )
      .bind(code, caller.licenseId, stamp, caller.licenseId, FREE_STUDENT_LICENSES)
      .run();
    const occupied = await occupiedCount(db, caller.licenseId);
    if (!inserted.meta.changes) {
      return json(409, { ok: false, error: STUDENT_LICENSE_EMPTY, ...poolBody(occupied) });
    }
    const invite = await signStudentInvite(env, { code, gym: caller.licenseId });
    return json(200, { ok: true, code, invite: invite ?? undefined, typ: STUDENT_INVITE_TYP, status: 'issued', ...poolBody(occupied) });
  } catch (error) {
    if (missingStudentCodes(error)) return json(503, { ok: false, error: SETUP_MESSAGE, setup: true });
    throw error;
  }
}

export async function handleStudentLicenseList(
  request: Request,
  env: StudentLicenseEnv,
  db: D1Database | null,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: STORAGE_MESSAGE });
  const body = await readBody(request, 8_000);
  if (body instanceof Response) return body;
  const verified = await verifyCaller(body.token, env);
  if (verified instanceof Response) return verified;
  try {
    const caller = await readCaller(verified, db, true, true);
    if (caller instanceof Response) return caller;
    if (caller.role === 'owner' && !verified.grants.includes('pro')) {
      const halfOff = await halfOffForOwner(db, caller.licenseId);
      return json(200, { ok: true, role: 'owner', left: 0, cap: 0, claims: [], halfOff });
    }
    const rows = await db
      .prepare(
        `SELECT code, license_id AS licenseId, status, claimed_device AS claimedDevice, created_at AS createdAt
         FROM student_codes WHERE license_id = ? ORDER BY created_at`,
      )
      .bind(caller.licenseId)
      .all<CodeRow>();
    const occupied = rows.results.filter((row) => row.status === 'issued' || row.status === 'claimed').length;
    const visible = rows.results.filter((row) => row.status === 'issued' || row.status === 'claimed' || row.status === 'revoked');
    const claims = [];
    for (const row of visible) {
      const showCode =
        (caller.role === 'owner' && (row.status === 'issued' || row.status === 'claimed')) ||
        (caller.role === 'seat' && row.status === 'issued');
      const invite =
        showCode && row.status === 'issued' && row.code
          ? await signStudentInvite(env, { code: row.code, gym: caller.licenseId })
          : null;
      claims.push({
        status: row.status,
        createdAt: row.createdAt,
        claimed: row.status === 'claimed',
        // The owner needs the code to revoke a claimed license. A seat only
        // receives an unclaimed code, so they can show that QR.
        ...(showCode ? { code: row.code, ...(invite ? { invite } : {}) } : {}),
      });
    }
    const halfOff = caller.role === 'owner' ? await halfOffForOwner(db, caller.licenseId) : null;
    return json(200, {
      ok: true,
      role: caller.role,
      ...poolBody(occupied),
      claims,
      ...(caller.role === 'owner' ? { halfOff } : {}),
    });
  } catch (error) {
    if (missingStudentCodes(error)) return json(503, { ok: false, error: SETUP_MESSAGE, setup: true });
    throw error;
  }
}

async function revokeGrant(db: D1Database, code: string, now: Date): Promise<void> {
  await db
    .prepare(
      `UPDATE grants SET status = 'inactive', revoked_at = ?, reason = 'student-license-revoked'
       WHERE source = 'free' AND source_ref = ? AND product = ? AND revoked_at IS NULL`,
    )
    .bind(now.toISOString(), studentLicenseSourceRef(code), API_PRODUCT_STUDENT)
    .run();
}

export async function handleStudentLicenseRevoke(
  request: Request,
  env: StudentLicenseEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: STORAGE_MESSAGE });
  const body = await readBody(request, 8_000);
  if (body instanceof Response) return body;
  const code = typeof body.code === 'string' && isStudentLicenseCode(body.code.trim().toLowerCase()) ? body.code.trim().toLowerCase() : '';
  if (!code) return json(400, { ok: false, error: INVALID_CODE });
  const verified = await verifyCaller(body.token, env);
  if (verified instanceof Response) return verified;
  try {
    const caller = await readCaller(verified, db, false);
    if (caller instanceof Response) return caller;
    const row = await readCode(db, code);
    if (!row || row.licenseId !== caller.licenseId) return json(404, { ok: false, error: 'That code was not found.' });
    if (row.status === 'revoked') return json(409, { ok: false, error: ALREADY_REVOKED });
    if (row.status !== 'issued' && row.status !== 'claimed') return json(404, { ok: false, error: 'That code was not found.' });
    const claimed = row.status === 'claimed';
    const updated = await db
      .prepare(
        `UPDATE student_codes SET status = 'revoked'
         WHERE code = ? AND license_id = ? AND status IN ('issued', 'claimed')`,
      )
      .bind(code, caller.licenseId)
      .run();
    if (!updated.meta.changes) return json(409, { ok: false, error: ALREADY_REVOKED });
    if (claimed) await revokeGrant(db, code, now());
    const occupied = await occupiedCount(db, caller.licenseId);
    return json(200, { ok: true, status: 'revoked', claimed, ...poolBody(occupied) });
  } catch (error) {
    if (missingStudentCodes(error)) return json(503, { ok: false, error: SETUP_MESSAGE, setup: true });
    throw error;
  }
}

export async function handleStudentLicenseClaim(
  request: Request,
  env: StudentLicenseEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: STORAGE_MESSAGE });
  const body = await readBody(request, 8_000);
  if (body instanceof Response) return body;
  const code = (await readStudentInviteCode(body.code, env)) ?? (await readStudentInviteCode(body.invite, env));
  if (!code) return json(400, { ok: false, error: INVALID_CODE });
  const deviceId = cleanDevice(body.deviceId);
  const email = cleanEmail(body.email) ?? '';
  const stamp = now();
  try {
    const row = await readCode(db, code);
    if (!row) return json(400, { ok: false, error: INVALID_CODE });
    if (row.status === 'revoked') return json(403, { ok: false, error: STUDENT_LICENSE_REVOKED_MESSAGE });
    if (row.status === 'claimed' && row.claimedDevice && row.claimedDevice !== deviceId) {
      return json(409, { ok: false, error: STUDENT_LICENSE_TAKEN_MESSAGE });
    }
    if (row.status === 'claimed') {
      const studentLicenseId = await ensureGrant(db, env, code, email, stamp);
      if (!studentLicenseId) return json(403, { ok: false, error: STUDENT_LICENSE_REVOKED_MESSAGE });
      return claimPayload(db, env, row, studentLicenseId, deviceId, stamp, request);
    }
    if (row.status !== 'issued') return json(400, { ok: false, error: INVALID_CODE });
    if (!email) return json(400, { ok: false, error: EMAIL_REQUIRED });
    if (!env.CODE_HASH_PEPPER?.trim()) return json(503, { ok: false, error: RESTORE_EMAIL_MESSAGE });
    const marked = await db
      .prepare(
        `UPDATE student_codes SET status = 'claimed', claimed_device = ?
         WHERE code = ? AND status = 'issued'`,
      )
      .bind(deviceId, code)
      .run();
    if (!marked.meta.changes) {
      const again = await readCode(db, code);
      if (!again) return json(400, { ok: false, error: INVALID_CODE });
      if (again.status === 'revoked') return json(403, { ok: false, error: STUDENT_LICENSE_REVOKED_MESSAGE });
      if (again.status === 'claimed' && again.claimedDevice === deviceId) {
        const studentLicenseId = await ensureGrant(db, env, code, email, stamp);
        if (!studentLicenseId) return json(403, { ok: false, error: STUDENT_LICENSE_REVOKED_MESSAGE });
        return claimPayload(db, env, again, studentLicenseId, deviceId, stamp, request);
      }
      return json(409, { ok: false, error: STUDENT_LICENSE_TAKEN_MESSAGE });
    }
    const studentLicenseId = await ensureGrant(db, env, code, email, stamp);
    if (!studentLicenseId) return json(503, { ok: false, error: RESTORE_EMAIL_MESSAGE });
    return claimPayload(db, env, { ...row, status: 'claimed', claimedDevice: deviceId }, studentLicenseId, deviceId, stamp, request);
  } catch (error) {
    if (missingStudentCodes(error)) return json(503, { ok: false, error: SETUP_MESSAGE, setup: true });
    throw error;
  }
}

/** True when this id is a free Student license whose grant is no longer open. Other inbox ids are left alone. */
export async function freeStudentGrantClosed(db: D1Database | null, studentId: string, now: Date): Promise<boolean> {
  if (!db || !studentId) return false;
  try {
    const row = await db
      .prepare(
        `SELECT license_id AS licenseId, product, source, source_ref AS sourceRef, status, ends_at AS endsAt, revoked_at AS revokedAt
         FROM grants
         WHERE license_id = ? AND source = 'free' AND product = ? AND source_ref LIKE 'student-code:%'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(studentId, API_PRODUCT_STUDENT)
      .first<StoredGrant>();
    if (!row) return false;
    return !grantOpen(row, now);
  } catch {
    return false;
  }
}

/**
 * Restore shape for a license that is only a free Student claim.
 * Any other open product keeps the existing restore token unchanged.
 */
export async function freeStudentRestoreShape(
  db: D1Database,
  licenseId: string,
  now: Date,
  env: StudentLicenseEnv,
): Promise<{ gym: string; preset: typeof STUDENT_LICENSE_PRESET; studentPass: string | null } | null> {
  try {
    const grants = await grantsForLicense(db, licenseId, now);
    const student = grants.find(
      (row) => row.source === 'free' && row.product === API_PRODUCT_STUDENT && (row.sourceRef ?? '').startsWith('student-code:'),
    );
    if (!student?.sourceRef) return null;
    if (grants.some((row) => row !== student)) return null;
    const code = student.sourceRef.slice('student-code:'.length);
    if (!isStudentLicenseCode(code)) return null;
    const row = await readCode(db, code);
    if (!row || row.status !== 'claimed') return null;
    const cloud = await gymHasCloud(db, row.licenseId, now);
    const studentPass = cloud ? await signInboxPass(env, row.licenseId, licenseId, now) : null;
    return { gym: row.licenseId, preset: STUDENT_LICENSE_PRESET, studentPass };
  } catch {
    return null;
  }
}
