import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLACK_DEGREE_TABLE,
  blackBeltClock,
  coralRanksUnlocked,
  cumulativeText,
  nextDegreeRule,
  timeSoFarText,
  wornDegree,
  yearsAndMonths,
} from './blackBeltDegrees.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { blankStudentReport } from './studentEdition.ts';
import { setInstructorBars, setInstructorBarsOn, setRankBelt, setRankTapeCount, setRankTapeDate } from './studentRank.ts';
import { nextBelt } from './studentTools.ts';

test('the degree table is the IBJJF guideline, including coral and red', () => {
  assert.deepEqual(
    BLACK_DEGREE_TABLE.map((row) => [row.degree, row.yearsAtPrevious, row.cumulativeYears, row.appearance]),
    [
      [1, 3, 3, 'black'],
      [2, 3, 6, 'black'],
      [3, 3, 9, 'black'],
      [4, 5, 14, 'black'],
      [5, 5, 19, 'black'],
      [6, 5, 24, 'black'],
      [7, 7, 31, 'red-black'],
      [8, 7, 38, 'red-white'],
      [9, 10, 48, 'red'],
    ],
  );
  assert.equal(cumulativeText(BLACK_DEGREE_TABLE[8]!), '48+ years as a black belt');
  assert.equal(nextDegreeRule(0)?.label, '1st degree');
  assert.equal(nextDegreeRule(6)?.label, '7th degree');
  assert.equal(nextDegreeRule(9), null);
  assert.equal(nextBelt('black'), null);
  assert.equal(nextBelt('white'), 'blue');
  assert.equal(nextBelt('coral'), null);
});

test('years and months follow calendar anniversaries', () => {
  assert.deepEqual(yearsAndMonths('2020-01-31', '2021-03-01'), { years: 1, months: 1 });
  assert.deepEqual(yearsAndMonths('2024-05-01', '2024-04-01'), { years: 0, months: 0 });
  assert.equal(timeSoFarText({ years: 1, months: 1 }), '1 year 1 month so far');
  assert.equal(timeSoFarText({ years: 3, months: 0 }), '3 years 0 months so far');
  const clock = blackBeltClock(
    {
      belt: 'black',
      awardedOn: '2018-06-15',
      tapeCount: 2,
      tapeDates: ['2021-06-15', '2024-08-01', '', ''],
      history: [{ belt: 'blue', awardedOn: '2010-01-01', tapeCount: 4, tapeDates: ['', '', '', ''] }],
    },
    '2026-08-01',
  );
  assert.equal(clock?.earliest, '2018-06-15');
  assert.equal(clock?.years, 8);
  assert.equal(clock?.months, 1);
});

test('a saved stripe count of 0 to 4 is that black-belt degree, and 5 to 6 load only on black', () => {
  assert.equal(wornDegree('black', 0), 0);
  assert.equal(wornDegree('black', 4), 4);
  assert.equal(wornDegree('black', 6), 6);
  assert.equal(wornDegree('coral', 0), 7);
  assert.equal(wornDegree('blue', 3), null);
  assert.equal(coralRanksUnlocked('blue'), false);
  assert.equal(coralRanksUnlocked('black'), true);

  const older = blankStudentReport(4);
  older.profile = { ...older.profile, belt: 'black' };
  older.rank = {
    tapeCount: 3,
    awardedOn: '2020-01-02',
    tapeDates: ['2021-02-03', '', '', ''],
    history: [
      {
        id: 'rank-white',
        belt: 'white',
        awardedOn: '2016-04-05',
        tapeCount: 2,
        tapeDates: ['', '2017-01-01', '', ''],
      },
    ],
    lineage: ['Coach Kim'],
  };
  const parsed = parseProgressPacket(exportProgressPacket(older));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.deepEqual(parsed.value.rank, older.rank);
  assert.equal(parsed.value.rank?.instructorBars, undefined);
  assert.equal(parsed.value.rank?.highDegreeDates, undefined);

  const sixth = {
    ...older,
    rank: {
      tapeCount: 6,
      awardedOn: '2000-01-01',
      tapeDates: ['2003-01-01', '2006-01-01', '2009-01-01', '2014-01-01'] as [string, string, string, string],
      highDegreeDates: ['2019-01-01', '2024-01-01'] as [string, string],
      history: [],
      lineage: [],
      instructorBars: true,
      instructorBarsOn: '2002-03-04',
    },
  };
  const high = parseProgressPacket(exportProgressPacket(sixth));
  assert.equal(high.ok, true);
  if (!high.ok || high.value.kind !== 'student-progress-report') return;
  assert.equal(high.value.rank?.tapeCount, 6);
  assert.deepEqual(high.value.rank?.highDegreeDates, ['2019-01-01', '2024-01-01']);
  assert.equal(high.value.rank?.instructorBars, true);
  assert.equal(high.value.rank?.instructorBarsOn, '2002-03-04');

  const tooMany = parseProgressPacket(JSON.stringify({ ...older, profile: { ...older.profile, belt: 'white' }, rank: { tapeCount: 5 } }));
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.match(tooMany.errors.join('\n'), /whole number from 0 to 4/);
});

test('black accepts degrees 5 and 6, and instructor bars stay off the degree count', () => {
  let report = setRankBelt(blankStudentReport(8), 'black', 9);
  report = setRankTapeCount(report, 6, 10);
  report = setRankTapeDate(report, 4, '2024-05-06', 11);
  report = setRankTapeDate(report, 5, '2025-07-08', 12);
  assert.equal(report.rank?.tapeCount, 6);
  assert.deepEqual(report.rank?.tapeDates, ['', '', '', '']);
  assert.deepEqual(report.rank?.highDegreeDates, ['2024-05-06', '2025-07-08']);
  assert.throws(() => setRankTapeCount(report, 7), /0 to 6/);
  report = setInstructorBars(report, true, 13);
  report = setInstructorBarsOn(report, '2002-02-02', 14);
  assert.equal(report.rank?.instructorBars, true);
  assert.equal(report.rank?.tapeCount, 6);
  report = setRankTapeCount(report, 4, 15);
  assert.equal(report.rank?.highDegreeDates, undefined);
  assert.equal(report.rank?.instructorBars, true);
  const blue = setRankBelt(setRankTapeCount(blankStudentReport(1), 2, 2), 'blue', 3);
  assert.throws(() => setRankTapeCount(blue, 5), /0 to 4/);
});
