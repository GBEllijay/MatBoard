import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  COACH_NAME_MAX,
  EXPECTED_MAX,
  INTRO_MAX,
  LEGACY_TRAINING_NOTES_STORAGE_KEY,
  MAX_TECHNIQUES,
  MIN_TECHNIQUES,
  PLAN_RETENTION_DAYS,
  SPECIFIC_NOTE_MAX,
  TRAINING_NOTES_STORAGE_KEY,
  addTechnique,
  copyPlan,
  emptyPlan,
  isWithinRetention,
  loadTrainingArchive,
  loadTrainingNotes,
  planDayTitle,
  planHasContent,
  recentDateKeys,
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

function storedDays(): Record<string, { intro?: string; coachName?: string }> {
  return JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '{"days":{}}').days;
}

test('a fresh day is a blank plan and does not write storage', () => {
  storage.clear();
  const plan = loadTrainingNotes(TODAY);
  assert.equal(plan.version, 1);
  assert.equal(plan.coachName, '');
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
  assert.equal(archive.version, 2);
  assert.equal(archive.days[TODAY].coachName, 'Coach Bell');
  assert.equal(archive.days[TODAY].intro, 'No-gi.');
  assert.equal(archive.days[yesterday].intro, 'Yesterday drill.');
  assert.equal(loadTrainingNotes(TODAY).coachName, 'Coach Bell');
  const raw = JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '');
  assert.equal(raw.version, 2);
  assert.equal(raw.days[TODAY].coachName, 'Coach Bell');
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
  assert.equal(loaded.version, 2);
  assert.equal(loaded.days[TODAY].intro, 'Keep the class.');
  assert.equal(loaded.days[TODAY].techniques[0].title, 'Armbar');
  assert.equal(loaded.days[TODAY].techniques[0].slotId, plan.techniques[0].slotId);
  assert.equal(JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '').version, 2);
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
  assert.equal(storedDays()[TODAY].intro, TODAY);
});

test('clearing today removes that day and keeps yesterday', () => {
  storage.clear();
  const yesterday = shiftDateKey(TODAY, -1);
  const prior = emptyPlan();
  prior.intro = 'Keep yesterday.';
  saveDay(yesterday, prior, TODAY);
  const today = emptyPlan();
  today.coachName = 'Coach Bell';
  saveTrainingNotes(today, TODAY);
  saveTrainingNotes(emptyPlan(), TODAY);
  const archive = loadTrainingArchive(TODAY);
  assert.equal(archive.days[TODAY], undefined);
  assert.equal(archive.days[yesterday].intro, 'Keep yesterday.');
  assert.equal(planDayTitle(yesterday, TODAY), 'Yesterday');
  assert.equal(planDayTitle(TODAY, TODAY), 'Today');
});

test('copy keeps the words and mints new technique slot ids', () => {
  storage.clear();
  const source = emptyPlan();
  source.coachName = 'Coach Bell';
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
  assert.equal(copied.coachName, 'Coach Bell');
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
  assert.equal(saved.archive.days[shiftDateKey(TODAY, -1)].techniques[0].slotId, extra.techniques[0].slotId);
  assert.equal(saved.archive.days[TODAY].techniques[0].title, 'Armbar');
  assert.notEqual(
    saved.archive.days[TODAY].techniques[0].slotId,
    saved.archive.days[shiftDateKey(TODAY, -1)].techniques[0].slotId,
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

test('lesson plan fields ship with no placeholder hints', () => {
  const source = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('placeholder='), false);
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
  assert.equal(migrated.days[TODAY].intro, 'Keep the class.');
  assert.equal(migrated.days[TODAY].techniques[0].title, 'Armbar');
  assert.equal(migrated.days[TODAY].specificNote, '');
  assert.equal(migrated.days[TODAY].introExpected, '');
  assert.equal(migrated.days[TODAY].warmupExpected, '');
  assert.equal(migrated.days[TODAY].specificExpected, '');
  assert.equal(migrated.days[TODAY].cooldownExpected, '');
  assert.equal(migrated.days[TODAY].techniques[0].expected, '');

  const long = emptyPlan();
  long.specificNote = 'r'.repeat(SPECIFIC_NOTE_MAX + 100);
  long.introExpected = 'e'.repeat(EXPECTED_MAX + 40);
  long.techniques[1].expected = 't'.repeat(EXPECTED_MAX + 40);
  const clamped = saveTrainingNotes(long, shiftDateKey(TODAY, -1));
  assert.equal(clamped.specificNote.length, SPECIFIC_NOTE_MAX);
  assert.equal(clamped.introExpected.length, EXPECTED_MAX);
  assert.equal(clamped.techniques[1].expected.length, EXPECTED_MAX);
});
