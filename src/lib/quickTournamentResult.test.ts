/**
 * Quick tournament results, four class pickers, medal counts, and in-place edits.
 * Older combined division text is kept; a clear line is parsed; belt is never
 * defaulted to Black or to the student's current belt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { medalOf, recentMedals } from './cardMedals.ts';
import { parseResultClass, resultClassLine } from './divisionFields.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { blankStudentReport } from './studentEdition.ts';
import {
  addCompetitionMatch,
  addCompetitionResult,
  updateCompetitionResult,
} from './studentCompetition.ts';

test('Master 3 Middle Brown parses to Master 3 / Middle / Brown, never Black', () => {
  assert.deepEqual(parseResultClass('Master 3 Middle Brown'), {
    ageDivision: 'Master 3',
    competitionDivision: '',
    weightClass: 'Middle',
    belt: 'Brown',
  });
  assert.deepEqual(parseResultClass('Master 3 / Middle / Brown'), {
    ageDivision: 'Master 3',
    competitionDivision: '',
    weightClass: 'Middle',
    belt: 'Brown',
  });
  assert.equal(parseResultClass('Master 3 Middle Brown').belt, 'Brown');
  assert.notEqual(parseResultClass('Master 3 Middle Brown').belt, 'Black');
});

test('unambiguous class lines fill only the clear fields, and leftovers stay blank', () => {
  assert.deepEqual(parseResultClass('Adult Black Medium Heavy'), {
    ageDivision: 'Adult',
    competitionDivision: '',
    weightClass: 'Medium Heavy',
    belt: 'Black',
  });
  assert.deepEqual(parseResultClass('Adult / Feather'), {
    ageDivision: 'Adult',
    competitionDivision: '',
    weightClass: 'Feather',
    belt: '',
  });
  assert.deepEqual(parseResultClass('Adult Blue, Gi'), {
    ageDivision: 'Adult',
    competitionDivision: 'Gi',
    weightClass: '',
    belt: 'Blue',
  });
  assert.deepEqual(parseResultClass('Master 3 Middle'), {
    ageDivision: 'Master 3',
    competitionDivision: '',
    weightClass: 'Middle',
    belt: '',
  });
  assert.deepEqual(parseResultClass('Saturday squad'), {
    ageDivision: '',
    competitionDivision: '',
    weightClass: '',
    belt: '',
  });
  assert.deepEqual(parseResultClass('House League Adult Brown'), {
    ageDivision: '',
    competitionDivision: '',
    weightClass: '',
    belt: '',
  });
  assert.equal(parseResultClass('Master 3 Middle').belt, '');
  assert.equal(resultClassLine({ ageDivision: 'Master 3', weightClass: 'Middle', belt: 'Brown' }), 'Master 3 · Middle · Brown');
  assert.equal(resultClassLine({ division: 'Master 3 Middle Brown' }), 'Master 3 Middle Brown');
});

test('a quick gold result saves, reloads, and counts as a medal without matches', () => {
  let report = blankStudentReport(10);
  report = {
    ...report,
    profile: { ...report.profile, belt: 'black' },
  };
  report = addCompetitionResult(
    report,
    {
      tournamentId: '',
      tournamentName: 'IBJJF Europeans',
      date: '2026-01-24',
      note: 'Paige',
      place: 'gold',
      quick: true,
      ageDivision: 'Master 3',
      competitionDivision: 'Gi',
      weightClass: 'Middle',
      belt: 'Brown',
    },
    11,
  );
  const saved = report.competition?.results[0];
  assert.equal(saved?.quick, true);
  assert.equal(saved?.matches.length, 0);
  assert.equal(saved?.place, 'gold');
  assert.equal(saved?.belt, 'Brown');
  assert.equal(saved?.date, '2026-01-24');
  assert.equal(medalOf(saved!), 'gold');

  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const reloaded = parsed.value.competition?.results[0];
  assert.equal(reloaded?.tournamentName, 'IBJJF Europeans');
  assert.equal(reloaded?.quick, true);
  assert.equal(reloaded?.place, 'gold');
  assert.equal(reloaded?.belt, 'Brown');
  assert.equal(reloaded?.ageDivision, 'Master 3');
  assert.equal(reloaded?.weightClass, 'Middle');
  assert.equal(reloaded?.matches.length, 0);
  const medals = recentMedals(parsed.value.competition);
  assert.equal(medals.length, 1);
  assert.equal(medals[0]?.name, 'IBJJF Europeans');
  assert.equal(medals[0]?.kind, 'gold');
  assert.equal(medals[0]?.belt, 'Brown');
  assert.equal(medals[0]?.date, '2026-01-24');
  assert.equal(medals[0]?.quick, true);
});

test('participated and did-not-place are not medals, and a full match entry still is', () => {
  let report = addCompetitionResult(
    blankStudentReport(20),
    { tournamentId: '', tournamentName: 'Local Open', date: '2026-02-01', place: 'participated', quick: true, belt: 'Purple' },
    21,
  );
  report = addCompetitionResult(
    report,
    { tournamentId: '', tournamentName: 'No Podium', date: '2026-02-02', place: 'dnp', quick: true },
    22,
  );
  report = addCompetitionResult(
    report,
    { tournamentId: '', tournamentName: 'Spring Cup', date: '2026-03-01', ageDivision: 'Adult', belt: 'Blue' },
    23,
  );
  const fullId = report.competition?.results[2]?.id ?? '';
  report = addCompetitionMatch(report, fullId, { opponent: 'Sam', result: 'win', method: 'sub', note: '', date: '2026-03-01' }, 24);
  report = addCompetitionMatch(report, fullId, { opponent: 'Jo', result: 'win', method: 'points', note: '', date: '2026-03-01' }, 25);

  assert.equal(medalOf(report.competition!.results[0]), null);
  assert.equal(medalOf(report.competition!.results[1]), null);
  assert.equal(medalOf(report.competition!.results[2]), 'gold');
  const medals = recentMedals(report.competition);
  assert.deepEqual(medals.map((row) => row.name), ['Spring Cup']);
  assert.equal(medals[0]?.belt, 'Blue');
  assert.equal(medals[0]?.quick, false);
  assert.equal(report.competition?.results[2]?.matches.length, 2);
});

test('an older Europeans file keeps the original text and reads Brown, not Black', () => {
  const raw = {
    schemaVersion: 2,
    kind: 'student-progress-report',
    id: 'student-local',
    studentId: 'student-local',
    updatedAt: 1,
    profile: { id: 'student-local', displayName: 'Paige', gymName: '', belt: 'black', startedOn: '', licenseSource: '' },
    rubric: { id: 'rubric-local', levels: [] },
    journal: [],
    competition: {
      games: { a: { techniques: '', notes: '' }, b: { techniques: '', notes: '' }, c: { techniques: '', notes: '' } },
      tournaments: [],
      weighIns: [],
      results: [
        {
          id: 'result.europeans',
          tournamentId: '',
          tournamentName: 'IBJJF Europeans',
          division: 'Master 3 Middle Brown',
          matches: [
            { id: 'match.1', opponent: 'Alex', result: 'win', method: 'points', note: '', date: '2026-01-24' },
            { id: 'match.2', opponent: 'Sam', result: 'win', method: 'sub', note: '', date: '2026-01-24' },
          ],
          bracket: [],
          bracketPhoto: false,
        },
        {
          id: 'result.local',
          tournamentId: '',
          tournamentName: 'House League',
          division: 'Saturday squad',
          matches: [{ id: 'match.3', opponent: 'Jo', result: 'win', method: 'points', note: '', date: '2026-02-01' }],
          bracket: [],
          bracketPhoto: false,
        },
      ],
      weightUnit: 'lb',
    },
  };
  const parsed = parseProgressPacket(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const europeans = parsed.value.competition?.results[0];
  assert.equal(europeans?.division, 'Master 3 Middle Brown');
  assert.equal(europeans?.ageDivision, 'Master 3');
  assert.equal(europeans?.weightClass, 'Middle');
  assert.equal(europeans?.belt, 'Brown');
  assert.equal(europeans?.competitionDivision, undefined);
  assert.equal(parsed.value.profile.belt, 'black');
  const medals = recentMedals(parsed.value.competition);
  const europeansMedal = medals.find((row) => row.name === 'IBJJF Europeans');
  assert.ok(europeansMedal);
  assert.equal(europeansMedal.belt, 'Brown');
  assert.notEqual(europeansMedal.belt, 'Black');
  assert.equal(europeansMedal.kind, 'gold');

  const unclear = parsed.value.competition?.results[1];
  assert.equal(unclear?.division, 'Saturday squad');
  assert.equal(unclear?.ageDivision, undefined);
  assert.equal(unclear?.belt, undefined);
  assert.equal(unclear?.weightClass, undefined);
  assert.equal(medalOf(unclear!), 'gold');
  assert.equal(medals.some((row) => row.belt.toLowerCase() === 'black'), false);
});

test('editing a result keeps the same id and updates medals in place', () => {
  let report = addCompetitionResult(
    { ...blankStudentReport(30), profile: { ...blankStudentReport(30).profile, belt: 'black' } },
    { tournamentId: '', tournamentName: 'IBJJF Europeans', date: '2026-01-24', place: 'silver', quick: true },
    31,
  );
  const id = report.competition?.results[0]?.id ?? '';
  assert.equal(report.competition?.results[0]?.belt, undefined);
  assert.equal(recentMedals(report.competition)[0]?.belt, '');

  report = updateCompetitionResult(
    report,
    id,
    {
      tournamentId: '',
      tournamentName: 'IBJJF Europeans',
      date: '2026-01-24',
      place: 'gold',
      quick: true,
      ageDivision: 'Master 3',
      weightClass: 'Middle',
      belt: 'Brown',
      note: 'Fixed belt',
    },
    32,
  );
  assert.equal(report.competition?.results.length, 1);
  assert.equal(report.competition?.results[0]?.id, id);
  assert.equal(report.competition?.results[0]?.place, 'gold');
  assert.equal(report.competition?.results[0]?.belt, 'Brown');
  const medals = recentMedals(report.competition);
  assert.equal(medals.length, 1);
  assert.equal(medals[0]?.resultId, id);
  assert.equal(medals[0]?.kind, 'gold');
  assert.equal(medals[0]?.belt, 'Brown');

  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.competition?.results[0]?.id, id);
  assert.equal(parsed.value.competition?.results[0]?.belt, 'Brown');
  assert.equal(parsed.value.competition?.results[0]?.note, 'Fixed belt');
});

test('editing a full entry updates match details in place and leaves a second result alone', () => {
  let report = addCompetitionResult(
    blankStudentReport(40),
    { tournamentId: '', tournamentName: 'Spring Cup', date: '2026-03-01', ageDivision: 'Adult', belt: 'Blue' },
    41,
  );
  const firstId = report.competition?.results[0]?.id ?? '';
  report = addCompetitionMatch(report, firstId, { opponent: 'Sam', result: 'win', method: 'sub', note: 'armbar', date: '2026-03-01' }, 42);
  report = addCompetitionResult(
    report,
    { tournamentId: '', tournamentName: 'Keep Me', date: '2026-04-01', place: 'bronze', quick: true, belt: 'Purple' },
    43,
  );
  const secondId = report.competition?.results[1]?.id ?? '';
  const matchId = report.competition?.results[0]?.matches[0]?.id ?? '';

  report = updateCompetitionResult(
    report,
    firstId,
    {
      tournamentId: '',
      tournamentName: 'Spring Cup',
      date: '2026-03-01',
      ageDivision: 'Adult',
      competitionDivision: 'Gi',
      weightClass: 'Light',
      belt: 'Blue',
      matches: [{ id: matchId, opponent: 'Sam Diaz', result: 'loss', method: 'points', note: 'close', date: '2026-03-01' }],
    },
    44,
  );
  const first = report.competition?.results[0];
  assert.equal(first?.id, firstId);
  assert.equal(first?.matches.length, 1);
  assert.equal(first?.matches[0]?.id, matchId);
  assert.equal(first?.matches[0]?.opponent, 'Sam Diaz');
  assert.equal(first?.matches[0]?.result, 'loss');
  assert.equal(first?.competitionDivision, 'Gi');
  assert.equal(first?.weightClass, 'Light');
  assert.equal(report.competition?.results[1]?.id, secondId);
  assert.equal(report.competition?.results[1]?.place, 'bronze');
  assert.equal(report.competition?.results[1]?.belt, 'Purple');
  assert.equal(medalOf(first!), null);
  assert.equal(recentMedals(report.competition)[0]?.name, 'Keep Me');
});

test('a quick result requires a place, and an older undated match still loads', () => {
  const report = blankStudentReport(50);
  assert.throws(
    () => addCompetitionResult(report, { tournamentId: '', tournamentName: 'Open', quick: true }, 51),
    /Gold, Silver, or Bronze/,
  );
  const raw = {
    schemaVersion: 2,
    kind: 'student-progress-report',
    id: 'student-local',
    studentId: 'student-local',
    updatedAt: 1,
    profile: { id: 'student-local', displayName: '', gymName: '', belt: 'blue', startedOn: '', licenseSource: '' },
    rubric: { id: 'rubric-local', levels: [] },
    journal: [],
    competition: {
      games: { a: { techniques: '', notes: '' }, b: { techniques: '', notes: '' }, c: { techniques: '', notes: '' } },
      tournaments: [],
      weighIns: [],
      results: [
        {
          id: 'result.old',
          tournamentId: '',
          tournamentName: 'Spring Open',
          division: 'Adult Blue',
          matches: [{ id: 'match.old', opponent: 'Sam', result: 'win', method: 'sub', note: 'armbar' }],
          bracket: [],
          bracketPhoto: false,
        },
      ],
      weightUnit: 'lb',
    },
  };
  const parsed = parseProgressPacket(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const result = parsed.value.competition?.results[0];
  assert.equal(result?.division, 'Adult Blue');
  assert.equal(result?.ageDivision, 'Adult');
  assert.equal(result?.belt, 'Blue');
  assert.equal(result?.matches[0]?.date, undefined);
  assert.equal(result?.quick, undefined);
  assert.equal(result?.place, undefined);
  assert.equal(medalOf(result!), 'gold');
});
