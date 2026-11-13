/**
 * Student Edition packet.
 * One .advantage file for the open profile, or for every family profile.
 * An older student-journal-backup JSON still restores.
 */

import { BRACKET_PHOTO_KEY } from '../bracketPhoto.ts';
import { COACH_FILE_SNAPSHOT_KEY, SHARE_WEIGHT_WITH_COACH_KEY } from '../coachProgressFile.ts';
import { COACH_UPDATE_LEDGER_KEY } from '../coachRankUpdate.ts';
import { COACH_OVERLAY_KEY } from '../coachSync.ts';
import { emptyIndexCards, loadIndexCards, writeIndexCards, type IndexCardFile } from '../indexCards.ts';
import { PODIUM_PHOTO_KEY } from '../podiumPhotos.ts';
import { PROFILE_MARKS_KEY } from '../profileMarks.ts';
import { readProfilePortrait } from '../profilePortrait.ts';
import { emptyRankPhotoStore, RANK_PHOTO_KEY, type RankPhotoStore } from '../rankPhotos.ts';
import { STABLE_STUDENT_ID_KEY } from '../studentIdentity.ts';
import { STUDENT_OUTBOX_KEY } from '../studentEvents.ts';
import { loadAssessments, type AssessmentState } from '../studentAssessment.ts';
import {
  applyBackupToMemory,
  buildStudentBackup,
  filmBlobsFromBackup,
  parseStudentBackup,
  studentBackupNames,
  type BackupApplyMode,
  type BackupBlob,
  type StudentBackupFile,
} from '../studentBackup.ts';
import type { StudentProgressReport } from '../progress/types.ts';
import { loadStudentReport, todayIso } from '../studentEdition.ts';
import { loadFilms, type StudentFilm } from '../studentFilm.ts';
import { readStudentGymLogo } from '../studentGymMark.ts';
import { STUDENT_NO_PHOTOS_KEY } from '../studentPhotoFlag.ts';
import {
  backupProfileFromUnknown,
  bindStudentProfileStorage,
  ensureStudentProfileRecord,
  isStudentProfileId,
  readActiveStudentProfile,
  readStudentProfiles,
  switchStudentProfile,
  type StudentKeyStore,
  type StudentProfileRecord,
} from '../studentProfiles.ts';
import { loadScouting, type ScoutingCard } from '../studentScouting.ts';
import { STUDENT_COMPETITOR_KEY } from '../studentCompetitorFlag.ts';
import { loadCoachShelf, type CoachShelf } from '../studentTools.ts';
import { STREAK_TARGET_KEY } from '../trainingStreak.ts';
import {
  buildPacket,
  parsePacket,
  type AdvantagePacket,
  type PacketPreview,
} from './core.ts';
import { describeDesignedPacket } from './stubs.ts';
import { stripPacketSecrets } from './secrets.ts';

/** Unsaved A/B/C text. Defined on the standing-games page. Kept here so the packet does not import that page. */
const GAME_DRAFT_KEY = 'matboard.student.gameDrafts.v1';

/**
 * Student-local keys that are not already fields on the bundle.
 * Unlock flags, tokens, PIN hashes, license ids, and drive sessions are not on this list.
 */
export const STUDENT_PACKET_EXTRA_KEYS = [
  PODIUM_PHOTO_KEY,
  PROFILE_MARKS_KEY,
  STUDENT_COMPETITOR_KEY,
  STREAK_TARGET_KEY,
  GAME_DRAFT_KEY,
  STUDENT_NO_PHOTOS_KEY,
  STABLE_STUDENT_ID_KEY,
  SHARE_WEIGHT_WITH_COACH_KEY,
  COACH_OVERLAY_KEY,
  COACH_UPDATE_LEDGER_KEY,
  COACH_FILE_SNAPSHOT_KEY,
  STUDENT_OUTBOX_KEY,
] as const;

const EXTRA_KEYS = new Set<string>(STUDENT_PACKET_EXTRA_KEYS);

export type StudentPacketScope = 'active' | 'all';

export type StudentBundle = {
  profile: { id: string; name: string };
  journal: StudentProgressReport;
  assessment: AssessmentState;
  scouting: ScoutingCard[];
  rankPhotos: RankPhotoStore;
  bracketPhotos: Record<string, string>;
  coachPlan: CoachShelf['plan'];
  coachFeedback: CoachShelf['feedback'];
  films: StudentFilm[];
  filmFiles?: { id: string; base64: string }[];
  filmFilesOmitted?: { id: string; reason: string }[];
  indexCards: IndexCardFile;
  portrait?: string;
  gymLogo?: string;
  csv: string;
  extras?: Record<string, string>;
};

type MemoryStore = StudentKeyStore & {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type PreparedBundle = {
  profile: { id: string; name: string };
  file: StudentBackupFile;
  indexCards: IndexCardFile;
  extras: Record<string, string>;
};

export type StudentRestoreChoice =
  | {
      source: 'packet';
      packet: AdvantagePacket;
      preview: PacketPreview;
      restorable: true;
      bundles: PreparedBundle[];
    }
  | {
      source: 'packet';
      packet: AdvantagePacket;
      preview: PacketPreview;
      restorable: false;
      bundles: [];
    }
  | {
      source: 'legacy';
      file: StudentBackupFile;
      preview: PacketPreview;
      restorable: true;
      bundles: [];
    };

function bundleSectionKey(profileId: string): string {
  return `bundle:${profileId}`;
}

function rankFromStorage(storage: MemoryStore): RankPhotoStore {
  try {
    const raw = storage.getItem(RANK_PHOTO_KEY);
    if (!raw) return emptyRankPhotoStore();
    const parsed = JSON.parse(raw) as RankPhotoStore;
    if (!parsed || typeof parsed !== 'object' || !parsed.belts || !parsed.tapes) return emptyRankPhotoStore();
    return parsed;
  } catch {
    return emptyRankPhotoStore();
  }
}

function bracketsFromStorage(storage: MemoryStore): Record<string, string> {
  try {
    const raw = storage.getItem(BRACKET_PHOTO_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function cleanExtra(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return JSON.stringify(stripPacketSecrets(parsed));
  } catch {
    /* a short flag such as "1" or "3" is stored as text */
  }
  return raw;
}

function readExtras(storage: MemoryStore): Record<string, string> | undefined {
  const extras: Record<string, string> = {};
  for (const key of STUDENT_PACKET_EXTRA_KEYS) {
    const raw = storage.getItem(key);
    if (raw == null || raw === '') continue;
    const cleaned = cleanExtra(raw);
    if (cleaned != null) extras[key] = cleaned;
  }
  return Object.keys(extras).length ? extras : undefined;
}

function keptExtras(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const extras: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!EXTRA_KEYS.has(key) || typeof raw !== 'string' || raw.length > 1_500_000) continue;
    const cleaned = cleanExtra(raw);
    if (cleaned != null) extras[key] = cleaned;
  }
  return extras;
}

function indexFromUnknown(value: unknown): IndexCardFile {
  try {
    return loadIndexCards({ getItem: () => JSON.stringify(value ?? null) });
  } catch {
    return emptyIndexCards();
  }
}

async function collectBundle(
  storage: MemoryStore,
  profile: StudentProfileRecord,
  input: {
    includeVideos: boolean;
    now: Date;
    readFilmBlob: (id: string, profileId: string) => Promise<Blob | null>;
  },
): Promise<StudentBundle> {
  const scoped = bindStudentProfileStorage(storage, profile.id);
  const films = loadFilms(scoped);
  const blobs: BackupBlob[] | undefined = input.includeVideos
    ? await Promise.all(
        films.map(async (film) => ({
          id: film.id,
          blob: await input.readFilmBlob(film.id, profile.id).catch(() => null),
        })),
      )
    : undefined;
  const selfie = readProfilePortrait(scoped);
  const gymLogo = readStudentGymLogo(scoped);
  const built = await buildStudentBackup({
    report: loadStudentReport(scoped),
    assessment: loadAssessments(scoped),
    scouting: loadScouting(scoped),
    rankPhotos: rankFromStorage(scoped),
    bracketPhotos: bracketsFromStorage(scoped),
    shelf: loadCoachShelf(scoped),
    films,
    blobs,
    includeVideos: input.includeVideos,
    now: input.now,
    recordStamp: false,
    prints: false,
    profile: { id: profile.id, name: profile.name },
    marks: {
      includeSelfie: Boolean(selfie),
      includeLogo: Boolean(gymLogo),
      selfie,
      gymLogo,
    },
  });
  const bundle: StudentBundle = {
    profile: { id: profile.id, name: profile.name },
    journal: built.file.report,
    assessment: built.file.assessment,
    scouting: built.file.scouting,
    rankPhotos: built.file.rankPhotos,
    bracketPhotos: built.file.bracketPhotos,
    coachPlan: built.file.coachPlan,
    coachFeedback: built.file.coachFeedback,
    films: built.file.films,
    indexCards: loadIndexCards(scoped),
    csv: built.csv,
  };
  if (built.file.filmFiles?.length) bundle.filmFiles = built.file.filmFiles;
  if (built.file.filmFilesOmitted?.length) bundle.filmFilesOmitted = built.file.filmFilesOmitted;
  if (built.file.portrait) bundle.portrait = built.file.portrait;
  if (built.file.gymLogo) bundle.gymLogo = built.file.gymLogo;
  const extras = readExtras(scoped);
  if (extras) bundle.extras = extras;
  return bundle;
}

function accountFromStorage(storage: MemoryStore): string | undefined {
  try {
    const value = storage.getItem('advantage.account.reference')?.trim().toLowerCase() ?? '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function buildStudentPacket(input: {
  storage: MemoryStore;
  scope?: StudentPacketScope;
  includeVideos: boolean;
  now?: Date;
  appVersion?: string;
  accountId?: string | null;
  readFilmBlob?: (id: string, profileId: string) => Promise<Blob | null>;
}): Promise<{ packet: AdvantagePacket; text: string; filename: string }> {
  const when = input.now ?? new Date();
  const scope = input.scope === 'all' ? 'all' : 'active';
  const registry = readStudentProfiles(input.storage);
  const active = readActiveStudentProfile(input.storage);
  const profiles = scope === 'all' ? registry.profiles : [active];
  const readFilmBlob = input.readFilmBlob ?? (async () => null);
  const bundles: StudentBundle[] = [];
  for (const profile of profiles) {
    bundles.push(await collectBundle(input.storage, profile, { includeVideos: input.includeVideos, now: when, readFilmBlob }));
  }
  const sections: Record<string, unknown> = {
    scope,
    activeProfileId: active.id,
  };
  for (const bundle of bundles) sections[bundleSectionKey(bundle.profile.id)] = bundle;
  const built = await buildPacket({
    kind: 'student',
    createdAt: when.toISOString(),
    appVersion: input.appVersion,
    profileId: active.id,
    accountId: input.accountId === undefined ? accountFromStorage(input.storage) : input.accountId,
    sections,
  });
  const names = studentBackupNames(todayIso(when));
  return { ...built, filename: names.packet };
}

export function prepareStudentBundles(packet: AdvantagePacket): { ok: true; bundles: PreparedBundle[] } | { ok: false; error: string } {
  if (packet.kind !== 'student') return { ok: false, error: 'That packet is not a student packet.' };
  const scope = packet.sections.scope;
  if (scope !== 'active' && scope !== 'all') return { ok: false, error: 'That student packet has no profile scope.' };
  const entries = Object.entries(packet.sections).filter(([key]) => key.startsWith('bundle:'));
  if (!entries.length) return { ok: false, error: 'That student packet has no profiles.' };
  const bundles: PreparedBundle[] = [];
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'That student packet has a profile that could not be read.' };
    }
    const row = value as Partial<StudentBundle>;
    const idFromKey = key.slice('bundle:'.length);
    const named = backupProfileFromUnknown(row.profile);
    const profile = named ?? (isStudentProfileId(idFromKey) ? { id: idFromKey, name: 'Profile' } : null);
    if (!profile) return { ok: false, error: 'That student packet names a profile Advantage cannot restore.' };
    const parsed = parseStudentBackup(
      JSON.stringify({
        advantage: 'student-journal-backup',
        version: 1,
        exportedAt: packet.createdAt,
        report: row.journal,
        assessment: row.assessment,
        scouting: row.scouting,
        rankPhotos: row.rankPhotos,
        bracketPhotos: row.bracketPhotos,
        coachPlan: row.coachPlan,
        coachFeedback: row.coachFeedback,
        films: row.films,
        filmFiles: row.filmFiles,
        filmFilesOmitted: row.filmFilesOmitted,
        portrait: row.portrait,
        gymLogo: row.gymLogo,
        profile,
      }),
    );
    if (!parsed.ok) return { ok: false, error: parsed.error };
    bundles.push({
      profile,
      file: parsed.file,
      indexCards: indexFromUnknown(row.indexCards),
      extras: keptExtras(row.extras),
    });
  }
  return { ok: true, bundles };
}

function rankSummary(report: StudentProgressReport): string {
  const rank = report.rank;
  if (!rank) return 'no rank';
  return `${report.profile.belt} · ${rank.tapeCount} stripes · ${rank.history.length} promotion records`;
}

export function describeStudentPacket(packet: AdvantagePacket, bundles: readonly PreparedBundle[]): PacketPreview {
  const when = packet.createdAt.length >= 10 ? packet.createdAt.slice(0, 10) : packet.createdAt;
  const scope = packet.sections.scope === 'all' ? 'Every profile on that phone' : 'The open profile';
  const lines = [
    `Student packet · ${when} · Advantage ${packet.appVersion}`,
    packet.accountId ? `Account reference ${packet.accountId}. This does not restore a purchase.` : '',
    `${scope}. ${bundles.map((bundle) => bundle.profile.name).join(', ')}.`,
  ].filter((line) => line.length > 0);
  for (const bundle of bundles) {
    const videos = bundle.file.filmFiles?.length ? `, ${bundle.file.filmFiles.length} video files` : '';
    lines.push(
      `${bundle.profile.name}: ${bundle.file.report.journal.length} journal cards, ${bundle.file.assessment.entries.length} self-assessment check-ins, ${rankSummary(bundle.file.report)}, ${bundle.indexCards.cards.length} index cards, spreadsheet included${videos}.`,
    );
  }
  lines.push('Checksums verified. Nothing is written until you choose merge or replace.');
  return { title: 'Student packet', lines, restorable: true };
}

function describeLegacy(file: StudentBackupFile): PacketPreview {
  const name = file.profile?.name ?? 'the open profile';
  return {
    title: 'Older journal backup',
    lines: [
      `Older journal backup (.json) for ${name}.`,
      `${file.report.journal.length} journal cards, ${file.assessment.entries.length} self-assessment check-ins, ${rankSummary(file.report)}.`,
      'Index cards from a student packet are not in this older file.',
      'Nothing is written until you choose merge or replace.',
    ],
    restorable: true,
  };
}

export async function readRestoreChoice(
  text: string,
): Promise<{ ok: true; choice: StudentRestoreChoice } | { ok: false; error: string }> {
  const parsed = await parsePacket(text);
  if (!parsed.ok) {
    if (parsed.reason === 'invalid') return { ok: false, error: parsed.error };
    const legacy = parseStudentBackup(text);
    if (!legacy.ok) return { ok: false, error: legacy.error };
    return {
      ok: true,
      choice: { source: 'legacy', file: legacy.file, preview: describeLegacy(legacy.file), restorable: true, bundles: [] },
    };
  }
  if (parsed.packet.kind !== 'student') {
    return {
      ok: true,
      choice: {
        source: 'packet',
        packet: parsed.packet,
        preview: describeDesignedPacket(parsed.packet),
        restorable: false,
        bundles: [],
      },
    };
  }
  const ready = prepareStudentBundles(parsed.packet);
  if (!ready.ok) return { ok: false, error: ready.error };
  return {
    ok: true,
    choice: {
      source: 'packet',
      packet: parsed.packet,
      preview: describeStudentPacket(parsed.packet, ready.bundles),
      restorable: true,
      bundles: ready.bundles,
    },
  };
}

function mergeIndexCards(local: IndexCardFile, incoming: IndexCardFile): IndexCardFile {
  const map = new Map(local.cards.map((card) => [card.id, card]));
  for (const card of incoming.cards) {
    const prev = map.get(card.id);
    if (!prev || (card.addedAt ?? 0) >= (prev.addedAt ?? 0)) map.set(card.id, card);
  }
  return { version: 1, cards: [...map.values()] };
}

function applyExtras(storage: MemoryStore, extras: Record<string, string>, mode: BackupApplyMode): void {
  for (const key of STUDENT_PACKET_EXTRA_KEYS) {
    const value = extras[key];
    if (typeof value === 'string') {
      if (mode === 'replace' || storage.getItem(key) == null) storage.setItem(key, value);
      continue;
    }
    if (mode === 'replace') storage.removeItem?.(key);
  }
}

export function applyStudentRestore(
  storage: MemoryStore,
  choice: StudentRestoreChoice,
  mode: BackupApplyMode,
  photos: { rank: RankPhotoStore; bracket: Record<string, string> },
): { note: string; films: { profileId: string; blobs: { id: string; blob: Blob }[] }[] } {
  if (!choice.restorable) {
    throw new Error('This build does not restore that packet.');
  }
  if (choice.source === 'legacy') {
    const applied = applyBackupToMemory(storage, choice.file, mode, photos);
    return {
      note: applied.note,
      films: [{ profileId: choice.file.profile?.id || readActiveStudentProfile(storage).id, blobs: filmBlobsFromBackup(choice.file) }],
    };
  }
  for (const bundle of choice.bundles) {
    if (!ensureStudentProfileRecord(storage, bundle.profile, { rename: mode === 'replace' })) {
      throw new Error(`Could not restore the profile ${bundle.profile.name}.`);
    }
  }
  const notes: string[] = [];
  const films: { profileId: string; blobs: { id: string; blob: Blob }[] }[] = [];
  for (const bundle of choice.bundles) {
    const applied = applyBackupToMemory(storage, bundle.file, mode, photos);
    const scoped = bindStudentProfileStorage(storage, bundle.profile.id);
    const cards = mode === 'replace' ? bundle.indexCards : mergeIndexCards(loadIndexCards(scoped), bundle.indexCards);
    writeIndexCards(scoped, cards);
    applyExtras(scoped, bundle.extras, mode);
    notes.push(applied.note);
    films.push({ profileId: bundle.profile.id, blobs: filmBlobsFromBackup(bundle.file) });
  }
  if (mode === 'replace' && choice.packet.sections.scope === 'all') {
    const activeId = choice.packet.sections.activeProfileId;
    if (typeof activeId === 'string') switchStudentProfile(storage, activeId);
  }
  if (choice.bundles.length === 1) return { note: notes[0] ?? 'Saved on this phone.', films };
  const verb = mode === 'replace' ? 'replaced' : 'merged';
  return { note: `The backup ${verb} ${choice.bundles.length} profiles on this phone. Saved on this phone.`, films };
}
