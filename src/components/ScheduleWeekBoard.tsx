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

type Props = {
  /** `cast` fills the Media Console slideshow. `stage` sits on the schedule page. */
  variant?: 'cast' | 'stage';
  onOpenOptions?: () => void;
};

export function ScheduleWeekBoard({ variant = 'stage', onOpenOptions }: Props) {
  const schedule = useScheduleState();
  const assets = useScheduleAssets();
  const gymLogo = useGymLogo();
  const gymName = useGymName();
  const [boardLogoUrl, setBoardLogoUrl] = useState('');
  const [qrBuilt, setQrBuilt] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [scrolls, setScrolls] = useState(false);
  const [paused, setPaused] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const sizeSeen = useRef('');
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
    if (!frame || busiest === 0) {
      setScrolls(false);
      return;
    }
    if (frame.clientHeight < 48) return;
    const next = frame.scrollHeight > frame.clientHeight + 6;
    setScrolls((prev) => (prev === next ? prev : next));
  }, [signature, busiest, measureTick]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const next = `${Math.round(frame.clientWidth / 8)}:${Math.round(frame.clientHeight / 8)}`;
      if (sizeSeen.current === next) return;
      sizeSeen.current = next;
      setMeasureTick((tick) => tick + 1);
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, [signature]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !scrolls || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let dir = 1;
    let holdUntil = performance.now() + 1600;
    let last = performance.now();
    let pos = frame.scrollTop;
    const speed = 18;
    const tick = (now: number) => {
      const max = frame.scrollHeight - frame.clientHeight;
      if (max > 4 && now >= holdUntil) {
        const dt = Math.min(0.05, (now - last) / 1000);
        pos += dir * speed * dt;
        if (pos <= 0) {
          pos = 0;
          dir = 1;
          holdUntil = now + 2400;
        } else if (pos >= max - 1) {
          pos = max;
          dir = -1;
          holdUntil = now + 2400;
        }
        frame.scrollTop = pos;
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrolls, paused, signature]);

  useEffect(() => {
    if (!paused) return;
    const id = window.setTimeout(() => setPaused(false), 6000);
    return () => window.clearTimeout(id);
  }, [paused]);

  return (
    <section
      className={`week-cast week-cast--stacked week-cast--${variant}${scrolls ? ' is-drift' : ' is-fit'}${paused ? ' is-paused' : ''}`}
      aria-label="Weekly class schedule"
      onPointerDown={() => {
        if (scrolls) setPaused(true);
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
          <div className="week-cast__board">
            {columns.map(({ day, groups }) => (
              <WeekColumn key={day} day={day} groups={groups} today={today} occupied={occupied.has(day)} />
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
      {when || mat ? (
        <p className="week-cast__meta">
          {when ? (
            <time className="week-cast__when" dateTime={item.time}>
              {when}
            </time>
          ) : null}
          {mat ? <span className="week-cast__mat">{mat}</span> : null}
        </p>
      ) : null}
      <strong>{title}</strong>
      {detail ? <em>{detail}</em> : null}
    </article>
  );
}
