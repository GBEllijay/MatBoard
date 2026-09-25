import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lessonSlotOffersVideo,
  matchLessonTree,
  parallelVideoSlot,
  parseTechniqueTitle,
  techniqueTreeLaunchPath,
  techniquesLaunchPath,
  type LessonTreeCandidate,
} from './lessonLinks.ts';
import { emptyVideoPlan, insertTechniqueSlot, setSlotClip } from './techniqueLogic.ts';

const trees: LessonTreeCandidate[] = [
  { id: 'tree-closed', name: 'Closed guard', rootTitle: 'Closed guard' },
  { id: 'tree-mount', name: 'Mount attacks', rootTitle: 'Mount' },
  { id: 'tree-empty', name: 'Technique Tree', rootTitle: '' },
];

test('video slots pair by order, not by title', () => {
  const plan = emptyVideoPlan();
  assert.equal(parallelVideoSlot(plan, { role: 'warmup' })?.slotId, 'warmup');
  assert.equal(parallelVideoSlot(plan, { role: 'cooldown' })?.slotId, 'cooldown');
  assert.equal(parallelVideoSlot(plan, { role: 'technique', index: 0 })?.kind, 'technique');
  assert.equal(parallelVideoSlot(plan, { role: 'technique', index: 1 })?.kind, 'technique');
  assert.equal(parallelVideoSlot(plan, { role: 'technique', index: 2 })?.kind, 'technique');
  assert.equal(parallelVideoSlot(plan, { role: 'technique', index: 3 }), null);
  assert.equal(lessonSlotOffersVideo({ role: 'warmup' }, null), true);
  assert.equal(lessonSlotOffersVideo({ role: 'technique', index: 2 }, null), true);
  assert.equal(lessonSlotOffersVideo({ role: 'technique', index: 3 }, null), false);
  assert.equal(lessonSlotOffersVideo({ role: 'technique', index: 3 }, 3), false);

  const extra = insertTechniqueSlot(plan, 'tech-extra');
  assert.ok(extra);
  const count = extra.slots.filter((slot) => slot.kind === 'technique').length;
  assert.equal(lessonSlotOffersVideo({ role: 'technique', index: 3 }, count), true);
  assert.equal(parallelVideoSlot(extra, { role: 'technique', index: 3 })?.slotId, 'tech-extra');

  const withClip = setSlotClip(plan, 'warmup', 'clip-warm');
  assert.equal(parallelVideoSlot(withClip, { role: 'warmup' })?.clipId, 'clip-warm');
  assert.equal(parallelVideoSlot(withClip, { role: 'technique', index: 0 })?.clipId, null);
});

test('launch paths focus the videos slot or the saved tree', () => {
  assert.equal(techniquesLaunchPath('warmup'), '/techniques?slot=warmup&play=1');
  assert.equal(techniquesLaunchPath('tech-2'), '/techniques?slot=tech-2&play=1');
  assert.equal(techniqueTreeLaunchPath('tree a'), '/technique-tree?tree=tree+a');
});

test('title forms pick one tree and a saved id wins', () => {
  assert.deepEqual(parseTechniqueTitle('  Triangle   ( Closed guard ) '), {
    name: 'Triangle',
    base: 'Closed guard',
  });
  assert.deepEqual(parseTechniqueTitle('Armbar / Mount'), { name: 'Armbar', base: 'Mount' });
  assert.deepEqual(parseTechniqueTitle('Knee slice/Half guard'), { name: 'Knee slice', base: 'Half guard' });
  assert.deepEqual(parseTechniqueTitle('Closed guard'), { name: 'Closed guard', base: null });

  assert.equal(matchLessonTree('Closed guard', undefined, trees)?.id, 'tree-closed');
  assert.equal(matchLessonTree('mount attacks', undefined, trees)?.id, 'tree-mount');
  assert.equal(matchLessonTree('Triangle (Closed guard)', undefined, trees)?.id, 'tree-closed');
  assert.equal(matchLessonTree('Armbar / Mount', undefined, trees)?.id, 'tree-mount');
  assert.equal(matchLessonTree('Something else', undefined, trees), null);
  assert.equal(matchLessonTree('Technique Tree', undefined, trees), null);

  const twins: LessonTreeCandidate[] = [
    { id: 'a', name: 'Gi', rootTitle: 'Closed guard' },
    { id: 'b', name: 'No-gi', rootTitle: 'Closed guard' },
  ];
  assert.equal(matchLessonTree('Triangle (Closed guard)', undefined, twins), null);
  assert.equal(matchLessonTree('No-gi (Closed guard)', undefined, twins)?.id, 'b');
  assert.equal(matchLessonTree('Triangle (Closed guard)', 'a', twins)?.id, 'a');
  assert.equal(matchLessonTree('Closed guard', 'missing', trees)?.id, 'tree-closed');
  assert.equal(matchLessonTree('', 'tree-empty', trees)?.id, 'tree-empty');
});
