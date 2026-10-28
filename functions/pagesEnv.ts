import { kvEntitlementStore, type EntitlementStore, type KvBinding } from '../src/server/entitlements.ts';
import type { DoNamespace } from '../src/server/redemptionLedger.ts';
import type { StripeRuntimeEnv } from '../src/server/stripeCheckout.ts';

export type PagesEnv = StripeRuntimeEnv & {
  WHITE_ENTITLEMENTS?: KvBinding;
  CODE_HASH_PEPPER?: string;
  CODE_CATALOG?: string;
  OWNER_TEST_SECRET?: string;
  CODE_REDEMPTIONS?: DoNamespace;
};

export function pagesEntitlementStore(env: PagesEnv): EntitlementStore | null {
  if (!env.WHITE_ENTITLEMENTS) return null;
  return kvEntitlementStore(env.WHITE_ENTITLEMENTS);
}
