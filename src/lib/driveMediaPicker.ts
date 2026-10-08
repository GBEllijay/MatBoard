/**
 * In-app picker for the gym's connected Google Drive folder.
 * Google Photos and the phone gallery stay available via Pick from gallery.
 * Drive is an additional source. Selected files keep their Drive file id.
 * A copy on this phone is only so the TV can play them. Advantage does not host the bytes.
 */

import { folderSaveProgressLabel, type FolderSaveProgress } from './folderBatch.ts';
import { toggleSelection } from './mediaSelection.ts';
import { DEVICE_STORAGE_FULL_NOTE, StorageQuotaError } from './storageQuota.ts';

export const PICK_FROM_DRIVE_LABEL = 'Pick from Google Drive';
export const DRIVE_PICK_TITLE = 'Pick from Google Drive';
export const DRIVE_PICK_DONE = 'Done';
export const DRIVE_PICK_BACK = 'Back';
export const DRIVE_PICK_LOADING = 'Opening the gym folder…';
export const DRIVE_PICK_BESIDE_PHOTOS =
  'Pick from gallery includes Google Photos and this phone. Google Drive is an additional source. Advantage does not host those files.';
export const DRIVE_PICK_STAY =
  'These files come from the gym Google Drive folder, in addition to Google Photos or this phone. This phone keeps a copy so the TV can play them. Advantage does not host them.';
export const DRIVE_PICK_NEED_CONNECT =
  'Connect the gym Google Drive folder to pick photos and videos. Advantage does not host them.';

export type DrivePickKind = 'photo' | 'video' | 'any';

export type DriveBrowseFolder = { id: string; name: string };

export type DriveBrowseMedia = {
  id: string;
  name: string;
  mime: string;
  thumbnailLink: string | null;
};

export type DriveBrowseFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string | null;
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function drivePickHint(kind: DrivePickKind): string {
  if (kind === 'video') return 'Additional source: videos in the gym Google Drive folder';
  if (kind === 'any') return 'Additional source: photos and videos in the gym Google Drive folder';
  return 'Additional source: photos in the gym Google Drive folder';
}

export function driveMediaKind(mime: string): DrivePickKind | null {
  const value = mime.trim().toLowerCase();
  if (value.startsWith('image/')) return 'photo';
  if (value.startsWith('video/')) return 'video';
  return null;
}

export function splitDriveBrowse(
  files: readonly DriveBrowseFile[],
  kind: DrivePickKind,
): { folders: DriveBrowseFolder[]; media: DriveBrowseMedia[] } {
  const folders: DriveBrowseFolder[] = [];
  const media: DriveBrowseMedia[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const id = file.id?.trim() ?? '';
    const name = file.name?.trim() ?? '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    if (file.mimeType === FOLDER_MIME) {
      folders.push({ id, name });
      continue;
    }
    const mediaKind = driveMediaKind(file.mimeType);
    if (!mediaKind || (kind !== 'any' && mediaKind !== kind)) continue;
    media.push({
      id,
      name,
      mime: file.mimeType,
      thumbnailLink: file.thumbnailLink ?? null,
    });
  }
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  folders.sort(byName);
  media.sort(byName);
  return { folders, media };
}

export function toggleDriveSelection<T extends { id: string }>(selected: readonly T[], item: T): T[] {
  return toggleSelection(selected, item);
}

export function drivePickDoneLabel(count: number): string {
  const selected = Math.max(0, Math.floor(count));
  if (selected <= 0) return DRIVE_PICK_DONE;
  return selected === 1 ? 'Done · 1 selected' : `Done · ${selected} selected`;
}

export function drivePickEmptyCopy(kind: DrivePickKind, folderCount: number): string {
  const noun = kind === 'video' ? 'videos' : kind === 'any' ? 'photos or videos' : 'photos';
  if (folderCount > 0) return `No ${noun} in this folder. Open a folder below.`;
  return `No ${noun} in this folder.`;
}

export type DrivePickCrumb = { id: string; name: string };

/** No connected folder: the Media Console opens the connect card instead of this sheet. */
export function drivePickEntry(hasBinding: boolean): 'picker' | 'connect' {
  return hasBinding ? 'picker' : 'connect';
}

export function drivePickRootStack(
  binding: { folderId: string; folderName: string } | null,
): DrivePickCrumb[] {
  if (!binding?.folderId || !binding.folderName) return [];
  return [{ id: binding.folderId, name: binding.folderName }];
}

export function drivePickShowsBack(stack: readonly DrivePickCrumb[]): boolean {
  return stack.length > 1;
}

export function drivePickGoBack(stack: readonly DrivePickCrumb[]): DrivePickCrumb[] {
  return stack.length > 1 ? stack.slice(0, -1) : [...stack];
}

export function drivePickEnterFolder(
  stack: readonly DrivePickCrumb[],
  folder: DrivePickCrumb,
): DrivePickCrumb[] {
  const id = folder.id.trim();
  const name = folder.name.trim();
  if (!id || !name) return [...stack];
  return [...stack, { id, name }];
}

export function drivePickPath(stack: readonly DrivePickCrumb[]): string {
  return stack.map((crumb) => crumb.name).join(' / ');
}

/** "Opening 1 of 3 from Google Drive…" — the first file shows as 1 so the wait does not look stuck. */
export function driveImportProgressLabel(done: number, total: number): string {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 'Opening files from Google Drive…';
  const saved = Math.min(safeTotal, Math.max(0, done));
  const shown = saved > 0 ? saved : 1;
  const noun = safeTotal === 1 ? 'file' : 'files';
  return `Opening ${shown} of ${safeTotal} ${noun} from Google Drive…`;
}

/**
 * How many Drive files are downloaded before they are saved.
 * Photos shrink one at a time after that. Videos stay larger, so a video
 * folder keeps a shorter queue. Select all can cover the whole folder view
 * without holding every file in memory at once.
 */
export function driveImportChunkSize(kind: DrivePickKind): number {
  if (kind === 'photo') return 8;
  return 3;
}

export function chunkDriveImport<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunkSize = Math.max(1, Math.floor(size) || 1);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export type DriveOpenedFile = { file: File; driveFileId: string };

export type DriveImportOutcome = {
  picked: number;
  opened: number;
  failedOpen: number;
  added: number;
};

/**
 * Quiet when every opened file was saved.
 * A download that fails is named. A batch that opens and then matches nothing
 * keeps the existing "already in this folder" line.
 */
export function driveImportOutcomeNote(input: DriveImportOutcome): string | null {
  if (input.opened <= 0) return 'Those Google Drive files could not be opened. Nothing was saved.';
  const missed =
    input.failedOpen <= 0
      ? ''
      : input.failedOpen === 1
        ? ' 1 file could not be opened.'
        : ` ${input.failedOpen} files could not be opened.`;
  if (input.added <= 0) {
    return `Those files are already in this folder, or this folder does not use that kind.${missed}`;
  }
  if (input.failedOpen > 0) return `Saved ${input.added} of ${input.picked}.${missed}`;
  return null;
}

/**
 * A save that stops before anything is stored keeps that error's own message.
 * Files already stored in an earlier chunk stay, and the note says so.
 */
export function driveImportSaveErrorNote(error: unknown, saved: number, picked: number): string {
  if (saved <= 0) {
    if (error instanceof Error && error.message) return error.message;
    return 'Those Google Drive files could not be saved.';
  }
  const total = Math.max(picked, saved);
  if (error instanceof StorageQuotaError) return `Saved ${saved} of ${total}. ${DEVICE_STORAGE_FULL_NOTE}`;
  const detail =
    error instanceof Error && error.message ? error.message : 'Those Google Drive files could not be saved.';
  return `Saved ${saved} of ${total}. ${detail}`;
}

export type DriveImportResult =
  | { ok: true; outcome: DriveImportOutcome }
  | { ok: false; outcome: DriveImportOutcome; error: unknown };

/**
 * Download a few files, save them, then download the next few.
 * One file that will not open is skipped. A save error stops the rest and
 * keeps the count already stored.
 */
export async function runDriveImport<T>(input: {
  items: readonly T[];
  chunkSize: number;
  download: (item: T) => Promise<DriveOpenedFile>;
  save: (files: readonly DriveOpenedFile[], report: (progress: FolderSaveProgress) => void) => Promise<number>;
  onLabel: (label: string) => void;
}): Promise<DriveImportResult> {
  const items = input.items;
  const chunks = chunkDriveImport(items, input.chunkSize);
  let opened = 0;
  let failedOpen = 0;
  let added = 0;
  let cursor = 0;
  const outcome = (): DriveImportOutcome => ({
    picked: items.length,
    opened,
    failedOpen,
    added,
  });

  for (const chunk of chunks) {
    const ready: DriveOpenedFile[] = [];
    for (const item of chunk) {
      input.onLabel(driveImportProgressLabel(cursor, items.length));
      try {
        ready.push(await input.download(item));
        opened += 1;
      } catch {
        failedOpen += 1;
      }
      cursor += 1;
    }
    if (!ready.length) continue;
    const savedBefore = added;
    try {
      input.onLabel(
        folderSaveProgressLabel({
          done: savedBefore,
          total: items.length,
          phase: 'shrink',
        }),
      );
      const savedNow = await input.save(ready, (progress) => {
        input.onLabel(
          folderSaveProgressLabel({
            done: savedBefore + progress.done,
            total: items.length,
            phase: progress.phase,
          }),
        );
      });
      added += Math.max(0, savedNow);
    } catch (error) {
      const partial =
        error && typeof error === 'object' && 'saved' in error && typeof error.saved === 'number'
          ? Math.max(0, error.saved)
          : 0;
      added += partial;
      return { ok: false, outcome: outcome(), error };
    }
  }

  return { ok: true, outcome: outcome() };
}
