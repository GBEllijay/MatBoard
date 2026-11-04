import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NO_DATE,
  assessmentSummary,
  benchmarkItems,
  cardBelt,
  cardDate,
  coachRankSource,
  dateFacts,
  initialsOf,
  promotionDates,
} from './rosterCard.ts';
import { nextCoachRankLog, readRosterCard, recordRosterRankChange, readPrivateCoachNotes, writePrivateCoachNotes, updateRosterCard, removeRosterCard, ROSTER_CARD_KEY } from './rosterCardStore.ts';
import { emptyRank, emptyTapeDates } from './studentRank.ts';
import type { AssessmentEntry, AssessmentScores } from './studentAssessment.ts';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

const scores = (n: 1 | 2 | 3 | 4 | 5): AssessmentScores => ({
  guard: n, passing: n, takedowns: n, escapes: n, submissions: n, conditioning: n, mindset: n,
});

test('cardDate reads YYYY-MM-DD and leaves anything else empty', () => {
  assert.equal(cardDate('2026-06-01'), 'Jun 1, 2026');
  assert.equal(cardDate(''), '');
  assert.equal(cardDate('June'), '');
});

test('adult belt with 0 stripes: belt achieved shows, last stripe is —', () => {
  const dates = promotionDates({ profile: { belt: 'purple' }, rank: { ...emptyRank(), awardedOn: '2025-03-14', tapeCount: 0 } });
  const facts = dateFacts(dates);
  assert.equal(facts.beltAchieved, 'Mar 14, 2025');
  assert.equal(facts.lastStripe, NO_DATE);
  assert.equal(facts.lastStripeNote, 'No stripes yet on Purple');
});

test('adult belt with several stripes: last stripe is the newest dated stripe in use', () => {
  const tapeDates = emptyTapeDates();
  tapeDates[0] = '2025-01-10';
  tapeDates[1] = '2025-08-02';
  tapeDates[2] = '2025-05-05';
  tapeDates[3] = '2026-02-01'; // past the stripe count, not in use
  const facts = dateFacts(promotionDates({ profile: { belt: 'blue' }, rank: { ...emptyRank(), awardedOn: '2024-06-01', tapeCount: 3, tapeDates } }));
  assert.equal(facts.beltAchieved, 'Jun 1, 2024');
  assert.equal(facts.lastStripe, 'Aug 2, 2025');
  assert.equal(facts.lastStripeNote, '');
});

test('stripes with no dates read — with a not-recorded note, never a next step', () => {
  const facts = dateFacts(promotionDates({ profile: { belt: 'blue' }, rank: { ...emptyRank(), tapeCount: 2 } }));
  assert.equal(facts.beltAchieved, NO_DATE);
  assert.equal(facts.lastStripe, NO_DATE);
  assert.equal(facts.lastStripeNote, 'Stripe date not recorded');
});

test('black belt degrees past 4 read the high degree dates', () => {
  const tapeDates = ['2010-01-01', '2013-01-01', '2016-01-01', '2019-01-01'] as ReturnType<typeof emptyTapeDates>;
  const dates = promotionDates({
    profile: { belt: 'black' },
    rank: { ...emptyRank(), awardedOn: '2007-01-01', tapeCount: 5, tapeDates, highDegreeDates: ['2024-09-09', ''] },
  });
  assert.equal(dates.lastStripeOn, '2024-09-09');
});

test('kids belt reads the current kids belt dates', () => {
  const dates = promotionDates({
    profile: { belt: 'white' },
    beltBook: {
      mode: 'kids',
      kids: { beltId: 'grey', awardedOn: '2026-01-05', tapeCount: 2, tapeDates: ['2026-03-01', '2026-05-20', '2026-09-01'], history: [], classCount: 0 },
    },
  });
  assert.equal(dates.beltAchievedOn, '2026-01-05');
  assert.equal(dates.lastStripeOn, '2026-05-20');
  const none = promotionDates({
    profile: { belt: 'white' },
    beltBook: { mode: 'kids', kids: { beltId: 'yellow', awardedOn: '2026-02-02', tapeCount: 0, tapeDates: [], history: [], classCount: 0 } },
  });
  assert.equal(dateFacts(none).lastStripe, NO_DATE);
  assert.match(dateFacts(none).lastStripeNote, /^No stripes yet on /);
});

test('roster student rank source: adult and kids belts draw with the existing belt tile', () => {
  const adult = coachRankSource({ belt: 'Purple', stripes: 1, lastPromotion: '2026-04-01' }, { belt: 'Purple', awardedOn: '2025-01-01', stripeDates: ['2026-04-01'] });
  assert.equal(adult.profile.belt, 'purple');
  assert.equal(promotionDates(adult).beltAchievedOn, '2025-01-01');
  assert.equal(promotionDates(adult).lastStripeOn, '2026-04-01');
  assert.equal(cardBelt(adult).belt, 'purple');
  const kids = coachRankSource({ belt: 'Grey', stripes: 0, lastPromotion: '2026-02-02' });
  assert.equal(kids.beltBook?.mode, 'kids');
  assert.equal(promotionDates(kids).beltAchievedOn, '2026-02-02');
  assert.equal(cardBelt(kids).system, 'kids');
  assert.equal(cardBelt(kids).belt, 'grey');
  // A log for an older belt is ignored.
  const stale = coachRankSource({ belt: 'Blue', stripes: 2, lastPromotion: '' }, { belt: 'White', awardedOn: '2020-01-01', stripeDates: ['2020-02-02'] });
  assert.equal(promotionDates(stale).beltAchievedOn, '');
});

test('the card preview never carries next-step text into the facts', () => {
  const facts = dateFacts(promotionDates({ profile: { belt: 'blue' }, rank: { ...emptyRank(), tapeCount: 1, tapeDates: ['2026-01-01', '', '', ''] } }));
  assert.ok(!JSON.stringify(facts).toLowerCase().includes('next'));
});

test('roster editor saves keep belt achieved and stripe dates on the coach card', () => {
  const store = memory();
  recordRosterRankChange('r1', { belt: 'Blue', stripes: 0, lastPromotion: '2025-01-01' }, { belt: 'Blue', stripes: 1, lastPromotion: '2025-06-01' }, store, '2025-06-02');
  let card = readRosterCard('r1', store);
  assert.deepEqual(card.coachRank, { belt: 'Blue', awardedOn: '2025-01-01', stripeDates: ['2025-06-01'] });
  recordRosterRankChange('r1', { belt: 'Blue', stripes: 1, lastPromotion: '2025-06-01' }, { belt: 'Blue', stripes: 2, lastPromotion: '2025-06-01' }, store, '2025-09-09');
  card = readRosterCard('r1', store);
  assert.deepEqual(card.coachRank?.stripeDates, ['2025-06-01', '2025-09-09']);
  recordRosterRankChange('r1', { belt: 'Blue', stripes: 2, lastPromotion: '2025-06-01' }, { belt: 'Purple', stripes: 0, lastPromotion: '2026-01-01' }, store, '2026-01-02');
  card = readRosterCard('r1', store);
  assert.deepEqual(card.coachRank, { belt: 'Purple', awardedOn: '2026-01-01', stripeDates: [] });
  assert.equal(nextCoachRankLog({ belt: 'Purple', stripes: 2, lastPromotion: '' }, { belt: 'Purple', stripes: 1, lastPromotion: '' }, { belt: 'Purple', awardedOn: 'x', stripeDates: ['a', 'b'] }, '2026-01-01')?.stripeDates.length, 1);
  // No change, no write.
  const quiet = memory();
  recordRosterRankChange('r2', { belt: 'Blue', stripes: 1, lastPromotion: '' }, { belt: 'Blue', stripes: 1, lastPromotion: '' }, quiet);
  assert.equal(quiet.data.has(ROSTER_CARD_KEY), false);
});

test('private coach notes live under their own key and leave with the card', () => {
  const store = memory();
  updateRosterCard('r1', (row) => ({ ...row, trainingNotes: 'Hips out' }), store);
  writePrivateCoachNotes('r1', 'Parent asked about fees', store);
  assert.equal(readPrivateCoachNotes('r1', store), 'Parent asked about fees');
  assert.ok(!store.data.get(ROSTER_CARD_KEY)?.includes('fees'));
  removeRosterCard('r1', store);
  assert.equal(readPrivateCoachNotes('r1', store), '');
});

test('assessment summary: coach view by default, gap and trend', () => {
  const coach: AssessmentEntry[] = [
    { id: 'a', date: '2026-01-01', note: '', scores: scores(2) },
    { id: 'b', date: '2026-03-01', note: '', scores: { ...scores(3), guard: 4, escapes: 2 } },
  ];
  const self: AssessmentEntry[] = [{ id: 's', date: '2026-03-02', note: '', scores: { ...scores(3), passing: 5 } }];
  const view = assessmentSummary(coach, self, 'coach');
  assert.equal(view.coachLatest?.id, 'b');
  assert.match(view.strengths, /^Guard/);
  assert.match(view.weaknesses, /^Escapes/);
  assert.equal(view.rows.find((row) => row.id === 'passing')?.gap, 2);
  assert.equal(view.trend?.count, 2);
  assert.equal(view.trend?.from, 2);
  const empty = assessmentSummary([], [], 'coach');
  assert.equal(empty.trend, null);
  assert.equal(empty.strengths, '');
});

test('benchmarks: coach confirms, student marks show as waiting for the coach', () => {
  const rows = [
    { id: 'c1', name: 'Escape mount', met: true, note: '', criteria: [] },
    { id: 'c2', name: 'Pass guard', met: false, note: '', criteria: [] },
    { id: 'c3', name: 'Triangle', met: true, note: '', criteria: [] },
  ];
  const coach = benchmarkItems(rows as never, { c1: true });
  assert.deepEqual(coach.items.map((row) => row.state), ['done', 'open', 'student-done']);
  assert.equal(coach.done, 1);
  const student = benchmarkItems(rows as never, null);
  assert.equal(student.done, 2);
});

test('initials', () => {
  assert.equal(initialsOf('Maya Lopez'), 'ML');
  assert.equal(initialsOf(''), '?');
});
