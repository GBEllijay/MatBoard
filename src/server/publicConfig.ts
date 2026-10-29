import { publicJwkOf, parsePrivateJwk } from '../lib/entitlementToken.ts';
import { emailSenderFromEnv, type EmailEnv } from './emailSender.ts';
import type { D1Database } from './d1.ts';
import {
  DEVICE_ACTIVE_DAYS,
  DEVICES_PER_INSTRUCTOR_SEAT,
  INSTRUCTOR_SEAT_CAP,
  LEGACY_UNLOCK_AMNESTY_DAYS,
  PRO_DEVICES_PER_LICENSE,
  RESTORE_FROM_ADDRESS,
} from './paywallDecisions.ts';
import { LEGACY_AMNESTY_ENDS_AT } from '../lib/legacyUnlock.ts';
import { SEAT_SUNSET_ENDS_AT } from '../lib/seatSunset.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export const MIN_APP_VERSION = '2';

export type ConfigEnv = EmailEnv & {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  CODE_HASH_PEPPER?: string;
  LEGACY_AMNESTY_ENDS_AT?: string;
  MIN_APP_VERSION?: string;
  SEAT_SUNSET_ENDS_AT?: string;
};

function amnestyEnd(env: ConfigEnv): string {
  const override = env.LEGACY_AMNESTY_ENDS_AT?.trim() ?? '';
  if (override && Number.isFinite(Date.parse(override))) return new Date(override).toISOString();
  return LEGACY_AMNESTY_ENDS_AT;
}

function seatSunset(env: ConfigEnv): string {
  const override = env.SEAT_SUNSET_ENDS_AT?.trim() ?? '';
  if (override && Number.isFinite(Date.parse(override))) return new Date(override).toISOString();
  return SEAT_SUNSET_ENDS_AT;
}

export function handlePublicConfig(request: Request, env: ConfigEnv, db: D1Database | null): Response {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...JSON_HEADERS, allow: 'GET' },
    });
  }
  const privateJwk = parsePrivateJwk(env.ENTITLEMENT_SIGNING_KEY);
  const kid = env.ENTITLEMENT_KEY_ID?.trim() || 'k1';
  const signing = Boolean(privateJwk);
  const sender = emailSenderFromEnv(env);
  const restoreAvailable = Boolean(db && sender && env.CODE_HASH_PEPPER?.trim() && env.TURNSTILE_SECRET_KEY?.trim());
  const body: Record<string, unknown> = {
    signing,
    keys: signing && privateJwk ? [{ kid, alg: 'ES256', jwk: publicJwkOf(privateJwk) }] : [],
    minAppVersion: env.MIN_APP_VERSION?.trim() || MIN_APP_VERSION,
    legacyAmnestyEndsAt: amnestyEnd(env),
    seatSunsetEndsAt: seatSunset(env),
    instructorSeatCap: INSTRUCTOR_SEAT_CAP,
    legacyAmnestyDays: LEGACY_UNLOCK_AMNESTY_DAYS,
    restoreAvailable,
    restoreDryRun: sender?.name === 'dry-run',
    restoreFrom: RESTORE_FROM_ADDRESS,
    devicesPerProLicense: PRO_DEVICES_PER_LICENSE,
    devicesPerInstructorSeat: DEVICES_PER_INSTRUCTOR_SEAT,
    deviceActiveDays: DEVICE_ACTIVE_DAYS,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY?.trim() || null,
  };
  if (!signing) {
    body.message = 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY. Owner test unlock still works.';
  } else if (!db) {
    body.message = 'Entitlement storage is not set up yet. Create the D1 database and bind ENTITLEMENTS_DB.';
  } else if (!restoreAvailable) {
    body.message = 'Restore is not available yet. Set RESEND_API_KEY and TURNSTILE_SECRET_KEY when you are ready to send mail.';
  }
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}
