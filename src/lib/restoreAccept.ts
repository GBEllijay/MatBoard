import { acceptServerToken, clearRelocksFor, entitlementSnapshot } from './entitlement.ts';

/**
 * Accept the pass from a confirmed restore code. A successful restore reopens exactly the
 * doors the server signed into the pass (and what they imply in tierImplications.ts),
 * clearing any Lock marks a Lock button left on this browser for those doors. Doors the
 * server did not re-grant stay locked.
 */
export async function acceptRestoredToken(token: string): Promise<boolean> {
  const accepted = await acceptServerToken(token);
  if (accepted) clearRelocksFor(entitlementSnapshot().claims?.grants ?? []);
  return accepted;
}
