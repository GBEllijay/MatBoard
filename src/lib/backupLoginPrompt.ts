/**
 * "Create a login to back up" prompt (src/components/BackupLoginPrompt.tsx).
 *
 * Shows on the products home and the Student Edition home when this browser holds
 * something worth keeping (a profile, belt, roster, instructor or academy profile)
 * and nobody is signed in. "Not now" hides it for about a week. It never shows
 * once someone is signed in, never in the sample demo, and never on the timer or
 * scoreboard screens (it is only mounted on the two home screens).
 */

export const BACKUP_PROMPT_SNOOZE_KEY = 'advantage.backupLoginPrompt.snoozeUntil.v1';
export const BACKUP_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** First-time login: email code for a purchase or invite, then back to /products. */
export const BACKUP_PROMPT_ACCOUNT_PATH = '/account?tab=code&return=home';

export const BACKUP_PROMPT_TITLE = 'Create a login to back up your profile so you never lose it.';
export const BACKUP_PROMPT_BODY =
  'Right now your profile only lives in this browser. With a login, your profile, belt and academy details back up to your account and come back when you sign in on a new phone.';

type ReadStore = { getItem(key: string): string | null; key?(index: number): string | null; readonly length?: number };
type WriteStore = ReadStore & { setItem(key: string, value: string): void };

/** Keys that mean the person has saved something here. Student keys can carry a per-profile suffix. */
const DATA_KEYS = [
  'matboard.studentEdition.v1',
  'matboard.instructor.profile.v1',
  'matboard.gymName.v1',
  'matboard.roster.v1',
  'matboard.whiteRoster.v1',
] as const;

function meaningful(raw: string | null): boolean {
  if (!raw) return false;
  const text = raw.trim();
  if (!text || text === '[]' || text === '{}' || text === 'null' || text === '""') return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      // Academy name file: { name: '' } is not data.
      if ('name' in record && Object.keys(record).length <= 2 && typeof record.name === 'string') return record.name.trim().length > 0;
      if (Array.isArray(record.students)) return record.students.length > 0;
      // Student Edition file: a name, or anything saved in a list (journal, results, ranks).
      if (record.profile && typeof record.profile === 'object') {
        const profile = record.profile as Record<string, unknown>;
        if (typeof profile.displayName === 'string' && profile.displayName.trim()) return true;
        return Object.values(record).some((value) => Array.isArray(value) && value.length > 0);
      }
      return Object.keys(record).length > 0;
    }
    return Boolean(parsed);
  } catch {
    return true;
  }
}

function isDataKey(key: string): boolean {
  return DATA_KEYS.some((base) => key === base || key.startsWith(`${base}::profile:`));
}

/** True when this browser holds a profile, belt, roster or academy profile worth backing up. */
export function deviceHasLocalData(store: ReadStore | null): boolean {
  if (!store) return false;
  try {
    for (const key of DATA_KEYS) if (meaningful(store.getItem(key))) return true;
    const length = typeof store.length === 'number' ? store.length : 0;
    if (typeof store.key !== 'function') return false;
    for (let index = 0; index < length; index += 1) {
      const key = store.key(index);
      if (key && isDataKey(key) && meaningful(store.getItem(key))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function readBackupPromptSnooze(store: ReadStore | null): number {
  try {
    const value = Number(store?.getItem(BACKUP_PROMPT_SNOOZE_KEY) ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** "Not now": hide for about a week. Returns the time it can show again. */
export function snoozeBackupPrompt(store: WriteStore | null, now = Date.now()): number {
  const until = now + BACKUP_PROMPT_SNOOZE_MS;
  try {
    store?.setItem(BACKUP_PROMPT_SNOOZE_KEY, String(until));
  } catch {
    /* the component still hides it for this visit */
  }
  return until;
}

export type BackupPromptState = {
  signedIn: boolean;
  hasData: boolean;
  snoozedUntil: number;
  now: number;
  demo?: boolean;
  /** Private browsing: the login would not stick either, so the private banner speaks instead. */
  privateBrowsing?: boolean;
};

export function backupLoginPromptVisible(state: BackupPromptState): boolean {
  if (state.signedIn || state.demo || state.privateBrowsing) return false;
  if (!state.hasData) return false;
  return !(state.snoozedUntil > state.now);
}
