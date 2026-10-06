/**
 * OneDrive via Microsoft Graph. Advantage does not host the bytes.
 * The public browser client id comes from `VITE_MICROSOFT_CLIENT_ID`.
 * Gym owners never paste an id, and this app never uses a client secret.
 *
 * This milestone signs in, lists folders, and can write one small text file.
 * Lesson day packages still go to Google Drive until a later milestone.
 */

import type { CloudItemRef } from './cloudStorage.ts';
import { MICROSOFT_CLIENT_API, publicMicrosoftClientId } from './microsoftClientPublic.ts';

/** Legacy key. Production does not read a pasted id. */
export const MICROSOFT_CLIENT_ID_KEY = 'matboard.pro.microsoftClientId';
export const ONEDRIVE_BINDING_KEY = 'matboard.pro.oneDriveFolder.v1';

/**
 * Delegated Graph scopes the owner adds on the Advantage app registration.
 * MSAL also sends the reserved OpenID scopes. There is no client secret.
 */
export const ONEDRIVE_SCOPES = ['User.Read', 'Files.ReadWrite'] as const;

export const ONEDRIVE_AUTHORITY = 'https://login.microsoftonline.com/common';
export const ONEDRIVE_CONNECT_FILE_NAME = 'advantage-onedrive-connect.txt';
export const ONEDRIVE_CONNECT_FILE_TEXT =
  'Advantage connected this OneDrive folder. This file stays in the gym OneDrive account. Advantage does not host it.';
export const ONEDRIVE_ROOT_NAME = 'Advantage Lesson Plans';

export const ONEDRIVE_SETUP_NEEDED =
  'OneDrive is not available on this build yet — contact Advantage.';
export const ONEDRIVE_DEV_CLIENT_HINT =
  'Dev only. This is not part of the gym owner screen. It is ignored on the live website.';
export const ONEDRIVE_SIGN_IN_FAILED =
  'Microsoft did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website.';
export const ONEDRIVE_FOLDER_EMPTY = 'This OneDrive account does not have any folders yet.';

export const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0/me/drive';

export type OneDriveBinding = {
  folderId: string;
  folderName: string;
  email: string | null;
};

export type OneDriveAuthCode = 'missing-client' | 'invalid-client' | 'cancelled' | 'failed' | 'redirecting';

/** MSAL session flag while a redirect to Microsoft is unfinished. */
export const MSAL_INTERACTION_STATUS_KEY = 'msal.interaction.status';

const ONEDRIVE_SESSION_KEY = 'matboard.pro.oneDriveSession';
const ONEDRIVE_RESUME_KEY = 'matboard.pro.oneDriveResume';
const ONEDRIVE_RESUME_ERROR_KEY = 'matboard.pro.oneDriveResumeError';

export type OneDriveSession = {
  token: string;
  expiresAt: number;
  accountLabel: string | null;
};

/**
 * What a OneDrive tap should do. A saved session lists folders.
 * Otherwise the browser goes to Microsoft and comes back.
 */
export function oneDriveSignInAction(input: {
  clientId: string;
  hasSession: boolean;
}): 'unavailable' | 'session' | 'redirect' {
  if (!input.clientId.trim()) return 'unavailable';
  if (input.hasSession) return 'session';
  return 'redirect';
}

/** SPA redirect URI. Origin only, no path and no trailing slash. */
export function oneDriveRedirectUri(origin: string): string {
  const trimmed = origin.trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+$/i.test(trimmed)) return '';
  return trimmed;
}

export type MicrosoftClientIdStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type GraphList = {
  value?: unknown[];
  '@odata.nextLink'?: string;
};

type GraphItem = {
  id?: string;
  name?: string;
  folder?: unknown;
  mail?: string | null;
  userPrincipalName?: string | null;
};

export function resolveOwnedMicrosoftClientId(input: {
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

export function applyOwnedMicrosoftClientId(
  storage: MicrosoftClientIdStore | null,
  input: { envValue: string | undefined; dev: boolean },
): string {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(MICROSOFT_CLIENT_ID_KEY) ?? null;
  } catch {
    stored = null;
  }
  const resolved = resolveOwnedMicrosoftClientId({
    envValue: input.envValue,
    storedValue: stored,
    dev: input.dev,
  });
  if (resolved.discardStored) {
    try {
      storage?.removeItem(MICROSOFT_CLIENT_ID_KEY);
    } catch {
      /* a stale pasted id must not override the build */
    }
  }
  return resolved.clientId;
}

export function writeDevMicrosoftClientId(
  storage: MicrosoftClientIdStore | null,
  input: { envValue: string | undefined; dev: boolean; value: string },
): void {
  const owned = input.envValue?.trim() ?? '';
  if (!input.dev || owned) {
    try {
      storage?.removeItem(MICROSOFT_CLIENT_ID_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  const trimmed = input.value.trim();
  try {
    if (!storage) return;
    if (trimmed) storage.setItem(MICROSOFT_CLIENT_ID_KEY, trimmed);
    else storage.removeItem(MICROSOFT_CLIENT_ID_KEY);
  } catch {
    /* the field still shows what they typed */
  }
}

function envMicrosoftClientId(): string | undefined {
  // Direct member access so Vite inlines the build value. Node tests have no env object.
  try {
    const fromEnv = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
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

function browserClientIdStorage(): MicrosoftClientIdStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Client id baked into this build. Empty when Advantage has not set it yet. */
export function ownedMicrosoftClientId(): string {
  return publicMicrosoftClientId(envMicrosoftClientId());
}

let runtimeClientId: string | null = null;
let runtimeLoad: Promise<string> | null = null;
const clientIdListeners = new Set<() => void>();

export function subscribeMicrosoftClientId(listener: () => void): () => void {
  clientIdListeners.add(listener);
  return () => clientIdListeners.delete(listener);
}

function notifyMicrosoftClientId(): void {
  clientIdListeners.forEach((listener) => listener());
}

export function microsoftClientId(): string {
  const baked = applyOwnedMicrosoftClientId(browserClientIdStorage(), {
    envValue: envMicrosoftClientId(),
    dev: isDevBuild(),
  });
  const fromBuild = publicMicrosoftClientId(baked);
  if (fromBuild) return fromBuild;
  return publicMicrosoftClientId(runtimeClientId);
}

/**
 * Build-time id when Vite inlined it. Otherwise the Pages Function, which
 * reads the Cloudflare env on the request. Dev builds keep the local field.
 */
export function loadMicrosoftClientId(): Promise<string> {
  const current = microsoftClientId();
  if (current) return Promise.resolve(current);
  if (typeof window === 'undefined') return Promise.resolve('');
  if (runtimeClientId !== null) return Promise.resolve(publicMicrosoftClientId(runtimeClientId));
  if (!runtimeLoad) {
    runtimeLoad = fetch(MICROSOFT_CLIENT_API, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return '';
        const body = (await response.json()) as { clientId?: unknown };
        return publicMicrosoftClientId(typeof body.clientId === 'string' ? body.clientId : '');
      })
      .catch(() => '')
      .then((id) => {
        runtimeClientId = id;
        notifyMicrosoftClientId();
        return id;
      });
  }
  return runtimeLoad;
}

function sessionStore(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readOneDriveSession(): OneDriveSession | null {
  try {
    const raw = sessionStore()?.getItem(ONEDRIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OneDriveSession>;
    if (!parsed.token || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt < Date.now() + 60_000) return null;
    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      accountLabel: parsed.accountLabel ?? null,
    };
  } catch {
    return null;
  }
}

export function writeOneDriveSession(session: OneDriveSession | null): void {
  try {
    const store = sessionStore();
    if (!store) return;
    if (!session) store.removeItem(ONEDRIVE_SESSION_KEY);
    else store.setItem(ONEDRIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* the in-memory sign-in still covers this page */
  }
}

export function markOneDriveResume(): void {
  try {
    sessionStore()?.setItem(ONEDRIVE_RESUME_KEY, '1');
    sessionStore()?.removeItem(ONEDRIVE_RESUME_ERROR_KEY);
  } catch {
    /* the redirect can still finish if the token comes back */
  }
}

export function clearOneDriveResumeFlag(): void {
  try {
    sessionStore()?.removeItem(ONEDRIVE_RESUME_KEY);
  } catch {
    /* ignore */
  }
}

export function writeOneDriveResumeError(message: string): void {
  try {
    sessionStore()?.setItem(ONEDRIVE_RESUME_ERROR_KEY, message);
    sessionStore()?.removeItem(ONEDRIVE_RESUME_KEY);
  } catch {
    /* the sheet can still say sign-in failed */
  }
}

/** `token` means Microsoft already returned an access token. `error` is owner copy. */
export function oneDriveResumeSnapshot(): 'token' | 'error' | null {
  try {
    const store = sessionStore();
    if (!store) return null;
    if (store.getItem(ONEDRIVE_RESUME_ERROR_KEY)) return 'error';
    if (store.getItem(ONEDRIVE_RESUME_KEY) === '1' && readOneDriveSession()) return 'token';
  } catch {
    return null;
  }
  return null;
}

export function takeOneDriveResumeError(): string {
  try {
    const message = sessionStore()?.getItem(ONEDRIVE_RESUME_ERROR_KEY)?.trim() ?? '';
    sessionStore()?.removeItem(ONEDRIVE_RESUME_ERROR_KEY);
    return message || ONEDRIVE_SIGN_IN_FAILED;
  } catch {
    return ONEDRIVE_SIGN_IN_FAILED;
  }
}

/** Close the return sheet. Keeps a valid Microsoft session for the next tap. */
export function dismissOneDriveResume(): void {
  clearOneDriveResumeFlag();
  try {
    sessionStore()?.removeItem(ONEDRIVE_RESUME_ERROR_KEY);
  } catch {
    /* ignore */
  }
}

export function oneDriveRedirectPending(): boolean {
  try {
    const store = sessionStore();
    if (store?.getItem(MSAL_INTERACTION_STATUS_KEY)) return true;
  } catch {
    /* fall through to the hash */
  }
  if (typeof window === 'undefined') return false;
  return /(?:^#|&)(code|error|client_info)=/.test(window.location.hash);
}

export function saveMicrosoftClientId(value: string): void {
  writeDevMicrosoftClientId(browserClientIdStorage(), {
    envValue: envMicrosoftClientId(),
    dev: isDevBuild(),
    value,
  });
}

export function classifyOneDriveAuthDetail(detail: string | null | undefined): 'invalid-client' | 'cancelled' | 'failed' {
  const text = detail ?? '';
  if (/AADSTS700016|AADSTS7000215|AADSTS50011|invalid_client|unauthorized_client|client was not found/i.test(text)) {
    return 'invalid-client';
  }
  if (/user_cancelled|popup_window_error|empty_window_error|access_denied|user_cancel|interaction_in_progress/i.test(text)) {
    return 'cancelled';
  }
  return 'failed';
}

export function oneDriveSignInFailureCopy(input: {
  code: OneDriveAuthCode;
  detail?: string | null;
  dev?: boolean;
}): string {
  if (input.code === 'missing-client') return ONEDRIVE_SETUP_NEEDED;
  const dev = input.dev ?? isDevBuild();
  if (!dev) return ONEDRIVE_SIGN_IN_FAILED;
  if (input.code === 'invalid-client') {
    return `${ONEDRIVE_SIGN_IN_FAILED} Dev: Microsoft did not recognize this build.`;
  }
  if (input.code === 'cancelled') {
    return `${ONEDRIVE_SIGN_IN_FAILED} Dev: the Microsoft window closed before sign-in finished.`;
  }
  const detail = input.detail?.trim() ?? '';
  if (detail) return `${ONEDRIVE_SIGN_IN_FAILED} Dev: ${detail.slice(0, 140)}`;
  return ONEDRIVE_SIGN_IN_FAILED;
}

export function oneDriveOwnerFacingError(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  const code = classifyOneDriveAuthDetail(detail);
  if (code === 'invalid-client' || code === 'cancelled') return oneDriveSignInFailureCopy({ code, detail });
  const trimmed = detail.trim();
  if (!trimmed) return 'OneDrive could not be opened.';
  if (isDevBuild()) return trimmed.slice(0, 180);
  if (
    trimmed.length <= 180 &&
    !/[{}]/.test(trimmed) &&
    !/client id|oauth|azure|client secret|tenant/i.test(trimmed)
  ) {
    return trimmed;
  }
  return 'OneDrive could not be opened.';
}

/** Graph file names cannot contain these characters. */
export function oneDriveFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 180) || ONEDRIVE_CONNECT_FILE_NAME;
}

export function graphChildrenUrl(folderId?: string): string {
  const select = '$select=id,name,folder';
  if (!folderId) return `${GRAPH_ROOT}/root/children?$top=200&${select}`;
  return `${GRAPH_ROOT}/items/${encodeURIComponent(folderId)}/children?$top=200&${select}`;
}

export function graphTextUploadUrl(parentId: string | undefined, name: string): string {
  const fileName = encodeURIComponent(oneDriveFileName(name));
  if (!parentId) return `${GRAPH_ROOT}/root:/${fileName}:/content`;
  return `${GRAPH_ROOT}/items/${encodeURIComponent(parentId)}:/${fileName}:/content`;
}

export function graphCreateChildUrl(parentId?: string): string {
  if (!parentId) return `${GRAPH_ROOT}/root/children`;
  return `${GRAPH_ROOT}/items/${encodeURIComponent(parentId)}/children`;
}

export function oneDriveItemsFromGraph(payload: unknown, foldersOnly = false): CloudItemRef[] {
  const value = (payload as GraphList | null)?.value;
  if (!Array.isArray(value)) return [];
  const items: CloudItemRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as GraphItem;
    if (!row.id || !row.name) continue;
    if (foldersOnly && !row.folder) continue;
    items.push({ id: row.id, name: row.name });
  }
  return items;
}

type OneDriveFetch = typeof fetch;

async function graphError(response: Response): Promise<Error> {
  const detail = await response.text().catch(() => '');
  if (response.status === 401 || response.status === 403) {
    return new Error('OneDrive did not allow this. Sign in again.');
  }
  const trimmed = detail.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (trimmed && !/[{}]/.test(trimmed)) return new Error(trimmed);
  return new Error(`OneDrive returned ${response.status}.`);
}

export async function listOneDriveItems(
  token: string,
  input: { folderId?: string; foldersOnly?: boolean; fetcher?: OneDriveFetch } = {},
): Promise<CloudItemRef[]> {
  const fetcher = input.fetcher ?? fetch;
  let url: string | undefined = graphChildrenUrl(input.folderId);
  const items: CloudItemRef[] = [];
  for (let page = 0; page < 3 && url; page += 1) {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw await graphError(response);
    const payload = (await response.json()) as GraphList;
    items.push(...oneDriveItemsFromGraph(payload, input.foldersOnly ?? false));
    url = payload['@odata.nextLink'];
  }
  return items;
}

export async function saveOneDriveText(
  token: string,
  file: { name: string; text: string },
  folderId?: string,
  fetcher: OneDriveFetch = fetch,
): Promise<CloudItemRef> {
  const name = oneDriveFileName(file.name);
  const response = await fetcher(graphTextUploadUrl(folderId, name), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: file.text,
  });
  if (!response.ok) throw await graphError(response);
  const saved = (await response.json()) as GraphItem;
  if (!saved.id) throw new Error('OneDrive did not return a file id.');
  return { id: saved.id, name: saved.name || name };
}

export async function createOneDriveFolder(
  token: string,
  name: string,
  fetcher: OneDriveFetch = fetch,
  parentId?: string,
): Promise<CloudItemRef> {
  const folderName = oneDriveFileName(name);
  const response = await fetcher(graphCreateChildUrl(parentId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
  if (response.status === 409) {
    const existing = await listOneDriveItems(token, { folderId: parentId, foldersOnly: true, fetcher });
    const match = existing.find((item) => item.name === folderName);
    if (match) return match;
  }
  if (!response.ok) throw await graphError(response);
  const created = (await response.json()) as GraphItem;
  if (!created.id) throw new Error('OneDrive did not return the new folder.');
  return { id: created.id, name: created.name || folderName };
}

export async function oneDriveAccountLabel(token: string, fetcher: OneDriveFetch = fetch): Promise<string | null> {
  const response = await fetcher('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const me = (await response.json()) as GraphItem;
  return me.mail || me.userPrincipalName || null;
}

export function readOneDriveBinding(): OneDriveBinding | null {
  try {
    const raw = localStorage.getItem(ONEDRIVE_BINDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OneDriveBinding>;
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
let bindingCache: OneDriveBinding | null = null;
let bindingCacheReady = false;

export function subscribeOneDriveBinding(listener: () => void): () => void {
  bindingListeners.add(listener);
  return () => bindingListeners.delete(listener);
}

function notifyOneDriveBinding(): void {
  bindingListeners.forEach((listener) => listener());
}

export function getOneDriveBindingSnapshot(): OneDriveBinding | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ONEDRIVE_BINDING_KEY);
  } catch {
    raw = null;
  }
  if (bindingCacheReady && raw === bindingCacheRaw) return bindingCache;
  bindingCacheReady = true;
  bindingCacheRaw = raw;
  bindingCache = readOneDriveBinding();
  return bindingCache;
}

export function writeOneDriveBinding(binding: OneDriveBinding | null): void {
  try {
    if (!binding) localStorage.removeItem(ONEDRIVE_BINDING_KEY);
    else localStorage.setItem(ONEDRIVE_BINDING_KEY, JSON.stringify(binding));
  } catch {
    /* the in-memory choice still works until reload */
  }
  bindingCacheReady = false;
  notifyOneDriveBinding();
}

export function clearOneDriveBinding(): void {
  writeOneDriveBinding(null);
}
