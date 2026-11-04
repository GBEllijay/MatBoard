import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { detentIndex, wheelGestureSpeed, type WheelOption, type WheelSample } from '../lib/timeWheel';
import { Sheet } from './Sheet';

const ITEM_PX = 48;

/**
 * Large tappable value that opens an iOS-style wheel.
 * Touch scrolls natively. Mouse drag and the mouse wheel move the same column.
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
  /** Keyboard and a tapped row land on that second. A scroll may catch a tens mark. */
  const precise = useRef(false);
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
    precise.current = true;
    const index = Math.max(0, options.findIndex((option) => option.value === valueRef.current));
    wheelNode.scrollTop = index * ITEM_PX;
  }, [wheelNode, options]);

  useEffect(() => {
    if (!wheelNode) return;
    let timer = 0;
    const commit = () => {
      // scrollend and the scroll debounce can both fire for one move. Commit once,
      // so a tapped or arrowed value is not re-snapped by the second call.
      window.clearTimeout(timer);
      const centered = Math.min(options.length - 1, Math.max(0, Math.round(wheelNode.scrollTop / ITEM_PX)));
      const index = precise.current ? centered : detentIndex(centered, options, wheelGestureSpeed(samples.current));
      precise.current = false;
      samples.current = [];
      if (index !== centered) wheelNode.scrollTop = index * ITEM_PX;
      const next = options[index];
      if (next && next.value !== valueRef.current) onChange(next.value);
    };
    const onScroll = () => {
      samples.current.push({ t: performance.now(), top: wheelNode.scrollTop });
      const cutoff = performance.now() - 320;
      while (samples.current.length > 2 && samples.current[0].t < cutoff) samples.current.shift();
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 80);
    };
    wheelNode.addEventListener('scroll', onScroll, { passive: true });
    wheelNode.addEventListener('scrollend', commit);
    return () => {
      window.clearTimeout(timer);
      wheelNode.removeEventListener('scroll', onScroll);
      wheelNode.removeEventListener('scrollend', commit);
    };
  }, [wheelNode, onChange, options]);

  const scrollTo = (next: number, behavior: ScrollBehavior) => {
    const el = scroller.current;
    const index = options.findIndex((option) => option.value === next);
    if (!el || index < 0) return;
    el.scrollTo({ top: index * ITEM_PX, behavior });
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
