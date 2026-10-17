/**
 * Filmed moves for the Student Edition video library.
 * Link clips stay on the progress file. These bytes stay in IndexedDB on
 * this phone, or in a connected academy / personal drive folder.
 * The progress file does not carry the video bytes.
 */

import { friendlyTrainingVideoName, videoDateFolderName } from './driveVideoNames.ts';
import {
  LARGE_MEDIA_BYTES,
  LARGE_MEDIA_NOTE,
  assertOriginRoom,
  isStorageQuotaError,
  quotaAddNote,
} from './storageQuota.ts';
import type { AcademyProvider } from './academyPathway.ts';

export const FILM_STORAGE_KEY = 'matboard.studentEdition.films.v1';
export const FILM_DB = 'matboard-student-films';
export const FILM_STORE = 'blobs';
export const FILM_MAX = 200;

export const FILM_EMPTY_ERROR = 'That video is empty.';
export const FILM_TYPE_ERROR = 'Choose a video. Film a move records a video, and Pick from gallery takes a video from this phone.';
export const FILM_TITLE_ERROR = 'Add the technique or title.';
export const FILM_DATE_ERROR = 'Use a date like YYYY-MM-DD.';
export const FILM_FULL_ERROR = 'The filmed library is full. Delete one before filming another.';
export const FILM_PHONE_FULL_ERROR =
  'That video is too large for storage on this phone. Save it to a connected drive, or record a shorter clip.';
export const FILM_PHONE_STORE_ERROR =
  'This phone could not store that video. Try a connected drive, or check that site storage is allowed.';
export const FILM_DRIVE_FAIL_ERROR =
  'The drive did not save that video. It was not added to the library. You can keep it on this phone instead.';
export const FILM_PLAY_MISSING =
  'That video is not on this phone. Connect the drive it was saved to, or restore a backup that includes the video file.';
export const FILM_PLAY_DRIVE = 'That video could not be loaded from the drive. Check the connection and try again.';
export const FILM_LARGE_NOTE = LARGE_MEDIA_NOTE;

export type FilmWhere = 'phone' | 'academy' | 'personal';

export type StudentFilm = {
  id: string;
  fileName: string;
  date: string;
  technique: string;
  note: string;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  where: FilmWhere;
  provider: AcademyProvider | '';
  driveFileId: string;
  dateFolder: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogg|ogv|mkv)$/i;

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function filmFileError(file: { name: string; type: string; size: number }): string {
  const type = file.type.trim().toLowerCase();
  const video = type.startsWith('video/') || VIDEO_EXT.test(file.name);
  if (!video) return FILM_TYPE_ERROR;
  if (!Number.isFinite(file.size) || file.size <= 0) return FILM_EMPTY_ERROR;
  return '';
}

export function filmIsLarge(size: number): boolean {
  return size >= LARGE_MEDIA_BYTES;
}

export function nextFilmClipNumber(films: readonly StudentFilm[], date: string): number {
  return films.filter((film) => film.date === date).length + 1;
}

export function studentFilmFileName(input: {
  date: string;
  technique: string;
  clipNumber: number;
  mime: string;
  originalName?: string;
}): string {
  return friendlyTrainingVideoName({
    dateKey: input.date,
    lessonTitle: input.technique,
    clipNumber: input.clipNumber,
    mime: input.mime,
    originalName: input.originalName,
  });
}

export function studentFilmLabel(film: Pick<StudentFilm, 'date' | 'technique'>): string {
  const title = film.technique.trim() || 'Filmed move';
  return film.date ? `${film.date} ${title}` : title;
}

export function searchStudentFilms(films: readonly StudentFilm[], query: string): StudentFilm[] {
  const needle = query.trim().toLowerCase();
  const newest = [...films].sort((a, b) => b.createdAt - a.createdAt);
  if (!needle) return newest;
  return newest.filter((film) =>
    `${film.technique}\n${film.note}\n${film.fileName}\n${film.date}\n${studentFilmLabel(film)}`.toLowerCase().includes(needle),
  );
}

function newId(now: number): string {
  return `film.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function cleanFilm(value: unknown): StudentFilm | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StudentFilm>;
  if (typeof row.id !== 'string' || !row.id.trim()) return null;
  const date = typeof row.date === 'string' && isCalendarDate(row.date) ? row.date : '';
  const technique = typeof row.technique === 'string' ? row.technique.trim().slice(0, 500) : '';
  if (!date || !technique) return null;
  const where: FilmWhere = row.where === 'academy' || row.where === 'personal' ? row.where : 'phone';
  const provider = row.provider === 'googleDrive' || row.provider === 'oneDrive' ? row.provider : '';
  return {
    id: row.id.trim().slice(0, 80),
    fileName: typeof row.fileName === 'string' ? row.fileName.slice(0, 240) : studentFilmLabel({ date, technique }),
    date,
    technique,
    note: typeof row.note === 'string' ? row.note.slice(0, 500) : '',
    mime: typeof row.mime === 'string' && row.mime.startsWith('video/') ? row.mime : 'video/mp4',
    size: typeof row.size === 'number' && row.size > 0 ? Math.round(row.size) : 0,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    where,
    provider: where === 'phone' ? '' : provider,
    driveFileId: typeof row.driveFileId === 'string' ? row.driveFileId.slice(0, 200) : '',
    dateFolder: typeof row.dateFolder === 'string' ? row.dateFolder.slice(0, 40) : videoDateFolderName(date),
  };
}

export function loadFilms(storage: Pick<MemoryStore, 'getItem'>): StudentFilm[] {
  try {
    const raw = storage.getItem(FILM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { films?: unknown };
    if (!Array.isArray(parsed.films)) return [];
    return parsed.films.map(cleanFilm).filter((film): film is StudentFilm => film != null);
  } catch {
    return [];
  }
}

export function writeFilms(storage: MemoryStore, films: readonly StudentFilm[]): StudentFilm[] {
  const next = films.map(cleanFilm).filter((film): film is StudentFilm => film != null).slice(0, FILM_MAX);
  storage.setItem(FILM_STORAGE_KEY, JSON.stringify({ version: 1, films: next }));
  return next;
}

export function upsertFilm(films: readonly StudentFilm[], film: StudentFilm): StudentFilm[] {
  const clean = cleanFilm(film);
  if (!clean) return [...films];
  const rest = films.filter((item) => item.id !== clean.id);
  return [...rest, clean];
}

export type FilmDraft = {
  file: { name: string; type: string; size: number; blob: Blob };
  technique: string;
  date: string;
  where: FilmWhere;
  provider: AcademyProvider | '';
  films: readonly StudentFilm[];
  now?: number;
};

export type FilmCommitDeps = {
  canStore?: (bytes: number) => Promise<boolean | null>;
  putBlob?: (id: string, blob: Blob) => Promise<void>;
  upload?: (film: StudentFilm, blob: Blob) => Promise<{ driveFileId: string } | { error: string }>;
};

export async function commitStudentFilm(
  draft: FilmDraft,
  deps: FilmCommitDeps,
): Promise<{ ok: true; film: StudentFilm; largeNote: string } | { ok: false; error: string }> {
  const fileError = filmFileError(draft.file);
  if (fileError) return { ok: false, error: fileError };
  const technique = draft.technique.trim();
  if (!technique) return { ok: false, error: FILM_TITLE_ERROR };
  if (technique.length > 500) return { ok: false, error: 'That technique is too long.' };
  if (!isCalendarDate(draft.date)) return { ok: false, error: FILM_DATE_ERROR };
  if (draft.films.length >= FILM_MAX) return { ok: false, error: FILM_FULL_ERROR };
  const now = draft.now ?? Date.now();
  const mime = draft.file.type.trim().toLowerCase().startsWith('video/') ? draft.file.type : 'video/mp4';
  const clipNumber = nextFilmClipNumber(draft.films, draft.date);
  const film: StudentFilm = {
    id: newId(now),
    fileName: studentFilmFileName({
      date: draft.date,
      technique,
      clipNumber,
      mime,
      originalName: draft.file.name,
    }),
    date: draft.date,
    technique,
    note: '',
    mime,
    size: draft.file.size,
    createdAt: now,
    updatedAt: now,
    where: draft.where,
    provider: draft.where === 'phone' ? '' : draft.provider,
    driveFileId: '',
    dateFolder: videoDateFolderName(draft.date),
  };
  const largeNote = filmIsLarge(film.size) ? FILM_LARGE_NOTE : '';
  if (draft.where === 'phone') {
    const canStore = deps.canStore ?? (async (bytes) => {
      try {
        await assertOriginRoom(bytes);
        return true;
      } catch (error) {
        if (isStorageQuotaError(error)) return false;
        return null;
      }
    });
    const room = await canStore(film.size);
    if (room === false) return { ok: false, error: FILM_PHONE_FULL_ERROR };
    if (!deps.putBlob) return { ok: false, error: FILM_PHONE_STORE_ERROR };
    try {
      await deps.putBlob(film.id, draft.file.blob);
    } catch (error) {
      return { ok: false, error: quotaAddNote(error) ?? FILM_PHONE_STORE_ERROR };
    }
    return { ok: true, film, largeNote };
  }
  if (!deps.upload) return { ok: false, error: FILM_DRIVE_FAIL_ERROR };
  const uploaded = await deps.upload(film, draft.file.blob);
  if ('error' in uploaded) return { ok: false, error: uploaded.error || FILM_DRIVE_FAIL_ERROR };
  return { ok: true, film: { ...film, driveFileId: uploaded.driveFileId }, largeNote };
}

export function setFilmNote(films: readonly StudentFilm[], id: string, note: string, now = Date.now()): StudentFilm[] {
  const text = note.slice(0, 500);
  return films.map((film) => (film.id === id && film.note !== text ? { ...film, note: text, updatedAt: now } : film));
}

export function updateFilmTechnique(
  films: readonly StudentFilm[],
  id: string,
  technique: string,
  now = Date.now(),
): StudentFilm[] {
  const title = technique.trim();
  if (!title) return [...films];
  return films.map((film) => (film.id === id ? { ...film, technique: title.slice(0, 500), updatedAt: now } : film));
}

function openFilmDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error(FILM_PHONE_STORE_ERROR));
      return;
    }
    const req = indexedDB.open(FILM_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILM_STORE)) db.createObjectStore(FILM_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(FILM_PHONE_STORE_ERROR));
  });
}

export async function putFilmBlob(id: string, blob: Blob): Promise<void> {
  const db = await openFilmDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILM_STORE, 'readwrite');
    tx.objectStore(FILM_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function getFilmBlob(id: string): Promise<Blob | null> {
  const db = await openFilmDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(FILM_STORE, 'readonly');
    const req = tx.objectStore(FILM_STORE).get(id);
    req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

export async function deleteFilmBlob(id: string): Promise<void> {
  const db = await openFilmDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILM_STORE, 'readwrite');
    tx.objectStore(FILM_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearFilmBlobs(): Promise<void> {
  const db = await openFilmDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILM_STORE, 'readwrite');
    tx.objectStore(FILM_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
