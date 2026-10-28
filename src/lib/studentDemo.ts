/**
 * Demo data stays off a normal Student Edition.
 * ?student=1 is the public demo. It shows sample data in memory and does not
 * write the real journal keys. ?demo=1 and ?demo=paige still name the
 * stress-test seeds. A saved journal is left alone when the demo is on.
 */

import { ownerTestActive } from './ownerTestGrant.ts';

export const STUDENT_FILE_STORAGE_KEY = 'matboard.studentEdition.v1';

/** Same key as studentAssessment. Duplicated here so the guard does not import that module. */
export const STUDENT_ASSESSMENT_GUARD_KEY = 'matboard.studentEdition.assessment.v1';

/** Same key as studentBackupStamp. Duplicated here so the guard does not import that module. */
export const STUDENT_BACKUP_STAMP_GUARD_KEY = 'matboard.studentEdition.lastBackupAt.v1';

const MOCK_EVENT = 'Pan Pacific Championship (mock)';
const MOCK_GOAL_LB = 181.4;

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

type ReportLike = {
  profile?: { belt?: unknown; displayName?: unknown; gymName?: unknown };
  rank?: { tapeCount?: unknown };
  competition?: {
    goalWeight?: unknown;
    tournaments?: { name?: unknown }[] | unknown;
    weighIns?: unknown;
    results?: unknown;
  };
  journal?: unknown;
  checklist?: unknown;
  calendar?: unknown;
  goals?: unknown;
  report?: unknown;
};

let appSaveDepth = 0;
let lastAppSaved: string | null = null;
let lastAppAssessment: string | null = null;
let lastAppStamp: string | null = null;
let pendingStamp: string | null = null;
let restoring = false;
let guardInstalled = false;
let otherTabWrote = false;
let guardTimer: number | null = null;
let readDemoSearch: () => string = () => (typeof window === 'undefined' ? '' : window.location.search);
const journalListeners = new Set<() => void>();

/** True for the stress-test switches. ?student=1 uses the separate demo overlay. */
export function studentDemoRequested(): boolean {
  return explicitStudentDemo(readDemoSearch());
}

const STUDENT_GUARD_KEYS = new Set([
  STUDENT_FILE_STORAGE_KEY,
  STUDENT_ASSESSMENT_GUARD_KEY,
  STUDENT_BACKUP_STAMP_GUARD_KEY,
]);

let demoSeedProvider: () => string = () => '';
const demoOverlay = new Map<string, string>();

/** Student Edition registers the sample packet so this file does not import it. */
export function registerDemoSeed(provider: () => string): void {
  demoSeedProvider = provider;
}

export function clearStudentDemoOverlay(): void {
  demoOverlay.clear();
  notifyStudentJournal();
}

function searchParams(search: string): URLSearchParams {
  const query = search.includes('?') ? search.slice(search.indexOf('?') + 1) : search;
  return new URLSearchParams(query.split('#')[0] ?? '');
}

function entitledJournal(): boolean {
  if (ownerTestActive('student') || ownerTestActive('pro')) return true;
  try {
    if (localStorage.getItem('advantage.studentEditionRelocked') === '1') return false;
    if (localStorage.getItem('advantage.proUnlocked') === '1') return true;
    if (localStorage.getItem('advantage.studentEditionUnlocked') === '1') return true;
    if (localStorage.getItem('advantage.studentUnlocked') === '1') return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Public `?student=1` demo. Stress-test switches (`?demo=1`, `?demo=paige`)
 * keep their own seed path. A real entitlement uses the real journal.
 */
export function studentDemoIsolated(search = readDemoSearch()): boolean {
  const params = searchParams(search);
  if (params.get('student') !== '1' || explicitStudentDemo(search)) return false;
  return !entitledJournal();
}

export function subscribeStudentJournal(listener: () => void): () => void {
  journalListeners.add(listener);
  return () => {
    journalListeners.delete(listener);
  };
}

export function notifyStudentJournal(): void {
  for (const listener of journalListeners) listener();
}

export function noteStudentStorageEvent(key: string | null): void {
  if (key === STUDENT_FILE_STORAGE_KEY || key === STUDENT_ASSESSMENT_GUARD_KEY || key === STUDENT_BACKUP_STAMP_GUARD_KEY) {
    otherTabWrote = true;
  }
}

export function explicitStudentDemo(search: string): boolean {
  const query = search.includes('?') ? search.slice(search.indexOf('?') + 1) : search;
  const demo = new URLSearchParams(query).get('demo')?.trim().toLowerCase() ?? '';
  return demo === '1' || demo === 'paige';
}

function asRecord(value: unknown): ReportLike | null {
  if (!value || typeof value !== 'object') return null;
  return value as ReportLike;
}

function parseReport(value: string): ReportLike | null {
  try {
    const record = asRecord(JSON.parse(value));
    if (!record) return null;
    if (record.report && typeof record.report === 'object') return record.report as ReportLike;
    return record;
  } catch {
    return null;
  }
}

function matchesBundledMock(report: ReportLike): boolean {
  if (report.profile?.belt !== 'black') return false;
  if (report.rank?.tapeCount !== 3) return false;
  if (report.competition?.goalWeight !== MOCK_GOAL_LB) return false;
  const tournaments = report.competition?.tournaments;
  if (!Array.isArray(tournaments)) return false;
  return tournaments.some((row) => row?.name === MOCK_EVENT);
}

function matchesSimAthlete(report: ReportLike): boolean {
  const name = String(report.profile?.displayName ?? '').trim();
  const gym = String(report.profile?.gymName ?? '').trim();
  const named = /^sim athlete\b/i.test(name);
  const gymHit = /^sim gym\b/i.test(gym);
  const tournaments = report.competition?.tournaments;
  const events = Array.isArray(tournaments) ? tournaments.map((row) => String(row?.name ?? '')) : [];
  const eventHit = events.some((event) => /sim open/i.test(event) || /holiday classic/i.test(event));
  if (named && gymHit) return true;
  if (named && eventHit) return true;
  if (gymHit && eventHit) return true;
  return false;
}

/** True only for the bundled stress-test journal, not for a real black belt. */
export function isBundledMockStudentPayload(value: string): boolean {
  const report = parseReport(value);
  return Boolean(report && matchesBundledMock(report));
}

/**
 * The bundled stress-test file, or the nightly Sim Athlete / Sim Gym /
 * Sim Open Holiday Classic seed. A real blue belt, including one named
 * Sim with a normal gym, is not this.
 */
export function isSimulatedStudentPayload(value: string): boolean {
  const report = parseReport(value);
  if (!report) return false;
  return matchesBundledMock(report) || matchesSimAthlete(report);
}

/**
 * Self-assessment history planted with the simulation.
 * A check-in the student saved themselves is not this, even if the note
 * mentions a mock tournament, because that save goes through the app.
 */
export function isSimulatedAssessmentPayload(value: string): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.includes('mock self-assessment')) return true;
  if (/\bmock\b/.test(lower) && lower.includes('pan pacific')) return true;
  if (lower.includes('sim athlete') || lower.includes('sim open holiday')) return true;
  return false;
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** A missing file, or the blank journal Clear writes. A named student is not blank. */
export function journalLooksBlank(value: string | null): boolean {
  if (!value) return true;
  const report = parseReport(value);
  if (!report) return false;
  const name = String(report.profile?.displayName ?? '').trim();
  const gym = String(report.profile?.gymName ?? '').trim();
  const belt = report.profile?.belt;
  if (name || gym) return false;
  if (belt && belt !== 'white') return false;
  const stripes = report.rank?.tapeCount;
  if (typeof stripes === 'number' && stripes > 0) return false;
  if (listLength(report.journal) || listLength(report.checklist) || listLength(report.calendar) || listLength(report.goals)) {
    return false;
  }
  const rubric = (report as { rubric?: { levels?: unknown } }).rubric;
  if (listLength(rubric?.levels)) return false;
  const competition = report.competition;
  const games = competition && typeof competition === 'object' ? (competition as { games?: unknown }).games : null;
  if (games && typeof games === 'object') {
    for (const game of Object.values(games as Record<string, { techniques?: unknown; notes?: unknown }>)) {
      if (String(game?.techniques ?? '').trim() || String(game?.notes ?? '').trim()) return false;
    }
  }
  if (listLength(competition?.tournaments) || listLength(competition?.weighIns) || listLength(competition?.results)) return false;
  if (competition?.goalWeight != null && competition.goalWeight !== '') return false;
  return true;
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

/** The backup stamp writer calls this before setItem so a real backup is kept. */
export function noteAppBackupStamp(value: string): void {
  pendingStamp = value;
  lastAppStamp = value;
}

/** Clear just erased the side stores. A later seed must not restore them. */
export function noteStudentStoresCleared(): void {
  lastAppAssessment = null;
  lastAppStamp = null;
  pendingStamp = null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

/** A raw write of a demo seed. App saves and explicit demo flags pass. */
export function shouldDropUnsolicitedStudentWrite(key: string, value: unknown, search: string): boolean {
  if (restoring) return false;
  const text = textOf(value);
  if (key === STUDENT_BACKUP_STAMP_GUARD_KEY) {
    if (explicitStudentDemo(search) || text === pendingStamp || text === lastAppStamp) {
      pendingStamp = null;
      lastAppStamp = text;
      return false;
    }
    return true;
  }
  if (key === STUDENT_ASSESSMENT_GUARD_KEY) {
    if (explicitStudentDemo(search) || appSaveDepth > 0) {
      lastAppAssessment = text;
      return false;
    }
    if (isSimulatedAssessmentPayload(text)) return true;
    lastAppAssessment = text;
    return false;
  }
  if (key !== STUDENT_FILE_STORAGE_KEY) return false;
  if (appSaveDepth > 0) return false;
  if (explicitStudentDemo(search)) return false;
  return isSimulatedStudentPayload(text);
}

function writeBack(storage: StorageLike, key: string, value: string | null): void {
  restoring = true;
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem?.(key);
  } finally {
    restoring = false;
  }
}

function purgeJournal(storage: StorageLike): boolean {
  const raw = storage.getItem(STUDENT_FILE_STORAGE_KEY);
  if (raw && isSimulatedStudentPayload(raw)) {
    if (lastAppSaved && !isSimulatedStudentPayload(lastAppSaved)) writeBack(storage, STUDENT_FILE_STORAGE_KEY, lastAppSaved);
    else {
      storage.removeItem?.(STUDENT_FILE_STORAGE_KEY);
      lastAppSaved = null;
    }
    return true;
  }
  if (otherTabWrote && raw && !isSimulatedStudentPayload(raw)) lastAppSaved = raw;
  else if (!otherTabWrote && raw !== lastAppSaved) lastAppSaved = raw;
  return false;
}

function purgeAssessment(storage: StorageLike): boolean {
  const raw = storage.getItem(STUDENT_ASSESSMENT_GUARD_KEY);
  if (raw && isSimulatedAssessmentPayload(raw) && raw !== lastAppAssessment) {
    if (lastAppAssessment && !isSimulatedAssessmentPayload(lastAppAssessment)) {
      writeBack(storage, STUDENT_ASSESSMENT_GUARD_KEY, lastAppAssessment);
    } else {
      storage.removeItem?.(STUDENT_ASSESSMENT_GUARD_KEY);
      lastAppAssessment = null;
    }
    return true;
  }
  if (raw && !isSimulatedAssessmentPayload(raw) && raw !== lastAppAssessment) lastAppAssessment = raw;
  return false;
}

function purgeStamp(storage: StorageLike): boolean {
  const stamp = storage.getItem(STUDENT_BACKUP_STAMP_GUARD_KEY);
  if ((stamp ?? null) === (lastAppStamp ?? null)) return false;
  const journal = storage.getItem(STUDENT_FILE_STORAGE_KEY);
  const assessment = storage.getItem(STUDENT_ASSESSMENT_GUARD_KEY);
  const journalSim = Boolean(journal && isSimulatedStudentPayload(journal));
  const assessmentSim = Boolean(assessment && isSimulatedAssessmentPayload(assessment));
  if (otherTabWrote && !journalSim && !assessmentSim) {
    lastAppStamp = stamp;
    return false;
  }
  if (lastAppStamp) {
    writeBack(storage, STUDENT_BACKUP_STAMP_GUARD_KEY, lastAppStamp);
    return true;
  }
  if (!stamp) return false;
  storage.removeItem?.(STUDENT_BACKUP_STAMP_GUARD_KEY);
  lastAppStamp = null;
  return true;
}

/**
 * Demo seeds are not a journal. Drop them unless this page asked for the
 * demo. A real journal, self-assessment, or backup date this phone already
 * saved is put back. Another tab's real journal is left alone.
 */
export function reconcileStudentStorage(storage: StorageLike, search: string): void {
  if (!guardInstalled || appSaveDepth > 0 || explicitStudentDemo(search)) return;
  const journalChanged = purgeJournal(storage);
  const assessmentChanged = purgeAssessment(storage);
  const stampChanged = purgeStamp(storage);
  otherTabWrote = false;
  if (journalChanged || assessmentChanged || stampChanged) notifyStudentJournal();
}

function rememberExisting(storage: StorageLike, search: string): void {
  const demo = explicitStudentDemo(search);
  const journal = storage.getItem(STUDENT_FILE_STORAGE_KEY);
  const assessment = storage.getItem(STUDENT_ASSESSMENT_GUARD_KEY);
  const journalSim = Boolean(journal && isSimulatedStudentPayload(journal));
  const assessmentSim = Boolean(assessment && isSimulatedAssessmentPayload(assessment));
  if (!demo && journalSim) {
    storage.removeItem?.(STUDENT_FILE_STORAGE_KEY);
    lastAppSaved = null;
  } else {
    lastAppSaved = journal;
  }
  if (!demo && assessmentSim) {
    storage.removeItem?.(STUDENT_ASSESSMENT_GUARD_KEY);
    lastAppAssessment = null;
  } else {
    lastAppAssessment = assessment;
  }
  const journalNow = storage.getItem(STUDENT_FILE_STORAGE_KEY);
  if (!demo && (journalSim || (journalLooksBlank(journalNow) && assessmentSim))) {
    storage.removeItem?.(STUDENT_BACKUP_STAMP_GUARD_KEY);
    lastAppStamp = null;
    pendingStamp = null;
  } else {
    lastAppStamp = storage.getItem(STUDENT_BACKUP_STAMP_GUARD_KEY);
    pendingStamp = null;
  }
}

export function installStudentMockGuard(
  storage: StorageLike = globalThis.localStorage,
  readSearch: () => string = () => (typeof window === 'undefined' ? '' : window.location.search),
): void {
  if (guardInstalled) return;
  guardInstalled = true;
  readDemoSearch = readSearch;
  rememberExisting(storage, readSearch());
  const originalGet = storage.getItem.bind(storage);
  const originalSet = storage.setItem.bind(storage);
  const originalRemove = storage.removeItem?.bind(storage);
  const wrappedGet = (key: string) => {
    if (!STUDENT_GUARD_KEYS.has(key) || !studentDemoIsolated(readSearch())) return originalGet(key);
    if (demoOverlay.has(key)) return demoOverlay.get(key) ?? null;
    const underlying = originalGet(key);
    if (key === STUDENT_FILE_STORAGE_KEY && underlying && !isSimulatedStudentPayload(underlying)) return underlying;
    if (key === STUDENT_ASSESSMENT_GUARD_KEY && underlying && !isSimulatedAssessmentPayload(underlying)) return underlying;
    if (key === STUDENT_FILE_STORAGE_KEY) {
      const seed = demoSeedProvider();
      return seed || null;
    }
    return null;
  };
  const wrapped = (key: string, value: string) => {
    if (STUDENT_GUARD_KEYS.has(key) && studentDemoIsolated(readSearch())) {
      if (shouldDropUnsolicitedStudentWrite(key, value, readSearch())) return;
      demoOverlay.set(key, value);
      return;
    }
    if (shouldDropUnsolicitedStudentWrite(key, value, readSearch())) return;
    originalSet(key, value);
  };
  const wrappedRemove = (key: string) => {
    if (STUDENT_GUARD_KEYS.has(key) && studentDemoIsolated(readSearch())) {
      demoOverlay.delete(key);
      return;
    }
    originalRemove?.(key);
  };
  // Some DOM storage objects ignore assignment and keep the prototype method.
  try {
    Object.defineProperty(storage, 'getItem', { value: wrappedGet, writable: true, configurable: true });
    Object.defineProperty(storage, 'setItem', { value: wrapped, writable: true, configurable: true });
    if (originalRemove) Object.defineProperty(storage, 'removeItem', { value: wrappedRemove, writable: true, configurable: true });
  } catch {
    storage.getItem = wrappedGet;
    storage.setItem = wrapped;
    if (originalRemove) storage.removeItem = wrappedRemove;
  }
  if (typeof window === 'undefined' || storage !== globalThis.localStorage) return;
  window.addEventListener('storage', (event) => {
    noteStudentStorageEvent(event.key);
  });
  if (guardTimer) clearInterval(guardTimer);
  guardTimer = window.setInterval(() => reconcileStudentStorage(storage, readSearch()), 250);
}

/** Test helper. Production installs once per page. */
export function resetStudentMockGuardForTests(): void {
  if (guardTimer) clearInterval(guardTimer);
  guardTimer = null;
  appSaveDepth = 0;
  lastAppSaved = null;
  lastAppAssessment = null;
  lastAppStamp = null;
  pendingStamp = null;
  restoring = false;
  guardInstalled = false;
  otherTabWrote = false;
  demoOverlay.clear();
  readDemoSearch = () => (typeof window === 'undefined' ? '' : window.location.search);
  journalListeners.clear();
}
