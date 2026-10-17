/**
 * One importable backup of Student Edition data on this phone, plus CSV
 * and PDF copies of the main templates. Video bytes are optional.
 * Advantage does not host the file.
 */

import {
  loadAcademyLink,
  loadPersonalDrive,
  type StudentDriveLink,
} from './academyPathway.ts';
import { competitionOf } from './progress/competition.ts';
import { PROGRESS_CSV_HEADERS, exportProgressCsv, parseProgressPacket, parseProgressValue } from './progress/format.ts';
import { RANK_BELTS, type JournalEntry, type StudentProgressReport } from './progress/types.ts';
import { RANK_PHOTO_KEY, emptyRankPhotoStore, type RankPhotoStore } from './rankPhotos.ts';
import { pdfToText, textToPdf } from './simplePdf.ts';
import {
  ASSESSMENT_AREAS,
  assessmentAverage,
  emptyAssessments,
  loadAssessments,
  writeAssessments,
  type AssessmentState,
} from './studentAssessment.ts';
import { loadStudentReport, saveStudentReport } from './studentEdition.ts';
import {
  FILM_STORAGE_KEY,
  loadFilms,
  writeFilms,
  type StudentFilm,
} from './studentFilm.ts';
import { emptyRank } from './studentRank.ts';
import { loadScouting, saveScouting, SCOUTING_STORAGE_KEY, type ScoutingCard } from './studentScouting.ts';
import { BELT_LABELS, loadCoachShelf, saveCoachShelf, type CoachShelf } from './studentTools.ts';
import { BRACKET_PHOTO_KEY } from './bracketPhoto.ts';

export const STUDENT_BACKUP_KIND = 'student-journal-backup';
export const STUDENT_BACKUP_VERSION = 1;
export const STUDENT_BACKUP_VIDEO_MAX_BYTES = 48 * 1024 * 1024;

export const BACKUP_BEFORE_CLEAR = 'A backup is recommended before clearing data on this phone.';
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
    progressPdf: `advantage-student-progress-${day}.pdf`,
    assessmentPdf: `advantage-student-self-assessment-${day}.pdf`,
  };
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

function beltName(belt: string): string {
  return BELT_LABELS[belt as keyof typeof BELT_LABELS] ?? belt;
}

function journalSummary(entry: JournalEntry): string {
  const line = entry.body.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return line.slice(0, 180);
}

export function progressReportLines(report: StudentProgressReport, assessment: AssessmentState): string[] {
  const rank = report.rank ?? emptyRank();
  const competition = competitionOf(report);
  const lines = [
    'Advantage Student Edition',
    'Progress report',
    '',
    'Hand this page to an instructor. Advantage does not host it.',
    '',
    `Student: ${report.profile.displayName || 'Not named'}`,
    `Gym: ${report.profile.gymName || 'Not named'}`,
    `Belt: ${beltName(report.profile.belt)}`,
    `Started: ${report.profile.startedOn || 'Not set'}`,
    '',
    'Rank and stripes',
    `Current belt awarded: ${rank.awardedOn || 'No date'}`,
    `Stripes: ${rank.tapeCount}`,
  ];
  rank.tapeDates.forEach((date, index) => {
    if (index < rank.tapeCount) lines.push(`Stripe ${index + 1}: ${date || 'No date'}`);
  });
  if (rank.history.length) {
    lines.push('Earlier belts:');
    for (const row of rank.history) {
      lines.push(`${beltName(row.belt)} awarded ${row.awardedOn || 'no date'}, ${row.tapeCount} stripes`);
    }
  }
  if (rank.lineage?.length) lines.push(`Lineage: ${rank.lineage.join(' / ')}`);
  lines.push('', 'Belt progress');
  if (!report.rubric.levels.length && !report.checklist.length) lines.push('No belt progress recorded.');
  for (const level of report.rubric.levels) {
    lines.push(`${level.name} (${beltName(level.belt)})`);
    for (const checkpoint of level.checkpoints) {
      const mark = checkpoint.met === true ? 'Met' : checkpoint.met === false ? 'Not yet' : 'Unmarked';
      lines.push(`  ${checkpoint.name}: ${mark}${checkpoint.note ? ` — ${checkpoint.note}` : ''}`);
    }
  }
  const learned = report.checklist.filter((row) => row.learnedOn && !row.hidden);
  if (learned.length) {
    lines.push('Fundamentals dated:');
    for (const row of learned.slice(0, 40)) {
      lines.push(`  ${row.displayName || row.name} learned ${row.learnedOn}`);
    }
  }
  lines.push('', 'Journal summary');
  const cards = [...report.journal].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (!cards.length) lines.push('No journal cards.');
  for (const card of cards.slice(0, 40)) lines.push(`${card.date}: ${journalSummary(card) || 'Card saved'}`);
  if (cards.length > 40) lines.push(`Showing the latest 40 of ${cards.length} cards.`);
  lines.push('', 'Competition and weight');
  for (const tag of ['a', 'b', 'c'] as const) {
    const game = competition.games[tag];
    if (game.techniques.trim() || game.notes.trim()) {
      lines.push(`${tag.toUpperCase()} game: ${game.techniques || game.notes}`);
    }
  }
  if (!competition.tournaments.length) lines.push('No tournaments recorded.');
  for (const event of competition.tournaments) {
    lines.push(`${event.date || 'No date'} ${event.name} (${event.status}) ${event.division}`.trim());
  }
  const wins = competition.results.reduce((sum, result) => sum + result.matches.filter((match) => match.result === 'win').length, 0);
  const losses = competition.results.reduce((sum, result) => sum + result.matches.filter((match) => match.result === 'loss').length, 0);
  if (competition.results.length) lines.push(`Recorded matches: ${wins} wins, ${losses} losses.`);
  if (competition.goalWeight != null) {
    lines.push(`Goal weight: ${competition.goalWeight} ${competition.goalUnit ?? competition.weightUnit}`);
  }
  const weighs = [...competition.weighIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  for (const weigh of weighs) lines.push(`${weigh.date}: ${weigh.weight} ${weigh.unit}${weigh.note ? ` — ${weigh.note}` : ''}`);
  if (!weighs.length) lines.push('No weigh-ins.');
  const latest = [...assessment.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  lines.push('', 'Self-assessment');
  if (!latest) lines.push('No self-assessment yet. A separate self-assessment report prints the full list.');
  else lines.push(`Latest ${latest.date}: average ${assessmentAverage(latest.scores).toFixed(1)}. See the self-assessment report for each area.`);
  const clips = report.clips ?? [];
  lines.push('', 'Video library');
  if (!clips.length) lines.push('No saved links.');
  for (const clip of clips) lines.push(`${clip.description}: ${clip.url}`);
  return lines;
}

export function selfAssessmentLines(report: StudentProgressReport, assessment: AssessmentState): string[] {
  const lines = [
    'Advantage Student Edition',
    'Self-assessment report',
    '',
    'Hand this page to an instructor. 1 is early. 5 is ready to rely on.',
    `Student: ${report.profile.displayName || 'Not named'}`,
    `Belt: ${beltName(report.profile.belt)}`,
    '',
  ];
  const entries = [...assessment.entries].sort((a, b) => b.date.localeCompare(a.date));
  if (!entries.length) lines.push('No self-assessment saved on this phone.');
  for (const entry of entries) {
    lines.push(`${entry.date} — average ${assessmentAverage(entry.scores).toFixed(1)}`);
    for (const area of ASSESSMENT_AREAS) lines.push(`  ${area.label}: ${entry.scores[area.id]}`);
    if (entry.note.trim()) lines.push(`  Note: ${entry.note.trim()}`);
    lines.push('');
  }
  return lines;
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
  const progressLines = progressReportLines(input.report, input.assessment);
  const assessmentLines = selfAssessmentLines(input.report, input.assessment);
  return {
    file,
    json: JSON.stringify(file),
    csv: studentTemplatesCsv(input),
    progressPdf: textToPdf(progressLines),
    assessmentPdf: textToPdf(assessmentLines),
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
    },
  };
}

function later<T extends { id: string; updatedAt?: number }>(local: T, incoming: T): T {
  const localAt = local.updatedAt ?? 0;
  const incomingAt = incoming.updatedAt ?? 0;
  return incomingAt >= localAt ? incoming : local;
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
  return {
    ...local,
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
    profile: incomingNewer ? incoming.profile : local.profile,
    rubric: incomingNewer ? incoming.rubric : local.rubric,
    checklist: mergeById(local.checklist, incoming.checklist, later),
    journal: mergeById(local.journal, incoming.journal, later),
    calendar: mergeById(local.calendar, incoming.calendar, (_left, right) => right),
    goals: mergeById(local.goals, incoming.goals, (_left, right) => right),
    clips: local.clips || incoming.clips ? mergeById(local.clips ?? [], incoming.clips ?? [], later) : undefined,
    rank: { ...rank, history },
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
  };
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
    const tapes: [string[], string[], string[], string[]] = [[], [], [], []];
    let any = false;
    for (let index = 0; index < 4; index += 1) {
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
  saveStudentReport(storage, blank);
  storage.setItem('matboard.studentEdition.assessment.v1', JSON.stringify(emptyAssessments()));
  storage.setItem(SCOUTING_STORAGE_KEY, JSON.stringify({ version: 1, cards: [] }));
  storage.setItem(RANK_PHOTO_KEY, JSON.stringify(emptyRankPhotoStore()));
  storage.setItem(BRACKET_PHOTO_KEY, JSON.stringify({}));
  storage.setItem(FILM_STORAGE_KEY, JSON.stringify({ version: 1, films: [] }));
  saveCoachShelf(storage, { plan: null, feedback: null });
}

export function connectedBackupTargets(storage: MemoryStore): StudentDriveLink[] {
  return [loadAcademyLink(storage), loadPersonalDrive(storage)].filter((link): link is StudentDriveLink => link != null);
}

export function pdfIncludes(bytes: Uint8Array, text: string): boolean {
  return pdfToText(bytes).includes(text);
}
