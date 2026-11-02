/**
 * Student Edition copies into a folder the student already linked.
 * A filmed move goes to `students/{code}/inbox/{date}/`. It does not go in
 * `videos/daily` or the gym gallery. Students have no gallery upload.
 * Backups are files in a Student Journal folder.
 * This does not write the Coach / Pro gym binding.
 */

import {
  loadAcademyLink,
  loadPersonalDrive,
  providerLabel,
  type AcademyProvider,
  type StudentDriveLink,
} from './academyPathway.ts';
import { publishGymFile } from './gymPublish.ts';
import { safePathSegment } from './gymTree.ts';
import {
  downloadDriveFile,
  findOrCreateChildFolder,
  requestDriveToken,
  saveDriveBytes,
} from './googleDrive.ts';
import {
  createOneDriveFolder,
  downloadOneDriveBytes,
  readOneDriveSession,
  saveOneDriveBytes,
} from './oneDrive.ts';
import { FILM_DRIVE_FAIL_ERROR, FILM_PLAY_DRIVE, type StudentFilm } from './studentFilm.ts';

export const STUDENT_JOURNAL_FOLDER = 'Student Journal';
export const STUDENT_CODE_KEY = 'matboard.studentEdition.studentCode.v1';

export function readStudentCode(storage: MemoryStore | null | undefined): string {
  try {
    return safePathSegment(storage?.getItem(STUDENT_CODE_KEY) ?? '', '');
  } catch {
    return '';
  }
}

type MemoryStore = { getItem: (key: string) => string | null };

function studentCodeForUpload(): string {
  if (typeof localStorage === 'undefined') return 'this-phone';
  const saved = readStudentCode(localStorage);
  if (saved) return saved;
  return 'this-phone';
}

export function studentDriveTarget(
  storage: MemoryStore,
  where: 'academy' | 'personal',
): StudentDriveLink | null {
  return where === 'academy' ? loadAcademyLink(storage) : loadPersonalDrive(storage);
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
  const published = await publishGymFile({
    purpose: 'student-file',
    role: 'student',
    kind: 'video',
    dateKey,
    fileName: input.film.fileName,
    bytes: input.bytes,
    mime: input.film.mime,
    studentCode: studentCodeForUpload(),
    target: { provider: input.link.provider, folderId: input.link.folderId },
  });
  if (!published.route.ok) return { error: FILM_DRIVE_FAIL_ERROR };
  if (published.home === 'phone') {
    return { error: driveSignInError(input.link.provider) };
  }
  if (published.failed || !published.remoteId) return { error: FILM_DRIVE_FAIL_ERROR };
  return { driveFileId: published.remoteId };
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
