import { ownerTestActive, subscribeOwnerTest } from './ownerTestGrant.ts';
import { lockStudentEdition } from './studentUnlock.ts';
import { WHITE_BUY_PATH } from './whitePurchase.ts';

/** This browser finished a confirmed checkout or a server code redeem. Not a Google login. */
export const WHITE_UNLOCK_STORAGE_KEY = 'advantage.whiteUnlocked';

/** Set when a code redeem includes an expiry. A Stripe purchase leaves this empty. */
export const WHITE_EXPIRES_STORAGE_KEY = 'advantage.whiteExpiresAt';

const listeners = new Set<() => void>();

function readFlag(): boolean {
  try {
    return localStorage.getItem(WHITE_UNLOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(WHITE_UNLOCK_STORAGE_KEY, '1');
    else {
      localStorage.removeItem(WHITE_UNLOCK_STORAGE_KEY);
      localStorage.removeItem(WHITE_EXPIRES_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

function readExpiry(): string | null {
  try {
    return localStorage.getItem(WHITE_EXPIRES_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setWhiteExpiry(expiresAt: string | null): void {
  try {
    if (expiresAt) localStorage.setItem(WHITE_EXPIRES_STORAGE_KEY, expiresAt);
    else localStorage.removeItem(WHITE_EXPIRES_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function isWhiteUnlocked(): boolean {
  if (ownerTestActive('white')) return true;
  if (!readFlag()) return false;
  const expiry = readExpiry();
  if (!expiry) return true;
  const ends = Date.parse(expiry);
  return Number.isFinite(ends) && ends > Date.now();
}

export function subscribeWhiteUnlock(fn: () => void): () => void {
  listeners.add(fn);
  const offTest = subscribeOwnerTest(fn);
  return () => {
    listeners.delete(fn);
    offTest();
  };
}

export function setWhiteUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
  if (!unlocked) lockStudentEdition();
}

/**
 * Testing lock from the White hub. Removes only this browser's White flag.
 * Student Edition, Pro, Coach, the roster, and the journal stay.
 * `setWhiteUnlocked(false)` still closes the Student Edition grant; this does not.
 */
export function lockWhite(): void {
  try {
    localStorage.removeItem(WHITE_UNLOCK_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

/** Keep a server-confirmed Stripe result on this device so /white opens. */
export function rememberWhitePurchase(status: { entitled: boolean; grants?: string[] }): boolean {
  if (!status.entitled) return false;
  if (status.grants && !status.grants.includes('white')) return false;
  setWhiteExpiry(null);
  writeFlag(true);
  return true;
}

/** Advantage White hub and roster. Coach and Pro doors do not open these. */
export function whiteHubAllowed(whiteUnlocked: boolean): boolean {
  return whiteUnlocked;
}

/**
 * Live scoreboard and round timer.
 * White buyers open them from /white.
 * Coach and Pro already open the same screens from their own doors.
 */
export function whiteLiveToolsAllowed(access: {
  whiteUnlocked: boolean;
  coachDoor: boolean;
  proDoor: boolean;
}): boolean {
  return access.whiteUnlocked || access.coachDoor || access.proDoor;
}

/** Home and other White entries. Locked visitors land on the $9.99 paywall. */
export function whiteEntryPath(whiteUnlocked: boolean): '/white' | typeof WHITE_BUY_PATH {
  return whiteUnlocked ? '/white' : WHITE_BUY_PATH;
}

/**
 * Same email check as GET /api/entitlement.
 * Trimmed text, one @, no spaces, at most 320 characters.
 */
export function isWhiteRestoreEmail(raw: string): boolean {
  const email = raw.trim();
  if (!email || email.length > 320) return false;
  if (!email.includes('@') || /\s/.test(email)) return false;
  return true;
}

export type WhiteRestoreResult = { ok: true } | { ok: false; error: string };

const RESTORE_CLOSED =
  'Email lookup no longer unlocks a purchase. Finish checkout on this device, or enter a code.';

/**
 * Email lookup used to say whether an address had paid. It does not unlock,
 * and it does not say whether the address bought anything. A stored unlock stays.
 */
export async function restoreWhiteByEmail(email: string): Promise<WhiteRestoreResult> {
  const trimmed = email.trim();
  if (!isWhiteRestoreEmail(trimmed)) {
    return { ok: false, error: 'Enter the email from your purchase.' };
  }
  return { ok: false, error: RESTORE_CLOSED };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === WHITE_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
