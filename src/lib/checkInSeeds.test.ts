import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkedInCompetitors,
  namesForBracket,
  obviousRankingFile,
  orderCheckedInByRanking,
  rosterNameKey,
  seededBracketSize,
} from './checkInSeeds.ts';
import type { RankingFile, RankingRow } from './rankingStore.ts';
import { findStudentByName, type Student } from './rosterStore.ts';
import {
  applyCheckedInBracket,
  applyMatchOutcome,
  applyUndoOutcome,
  canUndoLast,
  defaultTournament,
  matchIdFromSlot,
  seedSlots,
  slotName,
} from './tournamentStore.ts';

function card(partial: Partial<Student> & Pick<Student, 'id' | 'name'>): Student {
  return {
    belt: 'Blue',
    division: '',
    gym: '',
    photo: '',
    lastPromotion: '',
    note: '',
    checkedIn: false,
    ...partial,
  };
}

function row(place: number, name: string, index = place): RankingRow {
  return { id: `p-${index}-${name}`, place, name, result: '' };
}

function file(partial: Partial<RankingFile> & Pick<RankingFile, 'id' | 'name'>): RankingFile {
  return {
    date: '',
    division: '',
    rows: [],
    updatedAt: 0,
    ...partial,
  };
}

test('ranked checked-in competitors lead in place order, then unranked roster order', () => {
  const students = [
    card({ id: 'a', name: 'Ada', checkedIn: true }),
    card({ id: 'b', name: 'Bea', checkedIn: true }),
    card({ id: 'c', name: 'Cam', checkedIn: false }),
    card({ id: 'd', name: 'Dee', checkedIn: true }),
    card({ id: 'e', name: 'Eve', checkedIn: true, rosterList: 'student' }),
  ];
  const before = structuredClone(students);
  const ordered = orderCheckedInByRanking(students, [
    row(3, 'Ada'),
    row(1, 'Cam'),
    row(2, 'Dee'),
  ]);
  assert.deepEqual(students, before);
  assert.deepEqual(
    ordered.map((seed) => [seed.name, seed.place]),
    [
      ['Dee', 2],
      ['Ada', 3],
      ['Bea', null],
    ],
  );
  assert.equal(checkedInCompetitors(students).some((student) => student.name === 'Eve'), false);
  assert.equal(checkedInCompetitors(students).some((student) => student.name === 'Cam'), false);
});

test('tied places keep ranking row order, and a missing ranking list stays in roster order', () => {
  const students = [
    card({ id: 'a', name: 'Ada', checkedIn: true }),
    card({ id: 'b', name: 'Bea', checkedIn: true }),
    card({ id: 'c', name: 'Cam', checkedIn: true }),
  ];
  const tied = orderCheckedInByRanking(students, [row(1, 'Bea', 1), row(1, 'Ada', 2)]);
  assert.deepEqual(
    tied.map((seed) => seed.name),
    ['Bea', 'Ada', 'Cam'],
  );
  assert.deepEqual(
    orderCheckedInByRanking(students, []).map((seed) => seed.name),
    ['Ada', 'Bea', 'Cam'],
  );
  assert.deepEqual(
    orderCheckedInByRanking(students, null).map((seed) => seed.name),
    ['Ada', 'Bea', 'Cam'],
  );
});

test('name matching is trimmed and case-insensitive, like the roster name field', () => {
  const students = [card({ id: 'mia', name: 'Mia Santos', checkedIn: true })];
  assert.equal(findStudentByName(students, '  MIA SANTOS  ')?.id, 'mia');
  assert.equal(rosterNameKey('  MIA SANTOS  '), rosterNameKey('Mia Santos'));
  const ordered = orderCheckedInByRanking(students, [row(1, '  mia santos  ')]);
  assert.equal(ordered[0]?.name, 'Mia Santos');
  assert.equal(ordered[0]?.place, 1);
});

test('each roster card is used once, and the roster flags stay put', () => {
  const students = [
    card({ id: '1', name: 'Ada', checkedIn: true }),
    card({ id: '2', name: 'Ada', checkedIn: true }),
  ];
  const ordered = orderCheckedInByRanking(students, [row(1, 'Ada')]);
  assert.deepEqual(
    ordered.map((seed) => [seed.id, seed.place]),
    [
      ['1', 1],
      ['2', null],
    ],
  );
  assert.equal(students[0]?.checkedIn, true);
  assert.equal(students[1]?.checkedIn, true);
  assert.deepEqual(
    students.map((student) => student.id),
    ['1', '2'],
  );
});

test('an obvious ranking file is the only file, or the unique title or division match', () => {
  const kids = file({ id: 'kids', name: 'Kids Gi', division: 'Grey' });
  const adult = file({ id: 'adult', name: 'Adult Blue', division: 'Blue' });
  assert.equal(obviousRankingFile([kids], { title: '' })?.id, 'kids');
  assert.equal(obviousRankingFile([kids, adult], { title: 'kids gi' })?.id, 'kids');
  assert.equal(obviousRankingFile([kids, adult], { title: 'Blue' })?.id, 'adult');
  assert.equal(obviousRankingFile([kids, adult], { title: '', divisions: ['grey', 'grey'] })?.id, 'kids');
  assert.equal(obviousRankingFile([kids, adult], { title: '', divisions: ['grey', 'blue'] }), null);
  assert.equal(obviousRankingFile([kids, adult], { title: 'Open' }), null);
  assert.equal(obviousRankingFile([], { title: 'Kids Gi' }), null);
});

test('the board size fits the seeds, and 1 and 2 land on opposite sides', () => {
  assert.equal(seededBracketSize(1, 64), 2);
  assert.equal(seededBracketSize(6, 64), 6);
  assert.equal(seededBracketSize(20, 16), 16);
  assert.deepEqual(namesForBracket([{ id: 'a', name: 'Ada', place: 1 }], 64), ['Ada']);
  const many = Array.from({ length: 20 }, (_, index) => ({
    id: `s-${index}`,
    name: `Name ${index}`,
    place: index + 1,
  }));
  assert.equal(namesForBracket(many, 16).length, 16);

  const titled = { ...defaultTournament(16), title: 'Kids Gi' };
  const board = applyCheckedInBracket(titled, ['Ada', 'Bea', 'Cam', 'Dee']);
  assert.equal(board.size, 4);
  assert.equal(board.title, 'Kids Gi');
  assert.equal(Object.keys(board.results).length, 0);
  assert.equal(board.lastOutcomeMatchId, null);
  const slots = seedSlots(board);
  assert.equal(slotName(board, slots[0]), 'Ada');
  assert.equal(slotName(board, slots[1]), 'Bea');
  assert.notEqual(matchIdFromSlot(slots[0]), matchIdFromSlot(slots[1]));

  const won = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
  assert.equal(canUndoLast(won), true);
  const undone = applyUndoOutcome(won, 'sf-0');
  assert.equal(undone.results['sf-0'], undefined);
  assert.equal(canUndoLast(undone), false);
  assert.equal(slotName(undone, slots[0]), 'Ada');
});

test('filling from check-in clears an older result and does not touch check-in', () => {
  const students = [card({ id: 'a', name: 'Ada', checkedIn: true })];
  const snapshot = structuredClone(students);
  const names = namesForBracket(orderCheckedInByRanking(students, [row(1, 'Ada')]), 64);
  let dirty = defaultTournament(8);
  dirty = { ...dirty, title: 'Open' };
  dirty = applyMatchOutcome(dirty, 'qf-1', 'b', { call: 'win', method: 'submission' }, { toggle: false });
  assert.equal(canUndoLast(dirty), true);
  const next = applyCheckedInBracket(dirty, names);
  assert.equal(next.size, 2);
  assert.equal(next.title, 'Open');
  assert.equal(Object.keys(next.results).length, 0);
  assert.equal(canUndoLast(next), false);
  assert.deepEqual(students, snapshot);
});
