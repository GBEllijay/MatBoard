import { useEffect } from 'react';

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock?.request) return;

    let released = false;
    let sentinel: { release: () => Promise<void> } | null = null;

    const request = async () => {
      if (released || document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock!.request('screen');
      } catch {
        sentinel = null;
      }
    };

    void request();
    const onVis = () => {
      void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release();
    };
  }, [active]);
}
