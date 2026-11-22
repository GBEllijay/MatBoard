import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  BRACKET_ROSTER_CSV_HEADERS,
  BRACKET_ROSTER_MAX,
  WHITE_MATCH_NAMES_IMPORT_KEY,
  addBracketRosterEntry,
  bracketRosterPrefill,
  clearBracketRoster,
  findBracketRosterName,
  formatBracketRosterCsv,
  getBracketRoster,
  importWhiteMatchNamesOnce,
  parseBracketRosterCsv,
  removeBracketRosterEntry,
  replaceBracketRoster,
  resetBracketRosterForTests,
  searchBracketRoster,
  seedWhiteBracketFromRoster,
  updateBracketRosterEntry,
  upsertBracketRosterName,
} from './bracketRosterStore.ts';
import {
  WHITE_ROSTER_STORAGE_KEY,
  addWhiteMatchName,
  getWhiteRoster,
  resetWhiteRoster,
} from './whiteRosterStore.ts';
import { getTournament, resetTournament } from './tournamentStore.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
import { seedSlots, slotName } from './tournamentStore.ts';

test('CSV export writes the required header and quoted cells', () => {
  const csv = formatBracketRosterCsv([
    {
      id: '1',
      name: 'Atlas',
      gym: 'Northside Academy',
      weight: '155',
      division: 'Adult',
      age: '28',
      rank: 'Purple',
    },
    {
      id: '2',
      name: 'Mina',
      gym: 'Pinecrest, East',
      weight: '135',
      division: 'Adult',
      age: '24',
      rank: 'Blue',
    },
  ]);
  assert.equal(csv.startsWith('\uFEFF'), true);
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r\n/);
  assert.equal(lines[0], BRACKET_ROSTER_CSV_HEADERS.join(','));
  assert.equal(lines[1], 'Atlas,Northside Academy,155,Adult,28,Purple');
  assert.equal(lines[2], 'Mina,"Pinecrest, East",135,Adult,24,Blue');
});

test('CSV parse reads the official header, quoted commas, and skips blank names', () => {
  const raw = `\uFEFFname,gym,weight,division,age,rank\r\nAtlas,Northside Academy,155,Adult,28,Purple\r\n"Mina","Pinecrest, East",135,Adult,24,Blue\r\n,Harbor Mats,170,Adult,31,Blue\r\n`;
  const result = parseBracketRosterCsv(raw);
  assert.equal(result.error, undefined);
  assert.equal(result.entries.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.truncated, 0);
  assert.equal(result.entries[0]?.name, 'Atlas');
  assert.equal(result.entries[0]?.gym, 'Northside Academy');
  assert.equal(result.entries[1]?.gym, 'Pinecrest, East');
});

test('CSV parse accepts a shuffled header and rejects a missing column', () => {
  const ok = parseBracketRosterCsv('rank,name,age,gym,division,weight\nBlue,Romeo,31,Harbor Mats,Adult,170\n');
  assert.equal(ok.entries[0]?.name, 'Romeo');
  assert.equal(ok.entries[0]?.weight, '170');
  const bad = parseBracketRosterCsv('name,belt,gym\nAtlas,Purple,Northside\n');
  assert.equal(bad.entries.length, 0);
  assert.match(bad.error ?? '', /name,gym,weight,division,age,rank/);
});

test('CSV parse truncates past 36 and skips duplicate names', () => {
  const rows = ['name,gym,weight,division,age,rank'];
  for (let i = 1; i <= 40; i += 1) rows.push(`Person ${i},Gym,150,Adult,20,White`);
  rows.push('Person 1,Other,150,Adult,20,White');
  const result = parseBracketRosterCsv(rows.join('\n'));
  assert.equal(result.entries.length, BRACKET_ROSTER_MAX);
  assert.equal(result.truncated, 4);
  assert.equal(result.skipped, 1);
});

test('the committed sample CSV has 36 fictional rows and the official header', () => {
  const raw = readFileSync('public/samples/bracket-roster-sample.csv', 'utf8');
  const result = parseBracketRosterCsv(raw);
  assert.equal(result.error, undefined);
  assert.equal(result.entries.length, 36);
  assert.equal(result.truncated, 0);
  assert.equal(new Set(result.entries.map((entry) => entry.name)).size, 36);
  assert.doesNotMatch(raw, /Gracie Barra|GracieBarra|\bGB\b/i);
});

test('add, edit, and remove persist on this device', () => {
  resetBracketRosterForTests();
  const added = addBracketRosterEntry({
    name: 'Atlas',
    gym: 'Northside Academy',
    weight: '155',
    division: 'Adult',
    age: '28',
    rank: 'Purple',
  });
  assert.ok(added);
  assert.equal(getBracketRoster().entries[0]?.gym, 'Northside Academy');
  const edited = updateBracketRosterEntry(added!.id, {
    name: 'Atlas',
    gym: 'Harbor Mats',
    weight: '160',
    division: 'Adult',
    age: '29',
    rank: 'Brown',
  });
  assert.equal(edited?.gym, 'Harbor Mats');
  assert.equal(edited?.rank, 'Brown');
  removeBracketRosterEntry(added!.id);
  assert.equal(getBracketRoster().entries.length, 0);
  clearBracketRoster();
});

test('import replace and seed fill a 16-person White bracket from the roster', () => {
  resetBracketRosterForTests();
  resetTournament();
  const parsed = parseBracketRosterCsv(readFileSync('public/samples/bracket-roster-sample.csv', 'utf8'));
  replaceBracketRoster(parsed.entries.slice(0, 16));
  const placed = seedWhiteBracketFromRoster(16);
  assert.equal(placed, 16);
  const board = getTournament();
  assert.equal(board.size, 16);
  const names = seedSlots(board).map((id) => slotName(board, id));
  assert.equal(names[0], 'Atlas');
  assert.equal(names[15], 'Ivy');
  resetBracketRosterForTests();
  resetTournament();
});

test('Fill respects the selected White bracket size instead of always using 36', () => {
  resetBracketRosterForTests();
  resetTournament();
  const parsed = parseBracketRosterCsv(readFileSync('public/samples/bracket-roster-sample.csv', 'utf8'));
  replaceBracketRoster(parsed.entries);
  const placed = seedWhiteBracketFromRoster(16);
  assert.equal(placed, 16);
  const board = getTournament();
  assert.equal(board.size, 16);
  const eight = seedWhiteBracketFromRoster(8, { newBoard: false });
  assert.equal(eight, 8);
  assert.equal(getTournament().size, 8);
  const sixteen = seedWhiteBracketFromRoster(16, { newBoard: false });
  assert.equal(sixteen, 16);
  assert.equal(getTournament().size, 16);
  resetBracketRosterForTests();
  resetTournament();
});

test('import copies Match names into an empty Bracket Roster once and leaves the old key', () => {
  resetBracketRosterForTests();
  resetWhiteRoster();
  addWhiteMatchName('Sam Rivera', 'Blue');
  addWhiteMatchName('Pat Nguyen', 'Purple');
  const before = localStorage.getItem(WHITE_ROSTER_STORAGE_KEY);
  assert.ok(before);
  assert.equal(importWhiteMatchNamesOnce(), 2);
  const roster = getBracketRoster();
  assert.equal(roster.entries.length, 2);
  assert.equal(findBracketRosterName(roster.entries, 'sam rivera')?.rank, 'Blue');
  assert.equal(findBracketRosterName(roster.entries, 'Pat Nguyen')?.rank, 'Purple');
  assert.equal(localStorage.getItem(WHITE_ROSTER_STORAGE_KEY), before);
  assert.equal(getWhiteRoster().names.length, 2);
  assert.equal(localStorage.getItem(WHITE_MATCH_NAMES_IMPORT_KEY), '1');
  assert.equal(importWhiteMatchNamesOnce(), 0);
  assert.equal(getBracketRoster().entries.length, 2);
  clearBracketRoster();
  assert.equal(getBracketRoster().entries.length, 0);
  assert.equal(importWhiteMatchNamesOnce(), 0);
  assert.equal(getBracketRoster().entries.length, 0);
  resetBracketRosterForTests();
  resetWhiteRoster();
});

test('import does not overwrite an existing Bracket Roster', () => {
  resetBracketRosterForTests();
  resetWhiteRoster();
  addBracketRosterEntry({
    name: 'Atlas',
    gym: 'Northside Academy',
    weight: '155',
    division: 'Adult',
    age: '28',
    rank: 'Purple',
  });
  addWhiteMatchName('Sam', 'Blue');
  assert.equal(importWhiteMatchNamesOnce(), 0);
  assert.equal(getBracketRoster().entries.length, 1);
  assert.equal(getBracketRoster().entries[0]?.name, 'Atlas');
  assert.ok(localStorage.getItem(WHITE_ROSTER_STORAGE_KEY));
  resetBracketRosterForTests();
  resetWhiteRoster();
});

test('upsert adds a name or updates the rank, and search matches name, rank, and gym', () => {
  resetBracketRosterForTests();
  const added = upsertBracketRosterName('  Atlas  ', 'Purple');
  assert.ok(added);
  assert.equal(added?.name, 'Atlas');
  assert.equal(added?.rank, 'Purple');
  const again = upsertBracketRosterName('ATLAS', 'Brown');
  assert.equal(again?.id, added?.id);
  assert.equal(again?.rank, 'Brown');
  assert.equal(getBracketRoster().entries.length, 1);
  upsertBracketRosterName('Mina', 'Blue');
  updateBracketRosterEntry(getBracketRoster().entries.find((row) => row.name === 'Mina')!.id, {
    name: 'Mina',
    gym: 'Pinecrest',
    weight: '135',
    division: 'Adult',
    age: '24',
    rank: 'Blue',
  });
  const found = searchBracketRoster(getBracketRoster().entries, 'pine');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.name, 'Mina');
  const byRank = searchBracketRoster(getBracketRoster().entries, 'brown');
  assert.equal(byRank[0]?.name, 'Atlas');
  const prefill = bracketRosterPrefill(getBracketRoster().entries.find((row) => row.name === 'Mina')!);
  assert.deepEqual(prefill, { name: 'Mina', belt: 'Blue', gym: 'Pinecrest', division: 'Adult' });
  resetBracketRosterForTests();
});

test('the White scoreboard picker reads the Bracket Roster, not Match names', () => {
  const src = readFileSync(new URL('../components/WhiteNamePicker.tsx', import.meta.url), 'utf8');
  assert.match(src, /useBracketRosterState/);
  assert.match(src, /importWhiteMatchNamesOnce/);
  assert.match(src, /upsertBracketRosterName/);
  assert.match(src, /WHITE_BRACKET_ROSTER_PATH/);
  assert.match(src, /entry\.rank/);
  assert.doesNotMatch(src, /addWhiteMatchName|useWhiteRosterState|searchWhiteMatchNames|\/white\/roster/);
  const field = readFileSync(new URL('../components/RosterNameField.tsx', import.meta.url), 'utf8');
  assert.match(field, /whiteNames \? \(\s*<WhiteNamePicker/);
});
