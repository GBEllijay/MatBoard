import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  SPECIAL_EVENT_DWELL_MS,
  specialEventCount,
  specialEventSlides,
  type SpecialDate,
  type SpecialEventSlide,
} from '../lib/scheduleStore';

const SWIPE_MIN_PX = 36;

type Surface = 'board' | 'list';

type Props = {
  notes: string;
  specials: readonly SpecialDate[];
  /** `board` is the week/month cast strip. `list` is the phone list notices block. */
  surface: Surface;
  /** Six-week months keep the calendar grid and hide this strip, same as before. */
  hidden?: boolean;
};

function localIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduce(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

function StaticLines({ slides }: { slides: readonly SpecialEventSlide[] }) {
  return slides.map((slide) => (
    <p key={slide.id} data-special-slide={slide.id}>
      {slide.text}
    </p>
  ));
}

function EventRotator({
  slides,
  reduce,
}: {
  slides: readonly SpecialEventSlide[];
  reduce: boolean;
}) {
  const reactId = useId();
  const viewportId = `special-events-${reactId}`;
  const slideKey = slides.map((slide) => slide.id).join('\n');
  const [index, setIndex] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const count = slides.length;
  const safeIndex = count === 0 ? 0 : ((index % count) + count) % count;
  const paused = hovered || focused;

  useEffect(() => {
    setIndex(0);
  }, [slideKey]);

  useEffect(() => {
    // Reduced motion keeps the same one-line strip and moves only on tap, swipe, or a dot.
    if (count < 2 || reduce || paused) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, SPECIAL_EVENT_DWELL_MS);
    return () => window.clearInterval(id);
  }, [count, reduce, paused, epoch]);

  const go = (delta: number) => {
    if (count < 2) return;
    setIndex((current) => (current + delta + count) % count);
    setEpoch((current) => current + 1);
  };

  const onFocusCapture = () => setFocused(true);
  const onBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFocused(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, textarea, select')) return;
    gesture.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const origin = gesture.current;
    gesture.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) go(1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (safeIndex + delta + count) % count;
    const root = event.currentTarget;
    go(delta);
    queueMicrotask(() => {
      root.querySelectorAll<HTMLButtonElement>('.special-rotator__dot')[next]?.focus();
    });
  };

  return (
    <div
      className={`special-rotator${reduce ? ' is-reduced' : ''}${paused ? ' is-paused' : ''}`}
      role="group"
      aria-roledescription="carousel"
      aria-label="Special events"
      onMouseEnter={() => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        id={viewportId}
        className="special-rotator__viewport"
        aria-live="polite"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        {slides.map((slide, slideIndex) => (
          <p
            key={slide.id}
            className={`special-rotator__slide${slideIndex === safeIndex ? ' is-on' : ''}`}
            data-special-slide={slide.id}
            aria-hidden={slideIndex === safeIndex ? undefined : true}
          >
            {slide.text}
          </p>
        ))}
      </div>
      <div className="special-rotator__dots">
        {slides.map((slide, slideIndex) => (
          <button
            key={slide.id}
            type="button"
            className="special-rotator__dot"
            aria-label={`Show ${slide.text}`}
            aria-current={slideIndex === safeIndex ? 'true' : undefined}
            aria-controls={viewportId}
            onClick={() => {
              setIndex(slideIndex);
              setEpoch((current) => current + 1);
            }}
          >
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function SpecialEventsStrip({ notes, specials, surface, hidden = false }: Props) {
  const reduce = usePrefersReducedMotion();
  const todayKey = localIso();
  const slides = useMemo(
    () => specialEventSlides(notes, specials, new Date()),
    [notes, specials, todayKey],
  );
  const events = specialEventCount(slides);
  if (hidden) return null;

  const label = events > 0 ? 'Special events' : 'Notices';
  const rotate = events > 1;
  const mode = !rotate ? 'static' : reduce ? 'manual' : 'live';

  if (surface === 'list') {
    return (
      <aside
        className={`schedule__notes${slides.length ? ' is-filled' : ''}`}
        aria-label={label}
        data-rotator={slides.length ? mode : undefined}
      >
        <p className="schedule__notes-label">Notices</p>
        {slides.length === 0 ? (
          <p>Holiday closings, schedule changes, and special events go here.</p>
        ) : rotate ? (
          <EventRotator slides={slides} reduce={reduce} />
        ) : (
          <StaticLines slides={slides} />
        )}
      </aside>
    );
  }

  if (slides.length === 0) return null;

  return (
    <footer
      className="week-cast__notes"
      aria-label={label}
      data-rotator={mode}
    >
      {rotate ? <EventRotator slides={slides} reduce={reduce} /> : <StaticLines slides={slides} />}
    </footer>
  );
}
