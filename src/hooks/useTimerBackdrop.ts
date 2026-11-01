import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getTimerBackdrop,
  readTimerBackground,
  subscribeTimerBackdrop,
  type TimerBackdropPrefs,
} from '../lib/timerBackdrop';

export function useTimerBackdropPrefs(): TimerBackdropPrefs {
  return useSyncExternalStore(subscribeTimerBackdrop, getTimerBackdrop, getTimerBackdrop);
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
