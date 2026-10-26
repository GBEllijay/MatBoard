import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { addTournament } from './studentCompetition.ts';
import {
  explicitStudentDemo,
  installStudentMockGuard,
  isBundledMockStudentPayload,
  isSimulatedAssessmentPayload,
  isSimulatedStudentPayload,
  noteStudentStorageEvent,
  reconcileStudentStorage,
  resetStudentMockGuardForTests,
  STUDENT_ASSESSMENT_GUARD_KEY,
  STUDENT_BACKUP_STAMP_GUARD_KEY,
  STUDENT_FILE_STORAGE_KEY,
} from './studentDemo.ts';
import { ASSESSMENT_STORAGE_KEY, emptyAssessments, loadAssessments, saveAssessment, writeAssessments } from './studentAssessment.ts';
import { STUDENT_BACKUP_STAMP_KEY, noteStudentBackupBuilt, readStudentBackupStamp } from './studentBackupStamp.ts';
import { clearStudentMemory } from './studentBackup.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport, setStudentProfile, STUDENT_EDITION_STORAGE_KEY } from './studentEdition.ts';
import { setRankBelt, setRankTapeCount } from './studentRank.ts';

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

const areaScores = {
  guard: 3,
  passing: 3,
  takedowns: 3,
  escapes: 4,
  submissions: 3,
  conditioning: 3,
  mindset: 4,
} as const;

function simAthleteJournal(): string {
  let report = setStudentProfile(blankStudentReport(1), { displayName: 'Sim Athlete Coach Two', gymName: 'Sim Gym Alpha' }, 2);
  report = setRankTapeCount(setRankBelt(report, 'blue', 3), 3, 4);
  report = addTournament(
    report,
    {
      name: 'Sim Open Holiday Classic',
      date: '2027-01-09',
      location: 'Sim City',
      division: 'Blue',
      weightClass: 'Middle',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '170',
      targetUnit: 'lb',
    },
    5,
  );
  return exportProgressPacket(report);
}

function simAssessment(): string {
  return JSON.stringify({
    entries: [
      {
        id: 'sim-1024',
        date: '2026-10-24',
        note: 'Mock self-assessment before Pan Pacific.',
        scores: { guard: 5, passing: 4, takedowns: 4, escapes: 5, submissions: 4, conditioning: 4, mindset: 5 },
      },
      {
        id: 'sim-1025',
        date: '2026-10-25',
        note: 'Drill the pass. Stop reaching.',
        scores: areaScores,
      },
      {
        id: 'sim-1026',
        date: '2026-10-26',
        note: 'Drill the pass. Stop reaching.',
        scores: areaScores,
      },
    ],
  });
}

test('the nightly sim athlete seed is demo data, and a real Sim at a real gym is not', () => {
  assert.equal(STUDENT_ASSESSMENT_GUARD_KEY, ASSESSMENT_STORAGE_KEY);
  assert.equal(STUDENT_BACKUP_STAMP_GUARD_KEY, STUDENT_BACKUP_STAMP_KEY);
  const sim = simAthleteJournal();
  assert.equal(isSimulatedStudentPayload(sim), true);
  assert.equal(isBundledMockStudentPayload(sim), false);
  assert.equal(isSimulatedAssessmentPayload(simAssessment()), true);
  const realSim = setStudentProfile(
    addTournament(blankStudentReport(1), { ...meetFields(), name: 'Spring Open' }, 2),
    { displayName: 'Sim', gymName: 'GB Ellijay' },
    3,
  );
  assert.equal(isSimulatedStudentPayload(exportProgressPacket(realSim)), false);
  assert.equal(isSimulatedAssessmentPayload(JSON.stringify({ entries: [{ id: 'mine', date: '2026-10-26', note: 'calm rounds', scores: areaScores }] })), false);
});

function meetFields() {
  return {
    name: 'Spring Open',
    date: '2026-11-02',
    location: 'Atlanta',
    division: 'Adult Blue',
    weightClass: 'Feather',
    deadline: '',
    link: '',
    status: 'entered' as const,
    targetWeight: '',
    targetUnit: 'lb' as const,
  };
}

test('a fresh session drops the sim athlete journal, self-assessment history, and last-backup date', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  storage.poke(STUDENT_FILE_STORAGE_KEY, simAthleteJournal());
  storage.poke(ASSESSMENT_STORAGE_KEY, simAssessment());
  storage.poke(STUDENT_BACKUP_STAMP_KEY, '2026-10-25T12:00:00.000Z');
  installStudentMockGuard(storage, () => '?student=1');
  assert.equal(storage.getItem(STUDENT_FILE_STORAGE_KEY), null);
  assert.equal(storage.getItem(ASSESSMENT_STORAGE_KEY), null);
  assert.equal(storage.getItem(STUDENT_BACKUP_STAMP_KEY), null);
  const fresh = loadStudentReport(storage);
  assert.equal(fresh.profile.belt, 'white');
  assert.equal(fresh.profile.displayName, '');
  assert.equal(fresh.rank?.tapeCount, 0);
  assert.equal(fresh.competition?.tournaments.length, 0);
  assert.equal(loadAssessments(storage).entries.length, 0);
  assert.equal(readStudentBackupStamp(storage), null);

  storage.setItem(STUDENT_FILE_STORAGE_KEY, simAthleteJournal());
  storage.setItem(ASSESSMENT_STORAGE_KEY, simAssessment());
  storage.setItem(STUDENT_BACKUP_STAMP_KEY, '2026-10-25T12:00:00.000Z');
  assert.equal(storage.getItem(STUDENT_FILE_STORAGE_KEY), null);
  assert.equal(storage.getItem(ASSESSMENT_STORAGE_KEY), null);
  assert.equal(readStudentBackupStamp(storage), null);
  assert.equal(loadStudentReport(storage).profile.belt, 'white');
});

test('clear forgets sim self-assessment history, including a later 10-26 entry, and the backup date', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '?student=1');
  storage.poke(STUDENT_FILE_STORAGE_KEY, simAthleteJournal());
  storage.poke(ASSESSMENT_STORAGE_KEY, simAssessment());
  storage.poke(STUDENT_BACKUP_STAMP_KEY, '2026-10-25T12:00:00.000Z');
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(loadStudentReport(storage).profile.displayName, '');
  assert.equal(loadAssessments(storage).entries.length, 0);

  writeAssessments(
    storage,
    saveAssessment(emptyAssessments(), { date: '2026-10-20', note: 'my own check-in', scores: areaScores }, 4),
  );
  noteStudentBackupBuilt(new Date('2026-10-22T15:00:00.000Z'), storage);
  assert.equal(loadAssessments(storage).entries.length, 1);
  assert.equal(readStudentBackupStamp(storage)?.slice(0, 10), '2026-10-22');

  clearStudentMemory(storage);
  assert.equal(loadStudentReport(storage).profile.belt, 'white');
  assert.equal(loadStudentReport(storage).profile.displayName, '');
  assert.equal(loadAssessments(storage).entries.length, 0);
  assert.equal(readStudentBackupStamp(storage), null);

  storage.setItem(ASSESSMENT_STORAGE_KEY, simAssessment());
  storage.setItem(STUDENT_BACKUP_STAMP_KEY, '2026-10-25T12:00:00.000Z');
  storage.setItem(
    ASSESSMENT_STORAGE_KEY,
    JSON.stringify({
      entries: [{ id: 'stray', date: '2026-10-26', note: 'Mock self-assessment carried to today.', scores: areaScores }],
    }),
  );
  assert.equal(storage.getItem(ASSESSMENT_STORAGE_KEY), null);
  assert.equal(readStudentBackupStamp(storage), null);
  storage.poke(ASSESSMENT_STORAGE_KEY, simAssessment());
  storage.poke(STUDENT_BACKUP_STAMP_KEY, '2026-10-25T18:00:00.000Z');
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(loadAssessments(storage).entries.some((entry) => entry.date === '2026-10-26'), false);
  assert.equal(loadAssessments(storage).entries.some((entry) => entry.note.includes('Mock self-assessment')), false);
  assert.equal(loadAssessments(storage).entries.length, 0);
  assert.equal(readStudentBackupStamp(storage), null);

  writeAssessments(
    storage,
    saveAssessment(emptyAssessments(), { date: '2026-10-26', note: 'real check-in after clear', scores: areaScores }, 8),
  );
  noteStudentBackupBuilt(new Date('2026-10-26T16:00:00.000Z'), storage);
  assert.equal(loadAssessments(storage).entries[0]?.note, 'real check-in after clear');
  assert.equal(readStudentBackupStamp(storage)?.slice(0, 10), '2026-10-26');
  storage.poke(ASSESSMENT_STORAGE_KEY, simAssessment());
  reconcileStudentStorage(storage, '?student=1');
  assert.equal(loadAssessments(storage).entries.length, 1);
  assert.equal(loadAssessments(storage).entries[0]?.note, 'real check-in after clear');
  assert.equal(loadAssessments(storage).entries.some((entry) => entry.date === '2026-10-24'), false);
});

test('saving earlier check-ins does not invent a check-in for today', () => {
  const first = saveAssessment(
    emptyAssessments(),
    { date: '2026-10-24', note: 'Mock self-assessment before Pan Pacific.', scores: { ...areaScores, guard: 5, passing: 5, escapes: 5, mindset: 5 } },
    1,
  );
  const second = saveAssessment(first, { date: '2026-10-25', note: 'Drill the pass. Stop reaching.', scores: areaScores }, 2);
  assert.deepEqual(
    second.entries.map((entry) => entry.date),
    ['2026-10-25', '2026-10-24'],
  );
});

test('demo=1 still keeps the sim athlete seed', () => {
  resetStudentMockGuardForTests();
  const storage = memory();
  installStudentMockGuard(storage, () => '?demo=1');
  storage.setItem(STUDENT_FILE_STORAGE_KEY, simAthleteJournal());
  storage.setItem(ASSESSMENT_STORAGE_KEY, simAssessment());
  assert.equal(loadStudentReport(storage).profile.displayName, 'Sim Athlete Coach Two');
  assert.equal(loadStudentReport(storage).profile.belt, 'blue');
  assert.equal(loadStudentReport(storage).rank?.tapeCount, 3);
  assert.equal(loadAssessments(storage).entries.length, 3);
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
