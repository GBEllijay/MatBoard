/**
 * Non-extractable device key in its own IndexedDB database.
 * Photo and gallery bytes stay in the `matboard` database and are not opened here.
 */

const DB_NAME = 'advantage-device';
const STORE = 'keys';
const KEY_ID = 'refresh';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('device key store failed'));
  });
}

async function readKey(): Promise<CryptoKeyPair | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID);
    request.onsuccess = () => resolve((request.result as CryptoKeyPair | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('device key read failed'));
  });
}

async function writeKey(pair: CryptoKeyPair): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(pair, KEY_ID);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('device key write failed'));
  });
}

export async function ensureDeviceKey(): Promise<CryptoKeyPair | null> {
  if (typeof indexedDB === 'undefined' || !crypto.subtle) return null;
  try {
    const existing = await readKey();
    if (existing) return existing;
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await writeKey(pair);
    return pair;
  } catch {
    return null;
  }
}

export async function devicePublicJwk(): Promise<{ kty: 'EC'; crv: 'P-256'; x: string; y: string } | null> {
  const pair = await ensureDeviceKey();
  if (!pair) return null;
  try {
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return null;
    return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  } catch {
    return null;
  }
}
