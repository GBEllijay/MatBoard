import { readSignedJson, signJson, verifyToken, type Door, type SubscriptionClaim } from '../lib/entitlementToken.ts';
import { SEAT_SUNSET_ENDS_AT } from '../lib/seatSunset.ts';
import type { D1Database } from './d1.ts';
import { expandGrants } from './grantMatrix.ts';
import { INSTRUCTOR_SEAT_CAP } from './paywallDecisions.ts';
import { claimForAccess } from './subscriptionAccess.ts';
import { accessForLicense } from './subscriptionSync.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const INVITE_SECONDS = 14 * 24 * 60 * 60;
const OPEN_STATUSES = ['pending', 'claimed'];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export type SeatEnv = StripeRuntimeEnv & {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  CODE_HASH_PEPPER?: string;
  SEAT_SUNSET_ENDS_AT?: string;
};

type SeatRow = {
  id: string;
  gymLicenseId: string;
  preset: string | null;
  status: string;
  claimedDevice: string | null;
  createdAt: string;
  revokedAt: string | null;
  emailLabel: string | null;
  inviteExpiresAt: string | null;
  claimedAt: string | null;
  legacy: number;
  sunsetAt: string | null;
  inviteNonce: string | null;
};

const SEAT_COLUMNS = `id, gym_license_id AS gymLicenseId, preset, status, claimed_device AS claimedDevice,
  created_at AS createdAt, revoked_at AS revokedAt, email_label AS emailLabel,
  invite_expires_at AS inviteExpiresAt, claimed_at AS claimedAt, legacy, sunset_at AS sunsetAt,
  invite_nonce AS inviteNonce`;

function sunset(env: SeatEnv): string {
  const override = env.SEAT_SUNSET_ENDS_AT?.trim() ?? '';
  if (override && Number.isFinite(Date.parse(override))) return new Date(override).toISOString();
  return SEAT_SUNSET_ENDS_AT;
}

async function readOwner(request: Request, env: SeatEnv): Promise<{ licenseId: string; deviceId: string } | Response> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  const raw = await request.clone().text();
  let body: { token?: unknown } = {};
  try {
    body = JSON.parse(raw) as { token?: unknown };
  } catch {
    return json(400, { ok: false, error: 'This device needs to restore access.' });
  }
  if (typeof body.token !== 'string') return json(400, { ok: false, error: 'This device needs to restore access.' });
  const claims = await verifyToken(body.token, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(400, { ok: false, error: 'This device needs to restore access.' });
  if (claims.src === 'seat' || claims.tier === 'seat') return json(403, { ok: false, error: 'Only the gym owner can issue invites.' });
  if (!claims.grants.includes('pro') || claims.subs?.state === 'locked') {
    return json(403, { ok: false, error: 'Advantage Pro is paused. Update payment before issuing a seat.' });
  }
  return { licenseId: claims.sub, deviceId: claims.did };
}

async function openSeatCount(db: D1Database, licenseId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM seats
       WHERE gym_license_id = ? AND revoked_at IS NULL AND status IN ('pending', 'claimed')`,
    )
    .bind(licenseId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

async function signInvite(
  env: SeatEnv,
  input: { gym: string; sid: string; preset: string; nonce: string; exp: number },
): Promise<string | null> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return null;
  return signJson(
    material.kid,
    { typ: 'seat-invite', gym: input.gym, sid: input.sid, preset: input.preset, nonce: input.nonce, exp: input.exp, v: 1 },
    material.privateJwk,
  );
}

function labelOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 254);
}

function presetOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const preset = value.trim().slice(0, 40);
  if (preset === 'assistant-coach' || preset === 'coach' || preset === 'program-director' || preset === 'instructors') return preset;
  return '';
}

export async function handleSeatIssue(
  request: Request,
  env: SeatEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const owner = await readOwner(request, env);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as { email?: unknown; preset?: unknown };
  const email = labelOf(body.email);
  if (!email) return json(400, { ok: false, error: "Enter the instructor's email." });
  const stamp = now();
  const id = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const exp = Math.floor(stamp.getTime() / 1000) + INVITE_SECONDS;
  const preset = presetOf(body.preset);
  const inserted = await db
    .prepare(
      `INSERT INTO seats (
         id, gym_license_id, preset, status, created_at, email_label, invite_expires_at, legacy, invite_nonce
       )
       SELECT ?, ?, ?, 'pending', ?, ?, ?, 0, ?
       WHERE (
         SELECT COUNT(*) FROM seats
         WHERE gym_license_id = ? AND revoked_at IS NULL AND status IN ('pending', 'claimed')
       ) < ?`,
    )
    .bind(
      id,
      owner.licenseId,
      preset || null,
      stamp.toISOString(),
      email,
      new Date(exp * 1000).toISOString(),
      nonce,
      owner.licenseId,
      INSTRUCTOR_SEAT_CAP,
    )
    .run();
  if (!inserted.meta.changes) {
    return json(409, { ok: false, reason: 'cap', error: `All ${INSTRUCTOR_SEAT_CAP} seats are in use.` });
  }
  const used = await openSeatCount(db, owner.licenseId);
  const invite = await signInvite(env, { gym: owner.licenseId, sid: id, preset, nonce, exp });
  if (!invite) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  return json(200, { ok: true, seatId: id, invite, email, preset, status: 'pending', used: used + 1, cap: INSTRUCTOR_SEAT_CAP });
}

type InvitePayload = { typ?: string; gym?: string; sid?: string; preset?: string; nonce?: string; exp?: number; v?: number };

async function readInvite(token: string, env: SeatEnv): Promise<InvitePayload | null> {
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return null;
  const parsed = await readSignedJson(token, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as InvitePayload;
  if (row.typ !== 'seat-invite' || row.v !== 1) return null;
  return row;
}

async function ownerAccess(db: D1Database, env: SeatEnv, gymLicenseId: string, now: Date, fetchImpl: typeof fetch) {
  return accessForLicense(db, gymLicenseId, now, { env, fetchImpl, pepper: env.CODE_HASH_PEPPER });
}

function seatDoors(entitled: boolean): Door[] {
  return entitled ? expandGrants(['pro']) : [];
}

export async function issueSeatToken(
  env: SeatEnv,
  input: {
    gym: string;
    sid: string;
    preset: string;
    deviceId: string;
    now: Date;
    subs?: SubscriptionClaim;
    entitled: boolean;
  },
): Promise<string | null> {
  return issueToken(
    env.ENTITLEMENT_SIGNING_KEY,
    {
      licenseId: input.gym,
      grants: seatDoors(input.entitled),
      tier: 'seat',
      src: 'seat',
      deviceId: input.deviceId,
      now: input.now,
      kind: 'seat',
      subs: input.subs ?? (input.entitled ? { state: 'active' } : { state: 'locked' }),
      gym: input.gym,
      sid: input.sid,
      preset: input.preset,
    },
    env.ENTITLEMENT_KEY_ID,
  );
}

export async function handleSeatAccept(
  request: Request,
  env: SeatEnv,
  db: D1Database | null,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const body = (await request.json()) as { invite?: unknown; deviceId?: unknown };
  const invite = typeof body.invite === 'string' ? body.invite.trim() : '';
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 80) : '';
  if (!invite || !deviceId) return json(400, { ok: false, error: 'This invite is not valid.' });
  const stamp = now();
  const signed = await readInvite(invite, env);
  let row: SeatRow | null = null;
  if (signed) {
    if (typeof signed.exp === 'number' && signed.exp <= Math.floor(stamp.getTime() / 1000)) {
      return json(400, { ok: false, error: 'This invite has expired. Ask the owner for a new link.' });
    }
    row = await db.prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE id = ?`).bind(signed.sid).first<SeatRow>();
    if (!row || row.gymLicenseId !== signed.gym || (row.inviteNonce && row.inviteNonce !== signed.nonce)) {
      return json(400, { ok: false, error: 'This invite is not valid.' });
    }
  } else {
    row = await db.prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE id = ?`).bind(invite).first<SeatRow>();
    if (!row) return json(400, { ok: false, error: 'This invite is not valid.' });
  }
  if (row.revokedAt || row.status === 'revoked') return json(403, { ok: false, error: 'This seat was revoked.' });
  if (row.claimedDevice && row.claimedDevice !== deviceId) {
    return json(409, { ok: false, error: 'This seat is already open on another device. The owner can reset it.' });
  }
  await db
    .prepare(
      `UPDATE seats SET status = 'claimed', claimed_device = ?, claimed_at = COALESCE(claimed_at, ?) WHERE id = ?`,
    )
    .bind(deviceId, stamp.toISOString(), row.id)
    .run();
  const access = await ownerAccess(db, env, row.gymLicenseId, stamp, fetchImpl);
  const entitled = access ? access.access.entitled : true;
  const subs = access ? claimForAccess(access.access) : { state: 'active' as const };
  const token = await issueSeatToken(env, {
    gym: row.gymLicenseId,
    sid: row.id,
    preset: row.preset ?? '',
    deviceId,
    now: stamp,
    subs,
    entitled,
  });
  if (!token) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  return json(200, {
    ok: true,
    token,
    seatId: row.id,
    gymId: row.gymLicenseId,
    preset: row.preset,
    email: row.emailLabel,
    status: 'claimed',
    subs,
  });
}

export async function handleSeatRevoke(request: Request, env: SeatEnv, db: D1Database | null, now: () => Date = () => new Date()): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const owner = await readOwner(request, env);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as { seatId?: unknown };
  const seatId = typeof body.seatId === 'string' ? body.seatId.trim() : '';
  const result = await db
    .prepare(
      `UPDATE seats SET status = 'revoked', revoked_at = ? WHERE id = ? AND gym_license_id = ? AND revoked_at IS NULL`,
    )
    .bind(now().toISOString(), seatId, owner.licenseId)
    .run();
  if (!result.meta.changes) return json(404, { ok: false, error: 'That seat was not found.' });
  return json(200, { ok: true, seatId, status: 'revoked' });
}

export async function handleSeatReset(request: Request, env: SeatEnv, db: D1Database | null, now: () => Date = () => new Date()): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const owner = await readOwner(request, env);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as { seatId?: unknown };
  const seatId = typeof body.seatId === 'string' ? body.seatId.trim() : '';
  const row = await db
    .prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE id = ? AND gym_license_id = ?`)
    .bind(seatId, owner.licenseId)
    .first<SeatRow>();
  if (!row || row.revokedAt) return json(404, { ok: false, error: 'That seat was not found.' });
  const nonce = crypto.randomUUID();
  const exp = Math.floor(now().getTime() / 1000) + INVITE_SECONDS;
  await db
    .prepare(
      `UPDATE seats SET status = 'pending', claimed_device = NULL, claimed_at = NULL, invite_nonce = ?, invite_expires_at = ? WHERE id = ?`,
    )
    .bind(nonce, new Date(exp * 1000).toISOString(), seatId)
    .run();
  const invite = await signInvite(env, { gym: owner.licenseId, sid: seatId, preset: row.preset ?? '', nonce, exp });
  if (!invite) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  return json(200, { ok: true, seatId, invite, status: 'pending' });
}

export async function handleSeatList(request: Request, env: SeatEnv, db: D1Database | null): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const owner = await readOwner(request, env);
  if (owner instanceof Response) return owner;
  const rows = await db
    .prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE gym_license_id = ? ORDER BY created_at`)
    .bind(owner.licenseId)
    .all<SeatRow>();
  const seats = rows.results.map((row) => ({
    seatId: row.id,
    email: row.emailLabel,
    preset: row.preset,
    status: row.status,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    claimed: Boolean(row.claimedDevice),
    legacy: row.legacy === 1,
  }));
  const used = seats.filter((seat) => OPEN_STATUSES.includes(seat.status)).length;
  return json(200, { ok: true, seats, used, cap: INSTRUCTOR_SEAT_CAP });
}

type SyncSeat = { id?: unknown; inviteToken?: unknown; email?: unknown; preset?: unknown; status?: unknown };

export async function handleSeatSync(
  request: Request,
  env: SeatEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const owner = await readOwner(request, env);
  if (owner instanceof Response) return owner;
  const body = (await request.json()) as { seats?: unknown };
  const incoming = Array.isArray(body.seats) ? (body.seats as SyncSeat[]) : [];
  const stamp = now().toISOString();
  const sunsetAt = sunset(env);
  let registered = 0;
  for (const seat of incoming.slice(0, INSTRUCTOR_SEAT_CAP + 5)) {
    const inviteToken = typeof seat.inviteToken === 'string' ? seat.inviteToken.trim() : '';
    const rawId = typeof seat.id === 'string' ? seat.id.trim() : '';
    const id = (inviteToken || rawId).slice(0, 120);
    if (!id || id.includes('.')) continue;
    const existing = await db.prepare(`SELECT id FROM seats WHERE id = ?`).bind(id).first<{ id: string }>();
    if (existing) continue;
    const used = await openSeatCount(db, owner.licenseId);
    const status = seat.status === 'revoked' ? 'revoked' : seat.status === 'active' ? 'claimed' : 'pending';
    if (status !== 'revoked' && used >= INSTRUCTOR_SEAT_CAP) continue;
    await db
      .prepare(
        `INSERT INTO seats (
           id, gym_license_id, preset, status, created_at, revoked_at, email_label, legacy, sunset_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .bind(
        id,
        owner.licenseId,
        presetOf(seat.preset) || null,
        status,
        stamp,
        status === 'revoked' ? stamp : null,
        labelOf(seat.email) || null,
        sunsetAt,
      )
      .run();
    registered += 1;
  }
  return json(200, { ok: true, registered, sunsetAt, cap: INSTRUCTOR_SEAT_CAP });
}

export async function refreshSeat(
  db: D1Database,
  env: SeatEnv,
  claims: { gym?: string; sid?: string; did: string; preset?: string },
  now: Date,
  fetchImpl: typeof fetch,
): Promise<{ doors: Door[]; subs: SubscriptionClaim } | { error: true; status: number; body: { ok: false; revoked: boolean; error: string } }> {
  if (!claims.sid || !claims.gym) {
    return { error: true, status: 401, body: { ok: false, revoked: true, error: 'This seat is not valid.' } };
  }
  const row = await db.prepare(`SELECT ${SEAT_COLUMNS} FROM seats WHERE id = ?`).bind(claims.sid).first<SeatRow>();
  if (!row || row.revokedAt || row.status === 'revoked' || row.gymLicenseId !== claims.gym) {
    return { error: true, status: 401, body: { ok: false, revoked: true, error: 'This seat was revoked.' } };
  }
  if (row.claimedDevice && row.claimedDevice !== claims.did) {
    return { error: true, status: 401, body: { ok: false, revoked: true, error: 'This seat is open on another device.' } };
  }
  const access = await ownerAccess(db, env, row.gymLicenseId, now, fetchImpl);
  const entitled = access ? access.access.entitled : true;
  const subs = access ? claimForAccess(access.access) : { state: 'active' as const };
  return { doors: seatDoors(entitled), subs };
}
