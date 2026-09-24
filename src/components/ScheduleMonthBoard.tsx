import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGymLogo, useGymName } from '../hooks/useGymBrand';
import { useScheduleAssets, useScheduleState } from '../hooks/useStores';
import { ADVANTAGE_MARK_SRC, resolveScheduleLogo } from '../lib/gymLogo';
import { qrDataUrl } from '../lib/qr';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  classProgram,
  classesOnDay,
  formatBoardStamp,
  monthWeeks,
  normalizeQrUrl,
  noticeLines,
  type ClassProgram,
  type MonthDay,
  type SpecialDate,
  type WeeklyClassSlot,
} from '../lib/scheduleStore';

type DayGlance = {
  count: number;
  programs: ClassProgram[];
  extraPrograms: number;
  special: string | null;
};

type Props = {
  variant?: 'cast' | 'stage';
  onOpenOptions?: () => void;
};

function localIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function glanceForDay(
  day: MonthDay,
  classes: readonly WeeklyClassSlot[],
  specials: readonly SpecialDate[],
): DayGlance {
  if (!day.inMonth) return { count: 0, programs: [], extraPrograms: 0, special: null };
  const seen = new Set<string>();
  const programs: ClassProgram[] = [];
  for (const item of classesOnDay(classes, day.weekday)) {
    const program = classProgram(item.title);
    if (seen.has(program.id)) continue;
    seen.add(program.id);
    programs.push(program);
  }
  const special = specials.find((item) => item.date === day.iso);
  const specialLabel = special ? (special.title.trim() || special.body.trim() || 'Special').slice(0, 14) : null;
  return {
    count: classesOnDay(classes, day.weekday).length,
    programs: programs.slice(0, 3),
    extraPrograms: Math.max(0, programs.length - 3),
    special: specialLabel,
  };
}

export function ScheduleMonthBoard({ variant = 'stage', onOpenOptions }: Props) {
  const schedule = useScheduleState();
  const assets = useScheduleAssets();
  const gymLogo = useGymLogo();
  const gymName = useGymName();
  const [boardLogoUrl, setBoardLogoUrl] = useState('');
  const [qrBuilt, setQrBuilt] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [scroll, setScroll] = useState(false);
  const [paused, setPaused] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [measureTick, setMeasureTick] = useState(0);
  const weeks = useMemo(() => monthWeeks(new Date()), []);
  const todayIso = localIso();
  const notices = noticeLines(schedule.notes, schedule.specials);
  const gymTitle = schedule.title.trim() || gymName.trim() || 'Class Schedule';
  const logoSrc = resolveScheduleLogo(gymLogo, boardLogoUrl);
  const logoIsMark = logoSrc === ADVANTAGE_MARK_SRC;
  const qrHref = useMemo(() => normalizeQrUrl(schedule.qrUrl), [schedule.qrUrl]);
  const qrSrc = qrBuilt || qrImageUrl;
  const hideNotes = weeks.length >= 6;

  useEffect(() => {
    const next = assets.logo ? URL.createObjectURL(assets.logo) : '';
    setBoardLogoUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [assets.logo, assets.revision]);

  useEffect(() => {
    const next = assets.qrImage ? URL.createObjectURL(assets.qrImage) : '';
    setQrImageUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [assets.qrImage, assets.revision]);

  useEffect(() => {
    if (!qrHref) {
      setQrBuilt('');
      return;
    }
    let cancelled = false;
    void qrDataUrl(qrHref)
      .then((url) => {
        if (!cancelled) setQrBuilt(url);
      })
      .catch(() => {
        if (!cancelled) setQrBuilt('');
      });
    return () => {
      cancelled = true;
    };
  }, [qrHref]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || frame.clientHeight < 48) return;
    const nextScroll = frame.scrollHeight > frame.clientHeight + 6;
    setScroll((current) => (current === nextScroll ? current : nextScroll));
  }, [weeks.length, schedule.classes.length, schedule.specials.length, measureTick]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMeasureTick((tick) => tick + 1));
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !scroll || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let dir = 1;
    let holdUntil = performance.now() + 1600;
    let last = performance.now();
    const tick = (now: number) => {
      const max = frame.scrollHeight - frame.clientHeight;
      if (max > 4 && now >= holdUntil) {
        const dt = Math.min(0.05, (now - last) / 1000);
        frame.scrollTop += dir * 18 * dt;
        if (frame.scrollTop <= 0) {
          frame.scrollTop = 0;
          dir = 1;
          holdUntil = now + 2400;
        } else if (frame.scrollTop >= max - 1) {
          frame.scrollTop = max;
          dir = -1;
          holdUntil = now + 2400;
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scroll, paused, weeks.length]);

  useEffect(() => {
    if (!paused) return;
    const id = window.setTimeout(() => setPaused(false), 6000);
    return () => window.clearTimeout(id);
  }, [paused]);

  return (
    <section
      className={`week-cast month-cast week-cast--${variant}${scroll ? ' is-drift' : ' is-fit'}${paused ? ' is-paused' : ''}`}
      aria-label="Monthly class schedule"
      onPointerDown={() => {
        if (scroll) setPaused(true);
      }}
    >
      <header className={`week-cast__head${qrSrc ? '' : ' week-cast__head--no-qr'}`}>
        <div className={`week-cast__logo${logoIsMark ? ' is-mark' : ' is-custom'}`}>
          <img src={logoSrc} alt={logoIsMark ? 'Advantage' : 'Gym logo'} />
        </div>
        <div className="week-cast__title">
          <h2>{gymTitle}</h2>
          <p>{formatBoardStamp()} · Class schedule</p>
        </div>
        {qrSrc ? (
          <div className="week-cast__qr">
            <img src={qrSrc} alt={qrHref ? `QR code for ${qrHref}` : 'QR code'} />
          </div>
        ) : (
          <div className="week-cast__qr week-cast__qr--empty" aria-hidden="true" />
        )}
      </header>

      <div className="week-cast__frame" ref={frameRef}>
        <div
          className="month-cast__grid"
          role="table"
          style={{ ['--month-weeks' as string]: String(weeks.length) }}
        >
          {WEEKDAYS.map((day) => (
            <div key={day} className="month-cast__dow" role="columnheader">
              <span className="week-cast__day-full">{WEEKDAY_LABELS[day]}</span>
              <span className="week-cast__day-short">{WEEKDAY_SHORT[day]}</span>
            </div>
          ))}
          {weeks.map((week) =>
            week.map((day) => {
              const glance = glanceForDay(day, schedule.classes, schedule.specials);
              return (
                <div
                  key={day.iso}
                  className={`month-cast__cell${day.inMonth ? '' : ' is-out'}${day.iso === todayIso ? ' is-today' : ''}`}
                  role="cell"
                >
                  <span className="month-cast__num">{day.dayNumber}</span>
                  {glance.count > 0 ? (
                    <p className="month-cast__count">
                      {glance.count} {glance.count === 1 ? 'class' : 'classes'}
                    </p>
                  ) : null}
                  {glance.programs.length ? (
                    <div className="month-cast__chips">
                      {glance.programs.map((program) => (
                        <span key={program.id} className="month-cast__chip" data-program={program.id}>
                          {program.label}
                        </span>
                      ))}
                      {glance.extraPrograms > 0 ? (
                        <span className="month-cast__more">+{glance.extraPrograms}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {glance.special ? <p className="month-cast__special">{glance.special}</p> : null}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {notices.length && !hideNotes ? (
        <footer className="week-cast__notes" aria-label="Notices">
          {notices.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </footer>
      ) : null}

      {variant === 'cast' && onOpenOptions ? (
        <button
          type="button"
          className="week-cast__options"
          onClick={(event) => {
            event.stopPropagation();
            onOpenOptions();
          }}
        >
          Options
        </button>
      ) : null}
    </section>
  );
}
