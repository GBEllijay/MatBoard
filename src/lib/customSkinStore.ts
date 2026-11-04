/**
 * Custom skins on this device.
 * The picture and thumb are Blobs in IndexedDB (`matboard-custom-skins`).
 * Names live in localStorage so a second tab hears a rename without the bytes.
 * A later class reads the same database. Nothing here is session-only.
 */

import {
  CUSTOM_SKIN_CAP,
  CUSTOM_SKIN_DELETE_FIRST,
  cleanCustomSkinName,
  customSkinNameFromFile,
  customSkinsAtCap,
  newCustomSkinId,
  prepareCustomSkinFile,
  type CustomSkinHome,
} from './customSkin.ts';

export const CUSTOM_SKIN_DB = 'matboard-custom-skins';
export const CUSTOM_SKIN_MANIFEST_KEY = 'matboard.customSkins.v1';
const STORE = 'skins';

export type CustomSkinRecord = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  updatedAt: number;
  image: Blob;
  thumb: Blob;
  remote: CustomSkinHome;
};

export type CustomSkinSummary = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  updatedAt: number;
  remote: CustomSkinHome;
};

type SkinDb = {
  get(id: string): Promise<CustomSkinRecord | null>;
  put(record: CustomSkinRecord): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<CustomSkinRecord[]>;
};

export type CustomSkinSaveResult = { ok: true; summary: CustomSkinSummary } | { ok: false; error: string };

const listeners = new Set<() => void>();
let manifestCache: CustomSkinSummary[] | null = null;
let manifestRaw: string | null | undefined;
let database: SkinDb | null = null;
let publisher: (record: CustomSkinRecord) => Promise<CustomSkinHome> = async () => 'device';
let remover: (id: string, remote: CustomSkinHome) => Promise<void> = async () => {};

export function subscribeCustomSkins(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setCustomSkinPublisher(fn: (record: CustomSkinRecord) => Promise<CustomSkinHome>): void {
  publisher = fn;
}

export function setCustomSkinRemover(fn: (id: string, remote: CustomSkinHome) => Promise<void>): void {
  remover = fn;
}

/** Tests pass a memory database. The app uses IndexedDB. */
export function useCustomSkinDatabase(db: SkinDb | null): void {
  database = db;
  manifestCache = null;
  manifestRaw = undefined;
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

function summaryOf(record: CustomSkinRecord): CustomSkinSummary {
  return {
    id: record.id,
    name: record.name,
    mime: record.mime,
    bytes: record.bytes,
    updatedAt: record.updatedAt,
    remote: record.remote,
  };
}

function readManifest(): CustomSkinSummary[] {
  let raw: string | null = null;
  try {
    raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CUSTOM_SKIN_MANIFEST_KEY);
  } catch {
    raw = null;
  }
  if (manifestCache && raw === manifestRaw) return manifestCache;
  let parsed: unknown = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const rows = Array.isArray(parsed) ? parsed.flatMap((row) => normalizeSummary(row)) : [];
  manifestCache = rows;
  manifestRaw = raw;
  return rows;
}

function normalizeSummary(row: unknown): CustomSkinSummary[] {
  if (!row || typeof row !== 'object') return [];
  const value = row as Partial<CustomSkinSummary>;
  if (!value.id || !/^[a-z0-9]{8,40}$/.test(value.id)) return [];
  const remote = value.remote;
  return [
    {
      id: value.id,
      name: cleanCustomSkinName(typeof value.name === 'string' ? value.name : 'My skin'),
      mime: typeof value.mime === 'string' ? value.mime : 'image/jpeg',
      bytes: typeof value.bytes === 'number' && value.bytes > 0 ? value.bytes : 0,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
      remote: remote === 'advantage-cloud' || remote === 'google-drive' || remote === 'onedrive' ? remote : 'device',
    },
  ];
}

function writeManifest(rows: CustomSkinSummary[]): void {
  const next = rows.slice(0, CUSTOM_SKIN_CAP);
  try {
    localStorage.setItem(CUSTOM_SKIN_MANIFEST_KEY, JSON.stringify(next));
  } catch {
    /* the IndexedDB copy is still the picture */
  }
  manifestCache = next;
  manifestRaw = JSON.stringify(next);
  emit();
}

export function listCustomSkins(): readonly CustomSkinSummary[] {
  return readManifest();
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CUSTOM_SKIN_DB, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function indexedSkinDb(): SkinDb {
  return {
    async get(id) {
      const db = await openIndexedDb();
      if (!db) return null;
      try {
        return await new Promise((resolve) => {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
          req.onsuccess = () => resolve(isRecord(req.result) ? req.result : null);
          req.onerror = () => resolve(null);
        });
      } finally {
        db.close();
      }
    },
    async put(record) {
      const db = await openIndexedDb();
      if (!db) throw new Error('no-storage');
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('write-failed'));
          tx.onabort = () => reject(tx.error ?? new Error('write-failed'));
        });
      } finally {
        db.close();
      }
    },
    async delete(id) {
      const db = await openIndexedDb();
      if (!db) return;
      try {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      } finally {
        db.close();
      }
    },
    async all() {
      const db = await openIndexedDb();
      if (!db) return [];
      try {
        return await new Promise((resolve) => {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result.filter(isRecord) : []);
          req.onerror = () => resolve([]);
        });
      } finally {
        db.close();
      }
    },
  };
}

function isRecord(value: unknown): value is CustomSkinRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<CustomSkinRecord>;
  return typeof row.id === 'string' && row.image instanceof Blob && row.thumb instanceof Blob;
}

function db(): SkinDb {
  return database ?? indexedSkinDb();
}

export async function hydrateCustomSkins(): Promise<void> {
  const rows = await db().all();
  rows.sort((a, b) => a.updatedAt - b.updatedAt);
  writeManifest(rows.map(summaryOf));
}

export async function readCustomSkin(id: string): Promise<CustomSkinRecord | null> {
  return db().get(id);
}

async function putRecord(record: CustomSkinRecord, publish: boolean): Promise<CustomSkinSummary> {
  let stored = record;
  if (publish) {
    try {
      stored = { ...record, remote: await publisher(record) };
    } catch {
      stored = { ...record, remote: 'device' };
    }
  }
  await db().put(stored);
  const rows = readManifest().filter((row) => row.id !== stored.id);
  rows.push(summaryOf(stored));
  writeManifest(rows);
  return summaryOf(stored);
}

export async function savePreparedCustomSkin(input: {
  name: string;
  image: Blob;
  thumb: Blob;
  mime: string;
  id?: string;
  remote?: CustomSkinHome;
  publish?: boolean;
}): Promise<CustomSkinSaveResult> {
  const existing = input.id ? readManifest().some((row) => row.id === input.id) : false;
  if (!existing && customSkinsAtCap(readManifest().length)) return { ok: false, error: CUSTOM_SKIN_DELETE_FIRST };
  const id = input.id && /^[a-z0-9]{8,40}$/.test(input.id) ? input.id : newCustomSkinId();
  const record: CustomSkinRecord = {
    id,
    name: cleanCustomSkinName(input.name),
    mime: input.mime || 'image/jpeg',
    bytes: input.image.size,
    updatedAt: Date.now(),
    image: input.image,
    thumb: input.thumb,
    remote: input.remote ?? 'device',
  };
  try {
    const summary = await putRecord(record, input.publish !== false && input.remote == null);
    return { ok: true, summary };
  } catch {
    return { ok: false, error: "This device can't store that skin." };
  }
}

export async function saveCustomSkinFromFile(file: File): Promise<CustomSkinSaveResult> {
  if (customSkinsAtCap(readManifest().length)) return { ok: false, error: CUSTOM_SKIN_DELETE_FIRST };
  const prepared = await prepareCustomSkinFile(file);
  if ('error' in prepared) return { ok: false, error: prepared.error };
  return savePreparedCustomSkin({
    name: customSkinNameFromFile(file.name),
    image: prepared.image,
    thumb: prepared.thumb,
    mime: prepared.mime,
  });
}

export async function renameCustomSkin(id: string, name: string): Promise<void> {
  const record = await db().get(id);
  if (!record) return;
  const next = { ...record, name: cleanCustomSkinName(name), updatedAt: Date.now() };
  await putRecord(next, true);
}

export async function deleteCustomSkin(id: string): Promise<void> {
  const remote = readManifest().find((row) => row.id === id)?.remote ?? 'device';
  await db().delete(id);
  writeManifest(readManifest().filter((row) => row.id !== id));
  try {
    await remover(id, remote);
  } catch {
    /* the device copy is already gone */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === CUSTOM_SKIN_MANIFEST_KEY || event.key === null) {
      manifestCache = null;
      manifestRaw = undefined;
      emit();
    }
  });
}
