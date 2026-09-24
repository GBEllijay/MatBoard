import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { ScheduleWeekBoard } from '../components/ScheduleWeekBoard';
import { MEDIA_CONSOLE_NAME } from '../lib/productNames';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useScheduleAssets, useScheduleState } from '../hooks/useStores';
import { useWakeLock } from '../hooks/useWakeLock';
import { qrDataUrl } from '../lib/qr';
import {
  formatScheduleCsvSummary,
  importScheduleCsvFile,
  scheduleCsvFileName,
  scheduleCsvTemplate,
  serializeScheduleCsv,
  type ScheduleCsvImport,
} from '../lib/scheduleCsv';
import { isSpreadsheetWorkbook, ROSTER_CSV_WORKBOOK_ERROR, withUtf8Bom } from '../lib/rosterCsv';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  SCHEDULE_TEMPLATES,
  SCHEDULE_TEMPLATE_HINTS,
  SCHEDULE_TEMPLATE_LABELS,
  DEFAULT_MATS,
  addClass,
  addParallelClass,
  addSpecial,
  applyScheduleImport,
  boardWeekdays,
  classesOnDay,
  formatBoardStamp,
  formatClassTime,
  formatSpecialDate,
  formatTimeGroupLine,
  getSchedule,
  groupClassesByTime,
  loadSampleWeek,
  noticeLines,
  normalizeQrUrl,
  readPickedImage,
  removeClass,
  removeSpecial,
  setBoardTitle,
  setLogoBlob,
  setQrImageBlob,
  setQrUrl,
  setScheduleCastEnabled,
  setScheduleNotes,
  setScheduleTemplate,
  suggestNextMat,
  todayWeekday,
  updateClass,
  updateSpecial,
  type ClassTimeGroup,
  type ScheduleTemplate,
  type SpecialDate,
  type Weekday,
  type WeeklyClassSlot,
} from '../lib/scheduleStore';

const TEMPLATE_CHROME: Record<ScheduleTemplate, string> = {
  week: 'Week',
  'weekly-list': 'List',
  'week-grid': 'Grid',
  monthly: 'Month',
};

function downloadScheduleCsv(filename: string, csv: string): void {
  const blob = new Blob([withUtf8Bom(csv)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function SchedulePage() {
  const schedule = useScheduleState();
  const assets = useScheduleAssets();
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [castPick, setCastPick] = useState<ScheduleTemplate | null>(null);
  const [searchParams] = useSearchParams();
  const [logoUrl, setLogoUrl] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrBuilt, setQrBuilt] = useState('');
  const [qrNote, setQrNote] = useState('');
  const today = todayWeekday();
  const stamp = formatBoardStamp();
  const gymName = schedule.title.trim();

  useWakeLock(true);

  useEffect(() => {
    if (searchParams.get('sample') !== '1') return;
    if (getSchedule().classes.length > 0) return;
    loadSampleWeek();
    setScheduleTemplate('week');
  }, [searchParams]);

  useEffect(() => {
    const next = assets.logo ? URL.createObjectURL(assets.logo) : '';
    setLogoUrl(next);
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

  const qrHref = useMemo(() => normalizeQrUrl(schedule.qrUrl), [schedule.qrUrl]);

  useEffect(() => {
    if (!qrHref) {
      setQrBuilt('');
      setQrNote('');
      return;
    }
    let cancelled = false;
    void qrDataUrl(qrHref)
      .then((url) => {
        if (!cancelled) {
          setQrBuilt(url);
          setQrNote('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrBuilt('');
          setQrNote('That link could not turn into a QR code. Try a shorter web address.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qrHref]);

  const qrSrc = qrBuilt || qrImageUrl;
  const notices = noticeLines(schedule.notes, schedule.specials);
  const emptyBoard =
    schedule.classes.length === 0 && notices.length === 0 && !logoUrl && !qrSrc;
  const tv = fs.active || fs.landscape;
  const shown: ScheduleTemplate = tv ? (castPick ?? 'week') : schedule.template;
  const showWeek = shown === 'week';

  const exitBoard = () => {
    void fs.exit().finally(() => {
      navigate('/slideshow?folder=gallery');
    });
  };

  return (
    <main className={`schedule${fs.className ? ` ${fs.className}` : ''}`}>
      <PlayExitMark to="/slideshow?folder=gallery" onExit={exitBoard} />
      <header className="schedule__bar">
        <div className="schedule__brand">
          <p className="schedule__eyebrow">{MEDIA_CONSOLE_NAME}</p>
          <h1>Class Schedule</h1>
        </div>
        <div className="schedule__actions">
          <div className="presets schedule__views" role="radiogroup" aria-label="Display template">
            {SCHEDULE_TEMPLATES.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={shown === id}
                aria-label={SCHEDULE_TEMPLATE_LABELS[id]}
                className={`preset${shown === id ? ' preset--on' : ''}`}
                onClick={() => {
                  setScheduleTemplate(id);
                  if (tv) setCastPick(id);
                }}
              >
                {TEMPLATE_CHROME[id]}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          <FullscreenChip
            supported={fs.supported}
            active={fs.active}
            nudge={fs.showFallback}
            shortcut={fs.tvStation}
            onToggle={() => void fs.toggle()}
          />
        </div>
      </header>
      {tv ? (
        <>
          <button type="button" className="btn schedule__cast-edit" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          <div className="schedule__cast-tools">
            <FullscreenChip
              supported={fs.supported}
              active={fs.active}
              nudge={fs.showFallback}
              shortcut={fs.tvStation}
              onToggle={() => void fs.toggle()}
            />
          </div>
        </>
      ) : null}

      <section
        className={`schedule__stage schedule__stage--${shown}${emptyBoard && !showWeek ? ' schedule__stage--hint' : ''}`}
        aria-label="Gym class schedule"
      >
        {showWeek ? (
          <ScheduleWeekBoard variant="stage" />
        ) : (
          <>
        <BoardHeader
          logoUrl={logoUrl}
          qrSrc={qrSrc}
          qrHref={qrHref}
          gymName={gymName}
          stamp={stamp}
        />

        {emptyBoard ? (
          <p className="schedule__lead">
            Tap Edit to add Monday–Sunday classes. Export a CSV backup from Edit before you clear
            site data.
          </p>
        ) : null}

        {shown === 'weekly-list' ? (
          <WeeklyListBoard classes={schedule.classes} today={today} />
        ) : shown === 'week-grid' ? (
          <WeekGridBoard classes={schedule.classes} today={today} />
        ) : (
          <MonthlyBoard
            stamp={stamp}
            classes={schedule.classes}
            specials={schedule.specials}
            today={today}
          />
        )}

        <aside className={`schedule__notes${notices.length ? ' is-filled' : ''}`} aria-label="Notices">
          <p className="schedule__notes-label">Notices</p>
          {notices.length ? (
            notices.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)
          ) : (
            <p>Holiday closings, schedule changes, and special events go here.</p>
          )}
        </aside>
          </>
        )}
      </section>

      <ScheduleEditor
        open={editOpen}
        onClose={() => setEditOpen(false)}
        logoUrl={logoUrl}
        qrImageUrl={qrImageUrl}
        qrBuilt={qrBuilt}
        qrNote={qrNote}
      />
    </main>
  );
}

function BoardHeader({
  logoUrl,
  qrSrc,
  qrHref,
  gymName,
  stamp,
}: {
  logoUrl: string;
  qrSrc: string;
  qrHref: string;
  gymName: string;
  stamp: string;
}) {
  return (
    <div className="schedule__pins">
      <div className={`schedule__logo${logoUrl ? ' is-filled' : ''}`}>
        {logoUrl ? <img src={logoUrl} alt="" /> : <span>Gym logo</span>}
      </div>
      <div className="schedule__heading">
        <h2>{gymName || 'Class Schedule'}</h2>
        <p className="schedule__kicker">
          {stamp} • {gymName ? 'CLASS SCHEDULE' : 'SET YOUR WEEK'}
        </p>
      </div>
      <div className={`schedule__qr${qrSrc ? ' is-filled' : ''}`}>
        {qrSrc ? (
          <img src={qrSrc} alt={qrHref ? `QR code for ${qrHref}` : 'QR code'} />
        ) : (
          <span>QR code</span>
        )}
      </div>
    </div>
  );
}

function ClassCopy({ item }: { item: WeeklyClassSlot }) {
  const subtitle = item.subtitle.trim();
  const title = item.title.trim() || 'Class';
  return (
    <span className="schedule__class">
      <strong>{title}</strong>
      {subtitle ? <em>{subtitle}</em> : null}
    </span>
  );
}

function ClassRow({ item, showMat }: { item: WeeklyClassSlot; showMat: boolean }) {
  const location = item.location.trim();
  return (
    <li>
      {showMat ? (
        location ? (
          <span className="schedule__mat">{location}</span>
        ) : (
          <span className="schedule__mat schedule__mat--empty">Mat</span>
        )
      ) : null}
      <ClassCopy item={item} />
    </li>
  );
}

function TimeBlocks({
  classes,
  emptyLabel = 'No classes',
}: {
  classes: readonly WeeklyClassSlot[];
  emptyLabel?: string;
}) {
  if (!classes.length) return <p className="schedule__empty-day">{emptyLabel}</p>;
  return (
    <>
      {groupClassesByTime(classes).map((group) => {
        const parallel = group.items.length > 1;
        const showMat = parallel || group.items.some((item) => item.location.trim());
        return (
          <div
            className={`schedule__time-block${parallel ? ' schedule__time-block--parallel' : ''}`}
            key={`${group.items[0]?.id}-${group.time}`}
          >
            <time dateTime={group.time || undefined}>{formatClassTime(group.time)}</time>
            <ul className={showMat ? 'schedule__time-rows schedule__time-rows--mats' : 'schedule__time-rows'}>
              {group.items.map((item) => (
                <ClassRow key={item.id} item={item} showMat={showMat} />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function WeeklyListBoard({
  classes,
  today,
}: {
  classes: readonly WeeklyClassSlot[];
  today: Weekday;
}) {
  return (
    <div className="schedule__list">
      {boardWeekdays(classes).map((day) => {
        const rows = classesOnDay(classes, day);
        return (
          <section
            key={day}
            className={`schedule__list-day${day === today ? ' is-today' : ''}`}
            aria-current={day === today ? 'date' : undefined}
          >
            <h3>{WEEKDAY_LABELS[day]}</h3>
            <TimeBlocks classes={rows} />
          </section>
        );
      })}
    </div>
  );
}

function WeekGridBoard({
  classes,
  today,
}: {
  classes: readonly WeeklyClassSlot[];
  today: Weekday;
}) {
  return (
    <div className="schedule__week" role="list">
      {WEEKDAYS.map((day) => {
        const rows = classesOnDay(classes, day);
        return (
          <article
            key={day}
            className={`schedule__day${day === today ? ' is-today' : ''}`}
            role="listitem"
            aria-current={day === today ? 'date' : undefined}
          >
            <h3>
              <span className="schedule__day-full">{WEEKDAY_LABELS[day]}</span>
              <span className="schedule__day-short">{WEEKDAY_SHORT[day]}</span>
            </h3>
            <TimeBlocks classes={rows} emptyLabel="—" />
          </article>
        );
      })}
    </div>
  );
}

function MonthlyBoard({
  stamp,
  classes,
  specials,
  today,
}: {
  stamp: string;
  classes: readonly WeeklyClassSlot[];
  specials: readonly SpecialDate[];
  today: Weekday;
}) {
  const days = boardWeekdays(classes);
  return (
    <div className="schedule__month">
      <p className="schedule__month-lead">
        <strong>{stamp}</strong> — special dates first. Regular classes stay on List and Grid.
      </p>
      {specials.length ? (
        <ul className="schedule__month-specials">
          {specials.map((item) => (
            <li key={item.id}>
              <strong>{formatSpecialDate(item.date) || 'Anytime'}</strong>
              <span>
                {item.title.trim() || item.body.trim() || 'Special date'}
                {item.body.trim() && item.title.trim() ? ` — ${item.body.trim()}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="schedule__month-empty">No special dates yet. Add one in Edit.</p>
      )}
      {classes.length ? (
        <div className="schedule__month-week">
          <h3>Regular week</h3>
          <ol>
            {days.map((day) => {
              const rows = classesOnDay(classes, day);
              if (!rows.length) return null;
              return (
                <li key={day} className={day === today ? 'is-today' : undefined}>
                  <strong>{WEEKDAY_SHORT[day]}</strong>
                  <span>
                    {groupClassesByTime(rows)
                      .map((group) => formatTimeGroupLine(group))
                      .join(' · ')}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleBackup({
  csvNote,
  pending,
  onTemplate,
  onExport,
  onPick,
  onConfirm,
  onCancel,
}: {
  csvNote: string;
  pending: ScheduleCsvImport | null;
  onTemplate: () => void;
  onExport: () => void;
  onPick: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <fieldset className="schedule-edit__backup">
      <legend>Backup</legend>
      <p className="schedule-edit__hint">
        Download a CSV before you clear site data or reset this phone. Import replaces the schedule
        on this device after you confirm. It does not merge. A class-only file replaces classes and
        leaves the gym name, QR, and notices in place.
      </p>
      <div className="schedule-edit__backup-actions">
        <button type="button" className="btn btn--ghost" onClick={onTemplate}>
          Download template
        </button>
        <button type="button" className="btn btn--ghost" onClick={onPick}>
          Import CSV
        </button>
        <button type="button" className="btn btn--ghost" onClick={onExport}>
          Export CSV
        </button>
      </div>
      {pending ? (
        <div className="schedule-edit__confirm">
          <p>
            {pending.mode === 'replace-board'
              ? `Replace the schedule on this device with ${pending.classCount} ${
                  pending.classCount === 1 ? 'class' : 'classes'
                } and ${pending.specialCount} special ${
                  pending.specialCount === 1 ? 'date' : 'dates'
                } from this file?`
              : `Replace the weekly classes on this device with ${pending.classCount} ${
                  pending.classCount === 1 ? 'class' : 'classes'
                }? Gym name, QR link, and notices stay as they are.`}
          </p>
          <button type="button" className="btn" onClick={onConfirm}>
            Replace schedule
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : null}
      {csvNote ? (
        <p className="schedule-edit__hint schedule-edit__summary" role="status">
          {csvNote}
        </p>
      ) : null}
    </fieldset>
  );
}

function ScheduleEditor({
  open,
  onClose,
  logoUrl,
  qrImageUrl,
  qrBuilt,
  qrNote,
}: {
  open: boolean;
  onClose: () => void;
  logoUrl: string;
  qrImageUrl: string;
  qrBuilt: string;
  qrNote: string;
}) {
  const schedule = useScheduleState();
  const logoRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLInputElement>(null);
  const [day, setDay] = useState<Weekday>('mon');
  const [time, setTime] = useState('17:00');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState<string>(DEFAULT_MATS[0]);
  const [subtitle, setSubtitle] = useState('');
  const [pickerNote, setPickerNote] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvNote, setCsvNote] = useState('');
  const [pendingImport, setPendingImport] = useState<ScheduleCsvImport | null>(null);

  const usedMatsAtTime = classesOnDay(schedule.classes, day)
    .filter((row) => row.time === time)
    .map((row) => row.location);

  const addRow = () => {
    if (!title.trim()) {
      titleRef.current?.focus();
      return;
    }
    const added = addClass(day, time, title, location, subtitle);
    if (added) {
      setTitle('');
      setSubtitle('');
      setLocation(suggestNextMat([...usedMatsAtTime, location]));
      titleRef.current?.focus();
    }
  };

  const addAnotherMat = (group: ClassTimeGroup) => {
    const source = group.items[0];
    if (!source) return;
    const added = addParallelClass(source.id);
    if (!added) return;
    setDay(source.day);
    setTime(source.time);
    setLocation(added.location);
    setTitle('');
    setSubtitle('');
  };

  const onLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const blob = await readPickedImage(file);
      await setLogoBlob(blob);
      setPickerNote('');
    } catch {
      setPickerNote('That file is not a picture this board can keep.');
    }
  };

  const onQrImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const blob = await readPickedImage(file, 900);
      await setQrImageBlob(blob);
      setPickerNote('');
    } catch {
      setPickerNote('That file is not a picture this board can keep.');
    }
  };

  return (
    <Sheet open={open} title="Edit class schedule" onClose={onClose}>
      <p className="schedule-edit__copy">
        Fat-thumb fields for the gym TV board. Logo, QR, classes, and notices stay on this phone or
        computer — nothing is uploaded. Save a CSV backup before you clear site data or reset the
        app.
      </p>
      {pickerNote ? <p className="schedule-edit__error">{pickerNote}</p> : null}

      <ScheduleBackup
        csvNote={csvNote}
        pending={pendingImport}
        onTemplate={() => downloadScheduleCsv(scheduleCsvFileName('template'), scheduleCsvTemplate())}
        onExport={() => downloadScheduleCsv(scheduleCsvFileName('backup'), serializeScheduleCsv(schedule))}
        onPick={() => csvRef.current?.click()}
        onConfirm={() => {
          if (!pendingImport?.payload) return;
          applyScheduleImport(pendingImport.payload);
          setCsvNote(formatScheduleCsvSummary(pendingImport));
          setPendingImport(null);
        }}
        onCancel={() => setPendingImport(null)}
      />

      <fieldset>
        <legend>Display template</legend>
        <p className="schedule-edit__hint">
          Saved on this device for phone preview. Landscape, fullscreen, and the gym-TV cast use the
          week board.
        </p>
        <div className="presets schedule-edit__templates" role="radiogroup" aria-label="Display template">
          {SCHEDULE_TEMPLATES.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={schedule.template === id}
              className={`preset${schedule.template === id ? ' preset--on' : ''}`}
              onClick={() => setScheduleTemplate(id)}
            >
              {SCHEDULE_TEMPLATE_LABELS[id]}
            </button>
          ))}
        </div>
        <p className="schedule-edit__hint">{SCHEDULE_TEMPLATE_HINTS[schedule.template]}</p>
      </fieldset>

      <label>
        Gym name
        <input
          value={schedule.title}
          onChange={(event) => setBoardTitle(event.target.value)}
          placeholder="Shows on the board header"
          aria-label="Gym name"
        />
      </label>

      <fieldset>
        <legend>Logo</legend>
        <p className="schedule-edit__hint">
          The board uses the Media Console custom gym logo when one is saved. Otherwise it uses the
          picture you pick here, then the Advantage mark.
        </p>
        <div className="schedule-edit__preview-row">
          <div className={`schedule-edit__thumb${logoUrl ? ' is-filled' : ''}`}>
            {logoUrl ? <img src={logoUrl} alt="" /> : <span>No logo</span>}
          </div>
          <div className="schedule-edit__preview-actions">
            <button type="button" className="btn" onClick={() => logoRef.current?.click()}>
              Choose logo
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!logoUrl}
              onClick={() => void setLogoBlob(null)}
            >
              Remove logo
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>QR code</legend>
        <p className="schedule-edit__hint">
          Right side of the board. Paste a web address and we make the QR here, or upload a picture.
        </p>
        <label>
          Web address
          <input
            value={schedule.qrUrl}
            onChange={(event) => setQrUrl(event.target.value)}
            placeholder="gym.example.com or https://…"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="QR web address"
          />
        </label>
        {qrNote ? <p className="schedule-edit__error">{qrNote}</p> : null}
        <div className="schedule-edit__preview-row">
          <div className={`schedule-edit__thumb schedule-edit__thumb--qr${qrBuilt || qrImageUrl ? ' is-filled' : ''}`}>
            {qrBuilt || qrImageUrl ? (
              <img src={qrBuilt || qrImageUrl} alt="" />
            ) : (
              <span>No QR</span>
            )}
          </div>
          <div className="schedule-edit__preview-actions">
            <button type="button" className="btn" onClick={() => qrRef.current?.click()}>
              Upload QR picture
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!qrImageUrl}
              onClick={() => void setQrImageBlob(null)}
            >
              Remove picture
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Weekly classes</legend>
        <p className="schedule-edit__hint">
          Same time, two mats: add the first class, then tap <strong>Another mat</strong> — or keep
          the time and switch MAT 1 / MAT 2.
        </p>
        <button type="button" className="btn btn--ghost schedule-edit__sample" onClick={() => loadSampleWeek()}>
          Load sample week
        </button>
        <div className="presets schedule-edit__days" role="radiogroup" aria-label="Class day">
          {WEEKDAYS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={day === id}
              className={`preset${day === id ? ' preset--on' : ''}`}
              onClick={() => setDay(id)}
            >
              {WEEKDAY_SHORT[id]}
            </button>
          ))}
        </div>
        <div className="schedule-edit__add">
          <label>
            Time
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              aria-label="Class time"
            />
          </label>
          <div className="schedule-edit__mat-field">
            <span id="schedule-mat-label">Mat</span>
            <div className="presets schedule-edit__mats" role="radiogroup" aria-labelledby="schedule-mat-label">
              {DEFAULT_MATS.map((mat) => (
                <button
                  key={mat}
                  type="button"
                  role="radio"
                  aria-checked={location === mat}
                  className={`preset${location === mat ? ' preset--on' : ''}`}
                  onClick={() => setLocation(mat)}
                >
                  {mat}
                </button>
              ))}
            </div>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="MAT 1"
              aria-label="Mat or location"
            />
          </div>
          <label className="schedule-edit__title">
            Class name
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Tiny Champions, Fundamentals…"
              aria-label="Class name"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addRow();
                }
              }}
            />
          </label>
          <label className="schedule-edit__title">
            Detail
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Blue belt & up (optional)"
              aria-label="Class detail"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addRow();
                }
              }}
            />
          </label>
          <button type="button" className="btn" onClick={addRow}>
            Add class
          </button>
        </div>
        <div className="schedule-edit__list">
          {WEEKDAYS.map((id) => {
            const rows = classesOnDay(schedule.classes, id);
            if (!rows.length) return null;
            return (
              <section key={id} className="schedule-edit__group">
                <h3>{WEEKDAY_LABELS[id]}</h3>
                {groupClassesByTime(rows).map((group) => (
                  <div key={`${id}-${group.time}`} className="schedule-edit__slot">
                    <div className="schedule-edit__slot-head">
                      <p className="schedule-edit__slot-time">{formatClassTime(group.time)}</p>
                      <button
                        type="button"
                        className="btn btn--ghost schedule-edit__another-mat"
                        onClick={() => addAnotherMat(group)}
                      >
                        Another mat
                      </button>
                    </div>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item.id} className="schedule-edit__class">
                          <label>
                            Time
                            <input
                              type="time"
                              value={item.time}
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                updateClass(item.id, { time: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Mat
                            <input
                              value={item.location}
                              onChange={(event) => updateClass(item.id, { location: event.target.value })}
                              placeholder="MAT 1"
                            />
                          </label>
                          <label className="schedule-edit__title">
                            Class name
                            <input
                              value={item.title}
                              onChange={(event) => updateClass(item.id, { title: event.target.value })}
                              placeholder="Class name"
                            />
                          </label>
                          <label className="schedule-edit__title">
                            Detail
                            <input
                              value={item.subtitle}
                              onChange={(event) => updateClass(item.id, { subtitle: event.target.value })}
                              placeholder="Blue belt & up"
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => removeClass(item.id)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
          {schedule.classes.length === 0 ? (
            <p className="schedule-edit__hint">No classes yet. Add one above, or load the sample week.</p>
          ) : null}
        </div>
      </fieldset>

      <label>
        Notices
        <textarea
          value={schedule.notes}
          onChange={(event) => setScheduleNotes(event.target.value)}
          placeholder="Closed Monday for the holiday. Kids class moves to 5:00 PM Friday."
          rows={4}
          aria-label="Notices"
        />
      </label>

      <SpecialDatesEditor />

      <fieldset>
        <legend>Gym TV cast</legend>
        <p className="schedule-edit__hint">
          On plays this week board in Media Console after Gallery, when at least one class is saved.
        </p>
        <div className="presets presets--split" role="radiogroup" aria-label="Class Schedule on the TV">
          <button
            type="button"
            role="radio"
            aria-checked={schedule.castEnabled}
            className={`preset${schedule.castEnabled ? ' preset--on' : ''}`}
            onClick={() => setScheduleCastEnabled(true)}
          >
            On the TV
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!schedule.castEnabled}
            className={`preset${!schedule.castEnabled ? ' preset--on' : ''}`}
            onClick={() => setScheduleCastEnabled(false)}
          >
            Off the TV
          </button>
        </div>
      </fieldset>

      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>

      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        aria-label="Import class schedule CSV"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (isSpreadsheetWorkbook(file)) {
            setPendingImport(null);
            setCsvNote(ROSTER_CSV_WORKBOOK_ERROR);
            return;
          }
          void importScheduleCsvFile(file)
            .then((result) => {
              if (result.error || !result.payload) {
                setPendingImport(null);
                setCsvNote(result.error ?? 'Could not read that file. Save as CSV UTF-8 and try again.');
                return;
              }
              setCsvNote('');
              setPendingImport(result);
            })
            .catch(() => {
              setPendingImport(null);
              setCsvNote('Could not read that file. Save as CSV UTF-8 (comma-separated) and try again.');
            });
        }}
      />
      <input
        ref={logoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void onLogo(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={qrRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void onQrImage(event.target.files);
          event.target.value = '';
        }}
      />
    </Sheet>
  );
}

function SpecialDatesEditor() {
  const schedule = useScheduleState();
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');

  const addRow = () => {
    const added = addSpecial(date, title);
    if (added) {
      setTitle('');
    }
  };

  return (
    <fieldset>
      <legend>Special dates</legend>
      <p className="schedule-edit__hint">
        Holidays and one-off events. Same list Events flyers can use later — no flyer pictures yet.
      </p>
      <div className="schedule-edit__add schedule-edit__add--special">
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="schedule-edit__title">
          What’s on
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Closed, seminar, kids at 5…"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addRow();
              }
            }}
          />
        </label>
        <button type="button" className="btn" onClick={addRow}>
          Add date
        </button>
      </div>
      {schedule.specials.length ? (
        <ul className="schedule-edit__specials">
          {schedule.specials.map((item) => (
            <li key={item.id}>
              <label>
                <span className="sr-only">Date</span>
                <input
                  type="date"
                  value={item.date}
                  onChange={(event) => updateSpecial(item.id, { date: event.target.value })}
                />
              </label>
              <label className="schedule-edit__title">
                <span className="sr-only">What’s on</span>
                <input
                  value={item.title}
                  onChange={(event) => updateSpecial(item.id, { title: event.target.value })}
                  placeholder="What’s on"
                />
              </label>
              <button type="button" className="btn btn--ghost" onClick={() => removeSpecial(item.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="schedule-edit__hint">No special dates yet.</p>
      )}
    </fieldset>
  );
}
