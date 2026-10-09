import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CLASS_DESIGNATION_MAX,
  CLASS_TIME_MAX,
  LESSON_TITLE_MAX,
  COACH_NAME_MAX,
  EXPECTED_MAX,
  INTRO_MAX,
  LEGACY_TRAINING_NOTES_STORAGE_KEY,
  MAX_TECHNIQUES,
  MIN_TECHNIQUES,
  PLAN_RETENTION_DAYS,
  SPECIFIC_NOTE_MAX,
  TRAINING_NOTES_STORAGE_KEY,
  UNLABELED_CLASS_LABEL,
  addTechnique,
  classBrowseFolders,
  classPlanRowLabel,
  copyPlan,
  emptyPlan,
  isWithinRetention,
  loadTrainingArchive,
  loadTrainingNotes,
  planDayTitle,
  planHasContent,
  planListLabel,
  plansOnDay,
  recentDateKeys,
  removeDayPlan,
  removeTechnique,
  saveDay,
  saveTrainingNotes,
  shiftDateKey,
} from './trainingNotesStore.ts';

const TODAY = '2026-09-22';

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
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

function storedDays(): Record<string, { plans?: { intro?: string; coachName?: string; classDesignation?: string }[] }> {
  return JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '{"days":{}}').days;
}

test('a fresh day is a blank plan and does not write storage', () => {
  storage.clear();
  const plan = loadTrainingNotes(TODAY);
  assert.equal(plan.version, 1);
  assert.equal(plan.coachName, '');
  assert.equal(plan.classDesignation, '');
  assert.equal(plan.lessonTitle, '');
  assert.equal(plan.classTime, '');
  assert.ok(plan.id);
  assert.equal(plan.intro, '');
  assert.equal(plan.introExpected, '');
  assert.equal(plan.warmupNote, '');
  assert.equal(plan.warmupExpected, '');
  assert.equal(plan.specificNote, '');
  assert.equal(plan.specificExpected, '');
  assert.equal(plan.cooldownNote, '');
  assert.equal(plan.cooldownExpected, '');
  assert.equal(plan.closing, '');
  assert.equal(plan.techniques.length, MIN_TECHNIQUES);
  assert.equal(planHasContent(plan), false);
  assert.ok(plan.techniques.every((tech) => tech.waterBreak === false));
  assert.ok(plan.techniques.every((tech) => tech.title === '' && tech.notes === '' && tech.expected === ''));
  assert.ok(plan.techniques.every((tech) => tech.slotId.length > 0 && tech.id !== tech.slotId));
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), null);
});

test('today saves under the local date and leaves other days alone', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'Coach Bell';
  plan.intro = 'No-gi.';
  plan.techniques[1].waterBreak = true;
  const saved = saveTrainingNotes(plan, TODAY);
  assert.equal(saved.techniques[1].waterBreak, true);
  assert.equal(saved.techniques[0].slotId, plan.techniques[0].slotId);
  const yesterday = shiftDateKey(TODAY, -1);
  const older = emptyPlan();
  older.intro = 'Yesterday drill.';
  saveDay(yesterday, older, TODAY);
  const archive = loadTrainingArchive(TODAY);
  assert.equal(archive.version, 3);
  assert.equal(plansOnDay(archive, TODAY)[0]?.coachName, 'Coach Bell');
  assert.equal(plansOnDay(archive, TODAY)[0]?.intro, 'No-gi.');
  assert.equal(plansOnDay(archive, yesterday)[0]?.intro, 'Yesterday drill.');
  assert.equal(loadTrainingNotes(TODAY).coachName, 'Coach Bell');
  const raw = JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '');
  assert.equal(raw.version, 3);
  assert.equal(raw.days[TODAY].plans[0].coachName, 'Coach Bell');
});

test('a single-plan v1 card migrates onto today', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.intro = 'Keep the class.';
  plan.techniques[0].title = 'Armbar';
  localStorage.setItem(
    TRAINING_NOTES_STORAGE_KEY,
    JSON.stringify({ ...plan, version: 1 }),
  );
  const loaded = loadTrainingArchive(TODAY);
  assert.equal(loaded.version, 3);
  assert.equal(plansOnDay(loaded, TODAY)[0]?.intro, 'Keep the class.');
  assert.equal(plansOnDay(loaded, TODAY)[0]?.techniques[0].title, 'Armbar');
  assert.equal(plansOnDay(loaded, TODAY)[0]?.techniques[0].slotId, plan.techniques[0].slotId);
  assert.equal(plansOnDay(loaded, TODAY)[0]?.classDesignation, '');
  assert.equal(plansOnDay(loaded, TODAY)[0]?.lessonTitle, '');
  assert.equal(plansOnDay(loaded, TODAY)[0]?.classTime, '');
  assert.ok(plansOnDay(loaded, TODAY)[0]?.id);
  assert.equal(JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '').version, 3);
});

test('legacy free-text notes move into today and the old key is removed', () => {
  storage.clear();
  localStorage.setItem(LEGACY_TRAINING_NOTES_STORAGE_KEY, 'Closed guard drill, 5:00 each side.');
  const plan = loadTrainingNotes(TODAY);
  assert.equal(plan.intro, 'Closed guard drill, 5:00 each side.');
  assert.equal(plan.techniques.length, MIN_TECHNIQUES);
  assert.equal(localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY), null);
  const again = loadTrainingNotes(TODAY);
  assert.equal(again.intro, plan.intro);
  assert.deepEqual(
    again.techniques.map((tech) => tech.id),
    plan.techniques.map((tech) => tech.id),
  );
});

test('a saved plan wins over leftover legacy text', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.intro = 'Keep the new plan.';
  saveTrainingNotes(plan, TODAY);
  localStorage.setItem(LEGACY_TRAINING_NOTES_STORAGE_KEY, 'Old jot');
  assert.equal(loadTrainingNotes(TODAY).intro, 'Keep the new plan.');
  assert.equal(localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY), 'Old jot');
});

test('days older than the retention window drop and a new day starts blank', () => {
  storage.clear();
  const keep = shiftDateKey(TODAY, -(PLAN_RETENTION_DAYS - 1));
  const drop = shiftDateKey(TODAY, -PLAN_RETENTION_DAYS);
  const future = shiftDateKey(TODAY, 1);
  assert.equal(isWithinRetention(keep, TODAY), true);
  assert.equal(isWithinRetention(drop, TODAY), false);
  assert.equal(isWithinRetention(future, TODAY), false);
  const days: Record<string, ReturnType<typeof emptyPlan>> = {};
  for (const key of [keep, drop, future, TODAY]) {
    const plan = emptyPlan();
    plan.intro = key;
    days[key] = plan;
  }
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, JSON.stringify({ version: 2, days }));
  const archive = loadTrainingArchive(TODAY);
  assert.deepEqual(recentDateKeys(archive, TODAY), [TODAY, keep]);
  assert.equal(archive.days[drop], undefined);
  assert.equal(archive.days[future], undefined);
  const nextDay = shiftDateKey(TODAY, 1);
  assert.equal(planHasContent(loadTrainingNotes(nextDay)), false);
  assert.equal(storedDays()[TODAY].plans?.[0]?.intro, TODAY);
});

test('clearing today removes that day and keeps yesterday', () => {
  storage.clear();
  const yesterday = shiftDateKey(TODAY, -1);
  const prior = emptyPlan();
  prior.intro = 'Keep yesterday.';
  saveDay(yesterday, prior, TODAY);
  const today = emptyPlan();
  today.coachName = 'Coach Bell';
  const savedToday = saveTrainingNotes(today, TODAY);
  const cleared = emptyPlan();
  cleared.id = savedToday.id;
  saveTrainingNotes(cleared, TODAY);
  const archive = loadTrainingArchive(TODAY);
  assert.equal(archive.days[TODAY], undefined);
  assert.equal(plansOnDay(archive, yesterday)[0]?.intro, 'Keep yesterday.');
  assert.equal(planDayTitle(yesterday, TODAY), 'Yesterday');
  assert.equal(planDayTitle(TODAY, TODAY), 'Today');
});

test('copy keeps the words and mints new technique slot ids', () => {
  storage.clear();
  const source = emptyPlan();
  source.coachName = 'Coach Bell';
  source.classDesignation = 'GB1';
  source.classTime = '5:00 PM';
  source.intro = 'No-gi.';
  source.introExpected = '5 min';
  source.warmupExpected = '10 minutes';
  source.specificNote = 'Rounds start from mount escapes.';
  source.specificExpected = '15 min';
  source.cooldownExpected = '3 min';
  source.techniques[0].title = 'Armbar';
  source.techniques[0].notes = 'Elbow tight.';
  source.techniques[0].expected = '8 min';
  source.techniques[0].treeId = 'tree-armbar';
  source.techniques[2].waterBreak = true;
  const extra = addTechnique(source);
  extra.techniques[3].title = 'Sweep';
  saveDay(shiftDateKey(TODAY, -1), extra, TODAY);
  const copied = copyPlan(extra);
  assert.notEqual(copied.id, extra.id);
  assert.equal(copied.coachName, 'Coach Bell');
  assert.equal(copied.classDesignation, 'GB1');
  assert.equal(copied.classTime, '5:00 PM');
  assert.equal(copied.intro, 'No-gi.');
  assert.equal(copied.introExpected, '5 min');
  assert.equal(copied.specificNote, 'Rounds start from mount escapes.');
  assert.equal(copied.specificExpected, '15 min');
  assert.equal(copied.warmupExpected, '10 minutes');
  assert.equal(copied.cooldownExpected, '3 min');
  assert.equal(copied.techniques.length, 4);
  assert.equal(copied.techniques[0].title, 'Armbar');
  assert.equal(copied.techniques[0].notes, 'Elbow tight.');
  assert.equal(copied.techniques[0].expected, '8 min');
  assert.equal(copied.techniques[0].treeId, 'tree-armbar');
  assert.equal(copied.techniques[2].waterBreak, true);
  assert.equal(copied.techniques[3].title, 'Sweep');
  assert.notEqual(copied.techniques[0].id, extra.techniques[0].id);
  assert.notEqual(copied.techniques[0].slotId, extra.techniques[0].slotId);
  const saved = saveDay(TODAY, copied, TODAY);
  assert.equal(
    plansOnDay(saved.archive, shiftDateKey(TODAY, -1))[0]?.techniques[0].slotId,
    extra.techniques[0].slotId,
  );
  assert.equal(plansOnDay(saved.archive, TODAY)[0]?.techniques[0].title, 'Armbar');
  assert.equal(plansOnDay(saved.archive, TODAY)[0]?.classDesignation, 'GB1');
  assert.notEqual(
    plansOnDay(saved.archive, TODAY)[0]?.techniques[0].slotId,
    plansOnDay(saved.archive, shiftDateKey(TODAY, -1))[0]?.techniques[0].slotId,
  );
});

test('fields clamp and short technique lists pad back to three', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'n'.repeat(COACH_NAME_MAX + 12);
  plan.intro = 'i'.repeat(INTRO_MAX + 20);
  plan.techniques = [plan.techniques[0]];
  const saved = saveTrainingNotes(plan, TODAY);
  assert.equal(saved.coachName.length, COACH_NAME_MAX);
  assert.equal(saved.intro.length, INTRO_MAX);
  assert.equal(saved.techniques.length, MIN_TECHNIQUES);
  assert.equal(saved.techniques[0].id, plan.techniques[0].id);
  assert.equal(loadTrainingNotes(TODAY).techniques.length, MIN_TECHNIQUES);
});

test('add appends a block and remove only drops blocks after the first three', () => {
  storage.clear();
  let plan = emptyPlan();
  const firstId = plan.techniques[0].id;
  plan = addTechnique(plan);
  assert.equal(plan.techniques.length, 4);
  assert.equal(plan.techniques[3].waterBreak, false);
  assert.ok(plan.techniques[3].slotId);
  plan = removeTechnique(plan, firstId);
  assert.equal(plan.techniques.length, 4);
  assert.equal(plan.techniques[0].id, firstId);
  const extraId = plan.techniques[3].id;
  plan = removeTechnique(plan, extraId);
  assert.equal(plan.techniques.length, MIN_TECHNIQUES);
  assert.equal(plan.techniques.some((tech) => tech.id === extraId), false);

  let capped = emptyPlan();
  for (let i = 0; i < MAX_TECHNIQUES + 5; i += 1) capped = addTechnique(capped);
  assert.equal(capped.techniques.length, MAX_TECHNIQUES);
});

test('broken JSON falls back to a legacy jot, then to an empty plan', () => {
  storage.clear();
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, '{');
  localStorage.setItem(LEGACY_TRAINING_NOTES_STORAGE_KEY, 'Keep this');
  const migrated = loadTrainingNotes(TODAY);
  assert.equal(migrated.intro, 'Keep this');
  assert.equal(localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY), null);

  storage.clear();
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, '{');
  const fresh = loadTrainingNotes(TODAY);
  assert.equal(fresh.intro, '');
  assert.equal(fresh.techniques.length, MIN_TECHNIQUES);
  assert.equal(planHasContent(fresh), false);
});

test('an explicit tree link is saved on the drill and junk ids are dropped', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.techniques[1].title = 'Armbar';
  plan.techniques[1].treeId = ' tree-keep ';
  const saved = saveTrainingNotes(plan, TODAY);
  assert.equal(saved.techniques[1].treeId, 'tree-keep');
  assert.equal(loadTrainingNotes(TODAY).techniques[1].treeId, 'tree-keep');

  const onlyLink = emptyPlan();
  onlyLink.techniques[0].treeId = 'tree-only';
  assert.equal(planHasContent(onlyLink), true);
  assert.equal(saveTrainingNotes(onlyLink, TODAY).techniques[0].treeId, 'tree-only');

  const junk = emptyPlan();
  junk.techniques[0].title = 'Sweep';
  (junk.techniques[0] as { treeId: unknown }).treeId = 12;
  const cleaned = saveTrainingNotes(junk, TODAY);
  assert.equal(cleaned.techniques[0].title, 'Sweep');
  assert.equal(cleaned.techniques[0].treeId, undefined);
});

test('lesson plan fields ship with no placeholder hints except class designation and time', () => {
  const source = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const placeholders = [...source.matchAll(/placeholder="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(placeholders, ['GB1', '5:00 PM']);
  assert.doesNotMatch(source, /Drop seoi|Whose class|Sprawls|seminar date/i);
  assert.match(source, /Specific Training \/ Rounds/);
  assert.equal(source.includes("role: 'specific'"), false);
});

test('specific training and expected times save, copy, and stay blank when missing', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.introExpected = '5 min';
  plan.warmupExpected = '10 minutes';
  plan.specificNote = 'Rounds start from mount escapes.';
  plan.specificExpected = '15 min';
  plan.cooldownExpected = '3 min';
  plan.techniques[0].expected = '8 min';
  const saved = saveTrainingNotes(plan, TODAY);
  assert.equal(saved.introExpected, '5 min');
  assert.equal(saved.warmupExpected, '10 minutes');
  assert.equal(saved.specificNote, 'Rounds start from mount escapes.');
  assert.equal(saved.specificExpected, '15 min');
  assert.equal(saved.cooldownExpected, '3 min');
  assert.equal(saved.techniques[0].expected, '8 min');
  const loaded = loadTrainingNotes(TODAY);
  assert.equal(loaded.specificNote, plan.specificNote);
  assert.equal(loaded.techniques[0].expected, '8 min');

  const onlyRounds = emptyPlan();
  onlyRounds.specificNote = 'Positional sparring.';
  assert.equal(planHasContent(onlyRounds), true);
  const onlyTime = emptyPlan();
  onlyTime.techniques[2].expected = '5 min';
  assert.equal(planHasContent(onlyTime), true);

  const copied = copyPlan(saved);
  assert.equal(copied.specificNote, saved.specificNote);
  assert.equal(copied.specificExpected, '15 min');
  assert.equal(copied.introExpected, '5 min');
  assert.equal(copied.cooldownExpected, '3 min');
  assert.equal(copied.techniques[0].expected, '8 min');

  storage.clear();
  const legacy = emptyPlan();
  legacy.intro = 'Keep the class.';
  legacy.techniques[0].title = 'Armbar';
  const { introExpected, warmupExpected, specificNote, specificExpected, cooldownExpected, ...withoutTimes } =
    legacy;
  void introExpected;
  void warmupExpected;
  void specificNote;
  void specificExpected;
  void cooldownExpected;
  const legacyTechs = withoutTimes.techniques.map(({ expected, ...tech }) => {
    void expected;
    return tech;
  });
  localStorage.setItem(
    TRAINING_NOTES_STORAGE_KEY,
    JSON.stringify({ ...withoutTimes, techniques: legacyTechs, version: 1 }),
  );
  const migrated = loadTrainingArchive(TODAY);
  const migratedPlan = plansOnDay(migrated, TODAY)[0];
  assert.ok(migratedPlan);
  assert.equal(migratedPlan.intro, 'Keep the class.');
  assert.equal(migratedPlan.techniques[0].title, 'Armbar');
  assert.equal(migratedPlan.specificNote, '');
  assert.equal(migratedPlan.introExpected, '');
  assert.equal(migratedPlan.warmupExpected, '');
  assert.equal(migratedPlan.specificExpected, '');
  assert.equal(migratedPlan.cooldownExpected, '');
  assert.equal(migratedPlan.techniques[0].expected, '');
  assert.equal(migratedPlan.classDesignation, '');
  assert.equal(migratedPlan.classTime, '');

  const long = emptyPlan();
  long.specificNote = 'r'.repeat(SPECIFIC_NOTE_MAX + 100);
  long.introExpected = 'e'.repeat(EXPECTED_MAX + 40);
  long.techniques[1].expected = 't'.repeat(EXPECTED_MAX + 40);
  const clamped = saveTrainingNotes(long, shiftDateKey(TODAY, -1));
  assert.equal(clamped.specificNote.length, SPECIFIC_NOTE_MAX);
  assert.equal(clamped.introExpected.length, EXPECTED_MAX);
  assert.equal(clamped.techniques[1].expected.length, EXPECTED_MAX);
});

test('one day keeps several class plans and a v2 day migrates without losing the plan', () => {
  storage.clear();
  const first = emptyPlan();
  first.coachName = 'Justin';
  first.classDesignation = 'GB1';
  first.classTime = '5:00 PM';
  first.intro = 'Guard.';
  const second = emptyPlan();
  second.coachName = 'Justin';
  second.classDesignation = 'GB2';
  second.classTime = '6:00 PM';
  second.intro = 'Mount.';
  saveDay(TODAY, first, TODAY);
  const saved = saveDay(TODAY, second, TODAY);
  assert.equal(plansOnDay(saved.archive, TODAY).length, 2);
  assert.equal(plansOnDay(saved.archive, TODAY)[0]?.intro, 'Guard.');
  assert.equal(plansOnDay(saved.archive, TODAY)[1]?.classDesignation, 'GB2');
  assert.equal(planListLabel(first), 'Justin / GB1 / 5:00 PM');
  assert.equal(planListLabel(emptyPlan()), 'New class plan');
  assert.equal(planHasContent(first), true);

  const onlyLabel = emptyPlan();
  onlyLabel.classDesignation = 'GB1';
  assert.equal(planHasContent(onlyLabel), true);
  const blank = emptyPlan();
  assert.equal(planHasContent(blank), false);

  const removed = removeDayPlan(TODAY, first.id, TODAY);
  assert.equal(plansOnDay(removed, TODAY).length, 1);
  assert.equal(plansOnDay(removed, TODAY)[0]?.classTime, '6:00 PM');

  const yesterday = shiftDateKey(TODAY, -1);
  const prior = emptyPlan();
  prior.coachName = 'Justin';
  prior.classDesignation = 'GB1';
  prior.classTime = '5:00 PM';
  prior.intro = 'Yesterday guard.';
  saveDay(yesterday, prior, TODAY);
  const copied = saveDay(TODAY, copyPlan(prior), TODAY);
  assert.equal(plansOnDay(copied.archive, TODAY).length, 2);
  assert.equal(plansOnDay(copied.archive, TODAY)[0]?.intro, 'Mount.');
  assert.equal(plansOnDay(copied.archive, TODAY)[1]?.intro, 'Yesterday guard.');
  assert.equal(plansOnDay(copied.archive, TODAY)[1]?.classDesignation, 'GB1');
  assert.notEqual(plansOnDay(copied.archive, TODAY)[1]?.id, prior.id);

  storage.clear();
  const legacy = emptyPlan();
  legacy.intro = 'Single plan day.';
  legacy.techniques[0].title = 'Sweep';
  const { id, classDesignation, classTime, ...withoutClass } = legacy;
  void id;
  void classDesignation;
  void classTime;
  localStorage.setItem(
    TRAINING_NOTES_STORAGE_KEY,
    JSON.stringify({ version: 2, days: { [TODAY]: withoutClass } }),
  );
  const migrated = loadTrainingArchive(TODAY);
  assert.equal(migrated.version, 3);
  assert.equal(plansOnDay(migrated, TODAY).length, 1);
  assert.equal(plansOnDay(migrated, TODAY)[0]?.intro, 'Single plan day.');
  assert.equal(plansOnDay(migrated, TODAY)[0]?.techniques[0].title, 'Sweep');
  assert.equal(plansOnDay(migrated, TODAY)[0]?.classDesignation, '');
  assert.equal(plansOnDay(migrated, TODAY)[0]?.classTime, '');
  assert.ok(plansOnDay(migrated, TODAY)[0]?.id);
  const rewritten = JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '');
  assert.equal(rewritten.version, 3);
  assert.equal(Array.isArray(rewritten.days[TODAY].plans), true);

  const wide = emptyPlan();
  wide.classDesignation = 'G'.repeat(CLASS_DESIGNATION_MAX + 8);
  wide.classTime = 'T'.repeat(CLASS_TIME_MAX + 8);
  const clampedClass = saveTrainingNotes(wide, TODAY);
  assert.equal(clampedClass.classDesignation.length, CLASS_DESIGNATION_MAX);
  assert.equal(clampedClass.classTime.length, CLASS_TIME_MAX);
});

test('class folders group designation first, then dates newest first', () => {
  storage.clear();
  const yesterday = shiftDateKey(TODAY, -1);
  const older = shiftDateKey(TODAY, -3);
  const gb1 = emptyPlan();
  gb1.coachName = 'Justin';
  gb1.classDesignation = 'GB1';
  gb1.classTime = '5:00 PM';
  gb1.intro = 'Guard.';
  const gb2Today = emptyPlan();
  gb2Today.coachName = 'Justin';
  gb2Today.classDesignation = 'GB2';
  gb2Today.classTime = '6:00 PM';
  gb2Today.intro = 'Mount.';
  const gb2Older = emptyPlan();
  gb2Older.coachName = 'Alex';
  gb2Older.classDesignation = 'gb2';
  gb2Older.classTime = '5:00 PM';
  gb2Older.intro = 'Older mount.';
  const unlabeled = emptyPlan();
  unlabeled.coachName = 'Justin';
  unlabeled.classTime = '7:00 PM';
  unlabeled.intro = 'Open mat.';
  saveDay(TODAY, gb1, TODAY);
  saveDay(TODAY, gb2Today, TODAY);
  saveDay(older, gb2Older, TODAY);
  saveDay(yesterday, unlabeled, TODAY);

  const folders = classBrowseFolders(loadTrainingArchive(TODAY), TODAY);
  assert.deepEqual(
    folders.map((folder) => folder.label),
    ['GB1', 'GB2', UNLABELED_CLASS_LABEL],
  );
  const gb2 = folders.find((folder) => folder.key === 'gb2');
  assert.ok(gb2);
  assert.equal(gb2.label, 'GB2');
  assert.deepEqual(
    gb2.dates.map((day) => day.dateKey),
    [TODAY, older],
  );
  assert.equal(gb2.dates[0]?.plans.length, 1);
  assert.equal(gb2.dates[0]?.plans[0]?.classTime, '6:00 PM');
  assert.equal(classPlanRowLabel(gb2.dates[0].plans[0]), 'Justin / GB2 / 6:00 PM');
  assert.equal(folders[0]?.dates[0]?.dateKey, TODAY);
  assert.equal(folders[0]?.dates[0]?.plans[0]?.classDesignation, 'GB1');
  const blank = folders.find((folder) => folder.key === '');
  assert.equal(blank?.dates[0]?.dateKey, yesterday);
  assert.equal(classPlanRowLabel(blank?.dates[0]?.plans[0] ?? emptyPlan()), 'Justin · 7:00 PM');

  const source = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  assert.match(source, /classBrowseFolders/);
  assert.match(source, /All classes/);
  assert.match(source, />\s*Classes\s*</);
  assert.match(source, /Lesson title/);
  assert.match(source, /notes-lesson-title/);
  assert.equal(UNLABELED_CLASS_LABEL, 'No class name');
});

test('an optional lesson title is stored, shown, and empty on older plans', () => {
  storage.clear();
  const legacy = emptyPlan();
  legacy.classDesignation = 'GB1';
  legacy.classTime = '5:00 PM';
  legacy.coachName = 'Justin';
  legacy.intro = 'Passing.';
  const { lessonTitle: omitted, ...withoutTitle } = legacy;
  void omitted;
  localStorage.setItem(
    TRAINING_NOTES_STORAGE_KEY,
    JSON.stringify({ version: 3, days: { [TODAY]: { plans: [withoutTitle] } } }),
  );
  const loaded = plansOnDay(loadTrainingArchive(TODAY), TODAY)[0];
  assert.ok(loaded);
  assert.equal(loaded.lessonTitle, '');
  assert.equal(loaded.classDesignation, 'GB1');
  assert.equal(classPlanRowLabel(loaded), 'Justin / GB1 / 5:00 PM');
  assert.equal(planListLabel(loaded), 'Justin / GB1 / 5:00 PM');

  const titled = { ...loaded, lessonTitle: 'Guard passing' };
  const saved = saveTrainingNotes(titled, TODAY);
  assert.equal(saved.lessonTitle, 'Guard passing');
  assert.equal(classPlanRowLabel(saved), 'Justin / GB1 / Guard passing / 5:00 PM');
  assert.equal(planListLabel(saved), 'Justin / Guard passing / GB1 / 5:00 PM');
  assert.equal(planHasContent({ ...emptyPlan(), lessonTitle: 'Only a title' }), true);

  const wide = emptyPlan();
  wide.lessonTitle = 'T'.repeat(LESSON_TITLE_MAX + 12);
  wide.intro = 'Keep.';
  assert.equal(saveTrainingNotes(wide, TODAY).lessonTitle.length, LESSON_TITLE_MAX);
});
