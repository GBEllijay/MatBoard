import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useScheduleAssets, useScheduleState } from '../hooks/useStores';
import { useWakeLock } from '../hooks/useWakeLock';
import { qrDataUrl } from '../lib/qr';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  addClass,
  addSpecial,
  classesOnDay,
  formatClassTime,
  formatSpecialDate,
  noticeLines,
  normalizeQrUrl,
  readPickedImage,
  removeClass,
  removeSpecial,
  setBoardTitle,
  setLogoBlob,
  setQrImageBlob,
  setQrUrl,
  setScheduleNotes,
  todayWeekday,
  updateClass,
  updateSpecial,
  type Weekday,
} from '../lib/scheduleStore';

type BoardView = 'weekly' | 'monthly';

export function SchedulePage() {
  const schedule = useScheduleState();
  const assets = useScheduleAssets();
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [view, setView] = useState<BoardView>('weekly');
  const [logoUrl, setLogoUrl] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrBuilt, setQrBuilt] = useState('');
  const [qrNote, setQrNote] = useState('');
  const today = todayWeekday();

  useWakeLock(true);

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

  const exitBoard = () => {
    void fs.exit().finally(() => {
      navigate('/');
    });
  };

  return (
    <main className={`schedule${fs.className ? ` ${fs.className}` : ''}`}>
      <PlayExitMark onExit={exitBoard} />
      <header className="schedule__bar">
        <div className="schedule__brand">
          <p className="schedule__eyebrow">Owner’s Toolbox</p>
          <h1>Class Schedule</h1>
        </div>
        <div className="schedule__actions">
          <div className="presets presets--split schedule__views" role="radiogroup" aria-label="Schedule view">
            <button
              type="button"
              role="radio"
              aria-checked={view === 'weekly'}
              className={`preset${view === 'weekly' ? ' preset--on' : ''}`}
              onClick={() => setView('weekly')}
            >
              Weekly
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'monthly'}
              className={`preset${view === 'monthly' ? ' preset--on' : ''}`}
              onClick={() => setView('monthly')}
            >
              Monthly
            </button>
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

      <section className="schedule__stage" aria-label="Gym class schedule">
        <div className="schedule__pins">
          <div className={`schedule__logo${logoUrl ? ' is-filled' : ''}`}>
            {logoUrl ? <img src={logoUrl} alt="" /> : <span>Gym logo</span>}
          </div>
          <div className="schedule__heading">
            <p className="schedule__kicker">{schedule.title.trim() || 'This week'}</p>
            <h2>{schedule.title.trim() ? 'Class Schedule' : 'Set your week'}</h2>
            <p className="schedule__lead">
              {emptyBoard
                ? 'Tap Edit to add a logo, a QR code, and Monday–Sunday classes. Saved on this device.'
                : 'Hours and class names for the gym TV. Phone can edit — same browser, this device.'}
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

        {view === 'weekly' ? (
          <div className="schedule__week" role="list">
            {WEEKDAYS.map((day) => {
              const rows = classesOnDay(schedule.classes, day);
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
                  {rows.length ? (
                    <ol>
                      {rows.map((item) => (
                        <li key={item.id}>
                          <time dateTime={item.time || undefined}>{formatClassTime(item.time)}</time>
                          <strong>{item.title.trim() || 'Class'}</strong>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="schedule__empty-day">—</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="schedule__month">
            <p>
              A full month grid comes later. Use <strong>Weekly</strong> for regular classes. Special
              dates below can later show an Events flyer on that day.
            </p>
            {schedule.specials.length ? (
              <ul>
                {schedule.specials.map((item) => (
                  <li key={item.id}>
                    <strong>{formatSpecialDate(item.date) || 'Anytime'}</strong>
                    <span>{item.title.trim() || item.body.trim() || 'Special date'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="schedule__month-empty">No special dates yet. Add one in Edit.</p>
            )}
          </div>
        )}

        <aside className={`schedule__notes${notices.length ? ' is-filled' : ''}`} aria-label="Notices">
          <p className="schedule__notes-label">Notices</p>
          {notices.length ? (
            notices.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)
          ) : (
            <p>Holiday closings, schedule changes, and special events go here.</p>
          )}
        </aside>
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
  const [time, setTime] = useState('18:00');
  const [title, setTitle] = useState('');
  const [pickerNote, setPickerNote] = useState('');

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

  const addRow = () => {
    const added = addClass(day, time, title);
    if (added) setTitle('');
  };

  return (
    <Sheet open={open} title="Edit class schedule" onClose={onClose}>
      <p className="schedule-edit__copy">
        Fat-thumb fields for the gym TV board. Logo, QR, classes, and notices stay on this phone or
        computer — nothing is uploaded.
      </p>
      {pickerNote ? <p className="schedule-edit__error">{pickerNote}</p> : null}

      <label>
        Gym name
        <input
          value={schedule.title}
          onChange={(event) => setBoardTitle(event.target.value)}
          placeholder="Optional — shows above the week"
          aria-label="Gym name"
        />
      </label>

      <fieldset>
        <legend>Logo</legend>
        <p className="schedule-edit__hint">Pinned on the board. Pick a picture from this device.</p>
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
          Paste a web address and we make the QR here. Or upload a QR picture you already have.
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
        <p className="schedule-edit__hint">Day, time, and class name. Add as many as you need.</p>
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
          <label className="schedule-edit__title">
            Class name
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Kids, Adults, Open mat…"
              aria-label="Class name"
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
                <ul>
                  {rows.map((item) => (
                    <li key={item.id}>
                      <label>
                        <span className="sr-only">Time</span>
                        <input
                          type="time"
                          value={item.time}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateClass(item.id, { time: event.target.value })
                          }
                        />
                      </label>
                      <label className="schedule-edit__title">
                        <span className="sr-only">Class name</span>
                        <input
                          value={item.title}
                          onChange={(event) => updateClass(item.id, { title: event.target.value })}
                          placeholder="Class name"
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
              </section>
            );
          })}
          {schedule.classes.length === 0 ? (
            <p className="schedule-edit__hint">No classes yet. Add one above.</p>
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

      <button type="button" className="btn" onClick={onClose}>
        Done
      </button>

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
