/**
 * "Don't allow photos": a student-to-coach flag.
 *
 * Student phone: the student (or a parent with the PIN, when Parent approvals is on)
 * turns it on or off. While on, the phone hides Send photo to coach and strips the
 * photo from a card share. The flag goes to the coach as a small file
 * (`advantage-student-photo-flag`). Advantage Cloud has no route for this kind yet,
 * so delivery is the file today, the same fallback the other student files use.
 *
 * Coach device: importing the file applies right away to every card for that
 * Student Edition id, marked 'family'. Only another family file clears a family flag.
 * Nothing else on the card changes.
 */

import { parentGateOn, readParentGate, hashGatePin } from './parentGate.ts';
import { setNoPhotosForLinkedStudent } from './rosterStore.ts';

export const STUDENT_PHOTO_FLAG_KIND = 'advantage-student-photo-flag' as const;
export const STUDENT_NO_PHOTOS_KEY = 'matboard.studentEdition.noPhotos.v1';
export const STUDENT_NO_PHOTOS_EVENT = 'matboard-student-no-photos';

export type StudentPhotoFlag = { on: boolean; setBy: 'student' | 'parent'; at: number };
export type StudentPhotoFlagPacket = {
  kind: typeof STUDENT_PHOTO_FLAG_KIND;
  version: 1;
  studentId: string;
  noPhotos: boolean;
  setBy: 'student' | 'parent';
  at: number;
};

type MemoryStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export function readStudentNoPhotos(storage: Pick<MemoryStore, 'getItem'>): StudentPhotoFlag {
  try {
    const raw = JSON.parse(storage.getItem(STUDENT_NO_PHOTOS_KEY) || 'null') as Partial<StudentPhotoFlag> | null;
    if (raw && raw.on === true) return { on: true, setBy: raw.setBy === 'parent' ? 'parent' : 'student', at: Number(raw.at) || 0 };
  } catch {
    /* fall through */
  }
  return { on: false, setBy: 'student', at: 0 };
}

export type StudentNoPhotosChange =
  | { ok: true; flag: StudentPhotoFlag; packet: StudentPhotoFlagPacket | null }
  | { ok: false; error: string };

/**
 * Set or clear Don't allow photos on the student phone. With Parent approvals on,
 * the parent PIN is required either way. Returns the packet for the coach
 * (null when there is no linked Student Edition id yet).
 */
export async function setStudentNoPhotos(
  storage: MemoryStore,
  on: boolean,
  options: { studentId?: string | null; pin?: string; now?: number } = {},
): Promise<StudentNoPhotosChange> {
  const gated = parentGateOn(storage);
  if (gated) {
    const state = readParentGate(storage);
    const pin = (options.pin ?? '').trim();
    if (!pin || !state.pinHash || (await hashGatePin(pin)) !== state.pinHash) {
      return { ok: false, error: 'A parent enters the PIN to change photo permission.' };
    }
  }
  const now = options.now ?? Date.now();
  const flag: StudentPhotoFlag = { on, setBy: gated ? 'parent' : 'student', at: now };
  storage.setItem(STUDENT_NO_PHOTOS_KEY, JSON.stringify(flag));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(STUDENT_NO_PHOTOS_EVENT));
  }
  const studentId = (options.studentId ?? '').trim();
  const packet: StudentPhotoFlagPacket | null = studentId
    ? { kind: STUDENT_PHOTO_FLAG_KIND, version: 1, studentId, noPhotos: on, setBy: flag.setBy, at: now }
    : null;
  return { ok: true, flag, packet };
}

export function studentPhotoFlagFile(packet: StudentPhotoFlagPacket): { name: string; json: string } {
  const stamp = new Date(packet.at).toISOString().slice(0, 10);
  return { name: `advantage-student-photo-flag-${stamp}.json`, json: JSON.stringify(packet, null, 2) };
}

export function parseStudentPhotoFlag(text: string): StudentPhotoFlagPacket | null {
  try {
    const row = JSON.parse(text) as Partial<StudentPhotoFlagPacket>;
    if (!row || row.kind !== STUDENT_PHOTO_FLAG_KIND || row.version !== 1) return null;
    if (typeof row.studentId !== 'string' || !row.studentId.trim() || typeof row.noPhotos !== 'boolean') return null;
    return {
      kind: STUDENT_PHOTO_FLAG_KIND,
      version: 1,
      studentId: row.studentId.trim(),
      noPhotos: row.noPhotos,
      setBy: row.setBy === 'parent' ? 'parent' : 'student',
      at: Number(row.at) || 0,
    };
  } catch {
    return null;
  }
}

/** Coach import. Applies immediately to every card linked to that student. */
export function applyStudentPhotoFlag(packet: StudentPhotoFlagPacket): number {
  return setNoPhotosForLinkedStudent(packet.studentId, packet.noPhotos, 'family');
}
