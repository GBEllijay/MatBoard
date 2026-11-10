import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LOOP_RESTART_MIN_MS, nextLoopStep } from '../lib/videoLoop';

/**
 * Looping clip player from Daily Training Videos. Loops forever, or for a
 * timed loop when durationMs is set. Chrome toolbar: Stop, Mute clips,
 * Fullscreen. Shared with the program director's Camera window so both
 * screens play today's videos the same way.
 */
export function LoopClip({
  src,
  label,
  playing,
  muted,
  unlockSound,
  fullscreen,
  onToggleFullscreen,
  onStop,
  onToggleMute,
  overlay,
  durationMs,
  onDurationEnd,
  onRemaining,
  dock,
}: {
  src: string;
  label: string;
  playing: boolean;
  muted: boolean;
  unlockSound: boolean;
  fullscreen: boolean;
  onToggleFullscreen?: () => void;
  onStop?: () => void;
  onToggleMute?: () => void;
  overlay?: ReactNode;
  /** When set, the clip restarts until this many milliseconds have passed, then stops. */
  durationMs?: number;
  onDurationEnd?: () => void;
  onRemaining?: (remainingMs: number) => void;
  /** Start, Stop, and Fullscreen, drawn on the player so they stay in reach. */
  dock?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideChromeTimer = useRef(0);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [chrome, setChrome] = useState(false);
  const durationEndRef = useRef(onDurationEnd);
  const remainingRef = useRef(onRemaining);
  durationEndRef.current = onDurationEnd;
  remainingRef.current = onRemaining;
  const timedLoop = durationMs != null;

  const revealChrome = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideChromeTimer.current);
    hideChromeTimer.current = window.setTimeout(() => setChrome(false), 3800);
  }, []);

  const hideChrome = useCallback(() => {
    window.clearTimeout(hideChromeTimer.current);
    setChrome(false);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    revealChrome();
    return () => window.clearTimeout(hideChromeTimer.current);
  }, [revealChrome, fullscreen]);

  useEffect(() => {
    if (timedLoop) return;
    const el = videoRef.current;
    if (!el) return;
    el.loop = true;
    el.defaultMuted = muted;
    el.muted = muted;
    if (muted) setNeedsUnmute(false);
    if (!playing) {
      el.pause();
      return;
    }
    let cancelled = false;
    const start = async () => {
      try {
        el.currentTime = 0;
        el.muted = muted;
        if (!muted && unlockSound) el.muted = false;
        await el.play();
        if (cancelled) return;
        if (muted) {
          setNeedsUnmute(false);
          try {
            if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
          } catch {
            /* ignore */
          }
        } else if (!el.muted) {
          setNeedsUnmute(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        el.muted = true;
        if (!muted) setNeedsUnmute(true);
        try {
          await el.play();
        } catch {
          /* wait for another Start tap */
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      el.pause();
    };
  }, [playing, src, muted, unlockSound, timedLoop]);

  useEffect(() => {
    if (!timedLoop || durationMs == null) return;
    const el = videoRef.current;
    if (!el) return;
    if (!playing) {
      el.pause();
      return;
    }
    const startedAt = performance.now();
    let lastRestartAt = startedAt;
    let stopped = false;
    let restarting = false;
    let timer = 0;

    const finish = () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      el.pause();
      remainingRef.current?.(0);
      durationEndRef.current?.();
    };

    const apply = (clipEnded: boolean) => {
      if (stopped || restarting) return;
      const now = performance.now();
      const step = nextLoopStep(now - startedAt, durationMs, clipEnded, now - lastRestartAt);
      if (step === 'stop') {
        finish();
        return;
      }
      if (step === 'restart') {
        lastRestartAt = now;
        restarting = true;
        try {
          el.currentTime = 0;
        } catch {
          el.load();
        }
        void el.play().catch(() => undefined);
        window.setTimeout(() => {
          restarting = false;
        }, LOOP_RESTART_MIN_MS);
      }
      remainingRef.current?.(Math.max(0, durationMs - (performance.now() - startedAt)));
    };

    const onEnded = () => apply(true);
    el.loop = false;
    el.muted = muted;
    el.addEventListener('ended', onEnded);
    timer = window.setInterval(() => {
      if (restarting) return;
      apply(el.ended);
    }, 100);
    apply(false);
    void el.play().catch(() => {
      el.muted = true;
      if (!muted) setNeedsUnmute(true);
      void el.play().catch(() => undefined);
    });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      el.removeEventListener('ended', onEnded);
      el.pause();
    };
  }, [durationMs, playing, src, timedLoop]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !timedLoop) return;
    el.muted = muted;
  }, [muted, timedLoop]);

  return (
    <div
      className={`techniques__frame${fullscreen ? ' techniques__frame--fill' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, label')) return;
        if (chrome) hideChrome();
        else revealChrome();
      }}
    >
      <video
        ref={videoRef}
        className="techniques__video"
        src={src}
        muted={muted}
        playsInline
        loop={!timedLoop}
        disableRemotePlayback
        aria-label={label}
      />
      {overlay}
      {dock}
      {chrome && onToggleFullscreen && !dock ? (
        <div className="techniques__chrome" role="toolbar" aria-label="Playback controls">
          {fullscreen && onStop ? (
            <button
              type="button"
              className="techniques__chrome-btn"
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
            >
              Stop
            </button>
          ) : null}
          {fullscreen && onToggleMute ? (
            <button
              type="button"
              className={`techniques__chrome-btn${muted ? ' techniques__chrome-btn--on' : ''}`}
              aria-pressed={muted}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMute();
              }}
            >
              Mute clips
            </button>
          ) : null}
          <button
            type="button"
            className="techniques__chrome-btn techniques__chrome-btn--go"
            aria-pressed={fullscreen}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFullscreen();
            }}
          >
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      ) : null}
      {chrome && dock && fullscreen && onToggleMute ? (
        <div className="techniques__chrome" role="toolbar" aria-label="Playback controls">
          <button
            type="button"
            className={`techniques__chrome-btn${muted ? ' techniques__chrome-btn--on' : ''}`}
            aria-pressed={muted}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMute();
            }}
          >
            Mute clips
          </button>
        </div>
      ) : null}
      {!muted && needsUnmute ? (
        <button
          type="button"
          className="saver__unmute"
          onClick={(event) => {
            event.stopPropagation();
            const el = videoRef.current;
            if (!el) return;
            el.muted = false;
            setNeedsUnmute(false);
            void el.play();
          }}
        >
          Tap for sound
        </button>
      ) : null}
    </div>
  );
}
