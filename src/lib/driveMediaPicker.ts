/**
 * In-app picker for the gym's connected Google Drive folder.
 * Google Photos is not a source. Selected files keep their Drive file id.
 * A copy on this phone is only so the TV can play them. Advantage does not host the bytes.
 */

export const PICK_FROM_DRIVE_LABEL = 'Pick from Google Drive';
export const DRIVE_PICK_TITLE = 'Pick from Google Drive';
export const DRIVE_PICK_DONE = 'Done';
export const DRIVE_PICK_BACK = 'Back';
export const DRIVE_PICK_LOADING = 'Opening the gym folder…';
export const DRIVE_PICK_STAY =
  'Files stay in the gym Google Drive folder. This phone keeps a copy so the TV can play them. Advantage does not host them.';
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
  if (kind === 'video') return 'Choose videos in the gym Google Drive folder';
  if (kind === 'any') return 'Choose photos and videos in the gym Google Drive folder';
  return 'Choose photos in the gym Google Drive folder';
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
  const id = item.id.trim();
  if (!id) return [...selected];
  return selected.some((row) => row.id === id) ? selected.filter((row) => row.id !== id) : [...selected, item];
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

/** "Opening 1 of 3 from Google Drive…" — the first file shows as 1 so the wait does not look stuck. */
export function driveImportProgressLabel(done: number, total: number): string {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 'Opening files from Google Drive…';
  const saved = Math.min(safeTotal, Math.max(0, done));
  const shown = saved > 0 ? saved : 1;
  const noun = safeTotal === 1 ? 'file' : 'files';
  return `Opening ${shown} of ${safeTotal} ${noun} from Google Drive…`;
}
