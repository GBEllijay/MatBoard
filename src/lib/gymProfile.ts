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
  lineage: string;
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

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function sanitizeGymProfile(raw: unknown): GymProfile {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const founded = clip(row.foundedOn, 10);
  const rawOptIn = Array.isArray(row.optIn) ? row.optIn : [];
  const optIn = GYM_PROFILE_OPT_IN.filter((id) => rawOptIn.includes(id));
  return {
    v: 1,
    foundedOn: DATE_RE.test(founded) ? founded : '',
    founders: clip(row.founders, 120),
    lineage: clip(row.lineage, 240),
    optIn,
  };
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
