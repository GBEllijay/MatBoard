import assert from 'node:assert/strict';
import test from 'node:test';
import { addJournalClip, addJournalEntry, blankStudentReport, loadStudentReport } from './studentEdition.ts';
import { saveAssessment } from './studentAssessment.ts';
import {
  BACKUP_BEFORE_CLEAR,
  BACKUP_NOT_A_BACKUP,
  STUDENT_BACKUP_VIDEO_MAX_BYTES,
  applyBackupToMemory,
  backupVideoTooLargeMessage,
  buildStudentBackup,
  clearStudentMemory,
  parseStudentBackup,
  pdfIncludes,
  progressReportLines,
  selfAssessmentLines,
} from './studentBackup.ts';
import { emptyRankPhotoStore } from './rankPhotos.ts';
import { textToPdf } from './simplePdf.ts';
import type { StudentFilm } from './studentFilm.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function journal(note: string, now: number) {
  return addJournalEntry(
    blankStudentReport(now),
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
    now,
  );
}

test('backup round-trips journal, rank words, assessment, and filmed metadata', async () => {
  let report = journal('hip escape', 20);
  report = {
    ...report,
    profile: { ...report.profile, displayName: 'Ada', belt: 'blue' },
    rank: {
      tapeCount: 2,
      awardedOn: '2024-03-01',
      tapeDates: ['2024-06-01', '2025-01-02', '', ''],
      history: [],
      lineage: ['Coach Kim'],
    },
  };
  report = addJournalClip(report, 'https://example.com/armbar', 'Armbar link', 21);
  const assessment = saveAssessment({ entries: [] }, {
    date: '2026-10-17',
    note: 'calm rounds',
    scores: { guard: 3, passing: 4, takedowns: 2, escapes: 5, submissions: 3, conditioning: 4, mindset: 5 },
  });
  const film: StudentFilm = {
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
  const built = await buildStudentBackup({
    report,
    assessment,
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [film],
    blobs: [{ id: film.id, blob: new Blob(['abcd']) }],
    includeVideos: true,
    now: new Date('2026-10-17T12:00:00Z'),
  });
  assert.equal(built.file.advantage, 'student-journal-backup');
  assert.match(built.csv, /Self-assessment/);
  assert.match(built.csv, /Filmed video/);
  assert.match(built.csv, /Armbar link/);
  assert.equal(pdfIncludes(built.progressPdf, 'Rank and stripes'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Stripe 1'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Journal summary'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Belt progress'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Competition and weight'), true);
  assert.equal(pdfIncludes(built.assessmentPdf, 'Self-assessment'), true);
  assert.equal(pdfIncludes(built.assessmentPdf, 'calm rounds'), true);
  const lines = progressReportLines(report, assessment);
  assert.ok(lines.some((line) => line.includes('Ada')));
  assert.ok(selfAssessmentLines(report, assessment).some((line) => line.includes('Guard')));

  const parsed = parseStudentBackup(built.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.films[0]?.technique, 'Armbar');
  assert.equal(parsed.file.filmFiles?.[0]?.base64.length > 0, true);

  const storage = memory();
  const other = addJournalClip(journal('local only', 5), 'https://example.com/local', 'Local link', 6);
  storage.setItem('matboard.studentEdition.v1', JSON.stringify(other));
  const merged = applyBackupToMemory(storage, parsed.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  const saved = loadStudentReport(storage);
  assert.equal(saved.journal.length, 2);
  assert.equal((saved.clips ?? []).length, 2);
  assert.equal(merged.films.length, 1);
  assert.match(merged.note, /merged/);

  const replaced = applyBackupToMemory(storage, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const after = loadStudentReport(storage);
  assert.equal(after.journal.length, 1);
  assert.match(replaced.note, /replaced/);
  assert.equal(after.profile.displayName, 'Ada');
  assert.equal(after.rank?.tapeCount, 2);
});

test('restore refuses a coach file, and clear warns before it empties the journal', async () => {
  const refused = parseStudentBackup(JSON.stringify({ kind: 'coach-plan', schemaVersion: 2 }));
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, BACKUP_NOT_A_BACKUP);
  assert.match(BACKUP_BEFORE_CLEAR, /backup is recommended/i);

  const storage = memory();
  const report = addJournalClip(journal('keep me', 3), 'https://example.com/a', 'Link', 4);
  storage.setItem('matboard.studentEdition.v1', JSON.stringify(report));
  clearStudentMemory(storage);
  const cleared = loadStudentReport(storage);
  assert.equal(cleared.journal.length, 0);
  assert.equal((cleared.clips ?? []).length, 0);
});

test('a video bundle over the backup cap explains itself', () => {
  assert.match(backupVideoTooLargeMessage(STUDENT_BACKUP_VIDEO_MAX_BYTES + 10), /without video files/);
  const pdf = textToPdf(['Progress report', 'Self-assessment']);
  assert.equal(pdfIncludes(pdf, '%PDF'), true);
  assert.equal(pdfIncludes(pdf, 'Progress report'), true);
});
