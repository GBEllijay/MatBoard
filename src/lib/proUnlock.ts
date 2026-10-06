/** Soft-beta owner unlock. Not real auth — keeps Pro / Console off the public home. */

import { setCoachUnlocked, tryCoachUnlock } from './coachUnlock.ts';
import { setWhiteUnlocked } from './whiteUnlock.ts';

export const PRO_UNLOCK_STORAGE_KEY = 'advantage.proUnlocked';

/**
 * Gym-owner code for Pro unlock. Change this anytime, or set VITE_PRO_UNLOCK_CODE
 * at build time. Compared case-insensitively after trim.
 * `advantage` unlocks Pro. Coach tools follow that Pro door. It does not unlock White.
 */
export const PRO_UNLOCK_CODE =
  (typeof import.meta.env?.VITE_PRO_UNLOCK_CODE === 'string'
    ? import.meta.env.VITE_PRO_UNLOCK_CODE.trim()
    : '') || 'advantage';

/**
 * Full owner code. Same comparison as the other owner codes: trim, then case-insensitive.
 * Unlocks Advantage White, Coach, and Pro. Does not replace `advantage`.
 */
export const FULL_OWNER_UNLOCK_CODE = 'WINBYADV';

const listeners = new Set<() => void>();

function readFlag(): boolean {
  try {
    return localStorage.getItem(PRO_UNLOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
    else localStorage.removeItem(PRO_UNLOCK_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function isProUnlocked(): boolean {
  return readFlag();
}

export function subscribeProUnlock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setProUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
}

export function isFullOwnerUnlockCode(code: string): boolean {
  return code.trim().toLowerCase() === FULL_OWNER_UNLOCK_CODE.toLowerCase();
}

export function codesMatch(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  return normalized === PRO_UNLOCK_CODE.toLowerCase() || isFullOwnerUnlockCode(code);
}

/** Write White, Coach, and Pro. Used only for the full owner code. */
function grantFullOwnerUnlock(): void {
  writeFlag(true);
  setCoachUnlocked(true);
  setWhiteUnlocked(true);
}

/** Accepts WINBYADV from either Owner unlock sheet or a `?pro=` / `?unlock=` / `?coach=` value. */
export function tryFullOwnerUnlock(code: string): boolean {
  if (!isFullOwnerUnlockCode(code)) return false;
  grantFullOwnerUnlock();
  return true;
}

/**
 * Owner unlock sheet. WINBYADV opens White, Coach, and Pro.
 * The Pro code still opens Pro only. The Coach code still opens Coach only.
 */
export function tryProductOwnerUnlock(product: 'coach' | 'pro', code: string): boolean {
  if (tryFullOwnerUnlock(code)) return true;
  return product === 'coach' ? tryCoachUnlock(code) : tryUnlock(code);
}

/** Preview a `?pro=` / `?unlock=` value without writing storage. `null` = no recognized override. */
export function previewUnlockFromSearch(search: URLSearchParams): boolean | null {
  const raw = search.get('pro') ?? search.get('unlock');
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed.toLowerCase() === 'lock') return false;
  if (trimmed === '1' || codesMatch(trimmed)) return true;
  return null;
}

/** Accepts the owner code, or `1` as a short query/localStorage-style flag. */
export function tryUnlock(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (tryFullOwnerUnlock(trimmed)) return true;
  if (trimmed === '1' || codesMatch(trimmed)) {
    writeFlag(true);
    return true;
  }
  return false;
}

export function lockPro(): void {
  writeFlag(false);
}

/**
 * Apply `?pro=` / `?unlock=` from the current URL.
 * `1` or the owner code unlocks; `0` or `lock` locks.
 * Returns true when a recognized param was consumed.
 */
export function applyUnlockSearch(search: URLSearchParams): boolean {
  const raw = search.get('pro') ?? search.get('unlock');
  if (raw == null) return false;
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed.toLowerCase() === 'lock') {
    writeFlag(false);
    return true;
  }
  return tryUnlock(trimmed);
}

/**
 * `?pro=` / `?unlock=` / `?coach=` may carry the full owner code.
 * Grants White, Coach, and Pro. Returns false when none of those values match.
 */
export function applyFullOwnerSearch(search: URLSearchParams): boolean {
  const hit = ['pro', 'unlock', 'coach'].some((key) => {
    const raw = search.get(key);
    return raw != null && isFullOwnerUnlockCode(raw);
  });
  if (!hit) return false;
  grantFullOwnerUnlock();
  return true;
}

export function stripUnlockParams(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete('pro');
  next.delete('unlock');
  return next;
}

/** Read `window.location.search` so a first paint of a Pro route can unlock. */
export function consumeUnlockQueryNow(): void {
  if (typeof window === 'undefined') return;
  const search = new URLSearchParams(window.location.search);
  applyUnlockSearch(search);
  applyFullOwnerSearch(search);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PRO_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
