import { readPublicJwk, verifyRefreshProof } from '../lib/deviceProof.ts';
import { verifyToken, type Door, type SubscriptionClaim } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { claimForAccess } from './subscriptionAccess.ts';
import { accessForLicense } from './subscriptionSync.ts';
import { grantRowOpensPlusCloud, ownerCloudGrantOpen } from '../lib/advantageCloudMedia.ts';
import { ensureAccountForLicense } from './accountId.ts';
import { isPerpetualOwnerGrant, OWNER_SESSION_SECONDS } from './ownerCloudProvision.ts';
import { cloudAccessForLicense } from './cloudSubscription.ts';
import { doorsFromStored, grantsForLicense, linkedCodeProLicense, type StoredGrant } from './purchaseRecords.ts';
import { API_PRODUCT_PRO } from './routes.ts';
import { refreshSeat } from './seats.ts';
import { freeStudentGrantClosed } from './studentLicenses.ts';
import { STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import { appVersionOf } from '../lib/appCapability.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export type RefreshEnv = StripeRuntimeEnv & {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  CODE_HASH_PEPPER?: string;
};

function doorsForRefresh(rows: readonly StoredGrant[], proEntitled: boolean | null): Door[] {
  const independent = rows.filter((row) => !(row.product === API_PRODUCT_PRO && row.source === 'stripe_subscription'));
  const products = doorsFromStored(independent);
  const keepPro = proEntitled === true || (proEntitled === null && rows.some((row) => row.product === API_PRODUCT_PRO));
  if (keepPro && !products.includes('pro')) products.push('pro');
  return expandGrants(products);
}

/**
 * Exchange a current token for a fresh one. A copied token cannot refresh
 * once the original device registered a key.
 */
export async function handleTokenRefresh(
  request: Request,
  env: RefreshEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
  fetchImpl: typeof fetch = fetch,
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
  let issuedLicense = claims.sub;
  let kind: 'pro' | 'onetime' | 'code' | 'owner-test' | 'seat' = claims.src === 'owner' ? 'owner-test' : claims.src === 'seat' ? 'seat' : doors.includes('pro') ? 'pro' : 'onetime';
  let absoluteExp: number | undefined;
  let subs: SubscriptionClaim | undefined = claims.subs;
  if (claims.src === 'owner' && claims.sub === 'owner-test') {
    // The shared test id has no license row. Leave that pass alone until it ends.
    if (nowSeconds >= claims.exp) return json(401, { ok: false, revoked: true, error: 'That test unlock has ended.' });
    absoluteExp = claims.exp;
    kind = 'owner-test';
  } else if (claims.src === 'owner' && db) {
    const rows = await grantsForLicense(db, claims.sub, stamp);
    const proOpen = rows.some((row) => grantRowOpensPlusCloud(row));
    const cloudOpen = proOpen || rows.some((row) => ownerCloudGrantOpen(row));
    const stripeCloud = await cloudAccessForLicense(db, claims.sub, stamp, { env, fetchImpl });
    if (!cloudOpen && !(stripeCloud.tracked && stripeCloud.entitled)) {
      return json(401, { ok: false, revoked: true, error: 'This access is no longer active.' });
    }
    doors = doorsForRefresh(rows, proOpen ? true : null);
    subs = undefined;
    kind = 'owner-test';
    // Owner academy, or the undated owner-code Pro row sign-in now signs as owner.
    const perpetual = rows.some((row) => isPerpetualOwnerGrant(row));
    if (!perpetual) {
      const ends = rows.reduce((latest, row) => {
        const at = row.endsAt ? Date.parse(row.endsAt) : Number.NaN;
        return Number.isFinite(at) && at > latest ? at : latest;
      }, 0);
      absoluteExp = ends > stamp.getTime() ? Math.floor(ends / 1000) : claims.exp;
      if (absoluteExp <= nowSeconds) {
        return json(401, { ok: false, revoked: true, error: 'This access is no longer active.' });
      }
    }
  } else if (claims.src === 'owner') {
    if (nowSeconds >= claims.exp) return json(401, { ok: false, revoked: true, error: 'That test unlock has ended.' });
    absoluteExp = claims.exp;
    kind = 'owner-test';
  } else if (claims.src === 'seat' && db) {
    const seat = await refreshSeat(db, env, claims, stamp, fetchImpl);
    if ('error' in seat) return json(seat.status, seat.body);
    doors = seat.doors;
    subs = seat.subs;
    kind = 'seat';
  } else if (claims.preset === STUDENT_LICENSE_PRESET && db) {
    // This pass stays Student Edition only. It does not pick up other grants
    // on the same license, and a revoked free license does not refresh.
    const rows = await grantsForLicense(db, claims.sub, stamp);
    const open = rows.some(
      (row) => row.source === 'free' && row.product === 'advantage-student' && (row.sourceRef ?? '').startsWith('student-code:'),
    );
    if (!open || (await freeStudentGrantClosed(db, claims.sub, stamp))) {
      return json(401, { ok: false, revoked: true, error: 'This free Student license was revoked.' });
    }
    doors = expandGrants(['student']);
    kind = 'onetime';
    subs = undefined;
  } else if (db) {
    if (claims.src === 'code') {
      const linked = await linkedCodeProLicense(db, claims.sub, stamp);
      if (linked) issuedLicense = linked;
    }
    const rows = await grantsForLicense(db, issuedLicense, stamp);
    const view = await accessForLicense(db, claims.sub, stamp, { env, fetchImpl, pepper: env.CODE_HASH_PEPPER });
    doors = doorsForRefresh(rows, view ? view.access.entitled : null);
    if (view) subs = claimForAccess(view.access);
    else if (doors.includes('pro')) subs = { state: 'active' };
    else subs = undefined;
    // Cloud is its own grant on this same license. The server decides, not the
    // token that was sent. An active add-on sets the flag. A lapsed add-on
    // clears it. The license id does not change, so existing R2 groups stay put.
    const cloud = await cloudAccessForLicense(db, claims.sub, stamp, { env, fetchImpl });
    if (cloud.tracked && cloud.entitled) {
      subs = subs ? { ...subs, cloud: true } : { state: 'active', cloud: true };
    } else if (cloud.tracked && subs) {
      const next: SubscriptionClaim = { state: subs.state };
      if (subs.lock_at) next.lock_at = subs.lock_at;
      if (subs.ends_at) next.ends_at = subs.ends_at;
      subs = next;
    }
    if (!doors.length && subs?.state !== 'locked') {
      return json(401, { ok: false, revoked: true, error: 'This access is no longer active.' });
    }
    kind = claims.src === 'seat' ? 'seat' : doors.includes('pro') ? 'pro' : claims.src === 'code' || claims.src === 'free' ? 'code' : subs?.state === 'locked' ? 'pro' : 'onetime';
  } else if (nowSeconds >= claims.exp) {
    return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  } else {
    absoluteExp = claims.exp;
  }
  const token = await issueToken(
    env.ENTITLEMENT_SIGNING_KEY,
    {
      licenseId: issuedLicense,
      grants: doors,
      tier:
        claims.preset === STUDENT_LICENSE_PRESET
          ? 'student'
          : claims.src === 'owner'
            ? 'owner'
            : claims.src === 'seat'
              ? 'seat'
              : tierForGrants(doors, claims.src === 'code' || claims.src === 'free' ? 'code' : 'stripe'),
      src: claims.src,
      deviceId: claims.did,
      now: stamp,
      kind,
      absoluteExp,
      ownerTestSeconds: claims.src === 'owner' ? OWNER_SESSION_SECONDS : undefined,
      emailHint: claims.eh,
      thumbprint: claims.cnf,
      // Owner and owner-test passes are not subscriptions. A seat refresh must
      // not leave a subs claim on them, or Pro Console closes while the grant is still pro.
      subs:
        claims.src === 'owner'
          ? undefined
          : claims.src === 'seat' || doors.includes('pro') || subs?.cloud === true || subs?.state === 'locked' || subs?.state === 'grace'
            ? subs
            : undefined,
      gym: claims.gym,
      sid: claims.sid,
      preset: claims.preset,
      grantEndsAt: claims.src === 'free' && claims.fail_open_until ? new Date(claims.fail_open_until * 1000).toISOString() : null,
      appVersion: appVersionOf(request),
    },
    env.ENTITLEMENT_KEY_ID,
  );
  if (!token) return json(401, { ok: false, revoked: true, error: 'This access is no longer active.' });
  let accountId = '';
  if (db && issuedLicense && issuedLicense !== 'owner-test') {
    const linked = await ensureAccountForLicense(db, {
      licenseId: issuedLicense,
      pepper: env.CODE_HASH_PEPPER,
      now: stamp,
    });
    accountId = linked?.accountId ?? '';
  }
  return json(200, { ok: true, token, grants: doors, ...(accountId ? { accountId } : {}) });
}
