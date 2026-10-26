import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  BLACK_DEGREE_TABLE,
  coralRanksUnlocked,
  DEGREE_TILE_CAPTION,
  INSTRUCTOR_BARS_LABEL,
} from '../../lib/blackBeltDegrees';
import type { FinalRankBelt } from '../../lib/progress/types';
import {
  addBeltPhoto,
  addKidsBeltPhoto,
  addTapePhoto,
  beltPhotos,
  kidsBeltPhotos,
  loadRankPictures,
  rankPhotoFromFile,
  removeBeltPhoto,
  removeKidsBeltPhoto,
  removeTapePhoto,
  tapePhotos,
  type RankPhotoStore,
} from '../../lib/rankPhotos';
import {
  addClassDot,
  adultStartChoices,
  ageWarning,
  beltModeOf,
  classesPerTapeOf,
  currentKidsBelt,
  earlierKidRows,
  guideOf,
  kidsLadder,
  kidsRankOf,
  literalSlots,
  literalTapeCountAfterTap,
  removeClassDot,
  removeKidsHistory,
  setBeltMode,
  setBirthYear,
  setClassesPerTape,
  setKidsAwardedOn,
  setKidsBelt,
  setKidsHistoryAwardedOn,
  setKidsTapeCount,
  setLastTapeColor,
  setTapeGuide,
  showAdultPrompt,
  timeGuideText,
} from '../../lib/beltBook';
import { CLASSES_PER_TAPE_MAX, type StudentProgressReport } from '../../lib/progress/types';
import {
  ladderRungs,
  maxStripes,
  rankBeltLabel,
  rankOf,
  expandLineage,
  removeRankHistory,
  setInstructorBars,
  setInstructorBarsOn,
  setRankAwardedOn,
  setRankBelt,
  setRankHistoryAwardedOn,
  setRankHistoryTapeDate,
  setRankLineage,
  setRankTapeCount,
  setRankTapeDate,
  slotDate,
  stripeCountControl,
  graduateToAdult,
  type LadderRung,
} from '../../lib/studentRank';
import { CarlosCheer } from '../../components/CarlosCheer';
import { StudentMarks, useScrollToHash, useStudentFile, useStudentPath } from './chrome';
import { kidsClothStyle } from './wornBelt';
import { StudentProfileFields } from './ProfileFields';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CAMERA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);

function formatAchieved(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const name = MONTHS[month - 1];
  if (!name || !day || !year) return '';
  return `${name} ${day}, ${year}`;
}

const FINAL_ROWS: { belt: FinalRankBelt; appearance: 'red-black' | 'red-white' | 'red'; title: string; detail: string; after: string }[] = [
  { belt: 'coral', appearance: 'red-black', title: 'Coral 7th degree', detail: 'Red-and-black belt', after: '7 years after 6th' },
  { belt: 'redWhite', appearance: 'red-white', title: 'Coral 8th degree', detail: 'Red-and-white belt', after: '7 years after 7th' },
  { belt: 'red', appearance: 'red', title: 'Red 9th degree', detail: 'Solid red belt', after: '10 years after 8th' },
];

export function RankPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [error, setError] = useState('');
  const [dropId, setDropId] = useState('');
  const [photos, setPhotos] = useState<RankPhotoStore>(() => loadRankPictures());
  const rank = rankOf(report);
  const rungs = ladderRungs(report);
  const unlocked = coralRanksUnlocked(report.profile.belt);
  const mode = beltModeOf(report);
  const [pendingMode, setPendingMode] = useState<'' | 'adult' | 'kids'>('');
  const [coachCheer, setCoachCheer] = useState(false);
  useScrollToHash(mode === 'kids' ? `kids:${currentKidsBelt(report).beltId}` : report.profile.belt);

  const run = (next: ReturnType<typeof setRankBelt>) => {
    try {
      commit(next);
      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      return false;
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
    <main className="student student-frame student--arena student--rank">
      <StudentMarks />
      {coachCheer ? (
        <CarlosCheer lines={['Congratulations, Coach!', 'The blue belt is yours.']} onDismiss={() => setCoachCheer(false)} />
      ) : null}
      <div className="arena-scroll">
        <header className="arena-hero rank-hero">
          <h1>My rank</h1>
        </header>
        <div className="student-sheet rank-stack">
          <section aria-label="Profile">
            <h2>Profile</h2>
            <p className="student-quiet">
              Your name, gym, and start date print on the progress report and the self-assessment. The start date can stay blank. They stay on this phone.
            </p>
            <StudentProfileFields report={report} commit={commit} />
          </section>
          <BeltSystemSwitch
            mode={mode}
            pending={pendingMode}
            onAsk={(next) => setPendingMode(next === mode ? '' : next)}
            onStay={() => setPendingMode('')}
            onConfirm={() => {
              const next = pendingMode;
              setPendingMode('');
              if (next === 'adult' || next === 'kids') run(setBeltMode(report, next));
            }}
          />
          {mode === 'kids' ? (
            <KidsRank
              report={report}
              run={run}
              photos={photos}
              onBeltPhoto={(beltId, file) => void savePhoto(file, (image) => addKidsBeltPhoto(photos, beltId, image))}
              onRemoveBeltPhoto={(beltId, index) => setPhotos(removeKidsBeltPhoto(photos, beltId, index))}
              onGraduate={(choice) => {
                setPendingMode('');
                if (!run(graduateToAdult(report, choice))) return;
                if (choice === 'blue') setCoachCheer(true);
              }}
              lineage={<LineageEditor lineage={rank.lineage ?? []} onSave={(lines) => run(setRankLineage(report, lines))} />}
              progressLink={<Link className="ink-btn" to={to('/student/rubric')}>Belt progress</Link>}
            />
          ) : (
          <>
          <p className="student-quiet">
            White to brown carry up to 4 stripes. Black carries up to 6 degrees, plus optional instructor bars.
          </p>
          <ol className="rank-ladder" aria-label="Belt ladder">
            {rungs.map((rung) => {
              const pictures = beltPhotos(photos, rung.belt);
              const slots = maxStripes(rung.belt);
              return (
                <li
                  key={rung.belt}
                  id={rung.current ? 'current' : undefined}
                  className={`rank-rung rung rung--${rung.belt}${rung.current ? ' is-current' : ''}`}
                >
                  <div
                    className={rung.belt === 'black' ? 'belt belt--slim57' : 'belt'}
                    data-instructor-bars={rung.belt === 'black' && rung.instructorBars ? 'on' : 'off'}
                  >
                    <button
                      type="button"
                      className="belt__body"
                      aria-label={rung.label}
                      aria-pressed={rung.current}
                      onClick={() => {
                        setDropId('');
                        run(setRankBelt(report, rung.belt));
                      }}
                    >
                      <span className="belt__name">{rung.label}</span>
                      {rung.current ? <span className="belt__sub">Current belt</span> : null}
                    </button>
                    <div className="belt__bar" role="group" aria-label={rung.current ? 'Stripes' : `${rung.label} stripes`}>
                      {Array.from({ length: slots }, (_, index) => {
                        const slot = index + 1;
                        return (
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
                        );
                      })}
                      {rung.belt === 'black' && rung.instructorBars ? (
                        <>
                          <span className="ibar ibar--l" aria-hidden="true" />
                          <span className="ibar ibar--r" aria-hidden="true" />
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="rung__foot">
                    <label className={rung.awardedOn ? 'achieved' : 'achieved is-empty'}>
                      Achieved <b>{rung.awardedOn ? formatAchieved(rung.awardedOn) : 'Add date'}</b>
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
                    </label>
                    <label className="photo">
                      {CAMERA}
                      Photo
                      {pictures.length ? <span className="n">{pictures.length}</span> : null}
                      <input
                        className="student-file"
                        type="file"
                        accept="image/*"
                        aria-label={`Add ${rung.label} photo`}
                        data-belt={rung.belt}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          void savePhoto(file, (image) => addBeltPhoto(photos, rung.belt, image));
                        }}
                      />
                    </label>
                  </div>
                  <PhotoList
                    photos={pictures}
                    removeLabel={(index) => `Remove ${rung.label} photo ${index + 1}`}
                    alt={(index) => `${rung.label} photo ${index + 1}`}
                    onRemove={(index) => setPhotos(removeBeltPhoto(photos, rung.belt, index))}
                  />
                  {rung.belt === 'black' ? (
                    <>
                      <button
                        type="button"
                        className="ibar-switch"
                        role="switch"
                        aria-checked={rung.instructorBars}
                        aria-label={INSTRUCTOR_BARS_LABEL}
                        disabled={!rung.current && !rung.historyId}
                        onClick={() => run(setInstructorBars(report, !rung.instructorBars))}
                      >
                        <span className="ibar-switch__track" aria-hidden="true">
                          <span className="ibar-switch__knob" />
                        </span>
                        <span className="ibar-switch__copy">
                          <strong>Instructor bars</strong>
                          <small>(some schools award these at about 2 years)</small>
                        </span>
                      </button>
                      {rung.instructorBars ? (
                        <label className={rung.instructorBarsOn ? 'achieved' : 'achieved is-empty'}>
                          Awarded <b>{rung.instructorBarsOn ? formatAchieved(rung.instructorBarsOn) : 'Add date'}</b>
                          <input
                            type="date"
                            aria-label="Instructor bars date"
                            value={rung.instructorBarsOn}
                            disabled={!rung.current && !rung.historyId}
                            onChange={(event) => run(setInstructorBarsOn(report, event.target.value))}
                          />
                        </label>
                      ) : null}
                      <div className="degree-head">
                        <span>Degrees as a black belt</span>
                        <span>years since black</span>
                      </div>
                      <div className="degree-grid" role="group" aria-label="Degrees as a black belt">
                        {BLACK_DEGREE_TABLE.filter((rule) => rule.degree <= 6).map((rule) => {
                          const earned = rule.degree < rung.tapeCount;
                          const now = rung.tapeCount > 0 && rule.degree === rung.tapeCount;
                          return (
                            <button
                              key={rule.degree}
                              type="button"
                              className={`degree-tile${earned ? ' is-earned' : ''}${now ? ' is-now' : ''}`}
                              aria-label={rule.label}
                              aria-pressed={now}
                              disabled={!rung.current}
                              onClick={() => {
                                if (rung.current) run(setRankTapeCount(report, rule.degree));
                              }}
                            >
                              <strong>{rule.label}</strong>
                              <b>{rule.cumulativeYears} yrs</b>
                            </button>
                          );
                        })}
                      </div>
                      <p className="degree-caption">{DEGREE_TILE_CAPTION}</p>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {unlocked ? (
            <section className="rank-unlocked" aria-label="Unlocked after black belt">
              <p className="rank-unlocked__kicker">Unlocked after black belt</p>
              {FINAL_ROWS.map((row) => {
                const degree = row.belt === 'coral' ? 7 : row.belt === 'redWhite' ? 8 : 9;
                const rule = BLACK_DEGREE_TABLE.find((item) => item.degree === degree);
                const current = report.profile.belt === row.belt;
                const past = [...rank.history].reverse().find((item) => item.belt === row.belt);
                const awardedOn = current ? rank.awardedOn : past?.awardedOn ?? '';
                const historyId = current ? '' : past?.id ?? '';
                const years = rule ? (rule.cumulativeAtLeast ? `${rule.cumulativeYears}+` : String(rule.cumulativeYears)) : '';
                const aria = row.belt === 'coral' ? 'Coral, red and black' : row.belt === 'redWhite' ? 'Coral, red and white' : 'Red';
                return (
                  <div key={row.belt} id={current ? 'current' : undefined} className={current ? 'final-row is-current' : 'final-row'}>
                    <button
                      type="button"
                      className="final-row__hit"
                      aria-label={aria}
                      aria-pressed={current}
                      onClick={() => run(setRankBelt(report, row.belt))}
                    >
                      <span className={`mini-belt mini-belt--${row.appearance}`} aria-hidden="true" />
                      <span className="final-row__text">
                        <strong>{row.title}</strong>
                        <span>{years} years cumulative</span>
                        <span>{row.after}</span>
                        <span>{row.detail}</span>
                      </span>
                    </button>
                    <label className={awardedOn ? 'achieved' : 'achieved is-empty'}>
                      Achieved <b>{awardedOn ? formatAchieved(awardedOn) : 'Add date'}</b>
                      <input
                        type="date"
                        aria-label={current ? 'Date of this belt' : `Date of ${rankBeltLabel(row.belt)} belt`}
                        value={awardedOn}
                        disabled={!current && !historyId}
                        onChange={(event) => {
                          if (current) run(setRankAwardedOn(report, event.target.value));
                          else if (historyId) run(setRankHistoryAwardedOn(report, historyId, event.target.value));
                        }}
                      />
                    </label>
                  </div>
                );
              })}
              <p className="degree-caption">{DEGREE_TILE_CAPTION}</p>
            </section>
          ) : null}
          <p className="student-quiet">
            Photos stay on this phone. Send to coach includes them when the file has room.
          </p>
          <p className="student-quiet">
            A Promotion test on the calendar is a reminder you add by hand. It does not fill a belt date. The calendar reads the dates you save here.
          </p>
          <LineageEditor lineage={rank.lineage ?? []} onSave={(lines) => run(setRankLineage(report, lines))} />
          <EarlierBelts report={report} />
          <section className="ink" aria-label="Promotion history">
            <h2>Promotion history</h2>
            {rank.history.length === 0 ? <p>No earlier belts yet. A belt moves here when you change it and it already has a date or a stripe.</p> : null}
            <ul className="comp-list">
              {rank.history.map((row) => {
                const label = rankBeltLabel(row.belt);
                const stripes = row.belt === 'black'
                  ? row.tapeCount === 1
                    ? '1 degree'
                    : `${row.tapeCount} degrees`
                  : row.tapeCount === 1
                    ? '1 stripe'
                    : `${row.tapeCount} stripes`;
                return (
                  <li key={row.id} className="rank-history">
                    <span className="rank-history__label">{label}</span>
                    <span className="rank-history__date">{row.awardedOn || 'No date'}</span>
                    <span className="rank-history__stripes">{stripes}</span>
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
          </>
          )}
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
  const date = slotDate(rung.tapeDates, rung.highDegreeDates, slot - 1);
  const stripeLabel = rung.current ? `Stripe ${slot}` : `${rung.label} stripe ${slot}`;
  const dateLabel = rung.current ? `Stripe ${slot} date` : `${rung.label} stripe ${slot} date`;
  const countControl = stripeCountControl(slot, rung.tapeCount, stripeLabel);
  return (
    <>
      <button
        type="button"
        className={on ? 'stripe is-on' : 'stripe'}
        aria-pressed={on}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={stripeLabel}
        disabled={!rung.current && !on}
        onClick={() => {
          if (rung.current && countControl.action === 'add') {
            onTap();
            setOpen(false);
            return;
          }
          setOpen(true);
        }}
      >
        <span className="tape" />
        {on && date ? <span className="rank-stripe-date">{date}</span> : null}
        {on && !open && photos[0] ? <img className="rank-stripe-thumb" src={photos[0]} alt={`${rung.label} stripe ${slot} photo 1`} /> : null}
      </button>
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
    </>
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
            {date ? `Date ${date}. ` : ''}
            {photoCount}
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
            <input
              type="date"
              aria-label={dateLabel}
              value={date}
              required={false}
              onChange={(event) => onDate(event.target.value)}
            />
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

function PhotoList({
  photos,
  removeLabel,
  alt,
  onRemove,
}: {
  photos: string[];
  removeLabel: (index: number) => string;
  alt: (index: number) => string;
  onRemove: (index: number) => void;
}) {
  if (!photos.length) return null;
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
    </div>
  );
}

function PhotoRow({
  photos,
  addLabel,
  removeLabel,
  alt,
  onPhoto,
  onRemove,
}: {
  photos: string[];
  addLabel: string;
  removeLabel: (index: number) => string;
  alt: (index: number) => string;
  onPhoto: (file: File | undefined) => void;
  onRemove: (index: number) => void;
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
  const [rows, setRows] = useState<string[]>(() => [...lineage]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const lineageKey = lineage.join('\n');
  const savedKey = useRef(lineageKey);

  useEffect(() => {
    if (savedKey.current === lineageKey) return;
    savedKey.current = lineageKey;
    setRows((current) => (expandLineage(current).join('\n') === lineageKey ? current : [...lineage]));
  }, [lineage, lineageKey]);

  const show = (next: string[]) => {
    rowsRef.current = next;
    setRows(next);
  };

  const commit = (next: string[]) => {
    show(expandLineage(next));
    onSave(next);
  };

  const edit = (index: number, value: string) => {
    show(rowsRef.current.map((line, slot) => (slot === index ? value : line)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...rowsRef.current];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const prior = next[target] ?? '';
    next[target] = next[index] ?? '';
    next[index] = prior;
    commit(next);
  };

  return (
    <section className="rank-lineage-editor" aria-label="Lineage">
      <h2>Lineage</h2>
      <p>
        Your instructor first, then their instructor. Each person is their own row. Add, edit, remove, or change the order.
      </p>
      {rows.length === 0 ? <p>No instructors yet.</p> : null}
      <ol className="rank-lineage">
        {rows.map((name, index) => (
          <li key={`instructor-${index}`}>
            <label>
              <span className="ink__label">Instructor {index + 1}</span>
              <input
                type="text"
                aria-label={`Instructor ${index + 1}`}
                value={name}
                onChange={(event) => edit(index, event.target.value)}
                onBlur={(event) => {
                  const next = rowsRef.current.map((line, slot) => (slot === index ? event.target.value : line));
                  commit(next);
                }}
              />
            </label>
            <div className="student-actions">
              {index > 0 ? (
                <button type="button" className="ink-btn" aria-label={`Move instructor ${index + 1} up`} onClick={() => move(index, -1)}>
                  Up
                </button>
              ) : null}
              {index < rows.length - 1 ? (
                <button type="button" className="ink-btn" aria-label={`Move instructor ${index + 1} down`} onClick={() => move(index, 1)}>
                  Down
                </button>
              ) : null}
              <button
                type="button"
                className="ink-btn"
                aria-label={`Remove instructor ${index + 1}`}
                onClick={() => commit(rowsRef.current.filter((_, slot) => slot !== index))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="ink-btn ink-btn--save" onClick={() => show([...rowsRef.current, ''])}>
        Add instructor
      </button>
    </section>
  );
}

function EarlierBelts({ report }: { report: StudentProgressReport }) {
  const rows = earlierKidRows(report);
  if (!rows.length) return null;
  return (
    <section className="ink" aria-label="Earlier belts">
      <h2>Earlier belts</h2>
      <p className="student-quiet">Kids belts stay here. They are kept as they were.</p>
      <ul className="comp-list">
        {rows.map((row) => (
          <li key={row.id} className="rank-history">
            <span className="rank-history__label">{row.label}</span>
            <span className="rank-history__date">{row.awardedOn || 'No date'}</span>
            <span className="rank-history__stripes">{row.tapeCount === 1 ? '1 stripe' : `${row.tapeCount} stripes`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BeltSystemSwitch({
  mode,
  pending,
  onAsk,
  onStay,
  onConfirm,
}: {
  mode: 'adult' | 'kids';
  pending: '' | 'adult' | 'kids';
  onAsk: (mode: 'adult' | 'kids') => void;
  onStay: () => void;
  onConfirm: () => void;
}) {
  const note = pending === 'kids'
    ? 'Switch to kids belts? Your history stays. Your adult belts stay on this phone.'
    : 'Switch to adult belts? Your history stays. Your kids belts stay on this phone.';
  return (
    <section className="belt-system" aria-label="Belt system">
      <h2>Belt system</h2>
      <div className="belt-system__switch" role="group" aria-label="Adult or kids belts">
        <button type="button" aria-pressed={mode === 'adult'} onClick={() => onAsk('adult')}>
          Adult
        </button>
        <button type="button" aria-pressed={mode === 'kids'} onClick={() => onAsk('kids')}>
          Kids
        </button>
      </div>
      {pending ? (
        <div className="belt-system__confirm">
          <p>{note}</p>
          <div className="student-actions">
            <button type="button" className="ink-btn ink-btn--save" onClick={onConfirm}>
              Switch
            </button>
            <button type="button" className="ink-btn" onClick={onStay}>
              Stay
            </button>
          </div>
        </div>
      ) : (
        <p className="student-quiet">
          {mode === 'kids' ? 'IBJJF kids belts. Your adult belts stay on this phone.' : 'Adult stays the default. Kids belts stay saved if you switch.'}
        </p>
      )}
    </section>
  );
}

function KidsRank({
  report,
  run,
  photos,
  onBeltPhoto,
  onRemoveBeltPhoto,
  onGraduate,
  lineage,
  progressLink,
}: {
  report: StudentProgressReport;
  run: (next: StudentProgressReport) => void;
  photos: RankPhotoStore;
  onBeltPhoto: (beltId: string, file: File | undefined) => void;
  onRemoveBeltPhoto: (beltId: string, index: number) => void;
  onGraduate: (choice: 'white' | 'blue' | 'purple') => void;
  lineage: ReactNode;
  progressLink: ReactNode;
}) {
  const kids = kidsRankOf(report);
  const rungs = kidsLadder(report);
  const current = currentKidsBelt(report);
  const guide = guideOf(report);
  const classMax = classesPerTapeOf(report);
  const [dropId, setDropId] = useState('');
  const choices = adultStartChoices(current);
  const savedYear = report.beltBook?.birthYear ? String(report.beltBook.birthYear) : '';
  const [yearDraft, setYearDraft] = useState(savedYear);
  const [classDraft, setClassDraft] = useState(String(classMax));
  useEffect(() => {
    setYearDraft(savedYear);
  }, [savedYear]);
  useEffect(() => {
    setClassDraft(String(classMax));
  }, [classMax]);

  return (
    <>
      <p className="student-quiet">
        IBJJF kids belts, white through green/black. Stripes are a suggestion. Your instructor decides when one goes on.
      </p>
      {showAdultPrompt(report) ? (
        <section className="adult-prompt" aria-label="Time to switch to the adult system">
          <p>Time to switch to the adult system?</p>
          <p className="student-quiet">
            IBJJF age is this year minus the birth year. White stays white. Grey, yellow, and orange move to blue. Green may move to blue or purple. Kids belts stay under Earlier belts.
          </p>
          <div className="student-actions">
            {choices.map((choice) => (
              <button key={choice} type="button" className="ink-btn ink-btn--save" onClick={() => onGraduate(choice)}>
                {choice === 'white' ? 'Stay on white' : choice === 'blue' ? 'Start at blue' : 'Start at purple'}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <label className="kids-year">
        <span className="ink__label">Birth year</span>
        <input
          inputMode="numeric"
          aria-label="Birth year"
          value={yearDraft}
          placeholder="Optional"
          onChange={(event) => {
            const text = event.target.value;
            setYearDraft(text);
            if (/^\d{4}$/.test(text)) run(setBirthYear(report, Number(text)));
          }}
          onBlur={(event) => {
            const text = event.target.value.trim();
            if (!text) {
              run(setBirthYear(report, null));
              return;
            }
            if (/^\d{4}$/.test(text)) run(setBirthYear(report, Number(text)));
            else setYearDraft(savedYear);
          }}
        />
      </label>
      <p className="kids-wearing">
        Current belt: <strong>{current.label}</strong>
      </p>
      <section className="class-tally" aria-label="Classes toward the next stripe">
        <h2>Next stripe</h2>
        <div className="guide-switch" role="group" aria-label="Progress toward the next stripe">
          <button type="button" aria-pressed={guide === 'classes'} onClick={() => run(setTapeGuide(report, 'classes'))}>
            Classes
          </button>
          <button type="button" aria-pressed={guide === 'time'} onClick={() => run(setTapeGuide(report, 'time'))}>
            Time
          </button>
        </div>
        {guide === 'time' ? (
          <p>{timeGuideText(report)}</p>
        ) : (
          <>
            <label className="kids-year">
              <span className="ink__label">Classes per stripe</span>
              <input
                inputMode="numeric"
                aria-label="Classes per stripe"
                value={classDraft}
                onChange={(event) => {
                  const text = event.target.value;
                  setClassDraft(text);
                  if (/^\d+$/.test(text)) {
                    const value = Number(text);
                    if (value >= 1 && value <= CLASSES_PER_TAPE_MAX) run(setClassesPerTape(report, value));
                  }
                }}
                onBlur={() => setClassDraft(String(classesPerTapeOf(report)))}
              />
            </label>
            <p className="class-tally__count" aria-live="polite">
              {kids.classCount} of {classMax}
            </p>
            <div className="class-dots" aria-hidden="true">
              {Array.from({ length: classMax }, (_, index) => (
                <i key={index} className={index < kids.classCount ? 'is-on' : ''} />
              ))}
            </div>
            <button
              type="button"
              className="ink-btn ink-btn--save"
              disabled={kids.classCount >= classMax}
              onClick={() => run(addClassDot(report))}
            >
              Add a class
            </button>
            {kids.classCount > 0 ? (
              <button type="button" className="ink-btn" onClick={() => run(removeClassDot(report))}>
                Remove a class
              </button>
            ) : null}
            {kids.classCount >= classMax ? <p>Your instructor decides when the stripe goes on.</p> : null}
          </>
        )}
      </section>
      <ol className="rank-ladder" aria-label="Kids belt ladder">
        {rungs.map((rung) => {
          const slots = literalSlots(rung.tapeColors, rung.tapeCount);
          const pictures = kidsBeltPhotos(photos, rung.beltId);
          const note = ageWarning(rung, report.beltBook?.birthYear);
          return (
          <li
            key={rung.beltId}
            id={rung.current ? 'current' : undefined}
            className={`rank-rung rung rung--kids${rung.ink === 'navy' ? ' rung--kids-ink-navy' : ''}${rung.current ? ' is-current' : ''}`}
            style={kidsClothStyle(rung)}
          >
            <div
              className="belt belt--kids"
              data-center={rung.center}
              style={{ ['--barw' as string]: `calc(var(--slot) * ${Math.max(slots.length, 1)} + 12px)` }}
            >
              <button
                type="button"
                className="belt__body"
                aria-label={rung.label}
                aria-pressed={rung.current}
                onClick={() => {
                  setDropId('');
                  run(setKidsBelt(report, rung.beltId));
                }}
              >
                <span className="belt__name">{rung.label}</span>
                {rung.current ? <span className="belt__sub">Current belt</span> : null}
              </button>
              <div className="belt__bar" role="group" aria-label={rung.current ? 'Stripes' : `${rung.label} stripes`}>
                {slots.map((slot) => {
                  const stripeLabel = rung.current ? `Stripe ${slot.slot}` : `${rung.label} stripe ${slot.slot}`;
                  return (
                    <button
                      key={slot.slot}
                      type="button"
                      className={slot.on ? 'stripe is-on' : 'stripe'}
                      style={{ ['--tape' as string]: slot.color }}
                      aria-label={stripeLabel}
                      aria-pressed={slot.on}
                      disabled={!rung.current}
                      onClick={() => {
                        if (!rung.current) return;
                        run(setKidsTapeCount(report, literalTapeCountAfterTap(rung.tapeColors, rung.tapeCount, slot.slot)));
                      }}
                    >
                      <span className="tape" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rung__foot">
              <label className={rung.awardedOn ? 'achieved' : 'achieved is-empty'}>
                Achieved <b>{rung.awardedOn ? formatAchieved(rung.awardedOn) : 'Add date'}</b>
                <input
                  type="date"
                  aria-label={rung.current ? 'Date of this belt' : `Date of ${rung.label} belt`}
                  value={rung.awardedOn}
                  disabled={!rung.current && !rung.historyId}
                  onChange={(event) => {
                    if (rung.current) run(setKidsAwardedOn(report, event.target.value));
                    else if (rung.historyId) run(setKidsHistoryAwardedOn(report, rung.historyId, event.target.value));
                  }}
                />
              </label>
              <label className="photo">
                {CAMERA}
                Photo
                {pictures.length ? <span className="n">{pictures.length}</span> : null}
                <input
                  className="student-file"
                  type="file"
                  accept="image/*"
                  aria-label={`Add ${rung.label} photo`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    onBeltPhoto(rung.beltId, file);
                  }}
                />
              </label>
            </div>
            <PhotoList
              photos={pictures}
              removeLabel={(index) => `Remove ${rung.label} photo ${index + 1}`}
              alt={(index) => `${rung.label} photo ${index + 1}`}
              onRemove={(index) => onRemoveBeltPhoto(rung.beltId, index)}
            />
            {note ? (
              <p className="kids-age kids-age--note" role="status">
                {note}
              </p>
            ) : null}
            {rung.current && rung.tapeColors.length >= 8 ? (
              <label className="kids-year">
                <span className="ink__label">Last 3 stripe color</span>
                <input
                  type="color"
                  aria-label="Last 3 stripe color"
                  value={rung.tapeColors[rung.tapeColors.length - 1] ?? '#121214'}
                  onChange={(event) => run(setLastTapeColor(report, event.target.value))}
                />
              </label>
            ) : null}
          </li>
          );
        })}
      </ol>
      <p className="student-quiet">
        {kids.tapeCount === 0 ? 'No stripes' : kids.tapeCount === 1 ? '1 stripe' : `${kids.tapeCount} stripes`} of {current.tapeColors.length} on the belt you wear. White and grey/white use 5 stripes. The other belts use 11: 4 white, 4 red, then 3 black. Tap a stripe to add it. Tap the latest stripe to take it off. The last 3 colors can be changed on the belt you wear. A full class card does not add a stripe.
      </p>
      {lineage}
      <section className="ink" aria-label="Promotion history">
        <h2>Promotion history</h2>
        {kids.history.length === 0 ? <p>No earlier belts yet. A belt moves here when you change it and it already has a date or a stripe.</p> : null}
        <ul className="comp-list">
          {kids.history.map((row) => {
            const label = rungs.find((rung) => rung.beltId === row.beltId)?.label ?? row.beltId;
            const stripes = row.tapeCount === 1 ? '1 stripe' : `${row.tapeCount} stripes`;
            return (
              <li key={row.id} className="rank-history">
                <span className="rank-history__label">{label}</span>
                <span className="rank-history__date">{row.awardedOn || 'No date'}</span>
                <span className="rank-history__stripes">{stripes}</span>
                {dropId === row.id ? (
                  <div className="student-actions">
                    <button
                      type="button"
                      className="ink-btn"
                      aria-label={`Confirm remove ${label} history`}
                      onClick={() => {
                        run(removeKidsHistory(report, row.id));
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
                  <button type="button" className="ink-btn ink-btn--small" aria-label={`Remove ${label} history`} onClick={() => setDropId(row.id)}>
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {progressLink}
    </>
  );
}
