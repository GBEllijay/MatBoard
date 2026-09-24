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
  formatClassTime,
  groupClassesByTime,
  normalizeQrUrl,
  noticeLines,
  todayWeekday,
  type Weekday,
  type WeeklyClassSlot,
} from '../lib/scheduleStore';

type Layout = {
  scroll: boolean;
  font: string;
};

type Props = {
  /** `cast` fills the Media Console slideshow. `stage` sits on the schedule page. */
  variant?: 'cast' | 'stage';
  onOpenOptions?: () => void;
};

const FIT_LAYOUT: Layout = { scroll: false, font: '20px' };

/** Title sizes to try, largest first. The busiest day decides how tight the type starts. */
function fontLadder(busiest: number): number[] {
  if (busiest <= 3) return [26, 24, 22, 20, 18, 16];
  if (busiest <= 5) return [22, 20, 18, 17, 16, 15, 14];
  if (busiest <= 7) return [20, 18, 17, 16, 15, 14, 13];
  if (busiest <= 9) return [17, 16, 15, 14, 13, 12, 11];
  return [15, 14, 13, 12, 11, 10, 9];
}

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
  const columns = useMemo(
    () =>
      WEEKDAYS.map((day) => ({
        day,
        groups: groupClassesByTime(classesOnDay(schedule.classes, day)),
      })),
    [schedule.classes],
  );
  const notices = noticeLines(schedule.notes, schedule.specials);
  const gymTitle = schedule.title.trim() || gymName.trim() || 'Class Schedule';
  const logoSrc = resolveScheduleLogo(gymLogo, boardLogoUrl);
  const logoIsMark = logoSrc === ADVANTAGE_MARK_SRC;
  const qrHref = useMemo(() => normalizeQrUrl(schedule.qrUrl), [schedule.qrUrl]);
  const qrSrc = qrBuilt || qrImageUrl;
  const busiest = useMemo(() => {
    let count = 0;
    for (const column of columns) {
      let cards = 0;
      for (const group of column.groups) cards += group.items.length;
      count = Math.max(count, cards);
    }
    return count;
  }, [columns]);
  const occupied = useMemo(() => new Set(schedule.classes.map((row) => row.day)), [schedule.classes]);
  const hideNotes = layout.scroll || busiest >= 9;
  const signature = `${columns
    .map((column) =>
      column.groups
        .map((group) => group.items.map((item) => `${item.id}:${item.time}:${item.title}:${item.location}:${item.subtitle}`).join('+'))
        .join(','),
    )
    .join('|')}:${notices.length}:${variant}`;

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
    if (!frame || !board || busiest === 0) {
      setLayout(FIT_LAYOUT);
      return;
    }
    const height = frame.clientHeight;
    if (height < 48) return;
    const fonts = fontLadder(busiest);
    const sizeKey = `${signature}:${Math.round(frame.clientWidth / 32)}:${Math.round(height / 32)}`;
    const fontNow = Number.parseFloat(layout.font) || fonts[0];
    const overflows = () => {
      if (board.scrollHeight > frame.clientHeight + 4) return true;
      return Array.from(board.querySelectorAll('.week-cast__stack')).some(
        (stack) => stack instanceof HTMLElement && stack.scrollHeight > stack.clientHeight + 4,
      );
    };
    const cardsClip = () =>
      Array.from(board.querySelectorAll('.week-cast__class')).some(
        (card) => card instanceof HTMLElement && card.scrollHeight > card.clientHeight + 3,
      );

    if (decisionKey.current === `${sizeKey}:drift`) return;
    if (decisionKey.current === `${sizeKey}:fit` && !layout.scroll && !overflows() && !cardsClip()) return;

    const measuring = decisionKey.current === sizeKey && !layout.scroll;
    if (!measuring) {
      decisionKey.current = sizeKey;
      setLayout({ scroll: false, font: `${fonts[0]}px` });
      return;
    }

    if (!overflows() && !cardsClip()) {
      decisionKey.current = `${sizeKey}:fit`;
      return;
    }

    const smaller = fonts.find((size) => size < fontNow - 0.2);
    if (smaller) {
      decisionKey.current = sizeKey;
      setLayout({ scroll: false, font: `${smaller}px` });
      return;
    }

    decisionKey.current = `${sizeKey}:drift`;
    setLayout({ scroll: true, font: `${fonts[fonts.length - 1]}px` });
  }, [layout, signature, busiest, measureTick]);

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
      className={`week-cast week-cast--stacked week-cast--${variant}${layout.scroll ? ' is-drift' : ' is-fit'}${paused ? ' is-paused' : ''}`}
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
        {busiest === 0 ? (
          <p className="week-cast__empty">No classes yet. Tap Edit to add the week. Saved on this device.</p>
        ) : (
          <div
            className="week-cast__board"
            ref={boardRef}
            style={{ ['--week-font' as string]: layout.font }}
          >
            {columns.map(({ day, groups }) => (
              <WeekColumn
                key={day}
                day={day}
                groups={groups}
                today={today}
                occupied={occupied.has(day)}
              />
            ))}
          </div>
        )}
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

function WeekColumn({
  day,
  groups,
  today,
  occupied,
}: {
  day: Weekday;
  groups: ReturnType<typeof groupClassesByTime>;
  today: Weekday;
  occupied: boolean;
}) {
  return (
    <section
      className={`week-cast__column${day === today ? ' is-today' : ''}${occupied ? '' : ' is-empty'}`}
      aria-label={WEEKDAY_LABELS[day]}
      aria-current={day === today ? 'date' : undefined}
    >
      <header className="week-cast__dow">
        <span className="week-cast__day-full">{WEEKDAY_LABELS[day]}</span>
        <span className="week-cast__day-short">{WEEKDAY_SHORT[day]}</span>
      </header>
      <div className="week-cast__stack">
        {groups.map((group) => {
          const parallel = group.items.length > 1;
          return (
            <div
              key={`${day}-${group.time}-${group.items[0]?.id ?? 'empty'}`}
              className={`week-cast__bundle${parallel ? ' is-parallel' : ''}`}
              style={{ ['--cards' as string]: String(Math.max(1, group.items.length)) }}
            >
              {group.items.map((item) => (
                <ClassCard key={item.id} item={item} />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClassCard({ item }: { item: WeeklyClassSlot }) {
  const title = item.title.trim() || 'Class';
  const detail = item.subtitle.trim();
  const mat = item.location.trim();
  const program = classProgram(title);
  const when = formatClassTime(item.time);
  return (
    <article className="week-cast__class" data-program={program.id}>
      {when ? (
        <time className="week-cast__when" dateTime={item.time}>
          {when}
        </time>
      ) : null}
      <strong>{title}</strong>
      {mat ? <span className="week-cast__mat">{mat}</span> : null}
      {detail ? <em>{detail}</em> : null}
    </article>
  );
}
