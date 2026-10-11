import { useEffect, useRef, useState } from 'react';
import { ScheduleMonthBoard } from './ScheduleMonthBoard';
import { ScheduleWeekBoard } from './ScheduleWeekBoard';
import { useGymLogo } from '../hooks/useGymBrand';
import { useScheduleState } from '../hooks/useStores';
import { ADVANTAGE_MARK_SRC } from '../lib/gymLogo';
import {
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
  const [mode, setMode] = useState<LessonCoverMode>(() => readLessonCoverMode());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const main = rootRef.current?.closest('main');
    if (!main) return;
    main.classList.toggle('notes--covered', hidden);
    return () => main.classList.remove('notes--covered');
  }, [hidden]);

  const choose = (next: LessonCoverMode) => {
    writeLessonCoverMode(next);
    setMode(next);
    setHidden(true);
  };

  return (
    <>
      <section ref={rootRef} className="notes__screen" aria-label="Hide screen">
        <button
          type="button"
          className="btn notes__screen-hide"
          onClick={() => {
            writeLessonCoverMode(mode);
            setHidden(true);
          }}
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
              onClick={() => choose(id)}
            >
              {LESSON_COVER_LABELS[id]}
            </button>
          ))}
        </div>
      </section>
      {hidden ? <LessonScreenCover mode={mode} onShow={() => setHidden(false)} /> : null}
    </>
  );
}

function LessonScreenCover({ mode, onShow }: { mode: LessonCoverMode; onShow: () => void }) {
  const showRef = useRef<HTMLButtonElement>(null);
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;
  const gymLogo = useGymLogo();
  const schedule = useScheduleState();
  const logoSrc = lessonCoverLogoSrc(gymLogo);
  const scheduleKind = lessonCoverScheduleKind(schedule.template);

  useEffect(() => {
    showRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onShowRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`notes-cover notes-cover--${mode}`}
      role="dialog"
      aria-modal="true"
      aria-label="Screen hidden"
      data-cover-mode={mode}
    >
      {mode === 'logo' ? (
        <img
          className="notes-cover__logo"
          src={logoSrc}
          alt={logoSrc === ADVANTAGE_MARK_SRC ? 'Advantage' : 'Gym logo'}
          draggable={false}
        />
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
        onClick={onShow}
      >
        Show
      </button>
    </div>
  );
}
