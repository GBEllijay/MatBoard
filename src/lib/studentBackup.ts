/**
 * Student Edition backup, plus CSV and PDF copies of the main templates.
 * The JSON file is the one Merge and Replace can restore. Video bytes are optional.
 * Advantage does not host the file.
 */

import {
  loadAcademyLink,
  loadPersonalDrive,
  type StudentDriveLink,
} from './academyPathway.ts';
import { competitionOf } from './progress/competition.ts';
import { shareTournaments } from './sharedTournaments.ts';
import { PROGRESS_CSV_HEADERS, exportProgressCsv, parseProgressPacket, parseProgressValue } from './progress/format.ts';
import { RANK_BELTS, type StudentProgressReport } from './progress/types.ts';
import { RANK_PHOTO_KEY, emptyRankPhotoStore, type RankPhotoStore } from './rankPhotos.ts';
import { assessmentReportPdf, progressReportPdf } from './reportPdf.ts';
import { pdfToText, type PdfImageAsset } from './simplePdf.ts';
import { clearProfileMarks } from './profileMarks.ts';
import { clearProfilePortrait, portraitFits, writeProfilePortraitSync } from './profilePortrait.ts';
import { clearStudentGymLogo, writeStudentGymLogo } from './studentGymMark.ts';
import { coachGymLogoFits } from './coachGymFit.ts';
import {
  ASSESSMENT_AREAS,
  ASSESSMENT_STORAGE_KEY,
  emptyAssessments,
  loadAssessments,
  writeAssessments,
  type AssessmentState,
} from './studentAssessment.ts';
import { forgetStudentBackupStamp } from './studentBackupStamp.ts';
import { noteStudentStoresCleared } from './studentDemo.ts';
import { loadStudentReport, saveStudentReport, todayIso } from './studentEdition.ts';
import {
  FILM_STORAGE_KEY,
  loadFilms,
  writeFilms,
  type StudentFilm,
} from './studentFilm.ts';
import { emptyRank, normalizeStoredRank } from './studentRank.ts';
import { loadScouting, saveScouting, SCOUTING_STORAGE_KEY, type ScoutingCard } from './studentScouting.ts';
import { BRACKET_PHOTO_KEY } from './bracketPhoto.ts';
import { progressReportLines, selfAssessmentLines, studentReportPdfName } from './studentReport.ts';
import { noteStudentBackupBuilt } from './studentBackupStamp.ts';
import { loadCoachShelf, saveCoachShelf, type CoachShelf } from './studentTools.ts';

export { progressReportLines, selfAssessmentLines, studentReportPdfName };

export const STUDENT_BACKUP_KIND = 'student-journal-backup';
export const STUDENT_BACKUP_VERSION = 1;
export const STUDENT_BACKUP_VIDEO_MAX_BYTES = 48 * 1024 * 1024;

export const BACKUP_BEFORE_CLEAR = 'A backup is recommended before clearing data on this phone.';
export const CLEAR_CONFIRM_PHRASE = 'CLEAR';
export const CLEAR_STUDENT_DEVICE_NOTE =
  'This only affects Student Edition on this device. Coach tools, unlock codes, and drive connections stay.';
export const CLEAR_STUDENT_DATA_ITEMS = [
  'Journal',
  'Rank and stripes',
  'Belt progress',
  'Competitor',
  'Weight',
  'Self-assessment',
  'Tournaments',
  'Opponent scouting',
  'Videos',
  'Profile photo',
  'Gym logo on My profile',
  'Coach plans and coach feedback saved on this phone',
] as const;
export const BACKUP_REPLACE_WARN =
  'Replace removes the journal on this phone and uses the backup instead. A backup of the current journal is recommended first.';
export const BACKUP_NOT_A_BACKUP =
  'That file is not a Student Edition backup. Use the file from Back up my journal. A coach plan still imports from Import from coach.';

export function backupVideoTooLargeMessage(bytes: number): string {
  const mb = Math.max(1, Math.round(bytes / (1024 * 1024)));
  return `Those video files are too large for one backup (${mb} MB). Back up without video files, or remove a large clip and try again.`;
}

export type StudentBackupFile = {
  advantage: typeof STUDENT_BACKUP_KIND;
  version: typeof STUDENT_BACKUP_VERSION;
  exportedAt: string;
  report: StudentProgressReport;
  assessment: AssessmentState;
  scouting: ScoutingCard[];
  rankPhotos: RankPhotoStore;
  bracketPhotos: Record<string, string>;
  coachPlan: CoachShelf['plan'];
  coachFeedback: CoachShelf['feedback'];
  films: StudentFilm[];
  filmFiles?: { id: string; base64: string }[];
  filmFilesOmitted?: { id: string; reason: string }[];
  /** Profile photo. Present only when that switch was on at export. */
  portrait?: string;
  /** Gym logo. Present only when that switch was on at export. */
  gymLogo?: string;
};

export type BackupMarkImages = {
  includeSelfie: boolean;
  includeLogo: boolean;
  selfie?: string | null;
  gymLogo?: string | null;
  art?: { selfie?: PdfImageAsset | null; gymLogo?: PdfImageAsset | null };
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type BackupBlob = { id: string; blob: Blob | null };

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(cells: readonly string[]): string {
  const width = PROGRESS_CSV_HEADERS.length;
  const padded = [...cells];
  while (padded.length < width) padded.push('');
  return padded.slice(0, width).map(csvCell).join(',');
}

export function studentBackupNames(date: string) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'journal';
  return {
    json: `advantage-student-backup-${day}.json`,
    csv: `advantage-student-templates-${day}.csv`,
    progressPdf: studentReportPdfName('progress', date),
    assessmentPdf: studentReportPdfName('assessment', date),
  };
}

export type StudentExportKind = 'json' | 'csv' | 'progressPdf' | 'assessmentPdf';

export type BackupFileGuide = {
  id: StudentExportKind;
  title: string;
  name: string;
  detail: string;
};

export const JOURNAL_BACKUP_LABEL = 'Back up my journal (.json)';
export const SPREADSHEET_EXPORT_LABEL = 'Download spreadsheet (.csv)';
export const PROGRESS_PDF_LABEL = 'Download progress report (.pdf)';
export const ASSESSMENT_PDF_LABEL = 'Download self-assessment (.pdf)';
export const BACK_UP_FIRST_LABEL = 'Back up first (.json)';

export function studentExportLabel(kind: StudentExportKind): string {
  switch (kind) {
    case 'json':
      return JOURNAL_BACKUP_LABEL;
    case 'csv':
      return SPREADSHEET_EXPORT_LABEL;
    case 'progressPdf':
      return PROGRESS_PDF_LABEL;
    case 'assessmentPdf':
      return ASSESSMENT_PDF_LABEL;
  }
}

export function studentExportBusyLabel(kind: StudentExportKind): string {
  switch (kind) {
    case 'json':
      return 'Building journal backup…';
    case 'csv':
      return 'Building spreadsheet…';
    case 'progressPdf':
      return 'Building progress report…';
    case 'assessmentPdf':
      return 'Building self-assessment…';
  }
}

/** Shown beside the include-videos switch. On means the JSON backup carries the files. */
export function videoFilesLine(included: boolean): string {
  return included
    ? 'Video files: on. They are included in the JSON backup.'
    : 'Video files: off. The JSON backup does not include video files.';
}

/** One line under each export button. The file name is the file that downloads. */
export function studentExportDetail(kind: StudentExportKind, date: string): string {
  const names = studentBackupNames(date);
  switch (kind) {
    case 'json':
      return `Downloads ${names.json}. This is the file you restore with Merge or Replace.`;
    case 'csv':
      return `Downloads ${names.csv}. Spreadsheet rows for Excel or Sheets. This file cannot restore the phone.`;
    case 'progressPdf':
      return `Downloads ${names.progressPdf}. A printable page of rank, journal, and competition.`;
    case 'assessmentPdf':
      return `Downloads ${names.assessmentPdf}. A printable page of the seven areas and check-in notes.`;
  }
}

/** Names and one-line descriptions for the four exports. A backup click writes only the JSON. */
export function backupFileGuide(date: string): BackupFileGuide[] {
  const names = studentBackupNames(date);
  const kinds: StudentExportKind[] = ['json', 'csv', 'progressPdf', 'assessmentPdf'];
  return kinds.map((id) => ({
    id,
    title: studentExportLabel(id),
    name: names[id],
    detail: studentExportDetail(id, date),
  }));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function studentTemplatesCsv(input: {
  report: StudentProgressReport;
  assessment: AssessmentState;
  scouting: readonly ScoutingCard[];
  films: readonly StudentFilm[];
}): string {
  const base = exportProgressCsv(input.report).replace(/^\uFEFF/, '').replace(/\s*$/, '');
  const extra: string[] = [];
  for (const entry of input.assessment.entries) {
    for (const area of ASSESSMENT_AREAS) {
      extra.push(csvRow(['Self-assessment', entry.id, entry.date, '', '', area.label, area.label, '', '', String(entry.scores[area.id]), entry.note]));
    }
  }
  for (const card of input.scouting) {
    extra.push(csvRow(['Scouting', card.id, '', '', '', card.group, card.name, '', '', card.notes, card.style, '', '', '', card.belt]));
  }
  for (const film of input.films) {
    extra.push(csvRow(['Filmed video', film.id, film.date, '', '', film.where, film.technique, '', '', film.note, film.fileName]));
  }
  return `\uFEFF${base}${extra.length ? `\r\n${extra.join('\r\n')}` : ''}\r\n`;
}

export async function buildStudentBackup(input: {
  report: StudentProgressReport;
  assessment: AssessmentState;
  scouting: readonly ScoutingCard[];
  rankPhotos: RankPhotoStore;
  bracketPhotos: Record<string, string>;
  shelf: CoachShelf;
  films: readonly StudentFilm[];
  blobs?: readonly BackupBlob[];
  includeVideos: boolean;
  now?: Date;
  /** The JSON backup updates Last backup. Spreadsheet and PDF exports leave that stamp alone. */
  recordStamp?: boolean;
  stampStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Selfie and gym logo ride along only when their switches are on. */
  marks?: BackupMarkImages;
}): Promise<{ file: StudentBackupFile; json: string; csv: string; progressPdf: Uint8Array; assessmentPdf: Uint8Array }> {
  const when = input.now ?? new Date();
  const films = [...input.films];
  const file: StudentBackupFile = {
    advantage: STUDENT_BACKUP_KIND,
    version: STUDENT_BACKUP_VERSION,
    exportedAt: when.toISOString(),
    report: input.report,
    assessment: input.assessment,
    scouting: [...input.scouting],
    rankPhotos: input.rankPhotos,
    bracketPhotos: { ...input.bracketPhotos },
    coachPlan: input.shelf.plan,
    coachFeedback: input.shelf.feedback,
    films,
  };
  const marks = input.marks;
  if (marks?.includeSelfie && marks.selfie && portraitFits(marks.selfie)) file.portrait = marks.selfie;
  if (marks?.includeLogo && marks.gymLogo && coachGymLogoFits(marks.gymLogo)) file.gymLogo = marks.gymLogo;
  if (input.includeVideos) {
    const blobs = input.blobs ?? [];
    let total = 0;
    const filmFiles: { id: string; base64: string }[] = [];
    const omitted: { id: string; reason: string }[] = [];
    for (const film of films) {
      const found = blobs.find((item) => item.id === film.id)?.blob ?? null;
      if (!found) {
        omitted.push({
          id: film.id,
          reason: film.where === 'phone' ? 'The video file was not on this phone.' : 'The video file is in the connected drive, not in this backup.',
        });
        continue;
      }
      total += found.size;
      if (total > STUDENT_BACKUP_VIDEO_MAX_BYTES) {
        throw new Error(backupVideoTooLargeMessage(total));
      }
      filmFiles.push({ id: film.id, base64: bytesToBase64(new Uint8Array(await found.arrayBuffer())) });
    }
    if (filmFiles.length) file.filmFiles = filmFiles;
    if (omitted.length) file.filmFilesOmitted = omitted;
  }
  const issuedOn = todayIso(when);
  if (input.recordStamp !== false) noteStudentBackupBuilt(when, input.stampStorage);
  return {
    file,
    json: JSON.stringify(file),
    csv: studentTemplatesCsv(input),
    progressPdf: progressReportPdf(input.report, input.assessment, { scouting: input.scouting, films }, issuedOn, {
      selfie: marks?.includeSelfie ? marks.art?.selfie ?? null : null,
      gymLogo: marks?.includeLogo ? marks.art?.gymLogo ?? null : null,
    }),
    assessmentPdf: assessmentReportPdf(input.report, input.assessment, issuedOn),
  };
}

export function parseStudentBackup(text: string): { ok: true; file: StudentBackupFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not JSON.' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: BACKUP_NOT_A_BACKUP };
  const record = raw as Partial<StudentBackupFile> & { kind?: string };
  if (record.kind === 'student-progress-report' || record.kind === 'coach-plan' || record.kind === 'coach-feedback') {
    return { ok: false, error: BACKUP_NOT_A_BACKUP };
  }
  if (record.advantage !== STUDENT_BACKUP_KIND || record.version !== STUDENT_BACKUP_VERSION) {
    return { ok: false, error: BACKUP_NOT_A_BACKUP };
  }
  const parsed = parseProgressValue(record.report);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') {
    return { ok: false, error: parsed.ok ? BACKUP_NOT_A_BACKUP : parsed.errors.join(' ') };
  }
  const assessment = record.assessment && Array.isArray(record.assessment.entries) ? record.assessment : emptyAssessments();
  const scouting = Array.isArray(record.scouting) ? record.scouting : [];
  const films = Array.isArray(record.films) ? record.films : [];
  return {
    ok: true,
    file: {
      advantage: STUDENT_BACKUP_KIND,
      version: STUDENT_BACKUP_VERSION,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
      report: parsed.value,
      assessment,
      scouting,
      rankPhotos: record.rankPhotos && typeof record.rankPhotos === 'object' ? record.rankPhotos : emptyRankPhotoStore(),
      bracketPhotos: record.bracketPhotos && typeof record.bracketPhotos === 'object' ? record.bracketPhotos : {},
      coachPlan: record.coachPlan ?? null,
      coachFeedback: record.coachFeedback ?? null,
      films,
      filmFiles: Array.isArray(record.filmFiles) ? record.filmFiles : undefined,
      filmFilesOmitted: Array.isArray(record.filmFilesOmitted) ? record.filmFilesOmitted : undefined,
      portrait: keptStill(record.portrait, portraitFits),
      gymLogo: keptStill(record.gymLogo, coachGymLogoFits),
    },
  };
}

function keptStill(value: unknown, fits: (text: string) => boolean): string | undefined {
  if (typeof value !== 'string' || !fits(value)) return undefined;
  return value;
}

function later<T extends { id: string; updatedAt?: number }>(local: T, incoming: T): T {
  const localAt = local.updatedAt ?? 0;
  const incomingAt = incoming.updatedAt ?? 0;
  return incomingAt >= localAt ? incoming : local;
}

function mergeChecklistRow(
  local: StudentProgressReport['checklist'][number],
  incoming: StudentProgressReport['checklist'][number],
): StudentProgressReport['checklist'][number] {
  const newer = incoming.updatedAt >= local.updatedAt ? incoming : local;
  const older = newer === incoming ? local : incoming;
  const level = local.level > incoming.level ? local.level : incoming.level;
  return {
    ...newer,
    level,
    learnedOn: newer.learnedOn || older.learnedOn,
    note: newer.note || older.note,
  };
}

function mergeById<T extends { id: string }>(local: readonly T[], incoming: readonly T[], pick: (local: T, incoming: T) => T): T[] {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prev = map.get(item.id);
    map.set(item.id, prev ? pick(prev, item) : item);
  }
  return [...map.values()];
}

export function mergeStudentReports(local: StudentProgressReport, incoming: StudentProgressReport): StudentProgressReport {
  const incomingNewer = incoming.updatedAt >= local.updatedAt;
  const localComp = competitionOf(local);
  const incomingComp = competitionOf(incoming);
  const rank = incomingNewer ? incoming.rank ?? local.rank ?? emptyRank() : local.rank ?? incoming.rank ?? emptyRank();
  const history = mergeById(local.rank?.history ?? [], incoming.rank?.history ?? [], (_left, right) => right);
  return shareTournaments({
    ...local,
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
    profile: incomingNewer ? incoming.profile : local.profile,
    rubric: incomingNewer ? incoming.rubric : local.rubric,
    checklist: mergeById(local.checklist, incoming.checklist, mergeChecklistRow),
    journal: mergeById(local.journal, incoming.journal, later),
    calendar: mergeById(local.calendar, incoming.calendar, (_left, right) => right),
    goals: mergeById(local.goals, incoming.goals, (_left, right) => right),
    clips: local.clips || incoming.clips ? mergeById(local.clips ?? [], incoming.clips ?? [], later) : undefined,
    rank: normalizeStoredRank({ ...rank, history }),
    competition: {
      ...localComp,
      games: incomingNewer ? incomingComp.games : localComp.games,
      weightUnit: incomingNewer ? incomingComp.weightUnit : localComp.weightUnit,
      goalWeight: incomingNewer ? incomingComp.goalWeight : localComp.goalWeight,
      goalUnit: incomingNewer ? incomingComp.goalUnit : localComp.goalUnit,
      weighDate: incomingNewer ? incomingComp.weighDate : localComp.weighDate,
      tournaments: mergeById(localComp.tournaments, incomingComp.tournaments, (_left, right) => right),
      weighIns: mergeById(localComp.weighIns, incomingComp.weighIns, (_left, right) => right),
      results: mergeById(localComp.results, incomingComp.results, (_left, right) => right),
    },
  });
}

function mergeAssessments(local: AssessmentState, incoming: AssessmentState): AssessmentState {
  const byDate = new Map(local.entries.map((entry) => [entry.date, entry]));
  for (const entry of incoming.entries) byDate.set(entry.date, entry);
  return { entries: [...byDate.values()] };
}

function mergePhotos(local: RankPhotoStore, incoming: RankPhotoStore): RankPhotoStore {
  const next = emptyRankPhotoStore();
  for (const belt of RANK_BELTS) {
    const belts = [...new Set([...(local.belts[belt] ?? []), ...(incoming.belts[belt] ?? [])])].slice(0, 8);
    if (belts.length) next.belts[belt] = belts;
    const slots = belt === 'black' ? 6 : 4;
    const tapes: string[][] = [];
    let any = false;
    for (let index = 0; index < slots; index += 1) {
      tapes[index] = [...new Set([...(local.tapes[belt]?.[index] ?? []), ...(incoming.tapes[belt]?.[index] ?? [])])].slice(0, 4);
      if (tapes[index].length) any = true;
    }
    if (any) next.tapes[belt] = tapes;
  }
  return next;
}

function cleanBracket(value: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [id, image] of Object.entries(value)) {
    if (typeof image === 'string' && image.startsWith('data:image/') && image.length <= 180_000) next[id] = image;
  }
  return next;
}

export type BackupApplyMode = 'merge' | 'replace';

export function backupShelf(file: StudentBackupFile): CoachShelf {
  const plan = file.coachPlan ? parseProgressPacket(JSON.stringify(file.coachPlan)) : null;
  const feedback = file.coachFeedback ? parseProgressPacket(JSON.stringify(file.coachFeedback)) : null;
  return {
    plan: plan && plan.ok && plan.value.kind === 'coach-plan' ? plan.value : null,
    feedback: feedback && feedback.ok && feedback.value.kind === 'coach-feedback' ? feedback.value : null,
  };
}

export function mergedShelf(local: CoachShelf, incoming: CoachShelf): CoachShelf {
  const plan = !local.plan ? incoming.plan : !incoming.plan ? local.plan : incoming.plan.updatedAt >= local.plan.updatedAt ? incoming.plan : local.plan;
  const feedback = !local.feedback
    ? incoming.feedback
    : !incoming.feedback
      ? local.feedback
      : incoming.feedback.updatedAt >= local.feedback.updatedAt
        ? incoming.feedback
        : local.feedback;
  return { plan, feedback };
}

export function applyBackupToMemory(
  storage: MemoryStore,
  file: StudentBackupFile,
  mode: BackupApplyMode,
  photos: { rank: RankPhotoStore; bracket: Record<string, string> },
): { report: StudentProgressReport; films: StudentFilm[]; note: string } {
  const localReport = loadStudentReport(storage);
  const report = mode === 'replace' ? file.report : mergeStudentReports(localReport, file.report);
  const saved = saveStudentReport(storage, report);
  const assessment = mode === 'replace' ? file.assessment : mergeAssessments(loadAssessments(storage), file.assessment);
  writeAssessments(storage, assessment);
  const scouting = mode === 'replace' ? file.scouting : mergeById(loadScouting(storage), file.scouting, (_left, right) => right);
  saveScouting(storage, scouting);
  const rankPhotos = mode === 'replace' ? file.rankPhotos : mergePhotos(photos.rank, file.rankPhotos);
  storage.setItem(RANK_PHOTO_KEY, JSON.stringify(rankPhotos));
  const brackets = mode === 'replace' ? cleanBracket(file.bracketPhotos) : cleanBracket({ ...photos.bracket, ...file.bracketPhotos });
  storage.setItem(BRACKET_PHOTO_KEY, JSON.stringify(brackets));
  const shelf = backupShelf(file);
  saveCoachShelf(storage, mode === 'replace' ? shelf : mergedShelf(loadCoachShelf(storage), shelf));
  const films = mode === 'replace' ? writeFilms(storage, file.films) : writeFilms(storage, mergeById(loadFilms(storage), file.films, later));
  if (file.portrait) writeProfilePortraitSync(file.portrait, storage);
  if (file.gymLogo) {
    try {
      writeStudentGymLogo(file.gymLogo, storage);
    } catch {
      /* a logo that no longer fits stays off this phone */
    }
  }
  return {
    report: saved,
    films,
    note: mode === 'replace' ? 'The backup replaced the journal on this phone.' : 'The backup was merged into the journal on this phone.',
  };
}

export function filmBlobsFromBackup(file: StudentBackupFile): { id: string; blob: Blob }[] {
  const films = new Map(file.films.map((film) => [film.id, film]));
  const blobs: { id: string; blob: Blob }[] = [];
  for (const item of file.filmFiles ?? []) {
    const film = films.get(item.id);
    const bytes = base64ToBytes(item.base64);
    if (!film || !bytes) continue;
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    blobs.push({ id: item.id, blob: new Blob([buffer], { type: film.mime || 'video/mp4' }) });
  }
  return blobs;
}

export function clearStudentMemory(storage: MemoryStore): void {
  const blank = loadStudentReport({ getItem: () => null });
  if (storage.removeItem) storage.removeItem(ASSESSMENT_STORAGE_KEY);
  else storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(emptyAssessments()));
  storage.setItem(SCOUTING_STORAGE_KEY, JSON.stringify({ version: 1, cards: [] }));
  storage.setItem(RANK_PHOTO_KEY, JSON.stringify(emptyRankPhotoStore()));
  storage.setItem(BRACKET_PHOTO_KEY, JSON.stringify({}));
  storage.setItem(FILM_STORAGE_KEY, JSON.stringify({ version: 1, films: [] }));
  saveCoachShelf(storage, { plan: null, feedback: null });
  void clearProfilePortrait(storage, null);
  clearStudentGymLogo(storage);
  clearProfileMarks(storage);
  // localStorage.removeItem throws if it is pulled off the store, so keep it bound.
  if (typeof storage.removeItem === 'function') {
    forgetStudentBackupStamp({ removeItem: storage.removeItem.bind(storage) });
  }
  noteStudentStoresCleared();
  saveStudentReport(storage, blank);
}

export function connectedBackupTargets(storage: MemoryStore): StudentDriveLink[] {
  return [loadAcademyLink(storage), loadPersonalDrive(storage)].filter((link): link is StudentDriveLink => link != null);
}

export function pdfIncludes(bytes: Uint8Array, text: string): boolean {
  return pdfToText(bytes).includes(text);
}
