import { useEffect, useState } from 'react';
import { CLOUD_MEDIA_EVENT, readCloudBearer, type CloudStatusBody } from '../lib/advantageCloudMedia';

/**
 * Read-only: does Advantage Cloud answer as on for the license signed in on this browser?
 * Same status call the Advantage Cloud panel makes. It only picks which storage copy to show.
 * It does not open, close, or change any door or upload path.
 */
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

/** Test helper: forget the last status so the next mount refetches. */
export function resetAdvantageCloudOnCacheForTests() {
  cached = null;
  inflight = null;
}

export async function fetchAdvantageCloudOn(fetcher: typeof fetch = fetch, bearer = readCloudBearer()): Promise<boolean> {
  if (!bearer) return false;
  try {
    const response = await fetcher('/api/gym/cloud?op=status', { headers: { authorization: `Bearer ${bearer}` } });
    if (!response.ok) return false;
    const body = (await response.json()) as Partial<CloudStatusBody> | null;
    return body?.cloud === true;
  } catch {
    return false;
  }
}

function load(): Promise<boolean> {
  if (!inflight) {
    inflight = fetchAdvantageCloudOn().then((on) => {
      cached = on;
      inflight = null;
      return on;
    });
  }
  return inflight;
}

/** False until the status call says Cloud is on. Copy only. */
export function useAdvantageCloudOn(): boolean {
  const [on, setOn] = useState<boolean>(() => cached === true);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    let alive = true;
    const refresh = () => {
      void load().then((next) => {
        if (alive) setOn(next);
      });
    };
    refresh();
    window.addEventListener(CLOUD_MEDIA_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(CLOUD_MEDIA_EVENT, refresh);
    };
  }, []);
  return on;
}
