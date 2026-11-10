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
  EXPECTED_STEP_MINUTES,
  expectedDurationLabel,
  expectedMinutes,
  formatExpectedDuration,
  lessonExpectedText,
  loopSecondsForSlot,
  migrateExpectedDuration,
  parseExpectedMinutes,
} from './expectedDuration.ts';
import { settleRowIndex, WHEEL_FLICK_PX_PER_MS, WHEEL_ITEM_PX } from './timeWheel.ts';
import { coachPlanRecordDocument } from './coachPlanExport.ts';
import { emptyCurriculum, expectedToWorkMs, normalizeExpectedDuration, saveCurriculum } from './competitionCurriculum.ts';
import { classMinutes, minutesFromExpected, sanitizeGymEvent } from './gymEvents.ts';
import { lessonPlanForDrive } from './lessonDrive.ts';
import { parseLessonPayload } from './lessonPackage.ts';
import { clampWorkMs } from './trainingStore.ts';
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

test('expected duration is 15-second rows from 0:30 to 60:00, default 5, labeled m:ss', () => {
  assert.equal(EXPECTED_MIN_MINUTES, 0.5);
  assert.equal(EXPECTED_MAX_MINUTES, 60);
  assert.equal(EXPECTED_STEP_MINUTES, 0.25);
  assert.equal(DEFAULT_EXPECTED_MINUTES, 5);
  assert.equal(EXPECTED_MINUTE_OPTIONS.length, ((60 - 0.5) / 0.25) + 1);
  assert.equal(EXPECTED_MINUTE_OPTIONS[0]?.value, 0.5);
  assert.equal(EXPECTED_MINUTE_OPTIONS[0]?.label, '0:30');
  assert.equal(EXPECTED_MINUTE_OPTIONS[1]?.value, 0.75);
  assert.equal(EXPECTED_MINUTE_OPTIONS[1]?.label, '0:45');
  assert.equal(EXPECTED_MINUTE_OPTIONS.find((option) => option.value === 1)?.label, '1:00');
  assert.equal(EXPECTED_MINUTE_OPTIONS.find((option) => option.value === 8)?.label, '8:00');
  assert.equal(EXPECTED_MINUTE_OPTIONS.find((option) => option.value === 8.25)?.label, '8:15');
  assert.equal(EXPECTED_MINUTE_OPTIONS.find((option) => option.value === 8.5)?.label, '8:30');
  assert.equal(EXPECTED_MINUTE_OPTIONS.find((option) => option.value === 8.75)?.label, '8:45');
  assert.equal(EXPECTED_MINUTE_OPTIONS.at(-1)?.value, 60);
  assert.equal(EXPECTED_MINUTE_OPTIONS.at(-1)?.label, '60:00');
  assert.equal(EXPECTED_MINUTE_OPTIONS.every((option) => /^\d+:\d{2}$/.test(option.label)), true);
  for (let index = 1; index < EXPECTED_MINUTE_OPTIONS.length; index += 1) {
    const previous = EXPECTED_MINUTE_OPTIONS[index - 1]?.value ?? 0;
    const value = EXPECTED_MINUTE_OPTIONS[index]?.value ?? 0;
    assert.equal(Math.round((value - previous) * 4), 1);
  }
  assert.equal(expectedMinutes(''), 5);
  assert.equal(expectedMinutes('8'), 8);
  assert.equal(expectedMinutes('8.5'), 8.5);
  assert.equal(expectedMinutes(createTechnique().expected), 5);
  assert.equal(expectedMinutes(emptyPlan().warmupExpected), 5);
  assert.equal(expectedToWorkMs(''), 5 * 60_000);
  assert.equal(expectedToWorkMs('8'), 8 * 60_000);
  assert.equal(expectedToWorkMs('8.5'), 8 * 60_000 + 30_000);
  assert.equal(formatExpectedDuration(8), '8');
  assert.equal(formatExpectedDuration(8.25), '8.25');
  assert.equal(formatExpectedDuration(8.5), '8.5');
  assert.equal(formatExpectedDuration(8.75), '8.75');
  assert.equal(formatExpectedDuration(0.5), '0.5');
  assert.equal(formatExpectedDuration(0.75), '0.75');
  assert.equal(expectedDurationLabel(8), '8:00');
  assert.equal(expectedDurationLabel(8.25), '8:15');
  assert.equal(expectedDurationLabel(8.5), '8:30');
  assert.equal(expectedDurationLabel(8.75), '8:45');
  assert.equal(expectedDurationLabel(0.5), '0:30');
  assert.equal(expectedDurationLabel(60), '60:00');
  const fresh = emptyCurriculum();
  assert.equal(fresh.blocks[0]?.expected, '');
  assert.equal(expectedMinutes(fresh.blocks[0]?.expected ?? ''), 5);
});

test('old m:ss and minute phrases migrate onto 15-second steps, and whole minutes stay whole', () => {
  assert.equal(migrateExpectedDuration('8:00'), '8');
  assert.equal(migrateExpectedDuration('08:00'), '8');
  assert.equal(migrateExpectedDuration('1:30'), '1.5');
  assert.equal(migrateExpectedDuration('0:30'), '0.5');
  assert.equal(migrateExpectedDuration('0:45'), '0.75');
  assert.equal(migrateExpectedDuration('0:04'), '0.5');
  assert.equal(migrateExpectedDuration('0:14'), '0.5');
  assert.equal(migrateExpectedDuration('0:15'), '0.5');
  assert.equal(migrateExpectedDuration('8:07'), '8');
  assert.equal(migrateExpectedDuration('8:08'), '8.25');
  assert.equal(migrateExpectedDuration('8:14'), '8.25');
  assert.equal(migrateExpectedDuration('8:15'), '8.25');
  assert.equal(migrateExpectedDuration('8:29'), '8.5');
  assert.equal(migrateExpectedDuration('8:45'), '8.75');
  assert.equal(migrateExpectedDuration('5'), '5');
  assert.equal(migrateExpectedDuration('5 min'), '5');
  assert.equal(migrateExpectedDuration('10 minutes'), '10');
  assert.equal(migrateExpectedDuration('3 mins'), '3');
  assert.equal(migrateExpectedDuration('8.5'), '8.5');
  assert.equal(migrateExpectedDuration('8.5 min'), '8.5');
  assert.equal(migrateExpectedDuration('8.50'), '8.5');
  assert.equal(migrateExpectedDuration('8.0'), '8');
  assert.equal(migrateExpectedDuration('8.2'), '8.25');
  assert.equal(migrateExpectedDuration('8.25'), '8.25');
  assert.equal(migrateExpectedDuration('8.4'), '8.5');
  assert.equal(migrateExpectedDuration('8.75'), '8.75');
  assert.equal(migrateExpectedDuration('8½ min'), '8.5');
  assert.equal(migrateExpectedDuration('½ min'), '0.5');
  assert.equal(migrateExpectedDuration('0'), '0.5');
  assert.equal(migrateExpectedDuration('60.5'), '60');
  assert.equal(migrateExpectedDuration('200'), '60');
  assert.equal(migrateExpectedDuration('90:00'), '60');
  assert.equal(migrateExpectedDuration(''), '');
  assert.equal(migrateExpectedDuration('  '), '');
  assert.equal(migrateExpectedDuration('soon'), 'soon');
  assert.equal(parseExpectedMinutes('soon'), null);
  assert.equal(parseExpectedMinutes('8:60'), null);
  assert.equal(expectedMinutes('8:00'), 8);
  assert.equal(expectedMinutes('8'), 8);
  assert.equal(expectedMinutes('8.5'), 8.5);
  assert.equal(expectedMinutes('8.25'), 8.25);
  assert.equal(expectedMinutes('8:15'), 8.25);
  assert.equal(expectedMinutes('1:30'), 1.5);
  assert.equal(expectedMinutes('soon'), 5);
  assert.equal(normalizeExpectedDuration('1:30'), '1.5');
  assert.equal(normalizeExpectedDuration('8'), '8');
  assert.equal(normalizeExpectedDuration('8.5'), '8.5');
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
  assert.equal(saved.warmupExpected, '1.5');
  assert.equal(saved.specificExpected, '15');
  assert.equal(saved.cooldownExpected, '0.5');
  assert.equal(saved.techniques[0].expected, '10');
  assert.equal(saved.techniques[1].expected, 'soon');
  assert.equal(saved.games?.[0]?.expected, '8');
  assert.equal(saved.games?.[0]?.title, 'Sharks and minnows');
  assert.equal(saved.techniques[1].title, '');
  const loaded = plansOnDay(loadTrainingArchive(TODAY), TODAY)[0];
  assert.equal(loaded?.introExpected, '8');
  assert.equal(loaded?.warmupExpected, '1.5');
  assert.equal(loaded?.techniques[0].expected, '10');
  assert.equal(loaded?.techniques[1].expected, 'soon');
  const raw = localStorage.getItem(TRAINING_NOTES_STORAGE_KEY) ?? '';
  assert.equal(raw.includes('8:00'), false);
  assert.equal(raw.includes('1:30'), false);
});

test('the lesson duration is the video loop unless a manual length wins', () => {
  const technique = { kind: 'technique' as const, drillSec: 300 };
  assert.equal(loopSecondsForSlot(technique, '8'), 8 * 60);
  assert.equal(loopSecondsForSlot(technique, '8.5'), 8 * 60 + 30);
  assert.equal(loopSecondsForSlot(technique, '8:00'), 8 * 60);
  assert.equal(loopSecondsForSlot(technique, '1:30'), 90);
  assert.equal(loopSecondsForSlot(technique, ''), 5 * 60);
  assert.equal(loopSecondsForSlot(technique, null), 300);
  // A set expected time is the countdown, even when the card was last saved at another length.
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 150 }, '12'), 12 * 60);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 420 }, '8'), 8 * 60);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 300 }, '8:15'), 8 * 60 + 15);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 150 }, '8.25'), 8 * 60 + 15);
  // No expected time: keep the card's own length, including a custom one.
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 150 }, ''), 150);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 150 }, 'soon'), 150);
  // A length the coach set on the video card still wins.
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 150, drillManual: true }, '12'), 150);
  assert.equal(loopSecondsForSlot({ kind: 'technique', drillSec: 300, drillManual: true }, '8'), 300);
  assert.equal(loopSecondsForSlot({ kind: 'warmup', drillSec: 300 }, null), 0);
  assert.equal(loopSecondsForSlot({ kind: 'warmup', drillSec: 300 }, '8:00'), 8 * 60);
  assert.equal(loopSecondsForSlot({ kind: 'warmup', drillSec: 300 }, '8.5'), 8 * 60 + 30);
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
  lesson.warmupExpected = '8.5';
  lesson.cooldownExpected = '';
  lesson.techniques[0].expected = '12';
  assert.equal(lessonExpectedText(lesson, { kind: 'warmup' }, 0), '8.5');
  assert.equal(lessonExpectedText(lesson, { kind: 'technique' }, 0), '12');
  assert.equal(lessonExpectedText(lesson, { kind: 'cooldown' }, 0), '');
  assert.equal(lessonExpectedText(null, { kind: 'warmup' }, 0), null);
  assert.equal(
    loopSecondsForSlot({ kind: 'warmup', drillSec: 300 }, lessonExpectedText(lesson, { kind: 'warmup' }, 0)),
    8 * 60 + 30,
  );

  const curriculum = emptyCurriculum();
  curriculum.blocks[0]!.timing = 'video';
  curriculum.blocks[0]!.expected = '8:00';
  curriculum.blocks[0]!.clipId = 'clip-warm';
  assert.equal(curriculumVideoCards([curriculum])[0]?.durationMs, 8 * 60_000);
  curriculum.blocks[0]!.expected = '8.5';
  assert.equal(curriculumVideoCards([curriculum])[0]?.durationMs, 8 * 60_000 + 30_000);
  curriculum.blocks[0]!.expected = '1:30';
  assert.equal(curriculumVideoCards([curriculum])[0]?.durationMs, 90_000);
  storage.clear();
  curriculum.blocks[0]!.expected = '8.5';
  const stored = saveCurriculum(TODAY, curriculum, TODAY);
  assert.equal(stored.plan.blocks[0]?.expected, '8.5');
  const whole = emptyCurriculum();
  whole.blocks[0]!.expected = '8';
  assert.equal(saveCurriculum(TODAY, whole, TODAY).plan.blocks[0]?.expected, '8');
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
  for (const minute of [0.5, 0.75, 1, 1.5, 8, 8.25, 8.5, 8.75, 9, 9.5, 12, 16, 18, 20, 25, 30, 40, 45, 60]) {
    const option = EXPECTED_MINUTE_OPTIONS.find((row) => row.value === minute);
    assert.equal(option?.snap, false, `${minute} chip`);
    assert.equal(option?.detent, false, `${minute} detent`);
    assert.equal(option?.label, expectedDurationLabel(minute));
  }
  const at = (minute: number) => EXPECTED_MINUTE_OPTIONS.findIndex((option) => option.value === minute);
  const top = (minute: number) => at(minute) * WHEEL_ITEM_PX;
  // Two rows is 30 seconds when each row is 15 seconds.
  assert.equal(settleRowIndex(top(4.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(5));
  assert.equal(settleRowIndex(top(4.75), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(5));
  assert.equal(settleRowIndex(top(5.25), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(5));
  assert.equal(settleRowIndex(top(5.5), EXPECTED_MINUTE_OPTIONS, 0.2, false), at(5));
  assert.equal(settleRowIndex(top(4), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(4));
  assert.equal(settleRowIndex(top(4.25), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(4.25));
  assert.equal(settleRowIndex(top(3.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(3.5));
  assert.equal(settleRowIndex(top(2), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(2));
  assert.equal(settleRowIndex(top(6), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(6));
  assert.equal(settleRowIndex(top(8), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(8));
  assert.equal(settleRowIndex(top(8.25), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(8.25));
  assert.equal(settleRowIndex(top(8.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(8.5));
  assert.equal(settleRowIndex(top(8.75), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(8.75));
  assert.equal(settleRowIndex(top(9), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(9));
  assert.equal(settleRowIndex(top(9.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(9.75), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(10.25), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(10.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(10));
  assert.equal(settleRowIndex(top(11), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(11));
  assert.equal(settleRowIndex(top(12), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(12));
  assert.equal(settleRowIndex(top(14.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(15));
  assert.equal(settleRowIndex(top(14.75), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(15));
  assert.equal(settleRowIndex(top(15.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(15));
  assert.equal(settleRowIndex(top(14), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(14));
  assert.equal(settleRowIndex(top(13.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(13.5));
  assert.equal(settleRowIndex(top(16), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(16));
  assert.equal(settleRowIndex(top(16.5), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(16.5));
  assert.equal(settleRowIndex(top(18), EXPECTED_MINUTE_OPTIONS, 0.1, false), at(18));
  assert.equal(settleRowIndex(top(9.5), EXPECTED_MINUTE_OPTIONS, WHEEL_FLICK_PX_PER_MS + 0.2, false), at(9.5));
  assert.equal(settleRowIndex(top(14.5), EXPECTED_MINUTE_OPTIONS, 2, false), at(14.5));
  assert.equal(settleRowIndex(top(30), EXPECTED_MINUTE_OPTIONS, 3, false), at(30));
  assert.equal(settleRowIndex(top(8) + 23, EXPECTED_MINUTE_OPTIONS, 2, false), at(8));
  assert.equal(settleRowIndex(top(8) + 24, EXPECTED_MINUTE_OPTIONS, 2, false), at(8.25));
  assert.equal(settleRowIndex(top(8), EXPECTED_MINUTE_OPTIONS, 0.1, true), at(8));
  assert.equal(settleRowIndex(top(9) + 20, EXPECTED_MINUTE_OPTIONS, 0.05, true), at(9));
  assert.equal(settleRowIndex(top(8.25) + 20, EXPECTED_MINUTE_OPTIONS, 0.05, true), at(8.25));
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
  assert.match(field, /formatExpectedDuration/);
  assert.doesNotMatch(field, /<input/);
  assert.doesNotMatch(field, /spellCheck/);
  assert.match(notes, /ExpectedDurationField/);
  assert.match(curriculum, /ExpectedDurationField/);
  assert.match(curriculum, /setWorkMs\(expectedToWorkMs\(block\.expected\)\)/);
  assert.doesNotMatch(notes, /function ExpectedTime/);
  assert.doesNotMatch(curriculum, /placeholder=\{EXPECTED_PLACEHOLDER\}/);
  assert.match(videos, /loopSecondsForSlot/);
  assert.match(videos, /lessonExpectedText/);
  assert.match(picker, /disabled/);
  const roundWheel = readFileSync(new URL('./timeWheel.ts', import.meta.url), 'utf8');
  assert.match(roundWheel, /export const DURATION_STEP_MS = 15_000/);
  assert.match(roundWheel, /stepMs: DURATION_STEP_MS/);
  assert.doesNotMatch(roundWheel, /SECOND_STEP_MS|WHEEL_STEP_MS/);
});

test('halves flow through export, class totals, and the round timer', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'Bell';
  plan.intro = 'Grip';
  plan.introExpected = '8';
  plan.warmupExpected = '8.5';
  plan.specificExpected = '1:30';
  plan.cooldownExpected = '';
  plan.techniques[0].expected = '0.5';
  const saved = saveTrainingNotes(plan, TODAY);
  assert.equal(saved.introExpected, '8');
  assert.equal(saved.warmupExpected, '8.5');
  assert.equal(saved.specificExpected, '1.5');
  assert.equal(saved.cooldownExpected, '');
  assert.equal(saved.techniques[0].expected, '0.5');
  const loaded = plansOnDay(loadTrainingArchive(TODAY), TODAY)[0];
  assert.equal(loaded?.introExpected, '8');
  assert.equal(loaded?.warmupExpected, '8.5');

  const drive = lessonPlanForDrive(saved);
  assert.equal(drive.introExpected, '8');
  assert.equal(drive.warmupExpected, '8.5');
  assert.equal(drive.specificExpected, '1.5');
  assert.equal(drive.techniques[0].expected, '0.5');
  const record = coachPlanRecordDocument({ dateKey: TODAY, savedAt: 1, plan: saved });
  assert.equal(record.plan.introExpected, '8');
  assert.equal(record.plan.warmupExpected, '8.5');
  const packed = JSON.stringify(record);
  assert.equal(packed.includes('"8.5"'), true);
  assert.equal(packed.includes('1:30'), false);

  const legacy = emptyPlan();
  legacy.coachName = 'Bell';
  legacy.intro = 'Grip';
  legacy.introExpected = '8';
  legacy.warmupNote = 'Shrimps';
  legacy.warmupExpected = '1:30';
  const doc = parseLessonPayload(
    JSON.stringify({
      advantage: 'lesson-plan',
      version: 1,
      date: TODAY,
      coachName: 'Bell',
      savedAt: 1,
      plan: legacy,
    }),
  );
  assert.equal(doc?.plan.introExpected, '8');
  assert.equal(doc?.plan.warmupExpected, '1.5');

  assert.equal(minutesFromExpected('8'), 8);
  assert.equal(minutesFromExpected('8.5'), 8.5);
  assert.equal(minutesFromExpected('8.5 min'), 8.5);
  assert.equal(minutesFromExpected('1:30'), 1.5);
  assert.equal(minutesFromExpected('10 minutes'), 10);
  assert.equal(minutesFromExpected('1 hr'), 60);
  assert.equal(minutesFromExpected(''), 0);
  assert.equal(minutesFromExpected('soon'), 0);
  assert.equal(
    classMinutes({
      introExpected: '8.5',
      warmupExpected: '8',
      specificExpected: '',
      cooldownExpected: '0.5',
      techniques: [{ expected: '1.5' }],
      games: [{ expected: '1:30' }],
    }),
    20,
  );
  assert.equal(classMinutes({ introExpected: '', warmupExpected: '8.5' }), 8.5);
  assert.equal(classMinutes({}), 60);

  const taught = sanitizeGymEvent({
    id: 'half-class',
    type: 'class_taught',
    planId: 'plan-half',
    date: TODAY,
    template: 'adult',
    classDesignation: 'GB1',
    minutes: 8.5,
    instructorSeat: 'seat-coach',
    actor: { seatId: 'seat-coach', name: 'Coach' },
    source: 'live',
    v: 1,
    at: `${TODAY}T12:00:00.000Z`,
    recordedAt: 1,
    licenseId: 'gym-1',
  });
  assert.equal(taught && taught.type === 'class_taught' ? taught.minutes : 0, 8.5);
  const wholeTaught = sanitizeGymEvent({
    id: 'whole-class',
    type: 'class_taught',
    planId: 'plan-whole',
    date: TODAY,
    template: 'adult',
    classDesignation: 'GB1',
    minutes: 8,
    instructorSeat: 'seat-coach',
    actor: { seatId: 'seat-coach', name: 'Coach' },
    source: 'live',
    v: 1,
    at: `${TODAY}T12:00:00.000Z`,
    recordedAt: 1,
    licenseId: 'gym-1',
  });
  assert.equal(wholeTaught && wholeTaught.type === 'class_taught' ? wholeTaught.minutes : 0, 8);

  assert.equal(clampWorkMs(expectedToWorkMs('8.5')), 8 * 60_000 + 30_000);
  assert.equal(clampWorkMs(expectedToWorkMs('8')), 8 * 60_000);
  assert.equal(clampWorkMs(expectedToWorkMs('1:30')), 90_000);
  assert.equal(clampWorkMs(expectedToWorkMs('0.5')), 60_000);
  assert.equal(clampWorkMs(expectedToWorkMs('')), 5 * 60_000);
});
