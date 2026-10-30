/**
 * Lock Coach and Lock Student Edition on this browser. Pro screens stay usable when
 * Pro is still open, so the paid chunk cache is re-synced to what the stored token
 * may open (unlisted files are dropped, allowed ones fetched again). With Pro closed
 * the cache and the paid cookie are cleared, like Lock Pro.
 */

import { doorOpen } from './entitlement.ts';

type PaidCacheModule = {
  clearPaidChunkCache(): Promise<void>;
  prefetchStoredPaidChunks(): Promise<void>;
};

const defaultLoader = (): Promise<PaidCacheModule> => import('./paidChunkCache.ts');
let loader: () => Promise<PaidCacheModule> = defaultLoader;
let pending: Promise<void> = Promise.resolve();

/** Tests only. paidChunkCache.ts imports a Vite virtual module that node cannot load. */
export function setPaidCacheLoaderForTests(next: (() => Promise<PaidCacheModule>) | null): void {
  loader = next ?? defaultLoader;
}

/** Tests only. Resolves after the last sync started by a lock. */
export function paidScreenSyncSettled(): Promise<void> {
  return pending;
}

export function syncPaidScreensAfterLock(): Promise<void> {
  const keepPro = doorOpen('pro');
  pending = loader()
    .then((mod) => (keepPro ? mod.prefetchStoredPaidChunks() : mod.clearPaidChunkCache()))
    .catch(() => undefined);
  return pending;
}
