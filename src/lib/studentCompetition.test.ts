import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldSuggestions, isKnownWeightClass, splitCombinedDivision, suggestionList, tournamentClassLine } from './divisionFields.ts';
import { convertWeight, formatWeight, matchingResults, textHits, tournamentHaystack, tournamentsOnDate } from './progress/competition.ts';
import { exportProgressCsv, exportProgressPacket, parseProgressCsv, parseProgressPacket } from './progress/format.ts';
import { progressReportPdf } from './reportPdf.ts';
import { extractPdfText } from './simplePdf.ts';
import { progressReportLines } from './studentReport.ts';
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
  assert.equal(parsed.value.competition?.results[0]?.matches[0]?.date, undefined);
  assert.equal(Object.hasOwn(report.competition?.results[0]?.matches[0] ?? {}, 'date'), false);
  assert.equal(parsed.value.competition?.results[0]?.bracket[0]?.round, 'Final');
  const csv = exportProgressCsv(parsed.value);
  assert.match(csv, /Result,/);
  assert.match(csv, /Match,/);
  assert.match(csv, /Bracket,/);
  assert.match(csv, /Sam/);
  assert.doesNotMatch(csv, /data:image/);
});

test('a match date is stored only when one is set, and an old match stays undated', () => {
  let report = addCompetitionResult(
    blankStudentReport(50),
    { tournamentId: '', tournamentName: 'Spring Open', division: '' },
    51,
  );
  const id = report.competition?.results[0]?.id ?? '';
  report = addCompetitionMatch(report, id, { opponent: 'Sam', result: 'win', method: 'points', note: '' }, 52);
  report = addCompetitionMatch(
    report,
    id,
    { opponent: 'Jo', result: 'loss', method: 'sub', note: 'closed the guard', date: '2026-10-20' },
    53,
  );
  const matches = report.competition?.results[0]?.matches ?? [];
  assert.equal(Object.hasOwn(matches[0] ?? {}, 'date'), false);
  assert.equal(matches[1]?.date, '2026-10-20');
  assert.throws(
    () => addCompetitionMatch(report, id, { opponent: 'Pat', result: 'draw', method: 'points', note: '', date: '20-10-2026' }, 54),
    /YYYY-MM-DD/,
  );
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const kept = parsed.value.competition?.results[0]?.matches ?? [];
  assert.equal(kept[0]?.date, undefined);
  assert.equal(kept[1]?.date, '2026-10-20');
  assert.equal(kept[1]?.opponent, 'Jo');
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

test('a combined division splits only when the weight class is clear', () => {
  assert.deepEqual(splitCombinedDivision('Adult Blue / Feather'), { division: 'Adult Blue', weightClass: 'Feather' });
  assert.deepEqual(splitCombinedDivision('Master 2 / Light Feather'), { division: 'Master 2', weightClass: 'Light Feather' });
  assert.deepEqual(splitCombinedDivision('Kids|Rooster'), { division: 'Kids', weightClass: 'Rooster' });
  assert.deepEqual(splitCombinedDivision('Adult - Open Class'), { division: 'Adult', weightClass: 'Open Class' });
  assert.deepEqual(splitCombinedDivision('Juvenile, Ultra-Heavy'), { division: 'Juvenile', weightClass: 'Ultra-Heavy' });
  assert.deepEqual(splitCombinedDivision('Adult / Feather Gi'), { division: 'Adult', weightClass: 'Feather Gi' });
  assert.deepEqual(splitCombinedDivision('Adult Black Medium Heavy'), { division: 'Adult Black', weightClass: 'Medium Heavy' });
  assert.deepEqual(splitCombinedDivision('Adult Blue Middle'), { division: 'Adult Blue', weightClass: 'Middle' });
  assert.deepEqual(splitCombinedDivision('Master 2 Light Feather'), { division: 'Master 2', weightClass: 'Light Feather' });
  assert.deepEqual(splitCombinedDivision('No-Gi'), { division: 'No-Gi', weightClass: '' });
  assert.deepEqual(splitCombinedDivision('Adult Blue, Gi'), { division: 'Adult Blue, Gi', weightClass: '' });
  assert.deepEqual(splitCombinedDivision('Feather'), { division: 'Feather', weightClass: '' });
  assert.deepEqual(splitCombinedDivision('Medium Heavy'), { division: 'Medium Heavy', weightClass: '' });
  assert.deepEqual(splitCombinedDivision('Saturday squad'), { division: 'Saturday squad', weightClass: '' });
  assert.deepEqual(splitCombinedDivision(''), { division: '', weightClass: '' });
  assert.equal(isKnownWeightClass('Medium Heavy'), true);
  assert.equal(isKnownWeightClass('Male Rooster'), true);
  assert.equal(isKnownWeightClass('Open'), true);
  assert.equal(isKnownWeightClass('Gi'), false);
  assert.equal(isKnownWeightClass('Adult Black Medium Heavy'), false);
  assert.deepEqual(suggestionList(['Adult', 'Master 1'], ['Adult Blue'], 'blue'), ['Adult Blue']);
  assert.deepEqual(suggestionList(['Adult', 'Master 1', 'Gi'], [], 'a'), ['Adult', 'Master 1']);
  assert.equal(tournamentClassLine({ division: 'Adult', weightClass: 'Feather' }), 'Adult · Feather');
  assert.equal(tournamentClassLine({ division: 'Adult Black', weightClass: 'Medium Heavy' }), 'Adult Black · Medium Heavy');
});

test('division and weight suggestions filter, and an unknown query is empty', () => {
  const openDivision = fieldSuggestions('division', [], '');
  for (const name of ['Juvenile', 'Adult', 'Master 1', 'Master 7', 'Mighty Mite 1', 'Pee Wee 1', 'Junior 1', 'Teen 1', 'Black', 'Grey/Black', 'No-Gi']) {
    assert.equal(openDivision.includes(name), true, name);
  }
  assert.ok(openDivision.length > 2);
  assert.equal(openDivision.length === 2 && openDivision.every((name) => name === 'Black' || name.startsWith('Master')), false);

  const masters = fieldSuggestions('division', [], 'mast');
  assert.equal(masters.includes('Master 1'), true);
  assert.equal(masters.includes('Adult'), false);
  assert.equal(masters.includes('Mighty Mite 1'), false);
  const blacks = fieldSuggestions('division', ['House League'], 'black');
  assert.equal(blacks.includes('Black'), true);
  assert.equal(blacks.includes('Adult Black'), true);
  assert.equal(blacks.includes('Adult'), false);
  assert.equal(blacks.includes('House League'), false);
  assert.deepEqual(fieldSuggestions('division', ['House League'], 'house'), ['House League']);
  assert.deepEqual(fieldSuggestions('division', [], 'zzzz'), []);

  const openWeight = fieldSuggestions('weight', [], '');
  for (const name of ['Rooster', 'Light Feather', 'Ultra Heavy', 'Open Class', 'Male Rooster', 'Female Rooster', 'Kids Rooster']) {
    assert.equal(openWeight.includes(name), true, name);
  }
  assert.equal(openWeight.includes('Heavy'), true);
  const ultras = fieldSuggestions('weight', [], 'ultra');
  assert.equal(ultras.includes('Ultra Heavy'), true);
  assert.equal(ultras.includes('Heavy'), false);
  const female = fieldSuggestions('weight', [], 'female feather');
  assert.equal(female.includes('Female Feather'), true);
  assert.equal(female.includes('Male Feather'), false);
  const kids = fieldSuggestions('weight', [], 'mighty mite rooster');
  assert.equal(kids.some((name) => name.startsWith('Mighty Mite 1 Rooster')), true);
  assert.equal(fieldSuggestions('weight', [], '57.5').includes('Male Rooster'), true);
  assert.equal(fieldSuggestions('weight', ['My class'], 'my class').includes('My class'), true);
  assert.deepEqual(fieldSuggestions('weight', [], 'zzzz'), []);
});

test('division and weight class round-trip, and an older file splits only a clear pair', () => {
  let report = addTournament(
    blankStudentReport(60),
    {
      name: 'Spring Open',
      date: '2026-11-02',
      location: 'Atlanta',
      division: 'Adult Blue',
      weightClass: 'Feather',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '',
      targetUnit: 'lb',
    },
    61,
  );
  const stored = report.competition?.tournaments[0];
  assert.equal(stored?.division, 'Adult Blue');
  assert.equal(stored?.weightClass, 'Feather');
  assert.equal(textHits(tournamentHaystack(stored!), 'feather'), true);
  assert.equal(textHits(tournamentHaystack(stored!), 'adult blue'), true);
  assert.equal(textHits(tournamentHaystack(stored!), 'adult blue / feather'), true);
  assert.equal(textHits(tournamentHaystack(stored!), 'rooster'), false);

  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.competition?.tournaments[0].division, 'Adult Blue');
  assert.equal(parsed.value.competition?.tournaments[0].weightClass, 'Feather');

  const csv = exportProgressCsv(parsed.value);
  const table = parseProgressCsv(csv);
  assert.equal('error' in table, false);
  if ('error' in table) return;
  const weightAt = table.headers.indexOf('Weight class');
  const divisionAt = table.headers.indexOf('Category');
  const sheetAt = table.headers.indexOf('Sheet');
  const tournamentRow = table.rows.find((row) => row[sheetAt] === 'Tournament');
  assert.ok(tournamentRow);
  assert.equal(tournamentRow[divisionAt], 'Adult Blue');
  assert.equal(tournamentRow[weightAt], 'Feather');
  assert.equal(table.headers.at(-1), 'Weight class');

  const olderHeader = table.headers.filter((header) => header !== 'Weight class');
  const olderRow = tournamentRow.slice(0, olderHeader.length);
  const olderCsv = `${olderHeader.join(',')}\r\n${olderRow.join(',')}\r\n`;
  const olderTable = parseProgressCsv(olderCsv);
  assert.equal('error' in olderTable, false);
  if ('error' in olderTable) return;
  assert.equal(olderTable.headers.includes('Weight class'), false);
  assert.equal(olderTable.rows[0]?.[divisionAt], 'Adult Blue');

  const lines = progressReportLines(parsed.value, { entries: [] }).join('\n');
  assert.match(lines, /Spring Open \(entered\) Adult Blue · Feather/);
  const pdf = extractPdfText(progressReportPdf(parsed.value, { entries: [] }, {}, '2026-10-24'));
  assert.match(pdf, /Adult Blue · Feather/);

  const raw = JSON.parse(exportProgressPacket(report)) as {
    competition: { tournaments: { division: string; weightClass?: string }[] };
  };
  raw.competition.tournaments[0].division = 'Adult Blue / Feather';
  delete raw.competition.tournaments[0].weightClass;
  const migrated = parseProgressPacket(JSON.stringify(raw));
  assert.equal(migrated.ok, true);
  if (!migrated.ok || migrated.value.kind !== 'student-progress-report') return;
  assert.equal(migrated.value.competition?.tournaments[0].division, 'Adult Blue');
  assert.equal(migrated.value.competition?.tournaments[0].weightClass, 'Feather');

  raw.competition.tournaments[0].division = 'Adult Black Medium Heavy';
  delete raw.competition.tournaments[0].weightClass;
  const kept = parseProgressPacket(JSON.stringify(raw));
  assert.equal(kept.ok, true);
  if (!kept.ok || kept.value.kind !== 'student-progress-report') return;
  assert.equal(kept.value.competition?.tournaments[0].division, 'Adult Black');
  assert.equal(kept.value.competition?.tournaments[0].weightClass, 'Medium Heavy');

  raw.competition.tournaments[0].division = 'Saturday squad';
  delete raw.competition.tournaments[0].weightClass;
  const unclear = parseProgressPacket(JSON.stringify(raw));
  assert.equal(unclear.ok, true);
  if (!unclear.ok || unclear.value.kind !== 'student-progress-report') return;
  assert.equal(unclear.value.competition?.tournaments[0].division, 'Saturday squad');
  assert.equal(unclear.value.competition?.tournaments[0].weightClass, '');

  raw.competition.tournaments[0].division = 'Adult Blue / Feather';
  raw.competition.tournaments[0].weightClass = 'Middle';
  const explicit = parseProgressPacket(JSON.stringify(raw));
  assert.equal(explicit.ok, true);
  if (!explicit.ok || explicit.value.kind !== 'student-progress-report') return;
  assert.equal(explicit.value.competition?.tournaments[0].division, 'Adult Blue / Feather');
  assert.equal(explicit.value.competition?.tournaments[0].weightClass, 'Middle');
});
