/**
 * Academy name for this device (`matboard.gymName.v1`).
 * The academy profile on Pro is the master editor. Media Console writes this same key.
 * Paired with the logo in `matboard.gymLogo.v1`.
 * A class-board title and a student's own academy name are separate and are not written here.
 * New competitor cards can start from `readGymName()` when their own gym is empty.
 */

export const GYM_NAME_STORAGE_KEY = 'matboard.gymName.v1';
export const GYM_NAME_MAX = 80;
const GYM_NAME_EVENT = 'matboard-gym-name';

type GymNameRecord = {
  version: 1;
  name: string;
};

function clipGymName(value: string): string {
  return value.normalize('NFC').slice(0, GYM_NAME_MAX);
}

function readRecord(): GymNameRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GYM_NAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GymNameRecord>;
    if (parsed.version !== 1 || typeof parsed.name !== 'string') return null;
    return { version: 1, name: clipGymName(parsed.name) };
  } catch {
    return null;
  }
}

function emitGymName(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GYM_NAME_EVENT));
}

/**
 * Saved school or academy, or '' when none is set.
 * Spaces at the end are kept so a name can still be typed. The editor trims on blur.
 */
export function readGymName(): string {
  return readRecord()?.name ?? '';
}

export function subscribeGymName(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === GYM_NAME_STORAGE_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(GYM_NAME_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(GYM_NAME_EVENT, fn);
  };
}

/**
 * Save the device gym name, including a space at the end while it is being typed.
 * A value that is only spaces clears the key. Callers trim on blur.
 */
export function writeGymName(value: string): void {
  const clipped = clipGymName(value);
  try {
    if (!clipped.trim()) {
      localStorage.removeItem(GYM_NAME_STORAGE_KEY);
    } else {
      const record: GymNameRecord = { version: 1, name: clipped };
      localStorage.setItem(GYM_NAME_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    /* quota / private mode */
  }
  emitGymName();
}
