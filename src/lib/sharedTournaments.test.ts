/**
 * One tournament list for Competitor, Calendar, and Results.
 * Older files may have the meet on only one side, or on both.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCompetition } from './progress/competition.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import type { StudentProgressReport, StudentTournament } from './progress/types.ts';
import { shareTournaments } from './sharedTournaments.ts';
import { addTournament, addTournamentGoal, removeTournament, updateTournament } from './studentCompetition.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport } from './studentEdition.ts';
import { addCalendarEvent, eventsOnDate, removeCalendarEvent } from './studentTools.ts';

function meet(patch: Partial<StudentTournament> = {}): StudentTournament {
  return {
    id: 'meet-spring',
    name: 'Spring Open',
    date: '2099-04-04',
    location: 'Atlanta',
    division: 'Adult Blue',
    weightClass: 'Feather',
    deadline: '2099-03-01',
    link: 'https://example.com/spring',
    status: 'entered',
    targetWeight: 170,
    targetUnit: 'lb',
    goals: [{ id: 'goal-1', name: 'Pass', note: 'knee slice', met: false }],
    ...patch,
  };
}

function withLists(
  tournaments: StudentTournament[],
  calendar: StudentProgressReport['calendar'],
): StudentProgressReport {
  const report = blankStudentReport(5);
  report.competition = {
    ...emptyCompetition(),
    tournaments,
    weighIns: [{ id: 'weigh-1', date: '2099-01-02', weight: 170, unit: 'lb', note: 'morning' }],
    results: [
      {
        id: 'result-1',
        tournamentId: tournaments[0]?.id ?? '',
        tournamentName: tournaments[0]?.name ?? 'Spring Open',
        division: 'Adult Blue',
        matches: [],
        bracket: [],
        bracketPhoto: false,
      },
    ],
  };
  report.calendar = calendar;
  return report;
}

test('a competitor tournament becomes one calendar event and stays one after another pass', () => {
  const report = withLists([meet()], [{ id: 'class-1', date: '2099-04-04', title: 'Fundamentals', kind: 'class', note: '' }]);
  const shared = shareTournaments(report);
  assert.equal(shared.competition?.tournaments.length, 1);
  assert.equal(shared.competition?.tournaments[0].id, 'meet-spring');
  assert.equal(shared.competition?.tournaments[0].goals[0].name, 'Pass');
  assert.equal(shared.competition?.weighIns[0].note, 'morning');
  assert.equal(shared.competition?.results[0].tournamentId, 'meet-spring');
  const mirrors = shared.calendar.filter((event) => event.kind === 'other');
  assert.equal(mirrors.length, 1);
  assert.equal(mirrors[0].title, 'Spring Open');
  assert.equal(mirrors[0].date, '2099-04-04');
  assert.equal(mirrors[0].tournamentId, 'meet-spring');
  assert.equal(mirrors[0].note, 'Atlanta');
  assert.equal(shared.calendar.some((event) => event.id === 'class-1' && event.kind === 'class'), true);
  const again = shareTournaments(shared);
  assert.equal(again, shared);
});

test('a calendar tournament becomes one competitor tournament without a second copy', () => {
  const report = withLists(
    [],
    [
      {
        id: 'cal-pan',
        date: '2099-05-02',
        title: 'Pan Kids',
        kind: 'other',
        note: 'gym lobby',
        time: '09:30',
        repeat: 'weekly',
      },
      { id: 'class-1', date: '2099-05-02', title: 'Pan Kids', kind: 'class', note: 'not a tournament' },
    ],
  );
  const shared = shareTournaments(report);
  assert.equal(shared.competition?.tournaments.length, 1);
  assert.equal(shared.competition?.tournaments[0].id, 't.cal-pan');
  assert.equal(shared.competition?.tournaments[0].name, 'Pan Kids');
  assert.equal(shared.competition?.tournaments[0].location, 'gym lobby');
  assert.equal(shared.competition?.tournaments[0].status, 'considering');
  assert.equal(shared.competition?.tournaments[0].goals.length, 0);
  const mirrors = shared.calendar.filter((event) => event.kind === 'other');
  assert.equal(mirrors.length, 1);
  assert.equal(mirrors[0].id, 'cal-pan');
  assert.equal(mirrors[0].time, '09:30');
  assert.equal(mirrors[0].repeat, 'weekly');
  assert.equal(mirrors[0].tournamentId, 't.cal-pan');
  assert.equal(shared.calendar.filter((event) => event.kind === 'class').length, 1);
  assert.equal(eventsOnDate(shared, '2099-05-09').some((event) => event.title === 'Pan Kids'), true);
  assert.equal(shareTournaments(shared), shared);
});

test('the same meet saved on both lists collapses and keeps goals, division, time, and the result id', () => {
  const report = withLists(
    [meet()],
    [
      {
        id: 'cal-spring',
        date: '2099-04-04',
        title: 'spring open',
        kind: 'other',
        note: 'gym lobby',
        time: '09:30',
        repeat: 'weekly',
      },
      {
        id: 'cal-spring-2',
        date: '2099-04-04',
        title: 'Spring Open',
        kind: 'other',
        note: 'bring cash',
        time: '10:00',
      },
      { id: 'promo-1', date: '2099-04-04', title: 'Spring Open', kind: 'promotion', note: 'belt test' },
    ],
  );
  const shared = shareTournaments(report);
  assert.equal(shared.competition?.tournaments.length, 1);
  const tournament = shared.competition?.tournaments[0];
  assert.equal(tournament?.id, 'meet-spring');
  assert.equal(tournament?.location, 'Atlanta');
  assert.equal(tournament?.division, 'Adult Blue');
  assert.equal(tournament?.weightClass, 'Feather');
  assert.equal(tournament?.goals[0].note, 'knee slice');
  assert.equal(shared.competition?.results[0].tournamentId, 'meet-spring');
  const mirrors = shared.calendar.filter((event) => event.kind === 'other');
  assert.equal(mirrors.length, 1);
  assert.equal(mirrors[0].tournamentId, 'meet-spring');
  assert.equal(mirrors[0].title, 'Spring Open');
  assert.equal(mirrors[0].time, '09:30');
  assert.equal(mirrors[0].repeat, 'weekly');
  assert.match(mirrors[0].note, /gym lobby/);
  assert.match(mirrors[0].note, /bring cash/);
  assert.match(mirrors[0].note, /10:00/);
  assert.equal(shared.calendar.some((event) => event.kind === 'promotion' && event.note === 'belt test'), true);
  const text = exportProgressPacket(shared);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.calendar.find((event) => event.kind === 'other')?.tournamentId, 'meet-spring');
  assert.equal(shareTournaments(parsed.value).competition?.tournaments.length, 1);
});

test('a different date stays a second tournament, and a full list does not drop the extra event', () => {
  const report = withLists(
    [meet()],
    [{ id: 'cal-fall', date: '2099-09-09', title: 'Spring Open', kind: 'other', note: 'next one' }],
  );
  const shared = shareTournaments(report);
  assert.equal(shared.competition?.tournaments.length, 2);
  assert.equal(shared.competition?.tournaments.filter((tournament) => tournament.id === 'meet-spring').length, 1);
  assert.equal(shared.calendar.filter((event) => event.kind === 'other').length, 2);

  const full = blankStudentReport(6);
  full.competition = {
    ...emptyCompetition(),
    tournaments: Array.from({ length: 80 }, (_, index) =>
      meet({ id: `meet-${index}`, name: `Meet ${index}`, date: '2099-01-02', goals: [] }),
    ),
  };
  full.calendar = [{ id: 'cal-extra', date: '2099-08-08', title: 'Extra Open', kind: 'other', note: 'keep me' }];
  const capped = shareTournaments(full);
  assert.equal(capped.competition?.tournaments.length, 80);
  assert.equal(capped.competition?.tournaments.some((tournament) => tournament.name === 'Extra Open'), false);
  assert.equal(capped.calendar.some((event) => event.id === 'cal-extra' && event.note === 'keep me'), true);

  const crowded = withLists([meet()], []);
  crowded.calendar = Array.from({ length: 500 }, (_, index) => ({
    id: `class-${index}`,
    date: '2099-02-02',
    title: `Class ${index}`,
    kind: 'class' as const,
    note: '',
  }));
  const noRoom = shareTournaments(crowded);
  assert.equal(noRoom.competition?.tournaments.length, 1);
  assert.equal(noRoom.competition?.tournaments[0].goals[0].name, 'Pass');
  assert.equal(noRoom.calendar.length, 500);
  assert.equal(noRoom.calendar.some((event) => event.kind === 'other'), false);
});

test('editing or deleting on either side updates the shared list', () => {
  let report = addTournament(
    blankStudentReport(10),
    {
      name: 'Spring Open',
      date: '2099-04-04',
      location: 'Atlanta',
      division: 'Adult Blue',
      weightClass: 'Feather',
      deadline: '2099-03-01',
      link: 'https://example.com/spring',
      status: 'entered',
      targetWeight: '170',
      targetUnit: 'lb',
    },
    11,
  );
  const id = report.competition?.tournaments[0].id ?? '';
  report = addTournamentGoal(report, id, 'Pass', 'knee slice', 12);
  assert.equal(report.calendar.filter((event) => event.kind === 'other' && event.tournamentId === id).length, 1);

  report = updateTournament(
    report,
    id,
    {
      name: 'Summer Open',
      date: '2099-06-06',
      location: 'Savannah',
      division: 'Adult Blue',
      weightClass: 'Feather',
      deadline: '2099-05-01',
      link: 'https://example.com/spring',
      status: 'considering',
      targetWeight: '160',
      targetUnit: 'kg',
    },
    13,
  );
  const moved = report.calendar.find((event) => event.tournamentId === id);
  assert.equal(moved?.title, 'Summer Open');
  assert.equal(moved?.date, '2099-06-06');
  assert.equal(moved?.note, 'Savannah');
  assert.equal(report.competition?.tournaments[0].goals[0].name, 'Pass');
  assert.equal(eventsOnDate(report, '2099-04-04').some((event) => event.tournamentId === id), false);
  assert.equal(eventsOnDate(report, '2099-06-06').some((event) => event.title === 'Summer Open'), true);

  const fromCalendar = addCalendarEvent(
    report,
    { date: '2099-07-07', title: 'Pan Kids', kind: 'other', note: 'Atlanta', time: '18:00', repeat: 'monthly' },
    14,
  );
  assert.equal(fromCalendar.competition?.tournaments.some((tournament) => tournament.name === 'Pan Kids'), true);
  const pan = fromCalendar.competition?.tournaments.find((tournament) => tournament.name === 'Pan Kids');
  assert.equal(pan?.location, 'Atlanta');
  assert.equal(fromCalendar.calendar.filter((event) => event.kind === 'other' && event.tournamentId === pan?.id).length, 1);
  const again = addCalendarEvent(
    fromCalendar,
    { date: '2099-07-07', title: 'Pan Kids', kind: 'other', note: 'bring gi', time: '19:00', repeat: 'none' },
    15,
  );
  assert.equal(again.competition?.tournaments.filter((tournament) => tournament.name === 'Pan Kids').length, 1);
  assert.equal(again.calendar.filter((event) => event.tournamentId === pan?.id).length, 1);
  assert.equal(again.calendar.find((event) => event.tournamentId === pan?.id)?.time, '19:00');
  assert.equal(again.calendar.find((event) => event.tournamentId === pan?.id)?.repeat, undefined);
  assert.equal(again.competition?.tournaments.find((tournament) => tournament.id === id)?.goals[0].name, 'Pass');

  const training = addCalendarEvent(again, { date: '2099-07-07', title: 'Open mat', kind: 'training', note: 'no-gi' }, 16);
  assert.equal(training.competition?.tournaments.some((tournament) => tournament.name === 'Open mat'), false);
  assert.equal(training.calendar.filter((event) => event.kind === 'training').length, 1);

  const removedEvent = removeCalendarEvent(training, training.calendar.find((event) => event.tournamentId === pan?.id)?.id ?? '', 17);
  assert.equal(removedEvent.competition?.tournaments.some((tournament) => tournament.name === 'Pan Kids'), false);
  assert.equal(removedEvent.calendar.some((event) => event.tournamentId === pan?.id), false);
  assert.equal(removedEvent.competition?.tournaments.some((tournament) => tournament.id === id), true);
  assert.equal(removedEvent.calendar.some((event) => event.kind === 'training'), true);

  const removedMeet = removeTournament(removedEvent, id, 18);
  assert.equal(removedMeet.competition?.tournaments.some((tournament) => tournament.id === id), false);
  assert.equal(removedMeet.calendar.some((event) => event.tournamentId === id), false);
  assert.equal(removedMeet.calendar.some((event) => event.kind === 'training'), true);
  assert.equal(removedMeet.competition?.results[0], undefined);
});

test('a raw saved file migrates on load and the ids stay put', () => {
  const storage = {
    value: '',
    getItem() {
      return this.value;
    },
    setItem(_key: string, value: string) {
      this.value = value;
    },
  };
  const raw = withLists(
    [meet()],
    [{ id: 'cal-pan', date: '2099-05-02', title: 'Pan Kids', kind: 'other', note: 'gym lobby' }],
  );
  storage.setItem('matboard.studentEdition.progress.v1', JSON.stringify(raw));
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.competition?.tournaments.length, 2);
  assert.equal(loaded.competition?.tournaments.find((tournament) => tournament.name === 'Pan Kids')?.id, 't.cal-pan');
  assert.equal(loaded.competition?.tournaments.find((tournament) => tournament.id === 'meet-spring')?.goals[0].name, 'Pass');
  const second = loadStudentReport(storage);
  assert.equal(second.competition?.tournaments.find((tournament) => tournament.name === 'Pan Kids')?.id, 't.cal-pan');
  assert.equal(second.calendar.find((event) => event.tournamentId === 'meet-spring')?.title, 'Spring Open');
  const saved = saveStudentReport(storage, loaded);
  const roundTrip = loadStudentReport(storage);
  assert.equal(roundTrip.competition?.tournaments.length, saved.competition?.tournaments.length);
  assert.equal(roundTrip.competition?.results[0].tournamentId, 'meet-spring');
  assert.equal(roundTrip.competition?.weighIns[0].note, 'morning');
});
