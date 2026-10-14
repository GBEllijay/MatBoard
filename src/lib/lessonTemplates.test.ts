import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonPlanForDrive } from './lessonDrive.ts';
import {
  activeLessonTemplate,
  addLessonGame,
  addLessonTechnique,
  applyLessonTemplate,
  blockHeading,
  lessonBlocks,
  moveLessonBlock,
  removeLessonBlock,
  templateAlreadyApplied,
  templateChangeNeedsConfirm,
} from './lessonTemplates.ts';
import {
  TRAINING_NOTES_STORAGE_KEY,
  emptyPlan,
  loadTrainingArchive,
  planShouldPersist,
  saveDay,
  type PlanVideoRef,
} from './trainingNotesStore.ts';

const TODAY = '2026-10-14';

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
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

function video(index: number, name: string): PlanVideoRef {
  return {
    section: 'technique',
    index,
    localClipId: `clip-${index}`,
    driveFileId: null,
    url: null,
    name,
    mime: 'video/mp4',
  };
}

test('a saved plan with no template opens unchanged as Adult', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.intro = 'Armbar from closed guard.';
  plan.techniques[0].title = 'Knee cut';
  plan.techniques[2].title = 'Hip escape';
  plan.videos = [video(0, 'Knee cut.mp4'), video(2, 'Hip escape.mp4')];
  const raw = JSON.stringify({ version: 3, days: { [TODAY]: { plans: [plan] } } });
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, raw);

  const loaded = loadTrainingArchive(TODAY);
  const saved = loaded.days[TODAY]?.plans[0];
  assert.ok(saved);
  assert.equal(saved.template, undefined);
  assert.equal(saved.blocks, undefined);
  assert.equal(saved.games, undefined);
  assert.equal(activeLessonTemplate(saved), 'adult');
  assert.equal(saved.intro, 'Armbar from closed guard.');
  assert.equal(saved.techniques.length, 3);
  assert.equal(saved.techniques[0].title, 'Knee cut');
  assert.equal(saved.techniques[2].title, 'Hip escape');
  assert.equal(saved.videos?.length, 2);
  assert.equal(saved.videos?.[1]?.name, 'Hip escape.mp4');
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), raw);

  const blocks = lessonBlocks(saved);
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['intro', 'warmup', 'technique', 'technique', 'technique', 'specific', 'cooldown', 'closing'],
  );
  assert.equal(templateAlreadyApplied(saved, 'adult'), true);
  assert.equal(templateChangeNeedsConfirm(saved), true);
});

test('Kids replaces technique 3 with a Game between technique 1 and technique 2', () => {
  const plan = emptyPlan();
  plan.intro = 'Line up.';
  plan.techniques[0].title = 'Shrimp';
  plan.techniques[1].title = 'Bridge';
  plan.techniques[2].title = 'Stand-up';
  plan.videos = [video(0, 'Shrimp.mp4'), video(1, 'Bridge.mp4'), video(2, 'Stand-up.mp4')];
  const warmup = {
    section: 'warmup' as const,
    index: null,
    localClipId: 'warm',
    driveFileId: null,
    url: null,
    name: 'Warm-up.mp4',
    mime: 'video/mp4',
  };
  plan.videos = [warmup, ...plan.videos];

  assert.equal(templateChangeNeedsConfirm(plan), true);
  const kids = applyLessonTemplate(plan, 'kids');
  assert.equal(kids.template, 'kids');
  assert.equal(kids.intro, 'Line up.');
  assert.equal(kids.techniques.length, 2);
  assert.equal(kids.techniques[0].title, 'Shrimp');
  assert.equal(kids.techniques[1].title, 'Bridge');
  assert.equal(kids.games?.length, 1);
  assert.deepEqual(
    lessonBlocks(kids).map((block) => block.kind),
    ['intro', 'warmup', 'technique', 'game', 'technique', 'specific', 'cooldown', 'closing'],
  );
  assert.equal(blockHeading(lessonBlocks(kids)[2], 1, 0), 'Technique / Drill 1');
  assert.equal(blockHeading(lessonBlocks(kids)[3], 1, 1), 'Game');
  assert.equal(blockHeading(lessonBlocks(kids)[4], 2, 1), 'Technique / Drill 2');
  assert.equal(kids.videos?.some((row) => row.name === 'Stand-up.mp4'), false);
  assert.equal(kids.videos?.find((row) => row.name === 'Shrimp.mp4')?.index, 0);
  assert.equal(kids.videos?.find((row) => row.name === 'Bridge.mp4')?.index, 1);
  assert.equal(kids.videos?.find((row) => row.section === 'warmup')?.name, 'Warm-up.mp4');
  assert.equal(templateAlreadyApplied(kids, 'kids'), true);
});

test('templates set the starting structure and a filled plan asks before applying', () => {
  const blank = emptyPlan();
  assert.equal(templateChangeNeedsConfirm(blank), false);
  assert.equal(planShouldPersist(blank), false);
  const kids = applyLessonTemplate(blank, 'kids');
  assert.equal(planShouldPersist(kids), true);

  storage.clear();
  const saved = saveDay(TODAY, kids, TODAY).plan;
  const again = loadTrainingArchive(TODAY).days[TODAY]?.plans[0];
  assert.equal(again?.template, 'kids');
  assert.equal(again?.games?.length, 1);
  assert.equal(again?.techniques.length, 2);
  assert.equal(again?.id, saved.id);

  const adult = applyLessonTemplate(saved, 'adult');
  assert.equal(adult.template, 'adult');
  assert.equal(adult.games, undefined);
  assert.equal(adult.techniques.length, 3);
  assert.deepEqual(
    lessonBlocks(adult).map((block) => block.kind),
    ['intro', 'warmup', 'technique', 'technique', 'technique', 'specific', 'cooldown', 'closing'],
  );
  const driven = lessonPlanForDrive(adult);
  assert.equal(driven.template, 'adult');
  assert.equal(driven.videos, undefined);
  const legacy = lessonPlanForDrive(emptyPlan());
  assert.equal(legacy.template, undefined);
  assert.equal(legacy.blocks, undefined);
  assert.equal(legacy.games, undefined);
});

test('blocks move, add, and remove while per-plan videos stay with their technique', () => {
  let plan = applyLessonTemplate(emptyPlan(), 'adult');
  plan.techniques[0].title = 'First';
  plan.techniques[1].title = 'Second';
  plan.videos = [video(0, 'First.mp4'), video(1, 'Second.mp4')];
  const firstId = plan.techniques[0].id;
  const introIndex = lessonBlocks(plan).findIndex((block) => block.kind === 'intro');
  plan = moveLessonBlock(plan, introIndex, 1);
  assert.equal(lessonBlocks(plan)[0].kind, 'warmup');
  assert.equal(lessonBlocks(plan)[1].kind, 'intro');
  assert.equal(plan.videos?.[0]?.name, 'First.mp4');

  plan = addLessonGame(plan);
  plan = addLessonTechnique(plan);
  assert.equal(plan.techniques.at(-1)?.title, '');
  assert.equal(lessonBlocks(plan).at(-1)?.kind, 'technique');
  assert.equal(lessonBlocks(plan).at(-2)?.kind, 'game');
  const gameIndex = lessonBlocks(plan).findIndex((block) => block.kind === 'game');
  plan = moveLessonBlock(plan, gameIndex, -1);
  assert.equal(lessonBlocks(plan)[gameIndex - 1].kind, 'game');

  const closingIndex = lessonBlocks(plan).findIndex((block) => block.kind === 'closing');
  const removed = removeLessonBlock(plan, closingIndex);
  assert.equal(lessonBlocks(removed).some((block) => block.kind === 'closing'), false);
  assert.equal(removed.closing, plan.closing);
  const first = removed.techniques.findIndex((tech) => tech.id === firstId);
  assert.equal(removed.videos?.find((row) => row.name === 'First.mp4')?.index, first);

  const stripped = removeLessonBlock(
    removed,
    lessonBlocks(removed).findIndex((block) => block.kind === 'technique' && block.id === firstId),
  );
  assert.equal(stripped.videos?.some((row) => row.name === 'First.mp4'), false);
  assert.equal(stripped.videos?.find((row) => row.name === 'Second.mp4')?.index, stripped.techniques.findIndex((tech) => tech.title === 'Second'));
});

test('Competition keeps the lesson record and does not rewrite an empty choice into Adult fields', () => {
  const plan = emptyPlan();
  plan.coachName = 'Alex';
  const competition = applyLessonTemplate(plan, 'competition');
  assert.equal(competition.template, 'competition');
  assert.equal(competition.coachName, 'Alex');
  assert.equal(competition.blocks, undefined);
  assert.equal(templateAlreadyApplied(competition, 'competition'), true);
  assert.equal(templateChangeNeedsConfirm(competition), true);
  const stored = lessonPlanForDrive(competition);
  assert.equal(stored.template, 'competition');
  assert.equal(stored.coachName, 'Alex');
});
