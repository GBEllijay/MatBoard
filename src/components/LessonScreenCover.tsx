import { useEffect, useRef, useState, type RefObject } from 'react';
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
  lessonCoverLogoSrc,
  lessonCoverScheduleKind,
  readLessonCoverMode,
  writeLessonCoverMode,
  type LessonCoverMode,
} from '../lib/lessonScreenCover';

/**
 * Full-screen cover for a mirrored gym TV.
 * The phone and the TV show the same picture. Show brings the plan back.
 */
export function LessonScreenHide() {
  const rootRef = useRef<HTMLElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<LessonCoverMode>(() => readLessonCoverMode());
  const [hidden, setHidden] = useState(false);
  const [fit, setFit] = useState<FullscreenRequestResult | 'pending'>('pending');

  useEffect(() => {
    const main = rootRef.current?.closest('main');
    if (!main) return;
    main.classList.toggle('notes--covered', hidden);
    document.documentElement.classList.toggle('lesson-cover-open', hidden);
    return () => {
      main.classList.remove('notes--covered');
      document.documentElement.classList.remove('lesson-cover-open');
    };
  }, [hidden]);

  const closeCover = () => {
    void exitPageFullscreen();
    setHidden(false);
  };

  const openCover = (next: LessonCoverMode) => {
    writeLessonCoverMode(next);
    flushSync(() => {
      setMode(next);
      setHidden(true);
      setFit('pending');
    });
    const el = coverRef.current;
    if (!el) {
      setFit('unsupported');
      return;
    }
    void requestElementFullscreen(el).then((result) => setFit(result));
  };

  return (
    <>
      <section ref={rootRef} className="notes__screen" aria-label="Hide screen">
        <button
          type="button"
          className="btn notes__screen-hide"
          onClick={() => openCover(mode)}
        >
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
      {hidden ? (
        <LessonScreenCover
          coverRef={coverRef}
          mode={mode}
          fit={fit}
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
    </>
  );
}

function LessonScreenCover({
  coverRef,
  mode,
  fit,
  onShow,
  onLogoTap,
}: {
  coverRef: RefObject<HTMLDivElement | null>;
  mode: LessonCoverMode;
  fit: FullscreenRequestResult | 'pending';
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
