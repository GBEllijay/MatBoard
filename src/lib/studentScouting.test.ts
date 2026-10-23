import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CompetitionResult } from './progress/types.ts';
import {
  addScoutingCard,
  exportScoutingCsv,
  importScoutingCsv,
  scoutingCsvHeaders,
  scoutingCsvTemplate,
  scoutingExportFileName,
  pastMatchesFor,
  saveScouting,
  loadScouting,
  searchScoutingCards,
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

test('csv export writes the seven ratings and import still accepts a file without them', () => {
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
  assert.match(csv, /Style,Class,Guard,Passing,Takedowns,Escapes,Submissions,Conditioning,Mindset,Strengths,Weaknesses/);
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
  for (const label of ['Guard', 'Passing', 'Takedowns', 'Escapes', 'Submissions', 'Conditioning', 'Mindset']) {
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
});
