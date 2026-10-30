import type { D1Database } from '../src/server/d1.ts';
import { kvEntitlementStore, type EntitlementStore, type KvBinding } from '../src/server/entitlements.ts';
import type { DoNamespace } from '../src/server/redemptionLedger.ts';
import type { StripeRuntimeEnv } from '../src/server/stripeCheckout.ts';

export type PagesEnv = StripeRuntimeEnv & {
  /** Pages static assets. Present on Cloudflare. The paid-chunk Function reads files through it. */
  ASSETS?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  WHITE_ENTITLEMENTS?: KvBinding;
  CODE_HASH_PEPPER?: string;
  CODE_CATALOG?: string;
  OWNER_TEST_SECRET?: string;
  CODE_REDEMPTIONS?: DoNamespace;
  ENTITLEMENTS_DB?: D1Database;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_PROVIDER?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  LEGACY_AMNESTY_ENDS_AT?: string;
  MIN_APP_VERSION?: string;
  SEAT_SUNSET_ENDS_AT?: string;
};

export function pagesEntitlementStore(env: PagesEnv): EntitlementStore | null {
  if (!env.WHITE_ENTITLEMENTS) return null;
  return kvEntitlementStore(env.WHITE_ENTITLEMENTS);
}
