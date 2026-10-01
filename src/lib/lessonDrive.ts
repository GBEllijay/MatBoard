/**
 * Instructor Collaboration drafts for Daily Lesson Plan.
 *
 * Locked rule: while a gym Google Drive folder is connected, every edit
 * auto-saves there in the background. Closing, navigating away, or skipping
 * the upload button must not lose the plan. "Upload for instructor
 * distribution" is a gentle optional nudge, never a gate.
 *
 * The owner reviews the week from that Drive folder's version history and
 * keeps the best of each coach's contributions for Sunday. This file is the
 * hook those writes should use.
 *
 * When this browser has connected a Google Drive folder, a debounced write
 * sends the text plan to `{folder}/{YYYY-MM-DD}/lesson-plans/` and copies
 * attached technique clips into `{folder}/{YYYY-MM-DD}/training-videos/`
 * (`googleDrive.ts`). Video bytes go only to the gym's Google Drive.
 * Regular Coach does not queue a Drive revision.
 *
 * TODO: Reopen and repopulate an older Daily Lesson Plan from the connected
 * Drive folder is not implemented. Plans already on this phone stay as saved.
 *
 * Local cache: after a clip uploads, the phone keeps the blob so offline
 * play still works. `driveFileId` marks Drive as the source of truth. A later
 * pass can drop cached blobs under storage pressure. A failed video upload
 * does not drop the lesson text; the next edit or save tries the file again.
 * If Drive is not connected, clips stay on this phone.
 */

import { publishLessonToDrive, publishTrainingVideos, readDriveBinding } from './googleDrive.ts';
import type { DriveLessonDocument, TrainingVideoUpload, TrainingVideoUploadResult } from './googleDrive.ts';
import {
  clampDriveFileId,
  clampMediaLabel,
  type VideoPlan,
} from './techniqueLogic.ts';
import {
  loadTrainingArchive,
  localDateKey,
  planHasContent,
  plansOnDay,
  type TechniqueBlock,
  type TrainingNotesPlan,
} from './trainingNotesStore.ts';

export const LESSON_DRIVE_QUEUE_KEY = 'matboard.pro.lessonDriveQueue.v1';
/** Background Drive draft. Local text save has already happened. */
export const LESSON_DRIVE_DEBOUNCE_MS = 500;
const MAX_REVISIONS = 60;

export const DISTRIBUTE_LEAD =
  'This plan saves as you type. Upload for instructor distribution is optional.';
export const DISTRIBUTE_BUTTON = 'Upload for instructor distribution';
export const DISTRIBUTE_DONE =
  'Saved on this phone. Distribution is optional and uses the gym Google Drive folder when it is connected. Lesson text and attached videos go in that folder, not on Advantage.';

export const OWNER_DRIVE_KICKER = 'Sunday review';
export const OWNER_DRIVE_TITLE = 'Class plans in your Google Drive';
export const OWNER_DRIVE_BODY =
  'When the gym Google Drive folder is connected, a lesson plan saves there as the coach types, and attached technique videos are copied into that day’s training-videos folder. This phone keeps those clips for offline play. Leaving the page or skipping upload still keeps the draft. Version history in that folder shows each coach’s week so you can choose what to keep. Advantage does not host the photos or videos.';
export const OWNER_DRIVE_QUEUE =
  'These rows are lesson text and Drive file ids on this phone. When Google Drive is connected, the lesson text and video files are in that folder. Advantage does not store the video files.';

export type LessonMediaRef = {
  section: 'warmup' | 'technique' | 'cooldown';
  /** Zero-based technique ordinal. Null for Warm-up and Cool down. */
  index: number | null;
  /** On-device clip id. Null when the only pointer is a Drive file. */
  localClipId: string | null;
  /** Customer Drive file id. Null until the Drive client fills it. */
  driveFileId: string | null;
  name: string;
  mime: string;
};

export type LessonRevision = {
  revisionId: string;
  dateKey: string;
  coachName: string;
  savedAt: number;
  /** Silent auto-save, or the optional distribution nudge. */
  kind: 'draft' | 'distribution';
  /** Drive file id for the text plan. Null until the client writes the folder. */
  driveFileId: string | null;
  /** `waiting-for-drive` until a folder write returns a file id. */
  status: 'waiting-for-drive' | 'saved-to-drive';
  plan: TrainingNotesPlan;
  media: LessonMediaRef[];
};

export type LessonDriveDraftInput = {
  /** True only for Advantage Pro / Instructor Collaboration. Regular Coach stays false. */
  proSuite: boolean;
  dateKey: string;
  coachName: string;
  plan: TrainingNotesPlan;
  media: LessonMediaRef[];
};

/** Text fields only, so a stray blob on the object cannot ride along. */
export function lessonPlanForDrive(plan: TrainingNotesPlan): TrainingNotesPlan {
  return {
    version: 1,
    id: typeof plan.id === 'string' ? plan.id : '',
    coachName: plan.coachName,
    classDesignation: plan.classDesignation ?? '',
    classTime: plan.classTime ?? '',
    intro: plan.intro,
    introExpected: plan.introExpected,
    warmupNote: plan.warmupNote,
    warmupExpected: plan.warmupExpected,
    techniques: plan.techniques.map(lessonTechniqueForDrive),
    specificNote: plan.specificNote,
    specificExpected: plan.specificExpected,
    cooldownNote: plan.cooldownNote,
    cooldownExpected: plan.cooldownExpected,
    closing: plan.closing,
  };
}

function lessonTechniqueForDrive(tech: TechniqueBlock): TechniqueBlock {
  const next: TechniqueBlock = {
    id: tech.id,
    slotId: tech.slotId,
    title: tech.title,
    notes: tech.notes,
    expected: tech.expected,
    waterBreak: Boolean(tech.waterBreak),
  };
  if (tech.treeId) next.treeId = tech.treeId;
  return next;
}

export function mediaRefsFromVideoPlan(plan: VideoPlan): LessonMediaRef[] {
  let techniqueOrdinal = 0;
  const refs: LessonMediaRef[] = [];
  for (const slot of plan.slots) {
    const index = slot.kind === 'technique' ? techniqueOrdinal : null;
    if (slot.kind === 'technique') techniqueOrdinal += 1;
    if (!slot.clipId && !slot.driveFileId) continue;
    refs.push({
      section: slot.kind,
      index,
      localClipId: slot.clipId,
      driveFileId: clampDriveFileId(slot.driveFileId),
      name: clampMediaLabel(slot.mediaName),
      mime: clampMediaLabel(slot.mediaMime, 120),
    });
  }
  return refs;
}

/**
 * Point a slot at a customer Drive file without copying bytes.
 * The Drive client should call this after the gym folder accepts the file.
 */
export function assignDriveFileId(plan: VideoPlan, slotId: string, driveFileId: string | null): VideoPlan {
  if (!plan.slots.some((slot) => slot.slotId === slotId)) return plan;
  const id = clampDriveFileId(driveFileId);
  let changed = false;
  const slots = plan.slots.map((slot) => {
    if (slot.slotId !== slotId || slot.driveFileId === id) return slot;
    changed = true;
    return { ...slot, driveFileId: id };
  });
  return changed ? { ...plan, slots } : plan;
}

function revisionKey(
  kind: LessonRevision['kind'],
  dateKey: string,
  coachName: string,
  planId: string,
): string {
  const who = coachName.trim().toLowerCase();
  const id = planId.trim();
  return id ? `${kind}:${dateKey}:${who}:${id}` : `${kind}:${dateKey}:${who}`;
}

/**
 * One open draft per class plan, and one distribution marker per class plan.
 * The same coach and day can hold GB1 at 5:00 PM and GB2 at 6:00 PM as separate rows.
 * Later edits to that plan replace its row so Sunday review is not a pile of keystrokes.
 */
export function recordLessonRevision(
  queue: readonly LessonRevision[],
  input: {
    dateKey: string;
    coachName: string;
    savedAt: number;
    kind: 'draft' | 'distribution';
    driveFileId?: string | null;
    plan: TrainingNotesPlan;
    media: LessonMediaRef[];
  },
): LessonRevision[] {
  const coachName = input.coachName.trim().slice(0, 80);
  const plan = lessonPlanForDrive(input.plan);
  const revisionId = revisionKey(input.kind, input.dateKey, coachName, plan.id);
  const revision: LessonRevision = {
    revisionId,
    dateKey: input.dateKey,
    coachName,
    savedAt: input.savedAt,
    kind: input.kind,
    driveFileId: clampDriveFileId(input.driveFileId),
    status: 'waiting-for-drive',
    plan,
    media: input.media.map((item) => ({
      section: item.section,
      index: item.section === 'technique' ? item.index : null,
      localClipId: item.localClipId,
      driveFileId: clampDriveFileId(item.driveFileId),
      name: clampMediaLabel(item.name),
      mime: clampMediaLabel(item.mime, 120),
    })),
  };
  const without = queue.filter((row) => row.revisionId !== revisionId);
  return [...without, revision].slice(-MAX_REVISIONS);
}

export function latestLessonRevisions(queue: readonly LessonRevision[], limit = 8): LessonRevision[] {
  return [...queue]
    .sort((a, b) => b.savedAt - a.savedAt || a.revisionId.localeCompare(b.revisionId))
    .slice(0, limit);
}

export function markRevisionSaved(
  queue: readonly LessonRevision[],
  revisionId: string,
  driveFileId: string,
): LessonRevision[] {
  return queue.map((row) =>
    row.revisionId === revisionId ? { ...row, driveFileId, status: 'saved-to-drive' } : row,
  );
}

export type DriveSaveNotice = {
  phase: 'idle' | 'saving' | 'saved-drive' | 'saved-phone' | 'error';
  text: string;
};

const idleNotice: DriveSaveNotice = { phase: 'idle', text: '' };
let driveNotice: DriveSaveNotice = idleNotice;
const noticeListeners = new Set<() => void>();

export function subscribeDriveNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

export function getDriveNotice(): DriveSaveNotice {
  return driveNotice;
}

function setDriveNotice(next: DriveSaveNotice): void {
  driveNotice = next;
  noticeListeners.forEach((listener) => listener());
}

export function savedPhoneNotice(): string {
  return 'Saved on this phone. Connect with Google Drive in Advantage Coach Unlimited to keep the lesson and videos in the gym folder. Until then, videos stay on this device.';
}

/** Shown on Daily Training Videos. Regular Coach stays on this phone. */
export function trainingClipStayCopy(input: { proSuite: boolean; driveConnected: boolean }): string {
  if (input.proSuite && input.driveConnected) {
    return 'Clips stay on this phone for offline play. Saving this day copies them into the gym Google Drive folder.';
  }
  if (input.proSuite) {
    return 'Clips stay on this device until Google Drive is connected. Then saving this day copies them into the gym folder.';
  }
  return 'Clips stay on this device. Nothing is uploaded.';
}

/**
 * "Uploading 1 of 3 videos to Google Drive…" — same counting idea as a Gallery
 * batch, with the first file shown as 1 so the wait does not look stuck.
 */
export function driveVideoProgressLabel(done: number, total: number): string {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 'Uploading videos to Google Drive…';
  const saved = Math.min(safeTotal, Math.max(0, done));
  const shown = saved > 0 ? saved : 1;
  return `Uploading ${shown} of ${safeTotal} ${safeTotal === 1 ? 'video' : 'videos'} to Google Drive…`;
}

export function drivePackageNotice(input: {
  lessonSaved: boolean;
  revisions: number;
  uploaded: number;
  failed: number;
  /** True when Drive never accepted the attempt (no folder, or sign-in expired). */
  unreachable: boolean;
}): string {
  if (input.unreachable && !input.lessonSaved) return savedPhoneNotice();
  if (!input.lessonSaved && input.uploaded > 0) {
    return 'Videos saved to Google Drive. Lesson text is on this phone, and the next edit will try the folder again.';
  }
  if (!input.lessonSaved) {
    return 'Saved on this phone. Google Drive could not be updated, and the next edit will try again.';
  }
  if (input.failed > 0) {
    const stay = input.failed === 1 ? '1 video stays on this phone' : `${input.failed} videos stay on this phone`;
    return `Lesson text saved to Google Drive. ${stay} and will try again on the next save.`;
  }
  if (input.uploaded > 0) {
    const clip = input.uploaded === 1 ? '1 video is in the gym folder.' : `${input.uploaded} videos are in the gym folder.`;
    return `${savedDriveNotice(input.revisions)} ${clip} This phone keeps a copy for offline play.`;
  }
  return savedDriveNotice(input.revisions);
}

export function savedDriveNotice(revisions: number): string {
  if (revisions > 1) return `Saved to Google Drive. This day has ${revisions} versions.`;
  return 'Saved to Google Drive.';
}

export function lessonRevisionLabel(revision: LessonRevision): string {
  const who = revision.coachName.trim() || 'Coach';
  const designation = revision.plan.classDesignation?.trim() ?? '';
  const time = revision.plan.classTime?.trim() ?? '';
  const klass = [designation, time].filter(Boolean).join(' ');
  const what = revision.kind === 'distribution' ? 'Shared for distribution' : 'Draft';
  return klass
    ? `${who} · ${klass} · ${revision.dateKey} · ${what}`
    : `${who} · ${revision.dateKey} · ${what}`;
}

type QueueStore = { version: 1; revisions: LessonRevision[] };

function readQueue(): LessonRevision[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LESSON_DRIVE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<QueueStore>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.revisions)) return [];
    return parsed.revisions.filter((row) => row && (row.kind === 'draft' || row.kind === 'distribution'));
  } catch {
    return [];
  }
}

function writeQueue(revisions: LessonRevision[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: QueueStore = { version: 1, revisions };
    localStorage.setItem(LESSON_DRIVE_QUEUE_KEY, JSON.stringify(payload));
  } catch {
    /* The on-device lesson text is already saved. Drive can catch up later. */
  }
}

export function listLessonRevisions(): LessonRevision[] {
  return latestLessonRevisions(readQueue());
}

let pending: LessonDriveDraftInput | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
}

/**
 * Remember the latest Pro draft and write it shortly after typing pauses.
 * Regular Coach (`proSuite: false`) does not queue a Drive revision.
 * Call `flushLessonDriveDraft` on hide, navigation, and unmount.
 */
export function scheduleLessonDriveDraft(input: LessonDriveDraftInput): void {
  clearTimer();
  if (!input.proSuite) {
    pending = null;
    return;
  }
  pending = {
    ...input,
    plan: lessonPlanForDrive(input.plan),
    media: input.media.map((item) => ({ ...item })),
  };
  timer = setTimeout(() => {
    timer = null;
    flushLessonDriveDraft();
  }, LESSON_DRIVE_DEBOUNCE_MS);
}

/** Write the pending draft now. Safe to call when nothing is pending. */
export function flushLessonDriveDraft(): LessonRevision | null {
  clearTimer();
  const draft = pending;
  pending = null;
  if (!draft?.proSuite) return null;
  return commitRevision(draft, 'draft');
}

/**
 * Optional distribution nudge. Never required — skipping leaves the draft in place.
 * Regular Coach returns null and does not pretend to upload.
 */
export function markLessonDistribution(input: LessonDriveDraftInput): LessonRevision | null {
  if (!input.proSuite) return null;
  flushLessonDriveDraft();
  return commitRevision(input, 'distribution');
}

export type DayPackageClip = {
  id: string;
  blob: Blob;
  mime: string;
  label: string;
};

/** Fill Drive ids already stored on the video plan so a retry does not upload again. */
export function mediaWithPlanDriveIds(
  media: readonly LessonMediaRef[],
  plan: VideoPlan | null,
): LessonMediaRef[] {
  if (!plan) return media.map((item) => ({ ...item }));
  return media.map((item) => {
    if (item.driveFileId || !item.localClipId) return { ...item };
    const slot = plan.slots.find((row) => row.clipId === item.localClipId);
    const id = clampDriveFileId(slot?.driveFileId);
    return id ? { ...item, driveFileId: id } : { ...item };
  });
}

/** Clips that still need a copy in the gym folder. The blob is not copied into the lesson JSON. */
export function pendingTrainingVideos(
  media: readonly LessonMediaRef[],
  clips: readonly DayPackageClip[],
): TrainingVideoUpload[] {
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const pending: TrainingVideoUpload[] = [];
  const seen = new Set<string>();
  for (const item of media) {
    if (!item.localClipId || item.driveFileId || seen.has(item.localClipId)) continue;
    const clip = byId.get(item.localClipId);
    if (!clip || clip.blob.size <= 0) continue;
    seen.add(item.localClipId);
    pending.push({
      localClipId: item.localClipId,
      name: item.name || clip.label,
      mime: item.mime || clip.mime,
      bytes: clip.blob,
      section: item.section,
      index: item.index,
    });
  }
  return pending;
}

/** Point matching slots at Drive. The local clip id and blob stay. */
export function stampDriveIds(
  plan: VideoPlan,
  uploaded: readonly { localClipId: string; driveFileId: string }[],
): VideoPlan {
  const ids = new Map(uploaded.map((item) => [item.localClipId, clampDriveFileId(item.driveFileId)]));
  let changed = false;
  const slots = plan.slots.map((slot) => {
    if (!slot.clipId) return slot;
    const id = ids.get(slot.clipId);
    if (!id || slot.driveFileId === id) return slot;
    changed = true;
    return { ...slot, driveFileId: id };
  });
  return changed ? { ...plan, slots } : plan;
}

function applyUploadedIds(
  media: readonly LessonMediaRef[],
  uploaded: readonly { localClipId: string; driveFileId: string }[],
): LessonMediaRef[] {
  const ids = new Map(uploaded.map((item) => [item.localClipId, item.driveFileId]));
  return media.map((item) => {
    if (!item.localClipId) return item;
    const id = clampDriveFileId(ids.get(item.localClipId));
    return id ? { ...item, driveFileId: id } : item;
  });
}

export function mergeUploadedDriveIds(
  queue: readonly LessonRevision[],
  revisionId: string,
  uploaded: readonly { localClipId: string; driveFileId: string }[],
  lessonFileId: string | null,
): LessonRevision[] {
  const ids = new Map(uploaded.map((item) => [item.localClipId, clampDriveFileId(item.driveFileId)]));
  return queue.map((row) => {
    if (row.revisionId !== revisionId) return row;
    const media = row.media.map((item) => {
      if (!item.localClipId) return item;
      const id = ids.get(item.localClipId);
      return id ? { ...item, driveFileId: id } : item;
    });
    if (!lessonFileId) return { ...row, media };
    return { ...row, media, driveFileId: lessonFileId, status: 'saved-to-drive' };
  });
}

/**
 * Write the lesson JSON first, then copy any clips that still lack a Drive id.
 * A video failure still leaves the text in Drive when that write succeeded.
 * Successful uploads are stamped onto the video plan; local blobs are not deleted.
 */
export async function commitDayPackage(input: {
  dateKey: string;
  kind: LessonRevision['kind'];
  coachName: string;
  savedAt: number;
  plan: TrainingNotesPlan;
  media: readonly LessonMediaRef[];
  videoPlan: VideoPlan | null;
  clips: readonly DayPackageClip[];
  uploadVideos: (
    videos: TrainingVideoUpload[],
    onProgress: (done: number, total: number) => void,
  ) => Promise<TrainingVideoUploadResult[] | null>;
  publishLesson: (document: DriveLessonDocument) => Promise<{ fileId: string; revisions: number } | null>;
  onProgress?: (done: number, total: number) => void;
  onSavingLesson?: () => void;
}): Promise<{
  media: LessonMediaRef[];
  videoPlan: VideoPlan | null;
  lessonFileId: string | null;
  revisions: number;
  uploaded: { localClipId: string; driveFileId: string }[];
  failed: number;
  lessonSaved: boolean;
  unreachable: boolean;
  notice: DriveSaveNotice;
}> {
  const known = mediaWithPlanDriveIds(input.media, input.videoPlan);
  let lessonSaved = false;
  let lessonFileId: string | null = null;
  let revisions = 1;

  const publish = async (media: LessonMediaRef[]): Promise<boolean> => {
    input.onSavingLesson?.();
    const document: DriveLessonDocument = {
      advantage: 'lesson-plan',
      version: 1,
      date: input.dateKey,
      coachName: input.coachName,
      savedAt: input.savedAt,
      kind: input.kind,
      distributedAt: input.kind === 'distribution' ? input.savedAt : null,
      plan: lessonPlanForDrive(input.plan),
      media,
    };
    const saved = await input.publishLesson(document);
    if (!saved) return false;
    lessonSaved = true;
    lessonFileId = saved.fileId;
    revisions = saved.revisions;
    return true;
  };

  try {
    await publish(known);
  } catch {
    /* Lesson text stays on this phone. The retry below runs after videos. */
  }

  const pending = pendingTrainingVideos(known, input.clips);
  let results: TrainingVideoUploadResult[] | null = [];
  let unreachable = false;
  if (pending.length > 0) {
    input.onProgress?.(0, pending.length);
    try {
      results = await input.uploadVideos(pending, (done, total) => input.onProgress?.(done, total));
    } catch {
      results = pending.map((video) => ({ localClipId: video.localClipId, driveFileId: null, failed: true }));
    }
    if (results === null) unreachable = true;
  }

  const uploaded = (results ?? []).flatMap((item) => {
    const driveFileId = item.failed ? null : clampDriveFileId(item.driveFileId);
    return driveFileId ? [{ localClipId: item.localClipId, driveFileId }] : [];
  });
  const failed = pending.length - uploaded.length;
  const media = applyUploadedIds(known, uploaded);
  const videoPlan = input.videoPlan ? stampDriveIds(input.videoPlan, uploaded) : null;

  if (uploaded.length > 0 || !lessonSaved) {
    try {
      await publish(media);
    } catch {
      /* The first lesson write may already be in Drive. */
    }
  }

  const noticeText = drivePackageNotice({
    lessonSaved,
    revisions,
    uploaded: uploaded.length,
    failed,
    unreachable,
  });
  const phase: DriveSaveNotice['phase'] = !lessonSaved
    ? unreachable
      ? 'saved-phone'
      : 'error'
    : failed > 0
      ? 'error'
      : 'saved-drive';

  return {
    media,
    videoPlan,
    lessonFileId,
    revisions,
    uploaded,
    failed,
    lessonSaved,
    unreachable,
    notice: { phase, text: noticeText },
  };
}

function commitRevision(
  input: LessonDriveDraftInput,
  kind: LessonRevision['kind'],
): LessonRevision {
  const savedAt = Date.now();
  const next = recordLessonRevision(readQueue(), {
    dateKey: input.dateKey,
    coachName: input.coachName,
    savedAt,
    kind,
    plan: input.plan,
    media: input.media,
  });
  writeQueue(next);
  const revision = next[next.length - 1];
  enqueuePublish(revision, kind, input.dateKey);
  return revision;
}

let publishChain: Promise<void> = Promise.resolve();

/** One Drive publish at a time so two class plans cannot overwrite each other's queue row. */
function enqueuePublish(
  revision: LessonRevision,
  kind: LessonRevision['kind'],
  dateKey: string,
): void {
  publishChain = publishChain.catch(() => undefined).then(() => publishRevision(revision, kind, dateKey));
}

async function loadClipBoard(): Promise<{ plan: VideoPlan; clips: DayPackageClip[] } | null> {
  try {
    const store = await import('./techniqueStore.ts');
    const board = await store.loadTechniqueBoard();
    return { plan: board.plan, clips: board.clips };
  } catch {
    return null;
  }
}

async function rememberUploadedClips(
  uploaded: readonly { localClipId: string; driveFileId: string }[],
): Promise<void> {
  if (uploaded.length === 0) return;
  try {
    const store = await import('./techniqueStore.ts');
    const fresh = await store.loadTechniqueBoard();
    const stamped = stampDriveIds(fresh.plan, uploaded);
    if (stamped !== fresh.plan) await store.saveTechniquePlan(stamped);
  } catch {
    /* The phone still has the clip. The next save fills the Drive id again if needed. */
  }
}

async function publishRevision(
  revision: LessonRevision,
  kind: LessonRevision['kind'],
  dateKey: string,
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!readDriveBinding()) {
    setDriveNotice({ phase: 'saved-phone', text: savedPhoneNotice() });
    return;
  }
  const latest = readQueue().find((row) => row.revisionId === revision.revisionId) ?? revision;
  const board = await loadClipBoard();
  const videoPlan = board?.plan ?? null;
  const clips = board?.clips ?? [];
  const outcome = await commitDayPackage({
    dateKey,
    kind,
    coachName: latest.coachName,
    savedAt: latest.savedAt,
    plan: latest.plan,
    media: latest.media,
    videoPlan,
    clips,
    onSavingLesson: () => setDriveNotice({ phase: 'saving', text: 'Saving to Google Drive…' }),
    onProgress: (done, total) => {
      setDriveNotice({ phase: 'saving', text: driveVideoProgressLabel(done, total) });
    },
    uploadVideos: (videos, onProgress) => publishTrainingVideos({ dateKey, videos, onProgress }),
    publishLesson: (document) => publishLessonToDrive(document),
  });
  await rememberUploadedClips(outcome.uploaded);
  if (outcome.lessonFileId || outcome.uploaded.length > 0) {
    writeQueue(
      mergeUploadedDriveIds(readQueue(), revision.revisionId, outcome.uploaded, outcome.lessonFileId),
    );
  }
  setDriveNotice(outcome.notice);
}

/**
 * Copy today's clips into the gym folder without writing an empty lesson.
 * Used when a video is saved before the lesson text has any content.
 */
async function uploadVideosWithoutLesson(dateKey: string, media: readonly LessonMediaRef[]): Promise<void> {
  if (typeof window === 'undefined' || !readDriveBinding()) return;
  const board = await loadClipBoard();
  if (!board) return;
  const videoPlan = board.plan;
  const clips = board.clips;
  const known = mediaWithPlanDriveIds(media, videoPlan);
  const pending = pendingTrainingVideos(known, clips);
  if (pending.length === 0) return;
  setDriveNotice({ phase: 'saving', text: driveVideoProgressLabel(0, pending.length) });
  let results: TrainingVideoUploadResult[] | null = null;
  try {
    results = await publishTrainingVideos({
      dateKey,
      videos: pending,
      onProgress: (done, total) => {
        setDriveNotice({ phase: 'saving', text: driveVideoProgressLabel(done, total) });
      },
    });
  } catch {
    results = pending.map((video) => ({ localClipId: video.localClipId, driveFileId: null, failed: true }));
  }
  if (!results) {
    setDriveNotice({ phase: 'saved-phone', text: savedPhoneNotice() });
    return;
  }
  const uploaded = results.flatMap((item) => {
    const driveFileId = item.failed ? null : clampDriveFileId(item.driveFileId);
    return driveFileId ? [{ localClipId: item.localClipId, driveFileId }] : [];
  });
  const failed = pending.length - uploaded.length;
  await rememberUploadedClips(uploaded);
  if (failed > 0) {
    const stay = failed === 1 ? '1 video stays on this phone' : `${failed} videos stay on this phone`;
    setDriveNotice({
      phase: 'error',
      text: `${stay} and will try again on the next save.`,
    });
    return;
  }
  const clip = uploaded.length === 1 ? '1 video saved to Google Drive.' : `${uploaded.length} videos saved to Google Drive.`;
  setDriveNotice({
    phase: 'saved-drive',
    text: `${clip} This phone keeps a copy for offline play.`,
  });
}

/**
 * After a clip is added or removed on Daily Training Videos, push today's
 * package the same way a lesson edit does. Regular Coach does nothing.
 * Days with lesson text update each of those plans. A day with only videos
 * uploads the files and does not invent an empty lesson.
 */
export function syncTodayTrainingVideos(videoPlan: VideoPlan, proSuite: boolean): void {
  if (!proSuite || typeof window === 'undefined') return;
  const today = localDateKey();
  const archive = loadTrainingArchive(today);
  const plans = plansOnDay(archive, today).filter(planHasContent);
  const media = mediaRefsFromVideoPlan(videoPlan);
  if (plans.length === 0) {
    publishChain = publishChain.catch(() => undefined).then(() => uploadVideosWithoutLesson(today, media));
    return;
  }
  for (const plan of plans) {
    scheduleLessonDriveDraft({
      proSuite: true,
      dateKey: today,
      coachName: plan.coachName,
      plan,
      media,
    });
    flushLessonDriveDraft();
  }
}
