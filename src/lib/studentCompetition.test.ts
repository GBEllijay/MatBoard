import assert from 'node:assert/strict';
import test from 'node:test';
import { convertWeight, formatWeight, matchingResults, tournamentsOnDate } from './progress/competition.ts';
import { exportProgressCsv, exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import {
  addStudent,
  getRoster,
  importStudentCompetition,
  importedPlanForName,
  removeStudent,
  resetRoster,
  searchStudents,
} from './rosterStore.ts';
import {
  addJournalEntry,
  blankStudentReport,
  searchStudentJournal,
} from './studentEdition.ts';
import {
  addBracketNote,
  addCompetitionMatch,
  addCompetitionResult,
  addTournament,
  addTournamentGoal,
  addWeighIn,
  removeTournament,
  setBracketPhotoFlag,
  setCompetitionGame,
  setWeightUnit,
} from './studentCompetition.ts';

test('standing game, tournament, and weigh-in stay in one progress file', () => {
  let report = blankStudentReport(10);
  report = setCompetitionGame(report, 'a', { techniques: 'Armbar from mount', notes: 'Finish the grip' }, 11);
  report = addJournalEntry(
    report,
    {
      date: '2026-10-12',
      className: 'Gi',
      gameTag: 'a',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'class note',
    },
    12,
  );
  assert.equal(searchStudentJournal(report, 'armbar').length, 1);
  assert.equal(searchStudentJournal(report, 'armbar')[0].techniqueRefs[0].name, 'Scissor sweep');
  assert.equal(report.journal[0].body.includes('Scissor sweep') || report.journal[0].techniqueRefs[0].name === 'Scissor sweep', true);
  assert.equal(report.competition?.games.a.techniques, 'Armbar from mount');

  report = addTournament(
    report,
    {
      name: 'Spring Open',
      date: '2026-11-02',
      location: 'Atlanta',
      division: 'Adult Blue Middle',
      deadline: '2026-10-20',
      link: 'https://example.com/spring',
      status: 'entered',
      targetWeight: '170',
      targetUnit: 'lb',
    },
    13,
  );
  const tournament = report.competition?.tournaments[0];
  assert.ok(tournament);
  report = addTournamentGoal(report, tournament.id, 'Pass half guard', 'knee slice', 14);
  assert.equal(tournamentsOnDate(report.competition?.tournaments ?? [], '2026-11-02')[0].name, 'Spring Open');
  assert.equal(tournamentsOnDate(report.competition?.tournaments ?? [], '2026-10-20')[0].name, 'Spring Open');
  assert.throws(() => addTournament(report, { ...{
    name: 'Nope',
    date: '2026-11-02',
    location: '',
    division: '',
    deadline: '',
    link: 'javascript:alert(1)',
    status: 'considering' as const,
    targetWeight: '',
    targetUnit: 'lb' as const,
  } }), /http or https/);

  report = addWeighIn(report, { date: '2026-10-01', weight: '170', unit: 'lb', note: 'morning' }, 15);
  report = setWeightUnit(report, 'kg', 16);
  const shown = convertWeight(170, 'lb', 'kg');
  assert.equal(formatWeight(shown, 'kg'), '77.1 kg');
  assert.equal(report.competition?.weighIns[0].unit, 'lb');
  assert.equal(report.competition?.weightUnit, 'kg');

  const parsed = parseProgressPacket(JSON.stringify(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.schemaVersion, 2);
  assert.equal(parsed.value.competition?.tournaments[0].goals[0].name, 'Pass half guard');

  const removed = removeTournament(parsed.value, parsed.value.competition?.tournaments[0].id ?? '', 17);
  assert.equal(removed.competition?.tournaments.length, 0);
  assert.equal(removed.journal.length, 1);
});

test('a coach import keeps the competition plan on the roster and drops it with the competitor', () => {
  resetRoster();
  const added = addStudent({
    name: 'Alex Student',
    belt: 'Blue',
    division: 'Adult Blue',
    gym: '',
    lastPromotion: '',
    note: '',
  });
  assert.ok(added);
  let report = setCompetitionGame(blankStudentReport(20), 'b', { techniques: 'Knee slice', notes: 'far hip' }, 21);
  report = {
    ...report,
    profile: { ...report.profile, displayName: 'Alex Student' },
  };
  const error = importStudentCompetition(added.id, JSON.stringify(report), 22);
  assert.equal(error, '');
  const plan = getRoster().competitionPlans[added.id];
  assert.equal(plan?.games.b.techniques, 'Knee slice');
  assert.equal(plan?.displayName, 'Alex Student');
  assert.equal(importedPlanForName(getRoster(), 'alex student')?.games.b.notes, 'far hip');
  assert.match(importStudentCompetition(added.id, '{"kind":"coach-plan"}'), /not a student progress report|not JSON|schemaVersion/);
  removeStudent(added.id);
  assert.equal(getRoster().competitionPlans[added.id], undefined);
  resetRoster();
});

test('a recorded match and bracket note export, and the photo stays out of the file', () => {
  let report = addCompetitionResult(
    blankStudentReport(30),
    { tournamentId: '', tournamentName: 'Spring Open', division: 'Adult Blue' },
    31,
  );
  const id = report.competition?.results[0]?.id ?? '';
  report = addCompetitionMatch(report, id, { opponent: 'Sam', result: 'win', method: 'sub', note: 'armbar' }, 32);
  report = addBracketNote(report, id, 'Final', 'Sam', 33);
  report = setBracketPhotoFlag(report, id, true, 34);
  const text = exportProgressPacket(report);
  assert.equal(text.includes('data:'), false);
  assert.match(text, /"bracketPhoto":true/);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.competition?.results[0]?.matches[0]?.opponent, 'Sam');
  assert.equal(parsed.value.competition?.results[0]?.matches[0]?.method, 'sub');
  assert.equal(parsed.value.competition?.results[0]?.bracket[0]?.round, 'Final');
  const csv = exportProgressCsv(parsed.value);
  assert.match(csv, /Result,/);
  assert.match(csv, /Match,/);
  assert.match(csv, /Bracket,/);
  assert.match(csv, /Sam/);
  assert.doesNotMatch(csv, /data:image/);
});

test('journal search finds a result, and coach search uses opponent, tournament, or method', () => {
  let report = addCompetitionResult(
    blankStudentReport(40),
    { tournamentId: '', tournamentName: 'Spring Open', division: 'Adult Blue Middle' },
    41,
  );
  const id = report.competition?.results[0]?.id ?? '';
  report = addCompetitionMatch(report, id, { opponent: 'Sam', result: 'win', method: 'sub', note: 'closed the guard' }, 42);
  report = addBracketNote(report, id, 'Quarterfinal', 'Riley', 43);

  assert.equal(matchingResults(report.competition, 'sam').length, 1);
  assert.equal(matchingResults(report.competition, 'Adult Blue').length, 1);
  assert.equal(matchingResults(report.competition, 'win').length, 1);
  assert.equal(matchingResults(report.competition, 'sub').length, 1);
  assert.equal(matchingResults(report.competition, 'closed the guard').length, 1);
  assert.equal(matchingResults(report.competition, 'Riley').length, 1);
  assert.equal(matchingResults(report.competition, 'Quarterfinal').length, 0);
  assert.equal(matchingResults(report.competition, 'missing').length, 0);
  assert.equal(matchingResults(report.competition, '  ').length, 0);
  assert.equal(searchStudentJournal(report, 'Riley').length, 0);

  resetRoster();
  const fighter = addStudent({
    name: 'Alex Student',
    belt: 'Blue',
    division: '',
    gym: '',
    lastPromotion: '',
    note: '',
  });
  const named = addStudent({
    name: 'Sam Diaz',
    belt: 'White',
    division: '',
    gym: '',
    lastPromotion: '',
    note: '',
  });
  assert.ok(fighter && named);
  assert.equal(importStudentCompetition(fighter.id, JSON.stringify(report), 44), '');
  const plans = getRoster().competitionPlans;
  const people = [fighter, named];
  assert.deepEqual(
    searchStudents(people, 'sam', plans).map((row) => row.name),
    ['Sam Diaz', 'Alex Student'],
  );
  assert.deepEqual(searchStudents(people, 'Spring', plans).map((row) => row.name), ['Alex Student']);
  assert.deepEqual(searchStudents(people, 'sub', plans).map((row) => row.name), ['Alex Student']);
  assert.equal(searchStudents(people, 'Riley', plans).length, 0);
  assert.equal(searchStudents(people, 'closed the guard', plans).length, 0);
  assert.equal(searchStudents(people, 'Adult Blue Middle', plans).length, 0);
  assert.equal(searchStudents(people, 'win', plans).length, 0);
  assert.equal(searchStudents(people, 'Sam').length, 1);
  resetRoster();
});
