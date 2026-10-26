/**
 * Which profile images may leave the phone on a report or a backup.
 * Adult and kids each keep their own switches. A photo turned on for adult
 * stays off for kids until a parent turns that switch on.
 */

import type { BeltSystemMode } from './progress/types.ts';

export const PROFILE_MARKS_KEY = 'matboard.studentProfileMarks.v1';

export type ProfileMark = 'selfie' | 'logo';

export type ProfileModeMarks = {
  /** Selfie on the progress report and in the backup file. Default off. */
  selfie: boolean;
  /** Gym logo on the progress report and in the backup file. Default on. */
  logo: boolean;
};

export type ProfileMarks = {
  version: 1;
  adult: ProfileModeMarks;
  kids: ProfileModeMarks;
};

type Store = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function defaultProfileMarks(): ProfileMarks {
  return {
    version: 1,
    adult: { selfie: false, logo: true },
    kids: { selfie: false, logo: true },
  };
}

function modeMarks(value: unknown, fallback: ProfileModeMarks): ProfileModeMarks {
  const record = value && typeof value === 'object' ? (value as Partial<ProfileModeMarks>) : {};
  return {
    selfie: typeof record.selfie === 'boolean' ? record.selfie : fallback.selfie,
    logo: typeof record.logo === 'boolean' ? record.logo : fallback.logo,
  };
}

export function readProfileMarks(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): ProfileMarks {
  const fallback = defaultProfileMarks();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(PROFILE_MARKS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ProfileMarks>;
    if (parsed.version !== 1) return fallback;
    return {
      version: 1,
      adult: modeMarks(parsed.adult, fallback.adult),
      kids: modeMarks(parsed.kids, fallback.kids),
    };
  } catch {
    return fallback;
  }
}

export function writeProfileMark(
  mode: BeltSystemMode,
  mark: ProfileMark,
  on: boolean,
  storage: Store | null = defaultStorage(),
): ProfileMarks {
  const next = readProfileMarks(storage);
  next[mode] = { ...next[mode], [mark]: on };
  try {
    storage?.setItem(PROFILE_MARKS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

export function clearProfileMarks(storage: Store | null = defaultStorage()): void {
  try {
    if (storage?.removeItem) storage.removeItem(PROFILE_MARKS_KEY);
    else storage?.setItem(PROFILE_MARKS_KEY, '');
  } catch {
    /* private mode */
  }
}

/** What the progress report header may show for this Adult / Kids setting. */
export function headerVisibility(mode: BeltSystemMode, marks: ProfileMarks = readProfileMarks()): ProfileModeMarks {
  const row = mode === 'kids' ? marks.kids : marks.adult;
  return { selfie: row.selfie === true, logo: row.logo === true };
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}
