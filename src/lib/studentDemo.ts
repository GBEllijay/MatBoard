/**
 * The stress-test Send-to-coach file is a black belt, 3 stripes,
 * Pan Pacific Championship (mock), and a 181.4 lb goal. It is a fixture
 * for tests. A new journal must not pick it up from a late localStorage
 * write. Import, backup, and any other save through saveStudentReport
 * still store whatever the student confirmed, including that file.
 * ?demo=1 and ?demo=paige are the only preview switches that allow a raw write.
 */

export const STUDENT_FILE_STORAGE_KEY = 'matboard.studentEdition.v1';

const MOCK_EVENT = 'Pan Pacific Championship (mock)';
const MOCK_GOAL_LB = 181.4;

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

type ReportLike = {
  profile?: { belt?: unknown };
  rank?: { tapeCount?: unknown };
  competition?: { goalWeight?: unknown; tournaments?: { name?: unknown }[] | unknown };
  report?: unknown;
};

let appSaveDepth = 0;
let lastAppSaved: string | null = null;
let guardInstalled = false;
let otherTabWrote = false;

export function noteStudentStorageEvent(key: string | null): void {
  if (key === STUDENT_FILE_STORAGE_KEY) otherTabWrote = true;
}

export function explicitStudentDemo(search: string): boolean {
  const query = search.includes('?') ? search.slice(search.indexOf('?') + 1) : search;
  const demo = new URLSearchParams(query).get('demo')?.trim().toLowerCase() ?? '';
  return demo === '1' || demo === 'paige';
}

function matchesBundledMock(report: ReportLike): boolean {
  if (report.profile?.belt !== 'black') return false;
  if (report.rank?.tapeCount !== 3) return false;
  if (report.competition?.goalWeight !== MOCK_GOAL_LB) return false;
  const tournaments = report.competition?.tournaments;
  if (!Array.isArray(tournaments)) return false;
  return tournaments.some((row) => row?.name === MOCK_EVENT);
}

/** True only for the bundled stress-test journal, not for a real black belt. */
export function isBundledMockStudentPayload(value: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return false;
  }
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as ReportLike;
  if (matchesBundledMock(record)) return true;
  return Boolean(record.report && typeof record.report === 'object' && matchesBundledMock(record.report as ReportLike));
}

export function beginAppStudentSave(): void {
  appSaveDepth += 1;
}

export function endAppStudentSave(): void {
  appSaveDepth = Math.max(0, appSaveDepth - 1);
}

export function noteAppStudentSave(value: string): void {
  lastAppSaved = value;
}

/** A raw write of the stress-test file. App saves and explicit demo flags pass. */
export function shouldDropUnsolicitedStudentWrite(key: string, value: unknown, search: string): boolean {
  if (key !== STUDENT_FILE_STORAGE_KEY) return false;
  if (appSaveDepth > 0) return false;
  if (explicitStudentDemo(search)) return false;
  const text = typeof value === 'string' ? value : String(value ?? '');
  return isBundledMockStudentPayload(text);
}

/**
 * If the stress-test file showed up without an app save, put the journal back.
 * Another tab's write is left alone. A file already stored when this page
 * opened is lastAppSaved, so an existing journal is not removed.
 */
export function reconcileStudentStorage(storage: StorageLike, search: string): void {
  if (!guardInstalled || otherTabWrote || appSaveDepth > 0 || explicitStudentDemo(search)) return;
  const raw = storage.getItem(STUDENT_FILE_STORAGE_KEY);
  if (raw === lastAppSaved) return;
  if (raw == null || !isBundledMockStudentPayload(raw)) {
    lastAppSaved = raw;
    return;
  }
  if (lastAppSaved == null) storage.removeItem?.(STUDENT_FILE_STORAGE_KEY);
  else storage.setItem(STUDENT_FILE_STORAGE_KEY, lastAppSaved);
}

export function installStudentMockGuard(
  storage: StorageLike = globalThis.localStorage,
  readSearch: () => string = () => (typeof window === 'undefined' ? '' : window.location.search),
): void {
  if (guardInstalled) return;
  guardInstalled = true;
  lastAppSaved = storage.getItem(STUDENT_FILE_STORAGE_KEY);
  const original = storage.setItem.bind(storage);
  storage.setItem = (key: string, value: string) => {
    if (shouldDropUnsolicitedStudentWrite(key, value, readSearch())) return;
    original(key, value);
  };
  if (typeof window === 'undefined' || storage !== globalThis.localStorage) return;
  window.addEventListener('storage', (event) => {
    noteStudentStorageEvent(event.key);
  });
  window.setInterval(() => reconcileStudentStorage(storage, readSearch()), 250);
}

/** Test helper. Production installs once per page. */
export function resetStudentMockGuardForTests(): void {
  appSaveDepth = 0;
  lastAppSaved = null;
  guardInstalled = false;
  otherTabWrote = false;
}
