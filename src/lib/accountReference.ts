/**
 * Support reference for the signed-in account. People can read it.
 * They never type it to recover a purchase. Recovery stays the emailed code.
 */

const KEY = 'advantage.account.reference';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rememberAccountReference(id: unknown): void {
  if (typeof id !== 'string' || !ID.test(id.trim())) return;
  try {
    localStorage.setItem(KEY, id.trim().toLowerCase());
  } catch {
    /* private mode */
  }
}

export function readAccountReference(): string | null {
  try {
    const value = localStorage.getItem(KEY)?.trim() ?? '';
    return ID.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function forgetAccountReference(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
