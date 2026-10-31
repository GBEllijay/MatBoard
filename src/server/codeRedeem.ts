import type { Door } from '../lib/entitlementToken.ts';
import { catalogHasCaps, findCode, loadCodeCatalog, type CodeRecord, type KvListBinding } from './codeCatalog.ts';
import { keyedHash, normalizeCode, normalizeEmail } from './codeCrypto.ts';
import type { D1Database } from './d1.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { emailHint, recordPurchase } from './purchaseRecords.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_MEDIA, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from './routes.ts';
import { appVersionOf } from '../lib/appCapability.ts';
import { issueToken } from './tokenIssue.ts';
import {
  CAP_STORE_ERROR,
  CODE_SETUP_ERROR,
  GENERIC_CODE_FAILURE,
} from './paywallDecisions.ts';
import { allowAttempt, clientIp, rateBucket, rateLimitedResponse, REDEEM_LIMIT } from './rateLimit.ts';
import {
  durableRedemptionLedger,
  kvRedemptionLedger,
  type DoNamespace,
  type RedemptionLedger,
} from './redemptionLedger.ts';

export type CodeRedeemEnv = {
  CODE_HASH_PEPPER?: string;
  CODE_CATALOG?: string;
  CODE_REDEMPTIONS?: DoNamespace;
};

type CounterKv = KvListBinding;

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

export function capMessage(reason: 'total' | 'daily' | 'email' | 'ip'): string {
  if (reason === 'total') return 'This free unlock has reached its limit.';
  if (reason === 'daily') return "Today's free unlocks are used up. Try again tomorrow.";
  if (reason === 'email') return 'That email already used this free unlock.';
  return 'This network already used this free unlock today. Try again tomorrow.';
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function grantExpiry(record: CodeRecord, now: Date): string | null {
  if (!record.grantDays) return null;
  return new Date(now.getTime() + record.grantDays * 24 * 60 * 60 * 1000).toISOString();
}

export function ledgerFor(env: CodeRedeemEnv, kv: CounterKv | null, override?: RedemptionLedger | null): RedemptionLedger | null {
  if (override) return override;
  if (env.CODE_REDEMPTIONS) return durableRedemptionLedger(env.CODE_REDEMPTIONS);
  if (kv) return kvRedemptionLedger(kv);
  return null;
}

export type CodeRedeemServices = {
  db?: D1Database | null;
  signingKey?: string;
  keyId?: string;
};

const PRODUCT_FOR_DOOR: Record<Door, string> = {
  white: API_PRODUCT_ID,
  student: API_PRODUCT_STUDENT,
  coach: API_PRODUCT_COACH,
  pro: API_PRODUCT_PRO,
  media: API_PRODUCT_MEDIA,
};

export async function handleCodeRedeem(
  request: Request,
  env: CodeRedeemEnv,
  kv: CounterKv | null = null,
  ledger: RedemptionLedger | null = null,
  now: () => Date = () => new Date(),
  services: CodeRedeemServices = {},
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const ip = clientIp(request);
  const bucket = await rateBucket('redeem', ip, pepper);
  if (!(await allowAttempt(bucket, REDEEM_LIMIT, now().getTime(), kv))) return rateLimitedResponse();
  if (!pepper) return json(503, { ok: false, error: CODE_SETUP_ERROR });

  const raw = await request.text();
  if (raw.length > 4_000) return json(413, { error: 'Request is too large.' });
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return json(400, { error: 'Request body must be JSON.' });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Request body must be a JSON object.' });
  const codeField = (body as { code?: unknown }).code;
  const emailField = (body as { email?: unknown }).email;
  if (typeof codeField !== 'string' || !normalizeCode(codeField)) return genericFailure();
  if (emailField !== undefined && emailField !== null && typeof emailField !== 'string') return genericFailure();
  const email = typeof emailField === 'string' ? emailField.trim() : '';
  if (email && (email.length > 320 || !email.includes('@') || /\s/.test(email))) {
    return json(400, { ok: false, error: 'Enter a valid email, or leave it blank.' });
  }

  const catalog = await loadCodeCatalog(env.CODE_CATALOG, kv);
  const codeHash = await keyedHash(normalizeCode(codeField), pepper, 'code');
  const record = findCode(catalog, codeHash);
  if (!record || record.retired) return genericFailure();
  if (record.expiresAt && Date.parse(record.expiresAt) <= now().getTime()) return genericFailure();

  const needsLedger = catalogHasCaps(record);
  const activeLedger = ledgerFor(env, kv, ledger);
  if (needsLedger && !activeLedger) return json(503, { ok: false, error: CAP_STORE_ERROR });
  if (needsLedger && activeLedger) {
    const reserved = await activeLedger.reserve({
      codeId: record.id,
      totalCap: record.maxUses,
      dailyCap: record.dailyCap,
      perEmail: email ? record.perEmail : null,
      perIpPerDay: record.perIpPerDay,
      emailHash: email ? await keyedHash(normalizeEmail(email), pepper, 'email') : null,
      ipHash: await keyedHash(ip, pepper, 'ip'),
      day: utcDay(now()),
    });
    if (!reserved.ok) return json(409, { ok: false, error: capMessage(reserved.reason) });
  }

  const listed = record.grants.filter((door) => door !== 'seat');
  const doors = expandGrants(listed);
  const expiresAt = grantExpiry(record, now());
  const deviceField = (body as { deviceId?: unknown }).deviceId;
  const deviceId = typeof deviceField === 'string' && deviceField.trim() ? deviceField.trim().slice(0, 80) : crypto.randomUUID();
  let token: string | null = null;
  if (services.signingKey && doors.length) {
    const src = record.kind === 'free-white' ? 'free' : record.kind === 'owner' ? 'owner' : 'code';
    const refSalt = email ? await keyedHash(normalizeEmail(email), pepper, 'email') : deviceId;
    let licenseId: string = crypto.randomUUID();
    if (services.db) {
      for (const door of doors) {
        const recorded = await recordPurchase(services.db, {
          email,
          product: PRODUCT_FOR_DOOR[door],
          source: src === 'free' ? 'free' : src === 'owner' ? 'owner' : 'code',
          sourceRef: `code:${record.id}:${refSalt}:${door}`,
          sessionId: `code:${record.id}:${refSalt}`,
          pepper,
          now: now(),
          endsAt: expiresAt,
          status: 'active',
        });
        licenseId = recorded.licenseId;
      }
    }
    token = await issueToken(
      services.signingKey,
      {
        licenseId,
        grants: doors,
        tier: record.kind === 'owner' ? 'owner' : tierForGrants(doors, src),
        src,
        deviceId,
        now: now(),
        kind: 'code',
        grantEndsAt: expiresAt,
        emailHint: await emailHint(email, pepper),
        appVersion: appVersionOf(request),
      },
      services.keyId,
    );
  }
  return json(200, {
    ok: true,
    grants: listed,
    expiresAt,
    source: 'code',
    ...(token ? { token, deviceId } : {}),
  });
}
