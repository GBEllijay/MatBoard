/**
 * Purchase email captured on this device after a verified restore or checkout.
 * Used only as a hash-check fallback when the server has no plaintext address
 * for a signed-in session. Sign-out does not clear it: it is not a credential.
 */
import { isWhiteRestoreEmail } from './whiteUnlock.ts';

export const RESTORE_SESSION_EMAIL_KEY = 'advantage.restore.sessionEmail.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberRestoreSessionEmail(raw: string): void {
  const email = raw.trim();
  if (!isWhiteRestoreEmail(email)) return;
  try {
    storage()?.setItem(RESTORE_SESSION_EMAIL_KEY, email);
  } catch {
    /* private mode */
  }
}

export function readRestoreSessionEmail(): string {
  try {
    const value = storage()?.getItem(RESTORE_SESSION_EMAIL_KEY)?.trim() ?? '';
    return isWhiteRestoreEmail(value) ? value : '';
  } catch {
    return '';
  }
}
