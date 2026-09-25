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
  READY_EXTRA_MAX,
  READY_ITEMS,
  addReadyExtra,
  competitorReady,
  readyStatusLabel,
  removeReadyExtra,
  removeReadyItem,
  removedReadyItems,
  removeStudent,
  restoreReadyItem,
  resetRoster,
  searchStudents,
  setCheckedIn,
  setReadyExtra,
  setReadyFlag,
  setReadyNote,
  sortStudents,
  INJURY_MAX,
  studentFromInput,
  updateStudent,
  visibleReadyItems,
  type Student,
} from './rosterStore.ts';

function student(partial: Partial<Student> & Pick<Student, 'id' | 'name'>): Student {
  return {
    belt: 'Blue',
    gym: '',
    division: '',
    checkedIn: false,
    lastPromotion: '2026-03-12',
    note: 'Keep this off the scoreboard',
    knownInjuries: '',
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
      gym: '  Alliance  ',
    });
    assert.ok(next);
    assert.equal(next.name, 'Alex Rivera');
    assert.equal(next.belt, 'Purple');
    assert.equal(next.gym, 'Alliance');
    assert.equal(next.division, '');
    assert.equal(next.checkedIn, false);
    assert.equal(next.lastPromotion, '2026-03-12');
    assert.equal(next.note, 'Left knee');
  });

  it('keeps an optional division and clips a long one', () => {
    const next = studentFromInput({
      name: 'Sam',
      belt: 'Blue',
      division: '  Adult Blue  ',
    });
    assert.ok(next);
    assert.equal(next.division, 'Adult Blue');
    const long = studentFromInput({
      name: 'Sam',
      belt: 'Blue',
      division: 'D'.repeat(120),
    });
    assert.equal(long?.division.length, 80);
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
  it('returns name, belt, gym, and division', () => {
    const row = student({ id: '1', name: 'Alex Rivera', belt: 'Purple' });
    assert.deepEqual(prefillFields(row), { name: 'Alex Rivera', belt: 'Purple', gym: '', division: '' });
    assert.deepEqual(prefillFields({ ...row, gym: 'Checkmat', division: 'Adult Purple' }), {
      name: 'Alex Rivera',
      belt: 'Purple',
      gym: 'Checkmat',
      division: 'Adult Purple',
    });
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
        { id: 'b', name: 'Sam', belt: 'blue', division: 'Adult Blue', lastPromotion: '2026-01-01', note: 'Quiet' },
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
    assert.equal(next.students.find((row) => row.name === 'Sam')?.division, 'Adult Blue');
    assert.equal(next.students.find((row) => row.name === 'Alex')?.division, '');
    assert.equal(next.students.find((row) => row.name === 'Sam')?.checkedIn, false);
    assert.equal(next.students.find((row) => row.name === 'Alex')?.checkedIn, false);
    assert.equal(next.students.some((row) => row.name === 'Duplicate id'), false);
  });
});

describe('searchStudents', () => {
  const rows = [
    student({ id: '1', name: 'Alex Rivera', belt: 'Purple', division: 'Adult Purple' }),
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
    assert.deepEqual(
      searchStudents(rows, 'adult').map((row) => row.name),
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
    assert.deepEqual(next, { name: 'Jordan Lee', belt: '', gym: '', division: '' });
    assert.equal(getRoster().students.length, 0);
    resetRoster();
  });

  it('adds a new local card when asked, and reuses an exact name instead of duplicating', () => {
    resetRoster();
    const added = confirmManualCompetitor('Pat Mora', { addToRoster: true, belt: 'blue' });
    assert.deepEqual(added, { name: 'Pat Mora', belt: 'Blue', gym: '', division: '' });
    assert.equal(getRoster().students.length, 1);

    const again = confirmManualCompetitor('pat mora', { addToRoster: true, belt: 'Purple' });
    assert.deepEqual(again, { name: 'Pat Mora', belt: 'Blue', gym: '', division: '' });
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
    addStudent({
      name: 'Alex Rivera',
      belt: 'Purple',
      gym: 'Alliance',
      division: 'Adult Purple',
      lastPromotion: '',
      note: '',
      knownInjuries: '',
    });
    const found = findStudentByName(getRoster().students, '  alex rivera ');
    assert.equal(found?.belt, 'Purple');
    assert.equal(found?.division, 'Adult Purple');
    const picked = confirmManualCompetitor('alex rivera', { addToRoster: false });
    assert.equal(picked?.division, 'Adult Purple');
    resetRoster();
  });
});

describe('setCheckedIn', () => {
  it('stays off for an older card and survives an edit', () => {
    resetRoster();
    const added = addStudent({
      name: 'Sam',
      belt: 'Blue',
      division: '',
      gym: '',
      lastPromotion: '',
      note: '',
      knownInjuries: '',
    });
    assert.ok(added);
    assert.equal(added.checkedIn, false);
    const loaded = normalizeRoster({
      students: [
        { id: added.id, name: 'Sam', belt: 'Blue' },
        { id: 'on', name: 'Pat', belt: 'Purple', checkedIn: true },
      ],
    });
    assert.equal(loaded.students.find((row) => row.name === 'Sam')?.checkedIn, false);
    assert.equal(loaded.students.find((row) => row.name === 'Pat')?.checkedIn, true);

    assert.equal(setCheckedIn(added.id, true)?.checkedIn, true);
    const edited = updateStudent(added.id, { note: 'Ready' });
    assert.equal(edited?.checkedIn, true);
    assert.equal(edited?.note, 'Ready');
    assert.equal(getRoster().students.find((row) => row.id === added.id)?.checkedIn, true);
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

describe('competition ready', () => {
  it('starts existing competitors all off and keeps division and check in', () => {
    const loaded = normalizeRoster({
      students: [
        { id: 'a', name: 'Alex', belt: 'Blue', division: 'Kids Gi', checkedIn: true },
        { id: 'b', name: 'Sam', belt: 'White' },
      ],
    });
    assert.equal(loaded.students.find((row) => row.id === 'a')?.division, 'Kids Gi');
    assert.equal(loaded.students.find((row) => row.id === 'a')?.checkedIn, true);
    assert.equal(loaded.students.find((row) => row.id === 'b')?.division, '');
    assert.equal(loaded.students.find((row) => row.id === 'b')?.checkedIn, false);
    assert.deepEqual(loaded.ready, {});
    assert.equal(competitorReady('a', loaded).flags.medical, false);
    assert.equal(competitorReady('b', loaded).flags.weighIn, false);
    assert.equal(readyStatusLabel(competitorReady('a', loaded)), `0 of ${READY_ITEMS.length} on`);
  });

  it('saves checklist items with the competitor and leaves roster fields alone', () => {
    resetRoster();
    const added = addStudent({
      name: 'Alex Rivera',
      belt: 'Purple',
      division: 'Adult Purple',
      gym: 'Alliance',
      lastPromotion: '',
      note: 'Knee',
      knownInjuries: '',
    });
    assert.ok(added);
    assert.equal(added.checkedIn, false);
    assert.equal(getRoster().ready[added.id], undefined);

    setReadyFlag(added.id, 'medical', true);
    setReadyFlag(added.id, 'gi', true);
    setReadyNote(added.id, '  Bring the blue gi  ');
    const extra = addReadyExtra(added.id, '  Mouthguard  ');
    assert.ok(extra);
    assert.equal(extra.on, false);
    assert.equal(extra.label, 'Mouthguard');

    const reloaded = normalizeRoster(JSON.parse(JSON.stringify(getRoster())));
    const saved = reloaded.ready[added.id];
    assert.ok(saved);
    assert.equal(saved.flags.medical, true);
    assert.equal(saved.flags.gi, true);
    assert.equal(saved.flags.division, false);
    assert.equal(saved.flags.travel, false);
    assert.equal(saved.flags.waiver, false);
    assert.equal(saved.flags.weighIn, false);
    assert.equal(saved.note, 'Bring the blue gi');
    assert.equal(saved.extras.length, 1);
    assert.equal(saved.extras[0]?.on, false);
    assert.equal(reloaded.students[0]?.division, 'Adult Purple');
    assert.equal(reloaded.students[0]?.checkedIn, false);
    assert.equal(reloaded.students[0]?.note, 'Knee');

    const edited = updateStudent(added.id, { division: 'Masters Purple', note: 'Shoulder' });
    assert.equal(edited?.division, 'Masters Purple');
    assert.equal(edited?.checkedIn, false);
    assert.equal(getRoster().ready[added.id]?.flags.medical, true);
    assert.equal(setCheckedIn(added.id, true)?.checkedIn, true);
    assert.equal(getRoster().students.find((row) => row.id === added.id)?.division, 'Masters Purple');
    assert.equal(getRoster().ready[added.id]?.note, 'Bring the blue gi');

    setReadyExtra(added.id, extra.id, true);
    assert.equal(getRoster().ready[added.id]?.extras[0]?.on, true);
    assert.equal(readyStatusLabel(competitorReady(added.id)), '3 of 7 on');
    resetRoster();
  });

  it('drops a checklist when that competitor is removed and ignores junk', () => {
    resetRoster();
    const added = addStudent({
      name: 'Sam',
      belt: 'Blue',
      division: '',
      gym: '',
      lastPromotion: '',
      note: '',
      knownInjuries: '',
    });
    assert.ok(added);
    setReadyFlag(added.id, 'waiver', true);
    const other = addStudents([
      student({ id: 'csv', name: 'Pat', belt: 'Brown', division: 'Adult Brown', checkedIn: true }),
    ]);
    assert.equal(other.length, 1);
    assert.equal(getRoster().ready[added.id]?.flags.waiver, true);
    assert.equal(getRoster().ready.csv, undefined);
    assert.equal(getRoster().students.find((row) => row.id === 'csv')?.checkedIn, true);

    assert.equal(addReadyExtra(added.id, '   '), null);
    assert.equal(addReadyExtra('missing', 'Rashguard'), null);
    setReadyFlag(added.id, 'nope' as never, true);
    assert.equal(getRoster().ready[added.id]?.flags.medical, false);

    for (let index = 0; index < READY_EXTRA_MAX; index += 1) {
      assert.ok(addReadyExtra(added.id, `Extra ${index + 1}`));
    }
    assert.equal(addReadyExtra(added.id, 'One too many'), null);
    assert.equal(getRoster().ready[added.id]?.extras.length, READY_EXTRA_MAX);

    const extraId = getRoster().ready[added.id]?.extras[0]?.id ?? '';
    removeReadyExtra(added.id, extraId);
    setReadyFlag(added.id, 'waiver', false);
    setReadyNote(added.id, '   ');
    for (const extra of [...(getRoster().ready[added.id]?.extras ?? [])]) {
      removeReadyExtra(added.id, extra.id);
    }
    assert.equal(getRoster().ready[added.id], undefined);
    assert.equal(getRoster().students.find((row) => row.id === added.id)?.belt, 'Blue');

    setReadyFlag(added.id, 'travel', true);
    removeStudent(added.id);
    assert.equal(getRoster().students.some((row) => row.id === added.id), false);
    assert.equal(getRoster().ready[added.id], undefined);
    assert.equal(getRoster().students.find((row) => row.id === 'csv')?.division, 'Adult Brown');

    const cleaned = normalizeRoster({
      students: [{ id: 'a', name: 'Alex', belt: 'Blue', division: 'Adult Blue', checkedIn: true }],
      ready: {
        missing: { flags: { medical: true }, note: 'nope', extras: [] },
        a: {
          flags: { medical: true, gi: 'yes', nope: true },
          note: '  pad  ',
          extras: [
            { id: '', label: 'skip' },
            { id: 'e1', label: '  Rashguard  ', on: true },
            { id: 'e1', label: 'dup', on: true },
          ],
        },
      },
    });
    assert.equal(cleaned.ready.missing, undefined);
    assert.equal(cleaned.ready.a?.flags.medical, true);
    assert.equal(cleaned.ready.a?.flags.gi, false);
    assert.equal(cleaned.ready.a?.note, 'pad');
    assert.equal(cleaned.ready.a?.extras.length, 1);
    assert.equal(cleaned.ready.a?.extras[0]?.label, 'Rashguard');
    assert.deepEqual(cleaned.ready.a?.hidden, []);
    assert.equal(cleaned.students[0]?.division, 'Adult Blue');
    assert.equal(cleaned.students[0]?.checkedIn, true);
    resetRoster();
  });

  it('removes a starter row or a custom row for one competitor only', () => {
    resetRoster();
    const alex = addStudent({
      name: 'Alex Rivera',
      belt: 'Blue',
      division: 'Adult Blue',
      gym: '',
      lastPromotion: '',
      note: '',
      knownInjuries: 'Left knee',
    });
    const sam = addStudent({
      name: 'Sam',
      belt: 'White',
      division: 'Kids Gi',
      gym: '',
      lastPromotion: '',
      note: '',
      knownInjuries: '',
    });
    assert.ok(alex);
    assert.ok(sam);
    setCheckedIn(alex.id, true);
    setReadyFlag(alex.id, 'medical', true);
    const extra = addReadyExtra(alex.id, 'Mouthguard');
    assert.ok(extra);
    setReadyExtra(alex.id, extra.id, true);

    removeReadyItem(alex.id, 'gi');
    removeReadyItem(alex.id, 'travel');
    removeReadyExtra(alex.id, extra.id);

    const alexReady = competitorReady(alex.id);
    assert.deepEqual(
      visibleReadyItems(alexReady).map((item) => item.id),
      ['medical', 'division', 'waiver', 'weighIn'],
    );
    assert.deepEqual(
      removedReadyItems(alexReady).map((item) => item.id),
      ['gi', 'travel'],
    );
    assert.equal(alexReady.extras.length, 0);
    assert.equal(alexReady.flags.medical, true);
    assert.equal(readyStatusLabel(alexReady), '1 of 4 on');
    assert.equal(getRoster().students.find((row) => row.id === alex.id)?.division, 'Adult Blue');
    assert.equal(getRoster().students.find((row) => row.id === alex.id)?.checkedIn, true);
    assert.equal(getRoster().students.find((row) => row.id === alex.id)?.knownInjuries, 'Left knee');

    const samReady = competitorReady(sam.id);
    assert.equal(visibleReadyItems(samReady).length, READY_ITEMS.length);
    assert.equal(removedReadyItems(samReady).length, 0);
    assert.equal(readyStatusLabel(samReady), `0 of ${READY_ITEMS.length} on`);
    assert.equal(READY_ITEMS.length, 6);

    const reloaded = normalizeRoster(JSON.parse(JSON.stringify(getRoster())));
    assert.deepEqual(reloaded.ready[alex.id]?.hidden, ['gi', 'travel']);
    assert.equal(reloaded.ready[alex.id]?.flags.medical, true);
    assert.equal(reloaded.ready[alex.id]?.extras.length, 0);
    assert.equal(reloaded.ready[sam.id], undefined);
    assert.equal(visibleReadyItems(competitorReady(sam.id, reloaded)).length, 6);
    assert.equal(reloaded.students.find((row) => row.id === alex.id)?.checkedIn, true);
    assert.equal(reloaded.students.find((row) => row.id === alex.id)?.division, 'Adult Blue');
    assert.equal(reloaded.students.find((row) => row.id === alex.id)?.knownInjuries, 'Left knee');

    restoreReadyItem(alex.id, 'gi');
    const restored = competitorReady(alex.id);
    assert.equal(restored.hidden.includes('gi'), false);
    assert.equal(restored.flags.gi, false);
    assert.equal(visibleReadyItems(restored).some((item) => item.id === 'gi'), true);
    assert.equal(competitorReady(sam.id).hidden.length, 0);

    for (const item of READY_ITEMS) removeReadyItem(alex.id, item.id);
    assert.equal(visibleReadyItems(competitorReady(alex.id)).length, 0);
    assert.equal(readyStatusLabel(competitorReady(alex.id)), 'No items');
    assert.equal(getRoster().ready[alex.id]?.hidden.length, READY_ITEMS.length);
    assert.equal(competitorReady(alex.id).flags.medical, true);
    restoreReadyItem(alex.id, 'medical');
    assert.equal(competitorReady(alex.id).flags.medical, true);
    assert.equal(visibleReadyItems(competitorReady(alex.id)).some((item) => item.id === 'medical'), true);
    assert.equal(visibleReadyItems(competitorReady(sam.id)).length, READY_ITEMS.length);

    const junk = normalizeRoster({
      students: [{ id: 'a', name: 'Alex', belt: 'Blue', division: 'Adult Blue', checkedIn: true }],
      ready: { a: { flags: { medical: true }, hidden: ['gi', 'nope', 'gi', 'weighIn'] } },
    });
    assert.deepEqual(junk.ready.a?.hidden, ['gi', 'weighIn']);
    assert.equal(junk.ready.a?.flags.medical, true);
    assert.equal(junk.students[0]?.division, 'Adult Blue');
    assert.equal(junk.students[0]?.checkedIn, true);
    resetRoster();
  });
});

describe('known injuries', () => {
  it('saves on the competitor, reloads, and leaves division and check in alone', () => {
    resetRoster();
    const added = addStudent({
      name: 'Alex Rivera',
      belt: 'Purple',
      division: 'Adult Purple',
      gym: '',
      lastPromotion: '',
      note: 'Knee tape',
      knownInjuries: '  Left knee, right shoulder  ',
    });
    assert.ok(added);
    assert.equal(added.knownInjuries, 'Left knee, right shoulder');
    assert.equal(added.checkedIn, false);

    const reloaded = normalizeRoster(JSON.parse(JSON.stringify(getRoster())));
    const saved = reloaded.students.find((row) => row.id === added.id);
    assert.equal(saved?.knownInjuries, 'Left knee, right shoulder');
    assert.equal(saved?.division, 'Adult Purple');
    assert.equal(saved?.note, 'Knee tape');
    assert.equal(saved?.checkedIn, false);

    const older = normalizeRoster({
      students: [{ id: 'old', name: 'Pat', belt: 'Blue', division: 'Kids Gi', checkedIn: true }],
    });
    assert.equal(older.students[0]?.knownInjuries, '');
    assert.equal(older.students[0]?.division, 'Kids Gi');
    assert.equal(older.students[0]?.checkedIn, true);

    const edited = updateStudent(added.id, { note: 'Shoulder' });
    assert.equal(edited?.knownInjuries, 'Left knee, right shoulder');
    assert.equal(edited?.division, 'Adult Purple');
    assert.equal(setCheckedIn(added.id, true)?.knownInjuries, 'Left knee, right shoulder');
    const changed = updateStudent(added.id, { knownInjuries: 'Right shoulder only' });
    assert.equal(changed?.knownInjuries, 'Right shoulder only');
    assert.equal(changed?.checkedIn, true);
    assert.equal(changed?.division, 'Adult Purple');
    assert.equal(changed?.note, 'Shoulder');

    const long = studentFromInput({
      name: 'Sam',
      belt: 'White',
      knownInjuries: 'I'.repeat(INJURY_MAX + 40),
    });
    assert.equal(long?.knownInjuries.length, INJURY_MAX);
    resetRoster();
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
