import { useSyncExternalStore } from 'react';
import { hasSavedAdvantageAccess, subscribeSavedAdvantageAccess } from '../lib/homeLicenseRedirect';

/** True when this device already has a saved Advantage license, unlock, seat, or student code. */
export function useHasSavedAdvantageAccess(): boolean {
  return useSyncExternalStore(subscribeSavedAdvantageAccess, hasSavedAdvantageAccess, hasSavedAdvantageAccess);
}
