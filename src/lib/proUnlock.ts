/** Pro door on this browser. A server redeem or checkout confirm sets the flag. URL params do not. */

import { doorOpen, notifyEntitlement, subscribeEntitlement } from './entitlement.ts';
import { PRO_RELOCK_KEY } from './legacyUnlock.ts';
import { dropOwnerTestDoors, readOwnerTestGrant } from './ownerTestGrant.ts';
import { setStudentEditionUnlocked } from './studentUnlock.ts';

export const PRO_UNLOCK_STORAGE_KEY = 'advantage.proUnlocked';

const listeners = new Set<() => void>();

function writeFlag(unlocked: boolean): void {
  try {
    if (unlocked) {
      localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
      localStorage.removeItem(PRO_RELOCK_KEY);
    } else {
      localStorage.removeItem(PRO_UNLOCK_STORAGE_KEY);
      localStorage.setItem(PRO_RELOCK_KEY, '1');
    }
  } catch {
    /* ignore quota / private mode */
  }
  // Pro opens Student Edition. Locking Pro closes that grant. Coach-only does not write this flag.
  setStudentEditionUnlocked(unlocked);
  listeners.forEach((fn) => fn());
  notifyEntitlement();
}

export function isProUnlocked(): boolean {
  return doorOpen('pro');
}

export function subscribeProUnlock(fn: () => void): () => void {
  listeners.add(fn);
  const off = subscribeEntitlement(fn);
  return () => {
    listeners.delete(fn);
    off();
  };
}

function syncPaidScreens(open: boolean): void {
  void import('./paidChunkCache.ts')
    .then((mod) => (open ? mod.prefetchStoredPaidChunks() : mod.clearPaidChunkCache()))
    .catch(() => undefined);
}

export function setProUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
  syncPaidScreens(unlocked);
}

/** Address-bar values never unlock or lock Pro. */
export function previewUnlockFromSearch(_search: URLSearchParams): boolean | null {
  return null;
}

/** Kept so older call sites compile. A code only works through the server redeem. */
export function tryUnlock(_code: string): boolean {
  return false;
}

export function tryProductOwnerUnlock(_product: 'coach' | 'pro' | 'student', _code: string): boolean {
  return false;
}

export function lockPro(): void {
  // The owner-test seat is a Pro preview. It kept Media Console and Coach open after Lock Pro.
  // A Pro-only owner test carries Student Edition as part of Pro, so that goes too.
  // An "all" owner test granted Student Edition on its own, and it stays.
  const proOnlyTest = readOwnerTestGrant()?.tier === 'pro';
  dropOwnerTestDoors(proOnlyTest ? ['pro', 'seat', 'student'] : ['pro', 'seat']);
  // writeFlag also clears the Student Edition grant that follows Pro.
  writeFlag(false);
  syncPaidScreens(false);
}

/** `?pro=` and `?unlock=` do not change Pro. */
export function applyUnlockSearch(_search: URLSearchParams): boolean {
  return false;
}

/** No query value grants White, Coach, Pro, and Student Edition together. */
export function applyFullOwnerSearch(_search: URLSearchParams): boolean {
  return false;
}

export function stripUnlockParams(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete('pro');
  next.delete('unlock');
  return next;
}

/** `?student=1` is the demo and stays. Other student values are not codes. */
export function stripFullOwnerStudentParam(search: URLSearchParams): URLSearchParams {
  return new URLSearchParams(search);
}

/** Drop unlock query keys without granting them. `?student=1` stays for demo mode. */
export function consumeUnlockQueryNow(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const had = url.searchParams.has('pro') || url.searchParams.has('unlock') || url.searchParams.has('coach');
  if (!had) return;
  url.searchParams.delete('pro');
  url.searchParams.delete('unlock');
  url.searchParams.delete('coach');
  const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PRO_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
