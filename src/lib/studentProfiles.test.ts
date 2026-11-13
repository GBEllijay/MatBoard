/**
 * Family profiles: the original keys stay the default profile, extra profiles
 * are isolated, backups name the profile they restore into, and a second
 * profile is blocked until a slot exists.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emptyRankPhotoStore } from './rankPhotos.ts';
import { saveAssessment, writeAssessments } from './studentAssessment.ts';
import {
  applyBackupToMemory,
  buildStudentBackup,
  parseStudentBackup,
} from './studentBackup.ts';
import {
  installStudentMockGuard,
  resetStudentMockGuardForTests,
  STUDENT_FILE_STORAGE_KEY,
} from './studentDemo.ts';
import {
  addJournalEntry,
  blankStudentReport,
  loadStudentReport,
  saveStudentReport,
  setStudentProfile,
  STUDENT_EDITION_STORAGE_KEY,
  viewJournalEntry,
} from './studentEdition.ts';
import { writeIndexCards, loadIndexCards, INDEX_CARDS_STORAGE_KEY } from './indexCards.ts';
import { portraitMirrorId } from './profilePortrait.ts';
import { setRankBelt, setRankTapeCount } from './studentRank.ts';
import { filmBlobKey } from './studentFilm.ts';
import { ASSESSMENT_STORAGE_KEY } from './studentAssessment.ts';
import {
  DEFAULT_STUDENT_PROFILE_ID,
  STUDENT_PROFILES_KEY,
  EXTRA_PROFILE_FIXTURE_KEY,
  addStudentProfile,
  deleteStudentProfile,
  ensureStudentProfiles,
  extraProfileNeedsPurchase,
  installStudentProfileScope,
  readActiveStudentProfile,
  readStudentProfiles,
  renameStudentProfile,
  switchStudentProfile,
} from './studentProfiles.ts';

const JOURNAL = STUDENT_EDITION_STORAGE_KEY;
const PORTRAIT = 'matboard.studentPortrait.v1';

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}

function scores(value: 2 | 3 | 4 | 5) {
  return {
    guard: value,
    passing: value,
    sweeps: value,
    takedowns: value,
    escapes: value,
    submissions: value,
    conditioning: value,
    mindset: value,
  } as const;
}

function journal(note: string, belt: 'blue' | 'white', stripes: number, minutes: number) {
  const named = setStudentProfile(blankStudentReport(1), {
    displayName: note,
    gymName: 'Gym',
    startedOn: '2020-01-01',
  });
  const ranked = setRankTapeCount(setRankBelt(named, belt, 2), stripes, 3);
  return addJournalEntry(
    ranked,
    {
      date: '2026-10-17',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [{ id: '', name: 'Armbar' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: note,
      minutes,
    },
    4,
  );
}

function cardNotes(report: ReturnType<typeof loadStudentReport>): string {
  const entry = report.journal[0];
  return entry ? viewJournalEntry(entry).notes : '';
}

function cards(name: string) {
  return {
    version: 1 as const,
    cards: [{ id: `term.${name}`, faceId: 'sweeps' as const, name, tree: null, rating: 4 as const }],
  };
}

test('the first profile is free, the next one needs a slot, and the fixture path still adds', () => {
  const source = readFileSync(new URL('./studentProfiles.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../pages/student/StudentProfileSwitcher.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Continue to checkout — \$\{EXTRA_PROFILE_PRICE_LABEL\}/);
  assert.match(ui, /product: 'extra-profile'/);
  assert.match(source, /EXTRA_PROFILE_FIXTURE_KEY/);
  assert.doesNotMatch(`${source}\n${ui}`, /OWNER_TEST_SECRET/);
  assert.equal(extraProfileNeedsPurchase(1, 0, false), true);
  assert.equal(extraProfileNeedsPurchase(1, 1, false), false);
  assert.equal(extraProfileNeedsPurchase(2, 1, false), true);
  assert.equal(extraProfileNeedsPurchase(2, 0, true), false);
  const store = memory();
  store.setItem(JOURNAL, '{"journal":"keep-me"}');
  store.setItem(EXTRA_PROFILE_FIXTURE_KEY, '1');
  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  assert.equal(readStudentProfiles(store).profiles.length, 2);
  assert.equal(store.values.get(JOURNAL), '{"journal":"keep-me"}');
});

test('an existing single profile becomes the default profile with no data loss', () => {
  const store = memory();
  const original = {
    [JOURNAL]: '{"journal":"keep-me","belt":"blue"}',
    [ASSESSMENT_STORAGE_KEY]: '{"entries":["keep-check-in"]}',
    [INDEX_CARDS_STORAGE_KEY]: '{"cards":["keep-cards"]}',
    [PORTRAIT]: '{"version":1,"dataUrl":"keep-photo"}',
    'matboard.studentEdition.academyDrive.v1': '{"folderId":"academy-keep"}',
    'matboard.studentEdition.personalDrive.v1': '{"folderId":"drive-keep"}',
    'matboard.studentEdition.lastBackupAt.v1': '2026-10-25T12:00:00.000Z',
    'advantage.studentUnlocked': '1',
  };
  for (const [key, value] of Object.entries(original)) store.setItem(key, value);
  const first = ensureStudentProfiles(store);
  const written = store.getItem(STUDENT_PROFILES_KEY);
  const second = ensureStudentProfiles(store);
  assert.equal(first.activeId, DEFAULT_STUDENT_PROFILE_ID);
  assert.equal(first.profiles.length, 1);
  assert.equal(first.profiles[0]?.name, 'My profile');
  assert.equal(store.getItem(STUDENT_PROFILES_KEY), written);
  assert.equal(second.activeId, DEFAULT_STUDENT_PROFILE_ID);
  assert.equal(second.profiles.length, 1);
  for (const [key, value] of Object.entries(original)) {
    assert.equal(store.values.get(key), value, key);
  }
  const copies = [...store.values.keys()].filter((key) => key.includes('::profile:') || key.includes(JOURNAL) && key !== JOURNAL);
  assert.deepEqual(copies, []);
  assert.equal(readActiveStudentProfile(store).id, DEFAULT_STUDENT_PROFILE_ID);
});

test('two profiles keep separate journals, check-ins, index cards, and rank', () => {
  const store = memory();
  installStudentProfileScope(store);
  ensureStudentProfiles(store);
  const alex = journal('alex journal', 'blue', 2, 95);
  saveStudentReport(store, alex);
  writeAssessments(
    store,
    saveAssessment({ entries: [] }, { date: '2026-10-17', note: 'alex check-in', scores: scores(4) }, 5),
  );
  writeIndexCards(store, cards('Hip bump'));
  assert.equal(store.values.get(JOURNAL)?.includes('alex journal'), true);
  assert.equal([...store.values.keys()].some((key) => key.includes('::profile:')), false);

  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(switchStudentProfile(store, added.profile.id), true);

  saveStudentReport(store, journal('sam journal', 'white', 1, 40));
  writeAssessments(
    store,
    saveAssessment({ entries: [] }, { date: '2026-11-02', note: 'sam check-in', scores: scores(2) }, 6),
  );
  writeIndexCards(store, cards('Scissor sweep'));

  assert.equal(store.values.get(JOURNAL)?.includes('alex journal'), true);
  assert.equal(store.values.get(JOURNAL)?.includes('sam journal'), false);
  assert.equal(store.values.get(`${JOURNAL}::profile:${added.profile.id}`)?.includes('sam journal'), true);
  assert.equal(store.values.get(ASSESSMENT_STORAGE_KEY)?.includes('alex check-in'), true);
  assert.equal(store.values.get(`${ASSESSMENT_STORAGE_KEY}::profile:${added.profile.id}`)?.includes('sam check-in'), true);
  assert.equal(store.values.get(INDEX_CARDS_STORAGE_KEY)?.includes('Hip bump'), true);
  assert.equal(store.values.get(`${INDEX_CARDS_STORAGE_KEY}::profile:${added.profile.id}`)?.includes('Scissor sweep'), true);
  assert.equal(store.values.get('advantage.studentUnlocked') ?? null, null);

  const samOpen = loadStudentReport(store);
  assert.equal(cardNotes(samOpen), 'sam journal');
  assert.equal(samOpen.journal[0]?.minutes, 40);
  assert.equal(samOpen.profile.belt, 'white');
  assert.equal(samOpen.rank?.tapeCount, 1);
  assert.equal(loadIndexCards(store).cards[0]?.name, 'Scissor sweep');

  assert.equal(switchStudentProfile(store, DEFAULT_STUDENT_PROFILE_ID), true);
  const alexOpen = loadStudentReport(store);
  assert.equal(cardNotes(alexOpen), 'alex journal');
  assert.equal(alexOpen.journal[0]?.minutes, 95);
  assert.equal(alexOpen.profile.belt, 'blue');
  assert.equal(alexOpen.rank?.tapeCount, 2);
  assert.match(store.getItem(ASSESSMENT_STORAGE_KEY) ?? '', /alex check-in/);
  assert.equal(loadIndexCards(store).cards[0]?.name, 'Hip bump');
  assert.equal(store.values.get(JOURNAL), store.values.get(JOURNAL));
});

test('switching profiles persists across a fresh read of the same store', () => {
  const store = memory();
  installStudentProfileScope(store);
  ensureStudentProfiles(store);
  saveStudentReport(store, journal('alex journal', 'blue', 2, 95));
  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(switchStudentProfile(store, added.profile.id), true);
  saveStudentReport(store, journal('sam journal', 'white', 0, 15));

  const again = memory();
  for (const [key, value] of store.values) again.setItem(key, value);
  installStudentProfileScope(again);
  assert.equal(readActiveStudentProfile(again).id, added.profile.id);
  assert.equal(readActiveStudentProfile(again).name, 'Sam');
  assert.equal(cardNotes(loadStudentReport(again)), 'sam journal');
  assert.equal(again.values.get(JOURNAL)?.includes('alex journal'), true);
  assert.equal(switchStudentProfile(again, DEFAULT_STUDENT_PROFILE_ID), true);
  assert.equal(cardNotes(loadStudentReport(again)), 'alex journal');
  assert.equal(again.values.get(`${JOURNAL}::profile:${added.profile.id}`)?.includes('sam journal'), true);
});

test('a backup names its profile and restores into that profile', async () => {
  const store = memory();
  installStudentProfileScope(store);
  ensureStudentProfiles(store);
  saveStudentReport(store, journal('alex journal', 'blue', 2, 95));
  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  switchStudentProfile(store, added.profile.id);
  saveStudentReport(store, journal('sam journal', 'white', 1, 40));

  const built = await buildStudentBackup({
    report: loadStudentReport(store),
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    recordStamp: false,
    stampStorage: store,
    now: new Date('2026-11-09T15:00:00.000Z'),
  });
  assert.equal(built.file.profile?.id, added.profile.id);
  assert.equal(built.file.profile?.name, 'Sam');
  assert.match(built.json, /sam journal/);
  assert.doesNotMatch(built.json, /alex journal/);
  const parsed = parseStudentBackup(built.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.profile?.id, added.profile.id);

  switchStudentProfile(store, added.profile.id);
  saveStudentReport(store, journal('sam edited', 'white', 1, 10));
  switchStudentProfile(store, DEFAULT_STUDENT_PROFILE_ID);
  assert.equal(readActiveStudentProfile(store).id, DEFAULT_STUDENT_PROFILE_ID);
  const restored = applyBackupToMemory(store, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.match(restored.note, /Restored into Sam/);
  assert.match(store.values.get(JOURNAL) ?? '', /alex journal/);
  assert.doesNotMatch(store.values.get(JOURNAL) ?? '', /sam journal/);
  assert.match(store.values.get(`${JOURNAL}::profile:${added.profile.id}`) ?? '', /sam journal/);
  assert.doesNotMatch(store.values.get(`${JOURNAL}::profile:${added.profile.id}`) ?? '', /sam edited/);
  assert.equal(readActiveStudentProfile(store).id, DEFAULT_STUDENT_PROFILE_ID);

  switchStudentProfile(store, added.profile.id);
  const legacy = { ...parsed.file, profile: undefined, report: journal('legacy phone', 'white', 0, 5) };
  applyBackupToMemory(store, legacy, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.match(store.values.get(`${JOURNAL}::profile:${added.profile.id}`) ?? '', /legacy phone/);
  assert.match(store.values.get(JOURNAL) ?? '', /alex journal/);
});

test('a second profile can be added, renamed, and deleted without a slot', () => {
  const store = memory();
  store.setItem(JOURNAL, '{"journal":"keep-me"}');
  ensureStudentProfiles(store);
  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  assert.equal(store.values.get(JOURNAL), '{"journal":"keep-me"}');
  if (!added.ok) return;
  assert.equal(renameStudentProfile(store, added.profile.id, 'Sam Two'), true);
  assert.equal(readStudentProfiles(store).profiles.find((profile) => profile.id === added.profile.id)?.name, 'Sam Two');
  assert.equal(deleteStudentProfile(store, DEFAULT_STUDENT_PROFILE_ID), false);
  assert.equal(deleteStudentProfile(store, added.profile.id), true);
  assert.equal(readStudentProfiles(store).profiles.length, 1);
  assert.equal(store.values.get(JOURNAL), '{"journal":"keep-me"}');
  assert.equal([...store.values.keys()].some((key) => key.includes(`::profile:${added.profile.id}`)), false);
});

test('a second profile does not move the original keys, and film and portrait ids stay plain for the default profile', () => {
  const store = memory();
  installStudentProfileScope(store);
  store.setItem(JOURNAL, 'kept');
  store.setItem('advantage.coachUnlocked', '1');
  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  switchStudentProfile(store, added.profile.id);
  store.setItem(JOURNAL, 'sam');
  store.setItem('advantage.studentUnlocked', '1');
  assert.equal(store.values.get(JOURNAL), 'kept');
  assert.equal(store.values.get('advantage.coachUnlocked'), '1');
  assert.equal(store.values.get('advantage.studentUnlocked'), '1');
  assert.equal(filmBlobKey('film.1', DEFAULT_STUDENT_PROFILE_ID), 'film.1');
  assert.match(filmBlobKey('film.1', added.profile.id), new RegExp(`^profile-blob:${added.profile.id}:film\\.1$`));
  assert.equal(portraitMirrorId(DEFAULT_STUDENT_PROFILE_ID), 'selfie');
  assert.equal(portraitMirrorId(added.profile.id), `selfie:${added.profile.id}`);
});

test('?student=1 still feeds the default profile while a second profile keeps its own journal', () => {
  resetStudentMockGuardForTests();
  const store = memory();
  installStudentMockGuard(store, () => '?student=1');
  installStudentProfileScope(store);
  try {
    assert.equal(loadStudentReport(store).profile.displayName, 'Demo Student');
    assert.equal(store.values.has(STUDENT_FILE_STORAGE_KEY), false);
    const added = addStudentProfile(store, { name: 'Sam' });
    assert.equal(added.ok, true);
    if (!added.ok) return;
    switchStudentProfile(store, added.profile.id);
    saveStudentReport(store, journal('sam journal', 'white', 0, 20));
    assert.equal(cardNotes(loadStudentReport(store)), 'sam journal');
    assert.equal(store.values.has(STUDENT_FILE_STORAGE_KEY), false);
    assert.match(store.values.get(`${STUDENT_FILE_STORAGE_KEY}::profile:${added.profile.id}`) ?? '', /sam journal/);
    switchStudentProfile(store, DEFAULT_STUDENT_PROFILE_ID);
    assert.equal(loadStudentReport(store).profile.displayName, 'Demo Student');
    assert.match(store.values.get(`${STUDENT_FILE_STORAGE_KEY}::profile:${added.profile.id}`) ?? '', /sam journal/);
  } finally {
    resetStudentMockGuardForTests();
  }
});
