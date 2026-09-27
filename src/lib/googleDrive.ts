/**
 * Google Drive for Advantage Coach Unlimited / Instructor Collaboration.
 *
 * Lesson text and file ids are written to a folder in the gym's own Drive.
 * Photo and video bytes are never sent to an Advantage server. This module
 * talks to Google from the browser only. There is no sample class list —
 * the calendar renders files Drive returns, or an empty state.
 *
 * The public browser client id comes from `VITE_GOOGLE_CLIENT_ID` at build
 * time. Advantage hosts that one Web client. Gym owners never paste an id,
 * and this app never uses a client secret. A pasted id from an older build
 * is ignored on the live website so it cannot override the company client.
 * Scopes: `drive.file` (create and update lesson JSON) and `drive.readonly`
 * (list the chosen folder, thumbnails, and download a video the owner stored).
 * Google Photos is not a source.
 */

import {
  GALLERY_TODAY_CHECKING,
  GALLERY_TODAY_EMPTY,
  GALLERY_TODAY_UNAVAILABLE,
  galleryTodayReadyCopy,
} from './galleryDay.ts';
import { localDateKey } from './trainingNotesStore.ts';
import type { TrainingNotesPlan } from './trainingNotesStore.ts';

/** Legacy key from when an owner could paste an id. Production does not read it. */
export const GOOGLE_CLIENT_ID_KEY = 'matboard.pro.googleClientId';
export const DRIVE_BINDING_KEY = 'matboard.pro.googleDriveFolder.v1';
const DRIVE_TOKEN_KEY = 'matboard.pro.googleDriveToken';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const LESSON_ROOT_NAME = 'Advantage Lesson Plans';

export const DRIVE_SETUP_NEEDED =
  'Google Drive is not available on this build yet — contact Advantage.';
/** Shown only in a local dev build, and only when the build has no client id. */
export const DRIVE_DEV_CLIENT_HINT =
  'Dev only. This is not part of the gym owner screen. It is ignored on the live website.';
export const DRIVE_SIGN_IN_FAILED =
  'Google did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website.';
export const DRIVE_FOLDER_EMPTY = 'This Google Drive account does not have any folders yet.';
export const CLASS_HISTORY_TITLE = 'Class history';
export const CLASS_HISTORY_LEAD =
  'Techniques, photos, and videos from the gym Google Drive folder, by date. They stay in Drive for as long as the gym keeps that folder.';
export const CLASS_HISTORY_EMPTY = 'Nothing in this Google Drive folder yet.';
export const CLASS_HISTORY_CONNECT =
  'Connect your Google Drive folder to see this list. Advantage does not host the photos or videos.';
export const CLASS_HISTORY_CHECKING = 'Checking Google Drive…';
export const DRIVE_TODAY_EMPTY = 'Nothing in the shared gallery or Google Drive for today.';
export const DRIVE_CHECK_FAILED =
  'Google Drive could not be checked, and the shared gallery has nothing for today.';
export const DRIVE_SIGN_IN_AGAIN =
  'Nothing in the shared gallery for today. Sign in to Google Drive again to check the gym folder.';

export type TodayDriveStatus = 'skipped' | 'loading' | 'disconnected' | 'needs-sign-in' | 'ready' | 'error';

/**
 * Download-button copy. An empty Drive folder is stated only after a real check.
 * A missing sign-in is a reconnect prompt, not a claim that the folder is empty.
 */
export function todayDownloadCopy(input: {
  galleryStatus: 'loading' | 'ready' | 'error';
  galleryCount: number;
  driveStatus: TodayDriveStatus;
  driveCount: number;
}): string {
  const galleryCount = Math.max(0, input.galleryCount);
  const driveCount = Math.max(0, input.driveCount);
  if (galleryCount + driveCount > 0) {
    if (galleryCount && driveCount) {
      const gallery =
        galleryCount === 1 ? '1 video in the shared gallery' : `${galleryCount} videos in the shared gallery`;
      const drive = driveCount === 1 ? '1 in Google Drive' : `${driveCount} in Google Drive`;
      return `${gallery} and ${drive} for today.`;
    }
    if (driveCount === 1) return '1 video in Google Drive for today.';
    if (driveCount > 1) return `${driveCount} videos in Google Drive for today.`;
    return galleryTodayReadyCopy(galleryCount);
  }
  if (input.galleryStatus === 'loading' || input.driveStatus === 'loading') return GALLERY_TODAY_CHECKING;
  if (input.driveStatus === 'error') return DRIVE_CHECK_FAILED;
  if (input.galleryStatus === 'error' && (input.driveStatus === 'skipped' || input.driveStatus === 'disconnected')) {
    return GALLERY_TODAY_UNAVAILABLE;
  }
  if (input.driveStatus === 'needs-sign-in') return DRIVE_SIGN_IN_AGAIN;
  if (input.driveStatus === 'ready') return DRIVE_TODAY_EMPTY;
  return GALLERY_TODAY_EMPTY;
}

export type DriveLessonMedia = {
  section: 'warmup' | 'technique' | 'cooldown';
  index: number | null;
  localClipId: string | null;
  driveFileId: string | null;
  name: string;
  mime: string;
};

/** Text lesson plus media ids. Never includes file bytes. */
export type DriveLessonDocument = {
  advantage: 'lesson-plan';
  version: 1;
  date: string;
  coachName: string;
  savedAt: number;
  kind: 'draft' | 'distribution';
  distributedAt: number | null;
  plan: TrainingNotesPlan;
  media: DriveLessonMedia[];
};

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  thumbnailLink?: string | null;
  appProperties?: Record<string, string>;
};

export type DriveFolderChoice = { id: string; name: string };

export type DriveBinding = {
  folderId: string;
  folderName: string;
  email: string | null;
};

export type ClassMedia = {
  id: string;
  name: string;
  mime: string;
  thumbnailLink: string | null;
};

export type ClassDay = {
  date: string;
  techniques: string[];
  photos: ClassMedia[];
  videos: ClassMedia[];
};

export type DriveDayVideo = {
  id: string;
  label: string;
  mime: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type TokenClient = {
  requestAccessToken: (override?: { prompt?: '' | 'consent' }) => void;
};

type GoogleTokenApi = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleTokenApi;
  }
}

export type GoogleClientIdStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Build config wins. A stored paste is kept only for a dev build that has no
 * baked id, and it never overrides `VITE_GOOGLE_CLIENT_ID`.
 */
export function resolveOwnedGoogleClientId(input: {
  envValue: string | undefined;
  storedValue: string | null;
  dev: boolean;
}): { clientId: string; discardStored: boolean } {
  const fromEnv = input.envValue?.trim() ?? '';
  if (fromEnv) return { clientId: fromEnv, discardStored: true };
  if (input.dev) {
    const stored = input.storedValue?.trim() ?? '';
    return { clientId: stored, discardStored: false };
  }
  return { clientId: '', discardStored: true };
}

export function applyOwnedGoogleClientId(
  storage: GoogleClientIdStore | null,
  input: { envValue: string | undefined; dev: boolean },
): string {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(GOOGLE_CLIENT_ID_KEY) ?? null;
  } catch {
    stored = null;
  }
  const resolved = resolveOwnedGoogleClientId({
    envValue: input.envValue,
    storedValue: stored,
    dev: input.dev,
  });
  if (resolved.discardStored) {
    try {
      storage?.removeItem(GOOGLE_CLIENT_ID_KEY);
    } catch {
      /* a stale pasted id must not override the build */
    }
  }
  return resolved.clientId;
}

/** Dev-only paste. A production call deletes the legacy key instead. */
export function writeDevGoogleClientId(
  storage: GoogleClientIdStore | null,
  input: { envValue: string | undefined; dev: boolean; value: string },
): void {
  const owned = input.envValue?.trim() ?? '';
  if (!input.dev || owned) {
    try {
      storage?.removeItem(GOOGLE_CLIENT_ID_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  const trimmed = input.value.trim();
  try {
    if (!storage) return;
    if (trimmed) storage.setItem(GOOGLE_CLIENT_ID_KEY, trimmed);
    else storage.removeItem(GOOGLE_CLIENT_ID_KEY);
  } catch {
    /* the field still shows what they typed */
  }
}

function envGoogleClientId(): string | undefined {
  // Direct member access so Vite inlines the build value. Node tests have no env object.
  try {
    const fromEnv = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    return typeof fromEnv === 'string' ? fromEnv : undefined;
  } catch {
    return undefined;
  }
}

function isDevBuild(): boolean {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
}

function browserClientIdStorage(): GoogleClientIdStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Client id baked into this build. Empty when Advantage has not set it yet. */
export function ownedGoogleClientId(): string {
  return envGoogleClientId()?.trim() ?? '';
}

export function googleClientId(): string {
  return applyOwnedGoogleClientId(browserClientIdStorage(), {
    envValue: envGoogleClientId(),
    dev: isDevBuild(),
  });
}

export function saveGoogleClientId(value: string): void {
  writeDevGoogleClientId(browserClientIdStorage(), {
    envValue: envGoogleClientId(),
    dev: isDevBuild(),
    value,
  });
}

export type DriveAuthCode = 'missing-client' | 'invalid-client' | 'cancelled' | 'failed';

export type DriveTokenOutcome =
  | { ok: true; token: string }
  | { ok: false; code: DriveAuthCode; detail: string | null };

export function classifyDriveAuthDetail(detail: string | null | undefined): 'invalid-client' | 'cancelled' | 'failed' {
  const text = detail ?? '';
  if (/invalid_client|deleted_client|unauthorized_client|client was not found|client not found/i.test(text)) {
    return 'invalid-client';
  }
  if (/popup_closed|access_denied|user_cancel/i.test(text)) return 'cancelled';
  return 'failed';
}

/** Owner copy stays plain. A local dev build can add a short hint. */
export function driveSignInFailureCopy(input: {
  code: DriveAuthCode;
  detail?: string | null;
  dev?: boolean;
}): string {
  if (input.code === 'missing-client') return DRIVE_SETUP_NEEDED;
  const dev = input.dev ?? isDevBuild();
  if (!dev) return DRIVE_SIGN_IN_FAILED;
  if (input.code === 'invalid-client') {
    return `${DRIVE_SIGN_IN_FAILED} Dev: Google did not recognize this build, or this Google account is not a test user.`;
  }
  if (input.code === 'cancelled') {
    return `${DRIVE_SIGN_IN_FAILED} Dev: the Google window closed before sign-in finished.`;
  }
  const detail = input.detail?.trim() ?? '';
  if (detail) return `${DRIVE_SIGN_IN_FAILED} Dev: ${detail.slice(0, 140)}`;
  return DRIVE_SIGN_IN_FAILED;
}

export function driveOwnerFacingError(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  const code = classifyDriveAuthDetail(detail);
  if (code === 'invalid-client') return driveSignInFailureCopy({ code, detail });
  const trimmed = detail.trim();
  if (!trimmed) return 'Google Drive could not be opened.';
  if (isDevBuild()) return trimmed.slice(0, 180);
  if (
    trimmed.length <= 180 &&
    !/[{}]/.test(trimmed) &&
    !/client id|oauth|cloud console|client secret/i.test(trimmed)
  ) {
    return trimmed;
  }
  return 'Google Drive could not be opened.';
}

export function lessonDriveFileName(dateKey: string, coachName: string): string {
  const who = coachName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'coach';
  return `advantage-lesson-${dateKey}-${who}.json`;
}

export function driveQueryLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildLessonDocument(input: {
  date: string;
  coachName: string;
  savedAt: number;
  kind: 'draft' | 'distribution';
  distributedAt: number | null;
  plan: TrainingNotesPlan;
  media: DriveLessonMedia[];
}): DriveLessonDocument {
  return {
    advantage: 'lesson-plan',
    version: 1,
    date: input.date,
    coachName: input.coachName.trim().slice(0, 80),
    savedAt: input.savedAt,
    kind: input.kind,
    distributedAt: input.distributedAt,
    plan: input.plan,
    media: input.media.map((item) => ({
      section: item.section,
      index: item.section === 'technique' ? item.index : null,
      localClipId: item.localClipId,
      driveFileId: item.driveFileId,
      name: item.name,
      mime: item.mime,
    })),
  };
}

export function parseLessonDocument(raw: unknown): DriveLessonDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<DriveLessonDocument>;
  if (record.advantage !== 'lesson-plan' || record.version !== 1) return null;
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return null;
  if (!record.plan || typeof record.plan !== 'object') return null;
  return record as DriveLessonDocument;
}

export function localDayFromIso(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return localDateKey(date);
}

export function fileClassDay(file: DriveFileMeta, lessonDate?: string | null): string | null {
  const stamped = file.appProperties?.date;
  if (stamped && /^\d{4}-\d{2}-\d{2}$/.test(stamped)) return stamped;
  if (lessonDate && /^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) return lessonDate;
  return localDayFromIso(file.modifiedTime);
}

function isLessonFile(file: DriveFileMeta): boolean {
  return file.appProperties?.advantage === 'lesson' || file.name.startsWith('advantage-lesson-');
}

/**
 * Group real Drive files into days. Lesson JSON supplies technique titles.
 * Photos and videos are files in the folder. Nothing is invented for a missing day.
 */
export function buildClassHistory(input: {
  files: readonly DriveFileMeta[];
  lessons: readonly { fileId: string; doc: DriveLessonDocument }[];
}): ClassDay[] {
  const lessonsByFile = new Map(input.lessons.map((item) => [item.fileId, item.doc]));
  const days = new Map<string, ClassDay>();
  const ensure = (date: string): ClassDay => {
    const existing = days.get(date);
    if (existing) return existing;
    const created: ClassDay = { date, techniques: [], photos: [], videos: [] };
    days.set(date, created);
    return created;
  };

  for (const file of input.files) {
    if (file.mimeType === DRIVE_FOLDER_MIME) continue;
    const lesson = lessonsByFile.get(file.id) ?? null;
    const date = fileClassDay(file, lesson?.date ?? null);
    if (!date) continue;
    if (isLessonFile(file) || file.mimeType === 'application/json') {
      const day = ensure(date);
      for (const tech of lesson?.plan.techniques ?? []) {
        const title = tech.title.trim();
        if (title && !day.techniques.includes(title)) day.techniques.push(title);
      }
      continue;
    }
    const mime = file.mimeType.toLowerCase();
    const media: ClassMedia = {
      id: file.id,
      name: file.name,
      mime,
      thumbnailLink: file.thumbnailLink ?? null,
    };
    if (mime.startsWith('image/')) ensure(date).photos.push(media);
    else if (mime.startsWith('video/')) ensure(date).videos.push(media);
  }

  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function videosOnDay(days: readonly ClassDay[], dateKey: string): DriveDayVideo[] {
  const day = days.find((item) => item.date === dateKey);
  if (!day) return [];
  return day.videos.map((video) => ({
    id: video.id,
    label: video.name,
    mime: video.mime || 'video/mp4',
  }));
}

export function readDriveBinding(): DriveBinding | null {
  try {
    const raw = localStorage.getItem(DRIVE_BINDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DriveBinding>;
    if (!parsed.folderId || !parsed.folderName) return null;
    return {
      folderId: parsed.folderId,
      folderName: parsed.folderName,
      email: parsed.email ?? null,
    };
  } catch {
    return null;
  }
}

const bindingListeners = new Set<() => void>();
let bindingCacheRaw: string | null = null;
let bindingCache: DriveBinding | null = null;
let bindingCacheReady = false;

export function subscribeDriveBinding(listener: () => void): () => void {
  bindingListeners.add(listener);
  return () => bindingListeners.delete(listener);
}

function notifyDriveBinding(): void {
  bindingListeners.forEach((listener) => listener());
}

/** Stable snapshot for React. A new object is returned only when storage changes. */
export function getDriveBindingSnapshot(): DriveBinding | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DRIVE_BINDING_KEY);
  } catch {
    raw = null;
  }
  if (bindingCacheReady && raw === bindingCacheRaw) return bindingCache;
  bindingCacheReady = true;
  bindingCacheRaw = raw;
  bindingCache = readDriveBinding();
  return bindingCache;
}

export function writeDriveBinding(binding: DriveBinding | null): void {
  try {
    if (!binding) localStorage.removeItem(DRIVE_BINDING_KEY);
    else localStorage.setItem(DRIVE_BINDING_KEY, JSON.stringify(binding));
  } catch {
    /* the in-memory choice still works until reload */
  }
  notifyDriveBinding();
}

type StoredToken = { accessToken: string; expiresAt: number };

function readStoredToken(): string | null {
  try {
    const raw = sessionStorage.getItem(DRIVE_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.accessToken || parsed.expiresAt < Date.now() + 60_000) return null;
    return parsed.accessToken;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string, expiresIn: number): void {
  const payload: StoredToken = {
    accessToken: token,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
  };
  try {
    sessionStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(payload));
  } catch {
    /* memory copy below still covers this page */
  }
}

export function clearDriveSession(): void {
  try {
    sessionStorage.removeItem(DRIVE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  writeDriveBinding(null);
}

function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in needs a browser.'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.append(script);
  });
}

function requestDriveTokenOutcome(mode: 'silent' | 'consent'): Promise<DriveTokenOutcome> {
  const cached = readStoredToken();
  if (cached && mode === 'silent') return Promise.resolve({ ok: true, token: cached });
  const clientId = googleClientId();
  if (!clientId) return Promise.resolve({ ok: false, code: 'missing-client', detail: null });
  return loadGis().then(
    () =>
      new Promise((resolve) => {
        const client = window.google?.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPES,
          callback: (response) => {
            if (!response.access_token || response.error) {
              const detail = response.error ?? null;
              resolve({ ok: false, code: classifyDriveAuthDetail(detail), detail });
              return;
            }
            writeStoredToken(response.access_token, response.expires_in ?? 3600);
            resolve({ ok: true, token: response.access_token });
          },
          error_callback: (error) => {
            const detail = error?.type ?? null;
            resolve({ ok: false, code: classifyDriveAuthDetail(detail), detail });
          },
        });
        if (!client) {
          resolve({ ok: false, code: 'failed', detail: null });
          return;
        }
        client.requestAccessToken(mode === 'consent' ? { prompt: 'consent' } : { prompt: '' });
      }),
    (reason: unknown) => {
      const detail = reason instanceof Error ? reason.message : null;
      return { ok: false as const, code: 'failed' as const, detail };
    },
  );
}

/** Popup when `consent`, otherwise reuse a grant. Does not invent a session. */
export function requestDriveToken(mode: 'silent' | 'consent'): Promise<string | null> {
  return requestDriveTokenOutcome(mode).then((result) => (result.ok ? result.token : null));
}

/** Connect-button sign-in. Includes a reason so the card can stay in plain language. */
export function requestDriveConsent(): Promise<DriveTokenOutcome> {
  return requestDriveTokenOutcome('consent');
}

type DriveFetch = typeof fetch;

async function driveJson<T>(
  token: string,
  url: string,
  init: RequestInit = {},
  fetcher: DriveFetch = fetch,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail.slice(0, 180) || `Google Drive returned ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listDriveFolders(token: string, fetcher: DriveFetch = fetch): Promise<DriveFolderChoice[]> {
  const query = `mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`;
  const url =
    'https://www.googleapis.com/drive/v3/files?pageSize=100&orderBy=name&fields=files(id,name)&q=' +
    encodeURIComponent(query);
  const data = await driveJson<{ files?: DriveFolderChoice[] }>(token, url, {}, fetcher);
  return (data.files ?? []).filter((folder) => folder.id && folder.name);
}

export async function createLessonRoot(token: string, fetcher: DriveFetch = fetch): Promise<DriveFolderChoice> {
  const created = await driveJson<DriveFolderChoice>(
    token,
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    {
      method: 'POST',
      body: JSON.stringify({
        name: LESSON_ROOT_NAME,
        mimeType: DRIVE_FOLDER_MIME,
        appProperties: { advantageRole: 'lesson-root' },
      }),
    },
    fetcher,
  );
  if (!created.id) throw new Error('Google Drive did not return the new folder.');
  return { id: created.id, name: created.name || LESSON_ROOT_NAME };
}

export async function driveAccountEmail(token: string, fetcher: DriveFetch = fetch): Promise<string | null> {
  const about = await driveJson<{ user?: { emailAddress?: string } }>(
    token,
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
    {},
    fetcher,
  );
  return about.user?.emailAddress ?? null;
}

export async function listFolderFiles(
  token: string,
  folderId: string,
  fetcher: DriveFetch = fetch,
): Promise<DriveFileMeta[]> {
  const files: DriveFileMeta[] = [];
  let pageToken = '';
  for (let page = 0; page < 3; page += 1) {
    const query = `'${driveQueryLiteral(folderId)}' in parents and trashed=false`;
    const url =
      'https://www.googleapis.com/drive/v3/files?pageSize=100&fields=' +
      encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink,appProperties)') +
      '&q=' +
      encodeURIComponent(query) +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await driveJson<{ nextPageToken?: string; files?: DriveFileMeta[] }>(token, url, {}, fetcher);
    files.push(...(data.files ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return files;
}

async function downloadJson(
  token: string,
  fileId: string,
  fetcher: DriveFetch,
): Promise<unknown> {
  const response = await fetcher(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadClassHistory(
  token: string,
  folderId: string,
  fetcher: DriveFetch = fetch,
): Promise<ClassDay[]> {
  const files = await listFolderFiles(token, folderId, fetcher);
  const lessons: { fileId: string; doc: DriveLessonDocument }[] = [];
  const lessonFiles = files.filter(isLessonFile).slice(0, 40);
  for (const file of lessonFiles) {
    const raw = await downloadJson(token, file.id, fetcher);
    const doc = parseLessonDocument(raw);
    if (doc) lessons.push({ fileId: file.id, doc });
  }
  return buildClassHistory({ files, lessons });
}

function multipartRelated(metadata: unknown, json: string): { body: string; contentType: string } {
  const boundary = `advantage_${Math.random().toString(36).slice(2)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    json,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

export async function upsertLessonFile(input: {
  token: string;
  folderId: string;
  document: DriveLessonDocument;
  fetcher?: DriveFetch;
}): Promise<{ fileId: string; revisions: number }> {
  const fetcher = input.fetcher ?? fetch;
  const name = lessonDriveFileName(input.document.date, input.document.coachName);
  const query = `name='${driveQueryLiteral(name)}' and '${driveQueryLiteral(input.folderId)}' in parents and trashed=false`;
  const found = await driveJson<{ files?: { id: string }[] }>(
    input.token,
    'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)&q=' + encodeURIComponent(query),
    {},
    fetcher,
  );
  const existingId = found.files?.[0]?.id ?? null;
  const metadata = existingId
    ? {
        name,
        mimeType: 'application/json',
        appProperties: {
          advantage: 'lesson',
          date: input.document.date,
          coach: input.document.coachName.slice(0, 60),
        },
      }
    : {
        name,
        parents: [input.folderId],
        mimeType: 'application/json',
        appProperties: {
          advantage: 'lesson',
          date: input.document.date,
          coach: input.document.coachName.slice(0, 60),
        },
      };
  const payload = multipartRelated(metadata, JSON.stringify(input.document));
  const endpoint = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const saved = await driveJson<{ id: string }>(
    input.token,
    endpoint,
    {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': payload.contentType },
      body: payload.body,
    },
    fetcher,
  );
  const fileId = saved.id || existingId;
  if (!fileId) throw new Error('Google Drive did not return a file id.');
  let revisions = 1;
  try {
    const listed = await driveJson<{ revisions?: { id: string }[] }>(
      input.token,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/revisions?pageSize=100&fields=revisions(id)`,
      {},
      fetcher,
    );
    revisions = listed.revisions?.length ?? 1;
  } catch {
    revisions = 1;
  }
  return { fileId, revisions };
}

export async function downloadDriveFile(token: string, fileId: string, fetcher: DriveFetch = fetch): Promise<Blob> {
  const response = await fetcher(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('That Drive video could not be downloaded.');
  return response.blob();
}

export async function loadTodayDriveVideos(dateKey: string): Promise<{
  status: 'disconnected' | 'needs-sign-in' | 'ready';
  videos: DriveDayVideo[];
}> {
  const binding = readDriveBinding();
  if (!binding) return { status: 'disconnected', videos: [] };
  const token = await requestDriveToken('silent');
  if (!token) return { status: 'needs-sign-in', videos: [] };
  const days = await loadClassHistory(token, binding.folderId);
  return { status: 'ready', videos: videosOnDay(days, dateKey) };
}

/**
 * Write one lesson JSON into the connected folder.
 * Returns null when this browser has not connected Drive — the phone copy remains.
 */
export async function publishLessonToDrive(document: DriveLessonDocument): Promise<{
  fileId: string;
  revisions: number;
} | null> {
  if (typeof window === 'undefined') return null;
  const binding = readDriveBinding();
  if (!binding) return null;
  const token = await requestDriveToken('silent');
  if (!token) return null;
  return upsertLessonFile({ token, folderId: binding.folderId, document });
}
