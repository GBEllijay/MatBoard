import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGymLogo, useGymName } from '../hooks/useGymBrand';
import { useScheduleAssets, useScheduleState } from '../hooks/useStores';
import { ADVANTAGE_MARK_SRC, resolveScheduleLogo } from '../lib/gymLogo';
import { qrDataUrl } from '../lib/qr';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  classesAt,
  formatBoardStamp,
  formatClassTime,
  normalizeQrUrl,
  noticeLines,
  todayWeekday,
  weekTimeRows,
  type Weekday,
} from '../lib/scheduleStore';

type Layout = {
  scroll: boolean;
  row: string;
  font: string;
};

type Props = {
  /** `cast` fills the Media Console slideshow. `stage` sits on the schedule page. */
  variant?: 'cast' | 'stage';
  onOpenOptions?: () => void;
};

const FIT_LAYOUT: Layout = { scroll: false, row: 'minmax(min-content, 1fr)', font: '16px' };

export function ScheduleWeekBoard({ variant = 'stage', onOpenOptions }: Props) {
  const schedule = useScheduleState();
  const assets = useScheduleAssets();
  const gymLogo = useGymLogo();
  const gymName = useGymName();
  const [boardLogoUrl, setBoardLogoUrl] = useState('');
  const [qrBuilt, setQrBuilt] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [layout, setLayout] = useState<Layout>(FIT_LAYOUT);
  const [paused, setPaused] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const decisionKey = useRef('');
  const [measureTick, setMeasureTick] = useState(0);
  const today = todayWeekday();
  const rows = useMemo(() => weekTimeRows(schedule.classes), [schedule.classes]);
  const notices = noticeLines(schedule.notes, schedule.specials);
  const gymTitle = schedule.title.trim() || gymName.trim() || 'Class Schedule';
  const logoSrc = resolveScheduleLogo(gymLogo, boardLogoUrl);
  const logoIsMark = logoSrc === ADVANTAGE_MARK_SRC;
  const qrHref = useMemo(() => normalizeQrUrl(schedule.qrUrl), [schedule.qrUrl]);
  const qrSrc = qrBuilt || qrImageUrl;
  const busiest = useMemo(() => {
    let count = 1;
    for (const time of rows) {
      for (const day of WEEKDAYS) {
        count = Math.max(count, classesAt(schedule.classes, day, time).length);
      }
    }
    return count;
  }, [rows, schedule.classes]);
  const signature = `${rows.join('|')}:${schedule.classes.length}:${busiest}:${notices.length}:${variant}`;

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
    const board = boardRef.current;
    if (!frame || !board || rows.length === 0) {
      setLayout(FIT_LAYOUT);
      return;
    }
    const height = frame.clientHeight;
    if (height < 48) return;
    const sizeKey = `${signature}:${Math.round(frame.clientWidth / 32)}:${Math.round(height / 32)}`;
    const fonts = busiest > 1 ? [15, 14, 13, 12, 11] : [18, 16, 15, 14, 13, 12];
    const fontNow = Number.parseFloat(layout.font) || fonts[0];
    const overflows = () => board.scrollHeight > frame.clientHeight + 4;
    const cellsClip = () =>
      Array.from(board.querySelectorAll('.week-cast__cell')).some(
        (cell) => cell instanceof HTMLElement && cell.scrollHeight > cell.clientHeight + 3,
      );

    if (decisionKey.current === `${sizeKey}:drift`) return;
    if (decisionKey.current === `${sizeKey}:fit` && !layout.scroll && !overflows() && !cellsClip()) return;

    const measuring = decisionKey.current === sizeKey && !layout.scroll;
    if (!measuring) {
      decisionKey.current = sizeKey;
      setLayout({ scroll: false, row: 'minmax(min-content, 1fr)', font: `${fonts[0]}px` });
      return;
    }

    if (!overflows() && !cellsClip()) {
      decisionKey.current = `${sizeKey}:fit`;
      return;
    }

    const smaller = fonts.find((size) => size < fontNow - 0.2);
    if (smaller) {
      decisionKey.current = sizeKey;
      setLayout({ scroll: false, row: 'minmax(min-content, 1fr)', font: `${smaller}px` });
      return;
    }

    decisionKey.current = `${sizeKey}:drift`;
    setLayout({ scroll: true, row: 'auto', font: `${fonts[fonts.length - 1]}px` });
  }, [layout, signature, rows.length, busiest, measureTick]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const next = `${Math.round(frame.clientWidth / 32)}:${Math.round(frame.clientHeight / 32)}`;
      if (decisionKey.current.endsWith(next)) return;
      decisionKey.current = '';
      setMeasureTick((tick) => tick + 1);
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, [signature]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !layout.scroll || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let dir = 1;
    let holdUntil = performance.now() + 1600;
    let last = performance.now();
    const speed = 18;
    const tick = (now: number) => {
      const max = frame.scrollHeight - frame.clientHeight;
      if (max > 4 && now >= holdUntil) {
        const dt = Math.min(0.05, (now - last) / 1000);
        frame.scrollTop += dir * speed * dt;
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
  }, [layout.scroll, paused, signature]);

  useEffect(() => {
    if (!paused) return;
    const id = window.setTimeout(() => setPaused(false), 6000);
    return () => window.clearTimeout(id);
  }, [paused]);

  return (
    <section
      className={`week-cast week-cast--${variant}${layout.scroll ? ' is-drift' : ' is-fit'}${paused ? ' is-paused' : ''}`}
      aria-label="Weekly class schedule"
      onPointerDown={() => {
        if (layout.scroll) setPaused(true);
      }}
    >
      <header className={`week-cast__head${qrSrc ? '' : ' week-cast__head--no-qr'}`}>
        <div className={`week-cast__logo${logoIsMark ? ' is-mark' : ' is-custom'}`}>
          <img src={logoSrc} alt={logoIsMark ? 'Advantage' : 'Gym logo'} />
        </div>
        <div className="week-cast__title">
          <h2>{gymTitle}</h2>
          <p>Class schedule · {formatBoardStamp()}</p>
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
        {rows.length === 0 ? (
          <p className="week-cast__empty">No classes yet. Tap Edit to add the week. Saved on this device.</p>
        ) : (
          <div
            className="week-cast__board"
            ref={boardRef}
            role="table"
            style={{
              ['--week-rows' as string]: String(rows.length),
              ['--week-row' as string]: layout.row,
              ['--week-font' as string]: layout.font,
            }}
          >
            <div className="week-cast__corner" role="columnheader" />
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className={`week-cast__dow${day === today ? ' is-today' : ''}`}
                role="columnheader"
              >
                <span className="week-cast__day-full">{WEEKDAY_LABELS[day]}</span>
                <span className="week-cast__day-short">{WEEKDAY_SHORT[day]}</span>
              </div>
            ))}
            {rows.map((time) => (
              <WeekRow key={time} time={time} today={today} />
            ))}
          </div>
        )}
      </div>

      {notices.length ? (
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

function WeekRow({ time, today }: { time: string; today: Weekday }) {
  const schedule = useScheduleState();
  return (
    <div className="week-cast__row" role="row">
      <div className="week-cast__time" role="rowheader">
        {formatClassTime(time)}
      </div>
      {WEEKDAYS.map((day) => {
        const items = classesAt(schedule.classes, day, time);
        return (
          <div
            key={`${day}-${time}`}
            className={`week-cast__cell${day === today ? ' is-today' : ''}${items.length > 1 ? ' is-parallel' : ''}`}
            role="cell"
          >
            {items.map((item) => {
              const title = item.title.trim() || 'Class';
              const detail = item.subtitle.trim();
              const mat = item.location.trim();
              return (
                <p key={item.id} className="week-cast__class">
                  {mat ? <span className="week-cast__mat">{mat}</span> : null}
                  <strong>{title}</strong>
                  {detail ? <em>{detail}</em> : null}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
