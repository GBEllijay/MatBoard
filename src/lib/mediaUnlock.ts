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
 * Lock Media closes Media, and Student and White when no higher tier is open.
 * An open Instructor or Pro door keeps Media open (tierImplications.ts): the relock
 * mark is stored, and it holds only after that higher door is closed. Someone who
 * owns only Media stays locked. White stays open when Coach or Pro is still open,
 * since those tiers include White too.
 */
export function lockMedia(): void {
  relockImplied('media', { keepOtherwiseOpen: true });
  if (!doorOpen('pro')) {
    void import('./paidChunkCache.ts')
      .then((mod) => mod.clearPaidChunkCache())
      .catch(() => undefined);
  }
}
