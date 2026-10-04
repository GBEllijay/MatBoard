import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CURRICULUM_ADD_EXAMPLES,
  CURRICULUM_DEVICE_NOTE,
  CURRICULUM_LABEL,
  CURRICULUM_LOCK_LABEL,
  CURRICULUM_SAVE_LEAD,
  CURRICULUM_STORAGE_KEY,
  SUGGESTED_KINDS,
  appendBlock,
  blockHeading,
  blockOffersClock,
  blockOffersNotes,
  curriculumBrowseFolders,
  curriculumHasContent,
  emptyCurriculum,
  expectedToWorkMs,
  insertBlockAfter,
  loadCurriculumArchive,
  moveBlock,
  normalizeExpectedDuration,
  plansOnCurriculumDay,
  removeBlock,
  saveCurriculum,
  type CurriculumPlan,
} from './competitionCurriculum.ts';
import { curriculumDriveDocument } from './curriculumDrive.ts';

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

const TODAY = '2026-10-04';

test('a fresh curriculum is the suggested class order and does not write storage', () => {
  storage.clear();
  const plan = emptyCurriculum();
  assert.deepEqual(
    plan.blocks.map((block) => block.kind),
    [...SUGGESTED_KINDS],
  );
  assert.deepEqual(plan.blocks.map((block) => blockHeading(block)), [
    'Competition Class Warm-Up',
    'Body Movement Exercises',
    'Take Downs',
    'Specific Training',
    'Live Rounds',
    'Cool Down',
  ]);
  assert.equal(plan.locked, false);
  assert.equal(curriculumHasContent(plan), false);
  assert.equal(loadCurriculumArchive(TODAY).days[TODAY], undefined);
  assert.equal(localStorage.getItem(CURRICULUM_STORAGE_KEY), null);
});

test('expected duration is a clock time and sets the timer default', () => {
  assert.equal(normalizeExpectedDuration('5:00'), '5:00');
  assert.equal(normalizeExpectedDuration('5'), '5:00');
  assert.equal(normalizeExpectedDuration('1:30'), '1:30');
  assert.equal(normalizeExpectedDuration(''), '');
  assert.equal(expectedToWorkMs('5:00'), 5 * 60_000);
  assert.equal(expectedToWorkMs('5'), 5 * 60_000);
  assert.equal(expectedToWorkMs('1:30'), 90_000);
  assert.equal(expectedToWorkMs(''), 5 * 60_000);
  assert.equal(expectedToWorkMs('soon'), 5 * 60_000);
});

test('cards move, remove, and accept another section between them', () => {
  const plan = emptyCurriculum();
  const warmup = plan.blocks[0];
  const body = plan.blocks[1];
  assert.ok(warmup && body);
  const moved = moveBlock(plan, warmup.id, 1);
  assert.equal(moved.blocks[0]?.kind, 'body');
  assert.equal(moved.blocks[1]?.kind, 'warmup');
  assert.equal(moveBlock(moved, moved.blocks[0]!.id, -1), moved);
  const inserted = insertBlockAfter(plan, warmup.id);
  assert.equal(inserted.blocks[1]?.kind, 'custom');
  assert.equal(inserted.blocks[2]?.kind, 'body');
  assert.equal(blockHeading(inserted.blocks[1]!), 'New section');
  const removed = removeBlock(inserted, warmup.id);
  assert.equal(removed.blocks.some((block) => block.id === warmup.id), false);
  assert.equal(appendBlock(emptyCurriculum()).blocks.at(-1)?.kind, 'custom');
});

test('suggested cards keep timer, notes, and tree options in the requested places', () => {
  const plan = emptyCurriculum();
  const byKind = Object.fromEntries(plan.blocks.map((block) => [block.kind, block]));
  assert.equal(blockOffersClock('warmup'), true);
  assert.equal(blockOffersNotes('warmup'), false);
  assert.equal(blockOffersClock('body'), true);
  assert.equal(blockOffersNotes('body'), true);
  assert.equal(blockOffersClock('takedown'), true);
  assert.equal(blockOffersNotes('specific'), true);
  assert.equal(blockOffersClock('live'), false);
  assert.equal(blockOffersNotes('live'), true);
  assert.equal(blockOffersClock('cooldown'), false);
  assert.equal(byKind.live?.rounds, 5);
  assert.equal(byKind.warmup?.timing, 'timer');
});

test('today saves on this phone and class folders use the designation', () => {
  storage.clear();
  const plan = emptyCurriculum();
  plan.coachName = 'Alex';
  plan.classDesignation = 'No Gi';
  plan.classTime = '6:00 PM';
  plan.blocks[1]!.notes = 'Shrimps';
  plan.blocks[1]!.expected = '5';
  const saved = saveCurriculum(TODAY, plan, TODAY);
  assert.equal(saved.plan.blocks[1]?.expected, '5:00');
  const loaded = loadCurriculumArchive(TODAY);
  assert.equal(plansOnCurriculumDay(loaded, TODAY)[0]?.coachName, 'Alex');
  const folders = curriculumBrowseFolders(loaded, TODAY);
  assert.equal(folders[0]?.label, 'No Gi');
  assert.equal(folders[0]?.dates[0]?.dateKey, TODAY);
});

test('lock in is stored with the curriculum and a Drive copy has no video bytes', () => {
  storage.clear();
  const plan = emptyCurriculum();
  plan.locked = true;
  plan.blocks[0]!.waterBreak = false;
  plan.blocks[1]!.waterBreak = true;
  plan.closing = 'Bow out';
  const saved = saveCurriculum(TODAY, plan, TODAY);
  assert.equal(saved.plan.locked, true);
  const withBlob = curriculumDriveDocument({
    dateKey: TODAY,
    savedAt: 10,
    plan: { ...saved.plan, blob: new Blob(['video']) } as CurriculumPlan,
  });
  const json = JSON.stringify(withBlob);
  assert.equal(withBlob.advantage, 'competition-curriculum');
  assert.equal(withBlob.purpose, 'self');
  assert.equal(withBlob.curriculum.closing, 'Bow out');
  assert.equal(withBlob.curriculum.locked, true);
  assert.equal('blob' in withBlob.curriculum, false);
  assert.equal(json.includes('blob'), false);
  assert.doesNotMatch(json, /video\/mp4/);
});

test('the curriculum page keeps the requested copy and does not edit Daily Lesson Plan', () => {
  const page = readFileSync(new URL('../pages/CompetitionCurriculum.tsx', import.meta.url), 'utf8');
  const lesson = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  assert.equal(CURRICULUM_LABEL, 'Competition Class Curriculum');
  assert.equal(
    CURRICULUM_DEVICE_NOTE,
    "Today's and yesterday's curriculums and recent days stay on this device.",
  );
  assert.equal(
    CURRICULUM_SAVE_LEAD,
    'This curriculum saves to your phone as you type. Click here to save a copy on your connected drive.',
  );
  assert.equal(CURRICULUM_LOCK_LABEL, "Lock In Today's Curriculum");
  assert.equal(CURRICULUM_ADD_EXAMPLES, 'Cardio, Bag Work, Sparring');
  assert.match(page, /Competition Class Designation/);
  assert.match(page, /Open round timer/);
  assert.match(page, /Timer only/);
  assert.match(page, /Looping video/);
  assert.match(page, /data-lock-curriculum/);
  assert.match(page, /data-add-another/);
  assert.match(page, /data-water-break/);
  assert.match(page, /showStructure/);
  assert.doesNotMatch(lesson, /Competition Class Curriculum/);
  assert.doesNotMatch(lesson, /Timer only/);
  assert.match(page, /exportCurriculumToDrive/);
});
