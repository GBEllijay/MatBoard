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
 * sends the text plan and media file ids to that folder (`googleDrive.ts`).
 * Photo and video bytes are not part of the write. Regular Coach does not
 * queue a Drive revision. If Drive is not connected, or the write fails, the
 * plan stays on this phone and the next edit tries again.
 */

import { publishLessonToDrive, readDriveBinding, type DriveLessonDocument } from './googleDrive.ts';
import {
  clampDriveFileId,
  clampMediaLabel,
  type VideoPlan,
} from './techniqueLogic.ts';
import type { TechniqueBlock, TrainingNotesPlan } from './trainingNotesStore.ts';

export const LESSON_DRIVE_QUEUE_KEY = 'matboard.pro.lessonDriveQueue.v1';
/** Background Drive draft. Local text save has already happened. */
export const LESSON_DRIVE_DEBOUNCE_MS = 500;
const MAX_REVISIONS = 60;

export const DISTRIBUTE_LEAD =
  'This plan saves as you type. Upload for instructor distribution is optional.';
export const DISTRIBUTE_BUTTON = 'Upload for instructor distribution';
export const DISTRIBUTE_DONE =
  'Saved on this phone. Distribution is optional and uses the gym Google Drive folder when it is connected. Videos stay in that Drive folder, not on Advantage.';

export const OWNER_DRIVE_KICKER = 'Sunday review';
export const OWNER_DRIVE_TITLE = 'Class plans in your Google Drive';
export const OWNER_DRIVE_BODY =
  'When the gym Google Drive folder is connected, a lesson plan saves there as the coach types. Leaving the page or skipping upload still keeps the draft. Version history in that folder shows each coach’s week so you can choose what to keep. Advantage keeps the plan text and Drive file ids only. Photos and videos stay in your Drive.';
export const OWNER_DRIVE_QUEUE =
  'These rows are lesson text and file ids on this phone. When Google Drive is connected, the same text is in that folder. No video files are stored here.';

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
    coachName: plan.coachName,
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

function revisionKey(kind: LessonRevision['kind'], dateKey: string, coachName: string): string {
  return `${kind}:${dateKey}:${coachName.trim().toLowerCase()}`;
}

/**
 * One open draft per coach per day, and one distribution marker per coach per day.
 * Later edits replace that row so Sunday review is not a pile of keystrokes.
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
  const revisionId = revisionKey(input.kind, input.dateKey, coachName);
  const revision: LessonRevision = {
    revisionId,
    dateKey: input.dateKey,
    coachName,
    savedAt: input.savedAt,
    kind: input.kind,
    driveFileId: clampDriveFileId(input.driveFileId),
    status: 'waiting-for-drive',
    plan: lessonPlanForDrive(input.plan),
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
  return 'Saved on this phone. Connect Google Drive in Instructor Collaboration to keep a copy in the gym folder.';
}

export function savedDriveNotice(revisions: number): string {
  if (revisions > 1) return `Saved to Google Drive. This day has ${revisions} versions.`;
  return 'Saved to Google Drive.';
}

export function lessonRevisionLabel(revision: LessonRevision): string {
  const who = revision.coachName.trim() || 'Coach';
  const what = revision.kind === 'distribution' ? 'Shared for distribution' : 'Draft';
  return `${who} · ${revision.dateKey} · ${what}`;
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
  void publishRevision(revision, kind, input.dateKey);
  return revision;
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
  const document: DriveLessonDocument = {
    advantage: 'lesson-plan',
    version: 1,
    date: dateKey,
    coachName: revision.coachName,
    savedAt: revision.savedAt,
    kind,
    distributedAt: kind === 'distribution' ? revision.savedAt : null,
    plan: revision.plan,
    media: revision.media,
  };
  setDriveNotice({ phase: 'saving', text: 'Saving to Google Drive…' });
  try {
    const saved = await publishLessonToDrive(document);
    if (!saved) {
      setDriveNotice({ phase: 'saved-phone', text: savedPhoneNotice() });
      return;
    }
    writeQueue(markRevisionSaved(readQueue(), revision.revisionId, saved.fileId));
    setDriveNotice({ phase: 'saved-drive', text: savedDriveNotice(saved.revisions) });
  } catch {
    setDriveNotice({
      phase: 'error',
      text: 'Saved on this phone. Google Drive could not be updated, and the next edit will try again.',
    });
  }
}
