/** This browser was opened with the full owner code. Not a purchase and not `?student=1`. */

export const STUDENT_EDITION_UNLOCK_STORAGE_KEY = 'advantage.studentEditionUnlocked';

/**
 * Hub lock for testing. Pro may still be stored on this browser, and Pro
 * normally keeps Student Edition open. This mark closes that door until an
 * owner code or a new purchase writes the unlock again. Same key family as
 * the other local flags. Not a server entitlement.
 */
export const STUDENT_EDITION_RELOCK_KEY = 'advantage.studentEditionRelocked';

/** Local checkout remember. Must match STUDENT_PURCHASE_STORAGE_KEY. */
const STUDENT_PURCHASE_REMEMBER_KEY = 'advantage.studentUnlocked';

const listeners = new Set<() => void>();

function readFlag(): boolean {
  try {
    return localStorage.getItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY, '1');
    else localStorage.removeItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function isStudentEditionUnlocked(): boolean {
  return readFlag();
}

export function subscribeStudentEditionUnlock(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function readRelock(): boolean {
  try {
    return localStorage.getItem(STUDENT_EDITION_RELOCK_KEY) === '1';
  } catch {
    return false;
  }
}

function writeRelock(locked: boolean): void {
  try {
    if (locked) localStorage.setItem(STUDENT_EDITION_RELOCK_KEY, '1');
    else localStorage.removeItem(STUDENT_EDITION_RELOCK_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function isStudentEditionRelocked(): boolean {
  return readRelock();
}

/** An owner code or a completed checkout clears the testing lock. */
export function clearStudentEditionRelock(): void {
  if (!readRelock()) return;
  writeRelock(false);
  listeners.forEach((fn) => fn());
}

export function setStudentEditionUnlocked(unlocked: boolean): void {
  if (unlocked) writeRelock(false);
  writeFlag(unlocked);
}

export function lockStudentEdition(): void {
  writeFlag(false);
}

/**
 * Testing lock from the Student Edition hub.
 * Clears this browser's owner flag and the local purchase remember, and
 * marks the door locked so a Pro unlock already stored here does not keep
 * the journal open. Journal, belts, benchmarks, Pro, Coach, White, Drive,
 * and OAuth stay. `?student=1` still previews. An owner code clears the mark.
 */
export function lockStudentEditionBrowser(): void {
  try {
    localStorage.removeItem(STUDENT_PURCHASE_REMEMBER_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  writeRelock(true);
  writeFlag(false);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === STUDENT_EDITION_UNLOCK_STORAGE_KEY ||
      event.key === STUDENT_EDITION_RELOCK_KEY ||
      event.key === null
    ) {
      listeners.forEach((fn) => fn());
    }
  });
}
