import {
  DEVICE_STORAGE_FULL_NOTE,
  StorageQuotaError,
  quotaAddNote,
} from './storageQuota.ts';

/** Shown when a batch likely failed because the phone could not hand over every file. */
export const SMALLER_BATCH_TIP = 'Try a smaller batch.';

export type FolderPickKind = 'photo' | 'video';

export type FolderSavePhase = 'shrink' | 'save';

/** `done` is how many files are already stored. `total` is how many this batch will try. */
export type FolderSaveProgress = {
  done: number;
  total: number;
  phase: FolderSavePhase;
};

/**
 * A batch stopped for a reason other than origin quota.
 * `saved` files are already on this device. The rest were not written.
 */
export class FolderBatchError extends Error {
  readonly saved: number;
  readonly failed: number;
  readonly total: number;

  constructor(saved: number, total: number, cause?: unknown) {
    super('Could not finish saving this batch on this device.');
    this.name = 'FolderBatchError';
    this.saved = saved;
    this.total = total;
    this.failed = Math.max(0, total - saved);
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * "Saving 3 of 27…" — the number is how many are stored, except the first
 * file shows "Saving 1 of N…" so the wait does not look stuck at zero.
 */
export function folderSaveProgressLabel(progress: FolderSaveProgress): string {
  const total = Math.max(0, progress.total);
  if (total === 0) return 'Saving…';
  const saved = Math.min(total, Math.max(0, progress.done));
  const shown = saved > 0 ? saved : 1;
  return `Saving ${shown} of ${total}…`;
}

export function emptyPickNote(): string {
  return `Nothing was saved. ${SMALLER_BATCH_TIP}`;
}

function typeHint(kind: FolderPickKind, many: boolean): string {
  if (kind === 'video') {
    return many
      ? 'These files cannot play here. Switch the camera to video, or pick an MP4 / WebM.'
      : 'That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.';
  }
  return many
    ? 'These files are not images this folder can keep.'
    : 'That file is not an image this folder can keep.';
}

export function unmatchedPickNote(kind: FolderPickKind, picked: number): string {
  if (picked <= 1) return typeHint(kind, false);
  return `Nothing was saved. ${typeHint(kind, true)} ${SMALLER_BATCH_TIP}`;
}

/** Partial or total failure that is not an origin-quota stop. */
export function batchFailureNote(error: FolderBatchError): string {
  if (error.saved <= 0) {
    return `Could not save these files. Nothing was saved. ${SMALLER_BATCH_TIP}`;
  }
  const failed = error.failed > 0 ? error.failed : Math.max(0, error.total - error.saved);
  const failedText = failed === 1 ? '1 could not be saved.' : `${failed} could not be saved.`;
  return `Saved ${error.saved} of ${error.total}. ${failedText} ${SMALLER_BATCH_TIP}`;
}

/**
 * Quota keeps the existing storage-full wording.
 * When part of the batch landed first, also say how many saved and how many did not.
 */
export function quotaBatchNote(error: StorageQuotaError): string {
  if (error.saved > 0 && error.attempted > error.saved) {
    const failed = error.attempted - error.saved;
    const failedText = failed === 1 ? '1 could not be saved.' : `${failed} could not be saved.`;
    return `Saved ${error.saved} of ${error.attempted}. ${failedText} ${DEVICE_STORAGE_FULL_NOTE}`;
  }
  return quotaAddNote(error) ?? DEVICE_STORAGE_FULL_NOTE;
}

export type FolderPickCounts = {
  /** Files the picker handed back. Zero is an empty change, not a cancel. */
  picked: number;
  /** Picked files whose size is greater than zero. */
  readable: number;
  /** Readable files that belong in this folder. */
  matched: number;
  /** Files written before the attempt finished. */
  added: number;
  kind: FolderPickKind;
  error: unknown;
};

/**
 * User-facing result for a Gallery / Pro Shop / Events pick.
 * Null means the save finished and the caller can clear the status.
 */
export function folderPickFeedback(input: FolderPickCounts): string | null {
  if (input.error instanceof StorageQuotaError) return quotaBatchNote(input.error);
  if (input.error instanceof FolderBatchError) return batchFailureNote(input.error);
  if (input.error) {
    const quota = quotaAddNote(input.error);
    if (quota) return quota;
    if (input.added > 0) {
      const total = Math.max(input.matched, input.added);
      const failed = Math.max(1, total - input.added);
      const failedText = failed === 1 ? '1 could not be saved.' : `${failed} could not be saved.`;
      return `Saved ${input.added} of ${total}. ${failedText} ${SMALLER_BATCH_TIP}`;
    }
    return `Could not save these files. Nothing was saved. ${SMALLER_BATCH_TIP}`;
  }
  if (input.added > 0) {
    const hollow = Math.max(0, input.picked - input.readable);
    if (hollow > 0) {
      const total = input.added + hollow;
      const failedText = hollow === 1 ? '1 could not be saved.' : `${hollow} could not be saved.`;
      return `Saved ${input.added} of ${total}. ${failedText} ${SMALLER_BATCH_TIP}`;
    }
    return null;
  }
  if (input.picked === 0 || input.readable === 0) return emptyPickNote();
  return unmatchedPickNote(input.kind, input.picked);
}
