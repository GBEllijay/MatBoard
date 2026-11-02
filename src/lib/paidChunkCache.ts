/**
 * Cookie for the module request, runtime cache for offline gyms, and prefetch
 * after a token is accepted. The lock and revoke paths delete that cache.
 */

import { clockRolledBack, entitlementNowMs, entitlementReady, entitlementSnapshot, ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import {
  filesForAllowedChunks,
  filesToKeepOffline,
  PAID_CHUNK_CACHE,
  PAID_CHUNK_COOKIE,
  PAID_CHUNK_LABELS,
  paidImportBlock,
  type PaidChunkId,
  type PaidLoadBlock,
} from './paidChunkAccess.ts';

export type { PaidLoadBlock };
import type { EntitlementClaims } from './entitlementToken.ts';
import { PAID_CHUNK_FILES } from 'virtual:paid-chunks';

function readToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** False once a newer pass has replaced `token`. A stale sync must not clear that pass's cookie. */
function storedTokenIs(token: string): boolean {
  return readToken() === token;
}

export function armPaidChunkRequest(token: string, expSeconds: number): void {
  if (typeof document === 'undefined') return;
  const maxAge = Math.max(60, Math.min(24 * 60 * 60, expSeconds - Math.floor(Date.now() / 1000)));
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${PAID_CHUNK_COOKIE}=${encodeURIComponent(token)}; Path=/paid; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

export function clearPaidCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${PAID_CHUNK_COOKIE}=; Path=/paid; Max-Age=0; SameSite=Strict${secure}`;
}

export function paidChunkLabel(chunk: PaidChunkId): string {
  return PAID_CHUNK_LABELS[chunk];
}

/** Null means the import may run. Otherwise the screen shows this block. */
export function preparePaidImport(chunk: PaidChunkId): PaidLoadBlock | null {
  const snap = entitlementSnapshot();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const token = readToken();
  const block = paidImportBlock({
    ready: entitlementReady(),
    claims: snap.claims,
    amnesty: snap.amnesty,
    token,
    chunk,
    nowMs: entitlementNowMs(),
    offline,
    clockRolledBack: clockRolledBack(entitlementNowMs()),
  });
  if (block === 'pending') return block;
  if (block) {
    clearPaidCookie();
    return block;
  }
  if (snap.claims) armPaidChunkRequest(token, snap.claims.exp);
  return null;
}

export async function clearPaidChunkCache(): Promise<void> {
  clearPaidCookie();
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(PAID_CHUNK_CACHE);
  } catch {
    /* private mode */
  }
}

async function dropUnlisted(allowed: ReadonlySet<string>): Promise<void> {
  const cache = await caches.open(PAID_CHUNK_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys.map((request) => {
      const path = new URL(request.url).pathname;
      return allowed.has(path) ? Promise.resolve(false) : cache.delete(request);
    }),
  );
}

async function savedPaidFiles(): Promise<Set<string>> {
  try {
    const cache = await caches.open(PAID_CHUNK_CACHE);
    return new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
  } catch {
    return new Set();
  }
}

async function prefetchOne(url: string, token: string): Promise<void> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'reload',
  });
  if (!response.ok || !storedTokenIs(token)) return;
  const cache = await caches.open(PAID_CHUNK_CACHE);
  await cache.put(url, response.clone());
}

/**
 * Drop saved chunks this token may no longer keep, then fetch the ones the
 * server will hand out. An expired token inside its offline window keeps its
 * saved copies (filesToKeepOffline) so a gym that stays offline past exp can
 * still open them; the server still refuses a new download until a refresh.
 * A locked token clears the cache first. A rolled-back clock changes nothing
 * here: the copies stay put but preparePaidImport refuses to open them.
 * A stale token (a newer pass replaced it) returns before it can clear that
 * pass's cookie or cache.
 */
export async function syncPaidChunkCache(claims: EntitlementClaims, token: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  if (!storedTokenIs(token)) return;
  const now = entitlementNowMs();
  const rolledBack = clockRolledBack(now);
  const keep = new Set(filesToKeepOffline(claims, PAID_CHUNK_FILES, now));
  const allowed = new Set(rolledBack ? [] : filesForAllowedChunks(claims, PAID_CHUNK_FILES, now));
  try {
    if (!storedTokenIs(token)) return;
    if (claims.subs?.state === 'locked') await caches.delete(PAID_CHUNK_CACHE);
    else if (!rolledBack) await dropUnlisted(keep);
  } catch {
    /* ignore a missing Cache Storage */
  }
  if (!storedTokenIs(token)) return;
  if (!token || allowed.size === 0) {
    clearPaidCookie();
    return;
  }
  armPaidChunkRequest(token, claims.exp);
  // Paid file names carry a content hash, so a saved copy is already current.
  // Fetching it again would rewrite the entry while an open screen may be
  // reading it (offline that read then fails), so only missing files are fetched.
  const saved = await savedPaidFiles();
  if (!storedTokenIs(token)) return;
  await Promise.all(
    [...allowed].filter((url) => !saved.has(url)).map(async (url) => {
      try {
        await prefetchOne(url, token);
      } catch {
        /* offline: the saved copy (if any) stays until the next online refresh */
      }
    }),
  );
}

export async function prefetchStoredPaidChunks(): Promise<void> {
  const snap = entitlementSnapshot();
  const token = readToken();
  if (!snap.claims || !token) return;
  await syncPaidChunkCache(snap.claims, token);
}
