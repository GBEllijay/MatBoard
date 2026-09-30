import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISTRIBUTE_BUTTON,
  DISTRIBUTE_DONE,
  DISTRIBUTE_LEAD,
  LESSON_DRIVE_QUEUE_KEY,
  OWNER_DRIVE_BODY,
  assignDriveFileId,
  commitDayPackage,
  drivePackageNotice,
  driveVideoProgressLabel,
  flushLessonDriveDraft,
  lessonPlanForDrive,
  lessonRevisionLabel,
  markLessonDistribution,
  markRevisionSaved,
  mediaRefsFromVideoPlan,
  mediaWithPlanDriveIds,
  pendingTrainingVideos,
  recordLessonRevision,
  scheduleLessonDriveDraft,
  stampDriveIds,
  syncTodayTrainingVideos,
  trainingClipStayCopy,
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
  const distributionId = queue.find((row) => row.kind === 'distribution')?.revisionId ?? '';
  assert.match(distributionId, /^distribution:2026-09-27:alex:/);
  const saved = markRevisionSaved(queue, distributionId, 'drive-plan-1');
  assert.equal(saved.find((row) => row.kind === 'distribution')?.status, 'saved-to-drive');
  assert.equal(saved.find((row) => row.kind === 'distribution')?.driveFileId, 'drive-plan-1');
  assert.equal(JSON.stringify(queue).includes('blob'), false);
  assert.match(lessonRevisionLabel(queue[0]), /Alex · 2026-09-27 · Draft/);
  assert.match(OWNER_DRIVE_BODY, /training-videos folder/);
  assert.match(OWNER_DRIVE_BODY, /offline play/);
  assert.match(OWNER_DRIVE_BODY, /does not host the photos or videos/);
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
  assert.equal(draft?.plan.classDesignation, '');
  assert.equal(draft?.plan.classTime, '');
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

test('two classes on one day stay separate drafts and keep designation and time', () => {
  storage.clear();
  const first = emptyPlan();
  first.coachName = 'Justin';
  first.classDesignation = 'GB1';
  first.classTime = '5:00 PM';
  first.intro = 'Guard';
  const second = emptyPlan();
  second.coachName = 'Justin';
  second.classDesignation = 'GB2';
  second.classTime = '6:00 PM';
  second.intro = 'Mount';
  const driven = lessonPlanForDrive({ ...first, blob: new Blob(['nope']) } as TrainingNotesPlan);
  assert.equal(driven.classDesignation, 'GB1');
  assert.equal(driven.classTime, '5:00 PM');
  assert.equal(driven.id, first.id);
  assert.equal('blob' in driven, false);

  let queue = recordLessonRevision([], {
    dateKey: '2026-09-27',
    coachName: 'Justin',
    savedAt: 1,
    kind: 'draft',
    plan: first,
    media: [],
  });
  queue = recordLessonRevision(queue, {
    dateKey: '2026-09-27',
    coachName: 'Justin',
    savedAt: 2,
    kind: 'draft',
    plan: second,
    media: [],
  });
  queue = recordLessonRevision(queue, {
    dateKey: '2026-09-27',
    coachName: 'Justin',
    savedAt: 3,
    kind: 'draft',
    plan: { ...first, intro: 'Guard updated' },
    media: [],
  });
  assert.equal(queue.length, 2);
  assert.equal(queue.find((row) => row.plan.id === first.id)?.plan.intro, 'Guard updated');
  assert.equal(queue.find((row) => row.plan.id === first.id)?.plan.classTime, '5:00 PM');
  assert.equal(queue.find((row) => row.plan.id === second.id)?.plan.classDesignation, 'GB2');
  const gb1 = queue.find((row) => row.plan.id === first.id);
  assert.ok(gb1);
  assert.match(lessonRevisionLabel(gb1), /Justin · GB1 5:00 PM · 2026-09-27 · Draft/);

  scheduleLessonDriveDraft({
    proSuite: true,
    dateKey: '2026-09-27',
    coachName: 'Justin',
    plan: second,
    media: [],
  });
  const flushed = flushLessonDriveDraft();
  assert.equal(flushed?.plan.classDesignation, 'GB2');
  assert.equal(flushed?.plan.classTime, '6:00 PM');
  assert.equal(flushed?.plan.intro, 'Mount');
});

test('Daily Training copy stays on the phone until Drive is connected', () => {
  assert.equal(
    trainingClipStayCopy({ proSuite: false, driveConnected: false }),
    'Clips stay on this device. Nothing is uploaded.',
  );
  assert.match(trainingClipStayCopy({ proSuite: true, driveConnected: false }), /until Google Drive is connected/);
  assert.match(trainingClipStayCopy({ proSuite: true, driveConnected: true }), /offline play/);
  assert.match(trainingClipStayCopy({ proSuite: true, driveConnected: true }), /gym Google Drive folder/);
  assert.equal(driveVideoProgressLabel(0, 3), 'Uploading 1 of 3 videos to Google Drive…');
  assert.equal(driveVideoProgressLabel(2, 3), 'Uploading 2 of 3 videos to Google Drive…');
  assert.match(
    drivePackageNotice({ lessonSaved: true, revisions: 1, uploaded: 0, failed: 1, unreachable: false }),
    /Lesson text saved to Google Drive\. 1 video stays on this phone/,
  );
  assert.match(
    drivePackageNotice({ lessonSaved: true, revisions: 2, uploaded: 1, failed: 0, unreachable: false }),
    /1 video is in the gym folder/,
  );
  assert.match(
    drivePackageNotice({ lessonSaved: false, revisions: 1, uploaded: 0, failed: 1, unreachable: true }),
    /Until then, videos stay on this device/,
  );
});

test('a known Drive id is not uploaded again, and an empty blob is skipped', () => {
  const plan = setSlotClip(emptyVideoPlan(), 'tech-1', 'clip-1', {
    driveFileId: 'drive-abc',
    mediaName: 'Armbar.mp4',
    mediaMime: 'video/mp4',
  });
  const media = mediaRefsFromVideoPlan(plan).map((item) => ({ ...item, driveFileId: null }));
  const known = mediaWithPlanDriveIds(media, plan);
  assert.equal(known[0]?.driveFileId, 'drive-abc');
  const bytes = new Blob(['already-there']);
  assert.deepEqual(
    pendingTrainingVideos(known, [{ id: 'clip-1', blob: bytes, mime: 'video/mp4', label: 'Armbar' }]),
    [],
  );
  const fresh = mediaWithPlanDriveIds(mediaRefsFromVideoPlan(setSlotClip(emptyVideoPlan(), 'tech-1', 'clip-2', {
    driveFileId: null,
    mediaName: 'Empty.mp4',
    mediaMime: 'video/mp4',
  })), null);
  assert.deepEqual(
    pendingTrainingVideos(fresh, [{ id: 'clip-2', blob: new Blob([]), mime: 'video/mp4', label: 'Empty' }]),
    [],
  );
  syncTodayTrainingVideos(plan, false);
});

test('day package uploads video bytes to Drive and still saves lesson text when a video fails', async () => {
  const plan = samplePlan();
  const videoPlan = setSlotClip(emptyVideoPlan(), 'tech-1', 'clip-1', {
    driveFileId: null,
    mediaName: 'Armbar.mp4',
    mediaMime: 'video/mp4',
  });
  const media = mediaRefsFromVideoPlan(videoPlan);
  const marker = 'VIDEO-BYTES-MARKER';
  const bytes = new Blob([marker]);
  const clips = [{ id: 'clip-1', blob: bytes, mime: 'video/mp4', label: 'Armbar' }];
  const docs: { intro: string; driveFileId: string | null }[] = [];

  const saved = await commitDayPackage({
    dateKey: '2026-09-28',
    kind: 'draft',
    coachName: 'Alex',
    savedAt: 10,
    plan,
    media,
    videoPlan,
    clips,
    onProgress: () => undefined,
    uploadVideos: async (videos) => {
      assert.equal(videos.length, 1);
      assert.equal(videos[0]?.bytes, bytes);
      return [{ localClipId: 'clip-1', driveFileId: 'drive-video-1', failed: false }];
    },
    publishLesson: async (document) => {
      docs.push({
        intro: document.plan.intro,
        driveFileId: document.media[0]?.driveFileId ?? null,
      });
      assert.equal(JSON.stringify(document).includes(marker), false);
      return { fileId: 'lesson-1', revisions: docs.length };
    },
  });

  assert.deepEqual(docs, [
    { intro: 'Grip fight', driveFileId: null },
    { intro: 'Grip fight', driveFileId: 'drive-video-1' },
  ]);
  assert.equal(saved.lessonSaved, true);
  assert.equal(saved.videoPlan?.slots.find((slot) => slot.slotId === 'tech-1')?.driveFileId, 'drive-video-1');
  assert.equal(saved.videoPlan?.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, 'clip-1');
  assert.equal(bytes, clips[0]?.blob);
  assert.equal(saved.notice.phase, 'saved-drive');

  const failedDocs: string[] = [];
  const failed = await commitDayPackage({
    dateKey: '2026-09-28',
    kind: 'draft',
    coachName: 'Alex',
    savedAt: 11,
    plan,
    media,
    videoPlan,
    clips,
    uploadVideos: async () => [{ localClipId: 'clip-1', driveFileId: null, failed: true }],
    publishLesson: async (document) => {
      failedDocs.push(document.plan.intro);
      return { fileId: 'lesson-1', revisions: 1 };
    },
  });
  assert.deepEqual(failedDocs, ['Grip fight']);
  assert.equal(failed.failed, 1);
  assert.equal(failed.lessonSaved, true);
  assert.equal(failed.videoPlan?.slots.find((slot) => slot.slotId === 'tech-1')?.driveFileId, null);
  assert.equal(failed.videoPlan?.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, 'clip-1');
  assert.match(failed.notice.text, /Lesson text saved to Google Drive/);
  assert.equal(failed.notice.phase, 'error');

  const stamped = stampDriveIds(videoPlan, [{ localClipId: 'clip-1', driveFileId: 'drive-video-1' }]);
  assert.equal(stamped.slots.find((slot) => slot.slotId === 'tech-1')?.clipId, 'clip-1');
  const pending = pendingTrainingVideos(mediaWithPlanDriveIds(media, stamped), clips);
  assert.deepEqual(pending, []);
});
