import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCompetition } from './progress/competition.ts';
import type { CompetitionResult, StudentTournament, WeighIn } from './progress/types.ts';
import { blankStudentReport } from './studentEdition.ts';
import {
  COACH_FILE_LABEL,
  FORMER_HUB_ITEMS,
  LEGACY_STUDENT_RESTS,
  NO_EVENT_LABEL,
  NO_MATCHES_LABEL,
  RANK_MENU_STRIPES,
  SCOUTING_LABEL,
  TRAINING_GROUP_LABEL,
  WEIGHT_UNSET_LABEL,
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

test('rank menu rows stay in order and each belt shows one more stripe', () => {
  const labels = ['Fundamentals', 'Belt progress', 'My rank', 'Self-assessment'];
  for (const belt of ['white', 'blue', 'purple', 'black', 'coral']) {
    assert.deepEqual(
      progressLinks(belt).map((item) => item.label),
      labels,
    );
  }
  assert.deepEqual(
    RANK_MENU_STRIPES.map((row) => [row.label, row.stripes]),
    [
      ['Fundamentals', 1],
      ['Belt progress', 2],
      ['My rank', 3],
      ['Self-assessment', 4],
    ],
  );
});

test('competitor chips name the next event and the win-loss record', () => {
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
  assert.equal(summary.next, 'Next: Spring Open · 29d');
  assert.equal(summary.weight, '3.4 lb to go');
  assert.equal(summary.record, 'Record 1-1');
  const empty = competitorHubSummary(blankStudentReport(1), '2026-10-23');
  assert.equal(empty.next, NO_EVENT_LABEL);
  assert.equal(empty.record, NO_MATCHES_LABEL);
  assert.equal(empty.weight, WEIGHT_UNSET_LABEL);
  report.competition.results[0]?.matches.push({ id: 'm3', opponent: 'Pat', result: 'draw', method: 'points', note: '' });
  assert.equal(competitorHubSummary(report, '2026-10-23').record, 'Record 1-1-1');
  const dqOnly = blankStudentReport(1);
  dqOnly.competition = {
    ...emptyCompetition(),
    results: [
      {
        ...result,
        matches: [{ id: 'm4', opponent: 'Dee', result: 'win', method: 'dq', note: '' }],
      },
    ],
  };
  assert.equal(competitorHubSummary(dqOnly, '2026-10-23').record, 'Record 1-0');
  assert.equal(groupMenuLinks().some((link) => link.label === SCOUTING_LABEL && link.to === '/student/scouting'), true);
  assert.equal(groupMenuLinks().some((link) => link.label.includes('Scouting-Opponent')), false);
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
