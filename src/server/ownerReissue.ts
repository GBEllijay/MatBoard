/**
 * An already-signed owner pass can mint another owner code for the same academy.
 * The plaintext is returned once and is not written to a log.
 * A seat, a paid pass, and a browser flag cannot mint one.
 * Redeeming the new code reuses the owner academy. It does not add seat or student rows.
 */

import { verifyToken } from '../lib/entitlementToken.ts';
import { keyedHash, normalizeCode } from './codeCrypto.ts';
import type { D1Database } from './d1.ts';
import { isPerpetualOwnerAcademyGrant } from './ownerCloudProvision.ts';
import { CODE_SETUP_ERROR } from './paywallDecisions.ts';
import { grantsForLicense } from './purchaseRecords.ts';
import { allowAttempt, clientIp, rateBucket, rateLimitedResponse } from './rateLimit.ts';
import { signingMaterial } from './tokenIssue.ts';
import type { KvListBinding } from './codeCatalog.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const REISSUE_LIMIT = 8;

export type OwnerReissueEnv = {
  CODE_HASH_PEPPER?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function mintCode(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

export async function handleOwnerCodeReissue(
  request: Request,
  env: OwnerReissueEnv,
  kv: KvListBinding | null,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) {
    return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  }
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  if (!pepper) return json(503, { ok: false, error: CODE_SETUP_ERROR });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  if (!kv) return json(503, { ok: false, error: 'Code storage is not set up yet. Bind WHITE_ENTITLEMENTS.' });

  const raw = await request.text();
  if (raw.length > 16_000) return json(400, { ok: false, error: 'This device needs to restore access.' });
  let body: { token?: unknown } = {};
  try {
    body = JSON.parse(raw) as { token?: unknown };
  } catch {
    return json(400, { ok: false, error: 'This device needs to restore access.' });
  }
  const header = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? '';
  const presented = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : bearer;
  if (!presented) return json(400, { ok: false, error: 'This device needs to restore access.' });
  const claims = await verifyToken(presented, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(400, { ok: false, error: 'This device needs to restore access.' });
  if (claims.src !== 'owner' || claims.tier === 'seat') {
    return json(403, { ok: false, error: 'Only the gym owner can issue another owner code.' });
  }
  if (claims.sub === 'owner-test') {
    return json(403, { ok: false, error: 'Only the gym owner can issue another owner code.' });
  }

  const stamp = now();
  const device = await db
    .prepare(`SELECT revoked_at AS revokedAt FROM devices WHERE license_id = ? AND device_id = ?`)
    .bind(claims.sub, claims.did)
    .first<{ revokedAt: string | null }>();
  if (device?.revokedAt) return json(401, { ok: false, error: 'This device was signed out.' });

  const rows = await grantsForLicense(db, claims.sub, stamp);
  const perpetual = rows.some((row) => isPerpetualOwnerAcademyGrant(row) && row.product === 'advantage-pro');
  if (!perpetual) return json(403, { ok: false, error: 'Only the gym owner can issue another owner code.' });

  const bucket = await rateBucket('owner-reissue', clientIp(request), pepper);
  if (!(await allowAttempt(bucket, REISSUE_LIMIT, stamp.getTime(), kv))) return rateLimitedResponse();

  const code = mintCode();
  const hash = await keyedHash(normalizeCode(code), pepper, 'code');
  const record = { id: `owner-${hash.slice(0, 8)}`, hash, kind: 'owner' as const };
  await kv.put(`code:${hash}`, JSON.stringify(record));
  return json(200, { ok: true, code });
}
