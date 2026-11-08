/**
 * Owner-entered academy profile. The logo stays in the existing gym logo slot.
 * Founding date, founders, and lineage live here, on this device.
 */

export const GYM_PROFILE_KEY = 'matboard.gymProfile.v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const GYM_PROFILE_OPT_IN = ['assistant-coach', 'program-director', 'custom'] as const;
export type GymProfileOptIn = (typeof GYM_PROFILE_OPT_IN)[number];

export type GymProfile = {
  v: 1;
  foundedOn: string;
  founders: string;
  /** Free text. Teaching ancestry, not a list of who has taught here. */
  lineage: string;
  /**
   * Whether lineage is shown on this academy profile.
   * Absent on older files. Those stay visible.
   * Off hides the text. It does not delete it.
   */
  lineageVisible?: boolean;
  optIn: GymProfileOptIn[];
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const listeners = new Set<() => void>();
let profileSnapshot = emptyGymProfile();
let profileLoaded = false;

export function emptyGymProfile(): GymProfile {
  return { v: 1, foundedOn: '', founders: '', lineage: '', optIn: [] };
}

/**
 * Free text the owner is still typing. Do not trim.
 * Trimming on each change deletes a space typed at the end of Founders or Lineage,
 * so the next letter never gets a gap and a second space never sticks.
 */
function clipText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function sanitizeGymProfile(raw: unknown): GymProfile {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const founded = typeof row.foundedOn === 'string' ? row.foundedOn.trim().slice(0, 10) : '';
  const rawOptIn = Array.isArray(row.optIn) ? row.optIn : [];
  const optIn = GYM_PROFILE_OPT_IN.filter((id) => rawOptIn.includes(id));
  const profile: GymProfile = {
    v: 1,
    foundedOn: DATE_RE.test(founded) ? founded : '',
    founders: clipText(row.founders, 120),
    lineage: clipText(row.lineage, 240),
    optIn,
  };
  if (typeof row.lineageVisible === 'boolean') profile.lineageVisible = row.lineageVisible;
  return profile;
}

/** Older profiles omit the flag and stay visible, including a blank field. */
export function gymLineageVisible(profile: GymProfile): boolean {
  return profile.lineageVisible !== false;
}

/** Text to show. Hidden lineage and a blank field both return nothing. */
export function gymLineageText(profile: GymProfile): string {
  if (!gymLineageVisible(profile)) return '';
  return profile.lineage.trim();
}

function storage(): MemoryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readGymProfile(store: MemoryStore | null = storage()): GymProfile {
  try {
    const raw = store?.getItem(GYM_PROFILE_KEY);
    return raw ? sanitizeGymProfile(JSON.parse(raw) as unknown) : emptyGymProfile();
  } catch {
    return emptyGymProfile();
  }
}

/** Stable snapshot for React. A new object is published only when the profile is saved. */
export function getGymProfileSnapshot(): GymProfile {
  if (!profileLoaded) {
    profileSnapshot = readGymProfile();
    profileLoaded = true;
  }
  return profileSnapshot;
}

export function writeGymProfile(patch: Partial<GymProfile>, store: MemoryStore | null = storage()): GymProfile {
  const next = sanitizeGymProfile({ ...readGymProfile(store), ...patch, v: 1 });
  try {
    store?.setItem(GYM_PROFILE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  profileSnapshot = next;
  profileLoaded = true;
  listeners.forEach((fn) => fn());
  return next;
}

export function subscribeGymProfile(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function profileOptIn(profile: GymProfile, preset: string | null): boolean {
  if (preset === 'assistant-coach' || preset === 'program-director') return profile.optIn.includes(preset);
  if (!preset) return profile.optIn.includes('custom');
  return false;
}
