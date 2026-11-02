import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { mediaConsoleDoorOpen } from '../lib/productNames';
import { useSeatDoor } from './useSeatDoor';
import {
  getTimerBackdrop,
  timerBackdropForAccess,
  readTimerBackground,
  subscribeTimerBackdrop,
  type TimerBackdropPrefs,
} from '../lib/timerBackdrop';

export function useTimerBackdropPrefs(): TimerBackdropPrefs {
  return useSyncExternalStore(subscribeTimerBackdrop, getTimerBackdrop, getTimerBackdrop);
}

/**
 * Background & logo are Media and up. Same check as the /media route and Media Console
 * (mediaConsoleDoorOpen over the Media door), so Pro, the owner unlock and any tier that
 * implies Media (tierImplications.ts) open it with no list kept here.
 */
export function useTimerBackdropUnlocked(): boolean {
  return mediaConsoleDoorOpen(useSeatDoor());
}

/** Saved prefs as this device may show them: locked devices get the default (data kept). */
export function useEffectiveTimerBackdrop(): { prefs: TimerBackdropPrefs; unlocked: boolean } {
  const saved = useTimerBackdropPrefs();
  const unlocked = useTimerBackdropUnlocked();
  const prefs = useMemo(() => timerBackdropForAccess(saved, unlocked), [saved, unlocked]);
  return { prefs, unlocked };
}

/**
 * Object URL for the saved round timer background, or null for the skin default.
 * Reloads when another tab / the controller saves a new picture (stamp changes).
 */
export function useTimerBackgroundUrl(stamp: number | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (stamp == null) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    void readTimerBackground().then((blob) => {
      if (!alive) return;
      if (!blob) {
        setUrl(null);
        return;
      }
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [stamp]);
  return url;
}
