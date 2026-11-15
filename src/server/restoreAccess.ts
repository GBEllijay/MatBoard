import { grantRowOpensPlusCloud, ownerCloudGrantOpen } from '../lib/advantageCloudMedia.ts';
import { thumbprintJwk, verifyToken, type PublicJwk } from '../lib/entitlementToken.ts';
import type { Door } from '../lib/entitlementToken.ts';
import { ensureAccountForLicense, licenseForVerifiedEmail, primaryLicenseForAccount } from './accountId.ts';
import { countExtraProfileSlots } from './profileSlots.ts';
import { keyedHash, normalizeEmail } from './codeCrypto.ts';
import type { D1Database } from './d1.ts';
import type { EmailSender } from './emailSender.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { isPerpetualOwnerGrant, OWNER_SESSION_SECONDS } from './ownerCloudProvision.ts';
import { RESTORE_FROM_ADDRESS } from './paywallDecisions.ts';
import { clientIp } from './rateLimit.ts';
import {
  bumpRate,
  doorsFromStored,
  grantsForLicense,
  licenseIdForEmail,
  revokeOtherDevices,
  touchDevice,
} from './purchaseRecords.ts';
import { appVersionOf } from '../lib/appCapability.ts';
import { cloudAccessForLicense } from './cloudSubscription.ts';
import { freeStudentRestoreShape } from './studentLicenses.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export const RESTORE_GENERIC = "If that address has a purchase, we've emailed a code.";
export const RESTORE_UNAVAILABLE = 'Restore is not available yet.';
export const RESTORE_CODE_FAILURE = "That code didn't work.";

const HOUR = 60 * 60 * 1000;
const EMAIL_LIMIT = 3;
const IP_LIMIT = 10;
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Same body whether or not the address bought anything. The page needs a challenge id to show the
 * code box right away, so an address with no purchase gets a random id that matches nothing.
 */
function genericOk(challengeId: string): Response {
  return json(200, { ok: true, message: RESTORE_GENERIC, challengeId });
}

/** The code email. Code only: no link, so a mail scanner has nothing to open. */
export function restoreEmailText(code: string): string {
  return [
    'Your Advantage restore code:',
    '',
    code,
    '',
    'Enter this code on the Advantage restore page. It expires in 15 minutes and works once.',
    '',
    `Sent from ${RESTORE_FROM_ADDRESS}. If you did not ask for this, you can ignore it.`,
  ].join('\n');
}

export function restoreCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export type RestoreEnv = {
  CODE_HASH_PEPPER?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_PROVIDER?: string;
};

async function turnstileOk(
  token: string,
  secret: string,
  ip: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);
  const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!response.ok) return false;
  const parsed = (await response.json()) as { success?: boolean };
  return parsed.success === true;
}

function ready(env: RestoreEnv, db: D1Database | null, sender: EmailSender | null): boolean {
  return Boolean(db && sender && env.CODE_HASH_PEPPER?.trim() && env.TURNSTILE_SECRET_KEY?.trim());
}

export async function handleRestoreRequest(
  request: Request,
  env: RestoreEnv,
  db: D1Database | null,
  sender: EmailSender | null,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!ready(env, db, sender) || !db || !sender) return json(503, { ok: false, error: RESTORE_UNAVAILABLE });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const raw = await request.text();
  if (raw.length > 4_000) return json(400, { ok: false, error: 'Enter the email from your purchase.' });
  let body: { email?: unknown; turnstileToken?: unknown } = {};
  try {
    body = raw.trim() ? (JSON.parse(raw) as { email?: unknown; turnstileToken?: unknown }) : {};
  } catch {
    return json(400, { ok: false, error: 'Enter the email from your purchase.' });
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > 320 || !email.includes('@') || /\s/.test(email)) {
    return json(400, { ok: false, error: 'Enter the email from your purchase.' });
  }
  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  const ip = clientIp(request);
  const captcha = await turnstileOk(token, env.TURNSTILE_SECRET_KEY?.trim() ?? '', ip, fetchImpl);
  if (!captcha) return json(400, { ok: false, error: 'Confirm you are a person and try again.' });

  const normalized = normalizeEmail(email);
  const emailKey = await keyedHash(normalized, pepper, 'email');
  const ipKey = await keyedHash(ip || 'unknown', pepper, 'ip');
  const stamp = now();
  const emailAllowed = await bumpRate(db, `restore-email:${emailKey}`, EMAIL_LIMIT, stamp.getTime(), HOUR);
  const ipAllowed = await bumpRate(db, `restore-ip:${ipKey}`, IP_LIMIT, stamp.getTime(), HOUR);
  if (!emailAllowed || !ipAllowed) return json(429, { ok: false, error: 'Too many attempts. Wait an hour and try again.' });

  const byAccount = await licenseForVerifiedEmail(db, email, pepper);
  const licenseId = byAccount?.licenseId ?? (await licenseIdForEmail(db, email, pepper));
  if (licenseId) {
    await ensureAccountForLicense(db, { licenseId, email, pepper, now: stamp });
  }
  const challengeId = crypto.randomUUID();
  if (licenseId) {
    const code = restoreCode();
    const codeHash = await keyedHash(code, pepper, 'restore');
    const expires = new Date(stamp.getTime() + CODE_TTL_MS).toISOString();
    await db
      .prepare(
        `INSERT INTO restore_challenges (id, code_hash, email_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)`,
      )
      .bind(challengeId, codeHash, emailKey, expires)
      .run();
    await sender.send({
      to: email,
      subject: 'Your Advantage restore code',
      text: restoreEmailText(code),
    });
  }
  return genericOk(challengeId);
}

export async function handleRestoreVerify(
  request: Request,
  env: RestoreEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db || !env.CODE_HASH_PEPPER?.trim()) return json(503, { ok: false, error: RESTORE_UNAVAILABLE });
  const pepper = env.CODE_HASH_PEPPER.trim();
  const raw = await request.text();
  if (raw.length > 8_000) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  let body: { challengeId?: unknown; code?: unknown; deviceId?: unknown; publicJwk?: unknown } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  }
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (!challengeId || !code) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  const row = await db
    .prepare(
      `SELECT id, code_hash AS codeHash, email_hash AS emailHash, expires_at AS expiresAt, used_at AS usedAt, attempts
       FROM restore_challenges WHERE id = ?`,
    )
    .bind(challengeId)
    .first<{
      id: string;
      codeHash: string;
      emailHash: string;
      expiresAt: string;
      usedAt: string | null;
      attempts: number;
    }>();
  if (!row || row.usedAt || Number(row.attempts) >= MAX_ATTEMPTS) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  if (Date.parse(row.expiresAt) <= now().getTime()) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  const got = await keyedHash(code, pepper, 'restore');
  if (got !== row.codeHash) {
    await db.prepare(`UPDATE restore_challenges SET attempts = attempts + 1 WHERE id = ?`).bind(challengeId).run();
    return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  }
  const consumed = await db
    .prepare(`UPDATE restore_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL`)
    .bind(now().toISOString(), challengeId)
    .run();
  if (consumed.meta.changes !== 1) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });

  const account = await db
    .prepare(`SELECT id FROM accounts WHERE email_hash = ? LIMIT 1`)
    .bind(row.emailHash)
    .first<{ id: string }>();
  const fromAccount = account ? await primaryLicenseForAccount(db, account.id) : null;
  const identity = fromAccount
    ? null
    : await db
        .prepare(`SELECT license_id AS licenseId FROM identities WHERE email_hash = ? LIMIT 1`)
        .bind(row.emailHash)
        .first<{ licenseId: string }>();
  const licenseId = fromAccount ?? identity?.licenseId ?? '';
  if (!licenseId) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  const linked = await ensureAccountForLicense(db, { licenseId, pepper, now: now() });
  const grants = await grantsForLicense(db, licenseId, now());
  const doors = expandGrants(doorsFromStored(grants)) as Door[];
  if (!doors.length) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  const ownerAcademy = grants.some((grant) => isPerpetualOwnerGrant(grant) && grant.product === 'advantage-pro');
  // Same rule as gymCloud.ts lookupPlusCloud and devicePass.ts summarizeLicense.
  const plusCloudGrant = grants.some((grant) => grantRowOpensPlusCloud(grant) || ownerCloudGrantOpen(grant));
  const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 80) : crypto.randomUUID();
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  const accountId = linked?.accountId ?? account?.id ?? '';
  const extraProfileSlots = accountId ? await countExtraProfileSlots(db, accountId) : 0;
  if (!material) {
    return json(200, {
      ok: true,
      entitled: true,
      degraded: true,
      grants: doors,
      deviceId,
      ...(accountId ? { accountId } : {}),
      ...(extraProfileSlots ? { extraProfileSlots } : {}),
      warning: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.',
    });
  }
  let thumbprint: string | undefined;
  if (body.publicJwk && typeof body.publicJwk === 'object') {
    const jwk = body.publicJwk as PublicJwk;
    if (jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.x === 'string' && typeof jwk.y === 'string') {
      thumbprint = await thumbprintJwk(jwk);
    }
  }
  const active = await touchDevice(db, { licenseId, deviceId, thumbprint: thumbprint ?? null, now: now() });
  void active;
  const pro = doors.includes('pro');
  // A license that is only a free Student claim restores as that claim, including
  // the gym link. Every other license keeps the token it had before.
  const studentClaim = ownerAcademy ? null : await freeStudentRestoreShape(db, licenseId, now(), env);
  // Cloud comes from the cloud grant on this license. A previous phone's token
  // is not part of this request, and its flags are not copied.
  const cloud = studentClaim || ownerAcademy ? null : plusCloudGrant ? { entitled: true } : await cloudAccessForLicense(db, licenseId, now());
  // A code Pro row restores as the code pass it was, so Plus Cloud stays open.
  const passSrc = plusCloudGrant ? 'code' : pro ? 'stripe' : 'code';
  const subs = ownerAcademy
    ? undefined
    : studentClaim
      ? undefined
      : cloud?.entitled
        ? { state: 'active' as const, cloud: true as const }
        : pro
          ? { state: 'active' as const }
          : undefined;
  const token = await issueToken(env.ENTITLEMENT_SIGNING_KEY, {
    licenseId,
    grants: doors,
    tier: ownerAcademy ? 'owner' : studentClaim ? 'student' : tierForGrants(doors, passSrc),
    src: ownerAcademy ? 'owner' : studentClaim ? 'free' : passSrc,
    deviceId,
    now: now(),
    kind: ownerAcademy ? 'owner-test' : studentClaim ? 'onetime' : pro ? 'pro' : 'onetime',
    ownerTestSeconds: ownerAcademy ? OWNER_SESSION_SECONDS : undefined,
    emailHint: row.emailHash.slice(0, 16),
    thumbprint,
    subs,
    gym: studentClaim?.gym,
    preset: studentClaim?.preset,
    appVersion: appVersionOf(request),
  }, env.ENTITLEMENT_KEY_ID);
  if (!token) return json(503, { ok: false, error: RESTORE_UNAVAILABLE });
  return json(200, {
    ok: true,
    entitled: true,
    grants: doors,
    token,
    deviceId,
    ...(accountId ? { accountId } : {}),
    ...(extraProfileSlots ? { extraProfileSlots } : {}),
    ...(studentClaim?.studentPass ? { studentPass: studentClaim.studentPass } : {}),
  });
}

export async function handleRevokeOtherDevices(
  request: Request,
  env: RestoreEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: RESTORE_UNAVAILABLE });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  const raw = await request.text();
  let body: { token?: unknown } = {};
  try {
    body = JSON.parse(raw) as { token?: unknown };
  } catch {
    return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  }
  if (typeof body.token !== 'string') return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  const claims = await verifyToken(body.token, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(400, { ok: false, error: RESTORE_CODE_FAILURE });
  const removed = await revokeOtherDevices(db, claims.sub, claims.did, now());
  return json(200, { ok: true, signedOut: removed });
}
