import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  centeredScrollTop,
  settleRowIndex,
  shouldSettleWheel,
  wheelDeltaPx,
  wheelGestureSpeed,
  WHEEL_ITEM_PX,
  WHEEL_WINDOW_PX,
  type WheelOption,
  type WheelSample,
} from '../lib/timeWheel';
import { Sheet } from './Sheet';

/**
 * Large tappable value that opens an iOS-style wheel.
 * Touch flicks coast with native momentum. Mandatory per-row snapping is off,
 * because iOS Safari stops that flick on the next row. When the coast ends,
 * the nearest row is centered. A slow scroll can still catch a detent.
 * Mouse drag is 1:1. The mouse wheel and trackpad move in proportion to the delta.
 * The centered row is the value.
 */
export function WheelPicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  options: readonly WheelOption[];
  onChange: (value: number) => void;
  /** Past days can show the value without opening the wheel. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [wheelNode, setWheelNode] = useState<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const samples = useRef<WheelSample[]>([]);
  /** Keyboard, a chip, and a tapped row land on that row. A scroll may catch a detent. */
  const precise = useRef(false);
  /** Smooth chip scroll. A mid-glide sample must not commit the row it is passing. */
  const glide = useRef(false);
  const glideTarget = useRef<number | null>(null);
  const glideWaits = useRef(0);
  /** Scroll offset when this gesture started. A tap that never moves stays put. */
  const gestureStart = useRef(0);
  const gesture = useRef({ moved: false, top: 0, y: 0 });
  const listId = useId();
  valueRef.current = value;
  const selected = options.find((option) => option.value === value) ?? options[0];
  const snaps = options.filter((option) => option.snap);

  const bindScroller = useCallback((node: HTMLDivElement | null) => {
    scroller.current = node;
    setWheelNode(node);
  }, []);

  useEffect(() => {
    if (!wheelNode) return;
    const index = Math.max(0, options.findIndex((option) => option.value === valueRef.current));
    const target = centeredScrollTop(index, WHEEL_ITEM_PX);
    precise.current = true;
    wheelNode.scrollTop = target;
    precise.current = false;
    gestureStart.current = target;
    gesture.current = { moved: false, top: target, y: 0 };
  }, [wheelNode, options]);

  useEffect(() => {
    if (!wheelNode) return;
    let timer = 0;
    let pointerDown = false;
    let settling = false;
    let settled = false;
    /** Ignore the scroll event caused by our own centering write. */
    let suppressTop = -1;

    const commit = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (pointerDown || settling || settled) return;
      const gliding = glide.current && glideTarget.current != null && Math.abs(wheelNode.scrollTop - glideTarget.current) > 0.5;
      if (gliding) {
        glideWaits.current += 1;
        if (glideWaits.current < 15) {
          timer = window.setTimeout(commit, 80);
          return;
        }
        const target = glideTarget.current ?? wheelNode.scrollTop;
        suppressTop = target;
        settling = true;
        wheelNode.scrollTop = target;
        settling = false;
        glide.current = false;
        glideTarget.current = null;
        precise.current = false;
        samples.current = [];
        settled = true;
        gestureStart.current = target;
        return;
      }
      if (!shouldSettleWheel(wheelNode.scrollTop, options.length, samples.current, precise.current, gestureStart.current, WHEEL_ITEM_PX)) {
        precise.current = false;
        samples.current = [];
        glide.current = false;
        glideTarget.current = null;
        settled = true;
        return;
      }
      const index = settleRowIndex(wheelNode.scrollTop, options, wheelGestureSpeed(samples.current), precise.current, WHEEL_ITEM_PX);
      precise.current = false;
      samples.current = [];
      glide.current = false;
      glideTarget.current = null;
      settled = true;
      const target = centeredScrollTop(index, WHEEL_ITEM_PX);
      gestureStart.current = target;
      if (Math.abs(wheelNode.scrollTop - target) > 0.5) {
        suppressTop = target;
        settling = true;
        wheelNode.scrollTop = target;
        settling = false;
      }
      const next = options[index];
      if (next && next.value !== valueRef.current) onChange(next.value);
    };

    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 80);
    };

    const onScroll = () => {
      if (settling) return;
      if (suppressTop >= 0 && Math.abs(wheelNode.scrollTop - suppressTop) <= 0.5) return;
      suppressTop = -1;
      settled = false;
      if (pointerDown && Math.abs(wheelNode.scrollTop - gesture.current.top) > 4) gesture.current.moved = true;
      if (glide.current) {
        arm();
        return;
      }
      samples.current.push({ t: performance.now(), top: wheelNode.scrollTop });
      const cutoff = performance.now() - 320;
      while (samples.current.length > 2 && samples.current[0].t < cutoff) samples.current.shift();
      if (pointerDown) {
        window.clearTimeout(timer);
        timer = 0;
        return;
      }
      arm();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerDown = true;
      settled = false;
      suppressTop = -1;
      glide.current = false;
      glideTarget.current = null;
      gesture.current = { moved: false, top: wheelNode.scrollTop, y: event.clientY };
      gestureStart.current = wheelNode.scrollTop;
      window.clearTimeout(timer);
      timer = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      if (Math.abs(event.clientY - gesture.current.y) > 4) gesture.current.moved = true;
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!pointerDown) return;
      pointerDown = false;
      arm();
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.cancelable) return;
      const px = wheelDeltaPx(event.deltaY, event.deltaMode, WHEEL_ITEM_PX, wheelNode.clientHeight || WHEEL_WINDOW_PX);
      if (!px) return;
      event.preventDefault();
      suppressTop = -1;
      precise.current = false;
      glide.current = false;
      glideTarget.current = null;
      settled = false;
      wheelNode.scrollTop += px;
    };

    wheelNode.addEventListener('scroll', onScroll, { passive: true });
    wheelNode.addEventListener('scrollend', commit);
    wheelNode.addEventListener('pointerdown', onPointerDown);
    wheelNode.addEventListener('pointermove', onPointerMove);
    wheelNode.addEventListener('pointerup', onPointerEnd);
    wheelNode.addEventListener('pointercancel', onPointerEnd);
    wheelNode.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.clearTimeout(timer);
      wheelNode.removeEventListener('scroll', onScroll);
      wheelNode.removeEventListener('scrollend', commit);
      wheelNode.removeEventListener('pointerdown', onPointerDown);
      wheelNode.removeEventListener('pointermove', onPointerMove);
      wheelNode.removeEventListener('pointerup', onPointerEnd);
      wheelNode.removeEventListener('pointercancel', onPointerEnd);
      wheelNode.removeEventListener('wheel', onWheel);
    };
  }, [wheelNode, onChange, options]);

  const scrollTo = (next: number, behavior: ScrollBehavior) => {
    const el = scroller.current;
    const index = options.findIndex((option) => option.value === next);
    if (!el || index < 0) return;
    precise.current = true;
    const target = centeredScrollTop(index, WHEEL_ITEM_PX);
    if (Math.abs(el.scrollTop - target) <= 0.5) {
      precise.current = false;
      gestureStart.current = target;
      glide.current = false;
      glideTarget.current = null;
      return;
    }
    glide.current = behavior === 'smooth';
    glideTarget.current = behavior === 'smooth' ? target : null;
    glideWaits.current = 0;
    el.scrollTo({ top: target, behavior });
  };

  const drag = useRef<{ id: number; y: number; top: number; moved: boolean } | null>(null);

  return (
    <>
      <button
        type="button"
        className="wheel-value"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}, ${selected?.label ?? ''}`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
      >
        <span className="wheel-value__readout">{selected?.label}</span>
      </button>
      <Sheet
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        stacked
        portal
        className="sheet--wheel"
      >
        {snaps.length ? (
          <div className="wheel-snaps" role="group" aria-label={`${label} snap points`}>
            {snaps.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`preset${option.value === value ? ' preset--on' : ''}`}
                onClick={() => {
                  precise.current = true;
                  onChange(option.value);
                  scrollTo(option.value, 'smooth');
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="wheel-window">
          <div
            ref={bindScroller}
            id={listId}
            className="wheel-scroller"
            role="listbox"
            aria-label={label}
            tabIndex={0}
            onKeyDown={(event) => {
              const index = options.findIndex((option) => option.value === value);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const next = options[Math.min(options.length - 1, Math.max(0, index + step))];
                if (!next) return;
                precise.current = true;
                onChange(next.value);
                scrollTo(next.value, 'auto');
              }
              if (event.key === 'Escape') setOpen(false);
            }}
            onPointerDown={(event) => {
              if (event.pointerType !== 'mouse' || event.button !== 0) return;
              const el = scroller.current;
              if (!el) return;
              drag.current = { id: event.pointerId, y: event.clientY, top: el.scrollTop, moved: false };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              const el = scroller.current;
              if (!active || active.id !== event.pointerId || !el) return;
              const dy = event.clientY - active.y;
              if (!active.moved && Math.abs(dy) < 4) return;
              if (!active.moved) {
                active.moved = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              el.scrollTop = active.top - dy;
            }}
            onPointerUp={(event) => {
              if (drag.current?.id === event.pointerId) drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`wheel-item${option.value === value ? ' wheel-item--on' : ''}${option.detent ? ' wheel-item--mark' : ''}${option.snap ? ' wheel-item--snap' : ''}`}
                onClick={() => {
                  if (gesture.current.moved) return;
                  precise.current = true;
                  onChange(option.value);
                  scrollTo(option.value, 'auto');
                }}
              >
                <span className="wheel-tick" aria-hidden="true" />
                <span className="wheel-item__label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Done
        </button>
      </Sheet>
    </>
  );
}
