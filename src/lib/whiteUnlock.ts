import { doorOpen, notifyEntitlement, subscribeEntitlement } from './entitlement.ts';
import { WHITE_RELOCK_KEY } from './legacyUnlock.ts';
import { lockStudentEdition } from './studentUnlock.ts';
import { WHITE_BUY_PATH } from './whitePurchase.ts';

/** This browser finished a confirmed checkout or a server code redeem. Not a Google login. */
export const WHITE_UNLOCK_STORAGE_KEY = 'advantage.whiteUnlocked';

/** Set when a code redeem includes an expiry. A Stripe purchase leaves this empty. */
export const WHITE_EXPIRES_STORAGE_KEY = 'advantage.whiteExpiresAt';

const listeners = new Set<() => void>();

function writeFlag(unlocked: boolean): void {
  try {
    if (unlocked) {
      localStorage.setItem(WHITE_UNLOCK_STORAGE_KEY, '1');
      localStorage.removeItem(WHITE_RELOCK_KEY);
    } else {
      localStorage.removeItem(WHITE_UNLOCK_STORAGE_KEY);
      localStorage.removeItem(WHITE_EXPIRES_STORAGE_KEY);
      localStorage.setItem(WHITE_RELOCK_KEY, '1');
    }
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
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
  return doorOpen('white');
}

export function subscribeWhiteUnlock(fn: () => void): () => void {
  listeners.add(fn);
  const off = subscribeEntitlement(fn);
  return () => {
    listeners.delete(fn);
    off();
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
    localStorage.setItem(WHITE_RELOCK_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
  notifyEntitlement();
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

export type WhiteRestoreResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Asks the server to email a one-time code. The answer does not say whether
 * the address bought anything, and it does not unlock this device.
 */
export async function restoreWhiteByEmail(
  email: string,
  turnstileToken = '',
): Promise<WhiteRestoreResult> {
  const trimmed = email.trim();
  if (!isWhiteRestoreEmail(trimmed)) {
    return { ok: false, error: 'Enter the email from your purchase.' };
  }
  try {
    const response = await fetch('/api/restore/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: trimmed, turnstileToken: turnstileToken || undefined }),
    });
    const body = (await response.json()) as { ok?: boolean; message?: string; error?: string };
    if (!response.ok || !body.ok) {
      return { ok: false, error: body.error || 'Restore is not available yet.' };
    }
    return { ok: true, message: body.message || "If that address has a purchase, we've emailed a code." };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === WHITE_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
