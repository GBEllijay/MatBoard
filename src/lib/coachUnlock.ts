/** Soft-beta owner unlock. Not real auth — keeps Coach off the public home. */

export const COACH_UNLOCK_STORAGE_KEY = 'advantage.coachUnlocked';

/**
 * Gym-owner code for Coach unlock. Change this anytime, or set VITE_COACH_UNLOCK_CODE
 * at build time. Compared case-insensitively after trim.
 */
export const COACH_UNLOCK_CODE =
  (typeof import.meta.env?.VITE_COACH_UNLOCK_CODE === 'string'
    ? import.meta.env.VITE_COACH_UNLOCK_CODE.trim()
    : '') || 'advantage';

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
  return readFlag();
}

export function subscribeCoachUnlock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setCoachUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
}

export function coachCodesMatch(code: string): boolean {
  return code.trim().toLowerCase() === COACH_UNLOCK_CODE.toLowerCase();
}

/** Preview a `?coach=` value without writing storage. `null` = no recognized override. */
export function previewCoachUnlockFromSearch(search: URLSearchParams): boolean | null {
  const raw = search.get('coach');
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed.toLowerCase() === 'lock') return false;
  if (trimmed === '1' || coachCodesMatch(trimmed)) return true;
  return null;
}

/** Accepts the owner code, or `1` as a short query/localStorage-style flag. */
export function tryCoachUnlock(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (trimmed === '1' || coachCodesMatch(trimmed)) {
    writeFlag(true);
    return true;
  }
  return false;
}

export function lockCoach(): void {
  writeFlag(false);
}

/**
 * Apply `?coach=` from the current URL.
 * `1` or the owner code unlocks; `0` or `lock` locks.
 * Returns true when a recognized param was consumed.
 */
export function applyCoachUnlockSearch(search: URLSearchParams): boolean {
  const raw = search.get('coach');
  if (raw == null) return false;
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed.toLowerCase() === 'lock') {
    writeFlag(false);
    return true;
  }
  return tryCoachUnlock(trimmed);
}

export function stripCoachUnlockParams(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete('coach');
  return next;
}

/** Read `window.location.search` so a first paint of a Coach route can unlock. */
export function consumeCoachUnlockQueryNow(): void {
  if (typeof window === 'undefined') return;
  applyCoachUnlockSearch(new URLSearchParams(window.location.search));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === COACH_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
