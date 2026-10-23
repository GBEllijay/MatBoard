import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCompetition } from './progress/competition.ts';
import type { CompetitionResult, StudentTournament, WeighIn } from './progress/types.ts';
import { blankStudentReport } from './studentEdition.ts';
import {
  COACH_FILE_LABEL,
  FORMER_HUB_ITEMS,
  LEGACY_STUDENT_RESTS,
  TRAINING_GROUP_LABEL,
  competitorHubSummary,
  formerHubItemReachable,
  groupMenuLinks,
  progressLinks,
  studentScreen,
} from './studentHubMenu.ts';
import { backupStampLabel, noteStudentBackupBuilt, readStudentBackupStamp } from './studentBackupStamp.ts';

test('the grouped hub label is Training & Journal', () => {
  assert.equal(TRAINING_GROUP_LABEL, 'Training & Journal');
  assert.equal(TRAINING_GROUP_LABEL.includes(' and '), false);
});

test('every legacy student route still resolves to its own screen', () => {
  assert.equal(studentScreen(''), 'hub');
  assert.equal(studentScreen('training'), 'training');
  assert.equal(studentScreen('progress'), 'progress');
  assert.equal(studentScreen('compete'), 'compete');
  assert.equal(studentScreen('coach'), 'coach');
  assert.equal(studentScreen('backup'), 'backup');
  assert.equal(studentScreen('backup/clear'), 'backup-clear');
  const screens = LEGACY_STUDENT_RESTS.map((rest) => studentScreen(rest));
  assert.equal(screens.includes('hub'), false);
  assert.equal(studentScreen('cards/card.1'), 'card');
  assert.equal(studentScreen('calendar/2026-10-23'), 'calendar-day');
  assert.equal(studentScreen('belt'), 'rubric');
  assert.equal(studentScreen('print/progress'), 'print-progress');
  assert.equal(studentScreen('print/assessment'), 'print-assessment');
  assert.equal(studentScreen('not-a-page'), 'hub');
});

test('every former hub item is reachable from the new menus', () => {
  const links = groupMenuLinks('white');
  for (const item of FORMER_HUB_ITEMS) {
    assert.equal(formerHubItemReachable(item, links), true, item.label);
  }
  assert.equal(formerHubItemReachable({ label: 'Send to coach', note: '', to: '/student/share' }, links), true);
  assert.equal(
    formerHubItemReachable({ label: 'Import from coach', note: '', to: '/student/share#import' }, links),
    true,
  );
  assert.equal(links.some((link) => link.label === COACH_FILE_LABEL && link.to === '/student/share'), true);
  assert.equal(links.some((link) => link.label === 'Menu'), false);
});

test('rank menu leads with fundamentals for white and blue, and rank for purple and up', () => {
  assert.equal(progressLinks('white')[0]?.label, 'Fundamentals');
  assert.equal(progressLinks('blue')[0]?.label, 'Fundamentals');
  assert.equal(progressLinks('grey')[0]?.label, 'Fundamentals');
  assert.equal(progressLinks('purple')[0]?.label, 'My rank');
  assert.equal(progressLinks('black')[0]?.label, 'My rank');
  assert.equal(progressLinks('coral')[0]?.label, 'My rank');
  assert.deepEqual(
    progressLinks('white').map((item) => item.label),
    ['Fundamentals', 'Belt progress', 'My rank', 'Self-assessment'],
  );
  assert.deepEqual(
    progressLinks('purple').map((item) => item.label),
    ['My rank', 'Belt progress', 'Fundamentals', 'Self-assessment'],
  );
});

test('competitor summary names the next event, the cut, and the record', () => {
  const report = blankStudentReport(1);
  const tournament: StudentTournament = {
    id: 't1',
    name: 'Spring Open',
    date: '2026-11-21',
    location: '',
    division: '',
    deadline: '',
    link: '',
    status: 'entered',
    targetWeight: null,
    targetUnit: 'lb',
    goals: [],
  };
  const weighIn: WeighIn = { id: 'w1', date: '2026-10-23', weight: 173.4, unit: 'lb', note: '' };
  const result: CompetitionResult = {
    id: 'r1',
    tournamentId: '',
    tournamentName: 'Fall Open',
    division: '',
    matches: [
      { id: 'm1', opponent: 'Sam', result: 'win', method: 'sub', note: '' },
      { id: 'm2', opponent: 'Jo', result: 'loss', method: 'points', note: '' },
    ],
    bracket: [],
    bracketPhoto: false,
  };
  report.competition = {
    ...emptyCompetition(),
    tournaments: [tournament],
    weighIns: [weighIn],
    results: [result],
    goalWeight: 170,
    goalUnit: 'lb',
  };
  const summary = competitorHubSummary(report, '2026-10-23');
  assert.equal(summary.eventName, 'Spring Open');
  assert.equal(summary.countdown, '29 days');
  assert.equal(summary.weight, '3.4 lb to go');
  assert.equal(summary.record, '1–1');
  assert.equal(summary.tile, 'Spring Open · 29 days · 3.4 lb to go');
  assert.equal(competitorHubSummary(blankStudentReport(1), '2026-10-23').tile, 'Tournaments, weight, opponents, and results');
});

test('a built backup records the day, and a missing stamp reads as not yet', () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  };
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), 'Not yet');
  noteStudentBackupBuilt(new Date('2026-10-23T15:04:00.000Z'), storage);
  assert.equal(backupStampLabel(readStudentBackupStamp(storage)), '2026-10-23');
});
