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
import { resetStudentMockGuardForTests } from './studentDemo.ts';
import { blankStudentReport, loadStudentReport, STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { ADD_TOURNAMENT_LABEL, competitorHubSummary, NO_EVENT_LABEL } from './studentHubMenu.ts';
import { progressReportLines } from './studentReport.ts';
import { emptyAssessments, loadAssessments, saveAssessment, writeAssessments, type AssessmentScores } from './studentAssessment.ts';
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
