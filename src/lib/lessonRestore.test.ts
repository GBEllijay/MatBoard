import assert from 'node:assert/strict';
import test from 'node:test';
import type { DriveFileMeta, DriveLessonDocument } from './googleDrive.ts';
import {
  OPEN_DRIVE_CLASS_LABEL,
  OPEN_THIS_CLASS_LABEL,
  RESTORE_EMPTY,
  RESTORE_LESSON_ONLY,
  RESTORE_READY,
  restoreDriveDay,
  restoreNoticeFromState,
  restoredDayKey,
  restoredLessonPath,
  restoredLessonPlacement,
  restoredVideoRefs,
  videoPlanFromRestoredClips,
} from './lessonRestore.ts';
import { COOLDOWN_SLOT_ID, WARMUP_SLOT_ID } from './techniqueLogic.ts';
import { emptyPlan, localDateKey, shiftDateKey } from './trainingNotesStore.ts';

const TODAY = '2026-10-02';

function lesson(input: {
  id: string;
  title: string;
  savedAt: number;
  date?: string;
  media?: DriveLessonDocument['media'];
}): DriveLessonDocument {
  const plan = emptyPlan();
  plan.id = input.id;
  plan.coachName = 'Alex';
  plan.intro = 'Grip fight';
  plan.techniques[0].title = input.title;
  return {
    advantage: 'lesson-plan',
    version: 1,
    date: input.date ?? '2026-10-01',
    coachName: 'Alex',
    savedAt: input.savedAt,
    kind: 'draft',
    distributedAt: null,
    plan,
    media: input.media ?? [],
  };
}

function video(id: string, name: string, localClipId?: string): DriveFileMeta {
  return {
    id,
    name,
    mimeType: 'video/mp4',
    appProperties: localClipId ? { localClipId } : undefined,
  };
}

test('Open this class keeps yesterday on that date and an older day on today', () => {
  assert.equal(OPEN_THIS_CLASS_LABEL, 'Open this class');
  assert.equal(OPEN_DRIVE_CLASS_LABEL, 'Open a class from Google Drive');
  assert.equal(restoredLessonPath('2026-10-01'), '/notes?plan=unlimited&date=2026-10-01');
  assert.doesNotMatch(restoredLessonPath('2026-10-01'), /photos\.google|icloud/i);

  const yesterday = lesson({ id: 'plan-gb1', title: 'Armbar', savedAt: 2 });
  const placed = restoredLessonPlacement({
    todayKey: TODAY,
    dateKey: '2026-10-01',
    lessons: [yesterday],
  });
  assert.equal(placed?.placedOnToday, false);
  assert.equal(placed?.dateKey, '2026-10-01');
  assert.equal(placed?.plans[0]?.id, 'plan-gb1');
  assert.equal(placed?.plans[0]?.techniques[0].title, 'Armbar');

  const old = lesson({ id: 'plan-old', title: 'Sweep', savedAt: 1, date: '2026-08-01' });
  const forwarded = restoredLessonPlacement({
    todayKey: TODAY,
    dateKey: '2026-08-01',
    lessons: [old],
  });
  assert.equal(forwarded?.placedOnToday, true);
  assert.equal(forwarded?.dateKey, TODAY);
  assert.equal(forwarded?.plans[0]?.id, 'drive-2026-08-01-plan-old');
  assert.equal(forwarded?.plans[0]?.intro, 'Grip fight');

  assert.equal(
    restoredDayKey('2026-10-01', TODAY, (key) => key === '2026-10-01'),
    '2026-10-01',
  );
  assert.equal(restoredDayKey('2026-08-01', TODAY, () => true), TODAY);
  assert.equal(restoredDayKey('2026-10-01', TODAY, () => false), TODAY);
  assert.equal(restoreNoticeFromState({ driveRestoreNotice: RESTORE_READY }), RESTORE_READY);
  assert.equal(restoreNoticeFromState(null), '');
  assert.equal(localDateKey(new Date(2026, 9, 2)), TODAY);
  assert.equal(shiftDateKey(TODAY, -1), '2026-10-01');
});

test('training videos land on the matching cards, newest lesson first', () => {
  const older = lesson({
    id: 'old',
    title: 'Old',
    savedAt: 1,
    media: [
      {
        section: 'technique',
        index: 0,
        localClipId: 'clip-old',
        driveFileId: 'file-old',
        name: 'Old.mp4',
        mime: 'video/mp4',
      },
    ],
  });
  const newer = lesson({
    id: 'new',
    title: 'New',
    savedAt: 5,
    media: [
      {
        section: 'warmup',
        index: null,
        localClipId: 'clip-warm',
        driveFileId: null,
        name: 'Warm.mp4',
        mime: 'video/mp4',
      },
      {
        section: 'technique',
        index: 0,
        localClipId: null,
        driveFileId: 'file-new',
        name: 'New.mp4',
        mime: 'video/mp4',
      },
    ],
  });
  const refs = restoredVideoRefs({
    lessons: [older, newer],
    videos: [
      video('file-old', 'Old.mp4', 'clip-old'),
      video('file-new', 'New.mp4'),
      video('file-warm', 'Warm.mp4', 'clip-warm'),
      video('file-extra', 'Extra.mp4'),
      { id: 'photo', name: 'Face.jpg', mimeType: 'image/jpeg' },
    ],
  });
  assert.deepEqual(
    refs.map((item) => [item.section, item.index, item.driveFileId]),
    [
      ['warmup', null, 'file-warm'],
      ['technique', 0, 'file-new'],
      ['technique', 1, 'file-extra'],
    ],
  );

  const plan = videoPlanFromRestoredClips([
    { ...refs[0], clipId: 'local-warm' },
    { ...refs[1], clipId: 'local-new' },
    { ...refs[2], clipId: 'local-extra' },
  ]);
  assert.equal(plan.slots.find((slot) => slot.slotId === WARMUP_SLOT_ID)?.clipId, 'local-warm');
  assert.equal(plan.slots.find((slot) => slot.slotId === WARMUP_SLOT_ID)?.driveFileId, 'file-warm');
  const techniques = plan.slots.filter((slot) => slot.kind === 'technique');
  assert.equal(techniques[0]?.clipId, 'local-new');
  assert.equal(techniques[0]?.driveFileId, 'file-new');
  assert.equal(techniques[1]?.driveFileId, 'file-extra');
  assert.equal(plan.slots.find((slot) => slot.slotId === COOLDOWN_SLOT_ID)?.clipId, null);
});

test('restore writes the lesson even when a video download fails, and reuses a phone copy', async () => {
  const pack = {
    dateKey: '2026-10-01',
    lessons: [
      lesson({
        id: 'plan-gb1',
        title: 'Armbar',
        savedAt: 3,
        media: [
          {
            section: 'technique',
            index: 0,
            localClipId: 'clip-1',
            driveFileId: 'file-1',
            name: 'Armbar.mp4',
            mime: 'video/mp4',
          },
          {
            section: 'cooldown',
            index: null,
            localClipId: null,
            driveFileId: 'file-miss',
            name: 'Cool.mp4',
            mime: 'video/mp4',
          },
        ],
      }),
    ],
    videos: [video('file-1', 'Armbar.mp4', 'clip-1'), video('file-miss', 'Cool.mp4')],
  };
  const saved: { dateKey: string; id: string }[] = [];
  const downloads: string[] = [];
  let videoPlanSaved = 0;
  const result = await restoreDriveDay({
    todayKey: TODAY,
    pack,
    downloadVideo: async (fileId) => {
      downloads.push(fileId);
      if (fileId === 'file-miss') throw new Error('missing');
      return new Blob(['bytes'], { type: 'video/mp4' });
    },
    savePlan: (dateKey, plan) => {
      saved.push({ dateKey, id: plan.id });
    },
    storeClip: async (clip) => {
      if (clip.driveFileId === 'file-1' && clip.blob === null) return 'already-on-phone';
      if (clip.blob === null) return null;
      return `local-${clip.driveFileId}`;
    },
    saveVideoPlan: async (plan) => {
      videoPlanSaved += 1;
      assert.equal(plan.slots.find((slot) => slot.driveFileId === 'file-1')?.clipId, 'already-on-phone');
      assert.equal(plan.slots.some((slot) => slot.driveFileId === 'file-miss'), false);
    },
  });
  assert.deepEqual(saved, [{ dateKey: '2026-10-01', id: 'plan-gb1' }]);
  assert.deepEqual(downloads, ['file-miss']);
  assert.equal(videoPlanSaved, 1);
  assert.equal(result.ok, true);
  assert.equal(result.path, '/notes?plan=unlimited&date=2026-10-01');
  assert.match(result.notice, /Daily Lesson Plan/);
  assert.match(result.notice, /1 video could not be copied/);

  const empty = await restoreDriveDay({
    todayKey: TODAY,
    pack: { dateKey: '2026-10-01', lessons: [], videos: [] },
    downloadVideo: async () => new Blob(),
    savePlan: () => undefined,
    storeClip: async () => null,
    saveVideoPlan: async () => undefined,
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.notice, RESTORE_EMPTY);

  const textOnly = await restoreDriveDay({
    todayKey: TODAY,
    pack: { dateKey: '2026-10-01', lessons: [lesson({ id: 'plan-gb1', title: 'Armbar', savedAt: 1 })], videos: [] },
    downloadVideo: async () => new Blob(),
    savePlan: () => undefined,
    storeClip: async () => null,
    saveVideoPlan: async () => {
      throw new Error('no videos to save');
    },
  });
  assert.equal(textOnly.ok, true);
  assert.equal(textOnly.notice, RESTORE_LESSON_ONLY);
});
