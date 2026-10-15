import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { ScheduleMonthBoard } from './ScheduleMonthBoard';
import { ScheduleWeekBoard } from './ScheduleWeekBoard';
import { useGymLogo } from '../hooks/useGymBrand';
import { useScheduleState } from '../hooks/useStores';
import { exitPageFullscreen, fullscreenElement, requestElementFullscreen, type FullscreenRequestResult } from '../lib/fullscreen';
import { ADVANTAGE_MARK_SRC } from '../lib/gymLogo';
import {
  LESSON_COVER_HOME_HINT,
  LESSON_COVER_LABELS,
  LESSON_COVER_MODES,
  lessonCardHidePickerBox,
  lessonCoverLogoSrc,
  lessonCoverScheduleKind,
  readLessonCoverMode,
  writeLessonCoverMode,
  type LessonCardHidePickerBox,
  type LessonCoverMode,
} from '../lib/lessonScreenCover';

type ScrollRestore = {
  y: number;
  blockId: string | null;
};

type LessonCoverApi = {
  mode: LessonCoverMode;
  openCover: (mode: LessonCoverMode, restore?: ScrollRestore) => void;
};

const LessonCoverContext = createContext<LessonCoverApi | null>(null);

function useLessonCover(): LessonCoverApi {
  const value = useContext(LessonCoverContext);
  if (!value) throw new Error('Hide screen is only available on Daily Lesson Plan.');
  return value;
}

/**
 * Shared Hide screen cover for the top control and every lesson block card.
 * Returning from the cover puts the window back at the scroll position
 * captured when that hide started, so a lower card stays where the coach left it.
 */
export function LessonCoverProvider({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<ScrollRestore | null>(null);
  const hiddenRef = useRef(false);
  const [mode, setMode] = useState<LessonCoverMode>(() => readLessonCoverMode());
  const [hidden, setHidden] = useState(false);
  const [fit, setFit] = useState<FullscreenRequestResult | 'pending'>('pending');
  const [blockId, setBlockId] = useState('');
  hiddenRef.current = hidden;

  const applyRestore = () => {
    const saved = restoreRef.current;
    if (!saved || hiddenRef.current || !Number.isFinite(saved.y)) return;
    void document.documentElement.offsetHeight;
    window.scrollTo(0, saved.y);
  };

  useEffect(() => {
    const main = rootRef.current?.closest('main');
    if (main) main.classList.toggle('notes--covered', hidden);
    document.documentElement.classList.toggle('lesson-cover-open', hidden);
    if (!hidden) {
      applyRestore();
      const frame = requestAnimationFrame(applyRestore);
      const timers = [0, 50, 150, 400].map((delay) => window.setTimeout(applyRestore, delay));
      const stopForcing = () => {
        cancelAnimationFrame(frame);
        for (const timer of timers) window.clearTimeout(timer);
      };
      window.addEventListener('pointerdown', stopForcing, { capture: true, once: true });
      window.addEventListener('wheel', stopForcing, { capture: true, once: true });
      window.addEventListener('touchmove', stopForcing, { capture: true, once: true });
      return () => {
        stopForcing();
        window.removeEventListener('pointerdown', stopForcing, { capture: true });
        window.removeEventListener('wheel', stopForcing, { capture: true });
        window.removeEventListener('touchmove', stopForcing, { capture: true });
        main?.classList.remove('notes--covered');
        document.documentElement.classList.remove('lesson-cover-open');
      };
    }
    return () => {
      main?.classList.remove('notes--covered');
      document.documentElement.classList.remove('lesson-cover-open');
    };
  }, [hidden]);

  useEffect(() => {
    const onFullscreen = () => {
      if (fullscreenElement()) return;
      if (hiddenRef.current) return;
      const saved = restoreRef.current;
      if (!saved) return;
      window.scrollTo(0, saved.y);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
    };
  }, []);

  const closeCover = () => {
    void exitPageFullscreen();
    setHidden(false);
  };

  const openCover = (next: LessonCoverMode, restore?: ScrollRestore) => {
    restoreRef.current = restore ?? { y: window.scrollY, blockId: null };
    writeLessonCoverMode(next);
    flushSync(() => {
      setMode(next);
      setHidden(true);
      setFit('pending');
      setBlockId(restore?.blockId ?? '');
    });
    const el = coverRef.current;
    if (!el) {
      setFit('unsupported');
      return;
    }
    void requestElementFullscreen(el).then((result) => setFit(result));
  };

  return (
    <LessonCoverContext.Provider value={{ mode, openCover }}>
      <div ref={rootRef} className="lesson-cover-host">
        {children}
        {hidden ? (
          <LessonScreenCover
            coverRef={coverRef}
            mode={mode}
            fit={fit}
            blockId={blockId}
            onShow={closeCover}
            onLogoTap={() => {
              const el = coverRef.current;
              if (!el) return;
              if (fullscreenElement()) {
                closeCover();
                return;
              }
              void requestElementFullscreen(el).then((result) => {
                setFit(result);
                if (result === 'unsupported') closeCover();
              });
            }}
          />
        ) : null}
      </div>
    </LessonCoverContext.Provider>
  );
}

/** Top-of-page Hide screen control. Same cover as the per-card buttons. */
export function LessonScreenHide() {
  const { mode, openCover } = useLessonCover();
  return (
    <section className="notes__screen" aria-label="Hide screen">
      <button type="button" className="btn notes__screen-hide" onClick={() => openCover(mode)}>
        Hide screen
      </button>
      <div className="presets notes__screen-modes" role="radiogroup" aria-label="What the hidden screen shows">
        {LESSON_COVER_MODES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            className={`preset${mode === id ? ' preset--on' : ''}`}
            onClick={() => openCover(id)}
          >
            {LESSON_COVER_LABELS[id]}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Compact Hide screen control for one lesson block card.
 * Sits beside that card's video button and opens the same Logo / Schedule / Black picker.
 */
export function CardHideScreen({ label }: { label: string }) {
  const { mode, openCover } = useLessonCover();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const savedRef = useRef<ScrollRestore | null>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<LessonCardHidePickerBox | null>(null);

  const place = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setBox(
      lessonCardHidePickerBox({
        button: { top: rect.top, right: rect.right, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    );
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const remember = () => {
    const block = btnRef.current?.closest('[data-lesson-block]');
    savedRef.current = {
      y: window.scrollY,
      blockId: block instanceof HTMLElement && block.id ? block.id : null,
    };
  };

  return (
    <div className="notes__card-hide-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="notes__card-hide"
        aria-label={`Hide screen for ${label}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          remember();
          if (open) {
            setOpen(false);
            return;
          }
          place();
          setOpen(true);
        }}
      >
        <svg className="notes__card-hide-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 20h8M12 16v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 10h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="notes__card-hide-caption">Hide</span>
      </button>
      {open && box ? (
        <div
          className="presets notes__card-hide-modes"
          role="radiogroup"
          aria-label={`Hide screen options for ${label}`}
          style={{ left: box.left, width: box.width, top: box.top, bottom: box.bottom }}
        >
          {LESSON_COVER_MODES.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              className={`preset${mode === id ? ' preset--on' : ''}`}
              onClick={() => {
                const restore = savedRef.current ?? { y: window.scrollY, blockId: null };
                setOpen(false);
                openCover(id, restore);
              }}
            >
              {LESSON_COVER_LABELS[id]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LessonScreenCover({
  coverRef,
  mode,
  fit,
  blockId,
  onShow,
  onLogoTap,
}: {
  coverRef: RefObject<HTMLDivElement | null>;
  mode: LessonCoverMode;
  fit: FullscreenRequestResult | 'pending';
  blockId: string;
  onShow: () => void;
  onLogoTap: () => void;
}) {
  const showRef = useRef<HTMLButtonElement>(null);
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;
  const gymLogo = useGymLogo();
  const schedule = useScheduleState();
  const logoSrc = lessonCoverLogoSrc(gymLogo);
  const scheduleKind = lessonCoverScheduleKind(schedule.template);
  const logoAlt = logoSrc === ADVANTAGE_MARK_SRC ? 'Advantage' : 'Gym logo';

  useEffect(() => {
    showRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onShowRef.current();
    };
    const sawFullscreen = { current: false };
    const onFullscreen = () => {
      if (fullscreenElement()) {
        sawFullscreen.current = true;
        return;
      }
      if (sawFullscreen.current) onShowRef.current();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      void exitPageFullscreen();
    };
  }, []);

  return (
    <div
      ref={coverRef}
      className={`notes-cover notes-cover--${mode}${fit === 'unsupported' ? ' notes-cover--fallback' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Screen hidden"
      data-cover-mode={mode}
      data-cover-api={fit}
      data-cover-block={blockId || undefined}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.notes-cover__show, .notes-cover__logo-hit')) return;
        onLogoTap();
      }}
    >
      {mode === 'logo' ? (
        <button type="button" className="notes-cover__logo-hit" aria-label={`${logoAlt} logo`} onClick={onLogoTap}>
          <img className="notes-cover__logo" src={logoSrc} alt={logoAlt} draggable={false} />
        </button>
      ) : null}
      {mode === 'schedule' ? (
        scheduleKind === 'month' ? (
          <ScheduleMonthBoard variant="cast" />
        ) : (
          <ScheduleWeekBoard variant="cast" />
        )
      ) : null}
      <button
        ref={showRef}
        type="button"
        className="notes-cover__show"
        aria-label="Show screen"
        onClick={(event) => {
          event.stopPropagation();
          onShow();
        }}
      >
        Show
      </button>
      {fit === 'unsupported' ? <p className="notes-cover__hint">{LESSON_COVER_HOME_HINT}</p> : null}
    </div>
  );
}
