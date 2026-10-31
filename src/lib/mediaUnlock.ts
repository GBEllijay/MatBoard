import { doorOpen, relockImplied, subscribeEntitlement } from './entitlement.ts';

/**
 * Advantage Media Edition on this browser: Media Console (Gallery, Events, Pro Shop
 * slideshows) plus the White tools it includes (Scoreboard and Round Timer).
 * Opens from a signed pass with the 'media' door: an alpha-media code today, the
 * $29.99 one-time purchase later, or Pro (which includes Media). No on-device flag.
 */
export function isMediaUnlocked(): boolean {
  return doorOpen('media');
}

export function subscribeMediaUnlock(fn: () => void): () => void {
  return subscribeEntitlement(fn);
}

/**
 * Lock Media is symmetric with unlock: it closes Media and the White it implies.
 * White stays open when Coach or Pro is still open on this browser, since those tiers
 * include White too. Media's White and a separately bought White are the same door in
 * the pass, so a separate White comes back with Restore or its code.
 */
export function lockMedia(): void {
  relockImplied('media', { keepOtherwiseOpen: true });
  if (!doorOpen('pro')) {
    void import('./paidChunkCache.ts')
      .then((mod) => mod.clearPaidChunkCache())
      .catch(() => undefined);
  }
}
