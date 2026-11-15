/**
 * Signed-in profile sync. Academy profile and student D8 data (index cards,
 * ratings, glossary additions, and self-assessments) stay on the device and
 * also go to Advantage Cloud when the person is signed in, so every device
 * on this account sees the same updates.
 *
 * Storage is JSON in the existing GYM_MEDIA bucket, through GET/PUT
 * /api/login/sync (the session cookie is scoped to /api/login). Last write
 * wins per document by updatedAt. An empty remote never wipes local data.
 *
 * Student and kid videos are not uploaded. Card video fields are only https
 * links. Belt promotions and stripes are unchanged: this path never sends a
 * coach rank to a student.
 */

import { LOGIN_EVENT, readLoginHint } from './emailLogin.ts';
import { setSyncTrigger, suppressSyncTrigger } from './syncTrigger.ts';
import {
  academyDocIsEmpty,
  pickWinningDoc,
  profilesDocIsEmpty,
  studentDocIsEmpty,
  type AcademySyncDoc,
  type DocPick,
  type ProfilesSyncDoc,
  type StudentSyncDoc,
} from './signedInSyncDocs.ts';

import { entitlementSnapshot } from './entitlement.ts';
import { emptyAdditions, loadAdditions, writeAdditions } from './glossaryAdditions.ts';
import { clearGymLogo, readGymLogo, writeGymLogo } from './gymLogo.ts';
import { readGymName, writeGymName } from './gymName.ts';
import { readGymProfile, replaceGymProfile, sanitizeGymProfile } from './gymProfile.ts';
import { loadIndexCards, writeIndexCards } from './indexCards.ts';
import { ASSESSMENT_STORAGE_KEY, emptyAssessments, loadAssessments, writeAssessments } from './studentAssessment.ts';
import {
  DEFAULT_STUDENT_PROFILE_ID,
  isStudentProfileId,
  cleanStudentProfileName,
  ensureStudentProfileRecord,
  readActiveStudentProfile,
  readStudentProfiles,
  type StudentProfileRecord,
} from './studentProfiles.ts';

export const ACCOUNT_SYNC_PATH = '/api/login/sync';
export const ACCOUNT_SYNC_META_KEY = 'matboard.accountSync.meta.v1';
export const ACCOUNT_SYNC_EVENT = 'matboard-account-sync';
/** Readable sign-in hint cookie (no secret). Same name as src/server/loginAccount.ts. */
const LOGIN_HINT_COOKIE = 'adv_login';

export const SYNC_DEBOUNCE_MS = 800;

export type { AcademySyncDoc, DocPick, ProfilesSyncDoc, StudentSyncDoc } from './signedInSyncDocs.ts';

export type SyncDocs = {
  academy: AcademySyncDoc | null;
  student: StudentSyncDoc | null;
  profiles: ProfilesSyncDoc | null;
};

export type SyncStatusKind = 'signed-out' | 'syncing' | 'synced' | 'error';

export type SyncStatus = {
  kind: SyncStatusKind;
  lastSyncAt: number | null;
  academySynced: boolean;
  error: string | null;
};

type SyncMeta = {
  v: 1;
  academyUpdatedAt: number;
  academySyncedAt: number | null;
  lastSyncAt: number | null;
  student: Record<string, { updatedAt: number; syncedAt: number | null }>;
  profilesUpdatedAt: number;
  profilesSyncedAt: number | null;
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let inFlight: Promise<void> | null = null;
let statusSnapshot: SyncStatus = { kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null };

function browserStore(): MemoryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function emptyMeta(): SyncMeta {
  return {
    v: 1,
    academyUpdatedAt: 0,
    academySyncedAt: null,
    lastSyncAt: null,
    student: {},
    profilesUpdatedAt: 0,
    profilesSyncedAt: null,
  };
}

export function readSyncMeta(store: MemoryStore | null = browserStore()): SyncMeta {
  try {
    const raw = store?.getItem(ACCOUNT_SYNC_META_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    const student: SyncMeta['student'] = {};
    if (parsed.student && typeof parsed.student === 'object') {
      for (const [id, row] of Object.entries(parsed.student)) {
        if (!isStudentProfileId(id) || !row || typeof row !== 'object') continue;
        const updatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
        const syncedAt = typeof row.syncedAt === 'number' && Number.isFinite(row.syncedAt) ? row.syncedAt : null;
        student[id] = { updatedAt, syncedAt };
      }
    }
    return {
      v: 1,
      academyUpdatedAt: typeof parsed.academyUpdatedAt === 'number' && Number.isFinite(parsed.academyUpdatedAt) ? parsed.academyUpdatedAt : 0,
      academySyncedAt: typeof parsed.academySyncedAt === 'number' && Number.isFinite(parsed.academySyncedAt) ? parsed.academySyncedAt : null,
      lastSyncAt: typeof parsed.lastSyncAt === 'number' && Number.isFinite(parsed.lastSyncAt) ? parsed.lastSyncAt : null,
      student,
      profilesUpdatedAt: typeof parsed.profilesUpdatedAt === 'number' && Number.isFinite(parsed.profilesUpdatedAt) ? parsed.profilesUpdatedAt : 0,
      profilesSyncedAt: typeof parsed.profilesSyncedAt === 'number' && Number.isFinite(parsed.profilesSyncedAt) ? parsed.profilesSyncedAt : null,
    };
  } catch {
    return emptyMeta();
  }
}

function writeSyncMeta(meta: SyncMeta, store: MemoryStore | null = browserStore()): void {
  try {
    store?.setItem(ACCOUNT_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* private mode */
  }
}

function emitSync(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACCOUNT_SYNC_EVENT));
  listeners.forEach((fn) => fn());
}

function setStatus(next: SyncStatus): void {
  statusSnapshot = next;
  emitSync();
}

export function getSyncStatus(): SyncStatus {
  const meta = readSyncMeta();
  if (!hasSessionHint()) {
    return { kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null };
  }
  return {
    ...statusSnapshot,
    lastSyncAt: statusSnapshot.lastSyncAt ?? meta.lastSyncAt,
    academySynced: statusSnapshot.academySynced || meta.academySyncedAt != null,
  };
}

export function subscribeSyncStatus(fn: () => void): () => void {
  listeners.add(fn);
  if (typeof window !== 'undefined') window.addEventListener(ACCOUNT_SYNC_EVENT, fn);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener(ACCOUNT_SYNC_EVENT, fn);
  };
}

/** True when this device is signed in and the academy profile has been stored in Cloud. */
export function academyProfileCloudSynced(store: MemoryStore | null = browserStore()): boolean {
  if (!hasSessionHint()) return false;
  return readSyncMeta(store).academySyncedAt != null;
}

/** First 8 characters of the entitlement `sub` (the license id). */
export function shortLicenseId(sub: string | null | undefined): string {
  const id = typeof sub === 'string' ? sub.trim() : '';
  return id ? id.slice(0, 8) : '';
}

export function shortLicenseIdOnDevice(): string {
  return shortLicenseId(entitlementSnapshot().claims?.sub);
}

/**
 * Account page line. "Synced just now" covers a successful sync in the last two minutes.
 * When nobody is signed in: "Not signed in — saved on this device only".
 */
export function syncStatusLabel(status: SyncStatus = getSyncStatus(), now = Date.now()): string {
  if (status.kind === 'signed-out') {
    return 'Not signed in — saved on this device only';
  }
  if (status.kind === 'syncing') return 'Syncing…';
  if (status.kind === 'error' && !status.lastSyncAt) {
    return status.error ? `Could not sync: ${status.error}` : 'Could not sync';
  }
  if (status.lastSyncAt && now - status.lastSyncAt < 2 * 60 * 1000) return 'Synced just now';
  if (status.lastSyncAt) {
    const at = new Date(status.lastSyncAt);
    if (Number.isFinite(at.getTime())) {
      return `Synced ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }
  }
  if (status.kind === 'error') return status.error ? `Could not sync: ${status.error}` : 'Could not sync';
  return 'Signed in — waiting to sync';
}

export function hasSessionHint(): boolean {
  if (readLoginHint()) return true;
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.split(';').some((part) => part.trim() === `${LOGIN_HINT_COOKIE}=1`);
  } catch {
    return false;
  }
}

export { academyDocIsEmpty, pickWinningDoc, profilesDocIsEmpty, studentDocIsEmpty } from './signedInSyncDocs.ts';

export function collectAcademyDoc(store: MemoryStore | null = browserStore(), now = Date.now()): AcademySyncDoc {
  const meta = readSyncMeta(store);
  const name = readGymName().trim();
  const profile = readGymProfile(store);
  const doc: AcademySyncDoc = {
    v: 1,
    updatedAt: meta.academyUpdatedAt || 0,
    name,
    logoDataUrl: readGymLogo(),
    profile,
  };
  if (!doc.updatedAt && !academyDocIsEmpty(doc)) doc.updatedAt = now;
  return doc;
}

export function collectStudentDoc(
  profileId: string,
  store: MemoryStore | null = browserStore(),
  now = Date.now(),
): StudentSyncDoc {
  const id = isStudentProfileId(profileId) ? profileId : DEFAULT_STUDENT_PROFILE_ID;
  const meta = readSyncMeta(store);
  const doc: StudentSyncDoc = {
    v: 1,
    updatedAt: meta.student[id]?.updatedAt || 0,
    profileId: id,
    indexCards: loadIndexCards(store ?? { getItem: () => null }),
    glossaryAdditions: store ? loadAdditions(store) : emptyAdditions(),
    assessments: store ? loadAssessments(store) : emptyAssessments(),
  };
  if (!doc.updatedAt && !studentDocIsEmpty(doc)) doc.updatedAt = now;
  return doc;
}

export function collectProfilesDoc(store: MemoryStore | null = browserStore(), now = Date.now()): ProfilesSyncDoc {
  const meta = readSyncMeta(store);
  const registry = store ? readStudentProfiles(store) : { version: 1 as const, activeId: DEFAULT_STUDENT_PROFILE_ID, profiles: [] as StudentProfileRecord[] };
  const doc: ProfilesSyncDoc = {
    v: 1,
    updatedAt: meta.profilesUpdatedAt || 0,
    profiles: registry.profiles.map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt })),
  };
  if (!doc.updatedAt && !profilesDocIsEmpty(doc)) doc.updatedAt = now;
  return doc;
}

export function applyAcademyDoc(doc: AcademySyncDoc, store: MemoryStore | null = browserStore()): void {
  const release = suppressSyncTrigger();
  try {
    writeGymName(doc.name);
    if (doc.logoDataUrl) {
      try {
        writeGymLogo(doc.logoDataUrl);
      } catch {
        /* too large or not an image; keep the logo already on this device */
      }
    } else {
      clearGymLogo();
    }
    replaceGymProfile(sanitizeGymProfile(doc.profile), store);
    const meta = readSyncMeta(store);
    writeSyncMeta(
      { ...meta, academyUpdatedAt: doc.updatedAt, academySyncedAt: doc.updatedAt, lastSyncAt: Date.now() },
      store,
    );
  } finally {
    release();
  }
}

export function applyStudentDoc(doc: StudentSyncDoc, store: MemoryStore | null = browserStore()): void {
  const release = suppressSyncTrigger();
  try {
    if (store) {
      const cards = loadIndexCards({ getItem: () => JSON.stringify(doc.indexCards) });
      const additions = loadAdditions({ getItem: () => JSON.stringify(doc.glossaryAdditions) });
      const assessments = loadAssessments({
        getItem: (key) => (key === ASSESSMENT_STORAGE_KEY ? JSON.stringify(doc.assessments) : null),
      });
      writeIndexCards(store, cards);
      writeAdditions(store, additions);
      writeAssessments(store, assessments);
      void import('../indexCards/store.ts')
        .then((mod) => {
          if (typeof mod.hydrateIndexCardsFromSync === 'function') {
            mod.hydrateIndexCardsFromSync({ indexCards: cards, glossaryAdditions: additions });
          }
        })
        .catch(() => undefined);
    }
    const meta = readSyncMeta(store);
    const id = isStudentProfileId(doc.profileId) ? doc.profileId : DEFAULT_STUDENT_PROFILE_ID;
    writeSyncMeta(
      {
        ...meta,
        lastSyncAt: Date.now(),
        student: { ...meta.student, [id]: { updatedAt: doc.updatedAt, syncedAt: doc.updatedAt } },
      },
      store,
    );
  } finally {
    release();
  }
}

/**
 * Union the cloud profile list into this device. The open profile on this
 * device is not changed, so switching on a phone does not switch a computer.
 * Portraits stay on the device; they are not uploaded.
 */
export function applyProfilesDoc(doc: ProfilesSyncDoc, store: MemoryStore | null = browserStore()): void {
  if (!store) return;
  const release = suppressSyncTrigger();
  try {
    for (const row of doc.profiles) {
      if (!isStudentProfileId(row.id)) continue;
      const name = cleanStudentProfileName(row.name) || row.id;
      ensureStudentProfileRecord(store, { id: row.id, name });
    }
    const meta = readSyncMeta(store);
    writeSyncMeta({ ...meta, profilesUpdatedAt: doc.updatedAt, profilesSyncedAt: doc.updatedAt, lastSyncAt: Date.now() }, store);
  } finally {
    release();
  }
}

export function mergeAcademy(local: AcademySyncDoc, remote: AcademySyncDoc | null): DocPick<AcademySyncDoc> {
  return pickWinningDoc(local, remote, academyDocIsEmpty, (doc) => doc.updatedAt);
}

export function mergeStudent(local: StudentSyncDoc, remote: StudentSyncDoc | null): DocPick<StudentSyncDoc> {
  return pickWinningDoc(local, remote, studentDocIsEmpty, (doc) => doc.updatedAt);
}

export function mergeProfiles(local: ProfilesSyncDoc, remote: ProfilesSyncDoc | null): DocPick<ProfilesSyncDoc> {
  return pickWinningDoc(local, remote, profilesDocIsEmpty, (doc) => doc.updatedAt);
}

export function noteLocalAcademyChange(): void {
  const store = browserStore();
  const meta = readSyncMeta(store);
  writeSyncMeta({ ...meta, academyUpdatedAt: Date.now() }, store);
  scheduleSignedInPush();
}

export function noteLocalStudentChange(profileId?: string): void {
  const store = browserStore();
  const id = profileId && isStudentProfileId(profileId) ? profileId : readActiveStudentProfile(store ?? { getItem: () => null }).id;
  const meta = readSyncMeta(store);
  const prior = meta.student[id] ?? { updatedAt: 0, syncedAt: null };
  writeSyncMeta({ ...meta, student: { ...meta.student, [id]: { ...prior, updatedAt: Date.now() } } }, store);
  scheduleSignedInPush();
}

export function noteLocalProfilesChange(): void {
  const store = browserStore();
  const meta = readSyncMeta(store);
  writeSyncMeta({ ...meta, profilesUpdatedAt: Date.now() }, store);
  scheduleSignedInPush();
}

type SyncResponse = {
  ok?: boolean;
  error?: string;
  academy?: AcademySyncDoc | null;
  student?: StudentSyncDoc | null;
  profiles?: ProfilesSyncDoc | null;
  canWriteAcademy?: boolean;
};

async function getRemote(profileId: string, fetchImpl: typeof fetch): Promise<SyncResponse> {
  const url = `${ACCOUNT_SYNC_PATH}?profile=${encodeURIComponent(profileId)}`;
  const response = await fetchImpl(url, { method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (response.status === 401) return { ok: false, error: 'Not signed in' };
  let body: SyncResponse = {};
  try {
    body = (await response.json()) as SyncResponse;
  } catch {
    body = {};
  }
  if (!response.ok) return { ok: false, error: typeof body.error === 'string' ? body.error : 'Could not sync' };
  return { ...body, ok: true };
}

async function putRemote(body: SyncDocs & { profileId: string }, fetchImpl: typeof fetch): Promise<SyncResponse> {
  const response = await fetchImpl(ACCOUNT_SYNC_PATH, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: SyncResponse = {};
  try {
    parsed = (await response.json()) as SyncResponse;
  } catch {
    parsed = {};
  }
  if (!response.ok) return { ok: false, error: typeof parsed.error === 'string' ? parsed.error : 'Could not sync' };
  return { ...parsed, ok: true };
}

/**
 * Pull remote docs, apply a newer remote, and upload local work when it wins
 * or when the remote document is empty.
 */
export async function pullAndMergeSignedIn(options?: {
  profileId?: string;
  store?: MemoryStore | null;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<SyncStatus> {
  if (!hasSessionHint()) {
    const signedOut: SyncStatus = { kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null };
    setStatus(signedOut);
    return signedOut;
  }
  const store = options?.store ?? browserStore();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const now = options?.now ?? Date.now();
  const profileId = options?.profileId ?? readActiveStudentProfile(store ?? { getItem: () => null }).id;
  setStatus({ kind: 'syncing', lastSyncAt: readSyncMeta(store).lastSyncAt, academySynced: readSyncMeta(store).academySyncedAt != null, error: null });
  try {
    const remote = await getRemote(profileId, fetchImpl);
    if (remote.ok === false) {
      if (remote.error === 'Not signed in') {
        const signedOut: SyncStatus = { kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null };
        setStatus(signedOut);
        return signedOut;
      }
      const failed: SyncStatus = {
        kind: 'error',
        lastSyncAt: readSyncMeta(store).lastSyncAt,
        academySynced: readSyncMeta(store).academySyncedAt != null,
        error: remote.error ?? 'Could not sync',
      };
      setStatus(failed);
      return failed;
    }

    const localAcademy = collectAcademyDoc(store, now);
    const academyPick = mergeAcademy(localAcademy, remote.academy ?? null);
    if (academyPick.source === 'remote' && academyPick.winner) applyAcademyDoc(academyPick.winner, store);

    const localStudent = collectStudentDoc(profileId, store, now);
    const studentPick = mergeStudent(localStudent, remote.student ?? null);
    if (studentPick.source === 'remote' && studentPick.winner) applyStudentDoc(studentPick.winner, store);

    const localProfiles = collectProfilesDoc(store, now);
    const profilesPick = mergeProfiles(localProfiles, remote.profiles ?? null);
    if (profilesPick.source === 'remote' && profilesPick.winner) applyProfilesDoc(profilesPick.winner, store);

    const toUpload: SyncDocs & { profileId: string } = {
      profileId,
      academy: academyPick.shouldUpload && (remote.canWriteAcademy !== false) ? academyPick.winner : null,
      student: studentPick.shouldUpload ? studentPick.winner : null,
      profiles: profilesPick.shouldUpload ? profilesPick.winner : null,
    };

    if (toUpload.academy || toUpload.student || toUpload.profiles) {
      const saved = await putRemote(toUpload, fetchImpl);
      if (saved.ok === false) {
        const failed: SyncStatus = {
          kind: 'error',
          lastSyncAt: readSyncMeta(store).lastSyncAt,
          academySynced: readSyncMeta(store).academySyncedAt != null,
          error: saved.error ?? 'Could not sync',
        };
        setStatus(failed);
        return failed;
      }
    }

    const meta = readSyncMeta(store);
    const syncedAt = Date.now();
    const nextMeta: SyncMeta = { ...meta, lastSyncAt: syncedAt };
    if (academyPick.winner && !academyDocIsEmpty(academyPick.winner)) {
      nextMeta.academyUpdatedAt = academyPick.winner.updatedAt;
      nextMeta.academySyncedAt = academyPick.winner.updatedAt;
    } else if (academyPick.source === 'none' && remote.canWriteAcademy !== false) {
      // Nothing to store. Still counts as a successful check-in so the Account page can say so.
    }
    if (studentPick.winner) {
      const id = studentPick.winner.profileId;
      nextMeta.student = { ...nextMeta.student, [id]: { updatedAt: studentPick.winner.updatedAt, syncedAt: studentPick.winner.updatedAt } };
    }
    if (profilesPick.winner) {
      nextMeta.profilesUpdatedAt = profilesPick.winner.updatedAt;
      nextMeta.profilesSyncedAt = profilesPick.winner.updatedAt;
    }
    writeSyncMeta(nextMeta, store);
    const ok: SyncStatus = {
      kind: 'synced',
      lastSyncAt: syncedAt,
      academySynced: nextMeta.academySyncedAt != null,
      error: null,
    };
    setStatus(ok);
    return ok;
  } catch {
    const failed: SyncStatus = {
      kind: 'error',
      lastSyncAt: readSyncMeta(store).lastSyncAt,
      academySynced: readSyncMeta(store).academySyncedAt != null,
      error: 'Could not reach Advantage Cloud',
    };
    setStatus(failed);
    return failed;
  }
}

export function scheduleSignedInPush(): void {
  if (!hasSessionHint()) return;
  if (typeof window === 'undefined') return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void runSignedInSync();
  }, SYNC_DEBOUNCE_MS);
}

/** Push right away (after a JSON restore) so other devices can pick up the newest file. */
export async function flushSignedInPush(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (!hasSessionHint()) return;
  await runSignedInSync();
}

/** A backup or packet restore is a local write. Mark it newest, then upload if signed in. */
export function noteRestoredStudentData(profileId?: string): void {
  noteLocalStudentChange(profileId);
  noteLocalProfilesChange();
  void flushSignedInPush();
}

async function runSignedInSync(): Promise<void> {
  if (inFlight) {
    await inFlight;
    return;
  }
  inFlight = pullAndMergeSignedIn().then(() => undefined);
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Pull on sign-in, app open, and focus. Local saves already schedule a push. */
export function initSignedInSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const kick = () => {
    if (!hasSessionHint()) {
      setStatus({ kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null });
      return;
    }
    void runSignedInSync();
  };
  window.addEventListener(LOGIN_EVENT, kick);
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  window.addEventListener('pageshow', kick);
  kick();
}

/** Test helper. Does not touch Cloud. */
export function resetSignedInSyncForTests(store: MemoryStore | null = browserStore()): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  inFlight = null;
  statusSnapshot = { kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null };
  try {
    store?.removeItem?.(ACCOUNT_SYNC_META_KEY);
  } catch {
    /* ignore */
  }
}


setSyncTrigger((kind, profileId) => {
  if (kind === 'academy') noteLocalAcademyChange();
  else if (kind === 'student') noteLocalStudentChange(profileId);
  else if (kind === 'profiles') noteLocalProfilesChange();
  else if (kind === 'switch' && profileId) void pullAndMergeSignedIn({ profileId });
});
