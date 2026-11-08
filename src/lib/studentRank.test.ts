import assert from 'node:assert/strict';
import test from 'node:test';
import { setBeltMode, setKidsBelt, setKidsTapeCount } from './beltBook.ts';
import { competitionSnapshot, rankSummary } from './progress/competition.ts';
import { exportProgressCsv, exportProgressPacket, fitRankPictures, mergeStudentProgress, parseProgressPacket } from './progress/format.ts';
import { RANK_EXPORT_BUDGET, RANK_PHOTO_MAX_CHARS, type RankHistory, type StudentProgressReport } from './progress/types.ts';
import { normalizeRoster, type Student } from './rosterStore.ts';
import { blankStudentReport } from './studentEdition.ts';
import { progressReportLines } from './studentReport.ts';
import {
  adultRankIndex,
  dedupeRankHistory,
  emptyRank,
  ladderRungs,
  normalizeStoredRank,
  promotionHistoryEntries,
  rankFaceLabel,
  rankMarks,
  rankOf,
  removeRankHistory,
  repeatedHistoryBelts,
  setInstructorBars,
  setInstructorBarsOn,
  setRankAwardedOn,
  setRankBelt,
  setRankHistoryAwardedOn,
  setRankLineage,
  setRankTapeCount,
  setRankTapeDate,
  stripeCountControl,
  stripeReportLine,
  wornBeltPreview,
} from './studentRank.ts';
import { addCalendarEvent, progressReportFiles, setStudentBelt } from './studentTools.ts';

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

  const raw = JSON.parse(exportProgressPacket(report)) as { rank: { lineage: unknown } };
  raw.rank.lineage = 'Mestre Paulo Reis (mock)\nProf. Elena Duarte (mock)';
  const migrated = parseProgressPacket(JSON.stringify(raw));
  assert.equal(migrated.ok, true);
  if (migrated.ok && migrated.value.kind === 'student-progress-report') {
    assert.deepEqual(migrated.value.rank?.lineage, ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)']);
  }
  raw.rank.lineage = ['Mestre Paulo Reis (mock)\nProf. Elena Duarte (mock)'];
  const split = parseProgressPacket(JSON.stringify(raw));
  assert.equal(split.ok, true);
  if (split.ok && split.value.kind === 'student-progress-report') {
    assert.deepEqual(split.value.rank?.lineage, ['Mestre Paulo Reis (mock)', 'Prof. Elena Duarte (mock)']);
  }
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

test('an undated stripe still counts, and a missing date list on an older rank does too', () => {
  const report = setRankTapeCount(setRankBelt(blankStudentReport(30), 'blue', 31), 3, 32);
  assert.equal(report.rank?.tapeCount, 3);
  assert.deepEqual(report.rank?.tapeDates, ['', '', '', '']);
  assert.equal(stripeReportLine(1, ''), 'Stripe 1');
  assert.equal(stripeReportLine(2, '2024-07-15'), 'Stripe 2: 2024-07-15');
  assert.equal(stripeReportLine(3, 'not a date'), 'Stripe 3');
  const older = normalizeStoredRank({ tapeCount: 3, awardedOn: '', history: [], lineage: [] });
  assert.equal(older.tapeCount, 3);
  assert.deepEqual(older.tapeDates, ['', '', '', '']);
  const partial = normalizeStoredRank({
    tapeCount: 3,
    awardedOn: '2011-04-02',
    tapeDates: ['2012-01-01'] as unknown as [string, string, string, string],
    history: [
      {
        id: 'rank-white',
        belt: 'white',
        awardedOn: '',
        tapeCount: 2,
        tapeDates: ['', '2009-08-01', '', ''],
      },
    ],
  });
  assert.equal(partial.tapeCount, 3);
  assert.deepEqual(partial.tapeDates, ['2012-01-01', '', '', '']);
  assert.equal(partial.awardedOn, '2011-04-02');
  assert.deepEqual(partial.history[0]?.tapeDates, ['', '2009-08-01', '', '']);
  const read = rankOf({ ...report, rank: { ...report.rank!, tapeDates: undefined as unknown as [string, string, string, string] } });
  assert.equal(read.tapeCount, 3);
  assert.deepEqual(read.tapeDates, ['', '', '', '']);
});

test('stripe controls add, take off the last stripe, or drop the ones after it', () => {
  assert.deepEqual(stripeCountControl(2, 0, 'Stripe 2'), { action: 'add', name: 'Add Stripe 2' });
  assert.deepEqual(stripeCountControl(2, 2, 'Stripe 2'), { action: 'remove', name: 'Take off Stripe 2' });
  assert.deepEqual(stripeCountControl(1, 4, 'Stripe 1'), { action: 'trim', name: 'Drop stripes after Stripe 1' });
  assert.deepEqual(stripeCountControl(1, 2, 'Blue stripe 1'), { action: 'trim', name: 'Drop stripes after Blue stripe 1' });
});

function wearBlack(report: StudentProgressReport, now = 100) {
  let next = setRankBelt(report, 'black', now + 1);
  next = setRankAwardedOn(next, '2010-01-02', now + 2);
  next = setRankTapeCount(next, 6, now + 3);
  next = setRankTapeDate(next, 0, '2013-03-04', now + 4);
  next = setRankTapeDate(next, 4, '2019-05-06', now + 5);
  next = setRankTapeDate(next, 5, '2024-07-08', now + 6);
  next = setInstructorBars(next, true, now + 7);
  next = setInstructorBarsOn(next, '2012-02-02', now + 8);
  return next;
}

function blackWithRecord(now = 100) {
  return wearBlack(blankStudentReport(now), now);
}

function assertBlackRecord(report: ReturnType<typeof blackWithRecord>) {
  assert.equal(report.profile.belt, 'black');
  assert.equal(report.rank?.awardedOn, '2010-01-02');
  assert.equal(report.rank?.tapeCount, 6);
  assert.equal(report.rank?.tapeDates[0], '2013-03-04');
  assert.deepEqual(report.rank?.highDegreeDates, ['2019-05-06', '2024-07-08']);
  assert.equal(report.rank?.instructorBars, true);
  assert.equal(report.rank?.instructorBarsOn, '2012-02-02');
}

test('Black to Brown to Black keeps degrees, bars, and dates', () => {
  let report = blackWithRecord();
  report = setRankBelt(report, 'brown', 120);
  assert.equal(report.profile.belt, 'brown');
  assert.equal(report.rank?.tapeCount, 0);
  assert.equal(report.rank?.awardedOn, '');
  assert.equal(report.rank?.instructorBars, undefined);
  assert.equal(report.rank?.history.length, 1);
  report = setRankBelt(report, 'black', 121);
  assertBlackRecord(report);
  assert.equal(report.rank?.history.length, 0);
  report = setRankBelt(report, 'brown', 122);
  report = setRankBelt(report, 'black', 123);
  assertBlackRecord(report);
  assert.equal(report.rank?.history.filter((row) => row.belt === 'black').length, 0);
  report = setRankBelt(report, 'brown', 124);
  assert.equal(report.rank?.history.filter((row) => row.belt === 'black').length, 1);
  const black = ladderRungs(report).find((rung) => rung.belt === 'black');
  assert.equal(black?.tapeCount, 6);
  assert.equal(black?.awardedOn, '2010-01-02');
  assert.equal(black?.instructorBars, true);
  assert.equal(black?.instructorBarsOn, '2012-02-02');
});

test('Coral to Black keeps the black belt and does not log it twice', () => {
  let report = blackWithRecord(200);
  report = setRankAwardedOn(setRankBelt(report, 'coral', 210), '2024-08-09', 211);
  report = setRankBelt(report, 'black', 212);
  assertBlackRecord(report);
  assert.equal(report.rank?.history.length, 1);
  assert.equal(report.rank?.history[0]?.belt, 'coral');
  assert.equal(report.rank?.history[0]?.awardedOn, '2024-08-09');
  report = setRankBelt(report, 'coral', 213);
  assert.equal(report.profile.belt, 'coral');
  assert.equal(report.rank?.awardedOn, '2024-08-09');
  assert.equal(report.rank?.history.filter((row) => row.belt === 'black').length, 1);
  report = setRankBelt(report, 'black', 214);
  report = setRankBelt(report, 'coral', 215);
  report = setRankBelt(report, 'black', 216);
  assertBlackRecord(report);
  assert.equal(report.rank?.history.filter((row) => row.belt === 'coral').length, 1);
  assert.equal(report.rank?.history.filter((row) => row.belt === 'black').length, 0);
});

test('moving between belts restores each one and does not log the same promotion twice', () => {
  let report = setRankBelt(blankStudentReport(300), 'brown', 301);
  report = setRankAwardedOn(report, '2018-04-05', 302);
  report = setRankTapeCount(report, 3, 303);
  report = setRankTapeDate(report, 2, '2019-06-07', 304);
  report = setStudentBelt(report, 'black', 305);
  report = setRankAwardedOn(report, '2020-01-01', 306);
  report = setRankTapeCount(report, 2, 307);
  report = setInstructorBars(report, true, 308);
  report = setRankBelt(report, 'brown', 309);
  assert.equal(report.rank?.tapeCount, 3);
  assert.equal(report.rank?.awardedOn, '2018-04-05');
  assert.equal(report.rank?.tapeDates[2], '2019-06-07');
  assert.equal(report.rank?.history.filter((row) => row.belt === 'black').length, 1);
  report = setRankTapeDate(report, 2, '2019-09-09', 310);
  report = setRankBelt(report, 'black', 311);
  assert.equal(report.rank?.tapeCount, 2);
  assert.equal(report.rank?.instructorBars, true);
  assert.equal(report.rank?.awardedOn, '2020-01-01');
  report = setRankBelt(report, 'brown', 312);
  assert.equal(report.rank?.tapeDates[2], '2019-09-09');
  assert.equal(report.rank?.history.filter((row) => row.belt === 'brown').length, 0);
  assert.equal(report.rank?.history.filter((row) => row.belt === 'black').length, 1);
  const same = setRankBelt(report, 'brown', 313);
  assert.equal(same, report);
});

test('a repeated promotion is one history row, one spreadsheet row, and one progress-report line', () => {
  const first: RankHistory = {
    id: 'rank-black-a',
    belt: 'black',
    awardedOn: '2010-01-02',
    tapeCount: 2,
    tapeDates: ['2013-03-04', '2016-05-06', '', ''],
    instructorBars: true,
    instructorBarsOn: '2012-02-02',
  };
  const copy: RankHistory = { ...first, id: 'rank-black-b' };
  const other: RankHistory = { ...first, id: 'rank-black-c', tapeCount: 3, instructorBars: undefined };
  let report = setRankBelt(blankStudentReport(400), 'brown', 401);
  report = {
    ...report,
    rank: {
      tapeCount: 0,
      awardedOn: '',
      tapeDates: ['', '', '', ''],
      history: [first, copy, other],
      lineage: [],
    },
  };
  assert.equal(rankOf(report).history.filter((row) => row.belt === 'black' && row.tapeCount === 2).length, 1);
  assert.equal(rankOf(report).history.find((row) => row.tapeCount === 2)?.id, 'rank-black-b');
  assert.equal(dedupeRankHistory(report.rank?.history ?? []).length, 2);
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.rank?.history.length, 2);
  const csv = exportProgressCsv(report);
  assert.equal(csv.split('rank-black-b').length - 1, 1);
  assert.equal(csv.includes('rank-black-a'), false);
  assert.equal(csv.split('Rank history').length - 1, 2);
  const lines = progressReportLines(report, { entries: [] });
  assert.equal(lines.filter((line) => line === 'Black awarded 2010-01-02, 2 degrees').length, 1);
  assert.equal(lines.filter((line) => line === 'Black awarded 2010-01-02, 3 degrees').length, 1);
});

test('kids belt taps stay on the kids ladder when adult belts move', () => {
  let report = setBeltMode(blankStudentReport(500), 'kids', 501);
  report = setKidsBelt(report, 'grey-white', 502);
  report = setKidsTapeCount(report, 4, 503);
  report = setKidsBelt(report, 'yellow', 504);
  report = setBeltMode(report, 'adult', 505);
  report = wearBlack(report, 510);
  report = setRankBelt(report, 'brown', 530);
  report = setRankBelt(report, 'coral', 531);
  report = setRankBelt(report, 'black', 532);
  assertBlackRecord(report);
  assert.equal(report.rank?.history.some((row) => row.belt === 'grey'), false);
  report = setBeltMode(report, 'kids', 533);
  assert.equal(report.beltBook?.kids?.beltId, 'yellow');
  assert.equal(report.beltBook?.kids?.history.some((row) => row.beltId === 'grey-white' && row.tapeCount === 4), true);
  assert.equal(report.beltBook?.kids?.history.filter((row) => row.beltId === 'grey-white').length, 1);
  report = setKidsBelt(report, 'orange', 534);
  assert.equal(report.beltBook?.kids?.beltId, 'orange');
  assert.equal(report.profile.belt, 'black');
  assert.equal(report.rank?.tapeCount, 6);
  assert.equal(report.rank?.instructorBars, true);
  assert.equal(report.beltBook?.kids?.history.filter((row) => row.beltId === 'grey-white').length, 1);
});

test('the profile rank line uses an ordinal degree and a stripe count', () => {
  let black = setRankBelt(blankStudentReport(1), 'black', 2);
  black = setRankTapeCount(black, 1, 3);
  assert.equal(rankFaceLabel(wornBeltPreview(black)), 'Black belt · 1st degree');
  black = setRankTapeCount(black, 3, 4);
  assert.equal(rankFaceLabel(wornBeltPreview(black)), 'Black belt · 3rd degree');
  black = setRankTapeCount(black, 0, 5);
  assert.equal(rankFaceLabel(wornBeltPreview(black)), 'Black belt · 0 degrees');

  let blue = setRankBelt(blankStudentReport(6), 'blue', 7);
  blue = setRankTapeCount(blue, 2, 8);
  assert.equal(rankFaceLabel(wornBeltPreview(blue)), 'Blue belt · 2 stripes');
  blue = setRankTapeCount(blue, 1, 9);
  assert.equal(rankFaceLabel(wornBeltPreview(blue)), 'Blue belt · 1 stripe');

  const coral = setRankBelt(blankStudentReport(10), 'coral', 11);
  assert.equal(rankFaceLabel(wornBeltPreview(coral)), 'Coral belt · 7th degree');
  const redWhite = setRankBelt(blankStudentReport(12), 'redWhite', 13);
  assert.equal(rankFaceLabel(wornBeltPreview(redWhite)), 'Red and white belt · 8th degree');
  const red = setRankBelt(blankStudentReport(14), 'red', 15);
  assert.equal(rankFaceLabel(wornBeltPreview(red)), 'Red belt · 9th degree');

  let kids = setBeltMode(blankStudentReport(20), 'kids', 21);
  kids = setKidsBelt(kids, 'grey-white', 22);
  kids = setKidsTapeCount(kids, 2, 23);
  const kidsLabel = rankFaceLabel(wornBeltPreview(kids));
  assert.match(kidsLabel, /2 stripes$/);
  assert.doesNotMatch(kidsLabel, /2nd stripe/);
  assert.doesNotMatch(kidsLabel, /Black belt/);
});

test('coral and red are separate ranks after black', () => {
  assert.equal(adultRankIndex('black') + 1, adultRankIndex('coral'));
  assert.ok(adultRankIndex('coral') < adultRankIndex('redWhite'));
  assert.ok(adultRankIndex('redWhite') < adultRankIndex('red'));
  assert.notEqual(adultRankIndex('coral'), adultRankIndex('red'));
  assert.equal(adultRankIndex('grey'), -1);
});

const WHITE_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function screenshotHistory(): StudentProgressReport {
  const tapes = ['', '', '', ''] as [string, string, string, string];
  const report = blankStudentReport(80);
  return {
    ...report,
    profile: { ...report.profile, belt: 'black', displayName: 'Fixture Student', gymName: 'Synthetic Academy' },
    rank: {
      tapeCount: 0,
      awardedOn: '',
      tapeDates: tapes,
      lineage: ['Fixture Instructor'],
      pictures: [{ belt: 'white', image: WHITE_PHOTO }],
      history: [
        { id: 'fix-purple', belt: 'purple', awardedOn: '2016-07-09', tapeCount: 4, tapeDates: tapes },
        { id: 'fix-brown', belt: 'brown', awardedOn: '2018-11-10', tapeCount: 4, tapeDates: tapes },
        { id: 'fix-white-feb15', belt: 'white', awardedOn: '2014-02-15', tapeCount: 4, tapeDates: tapes },
        { id: 'fix-blue', belt: 'blue', awardedOn: '2015-03-26', tapeCount: 4, tapeDates: tapes },
        { id: 'fix-white-feb3', belt: 'white', awardedOn: '2014-02-03', tapeCount: 4, tapeDates: tapes },
      ],
    },
  };
}

test('a date edit keeps one history id, and a second edit still does after refresh', () => {
  let report = setRankTapeCount(setRankAwardedOn(blankStudentReport(600), '2014-02-03', 601), 4, 602);
  report = setRankBelt(report, 'blue', 603);
  const id = report.rank?.history[0]?.id ?? '';
  assert.equal(report.rank?.history[0]?.belt, 'white');
  report = setRankBelt(report, 'white', 604);
  report = setRankAwardedOn(report, '2014-02-15', 605);
  report = setRankAwardedOn(report, '2014-02-03', 606);
  report = setRankBelt(report, 'black', 607);
  assert.equal(report.profile.belt, 'black');
  assert.equal(report.rank?.awardedOn, '');
  assert.equal(report.rank?.history.filter((row) => row.belt === 'white').length, 1);
  assert.equal(report.rank?.history.find((row) => row.belt === 'white')?.id, id);
  assert.equal(report.rank?.history.find((row) => row.belt === 'white')?.awardedOn, '2014-02-03');
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.rank?.history.filter((row) => row.belt === 'white').length, 1);
  assert.equal(parsed.value.rank?.history.find((row) => row.belt === 'white')?.id, id);
  assert.equal(parsed.value.rank?.history.find((row) => row.belt === 'white')?.awardedOn, '2014-02-03');
  assert.equal(parsed.value.rank?.wornHistoryId, undefined);
  assert.equal(parsed.value.rank?.history.some((row) => row.belt === 'black'), false);
});

test('editing one stored white date does not drop the other white or invent a black date', () => {
  let report = screenshotHistory();
  report = setRankHistoryAwardedOn(report, 'fix-white-feb3', '2014-06-01', 81);
  report = setRankHistoryAwardedOn(report, 'fix-white-feb3', '2014-08-08', 82);
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const history = parsed.value.rank?.history ?? [];
  assert.equal(history.length, 5);
  assert.equal(history.find((row) => row.id === 'fix-white-feb15')?.awardedOn, '2014-02-15');
  assert.equal(history.find((row) => row.id === 'fix-white-feb3')?.awardedOn, '2014-08-08');
  assert.equal(parsed.value.profile.belt, 'black');
  assert.equal(parsed.value.rank?.awardedOn, '');
  assert.equal(history.some((row) => row.belt === 'black'), false);
  assert.equal(parsed.value.rank?.pictures?.[0]?.image, WHITE_PHOTO);
  assert.deepEqual(
    promotionHistoryEntries(parsed.value).map((row) => `${row.label} ${row.awardedOn || 'No date'}`),
    [
      'White 2014-02-15',
      'White 2014-08-08',
      'Blue 2015-03-26',
      'Purple 2016-07-09',
      'Brown 2018-11-10',
      'Black No date',
    ],
  );
  assert.deepEqual(repeatedHistoryBelts(history), ['White']);
  const lines = progressReportLines(parsed.value, { entries: [] });
  assert.equal(lines.filter((line) => line.startsWith('White awarded')).length, 2);
  assert.equal(lines.includes('Current belt awarded: No date'), true);
  assert.equal(lines.some((line) => /Black awarded \d{4}/.test(line)), false);
  const incoming = structuredClone(parsed.value);
  incoming.updatedAt = 70;
  incoming.profile = { ...incoming.profile, belt: 'blue' };
  incoming.rank = {
    ...incoming.rank!,
    awardedOn: '1999-01-01',
    history: [{ id: 'fix-white-other', belt: 'white', awardedOn: '2014-01-01', tapeCount: 4, tapeDates: ['', '', '', ''] }],
  };
  const merged = mergeStudentProgress(parsed.value, incoming);
  const mergedWhites = merged.report.rank?.history.filter((row) => row.belt === 'white') ?? [];
  assert.equal(mergedWhites.length, 3);
  assert.equal(merged.report.profile.belt, 'black');
  assert.equal(merged.report.rank?.awardedOn, '');
  assert.equal(merged.report.rank?.tapeCount, 0);
  assert.equal(merged.report.rank?.history.some((row) => row.belt === 'black'), false);
});

test('two whites with different stripe counts stay distinct when one date changes', () => {
  const tapes = ['', '', '', ''] as [string, string, string, string];
  let report = setRankBelt(blankStudentReport(700), 'blue', 701);
  report = {
    ...report,
    rank: {
      tapeCount: 0,
      awardedOn: '',
      tapeDates: tapes,
      lineage: [],
      history: [
        { id: 'white-two', belt: 'white', awardedOn: '2014-02-03', tapeCount: 2, tapeDates: tapes },
        { id: 'white-four', belt: 'white', awardedOn: '2014-02-15', tapeCount: 4, tapeDates: tapes },
      ],
    },
  };
  report = setRankHistoryAwardedOn(report, 'white-two', '2014-05-05', 702);
  assert.equal(report.rank?.history.length, 2);
  assert.equal(report.rank?.history.find((row) => row.id === 'white-two')?.awardedOn, '2014-05-05');
  assert.equal(report.rank?.history.find((row) => row.id === 'white-two')?.tapeCount, 2);
  assert.equal(report.rank?.history.find((row) => row.id === 'white-four')?.awardedOn, '2014-02-15');
  assert.equal(report.rank?.history.find((row) => row.id === 'white-four')?.tapeCount, 4);
});

test('a blue belt with no black record does not gain a black row', () => {
  const report = setRankAwardedOn(setRankBelt(blankStudentReport(800), 'blue', 801), '2015-03-26', 802);
  const entries = promotionHistoryEntries(report);
  assert.deepEqual(entries.map((row) => row.belt), ['blue']);
  assert.equal(entries[0]?.current, true);
  assert.equal(report.rank?.history.some((row) => row.belt === 'black'), false);
  assert.equal(entries.some((row) => row.belt === 'black'), false);
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
