import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { RANK_TAPE_MAX, type RankBelt } from '../../lib/progress/types';
import {
  addBeltPhoto,
  addTapePhoto,
  beltPhotos,
  loadRankPictures,
  rankPhotoFromFile,
  removeBeltPhoto,
  removeTapePhoto,
  tapePhotos,
  type RankPhotoStore,
} from '../../lib/rankPhotos';
import {
  ladderRungs,
  rankBeltLabel,
  rankOf,
  removeRankHistory,
  setRankAwardedOn,
  setRankBelt,
  setRankHistoryAwardedOn,
  setRankHistoryTapeDate,
  setRankLineage,
  setRankTapeCount,
  setRankTapeDate,
  stripeCountControl,
  type LadderRung,
} from '../../lib/studentRank';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';
import { StudentProfileFields } from './ProfileFields';

const TAPE_SLOTS = [1, 2, 3, 4] as const;

export function RankPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [error, setError] = useState('');
  const [dropId, setDropId] = useState('');
  const [photos, setPhotos] = useState<RankPhotoStore>(() => loadRankPictures());
  const rank = rankOf(report);
  const rungs = ladderRungs(report);

  const run = (next: ReturnType<typeof setRankBelt>) => {
    try {
      commit(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    }
  };

  const savePhoto = async (file: File | undefined, save: (image: string) => RankPhotoStore) => {
    if (!file) return;
    try {
      const image = await rankPhotoFromFile(file);
      setPhotos(save(image));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that photo.');
    }
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="My rank" />
      <div className="student-paper">
        <div className="student-sheet">
          <section aria-label="Profile">
            <h2>Profile</h2>
            <p className="student-quiet">
              Your name, gym, and start date print on the progress report and the self-assessment. They stay on this phone.
            </p>
            <StudentProfileFields report={report} commit={commit} />
          </section>
          <p className="student-quiet">
            White at the top, then blue, purple, brown, and black. Belt progress reads the belt you wear and shows the checkpoints ahead.
          </p>
          <ol className="rank-ladder" aria-label="Belt ladder">
            {rungs.map((rung) => (
              <li key={rung.belt} className={`rank-rung rank-rung--${rung.belt}`}>
                <div className="rank-line">
                  <input
                    type="date"
                    aria-label={rung.current ? 'Date of this belt' : `Date of ${rung.label} belt`}
                    value={rung.awardedOn}
                    disabled={!rung.current && !rung.historyId}
                    onChange={(event) => {
                      if (rung.current) run(setRankAwardedOn(report, event.target.value));
                      else if (rung.historyId) run(setRankHistoryAwardedOn(report, rung.historyId, event.target.value));
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={rung.current ? 'rank-bar is-on' : 'rank-bar'}
                  aria-pressed={rung.current}
                  onClick={() => {
                    setDropId('');
                    run(setRankBelt(report, rung.belt));
                  }}
                >
                  {rung.label}
                </button>
                <div className="rank-slots" role="group" aria-label={rung.current ? 'Stripes' : `${rung.label} stripes`}>
                  {TAPE_SLOTS.map((slot) => (
                    <StripeSlot
                      key={slot}
                      rung={rung}
                      slot={slot}
                      photos={tapePhotos(photos, rung.belt, slot - 1)}
                      error={error}
                      onTap={() => {
                        if (!rung.current) return;
                        run(setRankTapeCount(report, slot === rung.tapeCount ? slot - 1 : slot));
                      }}
                      onDate={(value) => {
                        if (rung.current) run(setRankTapeDate(report, slot - 1, value));
                        else if (rung.historyId) run(setRankHistoryTapeDate(report, rung.historyId, slot - 1, value));
                      }}
                      onPhoto={(file) => void savePhoto(file, (image) => addTapePhoto(photos, rung.belt, slot - 1, image))}
                      onRemovePhoto={(index) => setPhotos(removeTapePhoto(photos, rung.belt, slot - 1, index))}
                    />
                  ))}
                </div>
                <BeltPhotos
                  belt={rung.belt}
                  label={rung.label}
                  photos={beltPhotos(photos, rung.belt)}
                  onPhoto={(file) => void savePhoto(file, (image) => addBeltPhoto(photos, rung.belt, image))}
                  onRemove={(index) => setPhotos(removeBeltPhoto(photos, rung.belt, index))}
                />
              </li>
            ))}
          </ol>
          <p className="student-quiet">
            {rank.tapeCount === 0 ? 'No stripes' : rank.tapeCount === 1 ? '1 stripe' : `${rank.tapeCount} stripes`} of {RANK_TAPE_MAX} on the belt you wear. Tap a stripe to open it. Add a photo, a date, or both, and remove either one. Tap an empty stripe to add it. Take the last stripe off from that stripe. The date on the line is the day that belt was achieved.
          </p>
          <p className="student-quiet">
            Photos stay on this phone. Send to coach includes them when the file has room.
          </p>
          <p className="student-quiet">
            A Promotion test on the calendar is a reminder you add by hand. It does not fill a belt date. The calendar reads the dates you save here.
          </p>
          <LineageEditor lineage={rank.lineage ?? []} onSave={(lines) => run(setRankLineage(report, lines))} />
          <section className="ink" aria-label="Promotion history">
            <h2>Promotion history</h2>
            {rank.history.length === 0 ? <p>No earlier belts yet. A belt moves here when you change it and it already has a date or a stripe.</p> : null}
            <ul className="comp-list">
              {rank.history.map((row) => {
                const label = rankBeltLabel(row.belt);
                const when = row.awardedOn ? ` · ${row.awardedOn}` : '';
                const stripes = row.tapeCount === 1 ? '1 stripe' : `${row.tapeCount} stripes`;
                return (
                  <li key={row.id}>
                    <strong>
                      {label}
                      {when}
                    </strong>
                    <span>{stripes}</span>
                    {dropId === row.id ? (
                      <div className="student-actions">
                        <button
                          type="button"
                          className="ink-btn"
                          aria-label={`Confirm remove ${label} history`}
                          onClick={() => {
                            run(removeRankHistory(report, row.id));
                            setDropId('');
                          }}
                        >
                          Confirm remove
                        </button>
                        <button type="button" className="ink-btn" onClick={() => setDropId('')}>
                          Keep history
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="ink-btn ink-btn--small"
                        aria-label={`Remove ${label} history`}
                        onClick={() => setDropId(row.id)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <Link className="ink-btn" to={to('/student/rubric')}>
            Belt progress
          </Link>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}

function StripeSlot({
  rung,
  slot,
  photos,
  error,
  onTap,
  onDate,
  onPhoto,
  onRemovePhoto,
}: {
  rung: LadderRung;
  slot: number;
  photos: string[];
  error: string;
  onTap: () => void;
  onDate: (value: string) => void;
  onPhoto: (file: File | undefined) => void;
  onRemovePhoto: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const on = slot <= rung.tapeCount;
  const date = rung.tapeDates[slot - 1] ?? '';
  const stripeLabel = rung.current ? `Stripe ${slot}` : `${rung.label} stripe ${slot}`;
  const dateLabel = rung.current ? `Stripe ${slot} date` : `${rung.label} stripe ${slot} date`;
  const countControl = stripeCountControl(slot, rung.tapeCount, stripeLabel);
  return (
    <div className="rank-slot">
      <button
        type="button"
        className={on ? 'rank-tape is-on' : 'rank-tape'}
        aria-pressed={on}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={stripeLabel}
        disabled={!rung.current && !on}
        onClick={() => {
          if (rung.current && countControl.action === 'add') onTap();
          setOpen(true);
        }}
      />
      {on && date ? <span className="rank-stripe-date">{date}</span> : null}
      {on && !open && photos[0] ? (
        <img className="rank-stripe-thumb" src={photos[0]} alt={`${rung.label} stripe ${slot} photo 1`} />
      ) : null}
      {open ? (
        <StripeEditor
          stripeLabel={stripeLabel}
          dateLabel={dateLabel}
          rung={rung}
          slot={slot}
          date={date}
          photos={photos}
          error={error}
          countName={rung.current ? countControl.name : ''}
          onTap={onTap}
          onDate={onDate}
          onPhoto={onPhoto}
          onRemovePhoto={onRemovePhoto}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function StripeEditor({
  stripeLabel,
  dateLabel,
  rung,
  slot,
  date,
  photos,
  error,
  countName,
  onTap,
  onDate,
  onPhoto,
  onRemovePhoto,
  onClose,
}: {
  stripeLabel: string;
  dateLabel: string;
  rung: LadderRung;
  slot: number;
  date: string;
  photos: string[];
  error: string;
  countName: string;
  onTap: () => void;
  onDate: (value: string) => void;
  onPhoto: (file: File | undefined) => void;
  onRemovePhoto: (index: number) => void;
  onClose: () => void;
}) {
  const on = slot <= rung.tapeCount;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const photoCount = photos.length === 0 ? 'No photo.' : photos.length === 1 ? '1 photo.' : `${photos.length} photos.`;
  const editor = (
    <div className="student rank-stripe-editor" role="dialog" aria-modal="true" aria-label={`${stripeLabel} details`}>
      <button type="button" className="rank-stripe-editor__backdrop" aria-label="Close stripe" onClick={onClose} />
      <div className="rank-stripe-editor__panel">
        <h2>{stripeLabel}</h2>
        {on ? (
          <p className="rank-stripe-detail">
            {date ? `Date ${date}` : 'No date'}. {photoCount}
          </p>
        ) : (
          <p className="rank-stripe-detail">This stripe is not on the belt yet. Add it to keep a photo or a date.</p>
        )}
        {countName ? (
          <button type="button" className="ink-btn" onClick={onTap}>
            {countName}
          </button>
        ) : null}
        {on ? (
          <label>
            <span className="ink__label">Date</span>
            <input type="date" aria-label={dateLabel} value={date} onChange={(event) => onDate(event.target.value)} />
          </label>
        ) : null}
        {on && date ? (
          <button type="button" className="ink-btn ink-btn--small" onClick={() => onDate('')}>
            Remove date
          </button>
        ) : null}
        {on ? (
          <PhotoRow
            photos={photos}
            addLabel={`Add ${rung.label} stripe ${slot} photo`}
            removeLabel={(index) => `Remove ${rung.label} stripe ${slot} photo ${index + 1}`}
            alt={(index) => `${rung.label} stripe ${slot} photo ${index + 1}`}
            onPhoto={onPhoto}
            onRemove={onRemovePhoto}
          />
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="student-actions">
          <button type="button" className="ink-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(editor, document.body);
}

function BeltPhotos({
  belt,
  label,
  photos,
  onPhoto,
  onRemove,
}: {
  belt: RankBelt;
  label: string;
  photos: string[];
  onPhoto: (file: File | undefined) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <PhotoRow
      photos={photos}
      addLabel={`Add ${label} photo`}
      removeLabel={(index) => `Remove ${label} photo ${index + 1}`}
      alt={(index) => `${label} photo ${index + 1}`}
      onPhoto={onPhoto}
      onRemove={onRemove}
      belt={belt}
    />
  );
}

function PhotoRow({
  photos,
  addLabel,
  removeLabel,
  alt,
  onPhoto,
  onRemove,
  belt,
}: {
  photos: string[];
  addLabel: string;
  removeLabel: (index: number) => string;
  alt: (index: number) => string;
  onPhoto: (file: File | undefined) => void;
  onRemove: (index: number) => void;
  belt?: RankBelt;
}) {
  return (
    <div className="rank-photos">
      {photos.map((image, index) => (
        <figure key={`${image.slice(-24)}-${index}`}>
          <img src={image} alt={alt(index)} />
          <button type="button" className="ink-btn ink-btn--small" aria-label={removeLabel(index)} onClick={() => onRemove(index)}>
            Remove
          </button>
        </figure>
      ))}
      <label className="ink-btn ink-btn--small">
        Photo
        <input
          className="student-file"
          type="file"
          accept="image/*"
          aria-label={addLabel}
          data-belt={belt}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            onPhoto(file);
          }}
        />
      </label>
    </div>
  );
}

function LineageEditor({ lineage, onSave }: { lineage: string[]; onSave: (lines: string[]) => void }) {
  const lineageKey = lineage.join('\n');
  const [text, setText] = useState(lineageKey);
  const [rows, setRows] = useState(lineage);
  useEffect(() => {
    setText(lineageKey);
    setRows(lineageKey ? lineageKey.split('\n') : []);
  }, [lineageKey]);

  const commitText = (value: string) => {
    onSave(value.split('\n'));
  };

  return (
    <section className="ink">
      <h2>Lineage</h2>
      <label>
        <span className="ink__label">Lineage</span>
        <textarea
          aria-label="Lineage"
          placeholder="Your instructor, their instructor, and so on"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commitText(event.target.value)}
        />
      </label>
      <ol className="rank-lineage">
        {rows.map((name, index) => (
          <li key={`instructor-${index}`}>
            <label>
              <span className="ink__label">Instructor {index + 1}</span>
              <input
                aria-label={`Instructor ${index + 1}`}
                value={name}
                onChange={(event) => {
                  const next = rows.map((line, slot) => (slot === index ? event.target.value : line));
                  setRows(next);
                  setText(next.join('\n'));
                }}
                onBlur={(event) => {
                  const next = rows.map((line, slot) => (slot === index ? event.target.value : line));
                  onSave(next);
                }}
              />
            </label>
            <div className="student-actions">
              {index > 0 ? (
                <button
                  type="button"
                  className="ink-btn ink-btn--small"
                  aria-label={`Move instructor ${index + 1} up`}
                  onClick={() => {
                    const next = [...rows];
                    const prior = next[index - 1] ?? '';
                    next[index - 1] = next[index] ?? '';
                    next[index] = prior;
                    setRows(next);
                    setText(next.join('\n'));
                    onSave(next);
                  }}
                >
                  Up
                </button>
              ) : null}
              <button
                type="button"
                className="ink-btn ink-btn--small"
                aria-label={`Remove instructor ${index + 1}`}
                onClick={() => {
                  const next = rows.filter((_, slot) => slot !== index);
                  setRows(next);
                  setText(next.join('\n'));
                  onSave(next);
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="ink-btn"
        onClick={() => {
          const next = [...rows, ''];
          setRows(next);
          setText(next.join('\n'));
        }}
      >
        Add instructor
      </button>
    </section>
  );
}
