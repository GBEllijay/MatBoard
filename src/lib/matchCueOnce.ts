/**
 * One match-end cue per browser profile.
 * Controller and Display both observe the clock hitting 0:00 (local tick or
 * BroadcastChannel). Without a shared claim, each window starts the cue and
 * the same speakers play two copies on top of each other.
 */
const CLAIM_KEY = 'matboard.match.endCueOnce.v1';
const LOCK_NAME = 'matboard-match-end-cue';

/**
 * A tab whose audio is still locked waits this long before trying.
 * The other view polls every 100ms; an already-unlocked tab should claim
 * first so a suspended tab does not take the claim and then fail to play.
 */
const AUDIBLE_TAB_HEAD_START_MS = 200;

export function endCueClaimId(revision: number): string {
  return `end:${revision}`;
}

export function endCueAlreadyClaimed(id: string): boolean {
  try {
    return localStorage.getItem(CLAIM_KEY) === id;
  } catch {
    return false;
  }
}

async function claimSharedCue(id: string): Promise<boolean> {
  const take = (): boolean => {
    try {
      if (localStorage.getItem(CLAIM_KEY) === id) return false;
      localStorage.setItem(CLAIM_KEY, id);
      return true;
    } catch {
      return true;
    }
  };
  const locks = globalThis.navigator?.locks;
  if (!locks) return take();
  try {
    return Boolean(await locks.request(LOCK_NAME, () => take()));
  } catch {
    return take();
  }
}

/**
 * Play `play` once for `id` across tabs that share localStorage.
 * A tab that can already hear audio claims immediately. A locked tab gives
 * that view a head start, then resumes and claims only if nobody else did.
 */
export async function playOnceAcrossTabs(
  id: string,
  audible: () => boolean,
  ensure: () => Promise<boolean>,
  play: () => void,
  waitMs = AUDIBLE_TAB_HEAD_START_MS,
): Promise<void> {
  try {
    if (!audible()) {
      await new Promise((resolve) => {
        setTimeout(resolve, waitMs);
      });
      if (endCueAlreadyClaimed(id)) return;
      if (!(await ensure())) return;
      if (endCueAlreadyClaimed(id)) return;
    }
    if (await claimSharedCue(id)) play();
  } catch {
    /* storage or audio failed; do not start a second layered copy */
  }
}
