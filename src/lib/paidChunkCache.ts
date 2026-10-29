/**
 * Cookie for the module request, runtime cache for offline gyms, and prefetch
 * after a token is accepted. The lock and revoke paths delete that cache.
 */

import { entitlementNowMs, entitlementSnapshot, ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import {
  filesForAllowedChunks,
  PAID_CHUNK_CACHE,
  PAID_CHUNK_COOKIE,
  PAID_CHUNK_LABELS,
  paidChunkAllowedForClient,
  type PaidChunkId,
} from './paidChunkAccess.ts';
import type { EntitlementClaims } from './entitlementToken.ts';
import { PAID_CHUNK_FILES } from 'virtual:paid-chunks';

export type PaidLoadBlock = 'confirm' | 'failed' | 'offline';

function readToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
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
  if (!snap.claims) {
    clearPaidCookie();
    return snap.amnesty ? 'confirm' : 'failed';
  }
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!paidChunkAllowedForClient(snap.claims, chunk, entitlementNowMs(), offline)) return 'failed';
  const token = readToken();
  if (!token) return snap.amnesty ? 'confirm' : 'failed';
  armPaidChunkRequest(token, snap.claims.exp);
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

async function prefetchOne(url: string, token: string): Promise<void> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'reload',
  });
  if (!response.ok) return;
  const cache = await caches.open(PAID_CHUNK_CACHE);
  await cache.put(url, response.clone());
}

/**
 * Drop saved chunks this token cannot open, then fetch the ones it can.
 * A locked token clears the cache first. Seat screens that stay open are
 * fetched again when the network is up.
 */
export async function syncPaidChunkCache(claims: EntitlementClaims, token: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const allowed = new Set(filesForAllowedChunks(claims, PAID_CHUNK_FILES, entitlementNowMs()));
  try {
    if (claims.subs?.state === 'locked') await caches.delete(PAID_CHUNK_CACHE);
    else await dropUnlisted(allowed);
  } catch {
    /* ignore a missing Cache Storage */
  }
  if (!token || allowed.size === 0) {
    clearPaidCookie();
    return;
  }
  armPaidChunkRequest(token, claims.exp);
  await Promise.all(
    [...allowed].map(async (url) => {
      try {
        await prefetchOne(url, token);
      } catch {
        /* offline: a copy cleared above stays empty until the next online refresh */
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
