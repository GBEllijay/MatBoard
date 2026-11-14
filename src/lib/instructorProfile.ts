/**
 * Per-seat instructor identity for the Instructor Edition character sheet.
 * Stored under INSTRUCTOR_PROFILE_STORAGE_KEY, keyed like the D12 store.
 * Does not write academy profile data or seat/license records.
 */
import { instructorD12SeatKey } from './instructorD12.ts';

export const INSTRUCTOR_PROFILE_STORAGE_KEY = 'matboard.instructor.profile.v1';
export const INSTRUCTOR_NAME_PLACEHOLDER = 'Add your name';
export const INSTRUCTOR_NAME_MAX = 80;

export const INSTRUCTOR_PROFILE_BELTS = [
  { id: 'white', label: 'White belt' },
  { id: 'blue', label: 'Blue belt' },
  { id: 'purple', label: 'Purple belt' },
  { id: 'brown', label: 'Brown belt' },
  { id: 'black', label: 'Black belt' },
  { id: 'coral', label: 'Coral belt' },
  { id: 'redWhite', label: 'Red and white belt' },
  { id: 'red', label: 'Red belt' },
] as const;

export type InstructorProfileBeltId = (typeof INSTRUCTOR_PROFILE_BELTS)[number]['id'];

export type InstructorProfile = {
  name: string;
  belt: InstructorProfileBeltId | '';
};

type InstructorProfileFile = {
  v: 1;
  profilesBySeat: Record<string, InstructorProfile>;
};

const CHANGE_EVENT = 'matboard-instructor-profile';

export function instructorProfileSeatKey(seatId: string | null | undefined): string {
  return instructorD12SeatKey(seatId);
}

function clipName(value: string): string {
  return value.normalize('NFC').trim().slice(0, INSTRUCTOR_NAME_MAX);
}

function namesMatch(left: string, right: string): boolean {
  return clipName(left).toLowerCase() === clipName(right).toLowerCase();
}

function isBeltId(value: unknown): value is InstructorProfileBeltId {
  return INSTRUCTOR_PROFILE_BELTS.some((belt) => belt.id === value);
}

export function instructorBeltLabel(belt: string | null | undefined): string {
  return INSTRUCTOR_PROFILE_BELTS.find((row) => row.id === belt)?.label ?? '';
}

const EMPTY_PROFILE: InstructorProfile = { name: '', belt: '' };

function emptyProfile(): InstructorProfile {
  return EMPTY_PROFILE;
}

const profileMemo = new Map<string, { raw: string | null; profile: InstructorProfile }>();

function cleanProfile(raw: unknown): InstructorProfile {
  if (!raw || typeof raw !== 'object') return emptyProfile();
  const record = raw as { name?: unknown; belt?: unknown };
  return {
    name: typeof record.name === 'string' ? clipName(record.name) : '',
    belt: isBeltId(record.belt) ? record.belt : '',
  };
}

function emptyFile(): InstructorProfileFile {
  return { v: 1, profilesBySeat: {} };
}

function readFile(storage: Pick<Storage, 'getItem'>): InstructorProfileFile {
  try {
    const raw = storage.getItem(INSTRUCTOR_PROFILE_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as { v?: number; profilesBySeat?: Record<string, unknown> };
    if (!parsed || parsed.v !== 1 || !parsed.profilesBySeat || typeof parsed.profilesBySeat !== 'object') {
      return emptyFile();
    }
    return {
      v: 1,
      profilesBySeat: Object.fromEntries(
        Object.entries(parsed.profilesBySeat).map(([key, value]) => [key, cleanProfile(value)]),
      ),
    };
  } catch {
    return emptyFile();
  }
}

export function loadInstructorProfile(
  storage: Pick<Storage, 'getItem'> = localStorage,
  seatKey = 'owner',
): InstructorProfile {
  let raw: string | null = null;
  try {
    raw = storage.getItem(INSTRUCTOR_PROFILE_STORAGE_KEY);
  } catch {
    raw = null;
  }
  const memoKey = `${seatKey}::${raw ?? ''}`;
  const hit = profileMemo.get(memoKey);
  if (hit && hit.raw === raw) return hit.profile;
  const profile = cleanProfile(readFile(storage).profilesBySeat[seatKey]);
  const stable = profile.name || profile.belt ? profile : EMPTY_PROFILE;
  profileMemo.set(memoKey, { raw, profile: stable });
  return stable;
}

export function saveInstructorProfile(
  profile: Partial<InstructorProfile>,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  seatKey = 'owner',
): InstructorProfile {
  const file = readFile(storage);
  const next = cleanProfile({ ...file.profilesBySeat[seatKey], ...profile });
  if (next.name || next.belt) file.profilesBySeat[seatKey] = next;
  else delete file.profilesBySeat[seatKey];
  storage.setItem(INSTRUCTOR_PROFILE_STORAGE_KEY, JSON.stringify(file));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

export function subscribeInstructorProfile(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === INSTRUCTOR_PROFILE_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Instructor display name, never the academy name.
 * Priority: saved instructor name, then a seat instructor name, then the
 * Student Edition profile name, then a neutral placeholder.
 */
export function resolveInstructorName(input: {
  savedName?: string | null;
  seatName?: string | null;
  studentName?: string | null;
  academyName?: string | null;
}): { name: string; placeholder: boolean } {
  const academy = clipName(input.academyName ?? '');
  const usable = (value: string | null | undefined): string => {
    const name = clipName(value ?? '');
    if (!name) return '';
    if (academy && namesMatch(name, academy)) return '';
    return name;
  };
  const saved = usable(input.savedName);
  if (saved) return { name: saved, placeholder: false };
  const seat = usable(input.seatName);
  if (seat) return { name: seat, placeholder: false };
  const student = usable(input.studentName);
  if (student) return { name: student, placeholder: false };
  return { name: INSTRUCTOR_NAME_PLACEHOLDER, placeholder: true };
}

export function resolveInstructorBelt(input: {
  savedBelt?: string | null;
  studentBeltLabel?: string | null;
}): string {
  const saved = instructorBeltLabel(input.savedBelt);
  if (saved) return saved;
  return (input.studentBeltLabel ?? '').trim();
}

/** A seat's own instructor name, if one exists. Email and gym names are ignored. */
export function seatInstructorName(seat: unknown, academyName?: string | null): string {
  if (!seat || typeof seat !== 'object') return '';
  const record = seat as { name?: unknown; displayName?: unknown };
  const candidates = [record.name, record.displayName];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const name = clipName(value);
    if (!name) continue;
    if (academyName && namesMatch(name, academyName)) continue;
    return name;
  }
  return '';
}
