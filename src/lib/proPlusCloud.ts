import type { EntitlementClaims } from './entitlementToken.ts';
import { entitlementSnapshot, subscribeEntitlement } from './entitlement.ts';
import { ownerTestActive, subscribeOwnerTest } from './ownerTestGrant.ts';

/**
 * Pass fields this gate reads. A full entitlement claim satisfies it.
 * This does not add a door. An unknown door would break older passes.
 */
export type ProPlusCloudPass = Pick<EntitlementClaims, 'src' | 'tier' | 'grants' | 'subs'> | null;

/**
 * Advantage Pro Plus Cloud opens for the owner test pass or an alpha-pro code.
 * A Pro unlock by itself does not open it. Stripe Pro, a locked Pro subscription,
 * a seat, and every other code stay closed. This does not grant a door.
 */
export function proPlusCloudDoorOpen(claims: ProPlusCloudPass): boolean {
  if (ownerTestActive('pro')) return true;
  if (!claims) return false;
  if (claims.src === 'seat' || claims.tier === 'seat') return false;
  if (claims.subs?.state === 'locked') return false;
  if (claims.src === 'owner' || claims.tier === 'owner') return true;
  return claims.src === 'code' && claims.grants.includes('pro');
}

/** An active Stripe Pro pass. The closed cloud route sends this pass to /pro. */
export function proPlusCloudStripePro(claims: ProPlusCloudPass): boolean {
  if (!claims || claims.src !== 'stripe') return false;
  if (claims.subs?.state === 'locked') return false;
  return claims.tier === 'pro' || claims.grants.includes('pro');
}

/** Same check the /products card uses. */
export function proPlusCloudUnlocked(): boolean {
  return proPlusCloudDoorOpen(entitlementSnapshot().claims);
}

export function subscribeProPlusCloud(fn: () => void): () => void {
  const stopEntitlement = subscribeEntitlement(fn);
  const stopOwnerTest = subscribeOwnerTest(fn);
  return () => {
    stopEntitlement();
    stopOwnerTest();
  };
}
