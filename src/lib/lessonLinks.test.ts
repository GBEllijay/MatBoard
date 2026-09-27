import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lessonFocusStatus,
  lessonSlotOffersVideo,
  matchLessonTree,
  parallelVideoSlot,
  parseLessonVideoFocus,
  parseTechniqueTitle,
  resolveFocusedSlot,
  techniqueTreeLaunchPath,
  techniquesFocusPath,
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
  assert.equal(
    techniquesFocusPath({ section: 'warmup', date: '2026-09-27', slotId: 'warmup' }),
    '/techniques?focus=1&section=warmup&date=2026-09-27&slot=warmup',
  );
  assert.equal(
    techniquesFocusPath({ section: 'technique', index: 0, date: '2026-09-27', slotId: 'tech-1' }),
    '/techniques?focus=1&section=technique&date=2026-09-27&slot=tech-1&index=0',
  );
  assert.equal(
    techniquesFocusPath({ section: 'cooldown', date: '2026-09-27' }),
    '/techniques?focus=1&section=cooldown&date=2026-09-27',
  );
  assert.doesNotMatch(
    techniquesFocusPath({ section: 'technique', index: 0, date: '2026-09-27', slotId: 'tech-1' }),
    /play=/,
  );
  assert.equal(techniqueTreeLaunchPath('tree a'), '/technique-tree?tree=tree+a');

  const plan = emptyVideoPlan();
  const drill = parseLessonVideoFocus(
    new URLSearchParams('focus=1&section=technique&date=2026-09-27&slot=missing&index=0&play=1'),
  );
  assert.equal(drill.focus, true);
  assert.equal(drill.play, false);
  assert.equal(resolveFocusedSlot(plan, drill)?.kind, 'technique');
  assert.equal(
    lessonFocusStatus(plan, drill, resolveFocusedSlot(plan, drill)!, '2026-09-27'),
    "From today's Daily Lesson Plan · Technique / Drill 1. Add, replace, or remove the video on this card.",
  );

  const warmup = parseLessonVideoFocus(
    new URLSearchParams('focus=1&section=warmup&date=2026-09-26&slot=tech-1'),
  );
  const warmupSlot = resolveFocusedSlot(plan, warmup);
  assert.equal(warmupSlot?.slotId, 'warmup');
  assert.match(lessonFocusStatus(plan, warmup, warmupSlot!, '2026-09-27'), /Warm-up/);
  assert.match(lessonFocusStatus(plan, warmup, warmupSlot!, '2026-09-27'), /Sep 26/);

  const legacy = parseLessonVideoFocus(new URLSearchParams('slot=tech-2&play=1'));
  assert.equal(legacy.play, true);
  assert.equal(legacy.focus, false);
  assert.equal(resolveFocusedSlot(plan, legacy)?.slotId, 'tech-2');

  const missing = parseLessonVideoFocus(new URLSearchParams('focus=1&section=technique&index=9&date=2026-09-27'));
  assert.equal(resolveFocusedSlot(plan, missing), null);
  const junk = parseLessonVideoFocus(new URLSearchParams('section=nope&date=yesterday&index=-1'));
  assert.equal(junk.active, false);
  assert.equal(junk.section, null);
  assert.equal(junk.date, null);
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
