/**
 * iCloud through CloudKit web services. Advantage does not host the bytes.
 * They stay in the gym’s iCloud, inside this app’s private database, and
 * count against that Apple ID’s iCloud storage.
 *
 * Apple does not offer an iCloud Drive API for a website. This is not the
 * Files app, and it is not iCloud Photos. Sign in with Apple does not grant
 * this access. There is no client secret and no Apple private key.
 */

import type { CloudItemRef } from './cloudStorage.ts';
import {
  ICLOUD_CONFIG_API,
  ICLOUD_SIGN_IN_FAILED,
  ICLOUD_RESUME_ERROR_KEY,
  ICLOUD_RESUME_KEY,
  ICLOUD_RETURN_KEY,
  ICLOUD_TOKEN_KEY,
  isAppleSignInUrl,
  isICloudWebAuthToken,
  parseAppleCloudKitConfig,
  safeICloudReturnPath,
  type AppleCloudKitConfig,
} from './appleCloudKitPublic.ts';

export const ICLOUD_DEV_CONFIG_KEY = 'matboard.pro.appleCloudKit';
export const ICLOUD_BINDING_KEY = 'matboard.pro.iCloudFolder.v1';

export const ICLOUD_FOLDER_RECORD = 'AdvantageFolder';
export const ICLOUD_FILE_RECORD = 'AdvantageFile';
export const ICLOUD_CONNECT_FILE_NAME = 'advantage-icloud-connect.txt';
export const ICLOUD_CONNECT_FILE_TEXT =
  'Advantage connected this iCloud place. This note stays in the gym iCloud account. It is not an iCloud Drive file. Advantage does not host it.';
export const ICLOUD_ROOT_NAME = 'Advantage Lesson Plans';

/** CloudKit string fields on one record stay under 1 MB. Leave room for the other fields. */
export const ICLOUD_TEXT_LIMIT = 900_000;

export const ICLOUD_SETUP_NEEDED = 'iCloud is not available on this build yet — contact Advantage.';
export const ICLOUD_DEV_CLIENT_HINT =
  'Dev only. This is not part of the gym owner screen. It is ignored on the live website.';
export { ICLOUD_SIGN_IN_FAILED };
export const ICLOUD_FOLDER_EMPTY = 'This iCloud account does not have an Advantage folder yet.';
export const ICLOUD_TEXT_TOO_BIG = 'That note is too large for iCloud. Keep it under 1 MB.';
export const ICLOUD_COULD_NOT_OPEN = 'iCloud could not be opened.';

export type ICloudBinding = {
  folderId: string;
  folderName: string;
  email: string | null;
};

export type ICloudAuthCode = 'missing-config' | 'cancelled' | 'failed' | 'redirecting';

export type ICloudConfigStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type CloudKitField = { value?: unknown };
type CloudKitRecord = {
  recordName?: string;
  recordType?: string;
  fields?: Record<string, CloudKitField | undefined>;
  serverErrorCode?: string;
  reason?: string;
};

type CloudKitPayload = {
  records?: CloudKitRecord[];
  serverErrorCode?: string;
  reason?: string;
  redirectURL?: string;
  ckWebAuthToken?: string;
  continuationMarker?: string;
  userRecordName?: string;
  firstName?: string;
  lastName?: string;
  nameComponents?: { givenName?: string; familyName?: string };
};

export function iCloudSignInAction(input: { configured: boolean; hasToken: boolean }): 'unavailable' | 'session' | 'redirect' {
  if (!input.configured) return 'unavailable';
  if (input.hasToken) return 'session';
  return 'redirect';
}

export function cloudKitPrivateUrl(
  config: AppleCloudKitConfig,
  operation: string,
  webAuthToken: string | null,
): string {
  const base = `https://api.apple-cloudkit.com/database/1/${encodeURIComponent(config.container)}/${config.environment}/private/${operation}`;
  const params = new URLSearchParams({ ckAPIToken: config.apiToken });
  if (webAuthToken) params.set('ckWebAuthToken', webAuthToken);
  return `${base}?${params.toString()}`;
}

export function cloudKitRedirectUrl(payload: unknown): string | null {
  const row = payload as CloudKitPayload | null;
  if (!row || row.serverErrorCode !== 'AUTHENTICATION_REQUIRED' || typeof row.redirectURL !== 'string') return null;
  return isAppleSignInUrl(row.redirectURL) ? row.redirectURL : null;
}

export function nextWebAuthToken(payload: unknown, previous: string): string {
  const token = (payload as CloudKitPayload | null)?.ckWebAuthToken;
  if (typeof token === 'string' && isICloudWebAuthToken(token)) return token.trim();
  return previous;
}

export function iCloudAccountLabel(payload: unknown): string | null {
  const row = (payload as CloudKitPayload | null) ?? {};
  const given = textValue(row.nameComponents?.givenName) || textValue(row.firstName);
  const family = textValue(row.nameComponents?.familyName) || textValue(row.lastName);
  const name = [given, family].filter(Boolean).join(' ').trim();
  return name || null;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fieldText(record: CloudKitRecord, name: string): string {
  const value = record.fields?.[name]?.value;
  return typeof value === 'string' ? value.trim() : '';
}

export function iCloudItemsFromRecords(payload: unknown, recordType: string): CloudItemRef[] {
  const records = (payload as CloudKitPayload | null)?.records;
  if (!Array.isArray(records)) return [];
  const items: CloudItemRef[] = [];
  for (const record of records) {
    if (!record || record.serverErrorCode || record.recordType !== recordType) continue;
    const id = record.recordName?.trim() ?? '';
    const name = fieldText(record, 'name');
    if (!id || !name) continue;
    items.push({ id, name });
  }
  return items;
}

export function iCloudFilesInFolder(payload: unknown, folderId: string | undefined): CloudItemRef[] {
  const records = (payload as CloudKitPayload | null)?.records;
  if (!Array.isArray(records)) return [];
  const items: CloudItemRef[] = [];
  for (const record of records) {
    if (!record || record.serverErrorCode || record.recordType !== ICLOUD_FILE_RECORD) continue;
    if (folderId && fieldText(record, 'folderRecordName') !== folderId) continue;
    const id = record.recordName?.trim() ?? '';
    const name = fieldText(record, 'name');
    if (!id || !name) continue;
    items.push({ id, name });
  }
  return items;
}

export function iCloudFolderOperation(name: string): { operations: unknown[] } {
  return {
    operations: [
      {
        operationType: 'create',
        record: {
          recordType: ICLOUD_FOLDER_RECORD,
          fields: {
            name: { value: name, type: 'STRING' },
          },
        },
      },
    ],
  };
}

export function iCloudFileOperation(file: { name: string; text: string }, folderId?: string): { operations: unknown[] } {
  const fields: Record<string, { value: string; type: 'STRING' }> = {
    name: { value: file.name, type: 'STRING' },
    body: { value: file.text, type: 'STRING' },
  };
  if (folderId) fields.folderRecordName = { value: folderId, type: 'STRING' };
  return {
    operations: [
      {
        operationType: 'create',
        record: {
          recordType: ICLOUD_FILE_RECORD,
          fields,
        },
      },
    ],
  };
}

export function iCloudQuery(recordType: string, continuationMarker?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: { recordType },
    resultsLimit: 200,
  };
  if (continuationMarker) body.continuationMarker = continuationMarker;
  return body;
}

export function resolveOwnedICloudConfig(input: {
  envContainer: string | undefined;
  envToken: string | undefined;
  envEnvironment: string | undefined;
  storedRaw: string | null;
  dev: boolean;
}): { config: AppleCloudKitConfig | null; discardStored: boolean } {
  const fromEnv = parseAppleCloudKitConfig({
    container: input.envContainer,
    apiToken: input.envToken,
    environment: input.envEnvironment,
  });
  if (fromEnv) return { config: fromEnv, discardStored: true };
  const envTouched = Boolean(input.envContainer?.trim() || input.envToken?.trim() || input.envEnvironment?.trim());
  if (envTouched || !input.dev) return { config: null, discardStored: true };
  let stored: { container?: string; apiToken?: string; environment?: string } | null = null;
  try {
    stored = input.storedRaw ? (JSON.parse(input.storedRaw) as { container?: string; apiToken?: string; environment?: string }) : null;
  } catch {
    stored = null;
  }
  return {
    config: parseAppleCloudKitConfig({
      container: stored?.container,
      apiToken: stored?.apiToken,
      environment: stored?.environment,
    }),
    discardStored: false,
  };
}

function envContainer(): string | undefined {
  // Direct member access so Vite inlines the build value. Node tests have no env object.
  try {
    const fromEnv = import.meta.env.VITE_APPLE_CLOUDKIT_CONTAINER;
    return typeof fromEnv === 'string' ? fromEnv : undefined;
  } catch {
    return undefined;
  }
}

function envToken(): string | undefined {
  try {
    const fromEnv = import.meta.env.VITE_APPLE_CLOUDKIT_API_TOKEN;
    return typeof fromEnv === 'string' ? fromEnv : undefined;
  } catch {
    return undefined;
  }
}

function envEnvironment(): string | undefined {
  try {
    const fromEnv = import.meta.env.VITE_APPLE_CLOUDKIT_ENVIRONMENT;
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

function browserStore(): ICloudConfigStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function ownedICloudConfig(): AppleCloudKitConfig | null {
  return parseAppleCloudKitConfig({
    container: envContainer(),
    apiToken: envToken(),
    environment: envEnvironment(),
  });
}

let runtimeConfig: AppleCloudKitConfig | null = null;

/** Tests and the config request share this slot. A build-time config still wins. */
export function primeICloudConfig(config: AppleCloudKitConfig | null): void {
  runtimeConfig = config;
  runtimeLoaded = config !== null;
}
let runtimeLoaded = false;
let runtimeLoad: Promise<AppleCloudKitConfig | null> | null = null;
const configListeners = new Set<() => void>();
let liveToken = '';

export function subscribeICloudConfig(listener: () => void): () => void {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}

function notifyICloudConfig(): void {
  configListeners.forEach((listener) => listener());
}

function storedConfigRaw(): string | null {
  try {
    return browserStore()?.getItem(ICLOUD_DEV_CONFIG_KEY) ?? null;
  } catch {
    return null;
  }
}

function applyStoredConfig(): AppleCloudKitConfig | null {
  const resolved = resolveOwnedICloudConfig({
    envContainer: envContainer(),
    envToken: envToken(),
    envEnvironment: envEnvironment(),
    storedRaw: storedConfigRaw(),
    dev: isDevBuild(),
  });
  if (resolved.discardStored) {
    try {
      browserStore()?.removeItem(ICLOUD_DEV_CONFIG_KEY);
    } catch {
      /* a stale pasted setup must not override the build */
    }
  }
  return resolved.config;
}

/** Build-time config, then a config loaded from Cloudflare or the dev fields. */
export function iCloudConfig(): AppleCloudKitConfig | null {
  return applyStoredConfig() ?? runtimeConfig;
}

export function loadICloudConfig(): Promise<AppleCloudKitConfig | null> {
  const current = iCloudConfig();
  if (current) return Promise.resolve(current);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (runtimeLoaded) return Promise.resolve(runtimeConfig);
  if (!runtimeLoad) {
    runtimeLoad = fetch(ICLOUD_CONFIG_API, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { container?: unknown; apiToken?: unknown; environment?: unknown };
        return parseAppleCloudKitConfig({
          container: typeof body.container === 'string' ? body.container : '',
          apiToken: typeof body.apiToken === 'string' ? body.apiToken : '',
          environment: typeof body.environment === 'string' ? body.environment : '',
        });
      })
      .catch(() => null)
      .then((config) => {
        runtimeLoaded = true;
        runtimeConfig = config;
        notifyICloudConfig();
        return config;
      });
  }
  return runtimeLoad;
}

export function saveDevICloudConfig(value: { container: string; apiToken: string; environment: string }): void {
  const baked = ownedICloudConfig();
  if (!isDevBuild() || baked) {
    try {
      browserStore()?.removeItem(ICLOUD_DEV_CONFIG_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    browserStore()?.setItem(ICLOUD_DEV_CONFIG_KEY, JSON.stringify(value));
  } catch {
    /* the fields still show what they typed */
  }
  runtimeConfig = parseAppleCloudKitConfig(value);
  if (runtimeConfig) runtimeLoaded = true;
  notifyICloudConfig();
}

export function devICloudConfigDraft(): { container: string; apiToken: string; environment: string } {
  const config = iCloudConfig();
  if (config && !ownedICloudConfig()) {
    return { container: config.container, apiToken: config.apiToken, environment: config.environment };
  }
  try {
    const raw = storedConfigRaw();
    const parsed = raw ? (JSON.parse(raw) as { container?: string; apiToken?: string; environment?: string }) : {};
    return {
      container: parsed.container ?? '',
      apiToken: parsed.apiToken ?? '',
      environment: parsed.environment ?? '',
    };
  } catch {
    return { container: '', apiToken: '', environment: '' };
  }
}

export function rememberICloudWebAuthToken(token: string | null): void {
  const next = token?.trim() ?? '';
  if (!next || !isICloudWebAuthToken(next)) {
    liveToken = '';
    try {
      sessionStore()?.removeItem(ICLOUD_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  liveToken = next;
  try {
    sessionStore()?.setItem(ICLOUD_TOKEN_KEY, next);
  } catch {
    /* this page can still use the in-memory token */
  }
}

export function readICloudWebAuthToken(): string {
  if (liveToken && isICloudWebAuthToken(liveToken)) return liveToken;
  try {
    const stored = sessionStore()?.getItem(ICLOUD_TOKEN_KEY)?.trim() ?? '';
    if (isICloudWebAuthToken(stored)) {
      liveToken = stored;
      return stored;
    }
  } catch {
    /* fall through */
  }
  liveToken = '';
  return '';
}

export function activeICloudWebAuthToken(passed: string): string {
  const live = readICloudWebAuthToken();
  if (live) return live;
  if (isICloudWebAuthToken(passed)) {
    rememberICloudWebAuthToken(passed);
    return passed.trim();
  }
  return '';
}

export function markICloudReturn(path: string): void {
  try {
    const store = sessionStore();
    store?.setItem(ICLOUD_RETURN_KEY, safeICloudReturnPath(path));
    store?.removeItem(ICLOUD_RESUME_ERROR_KEY);
  } catch {
    /* Apple can still send the browser back to the home page */
  }
}

export function markICloudResume(): void {
  try {
    sessionStore()?.setItem(ICLOUD_RESUME_KEY, '1');
    sessionStore()?.removeItem(ICLOUD_RESUME_ERROR_KEY);
  } catch {
    /* the folder list can still open if the token was stored */
  }
}

export function clearICloudResumeFlag(): void {
  try {
    sessionStore()?.removeItem(ICLOUD_RESUME_KEY);
  } catch {
    /* ignore */
  }
}

export function writeICloudResumeError(message: string): void {
  try {
    const store = sessionStore();
    store?.setItem(ICLOUD_RESUME_ERROR_KEY, message);
    store?.removeItem(ICLOUD_RESUME_KEY);
  } catch {
    /* the sheet can still say sign-in failed */
  }
}

export function iCloudResumeSnapshot(): 'token' | 'error' | null {
  try {
    const store = sessionStore();
    if (!store) return null;
    if (store.getItem(ICLOUD_RESUME_ERROR_KEY)) return 'error';
    if (store.getItem(ICLOUD_RESUME_KEY) === '1' && readICloudWebAuthToken()) return 'token';
  } catch {
    return null;
  }
  return null;
}

export function takeICloudResumeError(): string {
  try {
    const message = sessionStore()?.getItem(ICLOUD_RESUME_ERROR_KEY)?.trim() ?? '';
    sessionStore()?.removeItem(ICLOUD_RESUME_ERROR_KEY);
    return message || ICLOUD_SIGN_IN_FAILED;
  } catch {
    return ICLOUD_SIGN_IN_FAILED;
  }
}

const ICLOUD_REAUTH_KEY = 'matboard.icloud.reauth';

/** Avoid sending the browser to Apple again when the last sign-in just failed. */
export function allowICloudReauth(): boolean {
  try {
    const store = sessionStore();
    const previous = Number(store?.getItem(ICLOUD_REAUTH_KEY) || '0');
    if (previous && Date.now() - previous < 60_000) return false;
    store?.setItem(ICLOUD_REAUTH_KEY, String(Date.now()));
  } catch {
    return true;
  }
  return true;
}

export function dismissICloudResume(): void {
  clearICloudResumeFlag();
  try {
    sessionStore()?.removeItem(ICLOUD_RESUME_ERROR_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Apple sometimes returns the web auth token on the site URL itself.
 * Move it into session storage and drop it from the address.
 */
export function settleICloudRedirect(location: Location | null = typeof window === 'undefined' ? null : window.location): boolean {
  if (!location) return false;
  const params = new URLSearchParams(location.search);
  const token = params.get('ckWebAuthToken') || params.get('ckSession') || '';
  if (!isICloudWebAuthToken(token)) return false;
  rememberICloudWebAuthToken(token);
  markICloudResume();
  params.delete('ckWebAuthToken');
  params.delete('ckSession');
  const next = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}${location.hash}`;
  if (typeof window !== 'undefined' && location === window.location) {
    window.history.replaceState(window.history.state, '', next);
  }
  return true;
}

export function iCloudSignInFailureCopy(input: { code: ICloudAuthCode; detail?: string | null; dev?: boolean }): string {
  if (input.code === 'missing-config') return ICLOUD_SETUP_NEEDED;
  if (input.code === 'redirecting') return '';
  const dev = input.dev ?? isDevBuild();
  if (!dev) return ICLOUD_SIGN_IN_FAILED;
  if (input.code === 'cancelled') return `${ICLOUD_SIGN_IN_FAILED} Dev: the Apple window closed before sign-in finished.`;
  const detail = input.detail?.trim() ?? '';
  if (
    detail &&
    detail !== ICLOUD_SIGN_IN_FAILED &&
    !/api token|cloudkit|container|oauth|secret|service identifier/i.test(detail)
  ) {
    return `${ICLOUD_SIGN_IN_FAILED} Dev: ${detail.slice(0, 140)}`;
  }
  return ICLOUD_SIGN_IN_FAILED;
}

const OWNER_SECRET_PATTERN = /api token|cloudkit|container|oauth|client secret|service identifier|ckWebAuthToken|ckAPIToken/i;

export function iCloudOwnerFacingError(reason: unknown): string {
  if (reason instanceof Error && reason.message === ICLOUD_TEXT_TOO_BIG) return ICLOUD_TEXT_TOO_BIG;
  const detail = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  const trimmed = detail.trim();
  if (!trimmed) return ICLOUD_COULD_NOT_OPEN;
  if (/QUOTA_EXCEEDED|storage quota|iCloud storage is full/i.test(trimmed)) return 'iCloud storage is full.';
  if (/AUTHENTICATION_REQUIRED|AUTHENTICATION_FAILED/i.test(trimmed)) return ICLOUD_SIGN_IN_FAILED;
  if (isDevBuild() && trimmed.length <= 180 && !OWNER_SECRET_PATTERN.test(trimmed)) return trimmed.slice(0, 180);
  if (trimmed.length <= 180 && !/[{}]/.test(trimmed) && !OWNER_SECRET_PATTERN.test(trimmed)) return trimmed;
  return ICLOUD_COULD_NOT_OPEN;
}

type ICloudFetch = typeof fetch;

async function readPayload(response: Response): Promise<CloudKitPayload> {
  try {
    return (await response.json()) as CloudKitPayload;
  } catch {
    return {};
  }
}

function payloadFailure(payload: CloudKitPayload, status: number): Error | null {
  const recordError = payload.records?.find((record) => record?.serverErrorCode);
  const code = payload.serverErrorCode || recordError?.serverErrorCode || '';
  const reason = payload.reason || recordError?.reason || '';
  if (!code && responseOk(status) && !recordError) return null;
  if (!code && responseOk(status)) return null;
  if (code === 'QUOTA_EXCEEDED') return new Error('iCloud storage is full.');
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'AUTHENTICATION_FAILED') {
    return new Error(code);
  }
  const message = reason.replace(/\s+/g, ' ').trim().slice(0, 160);
  if (message && !/[{}]/.test(message)) return new Error(message);
  if (code) return new Error(code);
  return new Error(`iCloud returned ${status}.`);
}

function responseOk(status: number): boolean {
  return status >= 200 && status < 300;
}

async function cloudKit(
  config: AppleCloudKitConfig,
  operation: string,
  token: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  fetcher: ICloudFetch,
): Promise<{ payload: CloudKitPayload; token: string }> {
  const response = await fetcher(cloudKitPrivateUrl(config, operation, token || null), {
    method: init.method,
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = await readPayload(response);
  const next = nextWebAuthToken(payload, token);
  if (next) rememberICloudWebAuthToken(next);
  const redirect = cloudKitRedirectUrl(payload);
  if (redirect) {
    const error = new Error('AUTHENTICATION_REQUIRED');
    (error as Error & { redirectURL?: string }).redirectURL = redirect;
    throw error;
  }
  const failure = payloadFailure(payload, response.status);
  if (failure) throw failure;
  if (!responseOk(response.status)) throw new Error(ICLOUD_COULD_NOT_OPEN);
  return { payload, token: next || token };
}

export async function fetchICloudSignInUrl(
  config: AppleCloudKitConfig,
  fetcher: ICloudFetch = fetch,
): Promise<string> {
  const response = await fetcher(cloudKitPrivateUrl(config, 'users/current', null));
  const payload = await readPayload(response);
  const redirect = cloudKitRedirectUrl(payload);
  if (!redirect) throw new Error(ICLOUD_SIGN_IN_FAILED);
  return redirect;
}

export async function iCloudCurrentUser(
  token: string,
  fetcher: ICloudFetch = fetch,
): Promise<{ label: string | null; token: string }> {
  const config = iCloudConfig();
  if (!config) throw new Error(ICLOUD_SETUP_NEEDED);
  const live = activeICloudWebAuthToken(token);
  const result = await cloudKit(config, 'users/current', live, { method: 'GET' }, fetcher);
  return { label: iCloudAccountLabel(result.payload), token: result.token };
}

async function queryAll(
  config: AppleCloudKitConfig,
  token: string,
  recordType: string,
  fetcher: ICloudFetch,
): Promise<{ payload: CloudKitPayload; token: string }> {
  let marker: string | undefined;
  let current = token;
  const records: CloudKitRecord[] = [];
  let last: CloudKitPayload = {};
  for (let page = 0; page < 3; page += 1) {
    const result = await cloudKit(config, 'records/query', current, { method: 'POST', body: iCloudQuery(recordType, marker) }, fetcher);
    current = result.token;
    last = result.payload;
    if (Array.isArray(result.payload.records)) records.push(...result.payload.records);
    marker = result.payload.continuationMarker;
    if (!marker) break;
  }
  return { payload: { ...last, records }, token: current };
}

export async function listICloudFolders(token: string, fetcher: ICloudFetch = fetch): Promise<{ folders: CloudItemRef[]; token: string }> {
  const config = iCloudConfig();
  if (!config) throw new Error(ICLOUD_SETUP_NEEDED);
  const result = await queryAll(config, activeICloudWebAuthToken(token), ICLOUD_FOLDER_RECORD, fetcher);
  return { folders: iCloudItemsFromRecords(result.payload, ICLOUD_FOLDER_RECORD), token: result.token };
}

export async function listICloudFiles(
  token: string,
  folderId?: string,
  fetcher: ICloudFetch = fetch,
): Promise<CloudItemRef[]> {
  const config = iCloudConfig();
  if (!config) throw new Error(ICLOUD_SETUP_NEEDED);
  const result = await queryAll(config, activeICloudWebAuthToken(token), ICLOUD_FILE_RECORD, fetcher);
  return iCloudFilesInFolder(result.payload, folderId);
}

export async function createICloudFolder(token: string, name: string, fetcher: ICloudFetch = fetch): Promise<CloudItemRef> {
  const config = iCloudConfig();
  if (!config) throw new Error(ICLOUD_SETUP_NEEDED);
  const folderName = name.trim().slice(0, 180) || ICLOUD_ROOT_NAME;
  const existing = await listICloudFolders(token, fetcher);
  const match = existing.folders.find((folder) => folder.name === folderName);
  if (match) return match;
  const created = await cloudKit(
    config,
    'records/modify',
    activeICloudWebAuthToken(existing.token),
    { method: 'POST', body: iCloudFolderOperation(folderName) },
    fetcher,
  );
  const item = iCloudItemsFromRecords(created.payload, ICLOUD_FOLDER_RECORD)[0];
  if (!item) throw new Error('iCloud did not return the new folder.');
  return item;
}

export async function saveICloudText(
  token: string,
  file: { name: string; text: string },
  folderId?: string,
  fetcher: ICloudFetch = fetch,
): Promise<CloudItemRef> {
  const config = iCloudConfig();
  if (!config) throw new Error(ICLOUD_SETUP_NEEDED);
  if (file.text.length > ICLOUD_TEXT_LIMIT) throw new Error(ICLOUD_TEXT_TOO_BIG);
  const name = file.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 180) || ICLOUD_CONNECT_FILE_NAME;
  const saved = await cloudKit(
    config,
    'records/modify',
    activeICloudWebAuthToken(token),
    { method: 'POST', body: iCloudFileOperation({ name, text: file.text }, folderId) },
    fetcher,
  );
  const item = iCloudItemsFromRecords(saved.payload, ICLOUD_FILE_RECORD)[0];
  if (!item) throw new Error('iCloud did not return a file id.');
  return item;
}

export function readICloudBinding(): ICloudBinding | null {
  try {
    const raw = localStorage.getItem(ICLOUD_BINDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ICloudBinding>;
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
let bindingCache: ICloudBinding | null = null;
let bindingCacheReady = false;

export function subscribeICloudBinding(listener: () => void): () => void {
  bindingListeners.add(listener);
  return () => bindingListeners.delete(listener);
}

function notifyICloudBinding(): void {
  bindingListeners.forEach((listener) => listener());
}

export function getICloudBindingSnapshot(): ICloudBinding | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ICLOUD_BINDING_KEY);
  } catch {
    raw = null;
  }
  if (bindingCacheReady && raw === bindingCacheRaw) return bindingCache;
  bindingCacheReady = true;
  bindingCacheRaw = raw;
  bindingCache = readICloudBinding();
  return bindingCache;
}

export function writeICloudBinding(binding: ICloudBinding | null): void {
  try {
    if (!binding) localStorage.removeItem(ICLOUD_BINDING_KEY);
    else localStorage.setItem(ICLOUD_BINDING_KEY, JSON.stringify(binding));
  } catch {
    /* the in-memory choice still works until reload */
  }
  bindingCacheReady = false;
  notifyICloudBinding();
}

export function clearICloudBinding(): void {
  writeICloudBinding(null);
  rememberICloudWebAuthToken(null);
}
