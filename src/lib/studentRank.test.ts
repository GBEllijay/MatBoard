import assert from 'node:assert/strict';
import test from 'node:test';
import { competitionSnapshot, rankSummary } from './progress/competition.ts';
import { parseProgressPacket } from './progress/format.ts';
import { normalizeRoster, type Student } from './rosterStore.ts';
import { blankStudentReport } from './studentEdition.ts';
import {
  emptyRank,
  rankMarks,
  rankOf,
  removeRankHistory,
  setRankAwardedOn,
  setRankBelt,
  setRankTapeCount,
  setRankTapeDate,
} from './studentRank.ts';
import { addCalendarEvent } from './studentTools.ts';

test('tapping stripes sets 0 to 4 and drops dates past the last stripe', () => {
  let report = blankStudentReport(10);
  report = setRankBelt(report, 'blue', 11);
  assert.equal(report.profile.belt, 'blue');
  assert.equal(report.rank?.history.length, 0);
  report = setRankTapeCount(report, 2, 12);
  report = setRankTapeDate(report, 0, '2026-03-01', 13);
  report = setRankTapeDate(report, 1, '2026-04-01', 14);
  report = setRankAwardedOn(report, '2026-02-01', 15);
  assert.equal(report.rank?.tapeCount, 2);
  assert.deepEqual(report.rank?.tapeDates, ['2026-03-01', '2026-04-01', '', '']);
  report = setRankTapeCount(report, 1, 16);
  assert.equal(report.rank?.tapeCount, 1);
  assert.deepEqual(report.rank?.tapeDates, ['2026-03-01', '', '', '']);
  assert.throws(() => setRankTapeCount(report, 5), /0 to 4/);
  assert.throws(() => setRankTapeDate(report, 2, '2026-05-01'), /not on the belt yet/);
});

test('changing belts keeps the previous belt when it had a date or a stripe', () => {
  let report = setRankBelt(blankStudentReport(10), 'blue', 11);
  report = setRankTapeCount(report, 2, 12);
  report = setRankAwardedOn(report, '2026-02-01', 13);
  report = setRankTapeDate(report, 1, '2026-04-01', 14);
  report = setRankBelt(report, 'purple', 15);
  assert.equal(report.profile.belt, 'purple');
  assert.equal(report.rank?.tapeCount, 0);
  assert.equal(report.rank?.awardedOn, '');
  assert.equal(report.rank?.history.length, 1);
  assert.equal(report.rank?.history[0].belt, 'blue');
  assert.equal(report.rank?.history[0].tapeCount, 2);
  assert.equal(report.rank?.history[0].awardedOn, '2026-02-01');
  assert.equal(report.rank?.history[0].tapeDates[1], '2026-04-01');
  const id = report.rank?.history[0].id ?? '';
  report = removeRankHistory(report, id, 16);
  assert.equal(report.rank?.history.length, 0);
  assert.equal(report.profile.belt, 'purple');
});

test('a kids belt is not written into promotion history', () => {
  let report = blankStudentReport(10);
  report = { ...report, profile: { ...report.profile, belt: 'grey' } };
  report = setRankTapeCount(report, 1, 11);
  report = setRankBelt(report, 'blue', 12);
  assert.equal(report.profile.belt, 'blue');
  assert.equal(report.rank?.tapeCount, 1);
  assert.equal(report.rank?.history.length, 0);
  assert.equal(report.rank?.history.some((row) => row.belt === 'grey'), false);
});

test('a promotion test on the calendar does not become a belt date', () => {
  let report = blankStudentReport(10);
  report = addCalendarEvent(report, {
    date: '2026-06-01',
    title: 'Blue belt test',
    kind: 'promotion',
    note: 'Saturday',
  }, 11);
  assert.equal(rankOf(report).awardedOn, '');
  assert.deepEqual(rankMarks(report), []);
  report = setRankAwardedOn(report, '2026-07-01', 12);
  assert.deepEqual(rankMarks(report), [{ date: '2026-07-01', label: 'White belt' }]);
  assert.equal(report.calendar.length, 1);
  assert.equal(report.calendar[0].kind, 'promotion');
  assert.equal(report.calendar[0].date, '2026-06-01');
});

test('an imported plan keeps the rank after a roster reload', () => {
  let report = setRankBelt(blankStudentReport(20), 'blue', 21);
  report = setRankTapeCount(report, 2, 22);
  report = setRankAwardedOn(report, '2026-02-01', 23);
  report = setRankBelt(report, 'purple', 24);
  const plan = competitionSnapshot(report, 30);
  assert.equal(plan.rank?.belt, 'purple');
  assert.equal(plan.rank?.tapeCount, 0);
  assert.equal(plan.rank?.history[0]?.belt, 'blue');
  assert.match(rankSummary(plan.rank!), /Purple · 0 stripes/);
  assert.match(rankSummary(plan.rank!), /1 earlier belt/);
  const student: Student = {
    id: 'comp-1',
    name: 'Sam',
    belt: 'Purple',
    gym: '',
    division: '',
    photo: '',
    checkedIn: false,
    lastPromotion: '',
    lastPromotionDetail: '',
    note: '',
  };
  const loaded = normalizeRoster({
    version: 1,
    students: [student],
    competitionPlans: { 'comp-1': plan },
  });
  assert.equal(loaded.competitionPlans['comp-1'].rank?.belt, 'purple');
  assert.equal(loaded.competitionPlans['comp-1'].rank?.history[0]?.tapeCount, 2);
  const text = JSON.stringify(report);
  assert.equal(text.includes('"stripes"'), false);
  assert.equal(text.includes('"tapeCount"'), true);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
});

test('a blank rank is empty and an older report without rank still reads', () => {
  const blank = blankStudentReport(1);
  assert.deepEqual(blank.rank, emptyRank());
  const older = { ...blank };
  delete older.rank;
  const parsed = parseProgressPacket(JSON.stringify(older));
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.value.kind === 'student-progress-report') assert.equal(parsed.value.rank, undefined);
});
