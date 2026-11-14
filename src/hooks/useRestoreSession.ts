import { useSyncExternalStore } from 'react';
import { restoreSessionOpen, subscribeRestoreSession } from '../lib/restorePurchase';

/** True when this browser has a verified entitlement pass (the signed-in session). */
export function useRestoreSession(): boolean {
  return useSyncExternalStore(subscribeRestoreSession, restoreSessionOpen, () => false);
}
