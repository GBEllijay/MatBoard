/**
 * End access on this browser only.
 * The server license, academy files, journals, roster, and Drive connections stay.
 * Another address or another device is not signed out.
 */

import { bumpAccessEpoch, clearEntitlementToken } from './entitlement.ts';
import { signOutInstructorSeat } from './instructorSeats.ts';
import { LEGACY_UNLOCK_KEYS } from './legacyUnlock.ts';
import { clearOwnerTestGrant } from './ownerTestGrant.ts';

export const SIGN_OUT_LANDING = '/products';

export const SIGN_OUT_NOTE = 'Ends access on this browser only. Journals, roster, and Drive stay.';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Drop the pass and the on-device unlocks. Does not reload and does not call the server. */
export function signOutThisDevice(): void {
  bumpAccessEpoch();
  signOutInstructorSeat();
  clearOwnerTestGrant();
  const store = storage();
  if (store) {
    for (const key of LEGACY_UNLOCK_KEYS) {
      try {
        store.removeItem(key);
      } catch {
        /* private mode */
      }
    }
  }
  clearEntitlementToken();
}

/** Sign out, then open the product list so a paid screen does not stay on screen. */
export function signOutAndLeave(): void {
  signOutThisDevice();
  if (typeof window === 'undefined') return;
  window.location.replace(SIGN_OUT_LANDING);
}
