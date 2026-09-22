import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_NAME_MAX,
  INTRO_MAX,
  LEGACY_TRAINING_NOTES_STORAGE_KEY,
  MAX_TECHNIQUES,
  MIN_TECHNIQUES,
  TRAINING_NOTES_STORAGE_KEY,
  addTechnique,
  emptyPlan,
  loadTrainingNotes,
  removeTechnique,
  saveTrainingNotes,
} from './trainingNotesStore.ts';

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

test('a new plan starts with three techniques and water breaks off', () => {
  storage.clear();
  const plan = loadTrainingNotes();
  assert.equal(plan.version, 1);
  assert.equal(plan.coachName, '');
  assert.equal(plan.intro, '');
  assert.equal(plan.warmupNote, '');
  assert.equal(plan.cooldownNote, '');
  assert.equal(plan.closing, '');
  assert.equal(plan.techniques.length, MIN_TECHNIQUES);
  assert.ok(plan.techniques.every((tech) => tech.waterBreak === false));
  assert.ok(plan.techniques.every((tech) => tech.title === '' && tech.notes === ''));
  assert.ok(plan.techniques.every((tech) => tech.slotId.length > 0 && tech.id !== tech.slotId));
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), null);
});

test('class plan round-trips on this device', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'Coach Bell';
  plan.intro = 'No-gi. Drop entries.';
  plan.warmupNote = 'Sprawls, hard cardio, add push-ups';
  plan.techniques[0].title = 'Drop seoi nage';
  plan.techniques[0].notes = 'Stance, sleeve and lapel, turn, throw.';
  plan.techniques[1].waterBreak = true;
  plan.cooldownNote = 'Hips and neck.';
  plan.closing = 'Promotion party Saturday.';
  const saved = saveTrainingNotes(plan);
  assert.equal(saved.techniques[0].slotId, plan.techniques[0].slotId);
  const loaded = loadTrainingNotes();
  assert.equal(loaded.coachName, 'Coach Bell');
  assert.equal(loaded.intro, 'No-gi. Drop entries.');
  assert.equal(loaded.warmupNote, 'Sprawls, hard cardio, add push-ups');
  assert.equal(loaded.techniques[0].title, 'Drop seoi nage');
  assert.equal(loaded.techniques[0].notes, 'Stance, sleeve and lapel, turn, throw.');
  assert.equal(loaded.techniques[0].id, plan.techniques[0].id);
  assert.equal(loaded.techniques[0].slotId, plan.techniques[0].slotId);
  assert.equal(loaded.techniques[1].waterBreak, true);
  assert.equal(loaded.techniques[0].waterBreak, false);
  assert.equal(loaded.techniques[2].waterBreak, false);
  assert.equal(loaded.cooldownNote, 'Hips and neck.');
  assert.equal(loaded.closing, 'Promotion party Saturday.');
  assert.equal(JSON.parse(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '').coachName, 'Coach Bell');
});

test('legacy free-text notes move into Intro and the old key is removed', () => {
  storage.clear();
  localStorage.setItem(LEGACY_TRAINING_NOTES_STORAGE_KEY, 'Closed guard drill, 5:00 each side.');
  const plan = loadTrainingNotes();
  assert.equal(plan.intro, 'Closed guard drill, 5:00 each side.');
  assert.equal(plan.techniques.length, MIN_TECHNIQUES);
  assert.equal(localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY), null);
  const again = loadTrainingNotes();
  assert.equal(again.intro, plan.intro);
  assert.deepEqual(
    again.techniques.map((tech) => tech.id),
    plan.techniques.map((tech) => tech.id),
  );
  assert.deepEqual(
    again.techniques.map((tech) => tech.slotId),
    plan.techniques.map((tech) => tech.slotId),
  );
});

test('a saved plan wins over leftover legacy text', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.intro = 'Keep the new plan.';
  saveTrainingNotes(plan);
  localStorage.setItem(LEGACY_TRAINING_NOTES_STORAGE_KEY, 'Old jot');
  assert.equal(loadTrainingNotes().intro, 'Keep the new plan.');
  assert.equal(localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY), 'Old jot');
});

test('fields clamp and short technique lists pad back to three', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'n'.repeat(COACH_NAME_MAX + 12);
  plan.intro = 'i'.repeat(INTRO_MAX + 20);
  plan.techniques = [plan.techniques[0]];
  const saved = saveTrainingNotes(plan);
  assert.equal(saved.coachName.length, COACH_NAME_MAX);
  assert.equal(saved.intro.length, INTRO_MAX);
  assert.equal(saved.techniques.length, MIN_TECHNIQUES);
  assert.equal(saved.techniques[0].id, plan.techniques[0].id);
  assert.equal(loadTrainingNotes().techniques.length, MIN_TECHNIQUES);
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
  const migrated = loadTrainingNotes();
  assert.equal(migrated.intro, 'Keep this');
  assert.equal(localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY), null);

  storage.clear();
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, '{');
  const fresh = loadTrainingNotes();
  assert.equal(fresh.intro, '');
  assert.equal(fresh.techniques.length, MIN_TECHNIQUES);
});
