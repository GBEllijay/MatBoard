import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  HOLD_FRAME_MS,
  HOLD_MS,
  HOLD_REDUCED_STEP_MS,
  holdOutcome,
  holdProgress,
  isHoldKey,
  pulseHoldHaptic,
  steppedHoldProgress,
} from '../lib/holdDuration';

export type HoldClock = {
  now: () => number;
  schedule: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
};

export function browserHoldClock(): HoldClock {
  return {
    now: () => performance.now(),
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    cancel: (id) => window.clearTimeout(id),
  };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

type TapEvent = { stopPropagation: () => void; preventDefault?: () => void };

type Options = {
  /** Existing tap: start/pause, or fullscreen. Omit when the control has no tap. */
  onTap?: (event: TapEvent) => void;
  /** Fires once when the hold reaches 3 seconds. The later click is swallowed. */
  onComplete: () => void;
  /** Tests inject a clock. The round timer uses the browser clock. */
  clock?: HoldClock;
};

/**
 * Press-and-hold on one round-timer control.
 * A short press keeps the tap. Letting go before 3 seconds changes nothing.
 * Finishing the hold does not also run the tap.
 */
export function useTimedHold({ onTap, onComplete, clock }: Options) {
  const onTapRef = useRef(onTap);
  const onCompleteRef = useRef(onComplete);
  onTapRef.current = onTap;
  onCompleteRef.current = onComplete;

  const clockRef = useRef<HoldClock | null>(null);
  if (clock) clockRef.current = clock;
  if (!clockRef.current) clockRef.current = browserHoldClock();

  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const holding = useRef(false);
  const done = useRef(false);
  const suppress = useRef(false);
  const started = useRef(0);
  const timers = useRef<number[]>([]);
  const keyHeld = useRef<string | null>(null);

  const clearTimers = () => {
    const current = clockRef.current;
    if (!current) return;
    for (const id of timers.current) current.cancel(id);
    timers.current = [];
  };

  const later = (fn: () => void, ms: number) => {
    const current = clockRef.current;
    if (!current) return;
    const id = current.schedule(() => {
      timers.current = timers.current.filter((item) => item !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };

  const paint = (elapsed: number) => {
    const fraction = holdProgress(elapsed);
    setProgress(reducedRef.current ? steppedHoldProgress(fraction) : fraction);
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    suppress.current = true;
    clearTimers();
    setProgress(1);
    onCompleteRef.current();
    pulseHoldHaptic();
  };

  const tick = () => {
    if (!holding.current || done.current) return;
    const elapsed = clockRef.current!.now() - started.current;
    if (elapsed >= HOLD_MS) {
      finish();
      return;
    }
    paint(elapsed);
    later(tick, reducedRef.current ? HOLD_REDUCED_STEP_MS : HOLD_FRAME_MS);
  };

  const begin = () => {
    if (holding.current) return;
    holding.current = true;
    done.current = false;
    suppress.current = false;
    started.current = clockRef.current!.now();
    setActive(true);
    setProgress(0);
    later(tick, reducedRef.current ? HOLD_REDUCED_STEP_MS : HOLD_FRAME_MS);
    later(() => {
      if (holding.current) finish();
    }, HOLD_MS);
  };

  const stopVisual = () => {
    holding.current = false;
    clearTimers();
    setActive(false);
    setProgress(0);
  };

  const endFromElapsed = (elapsed: number) => {
    if (done.current) {
      suppress.current = true;
      stopVisual();
      return;
    }
    const outcome = holdOutcome(elapsed);
    if (outcome === 'complete') {
      finish();
      stopVisual();
      return;
    }
    stopVisual();
    suppress.current = outcome === 'cancel';
  };

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const apply = () => setReduced(prefersReducedMotion());
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener?.('change', apply);
    } catch {
      mq = null;
    }
    return () => {
      mq?.removeEventListener?.('change', apply);
      holding.current = false;
      clearTimers();
    };
  }, []);

  const quiet = (): TapEvent => ({
    stopPropagation() {},
    preventDefault() {},
  });

  return {
    active,
    progress,
    buttonProps: {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* capture is optional; pointerup still ends the hold */
        }
        begin();
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!holding.current && !done.current) return;
        endFromElapsed(clockRef.current!.now() - started.current);
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!holding.current) return;
        suppress.current = true;
        done.current = false;
        stopVisual();
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat || holding.current) return;
        keyHeld.current = event.key;
        begin();
      },
      onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== keyHeld.current) return;
        event.preventDefault();
        event.stopPropagation();
        keyHeld.current = null;
        const elapsed = clockRef.current!.now() - started.current;
        const wasHolding = holding.current || done.current;
        if (!wasHolding) return;
        const outcome = done.current ? 'complete' : holdOutcome(elapsed);
        if (outcome === 'complete' && !done.current) finish();
        stopVisual();
        if (outcome === 'tap') onTapRef.current?.(quiet());
        // A keyboard tap already ran. Swallow the click the key would also emit.
        // The next press clears this in begin().
        suppress.current = true;
      },
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (suppress.current) {
          event.preventDefault();
          suppress.current = false;
          return;
        }
        onTapRef.current?.(event);
      },
      onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
    },
  };
}
