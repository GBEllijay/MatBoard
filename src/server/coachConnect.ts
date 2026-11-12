/**
 * Coach connect QR on Advantage Cloud. No Google Drive or OneDrive folder.
 *
 * The gym owner (not a seat) with Advantage Cloud asks for a signed link.
 * An instructor scans it on Connect to my academy. The server checks the
 * signature and the date and hands back the gym's license id and name, and
 * her phone joins that academy on Advantage Cloud (joinCloudAcademy).
 *
 * From then on her card shares land in the owner's existing card-share inbox,
 * so the owner can assess and promote her with the coach tools already there.
 * Reviewing students' cards and sending assessments back stays on her
 * Coach or Instructors seat (studentInbox.ts canWriteStudentInbox).
 *
 * One academy-wide code per gym, not per instructor or seat. Every instructor
 * scans the same QR. It is reusable (no single-use cap and no expiry date).
 * The owner can rotate it: a new key is written to the gym's Advantage Cloud
 * bucket (groups/<license>/coach-connect/current.json) and the old QR stops
 * working. The signed link carries that key.
 *
 * The code says who showed it. The signed claim carries `via`: the showing
 * instructor's id (seat id, or 'owner' for the owner; instructorIdentity.ts).
 * It is set by the server from the caller's own pass, so a phone cannot pick
 * it, and it is bound to this gym's license inside the signature, so it cannot
 * be replayed into another license. A student keeps the signed code as proof
 * (readCoachConnectVia) for card shares and "Send to my instructor".
 * Only Coach and Instructors seats (the ones that can answer through Coach Sync)
 * put their id in the code. Any other seat shows it without `via`, which routes
 * to the owner.
 *
 * Nothing here mints a license, a seat, a student pass, or touches billing.
 * No D1 table: the link is a signed claim, like seat invites, checked against
 * the current key in R2.
 */

import { readSignedJson, signJson, verifyToken, type EntitlementClaims, type PublicJwk } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import type { InboxBucket, InboxObject } from './studentInbox.ts';
import { gymHasCloud } from './studentLicenses.ts';
import { OWNER_INSTRUCTOR_ID, instructorIdFromClaims, isInstructorId } from '../lib/instructorIdentity.ts';
import { signingMaterial } from './tokenIssue.ts';

const LICENSE_RE = /^[A-Za-z0-9_-]{8,80}$/;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export type CoachConnectEnv = {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  ENTITLEMENTS_DB?: D1Database | null;
  GYM_MEDIA?: InboxBucket;
};

export type CoachConnectClaim = {
  typ: 'coach-connect';
  v: 1;
  gym: string;
  name: string;
  /** The gym's current coach connect key. Rotating it retires every older QR. */
  key: string;
  /** Instructor who showed the code. Omitted on codes made before this existed (routes to the owner). */
  via?: string;
};

/** Seat presets that answer a student through Coach Sync, so their code carries their id. */
const VIA_PRESETS = new Set(['coach', 'instructors']);

/** The instructor id a seat or the owner puts in the code it shows, or undefined. */
export function viaForClaims(claims: EntitlementClaims): string | undefined {
  const seat = claims.src === 'seat' || claims.tier === 'seat';
  if (seat && !VIA_PRESETS.has(claims.preset ?? '')) return undefined;
  return instructorIdFromClaims(claims) ?? undefined;
}

const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function coachConnectKeyPath(license: string): string {
  return `groups/${license}/coach-connect/current.json`;
}

async function objectText(object: InboxObject): Promise<string> {
  if (object.text) return object.text();
  if (!object.body) return '';
  return new Response(object.body).text();
}

async function readCurrent(bucket: InboxBucket, license: string): Promise<{ key: string; name: string } | null> {
  const stored = await bucket.get(coachConnectKeyPath(license));
  if (!stored) return null;
  try {
    const row = JSON.parse(await objectText(stored)) as { key?: unknown; name?: unknown };
    return typeof row.key === 'string' && KEY_RE.test(row.key) ? { key: row.key, name: clipName(row.name) } : null;
  } catch {
    return null;
  }
}

async function readCurrentKey(bucket: InboxBucket, license: string): Promise<string | null> {
  return (await readCurrent(bucket, license))?.key ?? null;
}

/**
 * An instructor seat on this gym, not locked, whose academy has Advantage Cloud.
 * Seats only read the current code. They never make or replace it.
 */
export async function seatSeesCloudCode(
  claims: EntitlementClaims | null,
  db: D1Database | null,
  now: Date,
): Promise<boolean> {
  if (!claims || (claims.src !== 'seat' && claims.tier !== 'seat')) return false;
  if (claims.subs?.state === 'locked') return false;
  if (typeof claims.gym !== 'string' || !LICENSE_RE.test(claims.gym)) return false;
  if (claims.subs?.cloud === true) return true;
  return db ? gymHasCloud(db, claims.gym, now) : false;
}

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function clipName(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

/**
 * Same rule as the Pro Plus Cloud card (proPlusCloudDoorOpen), plus the gym's
 * stored Cloud grant. Seats and locked passes never issue a coach connect QR.
 */
export async function ownerHasCloud(
  claims: EntitlementClaims | null,
  db: D1Database | null,
  now: Date,
): Promise<boolean> {
  if (!claims) return false;
  if (claims.src === 'seat' || claims.tier === 'seat') return false;
  if (claims.subs?.state === 'locked') return false;
  if (!LICENSE_RE.test(claims.sub)) return false;
  if (claims.src === 'owner' || claims.tier === 'owner') return true;
  if (claims.subs?.cloud === true) return true;
  if (claims.src === 'code' && claims.grants.includes('pro')) return true;
  return db ? gymHasCloud(db, claims.sub, now) : false;
}

export function readCoachConnectClaim(value: unknown): CoachConnectClaim | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<CoachConnectClaim>;
  if (row.typ !== 'coach-connect' || row.v !== 1) return null;
  if (typeof row.gym !== 'string' || !LICENSE_RE.test(row.gym)) return null;
  if (typeof row.key !== 'string' || !KEY_RE.test(row.key)) return null;
  const claim: CoachConnectClaim = { typ: 'coach-connect', v: 1, gym: row.gym, name: clipName(row.name), key: row.key };
  if (row.via !== undefined) {
    if (!isInstructorId(row.via)) return null;
    claim.via = row.via;
  }
  return claim;
}

/**
 * Server side: which instructor a student's saved coach connect code names, for this license only.
 * Checks the signature and that the code belongs to `license`. It does not check the current key,
 * so rotating the QR does not strand students who already connected. Null when it is not a real code.
 */
export async function readCoachConnectVia(
  invite: string,
  keys: readonly { kid: string; jwk: PublicJwk }[],
  license: string,
): Promise<string | null> {
  if (typeof invite !== 'string' || !invite || invite.length > 4000) return null;
  const claim = readCoachConnectClaim(await readSignedJson(invite, keys));
  if (!claim || claim.gym !== license) return null;
  return claim.via ?? null;
}

export async function handleCoachConnect(
  request: Request,
  env: CoachConnectEnv,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  const keys = [{ kid: material.kid, jwk: material.publicJwk }];
  const bucket = env.GYM_MEDIA;
  if (!bucket) return json(503, { ok: false, reason: 'unbound', error: 'Advantage Cloud is not connected on this site.' });
  let body: { action?: unknown; token?: unknown; invite?: unknown; gymName?: unknown } = {};
  try {
    body = JSON.parse(await request.text()) as typeof body;
  } catch {
    return json(400, { ok: false, error: 'The request was not JSON.' });
  }
  const stamp = now();
  const bearer = async () => {
    const auth = request.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : typeof body.token === 'string' ? body.token : '';
    return token ? verifyToken(token, keys) : null;
  };

  if (body.action === 'current') {
    // Instructor Edition: a seat shows the same academy-wide code. Read only.
    const claims = await bearer();
    if (!claims) return json(401, { ok: false, error: 'This device needs to restore access.' });
    const db = env.ENTITLEMENTS_DB ?? null;
    const isSeat = claims.src === 'seat' || claims.tier === 'seat';
    const license = isSeat ? claims.gym ?? '' : claims.sub;
    const allowed = isSeat ? await seatSeesCloudCode(claims, db, stamp) : await ownerHasCloud(claims, db, stamp);
    if (!allowed) return json(403, { ok: false, reason: 'no-cloud', error: 'The coach connect QR needs Advantage Cloud on this gym.' });
    const current = await readCurrent(bucket, license);
    if (!current) {
      return json(404, { ok: false, reason: 'none', error: 'The gym owner has not shown the coach connect QR yet.' });
    }
    const claim: CoachConnectClaim = { typ: 'coach-connect', v: 1, gym: license, name: current.name, key: current.key };
    const via = viaForClaims(claims);
    if (via) claim.via = via;
    const invite = await signJson(material.kid, claim, material.privateJwk);
    return json(200, { ok: true, invite, gym: license, gymName: current.name, owner: !isSeat, via: via ?? null });
  }

  if (body.action === 'issue' || body.action === 'rotate') {
    const claims = await bearer();
    if (!claims) return json(401, { ok: false, error: 'This device needs to restore access.' });
    if (claims.src === 'seat' || claims.tier === 'seat') {
      return json(403, { ok: false, error: 'Only the gym owner can make a coach connect QR.' });
    }
    if (!(await ownerHasCloud(claims, env.ENTITLEMENTS_DB ?? null, stamp))) {
      return json(403, { ok: false, error: 'The coach connect QR needs Advantage Cloud on this gym.' });
    }
    // Issue shows the gym's one current code (made on first use). Rotate retires it.
    const before = await readCurrent(bucket, claims.sub);
    const name = clipName(body.gymName) || before?.name || '';
    let key = body.action === 'rotate' ? null : before?.key ?? null;
    const rotated = !key;
    if (!key) key = newKey();
    if (rotated || name !== before?.name) {
      // The name rides along so instructor seats show the same code and gym name.
      await bucket.put(coachConnectKeyPath(claims.sub), JSON.stringify({ key, name, at: stamp.getTime() }), {
        httpMetadata: { contentType: 'application/json' },
      });
    }
    const claim: CoachConnectClaim = { typ: 'coach-connect', v: 1, gym: claims.sub, name, key, via: OWNER_INSTRUCTOR_ID };
    const invite = await signJson(material.kid, claim, material.privateJwk);
    return json(200, { ok: true, invite, gym: claim.gym, gymName: claim.name, rotated, via: OWNER_INSTRUCTOR_ID });
  }

  if (body.action === 'accept') {
    const invite = typeof body.invite === 'string' ? body.invite.trim() : '';
    if (!invite) return json(400, { ok: false, error: 'This coach connect link is not valid.' });
    const claim = readCoachConnectClaim(await readSignedJson(invite, keys));
    if (!claim) return json(400, { ok: false, error: 'This coach connect link is not valid.' });
    if ((await readCurrentKey(bucket, claim.gym)) !== claim.key) {
      return json(400, { ok: false, error: 'This coach connect QR was replaced. Ask the gym owner for the current one.' });
    }
    return json(200, { ok: true, gym: claim.gym, gymName: claim.name, viaInstructorId: claim.via ?? null });
  }

  return json(400, { ok: false, error: 'Unknown action.' });
}
