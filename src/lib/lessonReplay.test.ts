/** Video replay analysis cards inside the Daily Lesson Plan structure. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonPlanForDrive } from './lessonDrive.ts';
import {
  addLessonGame,
  addLessonReplay,
  addLessonTechnique,
  applyLessonTemplate,
  blockHeading,
  lessonBlocks,
  moveLessonBlock,
  moveReplayAmongReplays,
  removeLessonReplay,
  replayCount,
  templateAlreadyApplied,
  updateLessonReplay,
} from './lessonTemplates.ts';
import { MAX_REPLAYS, REPLAY_HEADING } from './replayAnalysis.ts';
import {
  TRAINING_NOTES_STORAGE_KEY,
  copyPlan,
  emptyPlan,
  loadTrainingArchive,
  planHasContent,
  sanitizePlan,
  saveDay,
  type TrainingNotesPlan,
} from './trainingNotesStore.ts';

const TODAY = '2026-11-04';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});

function kinds(plan: TrainingNotesPlan): string[] {
  return lessonBlocks(plan).map((b) => b.kind);
}

function replayIds(plan: TrainingNotesPlan): string[] {
  return lessonBlocks(plan).flatMap((b) => (b.kind === 'replay' ? [b.id] : []));
}

test('Add video replay analysis section appends a movable card and keeps the old blocks', () => {
  const plan = emptyPlan();
  const before = kinds(plan);
  const next = addLessonReplay(plan);
  assert.deepEqual(kinds(next), [...before, 'replay']);
  assert.equal(replayCount(next), 1);
  assert.equal(next.replays?.length, 1);
  assert.equal(next.techniques.length, plan.techniques.length);
  // Movable like any block.
  const last = kinds(next).length - 1;
  const moved = moveLessonBlock(next, last, -1);
  assert.equal(kinds(moved)[last - 1], 'replay');
  assert.equal(moved.replays?.length, 1);
  const block = lessonBlocks(next)[last];
  assert.equal(blockHeading(block, 0, 0, 1), REPLAY_HEADING);
  assert.equal(blockHeading(block, 0, 0, 2), `${REPLAY_HEADING} 2`);
});

test('Add technique and Add game still work beside replay cards', () => {
  let plan = addLessonReplay(emptyPlan());
  plan = addLessonTechnique(plan);
  plan = addLessonGame(plan);
  const k = kinds(plan);
  assert.equal(k.filter((x) => x === 'technique').length, 4);
  assert.equal(k.filter((x) => x === 'game').length, 1);
  assert.equal(k.filter((x) => x === 'replay').length, 1);
});

test('a technique card has no clip of its own from the replay feature', () => {
  const plan = addLessonReplay(emptyPlan());
  for (const technique of plan.techniques) assert.equal('clip' in technique, false);
});

test('replay title, notes and clip update; empty card does not count as content', () => {
  let plan = addLessonReplay(emptyPlan());
  assert.equal(planHasContent(plan), false);
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, { title: 'Round 3 guard passing' });
  assert.equal(planHasContent(plan), true);
  plan = updateLessonReplay(plan, id, {
    clip: { localId: 'rclip-1', name: 'r3.webm', mime: 'video/webm', size: 10, source: 'record' },
  });
  assert.equal(plan.replays?.[0].clip?.localId, 'rclip-1');
  assert.equal(updateLessonReplay(plan, 'nope', { title: 'x' }), plan);
});

test('moving among replays swaps only replay cards', () => {
  let plan = addLessonReplay(addLessonReplay(emptyPlan()));
  const [a, b] = replayIds(plan);
  const other = kinds(plan).filter((k) => k !== 'replay');
  plan = moveReplayAmongReplays(plan, b, -1);
  assert.deepEqual(replayIds(plan), [b, a]);
  assert.deepEqual(kinds(plan).filter((k) => k !== 'replay'), other);
  assert.equal(moveReplayAmongReplays(plan, b, -1), plan);
  plan = removeLessonReplay(plan, b);
  assert.deepEqual(replayIds(plan), [a]);
  assert.equal(plan.replays?.length, 1);
  plan = removeLessonReplay(plan, a);
  assert.equal(replayCount(plan), 0);
  assert.equal(plan.replays, undefined);
});

test('the card count is capped', () => {
  let plan = emptyPlan();
  for (let i = 0; i < MAX_REPLAYS + 3; i += 1) plan = addLessonReplay(plan);
  assert.equal(replayCount(plan), MAX_REPLAYS);
});

test('replay cards survive a template switch and do not block "already applied"', () => {
  let plan = addLessonReplay(emptyPlan());
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, { title: 'Keep me' });
  assert.equal(templateAlreadyApplied(plan, 'adult'), true);
  const kids = applyLessonTemplate(plan, 'kids');
  assert.deepEqual(replayIds(kids), [id]);
  assert.equal(kids.replays?.[0].title, 'Keep me');
  assert.equal(kinds(kids).at(-1), 'replay');
  const comp = applyLessonTemplate(kids, 'competition');
  assert.equal(comp.replays?.[0].title, 'Keep me');
  const back = applyLessonTemplate(comp, 'adult');
  assert.equal(back.replays?.[0].title, 'Keep me');
});

test('sanitize keeps replay cards, drops orphans and unknown block ids', () => {
  let plan = addLessonReplay(emptyPlan());
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, { title: 'Live round' });
  const raw = JSON.parse(JSON.stringify(plan));
  raw.replays.push({ id: 'orphan', title: 'nobody points here', notes: '' });
  raw.blocks.push({ kind: 'replay', id: 'missing' });
  const { plan: clean } = sanitizePlan(raw);
  assert.deepEqual(replayIds(clean), [id]);
  assert.deepEqual(clean.replays?.map((r) => r.id), [id]);
});

test('replay cards round-trip through local storage', () => {
  store.clear();
  let plan = addLessonReplay(emptyPlan());
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, {
    title: 'Saved round',
    clip: { localId: 'rclip-9', name: 'a.mp4', mime: 'video/mp4', size: 5, source: 'gallery', saved: { kind: 'advantage-cloud', ref: 'lessons/x/a.mp4' } },
  });
  saveDay(TODAY, plan, TODAY);
  assert.ok(store.get(TRAINING_NOTES_STORAGE_KEY));
  const loaded = loadTrainingArchive(TODAY).days[TODAY]?.plans[0];
  assert.ok(loaded);
  assert.deepEqual(replayIds(loaded), [id]);
  assert.equal(loaded.replays?.[0].clip?.saved?.ref, 'lessons/x/a.mp4');
});

test('copying a plan gives replay cards fresh ids and keeps the clip', () => {
  let plan = addLessonReplay(emptyPlan());
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, {
    title: 'Copy me',
    clip: { localId: 'rclip-2', name: 'b.mp4', mime: 'video/mp4', size: 5, source: 'record' },
  });
  const copy = copyPlan(plan);
  const [copyId] = replayIds(copy);
  assert.notEqual(copyId, id);
  assert.equal(copy.replays?.[0].id, copyId);
  assert.equal(copy.replays?.[0].clip?.localId, 'rclip-2');
});

test('the Drive / Cloud lesson copy lists replay cards', () => {
  let plan = addLessonReplay(emptyPlan());
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, { title: 'For Drive', notes: 'hips' });
  const json = lessonPlanForDrive(plan) as unknown as { replays?: { title: string }[] };
  assert.equal(json.replays?.[0].title, 'For Drive');
});
