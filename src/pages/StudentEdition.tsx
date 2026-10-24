import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { LeatherSpine } from '../components/LeatherSpine';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { PRODUCTS_PATH, STUDENT_EDITION_NAME } from '../lib/productNames';
import { matchingGameTags, matchingResults, gameLetter } from '../lib/progress/competition.ts';
import { PROGRESS_NAME_MAX, type CompetitionResult, type MatchMethod, type MatchResult } from '../lib/progress/types.ts';
import { isIsoDate } from '../lib/studentTools';
import { BeltPage } from './student/BeltPage';
import { CalendarDayPage, CalendarPage } from './student/CalendarPages';
import { CompetitorPage } from './student/CompetitorPage';
import { RankPage } from './student/RankPage';
import { ResultsPage } from './student/ResultsPage';
import { ScoutingPage } from './student/ScoutingPage';
import { VideoLibraryPage } from './student/VideoLibraryPage';
import { WeightPage } from './student/WeightPage';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './student/chrome';
import { studentScreen } from '../lib/studentHubMenu';
import { BackupMenu, ClearStudentMenu } from './student/BackupMenu';
import { CoachMenu, CompeteMenu, ProgressMenu, StudentHub, TrainingMenu } from './student/StudentMenus';
import { SharePage } from './student/SharePage';
import { AcademyConnectPage, ConnectionsPage } from './student/ConnectionsPage';
import { FundamentalsPage } from './student/FundamentalsPage';
import { PrintReportPage } from './student/PrintReportPage';
import { ProfilePage } from './student/ProfilePage';
import {
  addJournalAmendment,
  addJournalEntry,
  deleteJournalEntry,
  updateJournalEntry,
  fundamentalsBoard,
  JOURNAL_CLASS_PLACEHOLDER,
  JOURNAL_TECHNIQUE_MAX,
  JOURNAL_TECHNIQUE_ROWS,
  searchStudentJournal,
  studentEditionOpen,
  techniqueDrilledLabel,
  todayIso,
  viewJournalEntry,
  type FundamentalRow,
  type JournalCardView,
} from '../lib/studentEdition.ts';
import '../student-edition.css';
import './student/arena.css';
import './student/hub.css';

function blankTechniqueRows(count: number): { id: string; name: string }[] {
  return Array.from({ length: count }, () => ({ id: '', name: '' }));
}

export function StudentEditionPage() {
  const [params] = useSearchParams();
  const path = useLocation().pathname.replace(/\/+$/, '');
  const open = studentEditionOpen(params, {
    pro: useProUnlocked(),
    coach: useCoachUnlocked(),
    white: useWhiteUnlocked(),
    student: useStudentEditionUnlocked(),
  });
  if (!open) return <StudentClosed />;

  const rest = path.startsWith('/student') ? path.slice('/student'.length).replace(/^\//, '') : '';
  switch (studentScreen(rest)) {
    case 'journal':
      return <JournalToday />;
    case 'cards':
      return <JournalList />;
    case 'card':
      return <JournalCardPage id={decodeURIComponent(rest.slice('cards/'.length))} />;
    case 'fundamentals':
      return <FundamentalsPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'calendar-day':
      return <CalendarDayPage date={decodeURIComponent(rest.slice('calendar/'.length))} />;
    case 'rubric':
      return <BeltPage />;
    case 'profile':
      return <ProfilePage />;
    case 'rank':
      return <RankPage />;
    case 'share':
      return <SharePage />;
    case 'competitor':
      return <CompetitorPage />;
    case 'weight':
      return <WeightPage />;
    case 'results':
      return <ResultsPage />;
    case 'videos':
      return <VideoLibraryPage />;
    case 'connections':
      return <ConnectionsPage />;
    case 'academy':
      return <AcademyConnectPage />;
    case 'print-progress':
      return <PrintReportPage kind="progress" />;
    case 'print-assessment':
      return <PrintReportPage kind="assessment" />;
    case 'scouting':
      return <ScoutingPage />;
    case 'training':
      return <TrainingMenu />;
    case 'progress':
      return <ProgressMenu />;
    case 'compete':
      return <CompeteMenu />;
    case 'coach':
      return <CoachMenu />;
    case 'backup':
      return <BackupMenu />;
    case 'backup-clear':
      return <ClearStudentMenu />;
    case 'hub':
      return <StudentHub />;
    default:
      return <StudentHub />;
  }
}

function StudentClosed() {
  return (
    <main className="home home--student">
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />
        <div className="student-hub">
          <header className="student-hub__band">
            <LeatherSpine />
            <h2>{STUDENT_EDITION_NAME}</h2>
            <p>This preview opens with the owner unlock, or with ?student=1 on the address.</p>
          </header>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

function JournalToday() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('date') ?? '';
  const [date, setDate] = useState(isIsoDate(requested) ? requested : todayIso());
  const [className, setClassName] = useState('');
  const [techniques, setTechniques] = useState(() => blankTechniqueRows(JOURNAL_TECHNIQUE_ROWS));
  const [partners, setPartners] = useState('');
  const [drills, setDrills] = useState('');
  const [rolls, setRolls] = useState('');
  const [notes, setNotes] = useState('');
  const [stopDoing, setStopDoing] = useState('');
  const [picker, setPicker] = useState<number | null>(null);
  const [error, setError] = useState('');

  const choose = (index: number, item: FundamentalRow) => {
    setTechniques((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { id: item.catalogItemId || item.entryId, name: item.label } : slot,
      ),
    );
    setPicker(null);
  };

  const save = () => {
    try {
      const next = commit(
        addJournalEntry(report, {
          date,
          className,
          gameTag: '',
          techniques,
          partners,
          drills,
          rolls,
          notes,
          stopDoing,
        }),
      );
      const id = next.journal[next.journal.length - 1]?.id;
      if (id) navigate(to(`/student/cards/${id}`), { state: { saved: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this card.');
    }
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Journal" />
      <div className="student-paper">
        <form
          className="student-sheet"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="student-top">
            <label className="ink">
              <span className="ink__label">Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label className="ink ink--wobble">
              <span className="ink__label">Class</span>
              <input
                aria-label="Class"
                value={className}
                maxLength={PROGRESS_NAME_MAX}
                placeholder={JOURNAL_CLASS_PLACEHOLDER}
                onChange={(event) => setClassName(event.target.value)}
              />
            </label>
          </div>
          <div className="student-split">
            <div className="student-stack">
              {techniques.map((slot, index) => (
                <label key={index} className={index % 2 === 0 ? 'ink ink--tech' : 'ink ink--wobble ink--tech'}>
                  <span className="ink__label">{techniqueDrilledLabel(index)}</span>
                  <input
                    aria-label={techniqueDrilledLabel(index)}
                    value={slot.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setTechniques((current) =>
                        current.map((item, slotIndex) => (slotIndex === index ? { id: item.name === name ? item.id : '', name } : item)),
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="student-pick"
                    aria-label={`Pick ${techniqueDrilledLabel(index)} from fundamentals`}
                    onClick={() => setPicker(index)}
                  >
                    Pick
                  </button>
                </label>
              ))}
              {techniques.length < JOURNAL_TECHNIQUE_MAX ? (
                <button
                  type="button"
                  className="ink-btn ink-btn--small"
                  onClick={() => setTechniques((current) => [...current, { id: '', name: '' }])}
                >
                  Add another technique
                </button>
              ) : null}
            </div>
            <div className="student-stack">
              <label className="ink">
                <span className="ink__label">Training Partners</span>
                <textarea rows={3} value={partners} onChange={(event) => setPartners(event.target.value)} />
              </label>
              <label className="ink ink--wobble">
                <span className="ink__label">Drills</span>
                <textarea rows={2} value={drills} onChange={(event) => setDrills(event.target.value)} />
              </label>
              <label className="ink">
                <span className="ink__label">Rolls</span>
                <textarea rows={2} value={rolls} onChange={(event) => setRolls(event.target.value)} />
              </label>
            </div>
          </div>
          <label className="ink journal-note">
            <span className="ink__label">Drill notes</span>
            <span className="student-quiet" aria-hidden="true">
              What you drilled and what to remember.
            </span>
            <textarea aria-label="Drill notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label className="ink ink--wobble journal-note">
            <span className="ink__label">Stop doing</span>
            <span className="student-quiet" aria-hidden="true">
              Mistakes to stop making.
            </span>
            <textarea aria-label="Stop doing" rows={3} value={stopDoing} onChange={(event) => setStopDoing(event.target.value)} />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <div className="student-actions">
            <button type="submit" className="ink-btn ink-btn--save">
              Save entry
            </button>
            <Link className="ink-btn ink-btn--wide" to={to('/student/cards')}>
              Add note to an earlier card
            </Link>
          </div>
        </form>
      </div>
      {picker === null ? null : (
        <div className="student-picker" role="dialog" aria-label={`Pick ${techniqueDrilledLabel(picker)}`}>
          <button type="button" className="ink-btn" onClick={() => setPicker(null)}>
            Close
          </button>
          {fundamentalsBoard(report).map((category) => (
            <section key={category.id}>
              <h2 className="student-picker__category">{category.name}</h2>
              {category.items.map((item) => (
                <button
                  key={`${item.catalogItemId}-${item.entryId}-${item.name}`}
                  type="button"
                  className="student-picker__item"
                  onClick={() => choose(picker, item)}
                >
                  {item.label}
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}


function resultWord(result: MatchResult): string {
  if (result === 'win') return 'Win';
  if (result === 'draw') return 'Draw';
  return 'Loss';
}

function methodWord(method: MatchMethod): string {
  if (method === 'points') return 'Points';
  if (method === 'sub') return 'Sub';
  if (method === 'advantage') return 'Advantage';
  if (method === 'dq') return 'DQ';
  return '';
}

function resultSearchLine(result: CompetitionResult): string {
  const matches = result.matches
    .map((match) => {
      const method = methodWord(match.method);
      const note = match.note.trim();
      const when = match.date ? ` · ${match.date}` : '';
      return `${resultWord(match.result)} · ${match.opponent}${method ? ` · ${method}` : ''}${note ? ` — ${note}` : ''}${when}`;
    })
    .join('; ');
  const names = result.bracket.map((note) => note.name.trim()).filter(Boolean).join(', ');
  return `${result.division ? ` · ${result.division}` : ''}${matches ? ` · ${matches}` : ''}${names ? ` · ${names}` : ''}`;
}

function cardLabel(card: JournalCardView): string {
  return card.className ? `${card.date} ${card.className}` : card.date;
}

function JournalList() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const cards = searchStudentJournal(report, query).map(viewJournalEntry);
  const games = matchingGameTags(report.competition, query);
  const results = matchingResults(report.competition, query);
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Journal cards" />
      <div className="student-paper">
        <div className="student-sheet">
          <label className="ink student-search">
            <span className="ink__label">Search</span>
            <input
              aria-label="Search journal"
              value={query}
              placeholder="Technique, note, opponent, or tournament"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Link className="ink-btn" to={to('/student/journal')}>
            Today’s page
          </Link>
          {query.trim() && games.length ? (
            <section className="ink" aria-label="Competition game">
              {games.map((tag) => {
                const game = report.competition?.games[tag];
                if (!game) return null;
                return (
                  <p key={tag}>
                    <strong>{gameLetter(tag)} game.</strong> {game.techniques || 'No techniques yet'}
                    {game.notes ? ` — ${game.notes}` : ''}
                  </p>
                );
              })}
            </section>
          ) : null}
          {query.trim() && results.length ? (
            <section className="ink" aria-label="Competition results">
              {results.map((result) => (
                <p key={result.id}>
                  <Link to={to('/student/results')}>{result.tournamentName}</Link>
                  {resultSearchLine(result)}
                </p>
              ))}
            </section>
          ) : null}
          {cards.length === 0 ? <p className="student-quiet">No cards match.</p> : null}
          {cards.map((card) => (
            <article key={card.id} className="ink student-card">
              <Link className="student-card-link" to={to(`/student/cards/${card.id}`)}>
                <strong>
                  {card.date}
                  {card.className ? ` · ${card.className}` : ''}
                </strong>
                <span>{card.techniques.map((item) => item.name).filter(Boolean).join(', ') || 'No technique yet'}</span>
                <span>{card.notes || card.amendments[0]?.body || 'Empty notes'}</span>
                {card.stopDoing ? <span>Stop doing: {card.stopDoing}</span> : null}
                <span>Training partners: {card.partners || '—'}</span>
                <span>Drills: {card.drills || '—'}</span>
                <span>Rolls: {card.rolls || '—'}</span>
              </Link>
              <div className="student-card__actions">
                <Link className="ink-btn" to={to(`/student/cards/${card.id}?edit=1`)}>
                  {`Edit ${cardLabel(card)}`}
                </Link>
                {pendingDelete === card.id ? (
                  <div className="student-card__confirm" role="group" aria-label={`Delete ${cardLabel(card)}`}>
                    <p>Delete this card?</p>
                    <button
                      type="button"
                      className="ink-btn"
                      onClick={() => {
                        commit(deleteJournalEntry(report, card.id));
                        setPendingDelete(null);
                      }}
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="ink-btn" onClick={() => setPendingDelete(null)}>
                      Keep card
                    </button>
                  </div>
                ) : (
                  <button type="button" className="ink-btn" onClick={() => setPendingDelete(card.id)}>
                    {`Delete ${cardLabel(card)}`}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function JournalCardPage({ id }: { id: string }) {
  const to = useStudentPath();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { report, commit } = useStudentFile();
  const entry = report.journal.find((item) => item.id === id);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(() => Boolean((location.state as { saved?: boolean } | null)?.saved));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = params.get('edit') === '1' && Boolean(entry);
  if (!entry) {
    return (
      <main className="student student-frame">
      <StudentMarks />
        <LeatherHeader title="Journal card" />
        <div className="student-paper">
          <div className="student-sheet">
            <p>That card is not on this device.</p>
          </div>
        </div>
      </main>
    );
  }
  const card = viewJournalEntry(entry);
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Journal card" />
      <div className="student-paper">
        <div className="student-sheet">
          {saved && !editing ? (
            <p className="student-saved" role="status">
              Saved
            </p>
          ) : null}
          {editing ? (
            <JournalEditor
              card={card}
              onCancel={() => navigate(to(`/student/cards/${card.id}`), { replace: true })}
              onSave={(draft) => {
                commit(updateJournalEntry(report, card.id, { ...draft, gameTag: card.gameTag }));
                setSaved(true);
                setError('');
                navigate(to(`/student/cards/${card.id}`), { replace: true, state: { saved: true } });
              }}
            />
          ) : (
            <CardBody card={card} />
          )}
          <Amendments card={card} />
          <div className="student-card__actions">
            {editing ? null : (
              <Link className="ink-btn" to={to(`/student/cards/${card.id}?edit=1`)}>
                {`Edit ${cardLabel(card)}`}
              </Link>
            )}
            {confirmDelete ? (
              <div className="student-card__confirm" role="group" aria-label="Delete this card">
                <p>Delete this card?</p>
                <button
                  type="button"
                  className="ink-btn"
                  onClick={() => {
                    commit(deleteJournalEntry(report, card.id));
                    navigate(to('/student/cards'));
                  }}
                >
                  Confirm delete
                </button>
                <button type="button" className="ink-btn" onClick={() => setConfirmDelete(false)}>
                  Keep card
                </button>
              </div>
            ) : (
              <button type="button" className="ink-btn" onClick={() => setConfirmDelete(true)}>
                Delete this card
              </button>
            )}
          </div>
          <form
            className="ink ink--wobble"
            onSubmit={(event) => {
              event.preventDefault();
              if (!note.trim()) return;
              try {
                commit(addJournalAmendment(report, card.id, note, todayIso()));
                setNote('');
                setError('');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not add that note.');
              }
            }}
          >
            <label>
              <span className="ink__label">Add note to an earlier card</span>
              <textarea aria-label="Amendment" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button type="submit" className="ink-btn">
              Add note
            </button>
            {error ? <p role="alert">{error}</p> : null}
          </form>
        </div>
      </div>
    </main>
  );
}

function CardBody({ card }: { card: JournalCardView }) {
  return (
    <>
      <div className="ink">
        <p className="ink__label">
          {card.date}
          {card.className ? ` · ${card.className}` : ''}
        </p>
        {card.techniques.length === 0 ? <p>Technique drilled: —</p> : null}
        {card.techniques.map((item, index) => (
          <p key={`${item.id}-${index}`}>
            {techniqueDrilledLabel(index)}: {item.name}
          </p>
        ))}
        <p>Training partners: {card.partners || '—'}</p>
        <p>Drills: {card.drills || '—'}</p>
        <p>Rolls: {card.rolls || '—'}</p>
        <p>Drill notes: {card.notes || '—'}</p>
        <p>Stop doing: {card.stopDoing || '—'}</p>
      </div>
    </>
  );
}

function Amendments({ card }: { card: JournalCardView }) {
  return (
    <section className="ink" aria-label="Amendments">
      <h2 className="ink__label">Later notes</h2>
      {card.amendments.length === 0 ? <p className="student-quiet">No later notes yet.</p> : null}
      {card.amendments.map((item) => (
        <article key={item.id} className="student-amend">
          <time dateTime={item.date}>{item.date}</time>
          <p>{item.body}</p>
        </article>
      ))}
    </section>
  );
}

function JournalEditor({
  card,
  onCancel,
  onSave,
}: {
  card: JournalCardView;
  onCancel: () => void;
  onSave: (draft: {
    date: string;
    className: string;
    techniques: { id: string; name: string }[];
    partners: string;
    drills: string;
    rolls: string;
    notes: string;
    stopDoing: string;
  }) => void;
}) {
  const [date, setDate] = useState(card.date);
  const [className, setClassName] = useState(card.className);
  const [techniques, setTechniques] = useState(() => {
    const rows = card.techniques.map((item) => ({ id: item.id, name: item.name }));
    while (rows.length < JOURNAL_TECHNIQUE_ROWS) rows.push({ id: '', name: '' });
    return rows;
  });
  const [partners, setPartners] = useState(card.partners);
  const [drills, setDrills] = useState(card.drills);
  const [rolls, setRolls] = useState(card.rolls);
  const [notes, setNotes] = useState(card.notes);
  const [stopDoing, setStopDoing] = useState(card.stopDoing ?? '');
  const [error, setError] = useState('');

  return (
    <form
      className="ink"
      aria-label={`Edit ${cardLabel(card)}`}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave({ date, className, techniques, partners, drills, rolls, notes, stopDoing });
          setError('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save this card.');
        }
      }}
    >
      <div className="student-top">
        <label className="ink">
          <span className="ink__label">Date</span>
          <input aria-label="Edit date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="ink ink--wobble">
          <span className="ink__label">Class</span>
          <input
            aria-label="Edit class"
            value={className}
            maxLength={PROGRESS_NAME_MAX}
            placeholder={JOURNAL_CLASS_PLACEHOLDER}
            onChange={(event) => setClassName(event.target.value)}
          />
        </label>
      </div>
      {techniques.map((slot, index) => (
        <label key={index} className="ink">
          <span className="ink__label">{techniqueDrilledLabel(index)}</span>
          <input
            aria-label={`Edit ${techniqueDrilledLabel(index)}`}
            value={slot.name}
            onChange={(event) => {
              const name = event.target.value;
              setTechniques((current) =>
                current.map((item, slotIndex) => (slotIndex === index ? { id: item.name === name ? item.id : '', name } : item)),
              );
            }}
          />
        </label>
      ))}
      {techniques.length < JOURNAL_TECHNIQUE_MAX ? (
        <button
          type="button"
          className="ink-btn ink-btn--small"
          onClick={() => setTechniques((current) => [...current, { id: '', name: '' }])}
        >
          Add another technique
        </button>
      ) : null}
      <label className="ink">
        <span className="ink__label">Training Partners</span>
        <textarea aria-label="Edit training partners" rows={3} value={partners} onChange={(event) => setPartners(event.target.value)} />
      </label>
      <label className="ink ink--wobble">
        <span className="ink__label">Drills</span>
        <textarea aria-label="Edit drills" rows={2} value={drills} onChange={(event) => setDrills(event.target.value)} />
      </label>
      <label className="ink">
        <span className="ink__label">Rolls</span>
        <textarea aria-label="Edit rolls" rows={2} value={rolls} onChange={(event) => setRolls(event.target.value)} />
      </label>
      <label className="ink journal-note">
        <span className="ink__label">Drill notes</span>
        <span className="student-quiet" aria-hidden="true">
          What you drilled and what to remember.
        </span>
        <textarea aria-label="Edit drill notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="ink ink--wobble journal-note">
        <span className="ink__label">Stop doing</span>
        <span className="student-quiet" aria-hidden="true">
          Mistakes to stop making.
        </span>
        <textarea aria-label="Edit stop doing" rows={3} value={stopDoing} onChange={(event) => setStopDoing(event.target.value)} />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <div className="student-card__actions">
        <button type="submit" className="ink-btn ink-btn--save">
          Save card
        </button>
        <button type="button" className="ink-btn" onClick={onCancel}>
          Cancel edit
        </button>
      </div>
    </form>
  );
}
