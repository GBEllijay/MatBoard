import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';

type PressHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
};

type HoldPressOptions = {
  /**
   * Capture the pointer for the whole press. Score boxes do this.
   * Navigation marks pass false so a drag can scroll the page, then capture
   * only after the hold commits.
   */
  capture?: boolean;
};

export function useHoldPress(
  onTap: () => void,
  onHold: () => void,
  delay = 480,
  options?: HoldPressOptions,
): PressHandlers {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const tap = useRef(onTap);
  const hold = useRef(onHold);
  const capture = useRef(true);
  tap.current = onTap;
  hold.current = onHold;
  capture.current = options?.capture !== false;

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    onPointerDown: (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      held.current = false;
      if (capture.current) event.currentTarget.setPointerCapture(event.pointerId);
      clear();
      timer.current = window.setTimeout(() => {
        held.current = true;
        hold.current();
      }, delay);
    },
    onPointerUp: () => {
      const wasHeld = held.current;
      clear();
      if (!wasHeld) tap.current();
      held.current = false;
    },
    onPointerCancel: () => {
      clear();
      held.current = false;
    },
    onLostPointerCapture: () => {
      clear();
    },
    onContextMenu: (event) => {
      event.preventDefault();
    },
  };
}
