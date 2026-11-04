/**
 * Mat hours, week streak, session quality, injury/break marks.
 * Data model round trip, totals, streak with hiatus pause, belt wording,
 * leave/disconnect cleanup keeps durations, and nothing reaches the coach file.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMatTime, clockMatTime, matHoursLabel, matHoursLongLabel, matHoursSplit, matHoursTotal, sessionOf } from './matHours.ts';
import { trainingStreak, streakLabel, streakWeekLine, weekStart, readStreakTarget, saveStreakTarget } from './trainingStreak.ts';
import { QUALITY_SCALES, qualityStage, qualitySummary, bodyStatus } from './sessionQuality.ts';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport, updateJournalEntry } from './studentEdition.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { forgetAcademyFolder, joinAcademy, leaveAcademy, removePreviousGym } from './academyMembership.ts';
import { saveStudentDriveLink } from './academyPathway.ts';
import { buildCoachUpdateFile } from './coachProgressFile.ts';
import { assignStudentId } from './studentIdentity.ts';
import { testMemory } from './testPackets.ts';
import { logMatTime, markTrained, untimedOn, findSessionRecord } from './matLog.ts';
import type { StudentProgressReport } from './progress/types.ts';

const base = { className: 'Fundamentals', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: '' };

function log(report: StudentProgressReport, date: string, extra: Record<string, unknown> = {}, now = 1): StudentProgressReport {
  return addJournalEntry(report, { ...base, date, ...extra }, now);
}

test('time formats and labels show hours, never years by default', () => {
  assert.equal(formatMatTime(90), '1h 30m');
  assert.equal(clockMatTime(75), '1:15');
  assert.equal(matHoursLabel(60), '1 mat hour');
  assert.equal(matHoursLabel(7710), '128.5 mat hours');
  assert.doesNotMatch(matHoursLabel(600000), /year|day/);
  assert.equal(matHoursLongLabel(7710), '5.4 days on the mat');
  assert.match(matHoursLongLabel(600000), /years on the mat$/);
});

test('total sums class and open mat, old cards count as untimed', () => {
  let report = blankStudentReport(1);
  report = log(report, '2026-11-02', { minutes: 60, session: 'class' });
  report = log(report, '2026-11-03', { minutes: 90, session: 'openMat' }, 2);
  report = log(report, '2026-11-04', {}, 3);
  report = log(report, '2026-11-04', { className: 'Friday open mat' }, 4);
  const total = matHoursTotal(report.journal);
  assert.equal(total.minutes, 150);
  assert.equal(total.classMinutes, 60);
  assert.equal(total.openMatMinutes, 90);
  assert.equal(total.timed, 2);
  assert.equal(total.untimed, 2);
  assert.equal(sessionOf(report.journal[3]), 'openMat');
  assert.match(matHoursSplit(total), /Class 1.*Open mat 1\.5/);
});

test('editing a card updates the total; 0 clears; undefined keeps', () => {
  let report = log(blankStudentReport(1), '2026-11-02', { minutes: 60 });
  const id = report.journal[0].id;
  report = updateJournalEntry(report, id, { ...base, date: '2026-11-02', minutes: 120 }, 5);
  assert.equal(matHoursTotal(report.journal).minutes, 120);
  report = updateJournalEntry(report, id, { ...base, date: '2026-11-02' }, 6);
  assert.equal(matHoursTotal(report.journal).minutes, 120);
  report = updateJournalEntry(report, id, { ...base, date: '2026-11-02', minutes: 0 }, 7);
  assert.equal(matHoursTotal(report.journal).minutes, 0);
});

test('minutes, session, quality, injury and hiatus survive a backup round trip', () => {
  let report = log(blankStudentReport(1), '2026-11-02', { minutes: 45, session: 'openMat', quality: 4, injury: { area: 'Left knee', note: 'tweaked' } });
  report = log(report, '2026-10-01', { hiatus: { reason: 'medical', start: '2026-10-01', end: '2026-10-20' } }, 2);
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.ok(parsed.ok, JSON.stringify(parsed));
  if (!parsed.ok) return;
  const [a, b] = parsed.value.journal;
  assert.equal(a.minutes, 45);
  assert.equal(a.session, 'openMat');
  assert.equal(a.quality, 4);
  assert.deepEqual(a.injury, { area: 'Left knee', note: 'tweaked' });
  assert.deepEqual(b.hiatus, { reason: 'medical', start: '2026-10-01', end: '2026-10-20' });
});

test('bad mat time in a file is refused', () => {
  const report = log(blankStudentReport(1), '2026-11-02', { minutes: 30 });
  const raw = JSON.parse(exportProgressPacket(report));
  raw.journal[0].minutes = 9999;
  assert.equal(parseProgressPacket(JSON.stringify(raw)).ok, false);
});

test('week streak: 2 sessions a week, current week in progress does not break it', () => {
  assert.equal(weekStart('2026-11-04'), '2026-11-02');
  let report = blankStudentReport(1);
  for (const d of ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28', '2026-11-03']) report = log(report, d);
  const view = trainingStreak(report.journal, '2026-11-04', 2);
  assert.equal(view.weeks, 2);
  assert.equal(view.thisWeek, 1);
  assert.equal(streakLabel(view), '2-week streak');
  assert.equal(streakWeekLine(view), 'This week: 1 of 2 sessions');
  assert.equal(trainingStreak(report.journal, '2026-11-04', 3).weeks, 0);
  assert.doesNotMatch(streakWeekLine(view) + streakLabel(view), /daily|every day|today/i);
});

test('hiatus weeks pause the streak instead of breaking it', () => {
  let report = blankStudentReport(1);
  for (const d of ['2026-10-05', '2026-10-07', '2026-10-26', '2026-10-28']) report = log(report, d);
  assert.equal(trainingStreak(report.journal, '2026-11-04').weeks, 1);
  report = log(report, '2026-10-12', { hiatus: { reason: 'medical', start: '2026-10-12', end: '2026-10-25' } });
  assert.equal(trainingStreak(report.journal, '2026-11-04').weeks, 2);
  const open = log(blankStudentReport(1), '2026-11-01', { hiatus: { reason: 'other', start: '2026-11-01', end: '' } });
  const paused = trainingStreak(open.journal, '2026-11-04');
  assert.equal(paused.paused, true);
  assert.match(streakWeekLine(paused), /paused, not lost/);
});

test('streak target is 2 or 3, default 2', () => {
  const storage = testMemory();
  assert.equal(readStreakTarget(storage), 2);
  saveStreakTarget(storage, 3);
  assert.equal(readStreakTarget(storage), 3);
});

test('quality wording follows the belt', () => {
  assert.equal(qualityStage('white', false), 'white');
  assert.equal(qualityStage('blue', false), 'builder');
  assert.equal(qualityStage('purple', false), 'builder');
  assert.equal(qualityStage('brown', false), 'refiner');
  assert.equal(qualityStage('black', false), 'refiner');
  assert.equal(qualityStage('grey', true), 'kids');
  assert.match(QUALITY_SCALES.white.labels.join(), /survived/i);
  let report = log(blankStudentReport(1), '2026-11-02', { quality: 4 });
  report = log(report, '2026-11-03', { quality: 5 }, 2);
  const summary = qualitySummary(report.journal, 'builder');
  assert.equal(summary?.average, 4.5);
  assert.equal(summary?.count, 2);
});

test('status comes from journal cards: current break, injury history', () => {
  let report = log(blankStudentReport(1), '2026-09-01', { injury: { area: 'Shoulder', note: '' } });
  report = log(report, '2026-11-01', { hiatus: { reason: 'medical', start: '2026-11-01', end: '' } }, 2);
  const status = bodyStatus(report.journal, '2026-11-04');
  assert.equal(status.current?.kind, 'hiatus');
  assert.equal(status.history.length, 2);
  const injured = bodyStatus(log(blankStudentReport(1), '2026-11-01', { injury: { area: 'Knee', note: '' } }).journal, '2026-11-04');
  assert.equal(injured.current?.kind, 'injury');
});

test('leave academy, remove old gym and disconnect never clear mat time', () => {
  const storage = testMemory();
  let report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  report = log(report, '2026-11-01', { minutes: 90, session: 'openMat', quality: 3, injury: { area: 'Knee', note: '' } });
  saveStudentReport(storage, report);
  saveStudentDriveLink(storage, { role: 'academy', provider: 'googleDrive', folderId: 'gymA-folder', folderName: 'A', accountLabel: null, gymName: 'A' });
  joinAcademy(storage, { folderId: 'gymA-folder', provider: 'googleDrive', gymName: 'A', license: 'licA-1234' }, 1000);
  forgetAcademyFolder(storage);
  leaveAcademy(storage, { removeLogo: true });
  removePreviousGym(storage, { removeLogo: true });
  const after = loadStudentReport(storage);
  assert.equal(matHoursTotal(after.journal).minutes, 90);
  assert.equal(after.journal[0].quality, 3);
  assert.deepEqual(after.journal[0].injury, { area: 'Knee', note: '' });
});

test('coach update file never carries mat time, injury or break marks', () => {
  let report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  report = log(report, '2026-11-01', { minutes: 90, injury: { area: 'SECRET-KNEE', note: '' } });
  const built = buildCoachUpdateFile(report, { storage: testMemory(), assessments: [], now: 100, today: '2026-11-04' });
  assert.doesNotMatch(built.json, /minutes|SECRET-KNEE|hiatus|quality/);
});

test('shared log: quick-add, calendar mark and journal card de-dupe by day + session', () => {
  let r = blankStudentReport(1);
  r = logMatTime(r, { date: '2026-10-05', session: 'class', minutes: 60 }, 2);
  assert.equal(r.journal.length, 1);
  assert.equal(matHoursTotal(r.journal).minutes, 60);
  // Same day + same session again: updates, never doubles.
  r = logMatTime(r, { date: '2026-10-05', session: 'class', minutes: 90 }, 3);
  assert.equal(r.journal.length, 1);
  assert.equal(matHoursTotal(r.journal).minutes, 90);
  // Different session same day is a second session.
  r = logMatTime(r, { date: '2026-10-05', session: 'openMat', minutes: 30 }, 4);
  assert.equal(r.journal.length, 2);
  assert.equal(matHoursTotal(r.journal).minutes, 120);
  // Calendar mark on a day that already has a session is a no-op.
  assert.equal(markTrained(r, '2026-10-05', 5).journal.length, 2);
});

test('calendar trained mark counts for the streak untimed, then quick-add fills the same record', () => {
  let r = blankStudentReport(1);
  r = markTrained(r, '2026-11-02', 2);
  r = markTrained(r, '2026-11-03', 3);
  assert.equal(r.journal.length, 2);
  assert.equal(matHoursTotal(r.journal).minutes, 0);
  assert.equal(untimedOn(r.journal, '2026-11-02').length, 1);
  assert.equal(trainingStreak(r.journal, '2026-11-04', 2).thisWeek, 2);
  r = logMatTime(r, { date: '2026-11-02', session: 'class', minutes: 75 }, 4);
  assert.equal(r.journal.length, 2);
  assert.equal(matHoursTotal(r.journal).minutes, 75);
  assert.equal(untimedOn(r.journal, '2026-11-02').length, 0);
  // An untyped mark adopts an open mat time too, still one record.
  r = logMatTime(r, { date: '2026-11-03', session: 'openMat', minutes: 30 }, 5);
  assert.equal(r.journal.length, 2);
  assert.equal(findSessionRecord(r.journal, '2026-11-03', 'openMat')?.minutes, 30);
});

test('quick-add on a day with a full journal card updates that card, keeping its notes', () => {
  let r = log(blankStudentReport(1), '2026-10-12', { className: 'Fundamentals', notes: 'armbar from guard', minutes: 60 });
  r = logMatTime(r, { date: '2026-10-12', session: 'class', minutes: 45 }, 9);
  assert.equal(r.journal.length, 1);
  assert.equal(r.journal[0].minutes, 45);
  assert.match(r.journal[0].body, /armbar from guard/);
  assert.throws(() => logMatTime(r, { date: 'bad', session: 'class', minutes: 30 }));
  assert.throws(() => logMatTime(r, { date: '2026-10-12', session: 'class', minutes: 0 }));
});
