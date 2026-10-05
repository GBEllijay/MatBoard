import { lookupWhiteEntitlement } from './whiteEntitlementClient.ts';
import { WHITE_BUY_PATH } from './whitePurchase.ts';

/** This browser finished checkout, WHITEFREE, or an email restore. Not a Google login. */
export const WHITE_UNLOCK_STORAGE_KEY = 'advantage.whiteUnlocked';

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
    else localStorage.removeItem(WHITE_UNLOCK_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function isWhiteUnlocked(): boolean {
  return readFlag();
}

export function subscribeWhiteUnlock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setWhiteUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
}

/** Keep a successful Stripe or WHITEFREE result on this device so /white opens. */
export function rememberWhitePurchase(status: { entitled: boolean }): boolean {
  if (!status.entitled) return false;
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

export type WhiteRestoreLookup = (query: { email: string }) => Promise<{ entitled: boolean }>;

export type WhiteRestoreResult = { ok: true } | { ok: false; error: string };

/**
 * Cross-device restore. An entitled purchase email unlocks White on this device.
 * A miss does not clear an unlock that is already stored.
 */
export async function restoreWhiteByEmail(
  email: string,
  lookup: WhiteRestoreLookup = lookupWhiteEntitlement,
): Promise<WhiteRestoreResult> {
  const trimmed = email.trim();
  if (!isWhiteRestoreEmail(trimmed)) {
    return { ok: false, error: 'Enter the email from your purchase.' };
  }
  try {
    const status = await lookup({ email: trimmed });
    if (!status.entitled) {
      return { ok: false, error: 'That email does not have Advantage White.' };
    }
  } catch {
    return { ok: false, error: 'Could not check that email. Check your connection and try again.' };
  }
  writeFlag(true);
  return { ok: true };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === WHITE_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
