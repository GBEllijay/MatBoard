import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGymLogo, useGymName } from '../hooks/useGymBrand';
import { useScheduleAssets, useScheduleState } from '../hooks/useStores';
import { ADVANTAGE_MARK_SRC, resolveScheduleLogo } from '../lib/gymLogo';
import { qrDataUrl } from '../lib/qr';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  classesOnDay,
  formatBoardStamp,
  formatClassTime,
  monthWeeks,
  normalizeQrUrl,
  noticeLines,
  type MonthDay,
  type SpecialDate,
  type WeeklyClassSlot,
} from '../lib/scheduleStore';

type Chip = { key: string; time: string; label: string };

type Props = {
  variant?: 'cast' | 'stage';
  onOpenOptions?: () => void;
};

function localIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function chipsForDay(
  day: MonthDay,
  classes: readonly WeeklyClassSlot[],
  specials: readonly SpecialDate[],
): Chip[] {
  if (!day.inMonth) return [];
  const chips: Chip[] = [];
  for (const special of specials) {
    if (special.date !== day.iso) continue;
    const label = special.title.trim() || special.body.trim() || 'Special';
    chips.push({ key: special.id, time: '', label });
  }
  for (const item of classesOnDay(classes, day.weekday)) {
    chips.push({
      key: item.id,
      time: formatClassTime(item.time),
      label: item.title.trim() || 'Class',
    });
  }
  return chips;
}

export function ScheduleMonthBoard({ variant = 'stage', onOpenOptions }: Props) {
  const schedule = useScheduleState();
  const assets = useScheduleAssets();
  const gymLogo = useGymLogo();
  const gymName = useGymName();
  const [boardLogoUrl, setBoardLogoUrl] = useState('');
  const [qrBuilt, setQrBuilt] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [budget, setBudget] = useState(3);
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
    const head = frame.querySelector('.month-cast__dow');
    const headH = head instanceof HTMLElement ? head.getBoundingClientRect().height : 22;
    const rowH = (frame.clientHeight - headH) / Math.max(1, weeks.length);
    const nextBudget = Math.max(1, Math.floor((rowH - 22) / 18));
    const nextScroll = frame.scrollHeight > frame.clientHeight + 6 && nextBudget <= 1;
    setBudget((current) => (current === nextBudget ? current : nextBudget));
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
              const chips = chipsForDay(day, schedule.classes, schedule.specials);
              const visible = chips.slice(0, budget);
              const extra = chips.length - visible.length;
              return (
                <div
                  key={day.iso}
                  className={`month-cast__cell${day.inMonth ? '' : ' is-out'}${day.iso === todayIso ? ' is-today' : ''}`}
                  role="cell"
                >
                  <span className="month-cast__num">{day.dayNumber}</span>
                  {visible.map((chip) => (
                    <p key={chip.key} className="month-cast__chip">
                      {chip.time ? <b>{chip.time}</b> : null}
                      {chip.label}
                    </p>
                  ))}
                  {extra > 0 ? <p className="month-cast__more">+{extra} more</p> : null}
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
