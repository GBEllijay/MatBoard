import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

if (typeof globalThis.localStorage === 'undefined') {
  const bag = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => {
        bag.set(key, value);
      },
      removeItem: (key: string) => {
        bag.delete(key);
      },
      clear: () => bag.clear(),
    },
  });
}
import {
  academySheetOpen,
  anonymousInstructors,
  beltsPromoted,
  classMinutes,
  cloudTotals,
  eventsForView,
  gymViewFor,
  minutesFromExpected,
  netClasses,
  planTaught,
  rankFacts,
  sanitizeGymEvent,
  stripesGiven,
  studentLabel,
  tenureStats,
} from './gymEvents.ts';
import {
  appendGymEvents,
  readGymEvents,
  readGymMeta,
  recordBackfillPromotion,
  recordCheckIn,
  recordRankFacts,
  recordStudentAdded,
  resetGymEvents,
  setGymActorReaderForTests,
  setGymEventStorageForTests,
  setPlanTaught,
  taughtPlan,
  type MemoryStore,
} from './gymEventLog.ts';
import { ensureGymBackfill, markPastPlansTaught } from './gymBackfill.ts';
import { readRosterCard, recordRosterRankChange, writePrivateCoachNotes } from './rosterCardStore.ts';
import { lightNormalizeRoster } from './rosterBackup.ts';
import {
  addStudent,
  archiveStudent,
  competitorCards,
  getRoster,
  removeStudent,
  resetRoster,
  restoreStudent,
  setCheckedIn,
  studentRosterCards,
} from './rosterStore.ts';
import { setPersonCheckedIn } from './rosterCardActions.ts';
import { emptyPlan, saveDay, TRAINING_NOTES_STORAGE_KEY } from './trainingNotesStore.ts';

function memory(): MemoryStore {
  const bag = new Map<string, string>();
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => {
      bag.set(key, value);
    },
    removeItem: (key) => {
      bag.delete(key);
    },
  };
}

function useLog(): void {
  setGymEventStorageForTests(memory());
  setGymActorReaderForTests(() => ({ licenseId: 'gym-1', seatId: 'owner', name: 'Owner' }));
  resetGymEvents();
  resetRoster();
}

test('rank facts: belt change is a promotion, same-belt stripes are stripe.awarded, a reset is not negative stripes', () => {
  assert.deepEqual(rankFacts({ belt: 'Blue', stripes: 2, lastPromotion: '' }, { belt: 'Purple', stripes: 0, lastPromotion: '2026-11-04' }, '2026-11-04'), [
    { kind: 'promotion', fromBelt: 'Blue', fromStripes: 2, toBelt: 'Purple', toStripes: 0, date: '2026-11-04' },
  ]);
  assert.deepEqual(rankFacts({ belt: 'Blue', stripes: 1, lastPromotion: '' }, { belt: 'Blue', stripes: 3, lastPromotion: '' }, '2026-11-04'), [
    { kind: 'stripes', belt: 'Blue', stripeFrom: 1, stripeTo: 3, date: '2026-11-04' },
  ]);
  assert.deepEqual(rankFacts({ belt: 'Blue', stripes: 2, lastPromotion: '' }, { belt: 'Blue', stripes: 1, lastPromotion: '' }, '2026-11-04'), []);
});

test('sanitize drops notes, journal text, and unknown fields', () => {
  const clean = sanitizeGymEvent({
    id: 'e1',
    type: 'promotion',
    studentId: 'stu-1',
    from: { belt: 'White', stripes: 0 },
    to: { belt: 'Blue', stripes: 0 },
    date: '2026-11-04',
    note: 'private knee note',
    journal: 'injury hiatus body scan',
    privateNotes: 'do not keep',
    photo: 'data:image/png;base64,aaaa',
    name: 'Ana Lima',
    actor: { seatId: 'owner', name: 'Owner' },
    source: 'live',
    v: 1,
    at: '2026-11-04T12:00:00.000Z',
    recordedAt: 1,
    licenseId: 'gym-1',
  });
  const blob = JSON.stringify(clean);
  assert.equal(blob.includes('knee'), false);
  assert.equal(blob.includes('journal'), false);
  assert.equal(blob.includes('Ana'), false);
  assert.equal(blob.includes('privateNotes'), false);
  assert.equal(clean?.type, 'promotion');
});

test('append is idempotent by id, check-in is once per person per day, and class_untaught nets out', () => {
  useLog();
  const event = sanitizeGymEvent({
    id: 'same',
    type: 'student_added',
    studentId: 'stu-1',
    rosterList: 'student',
    belt: 'White',
    actor: { seatId: 'owner', name: 'Owner' },
    source: 'live',
    v: 1,
    at: '2026-11-04T12:00:00.000Z',
    recordedAt: 1,
    licenseId: 'gym-1',
  });
  assert.ok(event);
  assert.equal(appendGymEvents([event, event]), 1);
  assert.equal(appendGymEvents([event]), 0);
  recordCheckIn('stu-1', 'person-1', '2026-11-04');
  recordCheckIn('stu-1', 'person-1', '2026-11-04');
  recordCheckIn('stu-2', 'person-1', '2026-11-04');
  assert.equal(readGymEvents().filter((row) => row.type === 'check_in').length, 1);
  setPlanTaught({ planId: 'plan-1', date: '2026-11-04', taught: true, template: 'adult', classDesignation: 'GB1', minutes: 90 });
  setPlanTaught({ planId: 'plan-1', date: '2026-11-04', taught: true, template: 'adult', classDesignation: 'GB1', minutes: 90 });
  assert.equal(netClasses(readGymEvents()).count, 1);
  assert.equal(taughtPlan('plan-1', '2026-11-04'), true);
  setPlanTaught({ planId: 'plan-1', date: '2026-11-04', taught: false, template: 'adult', classDesignation: 'GB1', minutes: 90 });
  assert.equal(planTaught(readGymEvents(), 'plan-1', '2026-11-04'), false);
  assert.equal(netClasses(readGymEvents()).count, 0);
});

test('class minutes sum expected durations and fall back to 60', () => {
  assert.equal(minutesFromExpected('10 minutes'), 10);
  assert.equal(minutesFromExpected('1 hr'), 60);
  assert.equal(
    classMinutes({ introExpected: '5 min', warmupExpected: '10 minutes', specificExpected: '15 min', cooldownExpected: '3 min', techniques: [{ expected: '8 min' }] }),
    41,
  );
  assert.equal(classMinutes({}), 60);
});

test('roster archive hides the card, restore brings it back, and permanent delete is a tombstone', () => {
  useLog();
  const added = addStudent({ name: 'Ana Lima', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: 'roster note' }, { rosterList: 'student' });
  assert.ok(added);
  writePrivateCoachNotes(added.id, 'secret private note');
  assert.equal(studentRosterCards(getRoster().students).length, 1);
  archiveStudent(added.id, 'paused');
  assert.equal(studentRosterCards(getRoster().students).length, 0);
  assert.equal(getRoster().students.length, 1);
  restoreStudent(added.id);
  assert.equal(studentRosterCards(getRoster().students).some((row) => row.id === added.id), true);
  removeStudent(added.id);
  assert.equal(getRoster().students.some((row) => row.id === added.id), false);
  const events = readGymEvents();
  const blob = JSON.stringify(events);
  assert.equal(events.some((event) => event.type === 'student_added' && event.studentId === added.id), true);
  assert.equal(events.some((event) => event.type === 'student_archived'), true);
  assert.equal(events.some((event) => event.type === 'student_restored'), true);
  assert.equal(events.some((event) => event.type === 'student_deleted' && event.id === `deleted:${added.id}`), true);
  assert.equal(blob.includes('secret private note'), false);
  assert.equal(blob.includes('Ana Lima'), false);
  assert.equal(blob.includes('roster note'), false);
  assert.equal(studentLabel(added.id, [], events), 'Removed student');
});

test('a coach belt save logs stripes, and a promotion that clears stripes does not', () => {
  useLog();
  const added = addStudent({ name: 'Sam Lee', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '', stripes: 1 }, { rosterList: 'student' });
  assert.ok(added);
  writePrivateCoachNotes(added.id, 'secret private note');
  recordRosterRankChange(added.id, { belt: 'Blue', stripes: 1, lastPromotion: '' }, { belt: 'Blue', stripes: 2, lastPromotion: '2026-11-04' }, undefined, '2026-11-04');
  recordRosterRankChange(added.id, { belt: 'Blue', stripes: 2, lastPromotion: '2026-11-04' }, { belt: 'Purple', stripes: 0, lastPromotion: '2026-12-01' }, undefined, '2026-12-01');
  const events = readGymEvents();
  const stripes = events.filter((event) => event.type === 'stripe.awarded');
  const promotions = events.filter((event) => event.type === 'promotion' && event.source === 'live');
  assert.equal(stripes.length, 1);
  assert.equal(stripes[0]?.type === 'stripe.awarded' && stripes[0].stripeFrom, 1);
  assert.equal(stripes[0]?.type === 'stripe.awarded' && stripes[0].stripeTo, 2);
  assert.equal(promotions.length, 1);
  assert.equal(promotions[0]?.type === 'promotion' && promotions[0].to.belt, 'Purple');
  assert.equal(promotions[0]?.type === 'promotion' && promotions[0].to.stripes, 0);
  assert.equal(stripesGiven(events), 1);
  assert.equal(JSON.stringify(events).includes('secret private note'), false);
});

test('check-in from the paired roster action is one event per day', () => {
  useLog();
  const student = addStudent({ name: 'Ana', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' });
  const competitor = addStudent({ name: 'Ana', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' });
  assert.ok(student && competitor);
  setCheckedIn(student.id, true, { personKey: [student.id, competitor.id].sort().join('|') });
  setCheckedIn(competitor.id, true, { personKey: [student.id, competitor.id].sort().join('|') });
  setCheckedIn(student.id, false);
  setCheckedIn(student.id, true, { personKey: [student.id, competitor.id].sort().join('|') });
  assert.equal(readGymEvents().filter((event) => event.type === 'check_in').length, 1);
  assert.equal(competitorCards(getRoster().students).length, 1);
});

test('setPersonCheckedIn still checks in both cards', () => {
  useLog();
  const student = addStudent({ name: 'Bea', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' });
  assert.ok(student);
  setPersonCheckedIn(student.id, true);
  assert.equal(getRoster().students.find((row) => row.id === student.id)?.checkedIn, true);
});

test('backfill is one estimate per current student, skips stripes, and can mark past plans', () => {
  useLog();
  const added = addStudent({ name: 'Cy', belt: 'Blue', division: '', gym: '', lastPromotion: '2024-05-01', lastPromotionDetail: '', note: '', stripes: 3 }, { rosterList: 'student' });
  assert.ok(added);
  resetGymEvents();
  const first = ensureGymBackfill('2026-11-04');
  assert.equal(first.already, false);
  assert.equal(first.students, 1);
  assert.equal(first.promotions, 1);
  const again = ensureGymBackfill('2026-11-04');
  assert.equal(again.already, true);
  const events = readGymEvents();
  assert.equal(events.filter((event) => event.type === 'stripe.awarded').length, 0);
  assert.equal(events.filter((event) => event.type === 'promotion' && event.source === 'backfill').length, 1);
  assert.equal(events.some((event) => event.source === 'backfill' && event.type === 'student_added'), true);
  localStorage.removeItem(TRAINING_NOTES_STORAGE_KEY);
  const past = emptyPlan();
  past.intro = 'Passing';
  past.introExpected = '10 min';
  saveDay('2026-11-01', past, '2026-11-04');
  assert.equal(markPastPlansTaught('2026-11-04'), 1);
  assert.equal(markPastPlansTaught('2026-11-04'), 0);
  assert.equal(readGymMeta().backfillDone, true);
  assert.equal(beltsPromoted(readGymEvents()).find((row) => row.belt === 'Blue')?.estimate, 1);
  assert.equal(readRosterCard(added.id).trainingStartedOn, '');
  recordBackfillPromotion(added.id, 'Blue', '2024-05-01');
  assert.equal(readGymEvents().filter((event) => event.type === 'promotion' && event.source === 'backfill').length, 1);
});

test('seat view keeps own detail and anonymous academy totals', () => {
  const owner = gymViewFor({ seatId: null, preset: null, optedIn: false });
  const coach = gymViewFor({ seatId: 'seat-coach', preset: 'coach', optedIn: false });
  const assistant = gymViewFor({ seatId: 'seat-asst', preset: 'assistant-coach', optedIn: false });
  const opted = gymViewFor({ seatId: 'seat-asst', preset: 'assistant-coach', optedIn: true });
  assert.equal(owner.kind, 'owner');
  assert.equal(coach.kind === 'own' && coach.anonymousTotals, true);
  assert.equal(assistant.kind === 'own' && assistant.anonymousTotals, false);
  assert.equal(academySheetOpen({ seatId: 'seat-asst', preset: 'assistant-coach', optedIn: false }), false);
  assert.equal(academySheetOpen({ seatId: 'seat-asst', preset: 'assistant-coach', optedIn: true }), true);
  assert.equal(opted.kind === 'own' && opted.anonymousTotals, true);
  const events = [
    sanitizeGymEvent({ id: 'a', type: 'class_taught', planId: 'p1', date: '2026-11-01', template: 'adult', classDesignation: 'GB1', minutes: 60, instructorSeat: 'seat-coach', actor: { seatId: 'seat-coach', name: 'Coach' }, source: 'live', v: 1, at: '2026-11-01T12:00:00.000Z', recordedAt: 1, licenseId: 'gym-1' }),
    sanitizeGymEvent({ id: 'b', type: 'class_taught', planId: 'p2', date: '2026-11-02', template: 'kids', classDesignation: 'Kids', minutes: 45, instructorSeat: 'seat-other', actor: { seatId: 'seat-other', name: 'Other' }, source: 'live', v: 1, at: '2026-11-02T12:00:00.000Z', recordedAt: 2, licenseId: 'gym-1' }),
  ].filter((event): event is NonNullable<typeof event> => Boolean(event));
  const split = eventsForView(events, coach);
  assert.equal(split.detail.length, 1);
  assert.equal(split.totals.length, 2);
  const names = anonymousInstructors(
    [
      { seatId: 'seat-coach', name: 'Coach', classes: 1, minutes: 60, promotions: 0, stripes: 0 },
      { seatId: 'seat-other', name: 'Other', classes: 4, minutes: 90, promotions: 2, stripes: 3 },
    ],
    'seat-coach',
  );
  assert.deepEqual(names.map((row) => row.name), ['Coach', 'Other instructors']);
  assert.equal(names[1]?.classes, 4);
  const totals = cloudTotals(events, 2026);
  assert.equal(totals.classes, 2);
  assert.equal(totals.minutes, 105);
});

test('tenure uses start and archive dates and skips a deleted student', () => {
  const events = [
    sanitizeGymEvent({ id: 'added-1', type: 'student_added', studentId: 's1', rosterList: 'student', belt: 'White', startedOn: '2024-01-01', actor: { seatId: 'owner', name: 'Owner' }, source: 'live', v: 1, at: '2024-01-01T12:00:00.000Z', recordedAt: 1, licenseId: 'g' }),
    sanitizeGymEvent({ id: 'added-2', type: 'student_added', studentId: 's2', rosterList: 'student', belt: 'White', actor: { seatId: 'owner', name: 'Owner' }, source: 'live', v: 1, at: '2026-01-01T12:00:00.000Z', recordedAt: 2, licenseId: 'g' }),
    sanitizeGymEvent({ id: 'arch-2', type: 'student_archived', studentId: 's2', reason: 'left', actor: { seatId: 'owner', name: 'Owner' }, source: 'live', v: 1, at: '2026-04-01T12:00:00.000Z', recordedAt: 3, licenseId: 'g' }),
    sanitizeGymEvent({ id: 'deleted:s3', type: 'student_deleted', studentId: 's3', actor: { seatId: 'owner', name: 'Owner' }, source: 'live', v: 1, at: '2026-05-01T12:00:00.000Z', recordedAt: 4, licenseId: 'g' }),
  ].filter((event): event is NonNullable<typeof event> => Boolean(event));
  const tenure = tenureStats(events, '2026-11-04');
  assert.equal(tenure.active, 1);
  assert.equal(tenure.counted, 2);
  assert.ok(tenure.longestDays > 365);
});

test('an archived flag survives the cloud roster normalizer', () => {
  const roster = lightNormalizeRoster({
    students: [{ id: 'a1', name: 'Ana', belt: 'Blue', archivedAt: '2026-11-01T00:00:00.000Z', archivedReason: 'moved' }],
  });
  assert.equal(roster.students[0]?.archivedAt, '2026-11-01T00:00:00.000Z');
  assert.equal(roster.students[0]?.archivedReason, 'moved');
});

test('Student Edition modules do not import the academy log', () => {
  const roots = ['src/pages/student', 'src/lib/progress'];
  const files = ['src/lib/matHours.ts', 'src/lib/matLog.ts', 'src/lib/journalRound.ts', 'src/lib/studentAssessment.ts', 'src/lib/sessionQuality.ts'];
  const banned = /gymEventLog|gymEvents|gymBackfill|gymEventSync|gymActor|matboard\.gymEvents/;
  const walk = (dir: string): string[] => {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) found.push(...walk(path));
      else if (/\.(ts|tsx)$/.test(name)) found.push(path);
    }
    return found;
  };
  const paths = [...roots.flatMap((dir) => walk(dir)), ...files.filter((path) => {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  })];
  assert.ok(paths.length > 10);
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    assert.equal(banned.test(source), false, path);
  }
  const log = readFileSync(new URL('./gymEventLog.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(log, /from '\.\/(matHours|matLog|studentAssessment|sessionQuality|progress\/)/);
  const facts = readFileSync(new URL('./gymEvents.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(facts, /from '\.\/(matHours|matLog|studentAssessment|sessionQuality|journalRound)/);
});

test('recordRankFacts does not copy a private note sitting on the card', () => {
  useLog();
  recordRankFacts('card-1', { belt: 'White', stripes: 0, lastPromotion: '' }, { belt: 'White', stripes: 1, lastPromotion: '2026-11-04' }, '2026-11-04');
  writePrivateCoachNotes('card-1', 'only the coach should read this');
  assert.equal(JSON.stringify(readGymEvents()).includes('only the coach'), false);
});
