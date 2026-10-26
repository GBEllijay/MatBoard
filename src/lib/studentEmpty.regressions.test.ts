/**
 * A new student and a cleared student stay empty.
 * The stress-test file is demo-only. Next event follows the soonest real tournament.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { competitionOf, weightCountdown } from './progress/competition.ts';
import { emptyRankPhotoStore } from './rankPhotos.ts';
import {
  buildStudentBackup,
  clearStudentMemory,
  pdfIncludes,
} from './studentBackup.ts';
import { backupStampLabel, noteStudentBackupBuilt, readStudentBackupStamp } from './studentBackupStamp.ts';
import { addTournament } from './studentCompetition.ts';
import {
  installStudentMockGuard,
  reconcileStudentStorage,
  resetStudentMockGuardForTests,
  STUDENT_FILE_STORAGE_KEY,
} from './studentDemo.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport, setStudentProfile, STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { setRankBelt, setRankTapeCount } from './studentRank.ts';
import { ADD_TOURNAMENT_LABEL, competitorHubSummary, NO_EVENT_LABEL, WEIGHT_UNSET_LABEL } from './studentHubMenu.ts';
import { progressReportLines } from './studentReport.ts';
import {
  ASSESSMENT_STORAGE_KEY,
  emptyAssessments,
  loadAssessments,
  saveAssessment,
  writeAssessments,
  type AssessmentScores,
} from './studentAssessment.ts';
import { addScoutingCard, exportScoutingCsv, loadScouting, saveScouting } from './studentScouting.ts';
import type { TournamentDraft } from './studentCompetition.ts';

const handoff = readFileSync(new URL('./fixtures/send-to-coach-handoff.json', import.meta.url), 'utf8');

const scores: AssessmentScores = {
  guard: 4,
  passing: 3,
  takedowns: 2,
  escapes: 3,
  submissions: 4,
  conditioning: 2,
  mindset: 5,
};

function memory() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem(key: string) {
      if (this !== storage) throw new TypeError('removeItem must be called on the store');
      store.delete(key);
    },
  };
  return storage;
}

function meet(name: string, date: string): TournamentDraft {
  return {
    name,
    date,
    location: 'Atlanta',
    division: 'Adult Blue',
    weightClass: 'Middle',
    deadline: '',
    link: '',
    status: 'entered',
    targetWeight: '170',
    targetUnit: 'lb',
  };
}

test('a fresh load of the stress-test file shows a white belt and no mock rows', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  storage.setItem(STUDENT_EDITION_STORAGE_KEY, handoff);
  const fresh = loadStudentReport(storage);
  const text = JSON.stringify(fresh);
  assert.equal(fresh.profile.belt, 'white');
  assert.equal(fresh.rank?.tapeCount, 0);
  assert.equal(fresh.journal.length, 0);
  assert.equal(fresh.competition?.tournaments.length, 0);
  assert.equal(fresh.competition?.weighIns.length, 0);
  assert.equal(fresh.competition?.results.length, 0);
  assert.equal(fresh.rank?.lineage?.length ?? 0, 0);
  assert.equal(text.includes('Pan Pacific'), false);
  assert.equal(text.includes('(mock)'), false);
  assert.equal(text.includes('Dario Kent'), false);
  assert.equal(storage.getItem(STUDENT_EDITION_STORAGE_KEY), null);

  const empty = loadStudentReport(memory());
  assert.equal(empty.profile.belt, 'white');
  assert.equal(empty.competition?.tournaments.length, 0);
});

test('clear drops the mock journal, self-assessment, last backup, and every export', async () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  storage.setItem(STUDENT_EDITION_STORAGE_KEY, handoff);
  writeAssessments(storage, saveAssessment(emptyAssessments(), { date: '2026-10-20', note: 'previous check-in', scores }, 4));
  saveScouting(storage, addScoutingCard([], { name: 'Dario Kent (mock)', gym: 'Mock Gym', belt: 'Black', weightClass: 'Middle', group: 'weight', style: '', notes: 'pressure passer' }, 5));
  noteStudentBackupBuilt(new Date('2026-10-24T15:00:00.000Z'), storage);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), '2026-10-24');
  assert.equal(loadAssessments(storage).entries.length, 1);

  clearStudentMemory(storage);
  storage.setItem(STUDENT_EDITION_STORAGE_KEY, handoff);

  const report = loadStudentReport(storage);
  const assessment = loadAssessments(storage);
  const scouting = loadScouting(storage);
  assert.equal(report.profile.belt, 'white');
  assert.equal(report.journal.length, 0);
  assert.equal(assessment.entries.length, 0);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');
  assert.equal(readStudentBackupStamp(storage), null);

  const csv = exportScoutingCsv(scouting);
  assert.equal(csv.includes('Dario Kent'), false);
  assert.equal(csv.includes('(mock)'), false);
  assert.equal(scouting.length, 0);

  const lines = progressReportLines(report, assessment, { scouting }).join('\n');
  assert.equal(lines.includes('Pan Pacific'), false);
  assert.equal(lines.includes('(mock)'), false);
  assert.equal(lines.includes('previous check-in'), false);
  assert.match(lines, /Stripes: 0/);
  assert.match(lines, /No tournaments recorded/);
  assert.match(lines, /No journal cards/);
  assert.match(lines, /No weigh-ins/);

  const built = await buildStudentBackup({
    report,
    assessment,
    scouting,
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    now: new Date('2026-10-25T12:00:00.000Z'),
    recordStamp: false,
  });
  assert.equal(built.json.includes('Pan Pacific'), false);
  assert.equal(built.json.includes('Dario Kent'), false);
  assert.equal(built.json.includes('previous check-in'), false);
  assert.equal(built.json.includes('(mock)'), false);
  assert.equal(built.csv.includes('Pan Pacific'), false);
  assert.equal(built.csv.includes('Dario Kent'), false);
  assert.equal(pdfIncludes(built.progressPdf, 'Pan Pacific'), false);
  assert.equal(pdfIncludes(built.progressPdf, 'Dario Kent'), false);
  assert.equal(pdfIncludes(built.progressPdf, '(mock)'), false);
  assert.equal(pdfIncludes(built.assessmentPdf, 'previous check-in'), false);
});

test('next event and the weight countdown use the soonest real tournament', () => {
  resetStudentMockGuardForTests();
  const today = '2026-10-25';
  let report = addTournament(blankStudentReport(1), meet('Pan Pacific Championship (mock)', '2026-11-01'), 2);
  report = addTournament(report, meet('Spring Open', '2026-11-20'), 3);
  report = addTournament(report, meet('Winter Open', '2026-12-02'), 4);

  const summary = competitorHubSummary(report, today, { includeMock: false });
  assert.equal(summary.eventName, 'Spring Open');
  assert.equal(summary.next, 'Next: Spring Open · 26d');
  const countdown = weightCountdown(competitionOf(report), today, { includeMock: false });
  assert.equal(countdown?.source, 'tournament');
  assert.equal(countdown?.tournamentName, 'Spring Open');
  assert.equal(countdown?.date, '2026-11-20');

  const onlyMock = addTournament(blankStudentReport(1), meet('Pan Pacific Championship (mock)', '2026-11-14'), 2);
  assert.equal(competitorHubSummary(onlyMock, today, { includeMock: false }).next, NO_EVENT_LABEL);
  assert.equal(competitorHubSummary(onlyMock, today, { includeMock: false }).eventName, '');
  assert.equal(weightCountdown(competitionOf(onlyMock), today, { includeMock: false }), null);
  assert.equal(weightCountdown(competitionOf(onlyMock), today, { includeMock: true })?.tournamentName, 'Pan Pacific Championship (mock)');
  assert.equal(ADD_TOURNAMENT_LABEL, 'Add a tournament');
});

const simScores: AssessmentScores = {
  guard: 3,
  passing: 3,
  takedowns: 3,
  escapes: 4,
  submissions: 3,
  conditioning: 3,
  mindset: 4,
};

function simAthletePacket(): string {
  let report = setStudentProfile(blankStudentReport(1), { displayName: 'Sim Athlete Coach Two', gymName: 'Sim Gym Alpha' }, 2);
  report = setRankTapeCount(setRankBelt(report, 'blue', 3), 3, 4);
  report = addTournament(report, meet('Sim Open Holiday Classic', '2027-01-09'), 5);
  return JSON.stringify(report);
}

function simHistory(): string {
  let state = saveAssessment(
    emptyAssessments(),
    {
      date: '2026-10-24',
      note: 'Mock self-assessment before Pan Pacific.',
      scores: { guard: 5, passing: 4, takedowns: 4, escapes: 5, submissions: 4, conditioning: 4, mindset: 5 },
    },
    1,
  );
  state = saveAssessment(state, { date: '2026-10-25', note: 'Drill the pass. Stop reaching.', scores: simScores }, 2);
  state = saveAssessment(state, { date: '2026-10-26', note: 'Drill the pass. Stop reaching.', scores: simScores }, 3);
  return JSON.stringify(state);
}

test('clear erases sim self-assessment history so backups, the pdf, and the scouting Me have none', async () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '?student=1');
  writeAssessments(
    storage,
    saveAssessment(emptyAssessments(), { date: '2026-10-20', note: 'my own check-in', scores: simScores }, 4),
  );
  noteStudentBackupBuilt(new Date('2026-10-22T15:00:00.000Z'), storage);
  clearStudentMemory(storage);
  storage.setItem(STUDENT_FILE_STORAGE_KEY, simAthletePacket());
  storage.setItem(ASSESSMENT_STORAGE_KEY, simHistory());
  storage.setItem('matboard.studentEdition.lastBackupAt.v1', '2026-10-25T12:00:00.000Z');

  const report = loadStudentReport(storage);
  const assessment = loadAssessments(storage);
  assert.equal(report.profile.belt, 'white');
  assert.equal(report.profile.displayName, '');
  assert.equal(report.rank?.tapeCount, 0);
  assert.equal(assessment.entries.length, 0);
  assert.equal(assessment.entries.some((entry) => entry.date === '2026-10-26'), false);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');
  assert.equal(assessment.entries[0]?.scores, undefined);

  const lines = progressReportLines(report, assessment, { scouting: [] }).join('\n');
  assert.equal(lines.includes('Sim Athlete'), false);
  assert.equal(lines.includes('Holiday Classic'), false);
  assert.equal(lines.includes('Mock self-assessment'), false);
  assert.equal(lines.includes('2026-10-26'), false);
  assert.match(lines, /Stripes: 0/);

  const built = await buildStudentBackup({
    report,
    assessment,
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    now: new Date('2026-10-26T12:00:00.000Z'),
    recordStamp: false,
  });
  assert.equal(built.json.includes('Sim Athlete'), false);
  assert.equal(built.json.includes('Mock self-assessment'), false);
  assert.equal(built.json.includes('2026-10-24'), false);
  assert.equal(built.json.includes('Drill the pass'), false);
  const exported = JSON.parse(built.json) as { assessment?: { entries?: unknown[] } };
  assert.equal(exported.assessment?.entries?.length ?? 0, 0);
  assert.equal(built.csv.includes('Self-assessment'), false);
  assert.equal(pdfIncludes(built.assessmentPdf, 'Mock self-assessment'), false);
  assert.equal(pdfIncludes(built.assessmentPdf, 'Earlier check-ins'), false);
  assert.equal(pdfIncludes(built.progressPdf, 'Holiday Classic'), false);
});

test('an entered Pan Pacific without the mock marker drives the hub and the weight countdown', () => {
  resetStudentMockGuardForTests();
  const today = '2026-10-26';
  const entered = addTournament(
    blankStudentReport(1),
    {
      name: 'Pan Pacific',
      date: '2026-11-14',
      location: 'Las Vegas',
      division: 'Adult / Middle',
      weightClass: 'Middle',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '82.3',
      targetUnit: 'kg',
    },
    2,
  );
  const summary = competitorHubSummary(entered, today);
  assert.equal(summary.eventName, 'Pan Pacific');
  assert.equal(summary.next, 'Next: Pan Pacific · 19d');
  assert.equal(summary.weight, WEIGHT_UNSET_LABEL);
  const countdown = weightCountdown(competitionOf(entered), today);
  assert.equal(countdown?.source, 'tournament');
  assert.equal(countdown?.tournamentName, 'Pan Pacific');
  assert.equal(countdown?.date, '2026-11-14');
  assert.equal(countdown?.days, 19);

  const storage = memory();
  saveStudentReport(storage, entered);
  const loaded = loadStudentReport(storage);
  assert.equal(competitorHubSummary(loaded, today).eventName, 'Pan Pacific');
  assert.equal(weightCountdown(competitionOf(loaded), today)?.tournamentName, 'Pan Pacific');
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(loadStudentReport(storage).competition?.tournaments[0]?.name, 'Pan Pacific');
});
