import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { coachPlanRecordDocument, coachPlanRecordFileName, exportCoachPlanToOwnDrive } from './coachPlanExport.ts';
import { emptyPlan, type TrainingNotesPlan } from './trainingNotesStore.ts';

test('coach plan export is text for the coach and skips video bytes', () => {
  const plan = emptyPlan();
  plan.coachName = 'Alex';
  plan.intro = 'Grip fight';
  plan.classDesignation = 'GB1';
  const withBlob = coachPlanRecordDocument({
    dateKey: '2026-09-30',
    savedAt: 10,
    plan: { ...plan, blob: new Blob([1, 2, 3]) } as TrainingNotesPlan,
  });
  assert.equal(withBlob.advantage, 'coach-plan');
  assert.equal(withBlob.purpose, 'self');
  assert.equal(withBlob.plan.intro, 'Grip fight');
  assert.equal(withBlob.plan.coachName, 'Alex');
  assert.equal('blob' in withBlob.plan, false);
  assert.equal('media' in withBlob, false);
  const json = JSON.stringify(withBlob);
  assert.equal(json.includes('blob'), false);
  assert.equal(json.includes('distribution'), false);
  assert.doesNotMatch(json, /video\/mp4|instructor distribution/i);
  const name = coachPlanRecordFileName('2026-09-30', plan);
  assert.match(name, /^advantage-coach-plan-2026-09-30-alex-/);
  assert.doesNotMatch(name, /advantage-lesson-/);
});

test('coach plan export asks to connect when Drive is not connected', async () => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  const result = await exportCoachPlanToOwnDrive({ dateKey: '2026-09-30', plan: emptyPlan() });
  assert.equal(result.status, 'needs-drive');
});

test('Coach Daily Lesson Plan page keeps gallery download on Pro only', () => {
  const source = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  assert.match(source, /coachLessonGalleryDownload\(proSuite\)/);
  assert.match(source, /COACH_LESSON_EYEBROW/);
  assert.match(source, /<CoachPlanExport/);
  assert.match(source, /OpenMyDrive/);
  assert.doesNotMatch(source, /14 days/);
  assert.doesNotMatch(source, /Nothing in the shared gallery/);
  assert.doesNotMatch(source, /Gym Owner and Instructors Console/);
  const downloadAt = source.indexOf('{DOWNLOAD_TODAY_LABEL}');
  const gateAt = source.indexOf('coachLessonGalleryDownload(proSuite)');
  assert.ok(gateAt >= 0 && downloadAt > gateAt);
});
