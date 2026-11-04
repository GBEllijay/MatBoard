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
import { MAX_REPLAYS, REPLAY_HEADING, cleanReviewSlot } from './replayAnalysis.ts';
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

test('Private lesson template: intro, warm-up, two techniques, specific, closing', () => {
  const plan = emptyPlan();
  plan.techniques[0].title = 'Knee cut';
  plan.techniques[2].title = 'Dropped on Private';
  const next = applyLessonTemplate(plan, 'private');
  assert.equal(next.template, 'private');
  assert.deepEqual(kinds(next), ['intro', 'warmup', 'technique', 'technique', 'specific', 'closing']);
  assert.equal(next.techniques.length, 2);
  assert.equal(next.techniques[0].title, 'Knee cut');
  assert.equal(next.games, undefined);
  assert.equal(templateAlreadyApplied(next, 'private'), true);
  assert.equal(templateAlreadyApplied(next, 'adult'), false);
  // Add technique / Add game / replay still work on Private.
  const grown = addLessonReplay(addLessonGame(addLessonTechnique(next)));
  assert.equal(kinds(grown).filter((k) => k === 'technique').length, 3);
  assert.equal(kinds(grown).filter((k) => k === 'game').length, 1);
  assert.equal(kinds(grown).filter((k) => k === 'replay').length, 1);
  // Survives sanitize and storage.
  const { plan: clean } = sanitizePlan(JSON.parse(JSON.stringify(next)));
  assert.equal(clean.template, 'private');
  assert.deepEqual(kinds(clean), kinds(next));
  // Switching back to Adult restores three techniques and Cool down.
  const adult = applyLessonTemplate(next, 'adult');
  assert.deepEqual(kinds(adult), ['intro', 'warmup', 'technique', 'technique', 'technique', 'specific', 'cooldown', 'closing']);
});

test('Private keeps replay cards across a switch', () => {
  let plan = addLessonReplay(emptyPlan());
  const [id] = replayIds(plan);
  plan = updateLessonReplay(plan, id, { title: 'Private review' });
  const next = applyLessonTemplate(plan, 'private');
  assert.equal(kinds(next).at(-1), 'replay');
  assert.equal(next.replays?.[0].title, 'Private review');
  assert.equal(templateAlreadyApplied(next, 'private'), true);
});

// ---------- Competition curriculum: Record for replay mode + Record for Review ----------
import {
  CURRICULUM_TIMINGS,
  CURRICULUM_TIMING_LABELS,
  RECORD_FOR_REVIEW_LABEL,
  blockOffersReviewToggle,
  blockWantsReplay,
  copyCurriculum,
  createCustomBlock,
  curriculumHasContent,
  emptyCurriculum,
  sanitizeCurriculum,
} from './competitionCurriculum.ts';

test('curriculum modes: Timer only / Looping video / Record for replay', () => {
  assert.deepEqual(
    CURRICULUM_TIMINGS.map((t) => CURRICULUM_TIMING_LABELS[t]),
    ['Timer only', 'Looping video', 'Record for replay'],
  );
  assert.equal(RECORD_FOR_REVIEW_LABEL, 'Record for Review');
});

test('Record for Review (owner): sparring, added blocks, Specific Training, Intro and Closing; not cool down, warm-up, body movement or technique', () => {
  for (const kind of ['live', 'custom', 'specific', 'intro', 'closing'] as const) {
    assert.equal(blockOffersReviewToggle(kind), true, kind);
  }
  for (const kind of ['warmup', 'body', 'takedown', 'cooldown'] as const) {
    assert.equal(blockOffersReviewToggle(kind), false, kind);
  }
  assert.equal(blockWantsReplay({ kind: 'warmup', timing: 'replay' }), true);
  assert.equal(blockWantsReplay({ kind: 'warmup', timing: 'timer', recordReview: true }), false);
  assert.equal(blockWantsReplay({ kind: 'live', timing: 'timer', recordReview: true }), true);
  assert.equal(blockWantsReplay({ kind: 'live', timing: 'replay' }), false, 'live has no mode picker');
  assert.equal(blockWantsReplay({ kind: 'custom', timing: 'timer', recordReview: true }), true);
  assert.equal(blockWantsReplay({ kind: 'custom', timing: 'timer' }), false);
});

test('curriculum sanitize keeps replay mode, review toggle and clip ref; drops them where not offered', () => {
  const plan = emptyCurriculum();
  const clip = { localId: 'clip-1', name: 'round.mp4', mime: 'video/mp4', size: 10, source: 'record' };
  const custom = { ...createCustomBlock(), title: 'Bag work', recordReview: true, replayClip: clip };
  const raw = JSON.parse(
    JSON.stringify({
      ...plan,
      blocks: [
        { ...plan.blocks[0], timing: 'replay', replayClip: clip },
        { ...plan.blocks[1], recordReview: true },
        ...plan.blocks.slice(2, 4),
        { ...plan.blocks[4], recordReview: true },
        plan.blocks[5],
        custom,
      ],
    }),
  );
  const { plan: clean, repaired } = sanitizeCurriculum(raw);
  assert.equal(repaired, true, 'body movement toggle removed');
  assert.equal(clean.blocks[0].timing, 'replay');
  assert.equal(clean.blocks[0].replayClip?.localId, 'clip-1');
  assert.equal(clean.blocks[1].recordReview, undefined);
  assert.equal(clean.blocks[4].recordReview, true);
  assert.equal(clean.blocks[6].recordReview, true);
  assert.equal(clean.blocks[6].replayClip?.name, 'round.mp4');
  assert.equal(curriculumHasContent(clean), true);
  const again = sanitizeCurriculum(JSON.parse(JSON.stringify(clean)));
  assert.equal(again.repaired, false);
  assert.deepEqual(again.plan, clean);
  const copy = copyCurriculum(clean);
  assert.equal(copy.blocks[0].timing, 'replay');
  assert.equal(copy.blocks[4].recordReview, true);
  const broken = sanitizeCurriculum({ ...raw, blocks: [{ ...raw.blocks[0], replayClip: { name: 'x' } }] });
  assert.equal(broken.plan.blocks[0].replayClip, undefined);
  assert.equal(broken.repaired, true);
});

test('a fresh curriculum is still empty; toggling Record for Review counts as content', () => {
  const plan = emptyCurriculum();
  assert.equal(curriculumHasContent(plan), false);
  const live = plan.blocks.findIndex((b) => b.kind === 'live');
  const next = { ...plan, blocks: plan.blocks.map((b, i) => (i === live ? { ...b, recordReview: true } : b)) };
  assert.equal(curriculumHasContent(next), true);
});

test('review slots: intro/specific/closing keep switch and clip through sanitize; off with no clip drops', async () => {
  const { sanitizePlan, emptyPlan } = await import('./trainingNotesStore.ts');
  const clip = { localId: 'clip-9', name: 'intro.mp4', mime: 'video/mp4', size: 5, source: 'record' };
  const base = emptyPlan();
  const { plan } = sanitizePlan(JSON.parse(JSON.stringify({ ...base, introReview: { recordReview: true }, specificReview: { recordReview: true, replayClip: clip }, closingReview: { recordReview: false } })));
  assert.deepEqual(plan.introReview, { recordReview: true });
  assert.deepEqual(plan.specificReview, { recordReview: true, replayClip: clip });
  assert.equal(plan.closingReview, undefined);
  assert.deepEqual(cleanReviewSlot(null), { slot: undefined, repaired: false });
  const cur = sanitizeCurriculum(JSON.parse(JSON.stringify({ ...emptyCurriculum(), closingReview: { recordReview: true } }))).plan;
  assert.deepEqual(cur.closingReview, { recordReview: true });
});
