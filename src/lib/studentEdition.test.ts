import assert from 'node:assert/strict';
import test from 'node:test';
import { API_PRODUCT_STUDENT } from '../server/routes.ts';
import { isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { parseProgressPacket, searchJournal } from './progress/format.ts';
import { lockPro, tryProductOwnerUnlock, tryUnlock } from './proUnlock.ts';
import { isWhiteUnlocked, setWhiteUnlocked } from './whiteUnlock.ts';
import {
  addCustomFundamental,
  addJournalAmendment,
  addJournalClip,
  addJournalEntry,
  deleteJournalClip,
  searchStudentClips,
  updateJournalClip,
  blankStudentReport,
  decodeJournalBody,
  fundamentalsBoard,
  hideFundamental,
  loadStudentReport,
  renameFundamental,
  restoreStarterFundamentals,
  saveStudentReport,
  searchStudentJournal,
  setFundamentalLearned,
  rememberStudentPurchase,
  setStudentPurchased,
  studentEditionOpen,
  studentPurchaseReturn,
  STUDENT_EDITION_STORAGE_KEY,
  STUDENT_PRODUCT_ID,
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
  setStudentPurchased(false);
}

test('preview flag opens Student Edition without unlocking other products', () => {
  resetUnlocks();
  assert.equal(studentEditionOpen(new URLSearchParams('student=1'), { pro: false, coach: false, white: false }), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: false, white: false }), false);
  resetUnlocks();
});

test('a Pro unlock opens Student Edition and the Coach-only code does not', () => {
  resetUnlocks();
  assert.equal(tryUnlock('advantage'), true);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isWhiteUnlocked(), false);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: false, white: false }), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: false, white: false }), true);
  resetUnlocks();
  assert.equal(tryProductOwnerUnlock('coach', 'gbellijay'), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: true, white: false }), false);
  resetUnlocks();
});

test('a completed Student Edition Checkout unlocks the journal', () => {
  resetUnlocks();
  assert.equal(STUDENT_PRODUCT_ID, API_PRODUCT_STUDENT);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: false, white: false }), false);
  assert.equal(rememberStudentPurchase({ entitled: true, product: 'advantage-white' }), false);
  assert.equal(rememberStudentPurchase({ entitled: true, product: 'advantage-pro' }), false);
  assert.equal(rememberStudentPurchase({ entitled: false, product: STUDENT_PRODUCT_ID }), false);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: false, white: false }), false);
  assert.equal(rememberStudentPurchase({ entitled: true, product: STUDENT_PRODUCT_ID }), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: false, white: false }), true);
  assert.equal(studentPurchaseReturn(new URLSearchParams('checkout=success&session_id=cs_test_student')), true);
  assert.equal(studentPurchaseReturn(new URLSearchParams('checkout=cancel&session_id=cs_test_student')), false);
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

test('a journal clip can be added, found by description or url, saved, and deleted', () => {
  const storage = memoryStorage();
  let report = blankStudentReport(10);
  assert.equal('clips' in report, false);
  assert.throws(() => addJournalClip(report, 'notaurl', 'armbar', 11), /http or https/);
  assert.throws(() => addJournalClip(report, 'https://youtu.be/abc', '   ', 11), /short note/);
  report = addJournalClip(report, 'https://www.youtube.com/watch?v=armbar', 'Armbar from closed guard', 11);
  report = addJournalClip(report, 'https://www.instagram.com/reel/kneeslice', 'Knee slice pass', 12);
  assert.deepEqual(searchStudentClips(report, 'closed guard').map((clip) => clip.description), ['Armbar from closed guard']);
  assert.deepEqual(searchStudentClips(report, 'instagram.com/reel').map((clip) => clip.id), [report.clips?.[1].id]);
  const armbarId = report.clips?.[0].id ?? '';
  report = updateJournalClip(report, armbarId, 'https://youtu.be/armbar-2', 'Armbar finish', 13);
  assert.equal(report.clips?.[0].url, 'https://youtu.be/armbar-2');
  assert.equal(report.clips?.[0].description, 'Armbar finish');
  assert.equal(report.clips?.[0].createdAt, 11);
  const saved = saveStudentReport(storage, report);
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.clips?.length, 2);
  assert.equal(loaded.clips?.[0].description, 'Armbar finish');
  assert.equal(saved.journal.length, 0);
  const removed = deleteJournalClip(loaded, armbarId, 14);
  assert.equal(removed.clips?.length, 1);
  assert.equal(removed.clips?.[0].description, 'Knee slice pass');
  const cleared = saveStudentReport(storage, deleteJournalClip(removed, removed.clips?.[0].id ?? '', 15));
  assert.deepEqual(cleared.clips, []);
  const legacy = JSON.parse(storage.getItem(STUDENT_EDITION_STORAGE_KEY) ?? '{}') as { clips?: unknown };
  delete legacy.clips;
  storage.setItem(STUDENT_EDITION_STORAGE_KEY, JSON.stringify(legacy));
  const oldFile = loadStudentReport(storage);
  assert.equal('clips' in oldFile, false);
  assert.equal(oldFile.kind, 'student-progress-report');
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

test('rename and remove are per-student overrides, and restore brings the starter line back', () => {
  let report = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      classKind: 'gi',
      gameTag: 'a',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'grip the collar deeper',
    },
    10,
  );
  report = setFundamentalLearned(
    report,
    { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' },
    true,
    '2026-10-11',
    11,
  );
  report = addCustomFundamental(report, 'sweeps', 'Lasso sweep', 12);
  report = setFundamentalLearned(report, { catalogItemId: '', categoryId: 'sweeps', name: 'Lasso sweep' }, true, '2026-10-11', 13);

  const before = fundamentalsBoard(report).find((category) => category.id === 'sweeps');
  assert.ok(before);
  assert.equal(before.learned, 2);
  const scissor = before.items.find((item) => item.catalogItemId === 'sweep.scissor');
  const lasso = before.items.find((item) => item.custom && item.name === 'Lasso sweep');
  assert.ok(scissor);
  assert.ok(lasso);

  report = renameFundamental(report, scissor, 'Hip scissor', 14);
  report = renameFundamental(report, lasso, 'Lasso from guard', 15);
  const renamed = saveStudentReport(memoryStorage(), report);
  const renamedBoard = fundamentalsBoard(renamed).find((category) => category.id === 'sweeps');
  assert.ok(renamedBoard);
  assert.equal(renamedBoard.learned, 2);
  assert.equal(renamedBoard.items.some((item) => item.label === 'Hip scissor' && item.name === 'Scissor sweep'), true);
  assert.equal(renamedBoard.items.some((item) => item.label === 'Lasso from guard' && item.name === 'Lasso sweep'), true);
  const scissorRow = renamed.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor');
  const lassoRow = renamed.checklist.find((entry) => entry.name === 'Lasso sweep');
  assert.ok(scissorRow);
  assert.ok(lassoRow);
  assert.equal(scissorRow.catalogItemId, 'sweep.scissor');
  assert.equal(scissorRow.name, 'Scissor sweep');
  assert.equal(scissorRow.displayName, 'Hip scissor');
  assert.equal(scissorRow.hidden, false);
  assert.equal(lassoRow.id, lasso.entryId);
  assert.equal(lassoRow.displayName, 'Lasso from guard');
  assert.equal(searchStudentJournal(renamed, 'scissor').length, 1);
  assert.equal(renamed.journal[0].techniqueRefs[0].name, 'Scissor sweep');
  assert.equal(renamed.journal[0].body.includes('Scissor sweep'), true);

  const hip = renamedBoard.items.find((item) => item.catalogItemId === 'sweep.scissor');
  const lassoNamed = renamedBoard.items.find((item) => item.entryId === lasso.entryId);
  assert.ok(hip);
  assert.ok(lassoNamed);
  report = hideFundamental(renamed, hip, 16);
  report = hideFundamental(report, lassoNamed, 17);
  const hiddenBoard = fundamentalsBoard(report).find((category) => category.id === 'sweeps');
  assert.ok(hiddenBoard);
  assert.equal(hiddenBoard.learned, 0);
  assert.equal(hiddenBoard.items.some((item) => item.catalogItemId === 'sweep.scissor' || item.name === 'Lasso sweep'), false);
  const hiddenScissor = report.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor');
  assert.ok(hiddenScissor);
  assert.equal(hiddenScissor.hidden, true);
  assert.equal(hiddenScissor.learnedOn, '2026-10-11');
  assert.equal(hiddenScissor.displayName, 'Hip scissor');
  assert.equal(searchStudentJournal(report, 'scissor').length, 1);

  report = restoreStarterFundamentals(report, 18);
  const restored = fundamentalsBoard(report).find((category) => category.id === 'sweeps');
  assert.ok(restored);
  assert.equal(restored.learned, 1);
  const back = restored.items.find((item) => item.catalogItemId === 'sweep.scissor');
  assert.ok(back);
  assert.equal(back.label, 'Scissor sweep');
  assert.equal(back.name, 'Scissor sweep');
  assert.equal(restored.items.some((item) => item.name === 'Lasso sweep' || item.label === 'Lasso from guard'), false);
  const restoredRow = report.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor');
  const stillHidden = report.checklist.find((entry) => entry.name === 'Lasso sweep');
  assert.ok(restoredRow);
  assert.ok(stillHidden);
  assert.equal(restoredRow.hidden, false);
  assert.equal(restoredRow.displayName, '');
  assert.equal(restoredRow.catalogItemId, 'sweep.scissor');
  assert.equal(stillHidden.hidden, true);
  assert.equal(searchStudentJournal(report, 'scissor').length, 1);
});
