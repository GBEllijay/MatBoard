import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addStudents,
  addStudent,
  beltChipKey,
  canPrefill,
  canonicalBelt,
  confirmManualCompetitor,
  defaultRoster,
  findStudentByName,
  formatPromotion,
  getRoster,
  normalizeDate,
  normalizeRoster,
  prefillFields,
  resetRoster,
  searchStudents,
  sortStudents,
  studentFromInput,
  type Student,
} from './rosterStore.ts';

function student(partial: Partial<Student> & Pick<Student, 'id' | 'name'>): Student {
  return {
    belt: 'Blue',
    lastPromotion: '2026-03-12',
    note: 'Keep this off the scoreboard',
    ...partial,
  };
}

describe('studentFromInput', () => {
  it('requires a name and a belt before a card can be saved', () => {
    assert.equal(studentFromInput({ name: '', belt: 'Blue' }), null);
    assert.equal(studentFromInput({ name: 'Alex', belt: '' }), null);
    const next = studentFromInput({
      name: '  Alex Rivera  ',
      belt: 'purple',
      lastPromotion: '2026-03-12',
      note: '  Left knee  ',
    });
    assert.ok(next);
    assert.equal(next.name, 'Alex Rivera');
    assert.equal(next.belt, 'Purple');
    assert.equal(next.lastPromotion, '2026-03-12');
    assert.equal(next.note, 'Left knee');
  });

  it('keeps a short custom belt and drops junk dates', () => {
    const next = studentFromInput({
      name: 'Sam',
      belt: 'Coral',
      lastPromotion: 'March 12',
      note: 'x'.repeat(200),
    });
    assert.ok(next);
    assert.equal(next.belt, 'Coral');
    assert.equal(next.lastPromotion, '');
    assert.equal(next.note.length, 160);
  });
});

describe('prefillFields', () => {
  it('returns name and belt only', () => {
    const row = student({ id: '1', name: 'Alex Rivera', belt: 'Purple' });
    assert.deepEqual(prefillFields(row), { name: 'Alex Rivera', belt: 'Purple' });
    assert.equal('note' in (prefillFields(row) ?? {}), false);
    assert.equal('lastPromotion' in (prefillFields(row) ?? {}), false);
    assert.equal(canPrefill({ name: 'Alex', belt: '' }), false);
  });
});

describe('normalizeRoster', () => {
  it('returns an empty roster for junk', () => {
    assert.deepEqual(normalizeRoster(null), defaultRoster());
    assert.deepEqual(normalizeRoster({ version: 1, students: 'nope' }), defaultRoster());
  });

  it('keeps named students with belts and drops incomplete cards', () => {
    const next = normalizeRoster({
      students: [
        { id: 'b', name: 'Sam', belt: 'blue', lastPromotion: '2026-01-01', note: 'Quiet' },
        { id: 'skip', name: '', belt: 'White' },
        { name: 'Pat', belt: 'Black' },
        { id: 'a', name: 'Alex', belt: 'Purple' },
        { id: 'b', name: 'Duplicate id', belt: 'Brown' },
      ],
    });
    assert.deepEqual(
      next.students.map((row) => `${row.name}:${row.belt}`),
      ['Alex:Purple', 'Pat:Black', 'Sam:Blue'],
    );
    assert.equal(next.students.find((row) => row.name === 'Sam')?.id, 'b');
    assert.equal(next.students.find((row) => row.name === 'Sam')?.note, 'Quiet');
    assert.equal(next.students.some((row) => row.name === 'Duplicate id'), false);
  });
});

describe('searchStudents', () => {
  const rows = [
    student({ id: '1', name: 'Alex Rivera', belt: 'Purple' }),
    student({ id: '2', name: 'Alex Kim', belt: 'Blue' }),
    student({ id: '3', name: 'Sam', belt: 'White' }),
    student({ id: '4', name: 'No Belt', belt: '' }),
  ];

  it('ranks prefix name matches first and never returns a card without a belt', () => {
    assert.deepEqual(
      searchStudents(rows, 'alex').map((row) => row.id),
      ['2', '1'],
    );
    assert.deepEqual(
      searchStudents(rows, 'purple').map((row) => row.name),
      ['Alex Rivera'],
    );
    assert.equal(
      searchStudents(rows, '').every((row) => row.belt),
      true,
    );
    assert.equal(
      searchStudents(rows, '').some((row) => row.id === '4'),
      false,
    );
  });
});

describe('confirmManualCompetitor', () => {
  it('uses a typed name on the bracket without writing a roster card', () => {
    resetRoster();
    const next = confirmManualCompetitor('  Jordan Lee  ', { addToRoster: false });
    assert.deepEqual(next, { name: 'Jordan Lee', belt: '' });
    assert.equal(getRoster().students.length, 0);
    resetRoster();
  });

  it('adds a new local card when asked, and reuses an exact name instead of duplicating', () => {
    resetRoster();
    const added = confirmManualCompetitor('Pat Mora', { addToRoster: true, belt: 'blue' });
    assert.deepEqual(added, { name: 'Pat Mora', belt: 'Blue' });
    assert.equal(getRoster().students.length, 1);

    const again = confirmManualCompetitor('pat mora', { addToRoster: true, belt: 'Purple' });
    assert.deepEqual(again, { name: 'Pat Mora', belt: 'Blue' });
    assert.equal(getRoster().students.length, 1);
    resetRoster();
  });

  it('will not add a roster card without a belt', () => {
    resetRoster();
    assert.equal(confirmManualCompetitor('Sam', { addToRoster: true }), null);
    assert.equal(getRoster().students.length, 0);
    resetRoster();
  });

  it('finds an existing card by name ignoring case', () => {
    resetRoster();
    addStudent({ name: 'Alex Rivera', belt: 'Purple', lastPromotion: '', note: '' });
    const found = findStudentByName(getRoster().students, '  alex rivera ');
    assert.equal(found?.belt, 'Purple');
    resetRoster();
  });
});

describe('addStudents', () => {
  it('appends valid cards in one write and sorts by name', () => {
    resetRoster();
    const added = addStudents([
      student({ id: 'z', name: 'Sam', belt: 'Blue' }),
      student({ id: 'a', name: 'Alex', belt: 'Purple' }),
    ]);
    assert.equal(added.length, 2);
    assert.deepEqual(
      getRoster().students.map((row) => row.name),
      ['Alex', 'Sam'],
    );
    resetRoster();
  });
});

describe('sortStudents', () => {
  it('orders by name', () => {
    const rows = [
      student({ id: '2', name: 'Sam' }),
      student({ id: '1', name: 'alex' }),
    ];
    assert.deepEqual(
      sortStudents(rows).map((row) => row.id),
      ['1', '2'],
    );
  });
});

describe('belt and date helpers', () => {
  it('canonicalizes known belts and formats promotion dates', () => {
    assert.equal(canonicalBelt('  blue  '), 'Blue');
    assert.equal(canonicalBelt('Grey'), 'Grey');
    assert.equal(canonicalBelt('blackbelt'), 'Black');
    assert.equal(canonicalBelt('black belt'), 'Black');
    assert.equal(canonicalBelt('Black Belt'), 'Black');
    assert.equal(canonicalBelt('BB'), 'Black');
    assert.equal(canonicalBelt('white belt'), 'White');
    assert.equal(canonicalBelt('bluebelt'), 'Blue');
    assert.equal(canonicalBelt('purple'), 'Purple');
    assert.equal(canonicalBelt('brown belt'), 'Brown');
    assert.equal(canonicalBelt('coral belt'), 'Coral');
    assert.equal(canonicalBelt('gray'), 'Grey');
    assert.equal(beltChipKey('Blue'), 'blue');
    assert.equal(beltChipKey('gray'), 'grey');
    assert.equal(beltChipKey('BB'), 'black');
    assert.equal(beltChipKey('Coral'), 'custom');
    assert.equal(normalizeDate('2026-03-12'), '2026-03-12');
    assert.equal(normalizeDate('03/12/2026'), '');
    assert.equal(formatPromotion('2026-03-12').includes('2026'), true);
  });
});
