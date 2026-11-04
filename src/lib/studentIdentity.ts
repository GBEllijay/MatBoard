/**
 * Stable Student Edition id.
 * A blank journal starts as student-local. The first time the student connects
 * to an academy, or shows their id to a coach, that placeholder becomes one id
 * and stays that id on this phone.
 */

import type { StudentProgressReport } from './progress/types.ts';

export const STABLE_STUDENT_ID_KEY = 'matboard.studentEdition.stableId.v1';
export const PLACEHOLDER_STUDENT_ID = 'student-local';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function isStableStudentId(value: string): boolean {
  return ID_RE.test(value) && value !== PLACEHOLDER_STUDENT_ID;
}

export function studentLinkCode(studentId: string): string {
  return `advantage-student:${studentId}`;
}

/** A pasted id, an advantage-student code, or a link that carries studentId. */
export function parseStudentLink(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const prefixed = text.match(/advantage-student:([A-Za-z0-9][A-Za-z0-9._-]{0,79})/);
  if (prefixed && isStableStudentId(prefixed[1])) return prefixed[1];
  if (isStableStudentId(text)) return text;
  try {
    const url = new URL(text, 'https://advantage.local');
    const fromQuery = url.searchParams.get('studentId') ?? url.searchParams.get('student');
    if (fromQuery && isStableStudentId(fromQuery)) return fromQuery;
  } catch {
    /* a bare id was already tried */
  }
  return null;
}

export function readStableStudentId(storage: Pick<MemoryStore, 'getItem'>): string | null {
  try {
    const raw = storage.getItem(STABLE_STUDENT_ID_KEY)?.trim() ?? '';
    return isStableStudentId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function mintStudentId(now = Date.now()): string {
  const stamp = now.toString(36);
  const noise = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(4, '0');
  const id = `stu-${stamp}-${noise}`.slice(0, 80);
  return isStableStudentId(id) ? id : `stu-${stamp}`;
}

export function assignStudentId(report: StudentProgressReport, studentId: string, now = Date.now()): StudentProgressReport {
  if (!isStableStudentId(studentId)) return report;
  if (report.studentId === studentId && report.profile.id === studentId) return report;
  return {
    ...report,
    studentId,
    updatedAt: now,
    profile: { ...report.profile, id: studentId },
  };
}

/**
 * Keep an id the phone already has. Mint one only when the journal is still
 * the shared placeholder. Calling this on a blank test journal changes that
 * journal, so screens call it from connect and from Show my student ID.
 */
export function ensureStableStudentId(
  report: StudentProgressReport,
  storage: MemoryStore,
  now = Date.now(),
): { report: StudentProgressReport; studentId: string; changed: boolean } {
  if (isStableStudentId(report.studentId)) {
    try {
      storage.setItem(STABLE_STUDENT_ID_KEY, report.studentId);
    } catch {
      /* the id is still on the journal */
    }
    return { report, studentId: report.studentId, changed: false };
  }
  const stored = readStableStudentId(storage);
  const studentId = stored ?? mintStudentId(now);
  try {
    storage.setItem(STABLE_STUDENT_ID_KEY, studentId);
  } catch {
    /* the journal copy below is the source the coach will see after the next save */
  }
  return { report: assignStudentId(report, studentId, now), studentId, changed: true };
}
