import assert from 'node:assert/strict';
import test from 'node:test';
import { convertWeight, formatWeight, tournamentsOnDate } from './progress/competition.ts';
import { exportProgressCsv, exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import {
  addStudent,
  getRoster,
  importStudentCompetition,
  importedPlanForName,
  removeStudent,
  resetRoster,
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
