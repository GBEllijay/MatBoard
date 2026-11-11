import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLessonTemplate, lessonBlocks } from './lessonTemplates.ts';
import {
  defaultFocusStepIndex,
  focusStepLabel,
  focusVideoSteps,
  lessonBlockCopy,
  notesPreview,
  techniqueInsertIndex,
} from './focusLayout.ts';
import { addLessonTechnique } from './lessonTemplates.ts';
import { emptyPlan } from './trainingNotesStore.ts';

test('Add technique sits with the other techniques, before Specific and Closing', () => {
  const adult = applyLessonTemplate(emptyPlan(), 'adult');
  const blocks = lessonBlocks(adult);
  assert.equal(techniqueInsertIndex(blocks), blocks.findIndex((block) => block.kind === 'specific'));

  const next = addLessonTechnique(adult);
  const kinds = lessonBlocks(next).map((block) => block.kind);
  const lastTechnique = kinds.lastIndexOf('technique');
  assert.equal(kinds.filter((kind) => kind === 'technique').length, 4);
  assert.ok(lastTechnique < kinds.indexOf('specific'));
  assert.ok(lastTechnique < kinds.indexOf('cooldown'));
  assert.ok(lastTechnique < kinds.indexOf('closing'));
  assert.equal(kinds.at(-1), 'closing');
});

test('a technique added after Closing still inserts before Closing', () => {
  const adult = applyLessonTemplate(emptyPlan(), 'adult');
  const blocks = lessonBlocks(adult);
  const closing = blocks.findIndex((block) => block.kind === 'closing');
  const misplaced = [...blocks];
  const [firstTechnique] = misplaced.splice(
    misplaced.findIndex((block) => block.kind === 'technique'),
    1,
  );
  misplaced.splice(closing, 0, firstTechnique);
  assert.ok(techniqueInsertIndex(misplaced) <= misplaced.findIndex((block) => block.kind === 'specific'));
});

test('the focus stepper walks warm-up, techniques, and cool down in teaching order', () => {
  const plan = applyLessonTemplate(emptyPlan(), 'adult');
  plan.techniques[0].title = 'Closed guard frames';
  plan.techniques[0].notes = 'Lock closed guard, then walk your hips off the line.';
  const steps = focusVideoSteps(lessonBlocks(plan));
  assert.deepEqual(
    steps.map((step) => step.kind),
    ['warmup', 'technique', 'technique', 'technique', 'cooldown'],
  );
  const index = defaultFocusStepIndex(steps);
  assert.equal(steps[index]?.kind, 'technique');
  assert.equal(focusStepLabel(steps[index] ?? null, 3), 'Technique 1 of 3');
  assert.equal(focusStepLabel(steps[0] ?? null, 3), 'Warm-up');
  assert.equal(focusStepLabel(steps.at(-1) ?? null, 3), 'Cool down');
  const copy = lessonBlockCopy(plan, lessonBlocks(plan)[steps[index]?.blockIndex ?? 0]);
  assert.equal(copy.title, 'Closed guard frames');
  assert.match(copy.notes, /walk your hips/);
});

test('notes preview keeps two or three lines and marks a longer note', () => {
  assert.deepEqual(notesPreview('  Short note.  '), { text: 'Short note.', clipped: false });
  const long = 'Lock closed guard, then walk your hips off the line. High underhook on the passing-side arm, opposite knee to the mat. Finish with a hip escape each side.';
  const preview = notesPreview(long, 80);
  assert.equal(preview.clipped, true);
  assert.ok(preview.text.endsWith('…'));
  assert.ok(preview.text.length < long.length);
});
