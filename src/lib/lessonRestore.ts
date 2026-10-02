/**
 * Open a previous Pro day from the gym Google Drive folder.
 *
 * Class History lists `{date}` folders. Open this class reads
 * `{date}/lesson-plans/` and `{date}/training-videos/`, writes the lesson
 * text back onto this phone, and keeps a local copy of each video so Daily
 * Training Videos can play offline. Drive file ids stay the reference.
 * Advantage does not host the bytes. Google Photos stays the phone gallery
 * source. Drive is an extra place to reopen a saved class day.
 */

import { parallelVideoSlot } from './lessonLinks.ts';
import type { DriveDayPackage, DriveFileMeta, DriveLessonDocument, DriveLessonMedia } from './googleDrive.ts';
import {
  emptyVideoPlan,
  insertTechniqueSlot,
  MAX_TECHNIQUE_SLOTS,
  nextTechniqueSlotId,
  selectSlot,
  setSlotClip,
  type VideoPlan,
} from './techniqueLogic.ts';
import {
  isWithinRetention,
  planHasContent,
  sanitizePlan,
  type TrainingNotesPlan,
} from './trainingNotesStore.ts';
import { UNLIMITED_LESSON_VALUE } from './productNames.ts';

export const OPEN_THIS_CLASS_LABEL = 'Open this class';
export const OPEN_DRIVE_CLASS_LABEL = 'Open a class from Google Drive';
export const RESTORE_OPENING = 'Opening this class…';
export const RESTORE_EMPTY =
  'This day has no lesson plan or training videos in the gym Google Drive folder.';
export const RESTORE_READY =
  'This class is on the Daily Lesson Plan. Its training videos are on Daily Training Videos. They stay in Google Drive, and this phone keeps a copy for offline play.';
export const RESTORE_TODAY =
  'This day is older than this phone keeps. The class is on today so you can run it. Its training videos are on Daily Training Videos. They stay in Google Drive, and this phone keeps a copy.';
export const RESTORE_LESSON_ONLY =
  'The lesson plan is on this phone. This day has no training videos in Google Drive.';
export const RESTORE_VIDEOS_ONLY =
  'Training videos from that day are on Daily Training Videos. This phone keeps a copy. That folder had no lesson plan.';

export type RestoredVideoRef = {
  driveFileId: string;
  name: string;
  mime: string;
  section: 'warmup' | 'technique' | 'cooldown';
  index: number | null;
};

export type RestoredLessonPlacement = {
  dateKey: string;
  plans: TrainingNotesPlan[];
  placedOnToday: boolean;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function restoredLessonPath(dateKey: string): string {
  const params = new URLSearchParams();
  params.set('plan', UNLIMITED_LESSON_VALUE);
  if (DATE_KEY.test(dateKey)) params.set('date', dateKey);
  return `/notes?${params.toString()}`;
}

export function restoredDayKey(
  requested: string | null | undefined,
  todayKey: string,
  hasPlans: (dateKey: string) => boolean,
): string {
  const dateKey = requested?.trim() ?? '';
  if (!DATE_KEY.test(dateKey) || !DATE_KEY.test(todayKey)) return todayKey;
  if (!isWithinRetention(dateKey, todayKey)) return todayKey;
  if (!hasPlans(dateKey)) return todayKey;
  return dateKey;
}

export function restoreNoticeFromState(state: unknown): string {
  if (!state || typeof state !== 'object') return '';
  const text = (state as { driveRestoreNotice?: unknown }).driveRestoreNotice;
  return typeof text === 'string' ? text : '';
}

function driveRestorePlanId(dateKey: string, planId: string): string {
  const raw = `drive-${dateKey}-${planId}`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
  return raw || `drive-${dateKey}`;
}

export function restoredLessonPlacement(input: {
  todayKey: string;
  dateKey: string;
  lessons: readonly DriveLessonDocument[];
}): RestoredLessonPlacement | null {
  if (!DATE_KEY.test(input.dateKey) || !DATE_KEY.test(input.todayKey)) return null;
  const placedOnToday = !isWithinRetention(input.dateKey, input.todayKey);
  const dateKey = placedOnToday ? input.todayKey : input.dateKey;
  const plans: TrainingNotesPlan[] = [];
  for (const lesson of input.lessons) {
    if (lesson.date !== input.dateKey) continue;
    const source = lesson.plan;
    const id = placedOnToday ? driveRestorePlanId(input.dateKey, source.id) : source.id;
    const { plan } = sanitizePlan({ ...source, id });
    if (!planHasContent(plan)) continue;
    plans.push(plan);
  }
  if (!plans.length) return null;
  return { dateKey, plans, placedOnToday };
}

function videoFile(file: DriveFileMeta): boolean {
  return file.mimeType.toLowerCase().startsWith('video/') && Boolean(file.id);
}

/**
 * Newest lesson wins a slot. Training videos that the lesson does not name
 * fill the next open technique card, in name order.
 */
export function restoredVideoRefs(input: {
  lessons: readonly { savedAt: number; media: readonly DriveLessonMedia[] }[];
  videos: readonly DriveFileMeta[];
}): RestoredVideoRef[] {
  const videos = input.videos.filter(videoFile);
  const byId = new Map(videos.map((file) => [file.id, file]));
  const byClip = new Map<string, DriveFileMeta>();
  for (const file of videos) {
    const clipId = file.appProperties?.localClipId?.trim() ?? '';
    if (clipId && !byClip.has(clipId)) byClip.set(clipId, file);
  }
  const placed = new Map<string, RestoredVideoRef>();
  const used = new Set<string>();
  let nextTechnique = 0;

  const place = (
    driveFileId: string,
    section: RestoredVideoRef['section'],
    index: number | null,
    name: string,
    mime: string,
  ) => {
    if (!driveFileId || used.has(driveFileId)) return;
    let slotIndex = index;
    if (section === 'technique' && (slotIndex == null || slotIndex < 0)) {
      while (placed.has(`technique:${nextTechnique}`)) nextTechnique += 1;
      slotIndex = nextTechnique;
    }
    const key = section === 'technique' ? `technique:${slotIndex}` : section;
    if (placed.has(key) || (section === 'technique' && (slotIndex == null || slotIndex >= MAX_TECHNIQUE_SLOTS))) {
      used.add(driveFileId);
      return;
    }
    used.add(driveFileId);
    placed.set(key, {
      driveFileId,
      name,
      mime,
      section,
      index: section === 'technique' ? slotIndex : null,
    });
    if (section === 'technique' && slotIndex != null && slotIndex >= nextTechnique) {
      nextTechnique = slotIndex + 1;
    }
  };

  const lessons = [...input.lessons].sort((a, b) => b.savedAt - a.savedAt);
  for (const lesson of lessons) {
    for (const media of lesson.media) {
      const fromId = media.driveFileId ? byId.get(media.driveFileId) : undefined;
      const fromClip = media.localClipId ? byClip.get(media.localClipId) : undefined;
      const file = fromId ?? fromClip ?? null;
      const driveFileId = file?.id || media.driveFileId || '';
      if (!driveFileId) continue;
      const mime = (file?.mimeType || media.mime || 'video/mp4').toLowerCase();
      if (!mime.startsWith('video/')) continue;
      place(driveFileId, media.section, media.index, file?.name || media.name || 'Video', mime);
    }
  }

  const extras = videos
    .filter((file) => !used.has(file.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  for (const file of extras) {
    while (placed.has(`technique:${nextTechnique}`)) nextTechnique += 1;
    if (nextTechnique >= MAX_TECHNIQUE_SLOTS) break;
    place(file.id, 'technique', nextTechnique, file.name, file.mimeType.toLowerCase());
  }

  return [...placed.values()].sort((a, b) => {
    const rank = (section: RestoredVideoRef['section']) =>
      section === 'warmup' ? 0 : section === 'technique' ? 1 : 2;
    const section = rank(a.section) - rank(b.section);
    if (section !== 0) return section;
    return (a.index ?? 0) - (b.index ?? 0);
  });
}

export function videoPlanFromRestoredClips(
  clips: readonly (RestoredVideoRef & { clipId: string })[],
): VideoPlan {
  const needed = clips.reduce((max, clip) => {
    if (clip.section !== 'technique' || clip.index == null) return max;
    return Math.max(max, clip.index + 1);
  }, 0);
  let plan = emptyVideoPlan();
  const target = Math.min(MAX_TECHNIQUE_SLOTS, Math.max(needed, plan.slots.filter((slot) => slot.kind === 'technique').length));
  while (plan.slots.filter((slot) => slot.kind === 'technique').length < target) {
    const next = insertTechniqueSlot(plan, nextTechniqueSlotId(plan));
    if (!next) break;
    plan = next;
  }
  for (const clip of clips) {
    const ref =
      clip.section === 'technique'
        ? ({ role: 'technique', index: clip.index ?? 0 } as const)
        : ({ role: clip.section } as const);
    const slot = parallelVideoSlot(plan, ref);
    if (!slot) continue;
    plan = setSlotClip(plan, slot.slotId, clip.clipId, {
      driveFileId: clip.driveFileId,
      mediaName: clip.name,
      mediaMime: clip.mime,
    });
  }
  const selected = plan.slots.find((slot) => slot.clipId)?.slotId ?? plan.selectedSlotId;
  return selectSlot(plan, selected);
}

function videoMissCopy(failed: number): string {
  if (failed <= 0) return '';
  return failed === 1
    ? ' 1 video could not be copied and stays in Google Drive.'
    : ` ${failed} videos could not be copied and stay in Google Drive.`;
}

export function restoreDriveDayNotice(input: {
  plans: number;
  placedOnToday: boolean;
  videoRefs: number;
  cached: number;
  failed: number;
}): string {
  const miss = videoMissCopy(input.failed);
  if (input.plans > 0 && input.videoRefs === 0) {
    return input.placedOnToday
      ? 'This day is older than this phone keeps. The class is on today so you can run it. This day has no training videos in Google Drive.'
      : RESTORE_LESSON_ONLY;
  }
  if (input.plans > 0) {
    const base = input.placedOnToday ? RESTORE_TODAY : RESTORE_READY;
    return `${base}${miss}`;
  }
  if (input.cached > 0) return `${RESTORE_VIDEOS_ONLY}${miss}`;
  return RESTORE_EMPTY;
}

export type RestoreDriveDayResult = {
  ok: boolean;
  path: string | null;
  notice: string;
};

/**
 * Write the day back onto this phone. Callers pass the Drive download and the
 * on-device stores. A video that fails to copy does not drop the lesson text.
 */
export async function restoreDriveDay(input: {
  todayKey: string;
  pack: DriveDayPackage;
  downloadVideo: (fileId: string) => Promise<Blob>;
  savePlan: (dateKey: string, plan: TrainingNotesPlan, todayKey: string) => void;
  storeClip: (clip: {
    driveFileId: string;
    blob: Blob | null;
    mime: string;
    label: string;
  }) => Promise<string | null>;
  saveVideoPlan: (plan: VideoPlan) => Promise<void>;
}): Promise<RestoreDriveDayResult> {
  const placement = restoredLessonPlacement({
    todayKey: input.todayKey,
    dateKey: input.pack.dateKey,
    lessons: input.pack.lessons,
  });
  if (placement) {
    for (const plan of placement.plans) {
      input.savePlan(placement.dateKey, plan, input.todayKey);
    }
  }
  const refs = restoredVideoRefs({ lessons: input.pack.lessons, videos: input.pack.videos });
  const cached: (RestoredVideoRef & { clipId: string })[] = [];
  let failed = 0;
  for (const ref of refs) {
    let clipId = await input.storeClip({
      driveFileId: ref.driveFileId,
      blob: null,
      mime: ref.mime,
      label: ref.name,
    });
    if (!clipId) {
      try {
        const blob = await input.downloadVideo(ref.driveFileId);
        clipId = await input.storeClip({
          driveFileId: ref.driveFileId,
          blob,
          mime: ref.mime,
          label: ref.name,
        });
      } catch {
        clipId = null;
      }
    }
    if (!clipId) {
      failed += 1;
      continue;
    }
    cached.push({ ...ref, clipId });
  }
  if (cached.length > 0) {
    await input.saveVideoPlan(videoPlanFromRestoredClips(cached));
  }
  const notice = restoreDriveDayNotice({
    plans: placement?.plans.length ?? 0,
    placedOnToday: placement?.placedOnToday ?? false,
    videoRefs: refs.length,
    cached: cached.length,
    failed,
  });
  if (!placement && cached.length === 0) return { ok: false, path: null, notice };
  const dateKey = placement?.dateKey ?? input.todayKey;
  const path = placement ? restoredLessonPath(dateKey) : '/techniques';
  return { ok: true, path, notice };
}
