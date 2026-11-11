/**
 * Family profiles on one Student Edition device.
 * The original single-profile keys stay the default profile: nothing is moved
 * or deleted when the registry is created. Other profiles use a suffix.
 * The first profile is free. Each profile after that needs a purchased slot
 * unless the dev fixture key is set. Switching profiles does not buy a slot.
 * addStudentProfile itself stays open so tests can still create profiles.
 */

export const EXTRA_PROFILE_FIXTURE_KEY = 'matboard.studentEdition.extraProfiles.fixture';
export const EXTRA_PROFILE_SLOTS_KEY = 'matboard.studentEdition.extraProfileSlots.v1';

export const DEFAULT_STUDENT_PROFILE_ID = 'default';
export const DEFAULT_STUDENT_PROFILE_NAME = 'My profile';
export const STUDENT_PROFILE_NAME_MAX = 40;
export const ADD_PROFILE_LABEL = 'Add a profile';

/** Device registry. Not namespaced, so switching profiles cannot hide it. */
export const STUDENT_PROFILES_KEY = 'matboard.studentEdition.profiles.v1';

const PROFILE_MARK = '::profile:';
const PROFILE_ID_RE = /^p[a-z0-9]{10,20}$/;
const PORTRAIT_MAX = 70_000;
const PORTRAIT_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/;
const MAX_PROFILES = 25;

const DEVICE_KEYS = new Set([STUDENT_PROFILES_KEY]);

const STUDENT_KEY_PREFIXES = [
  'matboard.studentEdition.',
  'matboard.studentPortrait',
  'matboard.studentGymLogo',
  'matboard.studentCompetitor',
  'matboard.studentProfileMarks',
  'matboard.student.',
];

export type StudentProfileRecord = {
  id: string;
  name: string;
  createdAt: string;
  portrait?: string;
};

export type StudentProfileRegistry = {
  version: 1;
  activeId: string;
  profiles: StudentProfileRecord[];
};

export type StudentKeyStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
  key?: (index: number) => string | null;
  readonly length?: number;
};

export type AddStudentProfileResult =
  | { ok: true; profile: StudentProfileRecord }
  | { ok: false; reason: 'name' | 'portrait' | 'full' };

const captured = new WeakMap<object, StudentKeyStore>();

function browserStore(): StudentKeyStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (typeof localStorage.getItem !== 'function' || typeof localStorage.setItem !== 'function') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isStudentProfileId(id: string): boolean {
  return id === DEFAULT_STUDENT_PROFILE_ID || PROFILE_ID_RE.test(id);
}

export function cleanStudentProfileName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, STUDENT_PROFILE_NAME_MAX);
}

export function keptStudentProfilePortrait(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > PORTRAIT_MAX || !PORTRAIT_RE.test(value)) return undefined;
  return value;
}

/** A per-student key. The profile registry stays on the device. */
export function isPerStudentStorageKey(key: string): boolean {
  if (!key || DEVICE_KEYS.has(key) || key.includes(PROFILE_MARK)) return false;
  return STUDENT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Storage key for one profile.
 * The default profile keeps the original key so an existing journal is not copied or moved.
 */
export function studentProfileStorageKey(profileId: string, key: string): string {
  if (!key || key.includes(PROFILE_MARK) || !isPerStudentStorageKey(key)) return key;
  if (!profileId || profileId === DEFAULT_STUDENT_PROFILE_ID) return key;
  return `${key}${PROFILE_MARK}${profileId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mintProfileId(now = Date.now()): string {
  const stamp = now.toString(36);
  const noise = Math.floor(Math.random() * 36 ** 8)
    .toString(36)
    .padStart(6, '0');
  const id = `p${stamp}${noise}`.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 21);
  return isStudentProfileId(id) && id !== DEFAULT_STUDENT_PROFILE_ID ? id : `p${stamp}profile1`;
}

function cleanProfile(value: unknown, createdAt: string): StudentProfileRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StudentProfileRecord>;
  if (typeof row.id !== 'string' || !isStudentProfileId(row.id)) return null;
  const name = cleanStudentProfileName(typeof row.name === 'string' ? row.name : '');
  if (!name) return null;
  const record: StudentProfileRecord = {
    id: row.id,
    name,
    createdAt: typeof row.createdAt === 'string' && row.createdAt.trim() ? row.createdAt : createdAt,
  };
  const portrait = keptStudentProfilePortrait(row.portrait);
  if (portrait) record.portrait = portrait;
  return record;
}

function implicitRegistry(): StudentProfileRegistry {
  return {
    version: 1,
    activeId: DEFAULT_STUDENT_PROFILE_ID,
    profiles: [
      {
        id: DEFAULT_STUDENT_PROFILE_ID,
        name: DEFAULT_STUDENT_PROFILE_NAME,
        createdAt: nowIso(),
      },
    ],
  };
}

function normalizeRegistry(value: unknown): StudentProfileRegistry {
  const createdAt = nowIso();
  const source = value && typeof value === 'object' ? (value as Partial<StudentProfileRegistry>) : null;
  const rows = Array.isArray(source?.profiles) ? source.profiles : [];
  const profiles: StudentProfileRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const profile = cleanProfile(row, createdAt);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
    if (profiles.length >= MAX_PROFILES) break;
  }
  if (!seen.has(DEFAULT_STUDENT_PROFILE_ID)) {
    profiles.unshift({
      id: DEFAULT_STUDENT_PROFILE_ID,
      name: DEFAULT_STUDENT_PROFILE_NAME,
      createdAt,
    });
  }
  const active = typeof source?.activeId === 'string' ? source.activeId : DEFAULT_STUDENT_PROFILE_ID;
  return {
    version: 1,
    activeId: profiles.some((profile) => profile.id === active) ? active : DEFAULT_STUDENT_PROFILE_ID,
    profiles,
  };
}

function parseRegistry(raw: string | null): StudentProfileRegistry | null {
  if (!raw) return null;
  try {
    return normalizeRegistry(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readStudentProfiles(storage: Pick<StudentKeyStore, 'getItem'> | null | undefined): StudentProfileRegistry {
  if (!storage) return implicitRegistry();
  try {
    return parseRegistry(storage.getItem(STUDENT_PROFILES_KEY)) ?? implicitRegistry();
  } catch {
    return implicitRegistry();
  }
}

/**
 * Create the registry once. Existing student keys are left byte-for-byte.
 * Calling it again does not rewrite a registry that is already in this shape.
 */
export function ensureStudentProfiles(storage: StudentKeyStore): StudentProfileRegistry {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STUDENT_PROFILES_KEY);
  } catch {
    raw = null;
  }
  const next = parseRegistry(raw) ?? implicitRegistry();
  const text = JSON.stringify(next);
  if (raw !== text) storage.setItem(STUDENT_PROFILES_KEY, text);
  return next;
}

export function readActiveStudentProfile(storage?: Pick<StudentKeyStore, 'getItem'> | null): StudentProfileRecord {
  const registry = readStudentProfiles(storage === undefined ? browserStore() : storage);
  return (
    registry.profiles.find((profile) => profile.id === registry.activeId) ??
    registry.profiles[0] ?? {
      id: DEFAULT_STUDENT_PROFILE_ID,
      name: DEFAULT_STUDENT_PROFILE_NAME,
      createdAt: nowIso(),
    }
  );
}

export function readActiveStudentProfileId(storage?: Pick<StudentKeyStore, 'getItem'> | null): string {
  return readActiveStudentProfile(storage).id;
}

function writeRegistry(storage: StudentKeyStore, registry: StudentProfileRegistry): void {
  storage.setItem(STUDENT_PROFILES_KEY, JSON.stringify(registry));
}

export function extraProfileFixtureOn(storage: Pick<StudentKeyStore, 'getItem'> | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(EXTRA_PROFILE_FIXTURE_KEY) === '1';
  } catch {
    return false;
  }
}

export function readExtraProfileSlots(storage: Pick<StudentKeyStore, 'getItem'> | null | undefined): number {
  if (!storage) return 0;
  try {
    const value = Number(storage.getItem(EXTRA_PROFILE_SLOTS_KEY));
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  } catch {
    return 0;
  }
}

export function writeExtraProfileSlots(storage: StudentKeyStore, slots: number): void {
  const count = Number.isFinite(slots) ? Math.max(0, Math.floor(slots)) : 0;
  storage.setItem(EXTRA_PROFILE_SLOTS_KEY, String(count));
}

/** True when the next profile needs the $5.99 checkout. The fixture path stays free. */
export function extraProfileNeedsPurchase(profileCount: number, purchasedSlots: number, fixture: boolean): boolean {
  if (fixture) return false;
  const extras = Math.max(0, Math.floor(profileCount) - 1);
  const slots = Number.isFinite(purchasedSlots) ? Math.max(0, Math.floor(purchasedSlots)) : 0;
  return extras >= slots;
}

export function addStudentProfile(
  storage: StudentKeyStore,
  input: { name: string; portrait?: string | null },
): AddStudentProfileResult {
  const registry = ensureStudentProfiles(storage);
  if (registry.profiles.length >= MAX_PROFILES) return { ok: false, reason: 'full' };
  const name = cleanStudentProfileName(input.name);
  if (!name) return { ok: false, reason: 'name' };
  const portrait = input.portrait ? keptStudentProfilePortrait(input.portrait) : undefined;
  if (input.portrait && !portrait) return { ok: false, reason: 'portrait' };
  const profile: StudentProfileRecord = {
    id: mintProfileId(),
    name,
    createdAt: nowIso(),
  };
  if (portrait) profile.portrait = portrait;
  writeRegistry(storage, { ...registry, profiles: [...registry.profiles, profile] });
  return { ok: true, profile };
}

export function renameStudentProfile(storage: StudentKeyStore, id: string, name: string): boolean {
  const registry = ensureStudentProfiles(storage);
  const clean = cleanStudentProfileName(name);
  if (!clean || !registry.profiles.some((profile) => profile.id === id)) return false;
  writeRegistry(storage, {
    ...registry,
    profiles: registry.profiles.map((profile) => (profile.id === id ? { ...profile, name: clean } : profile)),
  });
  return true;
}

export function setStudentProfilePortrait(storage: StudentKeyStore, id: string, portrait: string | null): boolean {
  const registry = ensureStudentProfiles(storage);
  if (!registry.profiles.some((profile) => profile.id === id)) return false;
  const nextPortrait = portrait ? keptStudentProfilePortrait(portrait) : undefined;
  if (portrait && !nextPortrait) return false;
  writeRegistry(storage, {
    ...registry,
    profiles: registry.profiles.map((profile) => {
      if (profile.id !== id) return profile;
      const next: StudentProfileRecord = { id: profile.id, name: profile.name, createdAt: profile.createdAt };
      if (nextPortrait) next.portrait = nextPortrait;
      return next;
    }),
  });
  return true;
}

function listKeys(storage: StudentKeyStore): string[] {
  if (typeof storage.key !== 'function' || typeof storage.length !== 'number') return [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function switchStudentProfile(storage: StudentKeyStore, id: string): boolean {
  const registry = ensureStudentProfiles(storage);
  if (!registry.profiles.some((profile) => profile.id === id)) return false;
  if (registry.activeId !== id) writeRegistry(storage, { ...registry, activeId: id });
  return true;
}

/** Drop one extra profile and the keys that belong to it. The default profile stays. */
export function deleteStudentProfile(storage: StudentKeyStore, id: string): boolean {
  if (id === DEFAULT_STUDENT_PROFILE_ID || !isStudentProfileId(id)) return false;
  const registry = ensureStudentProfiles(storage);
  if (!registry.profiles.some((profile) => profile.id === id)) return false;
  const suffix = `${PROFILE_MARK}${id}`;
  for (const key of listKeys(storage)) {
    if (key.endsWith(suffix)) storage.removeItem?.(key);
  }
  const profiles = registry.profiles.filter((profile) => profile.id !== id);
  writeRegistry(storage, {
    version: 1,
    activeId: registry.activeId === id ? DEFAULT_STUDENT_PROFILE_ID : registry.activeId,
    profiles,
  });
  return true;
}

export function backupProfileFromUnknown(value: unknown): { id: string; name: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as { id?: unknown; name?: unknown };
  if (typeof row.id !== 'string' || !isStudentProfileId(row.id)) return undefined;
  const name = cleanStudentProfileName(typeof row.name === 'string' ? row.name : '');
  if (!name) return undefined;
  return { id: row.id, name };
}

/** Where a backup file should be written. An unknown id stays on the open profile. */
export function backupRestoreProfileId(
  storage: Pick<StudentKeyStore, 'getItem'>,
  file: { profile?: { id?: string } | null },
): string {
  const named = file.profile?.id;
  if (typeof named === 'string' && isStudentProfileId(named)) {
    if (named === DEFAULT_STUDENT_PROFILE_ID) return named;
    if (readStudentProfiles(storage).profiles.some((profile) => profile.id === named)) return named;
  }
  return readActiveStudentProfile(storage).id;
}

function directStore(storage: StudentKeyStore): StudentKeyStore {
  return captured.get(storage) ?? storage;
}

/** Read and write one profile through the original keys, whatever profile is open. */
export function bindStudentProfileStorage<T extends StudentKeyStore>(storage: T, profileId: string): T {
  const id = isStudentProfileId(profileId) ? profileId : DEFAULT_STUDENT_PROFILE_ID;
  const raw = directStore(storage);
  const bound: StudentKeyStore = {
    getItem: (key) => raw.getItem(studentProfileStorageKey(id, key)),
    setItem: (key, value) => raw.setItem(studentProfileStorageKey(id, key), value),
    removeItem: raw.removeItem ? (key) => raw.removeItem?.(studentProfileStorageKey(id, key)) : undefined,
    key: storage.key,
    get length() {
      return storage.length ?? 0;
    },
  };
  return bound as T;
}

/**
 * Send per-student localStorage keys to the open profile.
 * Install after the demo guard so ?student=1 still owns the default profile,
 * and a second profile is stored under its own keys.
 */
export function installStudentProfileScope(storage?: StudentKeyStore): void {
  const target = storage ?? browserStore();
  if (!target || captured.has(target)) return;
  const nativeGet = target.getItem.bind(target);
  const nativeSet = target.setItem.bind(target);
  const nativeRemove = target.removeItem?.bind(target);
  captured.set(target, {
    getItem: nativeGet,
    setItem: nativeSet,
    removeItem: nativeRemove,
  });
  const openId = () => readActiveStudentProfile({ getItem: nativeGet }).id;
  const wrappedGet = (key: string) => nativeGet(studentProfileStorageKey(openId(), key));
  const wrappedSet = (key: string, value: string) => nativeSet(studentProfileStorageKey(openId(), key), value);
  const wrappedRemove = (key: string) => nativeRemove?.(studentProfileStorageKey(openId(), key));
  try {
    Object.defineProperty(target, 'getItem', { value: wrappedGet, writable: true, configurable: true });
    Object.defineProperty(target, 'setItem', { value: wrappedSet, writable: true, configurable: true });
    if (nativeRemove) Object.defineProperty(target, 'removeItem', { value: wrappedRemove, writable: true, configurable: true });
  } catch {
    target.getItem = wrappedGet;
    target.setItem = wrappedSet;
    if (nativeRemove) target.removeItem = wrappedRemove;
  }
}
