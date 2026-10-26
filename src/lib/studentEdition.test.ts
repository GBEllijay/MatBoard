import assert from 'node:assert/strict';
import test from 'node:test';
import { API_PRODUCT_STUDENT } from '../server/routes.ts';
import { isCoachUnlocked, lockCoach } from './coachUnlock.ts';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { parseProgressPacket, searchJournal } from './progress/format.ts';
import { isProUnlocked, lockPro, tryProductOwnerUnlock, tryUnlock } from './proUnlock.ts';
import {
  clearStudentEditionRelock,
  isStudentEditionRelocked,
  isStudentEditionUnlocked,
  lockStudentEditionBrowser,
} from './studentUnlock.ts';
import { isWhiteUnlocked, setWhiteUnlocked } from './whiteUnlock.ts';
import { setRankBelt, setRankTapeCount } from './studentRank.ts';
import { DRIVE_BINDING_KEY } from './googleDrive.ts';
import {
  addCustomFundamental,
  addJournalAmendment,
  addJournalClip,
  addJournalEntry,
  deleteJournalClip,
  deleteJournalEntry,
  updateJournalEntry,
  searchStudentClips,
  setClipNote,
  updateJournalClip,
  blankStudentReport,
  decodeJournalBody,
  setStudentProfile,
  fundamentalsBoard,
  hideFundamental,
  loadStudentReport,
  renameFundamental,
  restoreStarterFundamentals,
  saveStudentReport,
  searchStudentJournal,
  setFundamentalLearned,
  setFundamentalLevel,
  rememberStudentPurchase,
  isStudentPurchased,
  setStudentPurchased,
  studentEditionOpen,
  todayIso,
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
  clearStudentEditionRelock();
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

test('locking Student Edition clears only this browser unlock and keeps journal, belt, and benchmarks', () => {
  resetUnlocks();
  assert.equal(tryProductOwnerUnlock('student', 'WINBYADV'), true);
  let report = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      className: 'Relock class',
      gameTag: 'a',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: 'Alex',
      drills: 'hip escapes',
      rolls: '5 rounds',
      notes: 'relock keeps the collar note',
    },
    10,
  );
  report = setRankTapeCount(setRankBelt(report, 'blue', 11), 2, 12);
  report = setFundamentalLevel(
    report,
    { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' },
    3,
    13,
  );
  saveStudentReport(localStorage, report);
  const before = localStorage.getItem(STUDENT_EDITION_STORAGE_KEY);
  localStorage.setItem(DRIVE_BINDING_KEY, '{"folderId":"keep-folder"}');
  setStudentPurchased(true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: true, white: true, student: true }), true);

  lockStudentEditionBrowser();

  assert.equal(isStudentEditionUnlocked(), false);
  assert.equal(isStudentPurchased(), false);
  assert.equal(isStudentEditionRelocked(), true);
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: true, white: true, student: true }), false);
  assert.equal(studentEditionOpen(new URLSearchParams('student=1'), { pro: true, coach: true, white: true }), true);
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), before);
  assert.equal(localStorage.getItem(DRIVE_BINDING_KEY), '{"folderId":"keep-folder"}');
  const kept = loadStudentReport(localStorage);
  assert.equal(kept.journal[0] ? viewJournalEntry(kept.journal[0]).notes : '', 'relock keeps the collar note');
  assert.equal(kept.profile.belt, 'blue');
  assert.equal(kept.rank?.tapeCount, 2);
  assert.equal(kept.checklist.some((row) => row.catalogItemId === 'sweep.scissor' && row.level === 3), true);

  assert.equal(rememberStudentPurchase({ entitled: true, product: STUDENT_PRODUCT_ID }), true);
  assert.equal(isStudentEditionRelocked(), false);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: true, white: true, student: false }), true);

  lockStudentEditionBrowser();
  assert.equal(tryProductOwnerUnlock('student', 'WINBYADV'), true);
  assert.equal(isStudentEditionRelocked(), false);
  assert.equal(isStudentEditionUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: true, white: true, student: true }), true);
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), before);

  lockPro();
  assert.equal(isStudentEditionRelocked(), false);
  assert.equal(isProUnlocked(), false);
  assert.equal(isCoachUnlocked(), true);
  assert.equal(isWhiteUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: false, coach: true, white: true }), false);
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), before);

  assert.equal(tryProductOwnerUnlock('pro', 'WINBYADV'), true);
  lockCoach();
  assert.equal(isStudentEditionRelocked(), false);
  assert.equal(isCoachUnlocked(), false);
  assert.equal(isProUnlocked(), true);
  assert.equal(studentEditionOpen(new URLSearchParams(''), { pro: true, coach: false, white: true }), true);
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), before);
  assert.equal(localStorage.getItem(DRIVE_BINDING_KEY), '{"folderId":"keep-folder"}');
  resetUnlocks();
});

test('a saved journal card stays in the progress file and search finds the technique', () => {
  const storage = memoryStorage();
  const draft = {
    date: '2026-10-11',
    className: 'Gi',
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
  assert.equal(card.className, 'Gi');
  assert.equal(card.techniques[0].name, 'Scissor sweep');
  assert.equal(searchStudentJournal(saved, 'scissor').length, 1);
  assert.equal(searchJournal(saved.journal, 'collar').length, 1);
  assert.equal(decodeJournalBody(saved.journal[0].body).partners, 'Alex');
});

test('older gi and no-gi class words stay text, and a new card does not store a game tag', () => {
  assert.equal(decodeJournalBody('Class: Gi\nNotes:\n').className, 'Gi');
  assert.equal(decodeJournalBody('Class: No-Gi\nNotes:\n').className, 'No-Gi');
  assert.equal(decodeJournalBody('Class: Fundamentals, week 7, class B\nNotes:\n').className, 'Fundamentals, week 7, class B');
  const report = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      className: 'Fundamentals, week 7, class B',
      gameTag: '',
      techniques: [],
      partners: '',
      drills: '',
      rolls: '',
      notes: '',
    },
    10,
  );
  assert.equal(report.journal[0].gameTag, '');
  assert.match(report.journal[0].body, /Class: Fundamentals, week 7, class B/);
  assert.equal(viewJournalEntry(report.journal[0]).className, 'Fundamentals, week 7, class B');
});

test('a new card keeps every drilled technique, and an older card stays the length it was saved', () => {
  const report = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      className: 'Gi',
      gameTag: 'a',
      techniques: [
        { id: '', name: 'Scissor sweep' },
        { id: '', name: '   ' },
        { id: 'sweep.hip-bump', name: 'Hip bump sweep' },
        { id: '', name: 'Armbar' },
      ],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'grip the collar deeper',
    },
    10,
  );
  const names = report.journal[0].techniqueRefs.map((item) => item.name);
  assert.deepEqual(names, ['Scissor sweep', 'Hip bump sweep', 'Armbar']);
  assert.match(report.journal[0].body, /Technique drilled #1: Scissor sweep/);
  assert.match(report.journal[0].body, /Technique drilled #2: Hip bump sweep/);
  assert.match(report.journal[0].body, /Technique drilled #3: Armbar/);
  assert.match(report.journal[0].body, /Techniques: Scissor sweep; Hip bump sweep; Armbar/);
  assert.equal(searchStudentJournal(report, 'technique drilled #2').length, 1);
  assert.equal(searchStudentJournal(report, 'hip bump').length, 1);
  assert.equal(viewJournalEntry(report.journal[0]).techniques.length, 3);

  const older = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      className: 'Gi',
      gameTag: 'a',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: '',
    },
    11,
  );
  older.journal[0].body = 'Class: Gi\nTechniques: Scissor sweep\nNotes:\n';
  assert.equal(viewJournalEntry(older.journal[0]).techniques.length, 1);
  assert.equal(viewJournalEntry(older.journal[0]).techniques[0].name, 'Scissor sweep');
  assert.equal(searchStudentJournal(older, 'technique drilled #1').length, 1);

  const overflow = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      className: 'Gi',
      gameTag: 'c',
      techniques: Array.from({ length: 14 }, (_, index) => ({ id: '', name: `Move ${index + 1}` })),
      partners: '',
      drills: '',
      rolls: '',
      notes: '',
    },
    12,
  );
  assert.equal(overflow.journal[0].techniqueRefs.length, 12);
  assert.equal(overflow.journal[0].techniqueRefs[11].name, 'Move 12');
});

test('a journal clip can be added, found by description or url, saved, and deleted', () => {
  const storage = memoryStorage();
  let report = blankStudentReport(10);
  assert.equal('clips' in report, false);
  assert.throws(() => addJournalClip(report, 'notaurl', 'armbar', 11), /http or https/);
  assert.throws(() => addJournalClip(report, 'https://youtu.be/abc', '   ', 11), /technique or drill/);
  report = addJournalClip(report, 'https://www.youtube.com/watch?v=armbar', 'Armbar from closed guard', 11);
  report = addJournalClip(report, 'https://www.instagram.com/reel/kneeslice', 'Knee slice pass', 12);
  assert.deepEqual(searchStudentClips(report, 'closed guard').map((clip) => clip.description), ['Armbar from closed guard']);
  assert.deepEqual(searchStudentClips(report, 'instagram.com/reel').map((clip) => clip.id), [report.clips?.[1].id]);
  const armbarId = report.clips?.[0].id ?? '';
  report = updateJournalClip(report, armbarId, 'https://youtu.be/armbar-2', 'Armbar finish', 13);
  assert.equal(report.clips?.[0].url, 'https://youtu.be/armbar-2');
  assert.equal(report.clips?.[0].description, 'Armbar finish');
  assert.equal(report.clips?.[0].note, '');
  report = setClipNote(report, armbarId, 'long grip', 14);
  assert.equal(report.clips?.[0].note, 'long grip');
  assert.deepEqual(searchStudentClips(report, 'long grip').map((clip) => clip.id), [armbarId]);
  report = updateJournalClip(report, armbarId, 'https://youtu.be/armbar-2', 'Armbar finish', 15);
  assert.equal(report.clips?.[0].note, 'long grip');
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
      className: 'No-Gi',
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
      className: 'Gi',
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
  assert.equal(stillHidden.level, 3);
  assert.equal(searchStudentJournal(report, 'scissor').length, 1);
});

test('proficiency replaces the learned mark without dropping the date or note', () => {
  let report = blankStudentReport(10);
  report = setFundamentalLevel(
    report,
    { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' },
    4,
    20,
    { note: 'collar deeper', learnedOn: '2026-10-11' },
  );
  const row = report.checklist[0];
  assert.equal(row.level, 4);
  assert.equal(row.learnedOn, '2026-10-11');
  assert.equal(row.note, 'collar deeper');
  assert.equal(row.updatedAt, 20);
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 1, 21);
  assert.equal(report.checklist[0].level, 1);
  assert.equal(report.checklist[0].learnedOn, '2026-10-11');
  assert.equal(report.checklist[0].note, 'collar deeper');
  const stamped = Date.parse('2026-10-12T15:00:00Z');
  report = setFundamentalLevel(
    report,
    { catalogItemId: 'pass.knee-slice', categoryId: 'passes', name: 'Knee slice pass' },
    3,
    stamped,
  );
  const pass = report.checklist.find((entry) => entry.catalogItemId === 'pass.knee-slice');
  assert.ok(pass);
  assert.equal(pass.level, 3);
  assert.equal(pass.learnedOn, todayIso(new Date(stamped)));
  const saved = saveStudentReport(memoryStorage(), report);
  assert.equal(saved.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor')?.level, 1);
  assert.equal(saved.checklist.find((entry) => entry.catalogItemId === 'pass.knee-slice')?.level, 3);
  const board = fundamentalsBoard(saved);
  assert.equal(board.find((category) => category.id === 'sweeps')?.learned, 0);
  assert.equal(board.find((category) => category.id === 'passes')?.learned, 1);
  assert.equal(board.find((category) => category.id === 'passes')?.items.find((item) => item.catalogItemId === 'pass.knee-slice')?.level, 3);
});

test('editing a card keeps its id and later notes, and delete removes only that card', () => {
  const draft = {
    date: '2026-10-11',
    className: 'Gi',
    gameTag: 'a' as const,
    techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
    partners: 'Alex',
    drills: 'hip escapes',
    rolls: '5 rounds',
    notes: 'grip the collar deeper',
  };
  let report = addJournalEntry(blankStudentReport(10), draft, 10);
  report = addJournalEntry(
    report,
    { ...draft, date: '2026-10-12', className: 'No-Gi', notes: 'keep me', partners: '', drills: '', rolls: '' },
    11,
  );
  const id = report.journal[0].id;
  report = addJournalAmendment(report, id, 'later note', '2026-10-13', 12);
  report = updateJournalEntry(report, id, { ...draft, notes: 'updated', partners: 'Sam', drills: 'shrimps', rolls: '6 rounds' }, 13);
  assert.equal(report.journal.length, 2);
  assert.equal(report.journal[0].id, id);
  assert.equal(report.journal[0].createdAt, 10);
  assert.equal(report.journal[0].amendments[0]?.body, 'later note');
  const card = viewJournalEntry(report.journal[0]);
  assert.equal(card.notes, 'updated');
  assert.equal(card.partners, 'Sam');
  assert.equal(card.drills, 'shrimps');
  assert.equal(card.rolls, '6 rounds');
  assert.equal(card.techniques[0]?.name, 'Scissor sweep');
  const gone = deleteJournalEntry(report, id, 14);
  assert.equal(gone.journal.length, 1);
  assert.equal(viewJournalEntry(gone.journal[0]).notes, 'keep me');
  assert.equal(viewJournalEntry(gone.journal[0]).stopDoing, '');
  assert.equal(deleteJournalEntry(gone, id, 15), gone);
});

test('an older combined note stays readable, and a Stop doing line splits out', () => {
  const combined = decodeJournalBody('Class: Gi\nNotes:\ncollar deeper and I keep posting');
  assert.equal(combined.notes, 'collar deeper and I keep posting');
  assert.equal(combined.stopDoing, '');

  const marked = decodeJournalBody('Class: Gi\nNotes:\ncollar deeper\nStop doing:\nposting the near hand');
  assert.equal(marked.notes, 'collar deeper');
  assert.equal(marked.stopDoing, 'posting the near hand');

  const inline = decodeJournalBody('Notes:\nStop doing: elbow flare');
  assert.equal(inline.notes, '');
  assert.equal(inline.stopDoing, 'elbow flare');

  const sentence = decodeJournalBody('Notes:\nI need to stop doing the post');
  assert.equal(sentence.notes, 'I need to stop doing the post');
  assert.equal(sentence.stopDoing, '');

  const saved = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-11',
      className: 'Gi',
      gameTag: '',
      techniques: [],
      partners: 'Alex',
      drills: 'hip escapes',
      rolls: '5 rounds',
      notes: 'collar deeper',
      stopDoing: 'posting the near hand',
    },
    10,
  );
  const card = viewJournalEntry(saved.journal[0]);
  assert.equal(card.notes, 'collar deeper');
  assert.equal(card.stopDoing, 'posting the near hand');
  assert.equal(card.drills, 'hip escapes');
  const again = updateJournalEntry(saved, saved.journal[0].id, {
    date: '2026-10-11',
    className: 'Gi',
    gameTag: '',
    techniques: [],
    partners: 'Alex',
    drills: 'hip escapes',
    rolls: '5 rounds',
    notes: 'collar deeper',
  });
  assert.equal(viewJournalEntry(again.journal[0]).stopDoing, 'posting the near hand');
});

test('a fresh journal starts white, and a file without name, gym, or start date keeps its cards', () => {
  const fresh = blankStudentReport(4);
  assert.equal(fresh.profile.belt, 'white');
  assert.equal(fresh.profile.displayName, '');
  assert.equal(fresh.profile.gymName, '');
  assert.equal(fresh.profile.startedOn, '');
  assert.equal(fresh.journal.length, 0);
  assert.equal(fresh.rank?.tapeCount, 0);
  assert.equal(fresh.competition?.tournaments.length, 0);
  assert.equal(JSON.stringify(fresh).includes('Pan Pacific'), false);
  assert.equal(JSON.stringify(fresh).includes('(mock)'), false);

  const storage = memoryStorage();
  const written = addJournalEntry(
    blankStudentReport(8),
    {
      date: '2026-04-02',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: 'Alex',
      drills: '',
      rolls: '',
      notes: 'collar grip deeper',
    },
    9,
  );
  const raw = JSON.parse(JSON.stringify(written)) as {
    profile: { displayName?: string; gymName?: string; startedOn?: string; belt: string };
    journal: { id: string }[];
  };
  delete raw.profile.displayName;
  delete raw.profile.gymName;
  delete raw.profile.startedOn;
  raw.profile.belt = 'blue';
  storage.setItem(STUDENT_EDITION_STORAGE_KEY, JSON.stringify(raw));
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.profile.displayName, '');
  assert.equal(loaded.profile.gymName, '');
  assert.equal(loaded.profile.startedOn, '');
  assert.equal(loaded.profile.belt, 'blue');
  assert.equal(loaded.journal.length, 1);
  assert.equal(loaded.journal[0]?.id, written.journal[0]?.id);
  assert.match(loaded.journal[0]?.body ?? '', /collar grip deeper/);
  const named = setStudentProfile(loaded, { displayName: 'Ada Student', gymName: 'GB Ellijay' }, 12);
  assert.equal(named.profile.startedOn, '');
  assert.equal(named.profile.belt, 'blue');
  assert.equal(named.journal.length, 1);
  const dated = setStudentProfile(named, { startedOn: '2014-03-01' }, 13);
  saveStudentReport(storage, dated);
  const roundTrip = loadStudentReport(storage);
  assert.equal(roundTrip.profile.displayName, 'Ada Student');
  assert.equal(roundTrip.profile.gymName, 'GB Ellijay');
  assert.equal(roundTrip.profile.startedOn, '2014-03-01');
  assert.equal(roundTrip.profile.belt, 'blue');
  assert.match(roundTrip.journal[0]?.body ?? '', /collar grip deeper/);
});
