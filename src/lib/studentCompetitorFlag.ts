/**
 * Student Edition "I'm a competitor" switch. Local to this phone only.
 *
 * - Unset reads as ON so existing students keep the Competitor tile they have today.
 * - Turning it off only hides the Competitor tile on the hub and the competitor section
 *   on My profile. Nothing is deleted and /student/compete still opens by link.
 * - Nothing is ever sent. The coach only learns about it through the existing explicit
 *   student-to-coach share, and this flag is not part of that payload.
 */
export const STUDENT_COMPETITOR_KEY = 'matboard.studentCompetitor.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function store(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

export function readStudentCompetitor(storage: Store | null = store()): boolean {
  try {
    const raw = storage?.getItem(STUDENT_COMPETITOR_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { on?: unknown } | null;
    return parsed && typeof parsed === 'object' && parsed.on === false ? false : true;
  } catch {
    return true;
  }
}

export function writeStudentCompetitor(on: boolean, storage: Store | null = store()): boolean {
  try {
    storage?.setItem(STUDENT_COMPETITOR_KEY, JSON.stringify({ version: 1, on }));
  } catch {
    /* private mode: the switch still flips for this visit */
  }
  listeners.forEach((fn) => fn());
  return on;
}

export function subscribeStudentCompetitor(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
