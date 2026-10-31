/**
 * The restore challenge id, kept so the code box survives a trip to the mail app.
 * Only the id is stored, never the code or the email. It lapses with the server's 15-minute code.
 */
export const RESTORE_CHALLENGE_KEY = 'advantage.restore.challenge';
export const RESTORE_CHALLENGE_TTL_MS = 15 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveRestoreChallenge(challengeId: string, now = Date.now()): void {
  const id = challengeId.trim();
  if (!id) return;
  try {
    storage()?.setItem(RESTORE_CHALLENGE_KEY, JSON.stringify({ id, expiresAt: now + RESTORE_CHALLENGE_TTL_MS }));
  } catch {
    /* private mode: the page still works until it is closed */
  }
}

export function readRestoreChallenge(now = Date.now()): string {
  const store = storage();
  if (!store) return '';
  try {
    const raw = store.getItem(RESTORE_CHALLENGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { id?: unknown; expiresAt?: unknown };
    if (typeof parsed.id === 'string' && parsed.id && typeof parsed.expiresAt === 'number' && parsed.expiresAt > now) {
      return parsed.id;
    }
  } catch {
    /* fall through and clear */
  }
  clearRestoreChallenge();
  return '';
}

export function clearRestoreChallenge(): void {
  try {
    storage()?.removeItem(RESTORE_CHALLENGE_KEY);
  } catch {
    /* ignore */
  }
}
