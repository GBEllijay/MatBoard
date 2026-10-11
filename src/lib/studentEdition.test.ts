import assert from 'node:assert/strict';
import test from 'node:test';
import { lockCoach } from './coachUnlock.ts';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { parseProgressPacket, searchJournal } from './progress/format.ts';
import { lockPro, tryProductOwnerUnlock, tryUnlock } from './proUnlock.ts';
import { isWhiteUnlocked, setWhiteUnlocked } from './whiteUnlock.ts';
import {
  addCustomFundamental,
  addJournalAmendment,
  addJournalEntry,
  blankStudentReport,
  decodeJournalBody,
  fundamentalsBoard,
  loadStudentReport,
  saveStudentReport,
  searchStudentJournal,
  setFundamentalLearned,
  studentEditionOpen,
  STUDENT_EDITION_STORAGE_KEY,
  viewJournalEntry,
} from './studentEdition.ts';

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

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

function resetUnlocks(): void {
  lockPro();
  lockCoach();
  setWhiteUnlocked(false);
}

test('preview flag opens Student Edition without unlocking other products', () => {
  resetUnlocks();
  assert.equal(studentEditionOpen(new URLSearchParams('student=1'), { pro: false, coach: false, white: false }), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: false, white: false }), false);
  assert.equal(tryUnlock('advantage'), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: false, white: false }), false);
  resetUnlocks();
});

test('WINBYADV owner unlock opens Student Edition', () => {
  resetUnlocks();
  assert.equal(tryProductOwnerUnlock('pro', 'WINBYADV'), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: true, white: true }), true);
  resetUnlocks();
});

test('a saved journal card stays in the progress file and search finds the technique', () => {
  const storage = memoryStorage();
  const draft = {
    date: '2026-10-11',
    classKind: 'gi' as const,
    gameTag: 'a' as const,
    techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
    partners: 'Alex',
    drills: 'hip escapes',
    rolls: '5 rounds',
    notes: 'grip the collar deeper',
  };
  const saved = saveStudentReport(storage, addJournalEntry(blankStudentReport(10), draft, 10));
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.journal.length, 1);
  assert.equal(storage.getItem(STUDENT_EDITION_STORAGE_KEY)?.includes('student-progress-report'), true);
  const parsed = parseProgressPacket(storage.getItem(STUDENT_EDITION_STORAGE_KEY) ?? '');
  assert.equal(parsed.ok, true);
  const card = viewJournalEntry(saved.journal[0]);
  assert.equal(card.notes, 'grip the collar deeper');
  assert.equal(card.classKind, 'gi');
  assert.equal(card.techniques[0].name, 'Scissor sweep');
  assert.equal(searchStudentJournal(saved, 'scissor').length, 1);
  assert.equal(searchJournal(saved.journal, 'collar').length, 1);
  assert.equal(decodeJournalBody(saved.journal[0].body).partners, 'Alex');
});

test('an amendment is appended and the original card is unchanged', () => {
  const report = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      classKind: 'nogi',
      gameTag: 'b',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'grip the collar deeper',
    },
    10,
  );
  const original = report.journal[0];
  const next = addJournalAmendment(report, original.id, 'kick the far leg', '2026-10-12', 20);
  const card = next.journal[0];
  assert.equal(card.body, original.body);
  assert.equal(card.date, original.date);
  assert.equal(card.gameTag, original.gameTag);
  assert.equal(card.createdAt, original.createdAt);
  assert.equal(card.updatedAt, original.updatedAt);
  assert.deepEqual(card.techniqueRefs, original.techniqueRefs);
  assert.equal(card.amendments.length, 1);
  assert.equal(card.amendments[0].date, '2026-10-12');
  assert.equal(card.amendments[0].body, 'kick the far leg');
  assert.equal(searchStudentJournal(next, 'far leg').length, 1);
  assert.equal(viewJournalEntry(card).notes, 'grip the collar deeper');
  const skipped = addJournalAmendment(next, original.id, '   ', '2026-10-12', 30);
  assert.equal(skipped.journal[0].amendments.length, 1);
});

test('fundamentals counts grow when items are marked learned, including a custom line', () => {
  let report = blankStudentReport(10);
  const sweeps = FUNDAMENTALS_CATALOG.categories.find((category) => category.id === 'sweeps');
  assert.ok(sweeps);
  for (const item of sweeps.items.slice(0, 2)) {
    report = setFundamentalLearned(report, { catalogItemId: item.id, categoryId: 'sweeps', name: item.name }, true, '2026-10-11', 11);
  }
  report = addCustomFundamental(report, 'sweeps', 'Lasso sweep', 12);
  report = setFundamentalLearned(report, { catalogItemId: '', categoryId: 'sweeps', name: 'Lasso sweep' }, true, '2026-10-11', 13);
  const board = fundamentalsBoard(report);
  const view = board.find((category) => category.id === 'sweeps');
  assert.ok(view);
  assert.equal(view.learned, 3);
  assert.equal(view.items.some((item) => item.name === 'Lasso sweep' && item.custom), true);
  assert.equal(`${view.name} ${view.learned} learned`, 'Sweeps 3 learned');
  const saved = saveStudentReport(memoryStorage(), report);
  assert.equal(saved.checklist.length, 3);
});
