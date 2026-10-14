/**
 * Per-class-plan video references.
 * The day's Daily Training Videos board is still one working copy.
 * Each lesson plan keeps its own refs, so switching plans shows that plan's video.
 */

import { parallelVideoSlot } from './lessonLinks.ts';
import type { LessonMediaRef } from './lessonDrive.ts';
import { setSlotClip, type VideoPlan } from './techniqueLogic.ts';
import {
  emptyPlan,
  loadTrainingArchive,
  localDateKey,
  plansOnDay,
  saveDay,
  type PlanVideoRef,
  type TrainingNotesPlan,
} from './trainingNotesStore.ts';

function sameVideos(left: readonly PlanVideoRef[] | undefined, right: readonly PlanVideoRef[]): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

/** Slot refs the lesson plan stores. A slot with no clip and no Drive id is skipped. */
export function planVideoRefsFromVideoPlan(plan: VideoPlan): PlanVideoRef[] {
  let techniqueOrdinal = 0;
  const refs: PlanVideoRef[] = [];
  for (const slot of plan.slots) {
    const index = slot.kind === 'technique' ? techniqueOrdinal : null;
    if (slot.kind === 'technique') techniqueOrdinal += 1;
    if (!slot.clipId && !slot.driveFileId) continue;
    refs.push({
      section: slot.kind,
      index,
      localClipId: slot.clipId,
      driveFileId: slot.driveFileId,
      url: null,
      name: slot.mediaName,
      mime: slot.mediaMime,
    });
  }
  return refs;
}

export function lessonMediaFromPlanVideos(refs: readonly PlanVideoRef[]): LessonMediaRef[] {
  return refs
    .filter((row) => row.localClipId || row.driveFileId)
    .map((row) => ({
      section: row.section,
      index: row.section === 'technique' ? row.index : null,
      localClipId: row.localClipId,
      driveFileId: row.driveFileId,
      name: row.name,
      mime: row.mime || 'video/mp4',
    }));
}

/**
 * Show `refs` on a video board.
 * Slots that this plan does not name are cleared in the returned plan.
 * Clip bytes are not deleted.
 */
export function videoPlanWithPlanVideos(plan: VideoPlan, refs: readonly PlanVideoRef[]): VideoPlan {
  let next = plan;
  for (const slot of plan.slots) {
    if (slot.clipId || slot.driveFileId || slot.mediaName) next = setSlotClip(next, slot.slotId, null);
  }
  for (const ref of refs) {
    if (!ref.localClipId && !ref.driveFileId) continue;
    const slot = parallelVideoSlot(
      next,
      ref.section === 'technique' ? { role: 'technique', index: ref.index ?? 0 } : { role: ref.section },
    );
    if (!slot || !ref.localClipId) continue;
    next = setSlotClip(next, slot.slotId, ref.localClipId, {
      driveFileId: ref.driveFileId,
      mediaName: ref.name,
      mediaMime: ref.mime,
    });
  }
  return next;
}

/**
 * What Daily Training Videos should show when opened from a class plan.
 * `null` means leave the day's board alone (no plan id, or a legacy plan with no refs yet).
 * An array, including empty, replaces the board with that plan's videos.
 */
export function lessonPlanVideoOverlay(
  dateKey: string,
  planId: string | null,
  today = localDateKey(),
): PlanVideoRef[] | null {
  const id = planId?.trim() ?? '';
  if (!id) return null;
  const plan = plansOnDay(loadTrainingArchive(today), dateKey).find((item) => item.id === id);
  if (!plan || !plan.videos) return plan ? null : [];
  return plan.videos;
}

/** Write this plan's video refs. Creates the plan row when the video is the first thing saved. */
export function writeLessonPlanVideos(
  dateKey: string,
  planId: string,
  refs: readonly PlanVideoRef[],
  today = localDateKey(),
): TrainingNotesPlan | null {
  const id = planId.trim();
  if (!id) return null;
  const existing = plansOnDay(loadTrainingArchive(today), dateKey).find((item) => item.id === id);
  if (existing) {
    if (sameVideos(existing.videos, refs)) return existing;
    return saveDay(dateKey, { ...existing, videos: [...refs] }, today).plan;
  }
  if (!refs.length) return null;
  const plan = emptyPlan();
  plan.id = id;
  plan.videos = [...refs];
  return saveDay(dateKey, plan, today).plan;
}

/**
 * First time a legacy plan is opened, copy the day's current videos onto it.
 * Plans that already have a list, including an empty one, stay as they are.
 */
export function adoptPlanVideos(
  dateKey: string,
  planId: string,
  refs: readonly PlanVideoRef[],
  today = localDateKey(),
): TrainingNotesPlan | null {
  const plan = plansOnDay(loadTrainingArchive(today), dateKey).find((item) => item.id === planId);
  if (!plan || plan.videos) return null;
  return saveDay(dateKey, { ...plan, videos: [...refs] }, today).plan;
}

export function lessonPlansReferencingClip(clipId: string, today = localDateKey()): boolean {
  const id = clipId.trim();
  if (!id) return false;
  const archive = loadTrainingArchive(today);
  for (const day of Object.values(archive.days)) {
    for (const plan of day.plans) {
      if (plan.videos?.some((row) => row.localClipId === id)) return true;
    }
  }
  return false;
}

export function planVideoRefFor(
  refs: readonly PlanVideoRef[] | undefined,
  section: PlanVideoRef['section'],
  index?: number,
): PlanVideoRef | null {
  if (!refs) return null;
  return (
    refs.find((row) =>
      section === 'technique' ? row.section === 'technique' && row.index === (index ?? 0) : row.section === section,
    ) ?? null
  );
}
