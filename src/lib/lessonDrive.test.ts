import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISTRIBUTE_BUTTON,
  DISTRIBUTE_DONE,
  DISTRIBUTE_LEAD,
  LESSON_DRIVE_QUEUE_KEY,
  OWNER_DRIVE_BODY,
  assignDriveFileId,
  flushLessonDriveDraft,
  lessonPlanForDrive,
  lessonRevisionLabel,
  markLessonDistribution,
  mediaRefsFromVideoPlan,
  recordLessonRevision,
  scheduleLessonDriveDraft,
} from './lessonDrive.ts';
import { emptyVideoPlan, setSlotClip } from './techniqueLogic.ts';
import { emptyPlan, type TrainingNotesPlan } from './trainingNotesStore.ts';

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

function samplePlan(): TrainingNotesPlan {
  const plan = emptyPlan();
  plan.coachName = 'Alex';
  plan.intro = 'Grip fight';
  return plan;
}

test('Drive history keeps one draft per coach per day and drops file bytes', () => {
  const plan = samplePlan();
  const withBlob = lessonPlanForDrive({ ...plan, blob: new Blob([1, 2, 3]) } as TrainingNotesPlan);
  assert.equal('blob' in withBlob, false);
  assert.equal(withBlob.intro, 'Grip fight');

  const media = [
    {
      section: 'technique' as const,
      index: 0,
      localClipId: 'clip-1',
      driveFileId: 'drive-file-1',
      name: 'Armbar.mp4',
      mime: 'video/mp4',
    },
  ];
  let queue = recordLessonRevision([], {
    dateKey: '2026-09-27',
    coachName: 'Alex',
    savedAt: 10,
    kind: 'draft',
    plan,
    media,
  });
  queue = recordLessonRevision(queue, {
    dateKey: '2026-09-27',
    coachName: 'Alex',
    savedAt: 20,
    kind: 'draft',
    plan: { ...plan, intro: 'Updated grip fight' },
    media,
  });
  queue = recordLessonRevision(queue, {
    dateKey: '2026-09-27',
    coachName: 'Blair',
    savedAt: 30,
    kind: 'draft',
    plan,
    media: [],
  });
  queue = recordLessonRevision(queue, {
    dateKey: '2026-09-27',
    coachName: 'Alex',
    savedAt: 40,
    kind: 'distribution',
    plan,
    media,
    driveFileId: 'https://advantage.example/video.mp4',
  });

  assert.equal(queue.length, 3);
  assert.equal(queue.find((row) => row.coachName === 'Alex' && row.kind === 'draft')?.savedAt, 20);
  assert.equal(queue.find((row) => row.coachName === 'Alex' && row.kind === 'draft')?.plan.intro, 'Updated grip fight');
  assert.equal(queue.find((row) => row.kind === 'distribution')?.driveFileId, null);
  assert.equal(queue.find((row) => row.kind === 'distribution')?.status, 'waiting-for-drive');
  assert.equal(JSON.stringify(queue).includes('blob'), false);
  assert.match(lessonRevisionLabel(queue[0]), /Alex · 2026-09-27 · Draft/);
  assert.match(OWNER_DRIVE_BODY, /Photos and videos stay in your Drive/);
  assert.doesNotMatch(OWNER_DRIVE_BODY, /Advantage servers host|uploaded to Advantage/i);
  assert.match(DISTRIBUTE_LEAD, /optional/i);
  assert.equal(DISTRIBUTE_BUTTON, 'Upload for instructor distribution');
  assert.match(DISTRIBUTE_DONE, /not on Advantage/);
});

test('slot media is an id and a name, and a Drive URL is refused', () => {
  const plan = setSlotClip(emptyVideoPlan(), 'tech-1', 'clip-1', {
    driveFileId: 'file-123',
    mediaName: 'Drill.mp4',
    mediaMime: 'video/mp4',
  });
  const refs = mediaRefsFromVideoPlan(plan);
  assert.deepEqual(refs, [
    {
      section: 'technique',
      index: 0,
      localClipId: 'clip-1',
      driveFileId: 'file-123',
      name: 'Drill.mp4',
      mime: 'video/mp4',
    },
  ]);
  const refused = assignDriveFileId(plan, 'tech-1', 'https://files.advantage.app/clip.mp4');
  assert.equal(refused.slots.find((slot) => slot.slotId === 'tech-1')?.driveFileId, null);
  assert.equal(refused.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, 'clip-1');
  const kept = assignDriveFileId(plan, 'tech-1', 'drive-abc');
  assert.equal(kept.slots.find((slot) => slot.slotId === 'tech-1')?.driveFileId, 'drive-abc');
});

test('regular Coach does not queue Drive, and Pro flush keeps text only', () => {
  storage.clear();
  const plan = samplePlan();
  scheduleLessonDriveDraft({
    proSuite: false,
    dateKey: '2026-09-27',
    coachName: 'Alex',
    plan,
    media: [],
  });
  assert.equal(flushLessonDriveDraft(), null);
  assert.equal(localStorage.getItem(LESSON_DRIVE_QUEUE_KEY), null);
  assert.equal(
    markLessonDistribution({
      proSuite: false,
      dateKey: '2026-09-27',
      coachName: 'Alex',
      plan,
      media: [],
    }),
    null,
  );

  scheduleLessonDriveDraft({
    proSuite: true,
    dateKey: '2026-09-27',
    coachName: 'Alex',
    plan,
    media: [],
  });
  const draft = flushLessonDriveDraft();
  assert.equal(draft?.kind, 'draft');
  assert.equal(draft?.status, 'waiting-for-drive');
  assert.equal(draft?.plan.intro, 'Grip fight');
  const shared = markLessonDistribution({
    proSuite: true,
    dateKey: '2026-09-27',
    coachName: 'Alex',
    plan,
    media: [],
  });
  assert.equal(shared?.kind, 'distribution');
  const raw = localStorage.getItem(LESSON_DRIVE_QUEUE_KEY) ?? '';
  assert.equal(raw.includes('blob'), false);
  assert.match(raw, /Grip fight/);
});
