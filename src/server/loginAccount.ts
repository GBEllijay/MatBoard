/**
 * Email + password sign-in.
 *
 * Email is the username. It is never stored in plaintext here: every table keys
 * on the same peppered email hash identities, accounts, and student_codes use.
 *
 *   POST /api/login/signin   { email, password, deviceId?, publicJwk? }
 *   POST /api/login/invite   { email, code, password, ... }   first sign-in with an instructor invite
 *   POST /api/login/code     { email, challengeId, code, password, ... }
 *                            first password for a purchaser, or Forgot password. The code is the
 *                            existing restore email code (POST /api/restore/request: Resend,
 *                            Turnstile, rate limits). A reset signs out every other session.
 *   GET  /api/login/me       profile only
 *   POST /api/login/me       { deviceId?, publicJwk? } profile plus a fresh device pass
 *   POST /api/login/signout  revokes this session. Data on the device stays (PR 459).
 *
 * The session is a random token in an HttpOnly Secure SameSite=Lax cookie scoped to
 * /api/login. Only its keyed hash is stored (login_sessions). 90 days, sliding on /me.
 *
 * Every login restores what an invite granted, from what the instructor picked
 * (invite_selections): the Student license with its gym link and inbox pass, or the
 * instructor seat with its preset and permission switches. The coach connect code for
 * that gym is signed here too, so the device joins the academy in the same step.
 *
 * Generic answers: a wrong password, an unknown email, and a locked email look alike.
 * Lockout counts failures per email hash (known or not) and attempts per IP.
 */

import type { D1Database } from './d1.ts';
import { keyedHash, normalizeEmail, timingSafeEqual } from './codeCrypto.ts';
import { licenseForVerifiedEmail, primaryLicenseForAccount } from './accountId.ts';
import { coachConnectForLogin, type CoachConnectEnv } from './coachConnect.ts';
import { issueDevicePass, summarizeLicense, type LicenseSummary } from './devicePass.ts';
import {
  inviteSelectionsForEmail,
  readInviteSelection,
  recordInviteSelection,
  seatFeatures,
  type InviteSelection,
} from './inviteSelections.ts';
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from './password.ts';
import { bumpRate, licenseIdForEmail } from './purchaseRecords.ts';
import { clientIp } from './rateLimit.ts';
import { handleRestoreVerify, type RestoreEnv } from './restoreAccess.ts';
import { seatEmailLabel, seatIdFromInvite, seatPassForLogin, type SeatEnv } from './seats.ts';
import { handleStudentLicenseClaim, readStudentInviteCode } from './studentLicenses.ts';
import { STUDENT_LICENSE_SOURCE_PREFIX } from '../lib/studentLicensePool.ts';
import { OWNER_INSTRUCTOR_ID } from '../lib/instructorIdentity.ts';
import { APP_VERSION_HEADER } from '../lib/appCapability.ts';

export const LOGIN_COOKIE = 'adv_session';
export const LOGIN_COOKIE_PATH = '/api/login';
export const SESSION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
export const FAIL_LIMIT = 5;
export const FAIL_WINDOW_MS = 15 * 60 * 1000;
export const IP_LIMIT = 30;

export const LOGIN_FAILED = "That email and password don't match.";
export const LOGIN_LOCKED = 'Too many tries. Wait 15 minutes, or use Forgot password.';
export const INVITE_FAILED = "That email and invite code don't match an open invite.";
export const CODE_FAILED = "That email and code don't match.";
export const LOGIN_UNAVAILABLE = 'Sign-in is not available yet.';
export const ALREADY_HAS_PASSWORD = 'This email already has a password. Sign in, or use Forgot password.';

export type LoginEnv = RestoreEnv & SeatEnv & CoachConnectEnv;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: unknown, cookie?: string): Response {
  const headers = new Headers(JSON_HEADERS);
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${LOGIN_COOKIE}=${token}; Path=${LOGIN_COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearedCookie(): string {
  return `${LOGIN_COOKIE}=; Path=${LOGIN_COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSessionCookie(request: Request): string {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === LOGIN_COOKIE) return rest.join('=').trim();
  }
  return '';
}

/** "pa•••@gmail.com". Shown on /account. Not enough to recover the address. */
export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = normalized.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}•••${normalized.slice(at)}`;
}

function cleanEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const email = value.trim();
  if (!email || email.length > 320 || !email.includes('@') || /\s/.test(email)) return '';
  return email;
}

function cleanDevice(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : crypto.randomUUID();
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Same-site POSTs only. A browser always sends Origin on a cross-site POST. */
function crossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > 12_000) return null;
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type PasswordRow = {
  emailHash: string;
  accountId: string | null;
  licenseId: string | null;
  passwordHash: string;
  emailMask: string | null;
};

async function readPassword(db: D1Database, emailHash: string): Promise<PasswordRow | null> {
  return db
    .prepare(
      `SELECT email_hash AS emailHash, account_id AS accountId, license_id AS licenseId, password_hash AS passwordHash,
         email_mask AS emailMask FROM login_passwords WHERE email_hash = ? LIMIT 1`,
    )
    .bind(emailHash)
    .first<PasswordRow>();
}

async function writePassword(
  db: D1Database,
  input: { emailHash: string; password: string; emailMask: string; licenseId: string | null; accountId: string | null; now: Date },
): Promise<void> {
  const hash = await hashPassword(input.password);
  const stamp = input.now.toISOString();
  await db
    .prepare(
      `INSERT INTO login_passwords (email_hash, account_id, license_id, password_hash, email_mask, failed_attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(email_hash) DO UPDATE SET password_hash = excluded.password_hash, email_mask = excluded.email_mask,
         account_id = COALESCE(excluded.account_id, login_passwords.account_id),
         license_id = COALESCE(excluded.license_id, login_passwords.license_id),
         failed_attempts = 0, locked_until = NULL, updated_at = excluded.updated_at`,
    )
    .bind(input.emailHash, input.accountId, input.licenseId, hash, input.emailMask, stamp, stamp)
    .run();
}

async function createSession(db: D1Database, pepper: string, emailHash: string, now: Date): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const tokenHash = await keyedHash(token, pepper, 'session');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO login_sessions (id, token_hash, email_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), tokenHash, emailHash, now.toISOString(), now.toISOString(), expiresAt)
    .run();
  return { token, expiresAt };
}

type SessionRow = { id: string; tokenHash: string; emailHash: string; expiresAt: string; revokedAt: string | null };

async function readSession(db: D1Database, pepper: string, request: Request, now: Date): Promise<SessionRow | null> {
  const token = readSessionCookie(request);
  if (!token || token.length > 200) return null;
  const tokenHash = await keyedHash(token, pepper, 'session');
  const row = await db
    .prepare(
      `SELECT id, token_hash AS tokenHash, email_hash AS emailHash, expires_at AS expiresAt, revoked_at AS revokedAt
       FROM login_sessions WHERE token_hash = ? LIMIT 1`,
    )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row || row.revokedAt || !timingSafeEqual(row.tokenHash, tokenHash)) return null;
  if (Date.parse(row.expiresAt) <= now.getTime()) return null;
  return row;
}

/** The license this email owns today. Stored license id is only a fallback. */
async function licenseForEmailHash(db: D1Database, emailHash: string, stored: string | null): Promise<string | null> {
  const account = await db.prepare(`SELECT id FROM accounts WHERE email_hash = ? LIMIT 1`).bind(emailHash).first<{ id: string }>();
  const fromAccount = account ? await primaryLicenseForAccount(db, account.id) : null;
  if (fromAccount) return fromAccount;
  const identity = await db
    .prepare(`SELECT license_id AS licenseId FROM identities WHERE email_hash = ? LIMIT 1`)
    .bind(emailHash)
    .first<{ licenseId: string }>();
  return identity?.licenseId ?? stored ?? null;
}

async function licenseForEmail(db: D1Database, email: string, pepper: string): Promise<string | null> {
  const byAccount = await licenseForVerifiedEmail(db, email, pepper);
  return byAccount?.licenseId ?? (await licenseIdForEmail(db, email, pepper));
}

function studentCodeOf(summary: LicenseSummary | null): string | null {
  const grant = summary?.grants.find((row) => row.source === 'free' && (row.sourceRef ?? '').startsWith(STUDENT_LICENSE_SOURCE_PREFIX));
  return grant?.sourceRef ? grant.sourceRef.slice(STUDENT_LICENSE_SOURCE_PREFIX.length) : null;
}

type ActiveSeat = { selection: InviteSelection };

async function openSeatsForEmail(db: D1Database, emailHash: string): Promise<ActiveSeat[]> {
  const out: ActiveSeat[] = [];
  for (const selection of await inviteSelectionsForEmail(db, emailHash, 'seat')) {
    const seat = await seatEmailLabel(db, selection.ref);
    if (!seat || seat.revoked) continue;
    out.push({ selection });
  }
  return out;
}

function publicSelection(selection: InviteSelection, active: boolean, gymName: string) {
  return {
    kind: selection.kind,
    gym: selection.gym,
    gymName,
    issuer: selection.issuerId === OWNER_INSTRUCTOR_ID ? 'Gym owner' : selection.issuerId ? 'Instructor' : null,
    preset: selection.preset,
    editions: selection.editions,
    features: selection.kind === 'seat' ? seatFeatures(selection).features : selection.features,
    redeemedAt: selection.redeemedAt,
    active,
  };
}

/**
 * Everything one sign-in restores. With `device`, also signs this device's passes:
 * the license pass, the seat pass, and the academy link (coach connect code).
 */
async function loginPayload(
  db: D1Database,
  env: LoginEnv,
  input: {
    emailHash: string;
    emailMask: string;
    storedLicenseId: string | null;
    request: Request;
    now: Date;
    sessionExpiresAt: string;
    device?: { deviceId: string; publicJwk?: unknown };
    fetchImpl?: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const licenseId = await licenseForEmailHash(db, input.emailHash, input.storedLicenseId);
  const summary = licenseId ? await summarizeLicense(db, env, licenseId, input.now) : null;
  const invites: ReturnType<typeof publicSelection>[] = [];
  const out: Record<string, unknown> = { ok: true, signedIn: true, email: input.emailMask, sessionExpiresAt: input.sessionExpiresAt };

  // Student invite: the license is a free Student claim. Its open grant is the "not revoked" check.
  const studentCode = studentCodeOf(summary);
  const studentSelection = studentCode ? await readInviteSelection(db, 'student-code', studentCode) : null;
  let academy: { gym: string; via: string | null } | null = null;
  if (summary?.student) {
    academy = { gym: summary.student.gym, via: studentSelection?.issuerId ?? OWNER_INSTRUCTOR_ID };
  }

  const seats = await openSeatsForEmail(db, input.emailHash);
  out.profile = {
    email: input.emailMask,
    editions: summary?.doors ?? [],
    tier: summary?.tier ?? (seats.length ? 'seat' : null),
    license: summary
      ? {
          grants: summary.grants.map((row) => ({ product: row.product, source: row.source, status: row.status, endsAt: row.endsAt })),
          ownerAcademy: summary.ownerAcademy,
          accountId: summary.accountId || null,
        }
      : null,
    cloud: summary?.cloud ?? null,
    invites,
  };

  if (input.device) {
    const deviceId = input.device.deviceId;
    out.deviceId = deviceId;
    if (summary) {
      const token = await issueDevicePass(db, env, {
        summary,
        emailHash: input.emailHash,
        deviceId,
        publicJwk: input.device.publicJwk,
        request: input.request,
        now: input.now,
      });
      out.pass = {
        token,
        grants: summary.doors,
        ...(summary.accountId ? { accountId: summary.accountId } : {}),
        ...(summary.extraProfileSlots ? { extraProfileSlots: summary.extraProfileSlots } : {}),
        ...(summary.student
          ? { student: { gymId: summary.student.gym, studentPass: summary.student.studentPass, grants: ['student'] } }
          : {}),
      };
      if (!token) out.warning = 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.';
    }
    // Instructor seats from an invite to this email. Newest open seat is restored on this device.
    const seat = seats[0];
    if (seat) {
      const pass = await seatPassForLogin(db, env, { seatId: seat.selection.ref, deviceId, now: input.now, fetchImpl: input.fetchImpl });
      if (pass) {
        const switches = seatFeatures(seat.selection);
        out.seat = { ...pass, permissions: switches.features, permissionsSource: switches.source, editions: seat.selection.editions };
        if (!academy) academy = { gym: pass.gymId, via: null };
      }
    }
  }

  let gymName = '';
  if (academy) {
    const connect = await coachConnectForLogin(env, academy.gym, academy.via);
    gymName = connect?.gymName ?? '';
    out.academy = {
      gym: academy.gym,
      gymName,
      viaInstructorId: connect?.via ?? academy.via,
      coachConnect: connect?.invite ?? null,
    };
  }
  if (studentSelection) invites.push(publicSelection(studentSelection, Boolean(summary?.student), gymName));
  for (const seat of seats) invites.push(publicSelection(seat.selection, true, seat.selection.gym === academy?.gym ? gymName : ''));
  return out;
}

function ready(env: LoginEnv, db: D1Database | null): db is D1Database {
  return Boolean(db && env.CODE_HASH_PEPPER?.trim());
}

async function signInResponse(
  db: D1Database,
  env: LoginEnv,
  input: { emailHash: string; emailMask: string; storedLicenseId: string | null; body: Record<string, unknown>; request: Request; now: Date; fetchImpl?: typeof fetch },
): Promise<Response> {
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const session = await createSession(db, pepper, input.emailHash, input.now);
  const payload = await loginPayload(db, env, {
    ...input,
    sessionExpiresAt: session.expiresAt,
    device: { deviceId: cleanDevice(input.body.deviceId), publicJwk: input.body.publicJwk },
  });
  return json(200, payload, sessionCookie(session.token, SESSION_DAYS * 24 * 60 * 60));
}

async function failCount(db: D1Database, bucket: string, nowMs: number): Promise<number> {
  const row = await db
    .prepare(`SELECT count, reset_at AS resetAt FROM rate_counters WHERE bucket = ?`)
    .bind(bucket)
    .first<{ count: number; resetAt: number }>();
  if (!row || Number(row.resetAt) <= nowMs) return 0;
  return Number(row.count);
}

export async function handleLoginSignIn(
  request: Request,
  env: LoginEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
  fetchImpl?: typeof fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (crossSite(request)) return json(403, { ok: false, error: LOGIN_FAILED });
  if (!ready(env, db)) return json(503, { ok: false, error: LOGIN_UNAVAILABLE });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const body = await readBody(request);
  if (!body) return json(400, { ok: false, error: LOGIN_FAILED });
  const email = cleanEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || password.length > 256) return json(400, { ok: false, error: LOGIN_FAILED });
  const stamp = now();
  const emailHash = await keyedHash(normalizeEmail(email), pepper, 'email');
  const ipKey = await keyedHash(clientIp(request) || 'unknown', pepper, 'ip');
  if (!(await bumpRate(db, `login-ip:${ipKey}`, IP_LIMIT, stamp.getTime(), FAIL_WINDOW_MS))) {
    return json(429, { ok: false, error: LOGIN_LOCKED });
  }
  const failBucket = `login-fail:${emailHash}`;
  // Same lock for every address, known or not, so the lock says nothing about the account.
  if ((await failCount(db, failBucket, stamp.getTime())) >= FAIL_LIMIT) return json(429, { ok: false, error: LOGIN_LOCKED });
  const row = await readPassword(db, emailHash);
  const ok = await verifyPassword(password, row?.passwordHash);
  if (!ok || !row) {
    await bumpRate(db, failBucket, FAIL_LIMIT, stamp.getTime(), FAIL_WINDOW_MS);
    if (row) {
      const count = await failCount(db, failBucket, stamp.getTime());
      await db
        .prepare(`UPDATE login_passwords SET failed_attempts = ?, locked_until = ? WHERE email_hash = ?`)
        .bind(count, count >= FAIL_LIMIT ? new Date(stamp.getTime() + FAIL_WINDOW_MS).toISOString() : null, emailHash)
        .run();
    }
    return json(400, { ok: false, error: LOGIN_FAILED });
  }
  await db.prepare(`DELETE FROM rate_counters WHERE bucket = ?`).bind(failBucket).run();
  if (needsRehash(row.passwordHash)) {
    await writePassword(db, { emailHash, password, emailMask: row.emailMask ?? maskEmail(email), licenseId: row.licenseId, accountId: row.accountId, now: stamp });
  } else {
    await db.prepare(`UPDATE login_passwords SET failed_attempts = 0, locked_until = NULL WHERE email_hash = ?`).bind(emailHash).run();
  }
  return signInResponse(db, env, {
    emailHash,
    emailMask: row.emailMask ?? maskEmail(email),
    storedLicenseId: row.licenseId,
    body,
    request,
    now: stamp,
    fetchImpl,
  });
}

/** Every string an invite could arrive as: the bare code, a signed token, or a pasted link. */
function inviteCandidates(raw: string): string[] {
  const value = raw.trim();
  const out = [value];
  try {
    const url = new URL(value);
    for (const key of ['code', 'invite', 'seat', 't']) {
      const param = url.searchParams.get(key);
      if (param) out.push(param);
    }
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    for (const param of hash.values()) out.push(param);
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last) out.push(last);
  } catch {
    /* not a link */
  }
  return [...new Set(out.filter(Boolean))];
}

export async function handleLoginInvite(
  request: Request,
  env: LoginEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
  fetchImpl?: typeof fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (crossSite(request)) return json(403, { ok: false, error: INVITE_FAILED });
  if (!ready(env, db)) return json(503, { ok: false, error: LOGIN_UNAVAILABLE });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const body = await readBody(request);
  if (!body) return json(400, { ok: false, error: INVITE_FAILED });
  const email = cleanEmail(body.email);
  const rawCode = typeof body.code === 'string' ? body.code.slice(0, 4000) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !rawCode) return json(400, { ok: false, error: INVITE_FAILED });
  const problem = passwordProblem(password);
  if (problem) return json(400, { ok: false, error: problem });
  const stamp = now();
  const emailHash = await keyedHash(normalizeEmail(email), pepper, 'email');
  const ipKey = await keyedHash(clientIp(request) || 'unknown', pepper, 'ip');
  const failBucket = `login-invite:${emailHash}`;
  if (!(await bumpRate(db, `login-ip:${ipKey}`, IP_LIMIT, stamp.getTime(), FAIL_WINDOW_MS))) return json(429, { ok: false, error: LOGIN_LOCKED });
  if ((await failCount(db, failBucket, stamp.getTime())) >= FAIL_LIMIT) return json(429, { ok: false, error: LOGIN_LOCKED });
  const fail = async () => {
    await bumpRate(db, failBucket, FAIL_LIMIT, stamp.getTime(), FAIL_WINDOW_MS);
    return json(400, { ok: false, error: INVITE_FAILED });
  };
  const candidates = inviteCandidates(rawCode);
  const deviceId = cleanDevice(body.deviceId);

  // 1) Student Edition code issued to this email.
  let studentCode: string | null = null;
  for (const candidate of candidates) {
    studentCode = await readStudentInviteCode(candidate, env);
    if (studentCode) break;
  }
  let licenseId: string | null = null;
  let matched = false;
  if (studentCode) {
    const row = await db
      .prepare(`SELECT code, license_id AS gym, status, email_hash AS emailHash FROM student_codes WHERE code = ? LIMIT 1`)
      .bind(studentCode)
      .first<{ code: string; gym: string; status: string; emailHash: string | null }>();
    if (!row || row.status === 'revoked' || !row.emailHash || !timingSafeEqual(row.emailHash, emailHash)) return fail();
    if (await readPassword(db, emailHash)) return json(409, { ok: false, error: ALREADY_HAS_PASSWORD });
    if (row.status === 'issued') {
      // Same claim the join page does: marks the code claimed, creates the Student grant, links the email.
      const claimed = await handleStudentLicenseClaim(
        new Request(new URL('/api/student-licenses/claim', request.url), {
          method: 'POST',
          headers: { 'content-type': 'application/json', [APP_VERSION_HEADER]: request.headers.get(APP_VERSION_HEADER) ?? '' },
          body: JSON.stringify({ code: studentCode, email, deviceId }),
        }),
        env,
        db,
        () => stamp,
      );
      if (claimed.status !== 200) return fail();
    }
    const grant = await db
      .prepare(
        `SELECT license_id AS licenseId, revoked_at AS revokedAt, status FROM grants
         WHERE source = 'free' AND source_ref = ? LIMIT 1`,
      )
      .bind(`${STUDENT_LICENSE_SOURCE_PREFIX}${studentCode}`)
      .first<{ licenseId: string; revokedAt: string | null; status: string }>();
    if (!grant || grant.revokedAt || grant.status === 'inactive') return fail();
    licenseId = grant.licenseId;
    if (!(await readInviteSelection(db, 'student-code', studentCode))) {
      // Codes issued before this PR have no stored selection. Record what the code itself grants.
      await recordInviteSelection(db, {
        kind: 'student-code',
        ref: studentCode,
        gym: row.gym,
        issuerId: OWNER_INSTRUCTOR_ID,
        emailHash,
        preset: 'student-license',
        editions: ['student'],
        features: {},
        now: stamp,
      });
    }
    matched = true;
  }

  // 2) Instructor seat invite sent to this email.
  if (!matched) {
    let seatId: string | null = null;
    for (const candidate of candidates) {
      seatId = await seatIdFromInvite(candidate, env, db);
      if (seatId) break;
    }
    if (!seatId) return fail();
    const seat = await seatEmailLabel(db, seatId);
    if (!seat || seat.revoked || !seat.email) return fail();
    const labelHash = await keyedHash(normalizeEmail(seat.email), pepper, 'email');
    if (!timingSafeEqual(labelHash, emailHash)) return fail();
    if (await readPassword(db, emailHash)) return json(409, { ok: false, error: ALREADY_HAS_PASSWORD });
    const existing = await readInviteSelection(db, 'seat', seatId);
    if (!existing) {
      await recordInviteSelection(db, {
        kind: 'seat',
        ref: seatId,
        gym: seat.gym,
        issuerId: OWNER_INSTRUCTOR_ID,
        emailHash,
        // Seats issued before this PR stored only the preset. Its factory switches are restored.
        preset: seat.preset,
        editions: ['white', 'student', 'coach', 'pro'],
        features: {},
        now: stamp,
      });
    } else if (!existing.emailHash) {
      await db.prepare(`UPDATE invite_selections SET email_hash = ? WHERE invite_kind = 'seat' AND invite_ref = ?`).bind(emailHash, seatId).run();
    }
    licenseId = await licenseForEmail(db, email, pepper);
    matched = true;
  }

  await db.prepare(`DELETE FROM rate_counters WHERE bucket = ?`).bind(failBucket).run();
  await writePassword(db, { emailHash, password, emailMask: maskEmail(email), licenseId, accountId: null, now: stamp });
  return signInResponse(db, env, { emailHash, emailMask: maskEmail(email), storedLicenseId: licenseId, body, request, now: stamp, fetchImpl });
}

/** First password for a purchaser, and Forgot password, both through the restore email code. */
export async function handleLoginCode(
  request: Request,
  env: LoginEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
  fetchImpl?: typeof fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (crossSite(request)) return json(403, { ok: false, error: CODE_FAILED });
  if (!ready(env, db)) return json(503, { ok: false, error: LOGIN_UNAVAILABLE });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const body = await readBody(request);
  if (!body) return json(400, { ok: false, error: CODE_FAILED });
  const email = cleanEmail(body.email);
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim().slice(0, 80) : '';
  const code = typeof body.code === 'string' ? body.code.slice(0, 40) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !challengeId || !code) return json(400, { ok: false, error: CODE_FAILED });
  const problem = passwordProblem(password);
  if (problem) return json(400, { ok: false, error: problem });
  const stamp = now();
  const emailHash = await keyedHash(normalizeEmail(email), pepper, 'email');
  // The code must belong to this email. Checked before the code is spent.
  const challenge = await db
    .prepare(`SELECT email_hash AS emailHash FROM restore_challenges WHERE id = ? LIMIT 1`)
    .bind(challengeId)
    .first<{ emailHash: string }>();
  if (!challenge || !timingSafeEqual(challenge.emailHash, emailHash)) return json(400, { ok: false, error: CODE_FAILED });
  // The restore handler checks expiry, attempts, and single use, and spends the code.
  const verified = await handleRestoreVerify(
    new Request(new URL('/api/restore/verify', request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code, deviceId: cleanDevice(body.deviceId), publicJwk: body.publicJwk }),
    }),
    env,
    db,
    () => stamp,
  );
  if (verified.status !== 200) return json(400, { ok: false, error: CODE_FAILED });
  const licenseId = await licenseForEmail(db, email, pepper);
  const reset = Boolean(await readPassword(db, emailHash));
  await writePassword(db, { emailHash, password, emailMask: maskEmail(email), licenseId, accountId: null, now: stamp });
  if (reset) {
    // A new password ends every older session for this email.
    await db.prepare(`UPDATE login_sessions SET revoked_at = ? WHERE email_hash = ? AND revoked_at IS NULL`).bind(stamp.toISOString(), emailHash).run();
  }
  await db.prepare(`DELETE FROM rate_counters WHERE bucket = ?`).bind(`login-fail:${emailHash}`).run();
  return signInResponse(db, env, { emailHash, emailMask: maskEmail(email), storedLicenseId: licenseId, body, request, now: stamp, fetchImpl });
}

export async function handleLoginMe(
  request: Request,
  env: LoginEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
  fetchImpl?: typeof fetch,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (request.method === 'POST' && crossSite(request)) return json(403, { ok: false, signedIn: false });
  if (!ready(env, db)) return json(200, { ok: true, signedIn: false, available: false });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const stamp = now();
  const session = await readSession(db, pepper, request, stamp);
  if (!session) {
    return json(200, { ok: true, signedIn: false, available: true }, readSessionCookie(request) ? clearedCookie() : undefined);
  }
  const row = await readPassword(db, session.emailHash);
  if (!row) return json(200, { ok: true, signedIn: false, available: true }, clearedCookie());
  let body: Record<string, unknown> = {};
  if (request.method === 'POST') body = (await readBody(request)) ?? {};
  // Sliding expiry: each visit to /account keeps the session for another 90 days.
  const expiresAt = new Date(stamp.getTime() + SESSION_DAYS * DAY_MS).toISOString();
  await db
    .prepare(`UPDATE login_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
    .bind(stamp.toISOString(), expiresAt, session.id)
    .run();
  const payload = await loginPayload(db, env, {
    emailHash: session.emailHash,
    emailMask: row.emailMask ?? '•••',
    storedLicenseId: row.licenseId,
    request,
    now: stamp,
    sessionExpiresAt: expiresAt,
    device: request.method === 'POST' ? { deviceId: cleanDevice(body.deviceId), publicJwk: body.publicJwk } : undefined,
    fetchImpl,
  });
  return json(200, payload, sessionCookie(readSessionCookie(request), SESSION_DAYS * 24 * 60 * 60));
}

export async function handleLoginSignOut(
  request: Request,
  env: LoginEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  if (crossSite(request)) return json(403, { ok: false });
  if (ready(env, db)) {
    const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
    const session = await readSession(db, pepper, request, now());
    if (session) {
      await db.prepare(`UPDATE login_sessions SET revoked_at = ? WHERE id = ?`).bind(now().toISOString(), session.id).run();
    }
  }
  return json(200, { ok: true, signedIn: false }, clearedCookie());
}

export const LOGIN_PATHS = {
  signin: '/api/login/signin',
  invite: '/api/login/invite',
  code: '/api/login/code',
  me: '/api/login/me',
  signout: '/api/login/signout',
} as const;

/** One entry for the Pages catch-all and the dev server. */
export async function handleLogin(
  request: Request,
  env: LoginEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  try {
    if (path === LOGIN_PATHS.signin) return await handleLoginSignIn(request, env, db, now, fetchImpl);
    if (path === LOGIN_PATHS.invite) return await handleLoginInvite(request, env, db, now, fetchImpl);
    if (path === LOGIN_PATHS.code) return await handleLoginCode(request, env, db, now, fetchImpl);
    if (path === LOGIN_PATHS.me) return await handleLoginMe(request, env, db, now, fetchImpl);
    if (path === LOGIN_PATHS.signout) return await handleLoginSignOut(request, env, db, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table/i.test(message) && /login_|invite_selections/.test(message)) {
      // migrations/0009_email_login.sql is not applied on this database yet.
      return json(503, { ok: false, error: LOGIN_UNAVAILABLE, setup: true });
    }
    throw error;
  }
  return json(404, { ok: false, error: 'Not found.' });
}
