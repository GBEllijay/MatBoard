/** Soft-beta owner unlock. Not real auth — keeps Toolbox / Pro off the public home. */

export const PRO_UNLOCK_STORAGE_KEY = 'advantage.proUnlocked';

/**
 * Gym-owner code for Pro unlock. Change this anytime, or set VITE_PRO_UNLOCK_CODE
 * at build time. Compared case-insensitively after trim.
 */
export const PRO_UNLOCK_CODE =
  (typeof import.meta.env.VITE_PRO_UNLOCK_CODE === 'string'
    ? import.meta.env.VITE_PRO_UNLOCK_CODE.trim()
    : '') || 'advantage';

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

export function codesMatch(code: string): boolean {
  return code.trim().toLowerCase() === PRO_UNLOCK_CODE.toLowerCase();
}

/** Accepts the owner code, or `1` as a short query/localStorage-style flag. */
export function tryUnlock(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
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

export function stripUnlockParams(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete('pro');
  next.delete('unlock');
  return next;
}

/** Read `window.location.search` so a first paint of a Pro route can unlock. */
export function consumeUnlockQueryNow(): void {
  if (typeof window === 'undefined') return;
  applyUnlockSearch(new URLSearchParams(window.location.search));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PRO_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
