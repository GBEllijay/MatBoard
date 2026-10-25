import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { addTournament } from './studentCompetition.ts';
import {
  explicitStudentDemo,
  installStudentMockGuard,
  isBundledMockStudentPayload,
  noteStudentStorageEvent,
  reconcileStudentStorage,
  resetStudentMockGuardForTests,
  STUDENT_FILE_STORAGE_KEY,
} from './studentDemo.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport, STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { setRankBelt } from './studentRank.ts';

const handoff = readFileSync(new URL('./fixtures/send-to-coach-handoff.json', import.meta.url), 'utf8');

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    poke(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function realJournal(): string {
  const report = setRankBelt(
    addTournament(
      blankStudentReport(1),
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
      2,
    ),
    'blue',
    3,
  );
  return exportProgressPacket(report);
}

test('student=1 is not a demo seed, and only demo=1 or demo=paige is', () => {
  assert.equal(STUDENT_FILE_STORAGE_KEY, STUDENT_EDITION_STORAGE_KEY);
  assert.equal(explicitStudentDemo('?student=1'), false);
  assert.equal(explicitStudentDemo('student=1'), false);
  assert.equal(explicitStudentDemo('?demo=preview'), false);
  assert.equal(explicitStudentDemo('?demo=1'), true);
  assert.equal(explicitStudentDemo('?student=1&demo=paige'), true);
  assert.equal(explicitStudentDemo('/student?demo=Paige'), true);
});

test('the stress-test file is the bundled mock, and a real journal is not', () => {
  assert.equal(isBundledMockStudentPayload(handoff), true);
  assert.equal(isBundledMockStudentPayload(realJournal()), false);
  assert.equal(
    isBundledMockStudentPayload(JSON.stringify({ profile: { belt: 'white' }, goals: [{ name: 'Pan Pacific Championship (mock)' }] })),
    false,
  );
});

test('a blank session drops a raw write of the stress-test file and keeps a real journal', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '?student=1');
  storage.setItem(STUDENT_FILE_STORAGE_KEY, handoff);
  assert.equal(storage.getItem(STUDENT_FILE_STORAGE_KEY), null);
  storage.setItem(STUDENT_FILE_STORAGE_KEY, realJournal());
  assert.equal(loadStudentReport(storage).profile.belt, 'blue');
  assert.equal(loadStudentReport(storage).competition?.tournaments[0]?.name, 'Spring Open');
  storage.setItem(STUDENT_FILE_STORAGE_KEY, handoff);
  assert.equal(loadStudentReport(storage).profile.belt, 'blue');
  storage.setItem('advantage.studentUnlocked', '1');
  assert.equal(storage.getItem('advantage.studentUnlocked'), '1');
});

test('demo=1 and demo=paige allow a raw write of the stress-test file', () => {
  for (const search of ['?demo=1', '?student=1&demo=paige']) {
    resetStudentMockGuardForTests();
    const storage = memory();
    installStudentMockGuard(storage, () => search);
    storage.setItem(STUDENT_FILE_STORAGE_KEY, handoff);
    assert.equal(loadStudentReport(storage).profile.belt, 'black');
    assert.equal(loadStudentReport(storage).rank?.tapeCount, 3);
  }
});

test('an app save of the stress-test file does not stick unless the demo was requested', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '?student=1');
  const parsed = parseProgressPacket(handoff);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  saveStudentReport(storage, parsed.value);
  assert.equal(loadStudentReport(storage).profile.belt, 'white');
  assert.equal(storage.getItem(STUDENT_FILE_STORAGE_KEY)?.includes('Pan Pacific'), false);
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(loadStudentReport(storage).profile.belt, 'white');

  resetStudentMockGuardForTests();
  const demo = memory();
  installStudentMockGuard(demo, () => '?demo=1');
  saveStudentReport(demo, parsed.value);
  assert.equal(loadStudentReport(demo).profile.belt, 'black');
  assert.equal(loadStudentReport(demo).competition?.tournaments.some((row) => row.name === 'Pan Pacific Championship (mock)'), true);
});

test('a stress-test file already stored is removed unless the demo was requested', () => {
  resetStudentMockGuardForTests();
  const existing = memory();
  existing.poke(STUDENT_FILE_STORAGE_KEY, handoff);
  installStudentMockGuard(existing, () => '?student=1');
  reconcileStudentStorage(existing, '?student=1');
  assert.equal(existing.getItem(STUDENT_FILE_STORAGE_KEY), null);
  assert.equal(loadStudentReport(existing).profile.belt, 'white');

  resetStudentMockGuardForTests();
  const demo = memory();
  demo.poke(STUDENT_FILE_STORAGE_KEY, handoff);
  installStudentMockGuard(demo, () => '?demo=paige');
  reconcileStudentStorage(demo, '?demo=paige');
  assert.equal(loadStudentReport(demo).profile.belt, 'black');
});

test('a late stress-test write is removed, including one from another tab, and a real journal from another tab stays', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '?student=1');
  storage.poke(STUDENT_FILE_STORAGE_KEY, handoff);
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(storage.getItem(STUDENT_FILE_STORAGE_KEY), null);
  assert.equal(loadStudentReport(storage).profile.belt, 'white');

  storage.poke(STUDENT_FILE_STORAGE_KEY, handoff);
  noteStudentStorageEvent(STUDENT_FILE_STORAGE_KEY);
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(storage.getItem(STUDENT_FILE_STORAGE_KEY), null);
  assert.equal(loadStudentReport(storage).profile.belt, 'white');

  resetStudentMockGuardForTests();
  const other = memory();
  installStudentMockGuard(other, () => '?student=1');
  other.poke(STUDENT_FILE_STORAGE_KEY, realJournal());
  noteStudentStorageEvent(STUDENT_FILE_STORAGE_KEY);
  reconcileStudentStorage(other, '?student=1');
  assert.equal(loadStudentReport(other).profile.belt, 'blue');
  assert.equal(loadStudentReport(other).competition?.tournaments[0]?.name, 'Spring Open');
});

test('a late bypass write does not replace a journal this phone already saved', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '');
  saveStudentReport(storage, loadStudentReport({ getItem: () => realJournal() }));
  storage.poke(STUDENT_FILE_STORAGE_KEY, handoff);
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(loadStudentReport(storage).profile.belt, 'blue');
  assert.equal(loadStudentReport(storage).competition?.tournaments[0]?.name, 'Spring Open');
});
