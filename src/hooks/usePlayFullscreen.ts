import { useCallback, useEffect, useState } from 'react';
import {
  exitPageFullscreen,
  fullscreenElement,
  fullscreenSupported,
  requestPageFullscreen,
} from '../lib/fullscreen';
import { tvStationQuery } from '../lib/tvTip';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

type PlayFullscreenOptions = {
  /**
   * Landscape pages try to enter fullscreen on their own, and again after it closes.
   * Editors such as Daily Training Videos pass false so playback can enter and leave
   * fullscreen on purpose.
   */
  auto?: boolean;
};

export function usePlayFullscreen(options?: PlayFullscreenOptions) {
  const auto = options?.auto !== false;
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [landscape, setLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches,
  );
  const [blocked, setBlocked] = useState(false);
  const [tvStation, setTvStation] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const syncFs = () => {
      const on = Boolean(fullscreenElement());
      setActive(on);
      if (on) setBlocked(false);
    };
    const mq = window.matchMedia('(orientation: landscape)');
    const syncOrient = () => setLandscape(mq.matches);

    const tv = window.matchMedia(tvStationQuery());
    const syncTv = () => setTvStation(tv.matches);

    setSupported(fullscreenSupported());
    syncFs();
    syncOrient();
    syncTv();

    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    mq.addEventListener('change', syncOrient);
    tv.addEventListener('change', syncTv);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
      mq.removeEventListener('change', syncOrient);
      tv.removeEventListener('change', syncTv);
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
    if (!auto || !supported || !landscape || active) return;
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
  }, [auto, supported, landscape, active]);

  useEffect(() => {
    if (!auto || !supported || !landscape || active) return;
    let cancelled = false;
    const onGesture = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, .sheet, input, textarea, select, .play-exit, .tv-tip, .week-cast__options')) return;
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
  }, [auto, supported, landscape, active]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key;
      if (key !== 'f' && key !== 'F' && key !== 'F11') return;
      event.preventDefault();
      void toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  useEffect(() => {
    if (!tvStation) {
      setIdle(false);
      return;
    }
    let timer = 0;
    const bump = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2800);
    };
    bump();
    window.addEventListener('pointermove', bump);
    window.addEventListener('keydown', bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', bump);
      window.removeEventListener('keydown', bump);
    };
  }, [tvStation]);

  const className = [
    landscape ? 'play--landscape' : '',
    active ? 'play--fs' : '',
    tvStation ? 'play--tv' : '',
    idle ? 'play--idle' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    supported,
    active,
    landscape,
    tvStation,
    idle,
    /** Landscape, desktop TV station, or a failed auto-request — browser chrome still visible. */
    showFallback: supported && !active && (blocked || landscape || tvStation),
    enter,
    exit,
    toggle,
    className,
  };
}
