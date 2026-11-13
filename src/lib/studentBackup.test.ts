import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket } from './progress/format.ts';
import { addTournament } from './studentCompetition.ts';
import { addJournalClip, addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport, setStudentProfile, setTechniquePolicy } from './studentEdition.ts';
import { setRankBelt, setRankLineage } from './studentRank.ts';
import { loadAssessments, saveAssessment } from './studentAssessment.ts';
import {
  BACKUP_BEFORE_CLEAR,
  BACKUP_NOT_A_BACKUP,
  STUDENT_BACKUP_VIDEO_MAX_BYTES,
  applyBackupToMemory,
  mergeStudentReports,
  STUDENT_BACKUP_KIND,
  STUDENT_BACKUP_VERSION,
  PACKET_EXPORT_LABEL,
  backupFileGuide,
  backupVideoTooLargeMessage,
  buildStudentBackup,
  clearStudentMemory,
  parseStudentBackup,
  pdfIncludes,
  BACKUP_INCLUDE_VIDEOS_KEY,
  journalBackupConfirmation,
  journalBackupFailure,
  readBackupIncludeVideos,
  studentBackupNames,
  studentExportDetail,
  videoFilesLine,
  writeBackupIncludeVideos,
  progressReportLines,
  selfAssessmentLines,
} from './studentBackup.ts';
import { backupStampLabel, readStudentBackupStamp } from './studentBackupStamp.ts';
import { emptyRankPhotoStore } from './rankPhotos.ts';
import { pdfToText, textToPdf } from './simplePdf.ts';
import { setBeltMode } from './beltBook.ts';
import { dismissGoalPrompt } from './studentTools.ts';
import { pdfImageFromRgb } from './pdfRaster.ts';
import { readProfilePortrait, writeProfilePortraitSync } from './profilePortrait.ts';
import { StorageQuotaError } from './storageQuota.ts';
import { readStudentGymLogo, writeStudentGymLogo } from './studentGymMark.ts';
import type { StudentFilm } from './studentFilm.ts';

/** Top-right header mark. PDF origin is the bottom left; 596,778 is the corner inset. */
function headerMark(pdf: Uint8Array, id: string) {
  const text = pdfToText(pdf);
  const match = text.match(new RegExp(String.raw`([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\n\/${id} Do`));
  assert.ok(match, `${id} is drawn in the header`);
  const at = match.index ?? 0;
  return {
    w: Number(match[1]),
    h: Number(match[2]),
    x: Number(match[3]),
    y: Number(match[4]),
    clipped: text.slice(Math.max(0, at - 500), at).includes('\nW\n'),
  };
}

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
    scores: { guard: 3, passing: 4, sweeps: 3, takedowns: 2, escapes: 5, submissions: 3, conditioning: 4, mindset: 5 },
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

test('an undated stripe survives backup and an older backup that omitted dates', async () => {
  let report = journal('third stripe', 40);
  report = {
    ...report,
    profile: { ...report.profile, belt: 'blue' },
    rank: {
      tapeCount: 3,
      awardedOn: '2011-04-02',
      tapeDates: ['2012-01-01', '', '', ''],
      history: [],
      lineage: [],
    },
  };
  const built = await buildStudentBackup({
    report,
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    blobs: [],
    includeVideos: false,
    now: new Date('2026-10-17T12:00:00Z'),
  });
  const lines = progressReportLines(report, { entries: [] }).join('\n');
  assert.match(lines, /Stripe 1: 2012-01-01/);
  assert.match(lines, /^Stripe 2$/m);
  assert.match(lines, /^Stripe 3$/m);
  assert.equal(lines.includes('Invalid Date'), false);
  assert.equal(pdfIncludes(built.progressPdf, 'Stripe 1: 2012-01-01'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Stripe 2'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'No date'), false);
  assert.equal(pdfIncludes(built.progressPdf, 'Invalid Date'), false);
  assert.match(built.csv, /1 2012-01-01/);
  assert.equal(built.csv.includes('No date'), false);
  assert.equal(built.csv.includes('Invalid Date'), false);

  const parsed = parseStudentBackup(built.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const storage = memory();
  storage.setItem('matboard.studentEdition.v1', JSON.stringify(journal('local', 1)));
  applyBackupToMemory(storage, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const restored = loadStudentReport(storage);
  assert.equal(restored.rank?.tapeCount, 3);
  assert.deepEqual(restored.rank?.tapeDates, ['2012-01-01', '', '', '']);

  const raw = JSON.parse(built.json) as { report: { rank?: { tapeDates?: unknown } } };
  delete raw.report.rank?.tapeDates;
  const older = parseStudentBackup(JSON.stringify(raw));
  assert.equal(older.ok, true);
  if (!older.ok) return;
  applyBackupToMemory(storage, older.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const fromOlder = loadStudentReport(storage);
  assert.equal(fromOlder.rank?.tapeCount, 3);
  assert.deepEqual(fromOlder.rank?.tapeDates, ['', '', '', '']);
  assert.equal(fromOlder.profile.belt, 'blue');
});

test('restore refuses a coach file, and clear warns before it empties the journal', async () => {
  const refused = parseStudentBackup(JSON.stringify({ kind: 'coach-plan', schemaVersion: 2 }));
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, BACKUP_NOT_A_BACKUP);
  assert.match(BACKUP_BEFORE_CLEAR, /backup is recommended/i);

  const storage = memory();
  const report = addJournalClip(journal('keep me', 3), 'https://example.com/a', 'Link', 4);
  storage.setItem('matboard.studentEdition.v1', JSON.stringify(report));
  storage.setItem('advantage.proUnlocked', '1');
  storage.setItem('advantage.coachUnlocked', '1');
  storage.setItem('advantage.whiteUnlocked', '1');
  storage.setItem('advantage.studentUnlocked', '1');
  storage.setItem('advantage.studentEditionUnlocked', '1');
  storage.setItem('matboard.roster.v1', '{"students":[{"name":"Keep"}]}');
  storage.setItem('matboard.pro.googleDriveFolder.v1', '{"folderId":"keep-folder"}');
  storage.setItem('matboard.studentEdition.academyDrive.v1', '{"folderId":"academy"}');
  clearStudentMemory(storage);
  const cleared = loadStudentReport(storage);
  assert.equal(cleared.journal.length, 0);
  assert.equal((cleared.clips ?? []).length, 0);
  assert.equal(storage.getItem('advantage.proUnlocked'), '1');
  assert.equal(storage.getItem('advantage.coachUnlocked'), '1');
  assert.equal(storage.getItem('advantage.whiteUnlocked'), '1');
  assert.equal(storage.getItem('advantage.studentUnlocked'), '1');
  assert.equal(storage.getItem('advantage.studentEditionUnlocked'), '1');
  assert.match(storage.getItem('matboard.roster.v1') ?? '', /Keep/);
  assert.match(storage.getItem('matboard.pro.googleDriveFolder.v1') ?? '', /keep-folder/);
  assert.match(storage.getItem('matboard.studentEdition.academyDrive.v1') ?? '', /academy/);
  assert.equal(storage.getItem('matboard.studentEdition.scouting.v1'), JSON.stringify({ version: 1, cards: [] }));
});

test('newline lineage migrates and both instructors survive backup and restore', async () => {
  const seeded = setRankLineage(blankStudentReport(8), ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)'], 9);
  const raw = JSON.parse(exportProgressPacket(seeded)) as { rank: { lineage: unknown } };
  raw.rank.lineage = 'Mestre Paulo Reis (mock)\nProf. Elena Duarte (mock)';
  const storage = memory();
  storage.setItem('matboard.studentEdition.v1', JSON.stringify(raw));
  const loaded = loadStudentReport(storage);
  assert.deepEqual(loaded.rank?.lineage, ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)']);
  const built = await buildStudentBackup({
    report: loaded,
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    now: new Date('2026-10-23T12:00:00Z'),
  });
  assert.deepEqual(built.file.report.rank?.lineage, ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)']);
  const lines = progressReportLines(built.file.report, { entries: [] });
  assert.ok(lines.some((line) => line.includes('Mestre Paulo Reis (mock)')));
  assert.ok(lines.some((line) => line.includes('Prof. Elena Duarte (mock)')));
  const parsed = parseStudentBackup(built.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const restored = memory();
  applyBackupToMemory(restored, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.deepEqual(loadStudentReport(restored).rank?.lineage, ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)']);
  const phone = memory();
  phone.setItem('matboard.studentEdition.v1', JSON.stringify(journal('only here', 4)));
  applyBackupToMemory(phone, parsed.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  const merged = loadStudentReport(phone);
  assert.equal(merged.journal.length, 1);
  assert.match(merged.journal[0]?.body ?? '', /only here/);
  assert.deepEqual(merged.rank?.lineage, ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)']);
});

test('the student packet is the restore file, and the spreadsheet and PDFs stay separate', () => {
  const names = studentBackupNames('2026-10-24');
  const guide = backupFileGuide('2026-10-24');
  assert.deepEqual(
    guide.map((file) => file.name),
    [names.packet, names.csv, names.progressPdf, names.assessmentPdf],
  );
  assert.equal(guide[0]?.title, PACKET_EXPORT_LABEL);
  assert.equal(guide[0]?.detail, studentExportDetail('packet', '2026-10-24'));
  assert.match(guide[0]?.detail ?? '', /Downloads advantage-student-packet-2026-10-24\.advantage/);
  assert.match(guide[0]?.detail ?? '', /Merge or Replace/);
  assert.match(guide[1]?.detail ?? '', /Spreadsheet/);
  assert.match(guide[1]?.detail ?? '', /cannot restore/);
  assert.match(guide[2]?.detail ?? '', /printable/);
  assert.match(guide[3]?.detail ?? '', /self-assessment/);
  assert.equal(studentExportDetail('json', '2026-10-24').includes(names.json), true);
  assert.match(videoFilesLine(false), /^Video files: off/);
  assert.match(videoFilesLine(true), /^Video files: on/);
  assert.match(videoFilesLine(true), /student packet/);
  assert.match(journalBackupConfirmation('advantage-student-backup-2026-10-24.json', false), /Backup saved/);
  assert.match(journalBackupConfirmation('advantage-student-backup-2026-10-24.json', false), /not included/);
  assert.match(journalBackupConfirmation('advantage-student-backup-2026-10-24.json', true), /are included/);
  assert.match(journalBackupFailure('Those video files are too large for one backup (49 MB).'), /^Backup did not finish\./);
});

test('include video files stays off until the student turns it on', () => {
  const storage = memory();
  assert.equal(readBackupIncludeVideos(storage), false);
  assert.equal(storage.getItem(BACKUP_INCLUDE_VIDEOS_KEY), null);
  writeBackupIncludeVideos(storage, true);
  assert.equal(readBackupIncludeVideos(storage), true);
  writeBackupIncludeVideos(storage, false);
  assert.equal(readBackupIncludeVideos(storage), false);
  assert.equal(storage.getItem(BACKUP_INCLUDE_VIDEOS_KEY), '0');
  assert.equal(readBackupIncludeVideos(null), false);
});

test('only the JSON backup updates the last-backup stamp', async () => {
  const storage = memory();
  const report = journal('stamp me', 12);
  const input = {
    report,
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    now: new Date('2026-10-24T15:00:00Z'),
    stampStorage: storage,
  };
  await buildStudentBackup({ ...input, recordStamp: false });
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');
  await buildStudentBackup(input);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), '2026-10-24');
});

test('a video bundle over the backup cap explains itself', () => {
  assert.match(backupVideoTooLargeMessage(STUDENT_BACKUP_VIDEO_MAX_BYTES + 10), /without video files/);
  const pdf = textToPdf(['Progress report', 'Self-assessment']);
  assert.equal(pdfIncludes(pdf, '%PDF'), true);
  assert.equal(pdfIncludes(pdf, 'Progress report'), true);
});

test('an older backup splits a clear division and weight class and keeps an unclear one', () => {
  const report = addTournament(
    blankStudentReport(30),
    {
      name: 'Legacy Open',
      date: '2026-12-01',
      location: 'Atlanta',
      division: 'Adult Blue / Feather',
      deadline: '',
      link: '',
      status: 'considering',
      targetWeight: '',
      targetUnit: 'lb',
    },
    31,
  );
  const packet = JSON.parse(exportProgressPacket(report)) as {
    competition: { tournaments: { division: string; weightClass?: string }[] };
  };
  packet.competition.tournaments[0].division = 'Adult Blue / Feather';
  delete packet.competition.tournaments[0].weightClass;
  const backup = {
    advantage: 'student-journal-backup',
    version: 1,
    exportedAt: '2026-10-24T00:00:00.000Z',
    report: packet,
    assessment: { entries: [] },
    scouting: [],
    films: [],
  };
  const parsed = parseStudentBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.report.competition?.tournaments[0].division, 'Adult Blue');
  assert.equal(parsed.file.report.competition?.tournaments[0].weightClass, 'Feather');
  const lines = progressReportLines(parsed.file.report, { entries: [] });
  assert.ok(lines.some((line) => line.includes('Adult Blue · Feather')));

  packet.competition.tournaments[0].division = 'Adult Black Medium Heavy';
  delete packet.competition.tournaments[0].weightClass;
  const plain = parseStudentBackup(JSON.stringify(backup));
  assert.equal(plain.ok, true);
  if (!plain.ok) return;
  assert.equal(plain.file.report.competition?.tournaments[0].division, 'Adult Black');
  assert.equal(plain.file.report.competition?.tournaments[0].weightClass, 'Medium Heavy');
  assert.ok(progressReportLines(plain.file.report, { entries: [] }).some((line) => line.includes('Adult Black · Medium Heavy')));

  packet.competition.tournaments[0].division = 'Saturday squad';
  delete packet.competition.tournaments[0].weightClass;
  const unclear = parseStudentBackup(JSON.stringify(backup));
  assert.equal(unclear.ok, true);
  if (!unclear.ok) return;
  assert.equal(unclear.file.report.competition?.tournaments[0].division, 'Saturday squad');
  assert.equal(unclear.file.report.competition?.tournaments[0].weightClass, '');
});

test('selfie follows its switch; new backups and progress PDFs never include the gym logo', async () => {
  const selfie = 'data:image/jpeg;base64,AAAA';
  const logo = 'data:image/png;base64,BBBB';
  const report = setStudentProfile(blankStudentReport(3), { displayName: 'Ada', gymName: 'GB Ellijay' }, 4);
  const base = {
    report,
    assessment: { entries: [] as [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    now: new Date('2026-10-26T12:00:00Z'),
    recordStamp: false,
  };
  const off = await buildStudentBackup({
    ...base,
    marks: { includeSelfie: false, includeLogo: false, selfie, gymLogo: logo },
  });
  assert.equal(off.file.portrait, undefined);
  assert.equal(off.file.gymLogo, undefined);
  assert.equal(JSON.parse(off.json).portrait, undefined);
  assert.equal(JSON.parse(off.json).gymLogo, undefined);
  assert.equal(pdfToText(off.progressPdf).includes('/Selfie'), false);
  assert.equal(pdfToText(off.progressPdf).includes('/GymLogo'), false);

  const art = {
    selfie: await pdfImageFromRgb('Selfie', 1, 1, new Uint8Array([9, 8, 7])),
    gymLogo: await pdfImageFromRgb('GymLogo', 1, 1, new Uint8Array([1, 2, 3])),
  };
  assert.ok(art.selfie);
  assert.ok(art.gymLogo);
  const on = await buildStudentBackup({
    ...base,
    marks: { includeSelfie: true, includeLogo: true, selfie, gymLogo: logo, art },
  });
  assert.equal(on.file.portrait, selfie);
  assert.equal(on.file.gymLogo, undefined);
  assert.equal(JSON.parse(on.json).gymLogo, undefined);
  assert.equal(pdfToText(on.progressPdf).includes('/Selfie Do'), true);
  assert.equal(pdfToText(on.progressPdf).includes('/GymLogo'), false);
  assert.equal(pdfIncludes(on.progressPdf, 'GB Ellijay'), true);
  const adultPhoto = headerMark(on.progressPdf, 'Selfie');
  assert.equal(adultPhoto.x + adultPhoto.w, 596);
  assert.equal(adultPhoto.y + adultPhoto.h, 778);
  assert.ok(adultPhoto.clipped);

  const kidsReport = setBeltMode(
    setStudentProfile(blankStudentReport(5), { displayName: 'Sam', gymName: 'GB Ellijay' }, 6),
    'kids',
    7,
  );
  const kids = await buildStudentBackup({
    ...base,
    report: kidsReport,
    marks: { includeSelfie: false, includeLogo: true, selfie, gymLogo: logo, art },
  });
  assert.equal(kids.file.portrait, undefined);
  assert.equal(kids.file.gymLogo, undefined);
  assert.equal(pdfIncludes(kids.progressPdf, 'Sam'), true);
  assert.equal(pdfIncludes(kids.progressPdf, 'GB Ellijay'), true);
  assert.equal(pdfToText(kids.progressPdf).includes('/Selfie'), false);
  assert.equal(pdfToText(kids.progressPdf).includes('/GymLogo'), false);

  const legacy = parseStudentBackup(off.json);
  assert.equal(legacy.ok, true);
  if (!legacy.ok) return;
  assert.equal(legacy.file.portrait, undefined);
  assert.equal(legacy.file.gymLogo, undefined);
  const junk = JSON.parse(off.json) as { portrait?: string; gymLogo?: string };
  junk.portrait = 'https://example.com/selfie.jpg';
  junk.gymLogo = 'not-a-logo';
  const ignored = parseStudentBackup(JSON.stringify(junk));
  assert.equal(ignored.ok, true);
  if (!ignored.ok) return;
  assert.equal(ignored.file.portrait, undefined);
  assert.equal(ignored.file.gymLogo, undefined);
  assert.equal(ignored.file.report.profile.displayName, 'Ada');

  // An old backup that still carries gymLogo must parse, and restore must ignore it.
  const oldJson = JSON.parse(on.json) as { gymLogo?: string; portrait?: string };
  oldJson.gymLogo = logo;
  const oldBackup = parseStudentBackup(JSON.stringify(oldJson));
  assert.equal(oldBackup.ok, true);
  if (!oldBackup.ok) return;
  assert.equal(oldBackup.file.gymLogo, logo);

  const existing = 'data:image/png;base64,CCCC';
  const storage = memory();
  writeStudentGymLogo(existing, storage);
  applyBackupToMemory(storage, oldBackup.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(storage), selfie);
  assert.equal(readStudentGymLogo(storage), existing, 'restore does not overwrite a logo already on this phone');

  const empty = memory();
  applyBackupToMemory(empty, oldBackup.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readStudentGymLogo(empty), null, 'restore does not write the ignored gymLogo field');
  assert.equal(readProfilePortrait(empty), selfie);

  writeStudentGymLogo(existing, empty);
  clearStudentMemory(empty);
  assert.equal(readProfilePortrait(empty), null);
  assert.equal(readStudentGymLogo(empty), null);
});


test('a profile photo rides in a backup only with the switch, and merge does not replace one already here', async () => {
  const selfie = 'data:image/jpeg;base64,AAAA';
  const other = 'data:image/jpeg;base64,BBBB';
  const report = setStudentProfile(blankStudentReport(3), { displayName: 'Ada', gymName: 'GB Ellijay' }, 4);
  const base = {
    report,
    assessment: { entries: [] as [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    recordStamp: false,
  };
  const hidden = await buildStudentBackup({ ...base, marks: { includeSelfie: false, includeLogo: false, selfie } });
  assert.equal(JSON.parse(hidden.json).portrait, undefined);
  const emptyPhone = memory();
  applyBackupToMemory(emptyPhone, hidden.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(emptyPhone), null);

  const kept = memory();
  writeProfilePortraitSync(other, kept);
  applyBackupToMemory(kept, hidden.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(kept), other);

  const shown = await buildStudentBackup({ ...base, marks: { includeSelfie: true, includeLogo: false, selfie } });
  const parsed = parseStudentBackup(shown.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.portrait, selfie);
  const restored = memory();
  const merged = applyBackupToMemory(restored, parsed.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(restored), selfie);
  assert.match(merged.note, /Saved on this phone/);
  assert.doesNotMatch(merged.note, /Cloud/);

  applyBackupToMemory(restored, { ...parsed.file, portrait: other }, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(restored), selfie);
  applyBackupToMemory(restored, { ...parsed.file, portrait: other }, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(restored), other);

  const legacy = parseStudentBackup(JSON.stringify({ ...JSON.parse(shown.json), portrait: undefined }));
  assert.equal(legacy.ok, true);
  if (!legacy.ok) return;
  const still = memory();
  writeProfilePortraitSync(selfie, still);
  applyBackupToMemory(still, legacy.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readProfilePortrait(still), selfie);

  const broken = JSON.parse(shown.json) as { portrait?: string };
  broken.portrait = 'data:image/gif;base64,AAAA';
  const dropped = parseStudentBackup(JSON.stringify(broken));
  assert.equal(dropped.ok, true);
  if (!dropped.ok) return;
  assert.equal(dropped.file.portrait, undefined);

  const full = memory();
  const throwing = {
    getItem: full.getItem,
    setItem: (key: string, value: string) => {
      if (key === 'matboard.studentPortrait.v1') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      full.setItem(key, value);
    },
    removeItem: full.removeItem,
  };
  assert.throws(
    () => applyBackupToMemory(throwing, parsed.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} }),
    (error) => error instanceof StorageQuotaError,
  );
  assert.equal(readProfilePortrait(full), null);
  assert.equal(loadStudentReport(full).profile.displayName, 'Ada');
});

test('an older journal backup still loads its self-assessment', async () => {
  const report = blankStudentReport(4);
  const older = {
    advantage: 'student-journal-backup',
    version: 1,
    exportedAt: '2024-05-01T00:00:00.000Z',
    report: JSON.parse(exportProgressPacket(report)),
    assessment: {
      entries: [
        {
          id: 'old.assess',
          date: '2024-05-01',
          note: 'kept from an older phone',
          scores: { guard: 1, passing: 2, takedowns: 3, escapes: 4, submissions: 5, conditioning: 1, mindset: 2 },
        },
      ],
    },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    coachPlan: null,
    coachFeedback: null,
    films: [],
  };
  const parsed = parseStudentBackup(JSON.stringify(older));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.assessment.entries[0]?.note, 'kept from an older phone');
  const storage = memory();
  applyBackupToMemory(storage, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const loaded = loadAssessments(storage);
  assert.equal(loaded.entries[0]?.date, '2024-05-01');
  assert.equal(loaded.entries[0]?.scores.guard, 1);
  assert.equal(loaded.entries[0]?.scores.mindset, 2);
  const built = await buildStudentBackup({
    report: parsed.file.report,
    assessment: loaded,
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    blobs: [],
    includeVideos: false,
    now: new Date('2024-05-02T00:00:00Z'),
    recordStamp: false,
  });
  assert.match(built.json, /kept from an older phone/);
  assert.match(built.csv, /kept from an older phone/);
  assert.equal(pdfIncludes(built.assessmentPdf, 'kept from an older phone'), true);
  assert.equal(pdfIncludes(built.assessmentPdf, 'Guard'), true);

  const withoutAssessment = { ...older, assessment: undefined };
  const missing = parseStudentBackup(JSON.stringify(withoutAssessment));
  assert.equal(missing.ok, true);
  if (!missing.ok) return;
  assert.deepEqual(missing.file.assessment.entries, []);
});

test('personal goal dismissals travel in a backup for this student only', () => {
  const local = dismissGoalPrompt(setRankBelt(blankStudentReport(1), 'brown', 2), 'Lineage and history', 3);
  const incoming = dismissGoalPrompt(structuredClone(local), 'Giving back to the gym', 4);
  const merged = mergeStudentReports(local, incoming);
  assert.deepEqual(merged.dismissedGoalPrompts, ['Lineage and history', 'Giving back to the gym']);
  const foreign = dismissGoalPrompt(
    { ...structuredClone(blankStudentReport(5)), studentId: 'other-student' },
    'Competition or rolling goals',
    6,
  );
  const kept = mergeStudentReports(local, foreign);
  assert.equal(kept.studentId, local.studentId);
  assert.deepEqual(kept.dismissedGoalPrompts, ['Lineage and history']);
  const file = {
    advantage: STUDENT_BACKUP_KIND,
    version: STUDENT_BACKUP_VERSION,
    exportedAt: '2026-11-07T00:00:00.000Z',
    report: JSON.parse(exportProgressPacket(merged)),
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    coachPlan: null,
    coachFeedback: null,
    films: [],
  };
  const parsed = parseStudentBackup(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.file.report.dismissedGoalPrompts, ['Lineage and history', 'Giving back to the gym']);
  const storage = memory();
  saveStudentReport(storage, local);
  const applied = applyBackupToMemory(storage, parsed.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.match(applied.note, /merged/);
  assert.deepEqual(loadStudentReport(storage).dismissedGoalPrompts, ['Lineage and history', 'Giving back to the gym']);
  const olderFile = { ...file, report: JSON.parse(exportProgressPacket(blankStudentReport(1))) };
  delete (olderFile.report as { dismissedGoalPrompts?: unknown }).dismissedGoalPrompts;
  const older = parseStudentBackup(JSON.stringify(olderFile));
  assert.equal(older.ok, true);
  if (!older.ok) return;
  assert.equal(older.file.report.dismissedGoalPrompts, undefined);
  applyBackupToMemory(storage, older.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.deepEqual(loadStudentReport(storage).dismissedGoalPrompts, ['Lineage and history', 'Giving back to the gym']);
});

test('a newer empty phone keeps a backup name, gym, start date, explicit toggles, rank, and injury', async () => {
  let saved = setStudentProfile(blankStudentReport(10), { displayName: 'Alex', gymName: 'GB Ellijay', startedOn: '2014-03-01' }, 11);
  saved = setRankBelt(saved, 'purple', 12);
  saved = setTechniquePolicy(saved, 'straightAnkleLock', true, 13);
  saved = setTechniquePolicy(saved, 'wristLocks', false, 14);
  saved = setTechniquePolicy(saved, 'legLocks', false, 15);
  saved = setTechniquePolicy(saved, 'heelHooks', false, 16);
  saved = setTechniquePolicy(saved, 'competition', false, 17);
  assert.equal(saved.profile.techniquePolicy?.wristLocks, false);
  assert.equal(saved.profile.techniquePolicy?.competition, false);
  saved = addJournalEntry(
    saved,
    {
      date: '2026-10-11',
      className: 'Gi',
      gameTag: '',
      techniques: [],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'ankle',
      minutes: 300,
      injury: { area: 'Left ankle', note: 'tweak' },
    },
    18,
  );
  const built = await buildStudentBackup({
    report: saved,
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    blobs: [],
    includeVideos: false,
    now: new Date('2026-10-12T00:00:00Z'),
    recordStamp: false,
  });
  assert.match(built.json, /"displayName":"Alex"/);
  assert.match(built.json, /"gymName":"GB Ellijay"/);
  assert.match(built.json, /"startedOn":"2014-03-01"/);
  assert.match(built.json, /"wristLocks":false/);
  assert.match(built.json, /Left ankle/);
  const parsed = parseStudentBackup(built.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.report.profile.displayName, 'Alex');
  assert.equal(parsed.file.report.profile.techniquePolicy?.wristLocks, false);
  assert.equal(parsed.file.report.profile.techniquePolicy?.straightAnkleLock, true);
  assert.equal(parsed.file.report.journal[0]?.injury?.area, 'Left ankle');
  assert.equal(parsed.file.report.journal[0]?.minutes, 300);
  assert.equal(parsed.file.report.profile.belt, 'purple');

  const fresh = blankStudentReport(Date.parse('2026-11-08T00:00:00Z'));
  assert.ok(fresh.updatedAt > parsed.file.report.updatedAt);
  const merged = mergeStudentReports(fresh, parsed.file.report);
  assert.equal(merged.profile.displayName, 'Alex');
  assert.equal(merged.profile.gymName, 'GB Ellijay');
  assert.equal(merged.profile.startedOn, '2014-03-01');
  assert.equal(merged.profile.belt, 'purple');
  assert.equal(merged.profile.techniquePolicy?.heelHooks, false);
  assert.equal(merged.rank.tapeCount, saved.rank?.tapeCount ?? 0);
  assert.equal(merged.journal.some((entry) => entry.injury?.area === 'Left ankle'), true);

  const phone = memory();
  const localOnly = addJournalEntry(
    fresh,
    { date: '2026-01-02', className: 'Open mat', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'stays', minutes: 40 },
    fresh.updatedAt,
  );
  saveStudentReport(phone, localOnly);
  applyBackupToMemory(phone, parsed.file, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  const afterMerge = loadStudentReport(phone);
  assert.equal(afterMerge.profile.displayName, 'Alex');
  assert.equal(afterMerge.journal.some((entry) => entry.notes === undefined && entry.body.includes('stays') || entry.body.includes('stays')), true);
  assert.equal(afterMerge.journal.some((entry) => entry.injury?.area === 'Left ankle'), true);
  const refreshed = loadStudentReport(phone);
  assert.equal(refreshed.profile.gymName, 'GB Ellijay');
  assert.equal(phone.getItem('advantage.studentUnlocked'), null);
  assert.equal(phone.getItem('advantage.entitlement.token'), null);

  const replacePhone = memory();
  saveStudentReport(replacePhone, setStudentProfile(blankStudentReport(1), { displayName: 'Keep me', gymName: 'Other gym' }, 2));
  applyBackupToMemory(replacePhone, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const replaced = loadStudentReport(replacePhone);
  assert.equal(replaced.profile.displayName, 'Alex');
  assert.equal(replaced.profile.gymName, 'GB Ellijay');
  assert.equal(replaced.journal.some((entry) => entry.body.includes('stays')), false);
  assert.equal(replaced.profile.techniquePolicy?.competition, false);

  const old = {
    advantage: STUDENT_BACKUP_KIND,
    version: STUDENT_BACKUP_VERSION,
    exportedAt: '2024-01-01T00:00:00.000Z',
    report: JSON.parse(exportProgressPacket(setStudentProfile(blankStudentReport(3), { displayName: 'Old', gymName: 'Old gym', startedOn: '2010-01-01' }, 4))),
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    coachPlan: null,
    coachFeedback: null,
    films: [],
  };
  delete (old.report as { profile: { techniquePolicy?: unknown } }).profile.techniquePolicy;
  const oldParsed = parseStudentBackup(JSON.stringify(old));
  assert.equal(oldParsed.ok, true);
  if (!oldParsed.ok) return;
  assert.equal(oldParsed.file.report.profile.techniquePolicy, undefined);
  assert.equal(oldParsed.file.report.profile.displayName, 'Old');
});
