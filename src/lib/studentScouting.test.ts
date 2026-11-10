import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CompetitionResult } from './progress/types.ts';
import {
  SCOUTING_STORAGE_KEY,
  SAMPLE_OPPONENT_ID,
  addScoutBout,
  addScoutingCard,
  exportScoutingCsv,
  importScoutingCsv,
  loadScouting,
  pastMatchesFor,
  removeScoutBout,
  saveScouting,
  scoutRecord,
  scoutingCsvHeaders,
  scoutingCsvTemplate,
  scoutingExportFileName,
  searchScoutingCards,
  seedSampleScouting,
  updateScoutBout,
  updateScoutingCard,
} from './studentScouting.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const result: CompetitionResult = {
  id: 'result.spring',
  tournamentId: 't1',
  tournamentName: 'Spring Open',
  division: 'Adult Blue Middle',
  matches: [{ id: 'match.sam', opponent: 'Sam', result: 'win', method: 'sub', note: 'closed the guard' }],
  bracket: [],
  bracketPhoto: false,
};

test('a scouting card keeps style and class through the roster csv', () => {
  const cards = addScoutingCard(
    [],
    {
      name: 'Sam',
      gym: 'Atos',
      belt: 'blue',
      weightClass: 'Middle',
      group: 'open',
      style: 'pressure passer',
      notes: 'long arms',
    },
    10,
  );
  assert.equal(cards[0].belt, 'Blue');
  assert.equal(cards[0].group, 'open');
  const csv = exportScoutingCsv(cards);
  assert.match(csv, /Name,Belt,Division/);
  assert.match(csv, /Style,Class/);
  const imported = importScoutingCsv(csv);
  assert.equal(imported.error, undefined);
  assert.equal(imported.cards[0].name, 'Sam');
  assert.equal(imported.cards[0].gym, 'Atos');
  assert.equal(imported.cards[0].belt, 'Blue');
  assert.equal(imported.cards[0].weightClass, 'Middle');
  assert.equal(imported.cards[0].style, 'pressure passer');
  assert.equal(imported.cards[0].notes, 'long arms');
  assert.equal(imported.cards[0].group, 'open');

  const coach = importScoutingCsv('Name,Belt,Weight class,School,Notes\nRiley,Purple,Light,Checkmat,lefty\n');
  assert.equal(coach.cards.length, 1);
  assert.equal(coach.cards[0].weightClass, 'Light');
  assert.equal(coach.cards[0].gym, 'Checkmat');
  assert.equal(coach.cards[0].notes, 'lefty');
  assert.equal(coach.cards[0].group, 'weight');
  assert.equal(coach.cards[0].style, '');
});

test('search finds style and a recorded match, and the name links that match', () => {
  let cards = addScoutingCard(
    [],
    {
      name: 'Sam',
      gym: 'Atos',
      belt: 'Blue',
      weightClass: 'Middle',
      group: 'weight',
      style: 'pressure passer',
      notes: '',
    },
    11,
  );
  cards = addScoutingCard(
    cards,
    {
      name: 'Riley',
      gym: '',
      belt: 'Purple',
      weightClass: '',
      group: 'open',
      style: '',
      notes: 'open finalist',
    },
    12,
  );
  assert.deepEqual(
    searchScoutingCards(cards, [result], 'pressure').map((card) => card.name),
    ['Sam'],
  );
  assert.deepEqual(
    searchScoutingCards(cards, [result], 'spring').map((card) => card.name),
    ['Sam'],
  );
  assert.deepEqual(
    searchScoutingCards(cards, [result], 'open class').map((card) => card.name),
    ['Riley'],
  );
  const hits = pastMatchesFor('sam', [result]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].result.tournamentName, 'Spring Open');
  assert.equal(hits[0].match.method, 'sub');
  assert.equal(pastMatchesFor('Samantha', [result]).length, 0);

  const storage = memory();
  const saved = saveScouting(storage, cards);
  const loaded = loadScouting(storage);
  assert.equal(loaded.length, 2);
  const edited = updateScoutingCard(saved, saved[0].id, {
    name: 'Sam',
    gym: 'Atos',
    belt: 'Blue',
    weightClass: 'Medium Heavy',
    group: 'weight',
    style: 'pressure passer',
    notes: 'watch the underhook',
  });
  assert.equal(edited[0].weightClass, 'Medium Heavy');
  assert.equal(edited[0].notes, 'watch the underhook');
  assert.deepEqual(edited[0].ratings, {});
});

const rated = {
  guard: 4,
  passing: 2,
  takedowns: 5,
  escapes: 3,
  submissions: 1,
  conditioning: 4,
  mindset: 5,
} as const;

test('ratings and notes stay on the card, and a card saved without them still loads', () => {
  const storage = memory();
  storage.setItem(
    'matboard.studentEdition.scouting.v1',
    JSON.stringify({
      version: 1,
      cards: [{ id: 'scout.old', name: 'Riley', gym: 'Checkmat', belt: 'Purple', weightClass: 'Light', group: 'open', style: '', notes: 'lefty' }],
    }),
  );
  const legacy = loadScouting(storage);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].name, 'Riley');
  assert.equal(legacy[0].group, 'open');
  assert.deepEqual(legacy[0].ratings, {});
  assert.equal(legacy[0].strengths, '');
  assert.equal(legacy[0].weaknesses, '');

  const cards = addScoutingCard(
    legacy,
    {
      name: 'Sam',
      gym: 'Atos',
      belt: 'Blue',
      weightClass: 'Middle',
      group: 'weight',
      style: 'pressure',
      notes: '',
      ratings: { ...rated, guard: 9 as never, passing: '2' as never },
      strengths: 'frames',
      weaknesses: 'open guard',
    },
    20,
  );
  assert.equal(cards[1].ratings.guard, undefined);
  assert.equal(cards[1].ratings.passing, 2);
  assert.equal(cards[1].ratings.takedowns, 5);
  const saved = saveScouting(storage, cards);
  const loaded = loadScouting(storage);
  assert.equal(loaded[1].strengths, 'frames');
  assert.equal(loaded[1].weaknesses, 'open guard');
  assert.equal(loaded[1].ratings.mindset, 5);
  const renamed = updateScoutingCard(saved, saved[1].id, {
    name: 'Sam',
    gym: 'Atos',
    belt: 'Blue',
    weightClass: 'Medium Heavy',
    group: 'weight',
    style: 'pressure',
    notes: 'watch the underhook',
  });
  assert.equal(renamed[1].weightClass, 'Medium Heavy');
  assert.equal(renamed[1].ratings.mindset, 5);
  assert.equal(renamed[1].strengths, 'frames');
  assert.deepEqual(
    searchScoutingCards(renamed, [], 'frames').map((card) => card.name),
    ['Sam'],
  );
});

test('csv export writes the eight ratings and import still accepts a file without them', () => {
  const cards = addScoutingCard(
    [],
    {
      name: 'Sam',
      gym: 'Atos',
      belt: 'Blue',
      weightClass: 'Middle',
      group: 'weight',
      style: 'pressure passer',
      notes: 'long arms',
      ratings: rated,
      strengths: 'frames, long',
      weaknesses: 'open guard',
    },
    21,
  );
  const csv = exportScoutingCsv(cards);
  assert.match(csv, /Style,Class,Guard,Passing,Sweeps,Takedowns,Escapes,Submissions,Conditioning,Mindset,Strengths,Weaknesses,Record/);
  const imported = importScoutingCsv(csv);
  assert.equal(imported.error, undefined);
  assert.deepEqual(imported.cards[0].ratings, rated);
  assert.equal(imported.cards[0].strengths, 'frames, long');
  assert.equal(imported.cards[0].weaknesses, 'open guard');
  assert.equal(imported.cards[0].style, 'pressure passer');
  assert.equal(imported.cards[0].group, 'weight');

  const old = importScoutingCsv('Name,Belt,Weight class,School,Notes\nRiley,Purple,Light,Checkmat,lefty\n');
  assert.equal(old.cards.length, 1);
  assert.deepEqual(old.cards[0].ratings, {});
  assert.equal(old.cards[0].strengths, '');
  assert.equal(old.cards[0].weaknesses, '');

  const messy = importScoutingCsv(
    'Name,Belt,Guard,Passing,Takedowns,Escapes,Submissions,Conditioning,Mindset\nAlex,Blue,5,4,9,,2,1,3\n',
  );
  assert.equal(messy.cards[0].ratings.guard, 5);
  assert.equal(messy.cards[0].ratings.passing, 4);
  assert.equal(messy.cards[0].ratings.takedowns, undefined);
  assert.equal(messy.cards[0].ratings.escapes, undefined);
  assert.equal(messy.cards[0].ratings.submissions, 2);
  assert.equal(messy.cards[0].style, '');
});

test('the scouting template matches the export, and old and new csv files import', () => {
  assert.equal(scoutingExportFileName('2026-10-23'), 'advantage-student-scouting-2026-10-23.csv');
  const headers = scoutingCsvHeaders();
  assert.equal(exportScoutingCsv([]).split('\r\n')[0], headers.join(','));
  assert.equal(scoutingCsvTemplate().split('\r\n')[0], headers.join(','));
  assert.ok(headers.includes('Competitor Notes'));
  assert.ok(headers.includes('Style'));
  assert.ok(headers.includes('Class'));
  for (const label of ['Guard', 'Passing', 'Sweeps', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset', 'Record']) {
    assert.ok(headers.includes(label));
  }

  const fixture = readFileSync(new URL('./fixtures/scouting-export.csv', import.meta.url), 'utf8');
  const fromExport = importScoutingCsv(fixture);
  assert.equal(fromExport.error, undefined);
  assert.equal(fromExport.cards.length, 3);
  assert.equal(fromExport.cards[0].name, 'Dario Kent (mock)');
  assert.equal(fromExport.cards[0].notes.includes('Austin'), true);
  assert.equal(fromExport.cards[0].style.includes('berimbolo'), true);
  assert.equal(fromExport.cards[2].group, 'open');

  const oldTemplate = importScoutingCsv(
    'Name,Belt,Division,Gym name / nickname,Last promotion,Last promotion detail,Notes,Check In\nRiley,Purple,Light,Checkmat,,,lefty,\n',
  );
  assert.equal(oldTemplate.error, undefined);
  assert.equal(oldTemplate.cards[0].notes, 'lefty');
  assert.equal(oldTemplate.cards[0].style, '');
  assert.deepEqual(oldTemplate.cards[0].ratings, {});

  const roundTrip = importScoutingCsv(exportScoutingCsv(fromExport.cards));
  assert.equal(roundTrip.cards[0].name, 'Dario Kent (mock)');
  assert.equal(roundTrip.cards[0].style.includes('berimbolo'), true);
  assert.equal(roundTrip.cards[2].group, 'open');
  assert.deepEqual(roundTrip.cards[0].bouts, []);
  assert.equal(roundTrip.cards[0].ratings.sweeps, undefined);
});

test('an older seven-area card migrates in place and keeps every saved field', () => {
  const storage = memory();
  const raw = {
    version: 1,
    cards: [
      {
        id: 'scout.old',
        name: 'Riley',
        gym: 'Checkmat',
        belt: 'Purple',
        weightClass: 'Light',
        group: 'open',
        style: 'guard puller',
        notes: 'lefty',
        ratings: { guard: 4, passing: 2, takedowns: 5, escapes: 3, submissions: 1, conditioning: 4, mindset: 5 },
        strengths: 'frames',
        weaknesses: 'open guard',
      },
    ],
  };
  storage.setItem(SCOUTING_STORAGE_KEY, JSON.stringify(raw));
  const loaded = loadScouting(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 'scout.old');
  assert.equal(loaded[0].name, 'Riley');
  assert.equal(loaded[0].gym, 'Checkmat');
  assert.equal(loaded[0].group, 'open');
  assert.equal(loaded[0].notes, 'lefty');
  assert.equal(loaded[0].ratings.guard, 4);
  assert.equal(loaded[0].ratings.mindset, 5);
  assert.equal(loaded[0].ratings.sweeps, undefined);
  assert.equal(loaded[0].strengths, 'frames');
  assert.deepEqual(loaded[0].bouts, []);

  const saved = saveScouting(storage, loaded);
  const again = loadScouting(storage);
  assert.equal(again[0].id, 'scout.old');
  assert.equal(again[0].ratings.guard, 4);
  assert.equal(again[0].ratings.sweeps, undefined);
  assert.equal(again[0].notes, 'lefty');
  assert.match(storage.getItem(SCOUTING_STORAGE_KEY) ?? '', /"version":1/);
  assert.match(storage.getItem(SCOUTING_STORAGE_KEY) ?? '', /scout\.old/);

  const withSweeps = updateScoutingCard(saved, 'scout.old', {
    name: 'Riley',
    gym: 'Checkmat',
    belt: 'Purple',
    weightClass: 'Light',
    group: 'open',
    style: 'guard puller',
    notes: 'lefty',
    ratings: { ...saved[0].ratings, sweeps: 2 },
    bouts: addScoutBout([], { result: 'win', date: '2026-04-01', event: 'Spring Open', method: 'armbar' }, 40),
  });
  saveScouting(storage, withSweeps);
  const migrated = loadScouting(storage);
  assert.equal(migrated[0].ratings.guard, 4);
  assert.equal(migrated[0].ratings.sweeps, 2);
  assert.equal(migrated[0].strengths, 'frames');
  assert.equal(migrated[0].bouts[0].result, 'win');
  assert.equal(migrated[0].bouts[0].event, 'Spring Open');
});

test('csv round-trip keeps eight ratings, notes, and the win loss record', () => {
  const bouts = addScoutBout(
    addScoutBout([], { result: 'win', date: '2026-03-14', event: 'City Open, finals', method: 'armbar "tight"' }, 41),
    { result: 'loss', date: '', event: '', method: '' },
    42,
  );
  const cards = addScoutingCard(
    [],
    {
      name: 'Sam',
      gym: 'Atos',
      belt: 'Blue',
      weightClass: 'Middle',
      group: 'weight',
      style: 'pressure passer',
      notes: 'long arms',
      ratings: { ...rated, sweeps: 3 },
      strengths: 'frames, long',
      weaknesses: 'open guard',
      bouts,
    },
    43,
  );
  const imported = importScoutingCsv(exportScoutingCsv(cards));
  assert.equal(imported.error, undefined);
  assert.equal(imported.cards[0].ratings.sweeps, 3);
  assert.deepEqual(imported.cards[0].ratings, { ...rated, sweeps: 3 });
  assert.equal(imported.cards[0].strengths, 'frames, long');
  assert.equal(imported.cards[0].weaknesses, 'open guard');
  assert.equal(imported.cards[0].notes, 'long arms');
  assert.equal(imported.cards[0].style, 'pressure passer');
  assert.deepEqual(imported.cards[0].bouts, bouts);

  const legacyLabels = importScoutingCsv(
    'Name,Belt,Guard/Control,Passing,Sweeps,Takedowns,Escapes/Defense,Submissions,Conditioning,Mindset\nAlex,Blue,5,4,2,3,1,4,5,3\n',
  );
  assert.equal(legacyLabels.cards[0].ratings.guard, 5);
  assert.equal(legacyLabels.cards[0].ratings.sweeps, 2);
  assert.equal(legacyLabels.cards[0].ratings.escapes, 1);
  assert.deepEqual(legacyLabels.cards[0].bouts, []);

  const oldSeven = importScoutingCsv(
    'Name,Belt,Guard,Passing,Takedowns,Escapes,Submissions,Conditioning,Mindset,Strengths,Weaknesses\nRiley,Purple,4,2,5,3,1,4,5,frames,open guard\n',
  );
  assert.equal(oldSeven.cards[0].ratings.guard, 4);
  assert.equal(oldSeven.cards[0].ratings.sweeps, undefined);
  assert.equal(oldSeven.cards[0].strengths, 'frames');
  assert.deepEqual(oldSeven.cards[0].bouts, []);
});

test('the record counts manual results and competition matches once', () => {
  let cards = addScoutingCard(
    [],
    { name: 'Sam', gym: 'Atos', belt: 'Blue', weightClass: 'Middle', group: 'weight', style: '', notes: '' },
    50,
  );
  let bouts = addScoutBout([], { result: 'win', event: 'Spring Open', date: '', method: 'armbar' }, 51);
  bouts = addScoutBout(bouts, { result: 'loss', event: 'Other Open', date: '2026-05-01', method: '' }, 52);
  bouts = addScoutBout(bouts, { result: 'draw', event: '', date: '', method: '' }, 53);
  cards = updateScoutingCard(cards, cards[0].id, {
    name: 'Sam',
    gym: 'Atos',
    belt: 'Blue',
    weightClass: 'Middle',
    group: 'weight',
    style: '',
    notes: '',
    bouts,
  });
  const spring: CompetitionResult = {
    ...result,
    matches: [
      { id: 'match.sam', opponent: 'Sam', result: 'win', method: 'sub', note: 'closed the guard' },
      { id: 'match.other', opponent: 'Sam', result: 'win', method: 'points', note: '', date: '2026-04-02' },
    ],
  };
  const counted = scoutRecord(cards[0], [spring]);
  assert.equal(counted.line, '2-1-1');
  assert.equal(counted.wins, 2);
  assert.equal(counted.losses, 1);
  assert.equal(counted.draws, 1);

  const sameDay = {
    ...spring,
    matches: [{ id: 'match.dated', opponent: 'Sam', result: 'loss', method: 'points', note: '', date: '2026-05-01' }],
  };
  const dated = updateScoutingCard(cards, cards[0].id, {
    name: 'Sam',
    gym: 'Atos',
    belt: 'Blue',
    weightClass: 'Middle',
    group: 'weight',
    style: '',
    notes: '',
    bouts: [{ id: 'bout.same', result: 'loss', date: '2026-05-01', event: 'Spring Open', method: 'points' }],
  });
  assert.equal(scoutRecord(dated[0], [sameDay]).line, '0-1-0');

  const differentDay = updateScoutingCard(cards, cards[0].id, {
    name: 'Sam',
    gym: 'Atos',
    belt: 'Blue',
    weightClass: 'Middle',
    group: 'weight',
    style: '',
    notes: '',
    bouts: [{ id: 'bout.diff', result: 'loss', date: '2026-01-01', event: 'Spring Open', method: '' }],
  });
  const split = {
    ...spring,
    matches: [{ id: 'match.later', opponent: 'Sam', result: 'loss', method: 'points', note: '', date: '2026-05-01' }],
  };
  assert.equal(scoutRecord(differentDay[0], [split]).line, '0-2-0');

  const edited = updateScoutBout(bouts, bouts[0].id, { result: 'draw', event: 'Finals', date: '2026-03-01', method: 'points' });
  assert.equal(edited[0].result, 'draw');
  assert.equal(edited[0].id, bouts[0].id);
  assert.equal(removeScoutBout(edited, edited[0].id).some((bout) => bout.id === edited[0].id), false);
  assert.equal(scoutRecord({ ...cards[0], bouts: [] }, []).line, '0-0-0');
});

test('sample opponents are written only for an empty archive opened with sample=1', () => {
  const storage = memory();
  assert.equal(seedSampleScouting(storage, '').length, 0);
  assert.equal(storage.getItem(SCOUTING_STORAGE_KEY), null);
  const seeded = seedSampleScouting(storage, '?sample=1');
  assert.equal(seeded[0].id, SAMPLE_OPPONENT_ID);
  assert.match(seeded[0].name, /\(sample\)/);
  assert.match(seeded[0].notes, /Not a real opponent/);
  assert.equal(seeded[0].ratings.sweeps, 3);
  assert.equal(seeded[1].ratings.sweeps, undefined);
  assert.equal(scoutRecord(seeded[0], []).line, '3-1-0');
  const again = seedSampleScouting(storage, '?sample=1');
  assert.equal(again.length, 2);
  const kept = saveScouting(storage, [
    addScoutingCard([], { name: 'Real', gym: '', belt: 'Blue', weightClass: '', group: 'weight', style: '', notes: 'keep me' }, 60)[0],
  ]);
  const untouched = seedSampleScouting(storage, '?sample=1&student=1');
  assert.equal(untouched.length, 1);
  assert.equal(untouched[0].name, 'Real');
  assert.equal(untouched[0].notes, 'keep me');
  assert.equal(kept[0].id, untouched[0].id);
});
