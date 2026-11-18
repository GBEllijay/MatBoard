/**
 * Automatic Advantage Cloud profile backup for every buyer.
 *
 * When a licensed device saves a profile (Student Edition name, gym, belt,
 * start date, stripes and promotion dates; the buyer's own instructor name
 * and belt; the academy name, founded date, founders, and lineage), a small
 * JSON copy goes to groups/{licenseId}/profiles/backup.json through
 * PUT /api/profile-backup. No photos, logos, journal entries, or videos.
 *
 * After a restore, a code, or sign-in puts the purchase on a device, the app
 * reads that file and fills only what this device is missing. It never
 * overwrites a name, belt, or rank that is already here.
 *
 * Coach and instructor seats do not use this path at all (the server refuses
 * them), so nothing an instructor does reaches a student's card through it.
 */

import {
  PROFILE_BACKUP_KIND,
  PROFILE_BACKUP_MAX_STUDENTS,
  PROFILE_BACKUP_PATH,
  academyIsEmpty,
  instructorIsEmpty,
  isBackupProfileId,
  profileBackupIsEmpty,
  sanitizeProfileBackup,
  type ProfileBackupAcademy,
  type ProfileBackupDoc,
  type ProfileBackupInstructor,
  type ProfileBackupStudent,
} from './profileBackupDoc.ts';
import { studentBasicsIsMeaningful, type StudentSyncBasics, type StudentSyncRank } from './signedInSyncDocs.ts';
import { readGymProfile, replaceGymProfile } from './gymProfile.ts';
import { loadInstructorProfile, saveInstructorProfile, type InstructorProfileBeltId } from './instructorProfile.ts';
import { PROGRESS_BELTS, type ProgressBelt, type StudentRank } from './progress/types.ts';
import { loadStudentReport, saveStudentReport, STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { normalizeStoredRank } from './studentRank.ts';
import {
  bindStudentProfileStorage,
  DEFAULT_STUDENT_PROFILE_ID,
  ensureStudentProfileRecord,
  readStudentProfiles,
} from './studentProfiles.ts';

export { PROFILE_BACKUP_PATH };
export const PROFILE_BACKUP_META_KEY = 'matboard.profileBackup.meta.v1';
export const PROFILE_BACKUP_DEBOUNCE_MS = 2500;
const OWNER_SEAT_KEY = 'owner';

export type BackupStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
  key?: (index: number) => string | null;
  readonly length?: number;
};

type SectionMeta = { hash: string; at: number };

export type ProfileBackupMeta = {
  v: 1;
  instructor?: SectionMeta;
  academy?: SectionMeta;
  /** Hash of the last file the server accepted from this device. */
  pushedHash?: string;
  /** License whose backup this device already read. */
  pulledFor?: string;
};

/** Pass details the backup needs. Seats are never eligible. */
export type BackupClaims = { sub: string; src: string; tier: string; grants?: readonly string[] } | null;

export function claimsCanBackUp(claims: BackupClaims): claims is NonNullable<BackupClaims> {
  if (!claims || !claims.sub) return false;
  if (claims.src === 'seat' || claims.tier === 'seat') return false;
  return Array.isArray(claims.grants) ? claims.grants.length > 0 : true;
}

function hashText(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return `${value.length}:${(h >>> 0).toString(36)}`;
}

export function readBackupMeta(store: Pick<BackupStore, 'getItem'> | null): ProfileBackupMeta {
  try {
    const raw = store?.getItem(PROFILE_BACKUP_META_KEY);
    const parsed = raw ? (JSON.parse(raw) as ProfileBackupMeta) : null;
    return parsed && parsed.v === 1 ? parsed : { v: 1 };
  } catch {
    return { v: 1 };
  }
}

function writeBackupMeta(store: BackupStore | null, meta: ProfileBackupMeta): void {
  try {
    store?.setItem(PROFILE_BACKUP_META_KEY, JSON.stringify(meta));
  } catch {
    /* storage full: the next save tries again */
  }
}

function rankWithoutPhotos(rank: StudentSyncRank | StudentRank | undefined): StudentRank | undefined {
  if (!rank) return undefined;
  const next = normalizeStoredRank(rank as Partial<StudentRank>);
  delete next.pictures;
  delete next.pictureNote;
  delete next.pictureCount;
  if (rank.degreeFocus?.length) next.degreeFocus = [...rank.degreeFocus];
  return next;
}

/** This profile's basics on this device, or null when it has none. */
export function localStudentBasics(store: BackupStore, profileId: string): { basics: StudentSyncBasics; updatedAt: number } | null {
  const scoped = bindStudentProfileStorage(store, profileId);
  if (!scoped.getItem(STUDENT_EDITION_STORAGE_KEY)) return null;
  const report = loadStudentReport(scoped);
  const basics: StudentSyncBasics = {
    displayName: report.profile.displayName,
    gymName: report.profile.gymName,
    belt: report.profile.belt,
    startedOn: report.profile.startedOn,
  };
  const rank = rankWithoutPhotos(report.rank);
  if (rank) basics.rank = rank as StudentSyncRank;
  return studentBasicsIsMeaningful(basics) ? { basics, updatedAt: Number(report.updatedAt) || 0 } : null;
}

function readAcademyName(store: Pick<BackupStore, 'getItem'>): string {
  try {
    const raw = store.getItem('matboard.gymName.v1');
    const parsed = raw ? (JSON.parse(raw) as { name?: unknown }) : null;
    return typeof parsed?.name === 'string' ? parsed.name : '';
  } catch {
    return '';
  }
}

function sectionStamp(meta: ProfileBackupMeta, name: 'instructor' | 'academy', body: string, now: number): SectionMeta {
  const hash = hashText(body);
  const prior = meta[name];
  return prior && prior.hash === hash ? prior : { hash, at: now };
}

/**
 * Build this device's backup file. Section stamps for the instructor and
 * academy rows change only when their text changes, so an old phone cannot
 * win over a newer edit just by opening the app.
 */
export function collectProfileBackup(store: BackupStore, now = Date.now()): { doc: ProfileBackupDoc; meta: ProfileBackupMeta } {
  const meta = readBackupMeta(store);
  const registry = readStudentProfiles(store);
  const students: ProfileBackupStudent[] = [];
  const ids = registry.profiles.length ? registry.profiles : [{ id: DEFAULT_STUDENT_PROFILE_ID, name: '' }];
  for (const row of ids) {
    if (!isBackupProfileId(row.id)) continue;
    const local = localStudentBasics(store, row.id);
    if (!local) continue;
    students.push({ id: row.id, name: row.name ?? '', updatedAt: local.updatedAt || now, basics: local.basics });
    if (students.length >= PROFILE_BACKUP_MAX_STUDENTS) break;
  }
  const doc: ProfileBackupDoc = { v: 1, kind: PROFILE_BACKUP_KIND, updatedAt: 0, students };
  const nextMeta: ProfileBackupMeta = { ...meta };

  const ip = loadInstructorProfile(store, OWNER_SEAT_KEY);
  if (ip.name || ip.belt) {
    const body = JSON.stringify([ip.name, ip.belt]);
    nextMeta.instructor = sectionStamp(meta, 'instructor', body, now);
    doc.instructor = { updatedAt: nextMeta.instructor.at, name: ip.name, belt: ip.belt };
  }

  const gp = readGymProfile(store);
  const academy: ProfileBackupAcademy = {
    updatedAt: 0,
    name: readAcademyName(store).trim(),
    foundedOn: gp.foundedOn,
    founders: gp.founders.trim(),
    lineage: gp.lineage.trim(),
  };
  if (!academyIsEmpty(academy)) {
    const body = JSON.stringify([academy.name, academy.foundedOn, academy.founders, academy.lineage]);
    nextMeta.academy = sectionStamp(meta, 'academy', body, now);
    academy.updatedAt = nextMeta.academy.at;
    doc.academy = academy;
  }

  doc.updatedAt = Math.max(0, ...students.map((row) => row.updatedAt), doc.instructor?.updatedAt ?? 0, doc.academy?.updatedAt ?? 0);
  return { doc: sanitizeProfileBackup(doc) ?? doc, meta: nextMeta };
}

/** Stable fingerprint of what would be uploaded. */
export function backupFingerprint(doc: ProfileBackupDoc): string {
  return hashText(JSON.stringify({ ...doc, updatedAt: 0 }));
}

/** True when this device lacks something a backup could fill. */
export function deviceLooksBlank(store: BackupStore): boolean {
  const registry = readStudentProfiles(store);
  const ids = registry.profiles.length ? registry.profiles.map((row) => row.id) : [DEFAULT_STUDENT_PROFILE_ID];
  const anyStudent = ids.some((id) => localStudentBasics(store, id));
  const ip = loadInstructorProfile(store, OWNER_SEAT_KEY);
  return !anyStudent && !ip.name && !ip.belt && !readAcademyName(store).trim();
}

export type ApplyReport = { students: string[]; instructor: boolean; academy: boolean };

/**
 * Fill only what this device is missing. A profile that already has a name,
 * belt, start date, or rank here is left exactly as it is.
 */
export function applyProfileBackup(
  remote: ProfileBackupDoc,
  store: BackupStore,
  options?: { writeAcademyName?: (name: string) => void },
): ApplyReport {
  const report: ApplyReport = { students: [], instructor: false, academy: false };
  for (const row of remote.students) {
    if (!isBackupProfileId(row.id)) continue;
    if (localStudentBasics(store, row.id)) continue;
    if (row.id !== DEFAULT_STUDENT_PROFILE_ID) {
      const name = row.name || row.basics.displayName || 'Profile';
      if (!ensureStudentProfileRecord(store, { id: row.id, name })) continue;
    }
    const scoped = bindStudentProfileStorage(store, row.id);
    const current = loadStudentReport(scoped);
    const belt = (PROGRESS_BELTS as readonly string[]).includes(row.basics.belt) ? (row.basics.belt as ProgressBelt) : current.profile.belt;
    const rank = rankWithoutPhotos(row.basics.rank);
    saveStudentReport(scoped, {
      ...current,
      profile: {
        ...current.profile,
        displayName: current.profile.displayName || row.basics.displayName,
        gymName: current.profile.gymName || row.basics.gymName,
        belt,
        startedOn: current.profile.startedOn || row.basics.startedOn,
      },
      ...(rank ? { rank } : {}),
    });
    report.students.push(row.id);
  }

  const ip = loadInstructorProfile(store, OWNER_SEAT_KEY);
  const remoteIp: ProfileBackupInstructor | undefined = remote.instructor;
  if (!ip.name && !ip.belt && remoteIp && !instructorIsEmpty(remoteIp)) {
    saveInstructorProfile({ name: remoteIp.name, belt: remoteIp.belt as InstructorProfileBeltId | '' }, store as Storage, OWNER_SEAT_KEY);
    report.instructor = true;
  }

  const academy = remote.academy;
  if (academy && !academyIsEmpty(academy)) {
    const gp = readGymProfile(store);
    const localName = readAcademyName(store).trim();
    const localEmpty = !localName && !gp.foundedOn && !gp.founders.trim() && !gp.lineage.trim();
    if (localEmpty) {
      if (academy.name && options?.writeAcademyName) options.writeAcademyName(academy.name);
      replaceGymProfile({ ...gp, foundedOn: academy.foundedOn, founders: academy.founders, lineage: academy.lineage }, store);
      report.academy = true;
    }
  }
  return report;
}

/* ---------------- Browser wiring ---------------- */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type BackupDeps = {
  store: BackupStore | null;
  claims: () => BackupClaims;
  token: () => string;
  fetch: FetchLike;
  demo: () => boolean;
  now?: () => number;
  writeAcademyName?: (name: string) => void;
  onApplied?: (report: ApplyReport) => void;
};

/** Read the backup and fill this device when it is missing profiles. Returns null when skipped. */
export async function pullProfileBackup(deps: BackupDeps): Promise<ApplyReport | null> {
  const store = deps.store;
  const claims = deps.claims();
  if (!store || !claimsCanBackUp(claims) || deps.demo()) return null;
  const token = deps.token();
  if (!token) return null;
  const meta = readBackupMeta(store);
  if (meta.pulledFor === claims.sub && !deviceLooksBlank(store)) return null;
  let response: Response;
  try {
    response = await deps.fetch(PROFILE_BACKUP_PATH, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { backup?: unknown } | null;
  writeBackupMeta(store, { ...readBackupMeta(store), pulledFor: claims.sub });
  const remote = sanitizeProfileBackup(body?.backup);
  if (!remote || profileBackupIsEmpty(remote)) return { students: [], instructor: false, academy: false };
  const applied = applyProfileBackup(remote, store, { writeAcademyName: deps.writeAcademyName });
  if (applied.students.length || applied.instructor || applied.academy) deps.onApplied?.(applied);
  return applied;
}

/** Upload this device's profiles when they changed since the last accepted upload. */
export async function pushProfileBackup(deps: BackupDeps): Promise<'saved' | 'unchanged' | 'skipped' | 'failed'> {
  const store = deps.store;
  const claims = deps.claims();
  if (!store || !claimsCanBackUp(claims) || deps.demo()) return 'skipped';
  const token = deps.token();
  if (!token) return 'skipped';
  const { doc, meta } = collectProfileBackup(store, deps.now ? deps.now() : Date.now());
  if (profileBackupIsEmpty(doc)) return 'skipped';
  const fingerprint = `${claims.sub}|${backupFingerprint(doc)}`;
  writeBackupMeta(store, meta);
  if (meta.pushedHash === fingerprint) return 'unchanged';
  try {
    const response = await deps.fetch(PROFILE_BACKUP_PATH, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ backup: doc }),
    });
    if (!response.ok) return 'failed';
  } catch {
    return 'failed';
  }
  writeBackupMeta(store, { ...readBackupMeta(store), pushedHash: fingerprint });
  return 'saved';
}

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let busy: Promise<unknown> | null = null;

/** Start automatic backup on this device. Safe to call more than once. */
export function initProfileBackup(deps: BackupDeps, subscribe: (kick: () => void) => void): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = () => {
    if (busy) return;
    busy = pullProfileBackup(deps)
      .catch(() => null)
      .then(() => pushProfileBackup(deps))
      .catch(() => 'failed')
      .finally(() => {
        busy = null;
      });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run();
    }, PROFILE_BACKUP_DEBOUNCE_MS);
  };
  subscribe(schedule);
  schedule();
}

/** Test helper. */
export function resetProfileBackupForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  busy = null;
  started = false;
}
