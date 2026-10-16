import assert from 'node:assert/strict';
import test from 'node:test';
import { competitionSnapshot, rankSummary } from './progress/competition.ts';
import { exportProgressPacket, fitRankPictures, mergeStudentProgress, parseProgressPacket } from './progress/format.ts';
import { RANK_EXPORT_BUDGET, RANK_PHOTO_MAX_CHARS } from './progress/types.ts';
import { normalizeRoster, type Student } from './rosterStore.ts';
import { blankStudentReport } from './studentEdition.ts';
import {
  emptyRank,
  ladderRungs,
  rankMarks,
  rankOf,
  removeRankHistory,
  setRankAwardedOn,
  setRankBelt,
  setRankLineage,
  setRankTapeCount,
  setRankTapeDate,
  stripeCountControl,
} from './studentRank.ts';
import { addCalendarEvent, progressReportFiles } from './studentTools.ts';

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

test('lineage is an ordered list, and the ladder runs white down to black', () => {
  let report = setRankLineage(blankStudentReport(10), ['Coach Ana', '', 'Professor Luis'], 11);
  assert.deepEqual(report.rank?.lineage, ['Coach Ana', 'Professor Luis']);
  report = setRankBelt(report, 'blue', 12);
  report = setRankAwardedOn(report, '2026-02-01', 13);
  const rungs = ladderRungs(report);
  assert.deepEqual(rungs.map((rung) => rung.belt), ['white', 'blue', 'purple', 'brown', 'black']);
  assert.equal(rungs[1]?.current, true);
  assert.equal(rungs[1]?.awardedOn, '2026-02-01');
  assert.equal(rungs[0]?.awardedOn, '');
  assert.deepEqual(rankOf(report).lineage, ['Coach Ana', 'Professor Luis']);
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.value.kind === 'student-progress-report') {
    assert.deepEqual(parsed.value.rank?.lineage, ['Coach Ana', 'Professor Luis']);
  }
  const incoming = setRankLineage(blankStudentReport(10), ['Someone else'], 14);
  incoming.studentId = report.studentId;
  const merged = mergeStudentProgress(report, incoming);
  assert.deepEqual(merged.report.rank?.lineage, ['Coach Ana', 'Professor Luis']);
  assert.match(merged.conflicts.join('\n'), /Lineage was kept/);
});

test('promotion photos export when they fit, and the rest stay off the file with a note', () => {
  const prefix = 'data:image/jpeg;base64,';
  const photo = `${prefix}${'A'.repeat(RANK_PHOTO_MAX_CHARS - prefix.length)}`;
  assert.equal(photo.length, RANK_PHOTO_MAX_CHARS);
  const report = setRankBelt(blankStudentReport(10), 'blue', 11);
  const fitted = fitRankPictures({
    ...report,
    rank: {
      ...rankOf(report),
      pictures: [
        { belt: 'blue', image: photo },
        { belt: 'blue', image: photo },
        { belt: 'blue', image: photo },
        { belt: 'blue', tapeIndex: 0, image: photo },
      ],
    },
  });
  assert.equal(fitted.rank?.pictures?.length, 3);
  assert.equal(fitted.rank?.pictureCount, 3);
  assert.equal(fitted.rank?.pictureNote, '1 promotion photo stayed on this phone.');
  assert.ok((fitted.rank?.pictures?.reduce((sum, picture) => sum + picture.image.length, 0) ?? 0) <= RANK_EXPORT_BUDGET);
  const text = exportProgressPacket(fitted);
  assert.equal(text.includes('"stripes"'), false);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.value.kind === 'student-progress-report') {
    assert.equal(parsed.value.rank?.pictures?.length, 3);
    assert.equal(parsed.value.rank?.pictureNote, '1 promotion photo stayed on this phone.');
  }
  const blocked = parseProgressPacket(JSON.stringify({ ...report, photo: photo }));
  assert.equal(blocked.ok, false);

  const files = progressReportFiles(report, [{ belt: 'blue', image: photo }]);
  assert.match(files.json, /data:image\/jpeg/);
  assert.doesNotMatch(files.json, /stayed on this phone/);
  const kept = mergeStudentProgress(report, parsed.ok && parsed.value.kind === 'student-progress-report' ? parsed.value : report);
  assert.equal(kept.report.rank?.pictures, undefined);
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

test('a stripe date is optional, can be cleared, and does not need a photo', () => {
  let report = setRankTapeCount(setRankBelt(blankStudentReport(10), 'blue', 11), 1, 12);
  assert.deepEqual(report.rank?.tapeDates, ['', '', '', '']);
  assert.equal(report.rank?.pictures, undefined);
  report = setRankTapeDate(report, 0, '2026-05-02', 13);
  assert.equal(report.rank?.tapeDates[0], '2026-05-02');
  report = setRankTapeDate(report, 0, '', 14);
  assert.equal(report.rank?.tapeDates[0], '');
  assert.equal(report.rank?.pictures, undefined);
  assert.throws(() => setRankTapeDate(report, 0, '2026-02-31'), /YYYY-MM-DD/);
  const packet = JSON.parse(exportProgressPacket(report)) as { rank?: { tapeDates?: unknown; pictures?: unknown } };
  delete packet.rank?.tapeDates;
  const image = `data:image/png;base64,${'A'.repeat(40)}`;
  packet.rank = { ...packet.rank, pictures: [{ belt: 'blue', tapeIndex: 0, image }] };
  const parsed = parseProgressPacket(JSON.stringify(packet));
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.value.kind === 'student-progress-report') {
    assert.deepEqual(parsed.value.rank?.tapeDates, ['', '', '', '']);
    assert.equal(parsed.value.rank?.pictures?.[0]?.tapeIndex, 0);
    assert.equal(parsed.value.rank?.pictures?.[0]?.image, image);
    assert.equal(parsed.value.rank?.tapeCount, 1);
  }
});

test('stripe controls add, take off the last stripe, or drop the ones after it', () => {
  assert.deepEqual(stripeCountControl(2, 0, 'Stripe 2'), { action: 'add', name: 'Add Stripe 2' });
  assert.deepEqual(stripeCountControl(2, 2, 'Stripe 2'), { action: 'remove', name: 'Take off Stripe 2' });
  assert.deepEqual(stripeCountControl(1, 4, 'Stripe 1'), { action: 'trim', name: 'Drop stripes after Stripe 1' });
  assert.deepEqual(stripeCountControl(1, 2, 'Blue stripe 1'), { action: 'trim', name: 'Drop stripes after Blue stripe 1' });
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
