/**
 * One export at a time: JSON backup, spreadsheet, progress PDF, self-assessment PDF.
 * Drive copy receives that one file. Last backup moves only for the JSON.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { saveStudentDriveLink, type StudentDriveLink } from './academyPathway.ts';
import { emptyRankPhotoStore } from './rankPhotos.ts';
import { STUDENT_BACKUP_VIDEO_MAX_BYTES, pdfIncludes } from './studentBackup.ts';
import { runStudentEditionExport, type StudentExportSource } from './studentBackupExport.ts';
import { backupStampLabel, readStudentBackupStamp } from './studentBackupStamp.ts';
import { addJournalEntry, blankStudentReport } from './studentEdition.ts';
import type { DriveCopyFile } from './studentDriveCopy.ts';
import type { StudentFilm } from './studentFilm.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function source(note = 'hip escape'): StudentExportSource {
  const report = addJournalEntry(
    blankStudentReport(20),
    {
      date: '2026-10-17',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [{ id: '', name: 'Armbar' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: note,
    },
    20,
  );
  return {
    report,
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
  };
}

function film(): StudentFilm {
  return {
    id: 'film.test',
    fileName: '2026-10-17 Armbar - clip 1.mp4',
    date: '2026-10-17',
    technique: 'Armbar',
    note: 'partner',
    mime: 'video/mp4',
    size: 4,
    createdAt: 1,
    updatedAt: 1,
    where: 'phone',
    provider: '',
    driveFileId: '',
    dateFolder: '2026-10-17 (Sat)',
  };
}

function capture() {
  const saved: { name: string; blob: Blob }[] = [];
  return {
    saved,
    download: (name: string, blob: Blob) => {
      saved.push({ name, blob });
    },
    async text(index = saved.length - 1) {
      return (await saved[index]?.blob.text()) ?? '';
    },
    async bytes(index = saved.length - 1) {
      return new Uint8Array(await (saved[index]?.blob.arrayBuffer() ?? Promise.resolve(new ArrayBuffer(0))));
    },
  };
}

const when = new Date('2026-10-24T15:00:00Z');

test('each export downloads one file and only the JSON backup moves Last backup', async () => {
  const storage = memory();
  const gathered = source();
  const run = async (kind: 'json' | 'csv' | 'progressPdf' | 'assessmentPdf') => {
    const pack = capture();
    const result = await runStudentEditionExport(kind, {
      includeVideos: false,
      now: when,
      storage,
      gather: async () => gathered,
      download: pack.download,
      copyFiles: async () => ({ error: 'should not copy' }),
    });
    return { result, pack };
  };

  const csv = await run('csv');
  assert.equal(csv.result.ok, true);
  assert.equal(csv.pack.saved.length, 1);
  assert.equal(csv.pack.saved[0]?.name, 'advantage-student-templates-2026-10-24.csv');
  assert.match(await csv.pack.text(), /Armbar/);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');
  if (csv.result.ok) assert.match(csv.result.message, /Downloaded advantage-student-templates-2026-10-24\.csv/);

  const progress = await run('progressPdf');
  assert.equal(progress.pack.saved.length, 1);
  assert.equal(progress.pack.saved[0]?.name, 'advantage-student-progress-2026-10-24.pdf');
  assert.equal(pdfIncludes(await progress.pack.bytes(), 'Rank and stripes'), true);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');

  const assessment = await run('assessmentPdf');
  assert.equal(assessment.pack.saved.length, 1);
  assert.equal(assessment.pack.saved[0]?.name, 'advantage-student-self-assessment-2026-10-24.pdf');
  assert.equal(pdfIncludes(await assessment.pack.bytes(), 'Self-assessment'), true);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');

  const json = await run('json');
  assert.equal(json.pack.saved.length, 1);
  assert.equal(json.pack.saved[0]?.name, 'advantage-student-backup-2026-10-24.json');
  const body = await json.pack.text();
  assert.match(body, /hip escape/);
  assert.equal(body.includes('advantage-student-templates'), false);
  if (json.result.ok) {
    assert.equal(json.result.message, 'Saved on this phone. No academy folder or personal drive is connected.');
  }
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), '2026-10-24');
});

test('include video files puts bytes in the JSON backup and leaves them out when off', async () => {
  const clip = film();
  const withFilm = { ...source(), films: [clip], blobs: [{ id: clip.id, blob: new Blob(['abcd']) }] };
  const storage = memory();
  const offPack = capture();
  const off = await runStudentEditionExport('json', {
    includeVideos: false,
    now: when,
    storage,
    gather: async () => withFilm,
    download: offPack.download,
  });
  assert.equal(off.ok, true);
  const offFile = JSON.parse(await offPack.text()) as { filmFiles?: unknown; films?: { technique?: string }[] };
  assert.equal(offFile.filmFiles, undefined);
  assert.equal(offFile.films?.[0]?.technique, 'Armbar');

  const onPack = capture();
  const on = await runStudentEditionExport('json', {
    includeVideos: true,
    now: when,
    storage,
    gather: async () => withFilm,
    download: onPack.download,
  });
  assert.equal(on.ok, true);
  const onFile = JSON.parse(await onPack.text()) as { filmFiles?: { base64: string }[] };
  assert.equal((onFile.filmFiles?.[0]?.base64.length ?? 0) > 0, true);

  const csvPack = capture();
  const csv = await runStudentEditionExport('csv', {
    includeVideos: true,
    now: when,
    storage,
    gather: async () => withFilm,
    download: csvPack.download,
  });
  assert.equal(csv.ok, true);
  assert.equal(csvPack.saved.length, 1);
  assert.match(csvPack.saved[0]?.name ?? '', /\.csv$/);
  const csvText = await csvPack.text();
  assert.match(csvText, /Armbar/);
  assert.equal(csvText.includes(onFile.filmFiles?.[0]?.base64 ?? 'missing'), false);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), '2026-10-24');
});

test('a video bundle over the backup cap does not download or move Last backup', async () => {
  const clip = film();
  const storage = memory();
  const pack = capture();
  const result = await runStudentEditionExport('json', {
    includeVideos: true,
    now: when,
    storage,
    gather: async () => ({
      ...source(),
      films: [clip],
      blobs: [{ id: clip.id, blob: new Blob([new Uint8Array(STUDENT_BACKUP_VIDEO_MAX_BYTES + 1)]) }],
    }),
    download: pack.download,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /without video files/);
  assert.equal(pack.saved.length, 0);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');
});

test('drive copy sends only the file that was just exported', async () => {
  const storage = memory();
  saveStudentDriveLink(storage, {
    role: 'academy',
    provider: 'googleDrive',
    folderId: 'academyFolder123',
    folderName: 'GB Ellijay',
    accountLabel: null,
    gymName: 'GB Ellijay',
  });
  saveStudentDriveLink(storage, {
    role: 'personal',
    provider: 'oneDrive',
    folderId: 'personalFolder123',
    folderName: 'My journal',
    accountLabel: 'ada@example.com',
    gymName: '',
  });
  const copied: { folder: string; names: string[] }[] = [];
  const copyFiles = async (target: StudentDriveLink, files: readonly DriveCopyFile[]) => {
    copied.push({ folder: target.folderName, names: files.map((file) => file.name) });
    return { error: '' };
  };
  const pack = capture();
  const json = await runStudentEditionExport('json', {
    includeVideos: false,
    now: when,
    storage,
    gather: async () => source(),
    download: pack.download,
    copyFiles,
  });
  assert.equal(json.ok, true);
  assert.equal(pack.saved.length, 1);
  assert.deepEqual(copied.map((item) => item.names), [
    ['advantage-student-backup-2026-10-24.json'],
    ['advantage-student-backup-2026-10-24.json'],
  ]);
  if (json.ok) {
    assert.match(json.message, /Saved on this phone/);
    assert.match(json.message, /Also saved in GB Ellijay on Google Drive/);
    assert.match(json.message, /Also saved in My journal on OneDrive/);
  }

  const failedPack = capture();
  const failed = await runStudentEditionExport('csv', {
    includeVideos: false,
    now: when,
    storage,
    gather: async () => source(),
    download: failedPack.download,
    copyFiles: async (target, files) => {
      copied.push({ folder: target.folderName, names: files.map((file) => file.name) });
      return { error: 'offline' };
    },
  });
  assert.equal(failed.ok, true);
  assert.equal(failedPack.saved.length, 1);
  assert.match(failedPack.saved[0]?.name ?? '', /\.csv$/);
  assert.deepEqual(copied.slice(-2).map((item) => item.names), [
    ['advantage-student-templates-2026-10-24.csv'],
    ['advantage-student-templates-2026-10-24.csv'],
  ]);
  if (failed.ok) {
    assert.match(failed.message, /Downloaded advantage-student-templates-2026-10-24\.csv/);
    assert.match(failed.message, /Google Drive did not take the copy\. offline/);
    assert.match(failed.message, /OneDrive did not take the copy\. offline/);
  }
});
