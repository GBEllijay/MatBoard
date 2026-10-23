/**
 * When the last Student Edition backup file was built on this device.
 * The backup itself is a download. This stamp is only the date.
 */

export const STUDENT_BACKUP_STAMP_KEY = 'matboard.studentEdition.lastBackupAt.v1';

const STAMP_RE = /^\d{4}-\d{2}-\d{2}T/;

type StampStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StampStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null;
    return storage;
  } catch {
    return null;
  }
}

/** Called when a backup file has been built. Failures before that do not count. */
export function noteStudentBackupBuilt(when: Date, storage?: StampStorage | null): void {
  const target = storage === undefined ? browserStorage() : storage;
  if (!target) return;
  try {
    target.setItem(STUDENT_BACKUP_STAMP_KEY, when.toISOString());
  } catch {
    /* private mode or a full disk */
  }
}

export function readStudentBackupStamp(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    const value = storage.getItem(STUDENT_BACKUP_STAMP_KEY);
    if (!value || !STAMP_RE.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function forgetStudentBackupStamp(storage: Pick<Storage, 'removeItem'>): void {
  try {
    storage.removeItem(STUDENT_BACKUP_STAMP_KEY);
  } catch {
    /* private mode */
  }
}

/** Calendar day of the stamp, or "Not yet". */
export function backupStampLabel(iso: string | null): string {
  if (!iso || !STAMP_RE.test(iso)) return 'Not yet';
  return iso.slice(0, 10);
}
