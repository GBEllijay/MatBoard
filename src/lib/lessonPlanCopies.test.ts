import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideLessonOpen,
  instructorLessonAccess,
  instructorLessonPath,
  lessonInstructorId,
  lessonPlanTargetOf,
  lessonSourceLabel,
  lessonTemplateWriteAllowed,
  parseInstructorLessonPath,
  readLessonSource,
  templateLessonPath,
  writeLessonSource,
} from './lessonPlanCopies.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

test('storage layout: template under lessons/current, one copy per instructor under lessons/instructors', () => {
  assert.equal(templateLessonPath('2026-11-12'), 'lessons/current/2026-W46/2026-11-12.json');
  assert.equal(instructorLessonPath('seat-a', '2026-11-12'), 'lessons/instructors/seat-a/2026-W46/2026-11-12.json');
  assert.equal(instructorLessonPath('owner', '2026-11-12'), 'lessons/instructors/owner/2026-W46/2026-11-12.json');
  assert.equal(instructorLessonPath('../x', '2026-11-12'), null);
  assert.equal(instructorLessonPath('seat-a', '2026-13-40'), null);
  assert.deepEqual(parseInstructorLessonPath('lessons/instructors/seat-a/2026-W46/2026-11-12.json'), {
    instructorId: 'seat-a',
    week: '2026-W46',
    dateKey: '2026-11-12',
  });
  assert.equal(lessonInstructorId({ kind: 'owner' }), 'owner');
  assert.equal(lessonInstructorId({ kind: 'seat', seatId: 'seat-a' }), 'seat-a');
  assert.equal(lessonInstructorId({ kind: 'seat', seatId: 'owner' }), null, 'a seat can never write the owner folder');
  assert.equal(lessonInstructorId({ kind: 'seat', seatId: '' }), null);
});

test('permissions: template is owner / Coach only; each instructor writes only their own copy', () => {
  assert.equal(lessonTemplateWriteAllowed({ kind: 'owner' }), true);
  assert.equal(lessonTemplateWriteAllowed({ kind: 'seat', preset: 'coach' }), true);
  assert.equal(lessonTemplateWriteAllowed({ kind: 'seat', preset: 'instructors' }), false);
  assert.equal(lessonTemplateWriteAllowed({ kind: 'seat', preset: 'assistant-coach' }), false);
  assert.equal(instructorLessonAccess({ kind: 'seat', seatId: 'a' }, 'a', 'write'), true);
  assert.equal(instructorLessonAccess({ kind: 'seat', seatId: 'a' }, 'b', 'write'), false);
  assert.equal(instructorLessonAccess({ kind: 'seat', seatId: 'a' }, 'b', 'read'), false);
  assert.equal(instructorLessonAccess({ kind: 'owner' }, 'b', 'read'), true);
  assert.equal(instructorLessonAccess({ kind: 'owner' }, 'b', 'write'), false);
  assert.equal(lessonPlanTargetOf(undefined), 'mine');
  assert.equal(lessonPlanTargetOf('template'), 'template');
  assert.equal(lessonPlanTargetOf('anything'), 'mine');
});

test('opening a day: my copy, else the template; local edits are kept; labels', () => {
  const T = { t: 'template' };
  const M = { t: 'mine' };
  assert.deepEqual(decideLessonOpen({ localHasContent: false, localSource: null, mine: null, template: T }), {
    action: 'adopt',
    source: 'template',
    plan: T,
  });
  assert.deepEqual(decideLessonOpen({ localHasContent: false, localSource: null, mine: M, template: T }), {
    action: 'adopt',
    source: 'mine',
    plan: M,
  });
  assert.deepEqual(decideLessonOpen({ localHasContent: true, localSource: null, mine: null, template: T }), { action: 'keep', source: 'mine' });
  assert.deepEqual(decideLessonOpen({ localHasContent: true, localSource: 'mine', mine: M, template: T }), { action: 'keep', source: 'mine' });
  // Opened from the template, never edited: follows the template when the owner updates it.
  assert.deepEqual(decideLessonOpen({ localHasContent: true, localSource: 'template', mine: null, template: T }), {
    action: 'adopt',
    source: 'template',
    plan: T,
  });
  assert.deepEqual(decideLessonOpen({ localHasContent: false, localSource: null, mine: null, template: null }), { action: 'keep', source: null });
  assert.equal(lessonSourceLabel('template'), 'Gym template');
  assert.equal(lessonSourceLabel('mine'), 'My plan');
});

test('the per-device source marker is kept per instructor', () => {
  const storage = memoryStorage();
  writeLessonSource(storage, 'seat-a', '2026-11-12', 'template');
  writeLessonSource(storage, 'owner', '2026-11-12', 'mine');
  assert.equal(readLessonSource(storage, 'seat-a', '2026-11-12'), 'template');
  assert.equal(readLessonSource(storage, 'owner', '2026-11-12'), 'mine');
  assert.equal(readLessonSource(storage, 'seat-b', '2026-11-12'), null);
  writeLessonSource(storage, 'seat-a', '2026-11-12', null);
  assert.equal(readLessonSource(storage, 'seat-a', '2026-11-12'), null);
  assert.equal(readLessonSource(storage, 'owner', '2026-11-12'), 'mine');
});
