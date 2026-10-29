import { readPublicJwk, verifyRefreshProof } from '../lib/deviceProof.ts';
import { verifyToken, type Door } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { doorsFromStored, grantsForLicense } from './purchaseRecords.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export type RefreshEnv = {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

/**
 * Exchange a current token for a fresh one. A copied token cannot refresh
 * once the original device registered a key.
 */
export async function handleTokenRefresh(
  request: Request,
  env: RefreshEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) {
    return json(503, {
      ok: false,
      error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.',
    });
  }
  const raw = await request.text();
  if (raw.length > 16_000) return json(400, { ok: false, revoked: true, error: 'This device needs to restore access.' });
  let body: {
    token?: unknown;
    publicJwk?: unknown;
    proof?: unknown;
    timestamp?: unknown;
  } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(400, { ok: false, revoked: true, error: 'This device needs to restore access.' });
  }
  if (typeof body.token !== 'string') return json(400, { ok: false, revoked: true, error: 'This device needs to restore access.' });
  const claims = await verifyToken(body.token, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(400, { ok: false, revoked: true, error: 'This device needs to restore access.' });
  const stamp = now();
  const nowSeconds = Math.floor(stamp.getTime() / 1000);
  if (claims.cnf) {
    const publicJwk = readPublicJwk(body.publicJwk);
    const proof = typeof body.proof === 'string' ? body.proof : '';
    const timestamp = typeof body.timestamp === 'number' ? body.timestamp : Number(body.timestamp);
    if (!publicJwk || !proof || !(await verifyRefreshProof({
      publicJwk,
      deviceId: claims.did,
      timestamp,
      proof,
      nowSeconds,
      expectedThumbprint: claims.cnf,
    }))) {
      return json(401, { ok: false, revoked: false, error: 'This copy of the token cannot refresh. Restore on this device.' });
    }
  }
  if (db) {
    const device = await db
      .prepare(`SELECT revoked_at AS revokedAt FROM devices WHERE license_id = ? AND device_id = ?`)
      .bind(claims.sub, claims.did)
      .first<{ revokedAt: string | null }>();
    if (device?.revokedAt) return json(401, { ok: false, revoked: true, error: 'This device was signed out.' });
  }
  let doors = claims.grants;
  let kind: 'pro' | 'onetime' | 'code' | 'owner-test' = claims.src === 'owner' ? 'owner-test' : doors.includes('pro') ? 'pro' : 'onetime';
  let absoluteExp: number | undefined;
  if (claims.src === 'owner') {
    if (nowSeconds >= claims.exp) return json(401, { ok: false, revoked: true, error: 'That test unlock has ended.' });
    absoluteExp = claims.exp;
    kind = 'owner-test';
  } else if (db) {
    const rows = await grantsForLicense(db, claims.sub, stamp);
    doors = expandGrants(doorsFromStored(rows)) as Door[];
    if (!doors.length) return json(401, { ok: false, revoked: true, error: 'This access is no longer active.' });
    kind = doors.includes('pro') ? 'pro' : claims.src === 'code' || claims.src === 'free' ? 'code' : 'onetime';
  } else if (nowSeconds >= claims.exp) {
    return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  } else {
    absoluteExp = claims.exp;
  }
  const token = await issueToken(
    env.ENTITLEMENT_SIGNING_KEY,
    {
      licenseId: claims.sub,
      grants: doors,
      tier: claims.src === 'owner' ? 'owner' : tierForGrants(doors, claims.src === 'code' || claims.src === 'free' ? 'code' : 'stripe'),
      src: claims.src,
      deviceId: claims.did,
      now: stamp,
      kind,
      absoluteExp,
      emailHint: claims.eh,
      thumbprint: claims.cnf,
      subs: doors.includes('pro') ? (claims.subs ?? { state: 'active' }) : undefined,
      grantEndsAt: claims.src === 'free' && claims.fail_open_until ? new Date(claims.fail_open_until * 1000).toISOString() : null,
    },
    env.ENTITLEMENT_KEY_ID,
  );
  if (!token) return json(401, { ok: false, revoked: true, error: 'This access is no longer active.' });
  return json(200, { ok: true, token, grants: doors });
}
