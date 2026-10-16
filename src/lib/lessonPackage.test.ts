import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lessonDocumentFromPlainText,
  lessonDocumentFromUnknown,
  parseLessonPayload,
  preferLessonDocuments,
} from './lessonPackage.ts';
import { emptyPlan } from './trainingNotesStore.ts';

test('versioned lesson JSON restores title, notes, and the linked video', () => {
  const plan = emptyPlan();
  plan.lessonTitle = 'Guard passing';
  plan.techniques[0].title = 'Knee cut';
  plan.techniques[0].notes = 'Keep the knee heavy';
  const raw = {
    advantage: 'lesson-plan',
    version: 1,
    date: '2026-10-11',
    coachName: 'Justin',
    savedAt: 4,
    kind: 'draft',
    distributedAt: null,
    plan,
    media: [
      {
        section: 'technique',
        index: 0,
        localClipId: 'clip-1',
        driveFileId: 'file-1',
        name: 'KneeCut.mp4',
        mime: 'video/mp4',
      },
    ],
  };
  const doc = parseLessonPayload(`\uFEFF${JSON.stringify(raw, null, 2)}`);
  assert.equal(doc?.version, 1);
  assert.equal(doc?.advantage, 'lesson-plan');
  assert.equal(doc?.plan.lessonTitle, 'Guard passing');
  assert.equal(doc?.plan.techniques[0].notes, 'Keep the knee heavy');
  assert.equal(doc?.media[0]?.driveFileId, 'file-1');
  assert.equal(parseLessonPayload('{"advantage":"lesson-plan","version":2}'), null);
});

test('a coach export and a review packet become the same lesson package', () => {
  const plan = emptyPlan();
  plan.lessonTitle = 'Sweep series';
  plan.intro = 'Start seated';
  plan.techniques[0].title = 'Scissor sweep';
  const coach = lessonDocumentFromUnknown({
    advantage: 'coach-plan',
    version: 1,
    date: '2026-10-10',
    coachName: 'Alex',
    savedAt: 2,
    purpose: 'self',
    plan,
  });
  assert.equal(coach?.plan.lessonTitle, 'Sweep series');
  assert.equal(coach?.plan.intro, 'Start seated');
  assert.equal(coach?.media.length, 0);

  const review = lessonDocumentFromUnknown({
    version: 1,
    kind: 'review',
    updatedAt: 9,
    submission: {
      dateKey: '2026-10-10',
      coachName: 'Alex',
      submittedAt: 9,
      plan,
    },
  });
  assert.equal(review?.plan.techniques[0].title, 'Scissor sweep');
  assert.equal(review?.savedAt, 9);
  const newest = preferLessonDocuments([[coach!], [review!]]);
  assert.equal(newest.length, 1);
  assert.equal(newest[0]?.savedAt, 9);
});

test('older labeled text keeps the technique note and the Drive video id', () => {
  const doc = lessonDocumentFromPlainText(
    [
      'date: 2026-10-11',
      'coach: Justin',
      'title: Tomorrow',
      'class: GB1',
      'time: 5:00 PM',
      'warmup: Shrimping',
      'technique: Armbar',
      'notes: Finish on the far shoulder',
      'closing: Bow',
      'video: Armbar.mp4 | drive-armbar | technique | 0',
    ].join('\n'),
  );
  assert.equal(doc?.plan.lessonTitle, 'Tomorrow');
  assert.equal(doc?.plan.classTime, '5:00 PM');
  assert.equal(doc?.plan.warmupNote, 'Shrimping');
  assert.equal(doc?.plan.closing, 'Bow');
  assert.equal(doc?.plan.techniques[0].title, 'Armbar');
  assert.equal(doc?.plan.techniques[0].notes, 'Finish on the far shoulder');
  assert.equal(doc?.media[0]?.driveFileId, 'drive-armbar');
  assert.equal(lessonDocumentFromPlainText('Just a paragraph about class.'), null);
  assert.equal(parseLessonPayload(''), null);
});
