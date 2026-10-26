/**
 * One Student Edition export at a time.
 * Back up my journal downloads the JSON file, the only file Merge and Replace
 * can restore. Spreadsheet and PDF buttons each download their own file.
 * A connected academy folder or personal drive receives that same one file.
 */

import { providerLabel, type StudentDriveLink } from './academyPathway.ts';
import { loadBracketPhotos } from './bracketPhoto.ts';
import { loadRankPictures, type RankPhotoStore } from './rankPhotos.ts';
import { pdfBlob } from './simplePdf.ts';
import { loadAssessments, type AssessmentState } from './studentAssessment.ts';
import {
  buildStudentBackup,
  connectedBackupTargets,
  journalBackupConfirmation,
  journalBackupFailure,
  studentBackupNames,
  type BackupBlob,
  type BackupMarkImages,
  type StudentExportKind,
} from './studentBackup.ts';
import { beltModeOf } from './beltBook.ts';
import { headerVisibility, readProfileMarks } from './profileMarks.ts';
import { readProfilePortrait } from './profilePortrait.ts';
import { PDF_GYM_LOGO_ID, PDF_SELFIE_ID, reportHeaderArt } from './pdfRaster.ts';
import { readStudentGymLogo } from './studentGymMark.ts';
import { loadStudentReport, todayIso } from './studentEdition.ts';
import { getFilmBlob, loadFilms, type StudentFilm } from './studentFilm.ts';
import { loadScouting, type ScoutingCard } from './studentScouting.ts';
import { loadCoachShelf, type CoachShelf } from './studentTools.ts';
import { copyFilesToStudentDrive, type DriveCopyFile } from './studentDriveCopy.ts';
import type { StudentProgressReport } from './progress/types.ts';

const JSON_DRIVE_NOTE = 'No academy folder or personal drive is connected.';

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type StudentExportSource = {
  report: StudentProgressReport;
  assessment: AssessmentState;
  scouting: readonly ScoutingCard[];
  rankPhotos: RankPhotoStore;
  bracketPhotos: Record<string, string>;
  shelf: CoachShelf;
  films: readonly StudentFilm[];
  blobs?: readonly BackupBlob[];
  marks?: BackupMarkImages;
};

export type StudentExportResult =
  | { ok: true; message: string; filename: string }
  | { ok: false; message: string; filename: '' };

export type StudentExportOptions = {
  includeVideos: boolean;
  now?: Date;
  storage?: MemoryStore;
  download?: (filename: string, blob: Blob) => void;
  copyFiles?: (target: StudentDriveLink, files: readonly DriveCopyFile[]) => Promise<{ error: string }>;
  gather?: () => Promise<StudentExportSource>;
};

function browserDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportFile(
  kind: StudentExportKind,
  built: Awaited<ReturnType<typeof buildStudentBackup>>,
  names: ReturnType<typeof studentBackupNames>,
): DriveCopyFile {
  switch (kind) {
    case 'json':
      return { name: names.json, bytes: new Blob([built.json], { type: 'application/json' }), mime: 'application/json' };
    case 'csv':
      return { name: names.csv, bytes: new Blob([built.csv], { type: 'text/csv' }), mime: 'text/csv' };
    case 'progressPdf':
      return { name: names.progressPdf, bytes: pdfBlob(built.progressPdf), mime: 'application/pdf' };
    case 'assessmentPdf':
      return { name: names.assessmentPdf, bytes: pdfBlob(built.assessmentPdf), mime: 'application/pdf' };
  }
}

async function gatherFromThisPhone(includeVideos: boolean): Promise<StudentExportSource> {
  const films = loadFilms(localStorage);
  const blobs = includeVideos
    ? await Promise.all(films.map(async (film) => ({ id: film.id, blob: await getFilmBlob(film.id).catch(() => null) })))
    : [];
  const report = loadStudentReport(localStorage);
  const visibility = headerVisibility(beltModeOf(report), readProfileMarks());
  const selfie = visibility.selfie ? readProfilePortrait() : null;
  const gymLogo = visibility.logo ? readStudentGymLogo() : null;
  const art = await reportHeaderArt({ selfie, gymLogo });
  return {
    report,
    assessment: loadAssessments(localStorage),
    scouting: loadScouting(localStorage),
    rankPhotos: loadRankPictures(),
    bracketPhotos: loadBracketPhotos(),
    shelf: loadCoachShelf(localStorage),
    films,
    blobs,
    marks: {
      includeSelfie: visibility.selfie,
      includeLogo: visibility.logo,
      selfie,
      gymLogo,
      art: {
        selfie: art.selfie?.id === PDF_SELFIE_ID ? art.selfie : null,
        gymLogo: art.gymLogo?.id === PDF_GYM_LOGO_ID ? art.gymLogo : null,
      },
    },
  };
}

export async function runStudentEditionExport(
  kind: StudentExportKind,
  options: StudentExportOptions,
): Promise<StudentExportResult> {
  const storage = options.storage ?? localStorage;
  const download = options.download ?? browserDownload;
  const copyFiles = options.copyFiles ?? ((target, files) => copyFilesToStudentDrive(target, files));
  try {
    const source = options.gather ? await options.gather() : await gatherFromThisPhone(options.includeVideos);
    const when = options.now ?? new Date();
    const built = await buildStudentBackup({
      ...source,
      includeVideos: options.includeVideos,
      now: when,
      recordStamp: kind === 'json',
      stampStorage: {
        getItem: (key) => storage.getItem(key),
        setItem: (key, value) => storage.setItem(key, value),
        removeItem: (key) => storage.removeItem?.(key),
      },
    });
    const names = studentBackupNames(todayIso(when));
    const file = exportFile(kind, built, names);
    download(file.name, file.bytes);
    const targets = connectedBackupTargets(storage);
    const lead = kind === 'json' ? journalBackupConfirmation(file.name, options.includeVideos) : `Downloaded ${file.name} on this phone.`;
    if (!targets.length) {
      return { ok: true, filename: file.name, message: kind === 'json' ? `${lead} ${JSON_DRIVE_NOTE}` : lead };
    }
    const notes = [lead];
    for (const target of targets) {
      const copied = await copyFiles(target, [file]);
      if (copied.error) notes.push(`${providerLabel(target.provider)} did not take the copy. ${copied.error}`);
      else notes.push(`Also saved in ${target.folderName} on ${providerLabel(target.provider)}.`);
    }
    return { ok: true, filename: file.name, message: notes.join(' ') };
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message : 'Could not build the backup.';
    return { ok: false, filename: '', message: kind === 'json' ? journalBackupFailure(detail) : detail };
  }
}
