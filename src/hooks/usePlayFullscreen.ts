import { useCallback, useEffect, useState } from 'react';
import {
  exitPageFullscreen,
  fullscreenElement,
  fullscreenSupported,
  requestPageFullscreen,
} from '../lib/fullscreen';

export function usePlayFullscreen() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const syncFs = () => {
      const on = Boolean(fullscreenElement());
      setActive(on);
      if (on) setBlocked(false);
    };
    const mq = window.matchMedia('(orientation: landscape)');
    const syncOrient = () => setLandscape(mq.matches);

    setSupported(fullscreenSupported());
    syncFs();
    syncOrient();

    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    mq.addEventListener('change', syncOrient);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
      mq.removeEventListener('change', syncOrient);
      void exitPageFullscreen();
    };
  }, []);

  const enter = useCallback(async () => {
    if (!fullscreenSupported()) return false;
    const ok = await requestPageFullscreen();
    const on = Boolean(fullscreenElement()) || ok;
    setActive(on);
    setBlocked(!on);
    return on;
  }, []);

  const toggle = useCallback(async () => {
    if (fullscreenElement()) {
      await exitPageFullscreen();
      setActive(false);
      return;
    }
    await enter();
  }, [enter]);

  const exit = useCallback(async () => {
    if (fullscreenElement()) {
      await exitPageFullscreen();
    }
    setActive(false);
  }, []);

  useEffect(() => {
    if (!supported || !landscape || active) return;
    let cancelled = false;
    void requestPageFullscreen().then((ok) => {
      if (cancelled) {
        void exitPageFullscreen();
        return;
      }
      if (ok || fullscreenElement()) {
        setActive(true);
        setBlocked(false);
      } else {
        setBlocked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supported, landscape, active]);

  useEffect(() => {
    if (!supported || !landscape || active) return;
    let cancelled = false;
    const onGesture = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, .sheet, input, textarea, select, .play-exit')) return;
      void requestPageFullscreen().then((ok) => {
        if (cancelled) {
          void exitPageFullscreen();
          return;
        }
        if (ok || fullscreenElement()) {
          setActive(true);
          setBlocked(false);
        } else {
          setBlocked(true);
        }
      });
    };
    window.addEventListener('pointerdown', onGesture, true);
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', onGesture, true);
    };
  }, [supported, landscape, active]);

  const className = [landscape ? 'play--landscape' : '', active ? 'play--fs' : ''].filter(Boolean).join(' ');

  return {
    supported,
    active,
    landscape,
    /** Landscape (or a failed auto-request) and the browser still shows chrome. */
    showFallback: supported && !active && (blocked || landscape),
    enter,
    exit,
    toggle,
    className,
  };
}
