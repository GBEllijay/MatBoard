/** This browser was opened with the full owner code. Not a purchase and not `?student=1`. */

export const STUDENT_EDITION_UNLOCK_STORAGE_KEY = 'advantage.studentEditionUnlocked';

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

export function setStudentEditionUnlocked(unlocked: boolean): void {
  writeFlag(unlocked);
}

export function lockStudentEdition(): void {
  writeFlag(false);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STUDENT_EDITION_UNLOCK_STORAGE_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
