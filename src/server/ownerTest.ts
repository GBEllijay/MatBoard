import type { Door } from '../lib/entitlementToken.ts';
import type { GrantDoor } from './codeCatalog.ts';
import { secretMatches } from './codeCrypto.ts';
import { expandGrants } from './grantMatrix.ts';
import { GENERIC_CODE_FAILURE } from './paywallDecisions.ts';
import { allowAttempt, clientIp, rateBucket, rateLimitedResponse, OWNER_TEST_LIMIT } from './rateLimit.ts';
import { issueToken } from './tokenIssue.ts';

export type OwnerTestEnv = {
  OWNER_TEST_SECRET?: string;
  CODE_HASH_PEPPER?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

const DOORS: readonly GrantDoor[] = ['white', 'student', 'coach', 'pro', 'seat'];

const TIER_GRANTS: Record<string, GrantDoor[]> = {
  white: ['white'],
  student: ['student'],
  coach: ['coach'],
  pro: ['pro', 'student'],
  seat: ['seat'],
  all: ['white', 'student', 'coach', 'pro', 'seat'],
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function genericFailure(): Response {
  return json(400, { ok: false, error: GENERIC_CODE_FAILURE });
}

function clampDays(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return 7;
  return Math.min(30, Math.max(1, Math.floor(value)));
}

/**
 * Owner test unlock. The secret is compared in constant time and is never
 * logged or returned. An unset secret fails the same way as a wrong secret.
 */
export type OwnerTestServices = {
  signingKey?: string;
  keyId?: string;
};

export async function handleOwnerTest(
  request: Request,
  env: OwnerTestEnv,
  kv: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<unknown> } | null = null,
  now: () => Date = () => new Date(),
  services: OwnerTestServices = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const bucket = await rateBucket('owner-test', clientIp(request), pepper);
  if (!(await allowAttempt(bucket, OWNER_TEST_LIMIT, now().getTime(), kv))) return rateLimitedResponse();

  const raw = await request.text();
  if (raw.length > 4_000) return json(413, { error: 'Request is too large.' });
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return genericFailure();
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return genericFailure();
  const secret = (body as { secret?: unknown }).secret;
  if (typeof secret !== 'string') return genericFailure();
  const match = await secretMatches(secret, env.OWNER_TEST_SECRET?.trim());
  if (!match) return genericFailure();

  const action = (body as { action?: unknown }).action;
  if (action === 'clear') return json(200, { ok: true, cleared: true, grants: [], source: 'owner-test' });

  const tierRaw = (body as { tier?: unknown }).tier;
  const tier = typeof tierRaw === 'string' ? tierRaw.trim().toLowerCase() : 'all';
  const grants = TIER_GRANTS[tier];
  if (!grants) return genericFailure();
  const days = clampDays((body as { days?: unknown }).days);
  const stamp = now();
  const expiresAt = new Date(stamp.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const listed = grants.filter((door): door is GrantDoor => (DOORS as readonly string[]).includes(door));
  const doors = expandGrants(listed.filter((door): door is Door => door !== 'seat'));
  const deviceField = (body as { deviceId?: unknown }).deviceId;
  const deviceId = typeof deviceField === 'string' && deviceField.trim() ? deviceField.trim().slice(0, 80) : 'owner-test-device';
  const signingKey = services.signingKey ?? env.ENTITLEMENT_SIGNING_KEY;
  let token: string | null = null;
  if (signingKey && doors.length) {
    token = await issueToken(
      signingKey,
      {
        licenseId: 'owner-test',
        grants: doors,
        tier: 'owner',
        src: 'owner',
        deviceId,
        now: stamp,
        kind: 'owner-test',
        ownerTestSeconds: days * 24 * 60 * 60,
      },
      services.keyId ?? env.ENTITLEMENT_KEY_ID,
    );
  } else if (signingKey && listed.includes('seat')) {
    // The seat preview has no product door. The token still has to fetch Media
    // Console and Lesson Cloud. Preset matches the in-memory instructors seat.
    const exp = Math.floor(stamp.getTime() / 1000) + days * 24 * 60 * 60;
    token = await issueToken(
      signingKey,
      {
        licenseId: 'owner-test',
        grants: [],
        tier: 'seat',
        src: 'seat',
        deviceId,
        now: stamp,
        kind: 'seat',
        preset: 'instructors',
        absoluteExp: exp,
      },
      services.keyId ?? env.ENTITLEMENT_KEY_ID,
    );
  }
  return json(200, {
    ok: true,
    grants: listed,
    expiresAt,
    source: 'owner-test',
    tier,
    ...(token ? { token, deviceId } : { degraded: !signingKey }),
  });
}
