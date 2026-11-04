import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_EXPECTED_MINUTES,
  EXPECTED_DETENT_MINUTES,
  EXPECTED_MAX_MINUTES,
  EXPECTED_MIN_MINUTES,
  EXPECTED_MINUTE_OPTIONS,
  EXPECTED_SNAP_MINUTES,
  expectedMinutes,
  lessonExpectedText,
  loopSecondsForSlot,
  migrateExpectedDuration,
  parseExpectedMinutes,
} from './expectedDuration.ts';
import { settleRowIndex, WHEEL_FLICK_PX_PER_MS, WHEEL_ITEM_PX } from './timeWheel.ts';
import { emptyCurriculum, expectedToWorkMs, normalizeExpectedDuration, saveCurriculum } from './competitionCurriculum.ts';
import { curriculumVideoCards } from './curriculumVideos.ts';
import { emptyVideoPlan, sanitizeVideoPlan, setSlotDrill } from './techniqueLogic.ts';
import { createGame } from './lessonTemplates.ts';
import {
  createTechnique,
  emptyPlan,
  loadTrainingArchive,
  plansOnDay,
  saveTrainingNotes,
  TRAINING_NOTES_STORAGE_KEY,
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

const TODAY = '2026-11-04';

test('expected duration is whole minutes from 1 to 60, default 5', () => {
  assert.equal(EXPECTED_MIN_MINUTES, 1);
  assert.equal(EXPECTED_MAX_MINUTES, 60);
  assert.equal(DEFAULT_EXPECTED_MINUTES, 5);
  assert.equal(EXPECTED_MINUTE_OPTIONS.length, 60);
  assert.equal(EXPECTED_MINUTE_OPTIONS[0]?.label, '1 min');
  assert.equal(EXPECTED_MINUTE_OPTIONS[4]?.value, 5);
  assert.equal(EXPECTED_MINUTE_OPTIONS.at(-1)?.label, '60 min');
  assert.equal(EXPECTED_MINUTE_OPTIONS.some((option) => option.label.includes(':')), false);
  assert.equal(expectedMinutes(''), 5);
  assert.equal(expectedMinutes(createTechnique().expected), 5);
  assert.equal(expectedMinutes(emptyPlan().warmupExpected), 5);
  assert.equal(expectedToWorkMs(''), 5 * 60_000);
  const fresh = emptyCurriculum();
  assert.equal(fresh.blocks[0]?.expected, '');
  assert.equal(expectedMinutes(fresh.blocks[0]?.expected ?? ''), 5);
});

test('old m:ss and minute phrases migrate to whole minutes', () => {
  assert.equal(migrateExpectedDuration('8:00'), '8');
  assert.equal(migrateExpectedDuration('08:00'), '8');
  assert.equal(migrateExpectedDuration('1:30'), '2');
  assert.equal(migrateExpectedDuration('0:04'), '1');
  assert.equal(migrateExpectedDuration('0:30'), '1');
  assert.equal(migrateExpectedDuration('8:29'), '8');
  assert.equal(migrateExpectedDuration('5'), '5');
  assert.equal(migrateExpectedDuration('5 min'), '5');
  assert.equal(migrateExpectedDuration('10 minutes'), '10');
  assert.equal(migrateExpectedDuration('3 mins'), '3');
  assert.equal(migrateExpectedDuration('8.5'), '9');
  assert.equal(migrateExpectedDuration('0'), '1');
  assert.equal(migrateExpectedDuration('200'), '60');
  assert.equal(migrateExpectedDuration('90:00'), '60');
  assert.equal(migrateExpectedDuration(''), '');
  assert.equal(migrateExpectedDuration('  '), '');
  assert.equal(migrateExpectedDuration('soon'), 'soon');
  assert.equal(parseExpectedMinutes('soon'), null);
  assert.equal(parseExpectedMinutes('8:60'), null);
  assert.equal(expectedMinutes('8:00'), 8);
  assert.equal(expectedMinutes('soon'), 5);
  assert.equal(normalizeExpectedDuration('1:30'), '2');
});

test('a saved lesson plan migrates 8:00 without dropping the block', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'Bell';
  plan.introExpected = '8:00';
  plan.warmupExpected = '1:30';
  plan.specificExpected = '15 min';
  plan.cooldownExpected = '0:04';
  plan.techniques[0].expected = '10 minutes';
  plan.techniques[1].expected = 'soon';
  const game = createGame();
  game.title = 'Sharks and minnows';
  game.expected = '8:00';
  plan.games = [game];
  const saved = saveTrainingNotes(plan, TODAY);
  assert.equal(saved.introExpected, '8');
  assert.equal(saved.warmupExpected, '2');
  assert.equal(saved.specificExpected, '15');
  assert.equal(saved.cooldownExpected, '1');
  assert.equal(saved.techniques[0].expected, '10');
  assert.equal(saved.techniques[1].expected, 'soon');
  assert.equal(saved.games?.[0]?.expected, '8');
  assert.equal(saved.games?.[0]?.title, 'Sharks and minnows');
  assert.equal(saved.techniques[1].title, '');
  const loaded = plansOnDay(loadTrainingArchive(TODAY), TODAY)[0];
  assert.equal(loaded?.introExpected, '8');
  assert.equal(loaded?.techniques[0].expected, '10');
  assert.equal(loaded?.techniques[1].expected, 'soon');
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY)?.includes('8:00'), false);
});

test('the lesson duration is the video loop unless a manual length wins', () => {
  const technique = { kind: 'technique' as const, drillSec: 300 };
  assert.equal(loopSecondsForSlot(technique, '8'), 8 * 60);
  assert.equal(loopSecondsForSlot(technique, '8:00'), 8 * 60);
  assert.equal(loopSecondsForSlot(technique, ''), 5 * 60);
  assert.equal(loopSecondsForSlot(technique, null), 300);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 150 }, '12'), 150);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 420 }, '8'), 420);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 300, drillManual: true }, '8'), 300);
  assert.equal(loopSecondsForSlot({ kind: 'warmup', drillSec: 300 }, null), 0);
  assert.equal(loopSecondsForSlot({ kind: 'warmup', drillSec: 300 }, '8:00'), 8 * 60);
  assert.equal(loopSecondsForSlot({ kind: 'cooldown', drillSec: 300 }, ''), 5 * 60);

  const plan = emptyVideoPlan();
  const slotId = plan.slots.find((slot) => slot.kind === 'technique')?.slotId ?? '';
  const chosen = setSlotDrill(plan, slotId, 300);
  const kept = sanitizeVideoPlan(chosen, []).plan;
  const marked = kept.slots.find((slot) => slot.slotId === slotId);
  assert.equal(marked?.drillManual, true);
  assert.equal(marked ? loopSecondsForSlot(marked, '8') : 0, 300);
  const custom = setSlotDrill(plan, slotId, 150);
  const customSlot = custom.slots.find((slot) => slot.slotId === slotId);
  assert.equal(customSlot ? loopSecondsForSlot(customSlot, '8') : 0, 150);

  const lesson = emptyPlan();
  lesson.warmupExpected = '8';
  lesson.cooldownExpected = '';
  lesson.techniques[0].expected = '12';
  assert.equal(lessonExpectedText(lesson, { kind: 'warmup' }, 0), '8');
  assert.equal(lessonExpectedText(lesson, { kind: 'technique' }, 0), '12');
  assert.equal(lessonExpectedText(lesson, { kind: 'cooldown' }, 0), '');
  assert.equal(lessonExpectedText(null, { kind: 'warmup' }, 0), null);

  const curriculum = emptyCurriculum();
  curriculum.blocks[0]!.timing = 'video';
  curriculum.blocks[0]!.expected = '8:00';
  curriculum.blocks[0]!.clipId = 'clip-warm';
  assert.equal(curriculumVideoCards([curriculum])[0]?.durationMs, 8 * 60_000);
  storage.clear();
  const stored = saveCurriculum(TODAY, curriculum, TODAY);
  assert.equal(stored.plan.blocks[0]?.expected, '8');
});

test('expected duration has no chips, and 5, 10, 15 catch a slow scroll', () => {
  assert.deepEqual(
    EXPECTED_MINUTE_OPTIONS.filter((option) => option.snap).map((option) => option.value),
    [...EXPECTED_SNAP_MINUTES],
  );
  assert.deepEqual(
    EXPECTED_MINUTE_OPTIONS.filter((option) => option.detent).map((option) => option.value),
    [...EXPECTED_DETENT_MINUTES],
  );
  assert.deepEqual([...EXPECTED_SNAP_MINUTES], []);
  assert.deepEqual([...EXPECTED_DETENT_MINUTES], [5, 10, 15]);
  for (const minute of [1, 8, 9, 12, 16, 18, 20, 25, 30, 40, 45, 60]) {
    const option = EXPECTED_MINUTE_OPTIONS.find((row) => row.value === minute);
    assert.equal(option?.snap, false, `${minute} min chip`);
    assert.equal(option?.detent, false, `${minute} min detent`);
    assert.equal(option?.label, `${minute} min`);
  }
  const at = (minute: number) => EXPECTED_MINUTE_OPTIONS.findIndex((option) => option.value === minute);
  const top = (minute: number) => at(minute) * WHEEL_ITEM_PX;
  assert.equal(settleRowIndex(top(8), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(9) + 10, EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(7), EXPECTED_MINUTE_OPTIONS, 0.2, false), at(5));
  assert.equal(settleRowIndex(top(4), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(5));
  assert.equal(settleRowIndex(top(3), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(5));
  assert.equal(settleRowIndex(top(2), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(2));
  assert.equal(settleRowIndex(top(12), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(13), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(15));
  assert.equal(settleRowIndex(top(11), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(16), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(15));
  assert.equal(settleRowIndex(top(18), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(18));
  assert.equal(settleRowIndex(top(9), EXPECTED_MINUTE_OPTIONS, WHEEL_FLICK_PX_PER_MS + 0.2, false), at(9));
  assert.equal(settleRowIndex(top(14), EXPECTED_MINUTE_OPTIONS, 2, false), at(14));
  assert.equal(settleRowIndex(top(30), EXPECTED_MINUTE_OPTIONS, 3, false), at(30));
  assert.equal(settleRowIndex(top(8) + 23, EXPECTED_MINUTE_OPTIONS, 2, false), at(8));
  assert.equal(settleRowIndex(top(8) + 24, EXPECTED_MINUTE_OPTIONS, 2, false), at(9));
  assert.equal(settleRowIndex(top(8), EXPECTED_MINUTE_OPTIONS, 0.1, true), at(8));
  assert.equal(settleRowIndex(top(9) + 20, EXPECTED_MINUTE_OPTIONS, 0.05, true), at(9));
});

test('the minute wheel is the expected-duration control and the loop uses it', () => {
  const field = readFileSync(new URL('../components/ExpectedDurationField.tsx', import.meta.url), 'utf8');
  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const curriculum = readFileSync(new URL('../pages/CompetitionCurriculum.tsx', import.meta.url), 'utf8');
  const videos = readFileSync(new URL('../pages/Techniques.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../components/WheelPicker.tsx', import.meta.url), 'utf8');
  assert.match(field, /WheelPicker/);
  assert.match(field, /EXPECTED_MINUTE_OPTIONS/);
  assert.match(field, /expectedMinutes/);
  assert.doesNotMatch(field, /<input/);
  assert.doesNotMatch(field, /spellCheck/);
  assert.match(notes, /ExpectedDurationField/);
  assert.match(curriculum, /ExpectedDurationField/);
  assert.doesNotMatch(notes, /function ExpectedTime/);
  assert.doesNotMatch(curriculum, /placeholder=\{EXPECTED_PLACEHOLDER\}/);
  assert.match(videos, /loopSecondsForSlot/);
  assert.match(videos, /lessonExpectedText/);
  assert.match(picker, /disabled/);
});
