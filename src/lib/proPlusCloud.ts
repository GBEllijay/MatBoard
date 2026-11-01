import { entitlementSnapshot, subscribeEntitlement } from './entitlement.ts';
import { readOwnerTestGrant, subscribeOwnerTest } from './ownerTestGrant.ts';

/**
 * Advantage Pro Plus Cloud is open for an owner pass or an alpha code.
 * A Stripe Pro purchase stays locked: that plan still uses the customer's own drive,
 * and this plan has no checkout. Display only. It does not grant a door.
 */
export function proPlusCloudUnlocked(): boolean {
  const claims = entitlementSnapshot().claims;
  if (claims && (claims.tier === 'owner' || claims.tier === 'alpha' || claims.src === 'owner')) return true;
  const testTier = readOwnerTestGrant()?.tier ?? '';
  return testTier === 'all' || testTier === 'owner' || testTier === 'pro' || testTier === 'alpha';
}

export function subscribeProPlusCloud(fn: () => void): () => void {
  const stopEntitlement = subscribeEntitlement(fn);
  const stopOwnerTest = subscribeOwnerTest(fn);
  return () => {
    stopEntitlement();
    stopOwnerTest();
  };
}
