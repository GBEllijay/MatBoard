import { useSyncExternalStore } from 'react';
import { entitlementSettled, subscribeEntitlement } from '../lib/entitlement';

/** False while a saved pass is still being verified on this page load. */
export function useEntitlementSettled(): boolean {
  return useSyncExternalStore(subscribeEntitlement, entitlementSettled, entitlementSettled);
}
