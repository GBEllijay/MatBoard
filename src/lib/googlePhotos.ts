/**
 * Google Photos for Media Console.
 *
 * The gym’s photos and videos stay in the gym’s Google Photos account.
 * Advantage does not host those bytes. This module talks to Google from
 * the browser only. There is no client secret.
 *
 * Sign-in reuses the Advantage Web client id (`VITE_GOOGLE_CLIENT_ID`),
 * the same id Google Drive uses. The scope is the Photos Picker API.
 * `photoslibrary.readonly` was removed on 31 March 2025 and is not requested.
 * Albums are not listed by this app. The owner searches for an album or
 * collection inside Google’s picker, then Advantage copies the chosen
 * files onto this phone so the TV can play them.
 */

import { classifyDriveAuthDetail, googleClientId, type DriveAuthCode } from './googleDrive.ts';

export const PHOTOS_BINDING_KEY = 'matboard.pro.googlePhotos.v1';
const PHOTOS_TOKEN_KEY = 'matboard.pro.googlePhotosToken';

/** Photos Picker. Not the removed Library scope. */
export const PHOTOS_SCOPES = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

export const PHOTOS_LIBRARY_ID = 'library';
export const PHOTOS_LIBRARY_NAME = 'Google Photos';
/** Google’s picker accepts at most 2000. Keep a batch this phone can store. */
export const PHOTOS_PICK_MAX = '50';

export const PHOTOS_SETUP_NEEDED =
  'Google Photos is not available on this build yet — contact Advantage.';
export const PHOTOS_SIGN_IN_FAILED =
  'Google did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website.';
export const PHOTOS_SIGN_IN_AGAIN = 'Sign in to Google Photos again to pick those files.';
export const PHOTOS_CHOOSE_LIBRARY =
  'Confirm this Google Photos library. Pick albums and photos from Media Console. Search for a collection there. Advantage does not host the files.';
export const PHOTOS_LESSON_STAYS =
  'Lesson plans stay in the gym Google Drive or OneDrive folder. Google Photos is for picking photos and videos the gym already owns.';
export const PHOTOS_CONNECTED =
  'This Google Photos library is connected. In Media Console, Pick from Google Photos opens it. Search for an album or collection there. Advantage does not host the photos or videos.';
export const PHOTOS_PICK_LABEL = 'Pick from Google Photos';
export const PHOTOS_WITH_DRIVE_STAY =
  'Pick from gallery is this phone. Pick from Google Photos uses the connected library, including albums. Google Drive is an additional source. Advantage does not host those files.';
export const PHOTOS_PICK_TITLE = 'Pick from Google Photos';
export const PHOTOS_PICK_WAITING =
  'Google Photos is open. Search for an album or collection, select the photos or videos, then tap Done. They stay in the gym account. This phone keeps a copy so the TV can play them.';
export const PHOTOS_PICK_OPEN = 'Open Google Photos';
export const PHOTOS_PICK_EMPTY = 'Nothing was selected in Google Photos.';
export const PHOTOS_PICK_TIMED_OUT = 'Google Photos closed before any photos were selected. Try again.';
export const PHOTOS_PICK_FAILED = 'Google Photos could not be opened.';
export const PHOTOS_NEED_CONNECT =
  'Connect Google Photos to pick albums and photos. They stay in the gym account. Advantage does not host them.';
export const PHOTOS_WEB_URL = 'https://photos.google.com/';

export type PhotosPickKind = 'photo' | 'video' | 'any';

export type PhotosBinding = {
  libraryId: string;
  libraryName: string;
  email: string | null;
};

export type PhotosAuthCode = DriveAuthCode;

export type PhotosTokenOutcome =
  | { ok: true; token: string }
  | { ok: false; code: PhotosAuthCode; detail: string | null };

export type PhotosPickedItem = {
  id: string;
  name: string;
  mime: string;
  baseUrl: string;
  kind: 'photo' | 'video';
  videoReady: boolean;
};

export type PhotosPickerSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet: boolean;
  pollInterval?: string;
  timeoutIn?: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

function isDevBuild(): boolean {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
}

export function photosSignInFailureCopy(input: {
  code: PhotosAuthCode;
  detail?: string | null;
  dev?: boolean;
}): string {
  if (input.code === 'missing-client') return PHOTOS_SETUP_NEEDED;
  const dev = input.dev ?? isDevBuild();
  if (!dev) return PHOTOS_SIGN_IN_FAILED;
  if (input.code === 'invalid-client') {
    return `${PHOTOS_SIGN_IN_FAILED} Dev: Google did not recognize this build, or this Google account is not a test user.`;
  }
  if (input.code === 'cancelled') {
    return `${PHOTOS_SIGN_IN_FAILED} Dev: the Google window closed before sign-in finished.`;
  }
  const detail = input.detail?.trim() ?? '';
  if (detail) return `${PHOTOS_SIGN_IN_FAILED} Dev: ${detail.slice(0, 140)}`;
  return PHOTOS_SIGN_IN_FAILED;
}

export function photosOwnerFacingError(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  const code = classifyDriveAuthDetail(detail);
  if (code === 'invalid-client') return photosSignInFailureCopy({ code, detail });
  const trimmed = detail.trim();
  if (!trimmed || trimmed === 'Aborted') return PHOTOS_PICK_FAILED;
  if (isDevBuild()) return trimmed.slice(0, 180);
  if (
    trimmed.length <= 180 &&
    !/[{}]/.test(trimmed) &&
    !/client id|oauth|cloud console|client secret|photoslibrary/i.test(trimmed)
  ) {
    return trimmed;
  }
  return PHOTOS_PICK_FAILED;
}

export function photosLibraryChoice(): { id: string; name: string } {
  return { id: PHOTOS_LIBRARY_ID, name: PHOTOS_LIBRARY_NAME };
}

/** Google duration strings look like `3.5s`. Unknown text uses `fallbackSeconds`. */
export function parseDurationSeconds(value: string | undefined, fallbackSeconds: number): number {
  const match = /^(-?\d+(?:\.\d+)?)s$/.exec((value ?? '').trim());
  if (!match) return fallbackSeconds;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return fallbackSeconds;
  return seconds;
}

export function photosPollWaitMs(pollInterval: string | undefined): number {
  const seconds = parseDurationSeconds(pollInterval, 2);
  return Math.min(30_000, Math.max(1000, Math.round(seconds * 1000)));
}

/** `ready` lists items. `timeout` stops. `wait` sleeps `photosPollWaitMs`. */
export function nextPhotosPoll(input: {
  elapsedMs: number;
  pollInterval?: string;
  timeoutIn?: string;
  mediaItemsSet: boolean;
}): 'ready' | 'wait' | 'timeout' {
  if (input.mediaItemsSet) return 'ready';
  const timeoutSec = parseDurationSeconds(input.timeoutIn, 300);
  if (timeoutSec === 0 || input.elapsedMs >= timeoutSec * 1000) return 'timeout';
  return 'wait';
}

/** Web apps append `/autoclose` so Google closes the window after Done. */
export function photosPickerUrl(pickerUri: string): string {
  const trimmed = pickerUri.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/autoclose')) return trimmed;
  return `${trimmed}/autoclose`;
}

/** `=d` keeps photo bytes. `=dv` is the video download. */
export function photosContentUrl(baseUrl: string, kind: 'photo' | 'video'): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  const suffix = kind === 'video' ? '=dv' : '=d';
  if (trimmed.endsWith(suffix)) return trimmed;
  return `${trimmed}${suffix}`;
}

export function photosKindMissCopy(kind: PhotosPickKind): string {
  if (kind === 'video') return 'This folder takes videos. Nothing selected in Google Photos was a video.';
  if (kind === 'photo') return 'This folder takes photos. Nothing selected in Google Photos was a photo.';
  return PHOTOS_PICK_EMPTY;
}

export function photosImportProgressLabel(done: number, total: number): string {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0) return 'Opening files from Google Photos…';
  const saved = Math.min(safeTotal, Math.max(0, done));
  const shown = saved > 0 ? saved : 1;
  const noun = safeTotal === 1 ? 'file' : 'files';
  return `Opening ${shown} of ${safeTotal} ${noun} from Google Photos…`;
}

function itemKind(type: string, mime: string): 'photo' | 'video' | null {
  const declared = type.trim().toUpperCase();
  if (declared === 'PHOTO') return 'photo';
  if (declared === 'VIDEO') return 'video';
  const value = mime.trim().toLowerCase();
  if (value.startsWith('image/')) return 'photo';
  if (value.startsWith('video/')) return 'video';
  return null;
}

export function photosItemsFromList(payload: unknown): PhotosPickedItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as { mediaItems?: unknown }).mediaItems;
  if (!Array.isArray(rows)) return [];
  const items: PhotosPickedItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as {
      id?: unknown;
      type?: unknown;
      mediaFile?: {
        baseUrl?: unknown;
        mimeType?: unknown;
        filename?: unknown;
        mediaFileMetadata?: { videoMetadata?: { processingStatus?: unknown } };
      };
    };
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const file = record.mediaFile;
    const baseUrl = typeof file?.baseUrl === 'string' ? file.baseUrl.trim() : '';
    const mime = typeof file?.mimeType === 'string' ? file.mimeType.trim() : '';
    const name = typeof file?.filename === 'string' ? file.filename.trim() : '';
    const kind = itemKind(typeof record.type === 'string' ? record.type : '', mime);
    if (!id || !baseUrl || !kind || seen.has(id)) continue;
    seen.add(id);
    const status = file?.mediaFileMetadata?.videoMetadata?.processingStatus;
    const videoReady = kind !== 'video' || (status !== 'PROCESSING' && status !== 'FAILED');
    items.push({
      id,
      name: name || (kind === 'video' ? 'Video' : 'Photo'),
      mime: mime || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      baseUrl,
      kind,
      videoReady,
    });
  }
  return items;
}

export function photosItemsForKind(items: readonly PhotosPickedItem[], kind: PhotosPickKind): PhotosPickedItem[] {
  if (kind === 'any') return [...items];
  return items.filter((item) => item.kind === kind);
}

export function readPhotosBinding(): PhotosBinding | null {
  try {
    const raw = localStorage.getItem(PHOTOS_BINDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PhotosBinding>;
    if (parsed.libraryId !== PHOTOS_LIBRARY_ID || !parsed.libraryName) return null;
    return {
      libraryId: parsed.libraryId,
      libraryName: parsed.libraryName,
      email: parsed.email ?? null,
    };
  } catch {
    return null;
  }
}

const bindingListeners = new Set<() => void>();
let bindingCacheRaw: string | null = null;
let bindingCache: PhotosBinding | null = null;
let bindingCacheReady = false;

export function subscribePhotosBinding(listener: () => void): () => void {
  bindingListeners.add(listener);
  return () => bindingListeners.delete(listener);
}

function notifyPhotosBinding(): void {
  bindingListeners.forEach((listener) => listener());
}

export function getPhotosBindingSnapshot(): PhotosBinding | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PHOTOS_BINDING_KEY);
  } catch {
    raw = null;
  }
  if (bindingCacheReady && raw === bindingCacheRaw) return bindingCache;
  bindingCacheReady = true;
  bindingCacheRaw = raw;
  bindingCache = readPhotosBinding();
  return bindingCache;
}

export function writePhotosBinding(binding: PhotosBinding | null): void {
  try {
    if (!binding) localStorage.removeItem(PHOTOS_BINDING_KEY);
    else localStorage.setItem(PHOTOS_BINDING_KEY, JSON.stringify(binding));
  } catch {
    /* the in-memory choice still works until reload */
  }
  bindingCacheReady = false;
  notifyPhotosBinding();
}

type StoredToken = { accessToken: string; expiresAt: number };

function readStoredToken(): string | null {
  try {
    const raw = sessionStorage.getItem(PHOTOS_TOKEN_KEY);
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
    sessionStorage.setItem(PHOTOS_TOKEN_KEY, JSON.stringify(payload));
  } catch {
    /* memory copy below still covers this page */
  }
}

export function clearPhotosSession(): void {
  try {
    sessionStorage.removeItem(PHOTOS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  writePhotosBinding(null);
}

function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in needs a browser.'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error('Could not load Google sign-in.'));
    };
    const found = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (found) {
      found.addEventListener('load', finish, { once: true });
      found.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.append(script);
  });
}

function requestPhotosTokenOutcome(mode: 'silent' | 'consent'): Promise<PhotosTokenOutcome> {
  const cached = readStoredToken();
  if (cached && mode === 'silent') return Promise.resolve({ ok: true, token: cached });
  const clientId = googleClientId();
  if (!clientId) return Promise.resolve({ ok: false, code: 'missing-client', detail: null });
  return loadGis().then(
    () =>
      new Promise((resolve) => {
        const client = window.google?.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: PHOTOS_SCOPES,
          callback: (response: TokenResponse) => {
            if (!response.access_token || response.error) {
              const detail = response.error ?? null;
              resolve({ ok: false, code: classifyDriveAuthDetail(detail), detail });
              return;
            }
            writeStoredToken(response.access_token, response.expires_in ?? 3600);
            resolve({ ok: true, token: response.access_token });
          },
          error_callback: (error: { type?: string }) => {
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

export function requestPhotosToken(mode: 'silent' | 'consent'): Promise<string | null> {
  return requestPhotosTokenOutcome(mode).then((result) => (result.ok ? result.token : null));
}

export function requestPhotosConsent(): Promise<PhotosTokenOutcome> {
  return requestPhotosTokenOutcome('consent');
}

type PhotosFetch = typeof fetch;

async function photosJson<T>(token: string, url: string, init: RequestInit = {}, fetcher: PhotosFetch = fetch): Promise<T> {
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
    throw new Error(detail.slice(0, 180) || `Google Photos returned ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function sessionFromApi(payload: unknown): PhotosPickerSession | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as {
    id?: unknown;
    pickerUri?: unknown;
    mediaItemsSet?: unknown;
    pollingConfig?: { pollInterval?: unknown; timeoutIn?: unknown };
  };
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  const pickerUri = typeof record.pickerUri === 'string' ? record.pickerUri.trim() : '';
  const pollInterval =
    typeof record.pollingConfig?.pollInterval === 'string' ? record.pollingConfig.pollInterval : undefined;
  const timeoutIn = typeof record.pollingConfig?.timeoutIn === 'string' ? record.pollingConfig.timeoutIn : undefined;
  return {
    id,
    pickerUri,
    mediaItemsSet: record.mediaItemsSet === true,
    pollInterval,
    timeoutIn,
  };
}

export async function createPhotosPickerSession(token: string, fetcher: PhotosFetch = fetch): Promise<PhotosPickerSession> {
  const created = await photosJson<unknown>(
    token,
    'https://photospicker.googleapis.com/v1/sessions',
    {
      method: 'POST',
      body: JSON.stringify({ pickingConfig: { maxItemCount: PHOTOS_PICK_MAX } }),
    },
    fetcher,
  );
  const session = sessionFromApi(created);
  if (!session?.pickerUri) throw new Error('Google Photos did not open a picking session.');
  return session;
}

export async function getPhotosPickerSession(
  token: string,
  sessionId: string,
  fetcher: PhotosFetch = fetch,
): Promise<PhotosPickerSession> {
  const payload = await photosJson<unknown>(
    token,
    `https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`,
    {},
    fetcher,
  );
  const session = sessionFromApi(payload);
  if (!session) throw new Error('Google Photos did not return the picking session.');
  return session;
}

export async function deletePhotosPickerSession(
  token: string,
  sessionId: string,
  fetcher: PhotosFetch = fetch,
): Promise<void> {
  await fetcher(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listPickedPhotos(
  token: string,
  sessionId: string,
  fetcher: PhotosFetch = fetch,
): Promise<PhotosPickedItem[]> {
  const items: PhotosPickedItem[] = [];
  let pageToken = '';
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({ sessionId, pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await photosJson<{ mediaItems?: unknown; nextPageToken?: string }>(
      token,
      `https://photospicker.googleapis.com/v1/mediaItems?${params.toString()}`,
      {},
      fetcher,
    );
    items.push(...photosItemsFromList(data));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return items;
}

export async function downloadPhotosFile(
  token: string,
  item: Pick<PhotosPickedItem, 'baseUrl' | 'kind' | 'videoReady'>,
  fetcher: PhotosFetch = fetch,
): Promise<Blob> {
  if (item.kind === 'video' && !item.videoReady) {
    throw new Error('That video is still processing in Google Photos.');
  }
  const url = photosContentUrl(item.baseUrl, item.kind);
  if (!url) throw new Error('Google Photos did not return a file.');
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('That Google Photos file could not be opened.');
  return response.blob();
}
