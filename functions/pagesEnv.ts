import { kvEntitlementStore, type EntitlementStore, type KvBinding } from '../src/server/entitlements.ts';
import type { StripeRuntimeEnv } from '../src/server/stripeCheckout.ts';

export type PagesEnv = StripeRuntimeEnv & {
  WHITE_ENTITLEMENTS?: KvBinding;
};

export function pagesEntitlementStore(env: PagesEnv): EntitlementStore | null {
  if (!env.WHITE_ENTITLEMENTS) return null;
  return kvEntitlementStore(env.WHITE_ENTITLEMENTS);
}
