import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompetitionResult } from './progress/types.ts';
import {
  addScoutingCard,
  exportScoutingCsv,
  importScoutingCsv,
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
});
