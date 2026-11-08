/**
 * End access on this browser only.
 * The server license, academy files, journals, roster, and Drive connections stay.
 * Another address or another device is not signed out.
 *
 * The pass is removed before paid-screen cleanup. Navigation waits until that
 * cleanup settles. A failed cleanup is reported; it is not treated as success.
 */

import { bumpAccessEpoch, discardEntitlementPass } from './entitlement.ts';
import { signOutInstructorSeat } from './instructorSeats.ts';
import { LEGACY_UNLOCK_KEYS } from './legacyUnlock.ts';
import { clearOwnerTestGrant } from './ownerTestGrant.ts';

export const SIGN_OUT_LANDING = '/products';

export const SIGN_OUT_NOTE = 'Ends access on this browser only. Journals, roster, and Drive stay.';

/** One-shot note read on the product list when paid screens could not be cleared. */
export const SIGN_OUT_CLEANUP_KEY = 'advantage.signOut.cleanup.v1';

export type SignOutResult = {
  ok: boolean;
  paidScreensCleared: boolean;
  error?: string;
  noticeSaved: boolean;
};

export type PaidScreenCleaner = () => Promise<void>;

async function defaultPaidScreenCleaner(): Promise<void> {
  const mod = await import('./paidChunkCache.ts');
  await mod.clearPaidScreens();
}

let paidScreenCleaner: PaidScreenCleaner = defaultPaidScreenCleaner;

/** Tests replace the cache step. Production uses the paid-screen module. */
export function setPaidScreenCleanerForTests(cleaner: PaidScreenCleaner | null): void {
  paidScreenCleaner = cleaner ?? defaultPaidScreenCleaner;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Paid screens could not be cleared on this browser.';
}

function rememberCleanupFailure(error: string): boolean {
  const store = session();
  if (!store) return false;
  try {
    store.setItem(SIGN_OUT_CLEANUP_KEY, error);
    return true;
  } catch {
    return false;
  }
}

/** Read and remove the cleanup note. Null when this sign-out had nothing to report. */
export function takeSignOutCleanupNotice(): string | null {
  const store = session();
  if (!store) return null;
  const value = store.getItem(SIGN_OUT_CLEANUP_KEY);
  if (value) store.removeItem(SIGN_OUT_CLEANUP_KEY);
  return value;
}

/**
 * Drop the pass and the on-device unlocks, then clear paid screens.
 * Credentials are already gone when paid-screen cleanup starts.
 * Does not reload and does not call the server.
 */
export function signOutThisDevice(): Promise<SignOutResult> {
  bumpAccessEpoch();
  signOutInstructorSeat();
  clearOwnerTestGrant();
  const store = storage();
  const problems: string[] = [];
  if (store) {
    for (const key of LEGACY_UNLOCK_KEYS) {
      try {
        store.removeItem(key);
      } catch (error) {
        problems.push(errorText(error));
      }
    }
  }
  discardEntitlementPass();
  return paidScreenCleaner().then(
    (): SignOutResult =>
      problems.length
        ? { ok: false, paidScreensCleared: true, error: problems.join(' '), noticeSaved: false }
        : { ok: true, paidScreensCleared: true, noticeSaved: false },
    (error: unknown): SignOutResult => ({
      ok: false,
      paidScreensCleared: false,
      error: [...problems, errorText(error)].join(' '),
      noticeSaved: false,
    }),
  );
}

function defaultLeave(path: string): void {
  if (typeof window === 'undefined') return;
  window.location.replace(path);
}

/**
 * Sign out, wait for paid-screen cleanup, then open the product list.
 * A cleanup failure is saved for that page and still followed by navigation.
 */
export async function signOutAndLeave(leave: (path: string) => void = defaultLeave): Promise<SignOutResult> {
  const cleanup = await signOutThisDevice();
  let noticeSaved = false;
  if (!cleanup.paidScreensCleared && cleanup.error) {
    noticeSaved = rememberCleanupFailure(cleanup.error);
  }
  leave(SIGN_OUT_LANDING);
  return { ...cleanup, noticeSaved };
}
