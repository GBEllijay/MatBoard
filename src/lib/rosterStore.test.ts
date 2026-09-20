import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addStudents,
  canPrefill,
  canonicalBelt,
  defaultRoster,
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
    assert.equal(normalizeDate('2026-03-12'), '2026-03-12');
    assert.equal(normalizeDate('03/12/2026'), '');
    assert.equal(formatPromotion('2026-03-12').includes('2026'), true);
  });
});
