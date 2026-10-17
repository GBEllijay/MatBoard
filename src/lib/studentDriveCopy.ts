/**
 * Student Edition copies into a folder the student already linked.
 * Filmed moves reuse the Daily Training Videos upload: friendly name,
 * Videos/{date} folder, resumable Google upload. OneDrive uses the same
 * names and date folders. Backups are files in a Student Journal folder.
 * This does not write the Coach / Pro gym binding.
 */

import {
  loadAcademyLink,
  loadPersonalDrive,
  providerLabel,
  type AcademyProvider,
  type StudentDriveLink,
} from './academyPathway.ts';
import { VIDEOS_FOLDER_NAME, videoDateFolderName } from './driveVideoNames.ts';
import {
  downloadDriveFile,
  findOrCreateChildFolder,
  requestDriveToken,
  saveDriveBytes,
  uploadTrainingVideos,
} from './googleDrive.ts';
import {
  createOneDriveFolder,
  downloadOneDriveBytes,
  readOneDriveSession,
  saveOneDriveBytes,
} from './oneDrive.ts';
import { FILM_DRIVE_FAIL_ERROR, FILM_PLAY_DRIVE, type StudentFilm } from './studentFilm.ts';

export const STUDENT_JOURNAL_FOLDER = 'Student Journal';

type MemoryStore = { getItem: (key: string) => string | null };

export function studentDriveTarget(
  storage: MemoryStore,
  where: 'academy' | 'personal',
): StudentDriveLink | null {
  return where === 'academy' ? loadAcademyLink(storage) : loadPersonalDrive(storage);
}

function clipNumberFromFilmName(name: string): number {
  const match = name.match(/clip\s+(\d+)/i);
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function googleToken(): Promise<string | null> {
  return (await requestDriveToken('silent')) ?? (await requestDriveToken('consent'));
}

function driveSignInError(provider: AcademyProvider): string {
  const name = providerLabel(provider);
  return `${name} needs a sign-in on this phone before a file can be saved there.`;
}

export async function uploadStudentFilm(input: {
  link: StudentDriveLink;
  film: StudentFilm;
  bytes: Blob;
}): Promise<{ driveFileId: string } | { error: string }> {
  const dateKey = input.film.date;
  if (input.link.provider === 'googleDrive') {
    const token = await googleToken();
    if (!token) return { error: driveSignInError('googleDrive') };
    try {
      const [result] = await uploadTrainingVideos({
        token,
        rootFolderId: input.link.folderId,
        dateKey,
        videos: [
          {
            localClipId: input.film.id,
            name: input.film.fileName,
            mime: input.film.mime,
            bytes: input.bytes,
            section: 'technique',
            index: 0,
            lessonTitle: input.film.technique,
            clipNumber: clipNumberFromFilmName(input.film.fileName),
          },
        ],
      });
      if (!result || result.failed || !result.driveFileId) return { error: FILM_DRIVE_FAIL_ERROR };
      return { driveFileId: result.driveFileId };
    } catch {
      return { error: FILM_DRIVE_FAIL_ERROR };
    }
  }
  const session = readOneDriveSession();
  if (!session) return { error: driveSignInError('oneDrive') };
  try {
    const videos = await createOneDriveFolder(session.token, VIDEOS_FOLDER_NAME, fetch, input.link.folderId);
    const dateFolder = await createOneDriveFolder(session.token, videoDateFolderName(dateKey), fetch, videos.id);
    const saved = await saveOneDriveBytes(
      session.token,
      { name: input.film.fileName, bytes: input.bytes, mime: input.film.mime },
      dateFolder.id,
    );
    return { driveFileId: saved.id };
  } catch {
    return { error: FILM_DRIVE_FAIL_ERROR };
  }
}

export async function downloadStudentFilm(film: StudentFilm): Promise<Blob> {
  if (!film.driveFileId || !film.provider) throw new Error(FILM_PLAY_DRIVE);
  if (film.provider === 'googleDrive') {
    const token = await googleToken();
    if (!token) throw new Error(driveSignInError('googleDrive'));
    try {
      return await downloadDriveFile(token, film.driveFileId);
    } catch {
      throw new Error(FILM_PLAY_DRIVE);
    }
  }
  const session = readOneDriveSession();
  if (!session) throw new Error(driveSignInError('oneDrive'));
  try {
    return await downloadOneDriveBytes(session.token, film.driveFileId);
  } catch {
    throw new Error(FILM_PLAY_DRIVE);
  }
}

export type DriveCopyFile = { name: string; bytes: Blob; mime: string };

export async function copyFilesToStudentDrive(
  link: StudentDriveLink,
  files: readonly DriveCopyFile[],
): Promise<{ saved: string[]; error: string }> {
  const saved: string[] = [];
  if (link.provider === 'googleDrive') {
    const token = await googleToken();
    if (!token) return { saved, error: driveSignInError('googleDrive') };
    try {
      const folder = await findOrCreateChildFolder(token, link.folderId, STUDENT_JOURNAL_FOLDER, fetch, {
        advantageRole: 'student-journal',
      });
      for (const file of files) {
        await saveDriveBytes(token, { ...file, parentId: folder.id });
        saved.push(file.name);
      }
      return { saved, error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Drive did not take the copy.';
      return { saved, error: message };
    }
  }
  const session = readOneDriveSession();
  if (!session) return { saved, error: driveSignInError('oneDrive') };
  try {
    const folder = await createOneDriveFolder(session.token, STUDENT_JOURNAL_FOLDER, fetch, link.folderId);
    for (const file of files) {
      await saveOneDriveBytes(session.token, file, folder.id);
      saved.push(file.name);
    }
    return { saved, error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OneDrive did not take the copy.';
    return { saved, error: message };
  }
}
