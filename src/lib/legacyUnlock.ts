/**
 * Old on-device unlock switches. Migration and amnesty may read or remove
 * only these keys. Photos, journals, gym logos, and Drive or OneDrive keys
 * are not in this list.
 *
 * The end instant matches src/server/paywallDecisions.ts. A test keeps them equal.
 * 45 days after the Phase 2 date (2026-10-28).
 */
export const LEGACY_AMNESTY_ENDS_AT = '2026-12-12T00:00:00.000Z';

export const LEGACY_UNLOCK_KEYS = [
  'advantage.whiteUnlocked',
  'advantage.whiteExpiresAt',
  'advantage.coachUnlocked',
  'advantage.proUnlocked',
  'advantage.studentEditionUnlocked',
  'advantage.studentUnlocked',
] as const;

export type LegacyUnlockKey = (typeof LEGACY_UNLOCK_KEYS)[number];

/** Testing locks only reduce access. Cleanup must not remove them. */
export const PRO_RELOCK_KEY = 'advantage.proRelocked';
export const COACH_RELOCK_KEY = 'advantage.coachRelocked';
export const WHITE_RELOCK_KEY = 'advantage.whiteRelocked';
export const STUDENT_RELOCK_KEY = 'advantage.studentEditionRelocked';
export const MEDIA_RELOCK_KEY = 'advantage.mediaRelocked';

export const LEGACY_NOTICE_KEY = 'advantage.legacyNotice.v1';
export const LEGACY_NOTICE_DISMISSED_KEY = 'advantage.legacyNoticeDismissed';

const LEGACY_KEY_SET = new Set<string>(LEGACY_UNLOCK_KEYS);

export function isLegacyUnlockKey(key: string): key is LegacyUnlockKey {
  return LEGACY_KEY_SET.has(key);
}

export function amnestyOpen(now = Date.now(), endsAt = LEGACY_AMNESTY_ENDS_AT): boolean {
  const ends = Date.parse(endsAt);
  return Number.isFinite(ends) && now < ends;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function legacyUnlockPresent(): boolean {
  const store = storage();
  if (!store) return false;
  return LEGACY_UNLOCK_KEYS.some((key) => {
    if (key === 'advantage.whiteExpiresAt') return false;
    return store.getItem(key) === '1';
  });
}

/** One gentle note. Does not rewrite any other key. */
export function noteLegacyAccess(): void {
  const store = storage();
  if (!store || !legacyUnlockPresent()) return;
  if (store.getItem(LEGACY_NOTICE_KEY) === '1') return;
  try {
    store.setItem(LEGACY_NOTICE_KEY, '1');
  } catch {
    /* ignore quota */
  }
}

/**
 * After the amnesty instant, drop only the old unlock switches.
 * Returns the keys that were removed. Never clears the store.
 */
export function retireLegacyUnlockFlags(now = Date.now(), endsAt = LEGACY_AMNESTY_ENDS_AT): LegacyUnlockKey[] {
  if (amnestyOpen(now, endsAt)) return [];
  const store = storage();
  if (!store) return [];
  const removed: LegacyUnlockKey[] = [];
  for (const key of LEGACY_UNLOCK_KEYS) {
    if (store.getItem(key) == null) continue;
    try {
      store.removeItem(key);
      removed.push(key);
    } catch {
      /* ignore */
    }
  }
  return removed;
}
