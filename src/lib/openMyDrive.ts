/**
 * One-tap link to the gym's connected Google Drive folder.
 * Media bytes stay in Drive. This does not upload anything and does not
 * open Google Photos.
 */

export const OPEN_MY_DRIVE_LABEL = 'Open my Drive';
export const OPEN_MY_DRIVE_CONNECT =
  'Connect your Google Drive folder first. Lesson plans and media stay in that folder. Advantage does not host photos or videos.';

/** Web URL for a Drive folder id. Rejects anything that is not a folder id. */
export function driveFolderWebUrl(folderId: string | null | undefined): string | null {
  const id = folderId?.trim() ?? '';
  if (!/^[a-zA-Z0-9_-]{8,}$/.test(id)) return null;
  return `https://drive.google.com/drive/folders/${id}`;
}
