import { ownerTestActive, subscribeOwnerTest } from './ownerTestGrant.ts';
import { lockStudentEdition } from './studentUnlock.ts';

/** Coach door on this browser. A server redeem sets the flag. URL params do not. */

export const COACH_UNLOCK_STORAGE_KEY = 'advantage.coachUnlocked';

const listeners = new Set<() => void>();

function readFlag(): boolean {
  try {
    return localStorage.getItem(COACH_UNLOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(COACH_UNLOCK_STORAGE_KEY, '1');
    else localStorage.removeItem(COACH_UNLOCK_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function isCoachUnlocked(): boolean {
  return readFlag() || ownerTestActive('coach');
}

export function subscribeCoachUnlock(fn: () => void): () => void {
  listeners.add(fn);
  const offTest = subscribeOwnerTest(fn);
  return () => {
    listeners.delete(fn);
    offTest();
  };
}

export function setCoachUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
}

/** Address-bar values never unlock or lock Coach. */
export function previewCoachUnlockFromSearch(_search: URLSearchParams): boolean | null {
  return null;
}

/** Kept so older call sites compile. A code only works through the server redeem. */
export function tryCoachUnlock(_code: string): boolean {
  return false;
}

export function lockCoach(): void {
  writeFlag(false);
  lockStudentEdition();
}

/** `?coach=` does not change Coach. */
export function applyCoachUnlockSearch(_search: URLSearchParams): boolean {
  return false;
}

export function stripCoachUnlockParams(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete('coach');
  return next;
}

/** Coach query stripping shares the Pro consumer so a shortcut cannot land first. */
export function consumeCoachUnlockQueryNow(): void {
  /* consumeUnlockQueryNow removes ?coach= before paint. */
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === COACH_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
