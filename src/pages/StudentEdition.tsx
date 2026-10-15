import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { LeatherSpine } from '../components/LeatherSpine';
import { SiteFooter } from '../components/SiteFooter';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { STUDENT_EDITION_NAME, STUDENT_HOME_DESCRIPTION } from '../lib/productNames';
import { matchingGameTags, matchingResults, gameLetter } from '../lib/progress/competition.ts';
import { PROGRESS_NAME_MAX, type CompetitionResult, type MatchMethod, type MatchResult } from '../lib/progress/types.ts';
import { isIsoDate } from '../lib/studentTools';
import { BeltPage } from './student/BeltPage';
import { CalendarDayPage, CalendarPage } from './student/CalendarPages';
import { CompetitorPage } from './student/CompetitorPage';
import { ResultsPage } from './student/ResultsPage';
import { ScoutingPage } from './student/ScoutingPage';
import { VideoLibraryPage } from './student/VideoLibraryPage';
import { WeightPage } from './student/WeightPage';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './student/chrome';
import { SharePage } from './student/SharePage';
import {
  addCustomFundamental,
  addJournalAmendment,
  addJournalEntry,
  fundamentalsBoard,
  hideFundamental,
  renameFundamental,
  restoreStarterFundamentals,
  JOURNAL_CLASS_PLACEHOLDER,
  JOURNAL_TECHNIQUE_MAX,
  JOURNAL_TECHNIQUE_ROWS,
  searchStudentJournal,
  setFundamentalLearned,
  setFundamentalNote,
  studentEditionOpen,
  techniqueDrilledLabel,
  todayIso,
  viewJournalEntry,
  type FundamentalRow,
  type JournalCardView,
} from '../lib/studentEdition.ts';
import '../student-edition.css';

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
  if (rest === 'journal') return <JournalToday />;
  if (rest === 'cards') return <JournalList />;
  if (rest.startsWith('cards/')) return <JournalCardPage id={decodeURIComponent(rest.slice('cards/'.length))} />;
  if (rest === 'fundamentals') return <FundamentalsPage />;
  if (rest === 'calendar') return <CalendarPage />;
  if (rest.startsWith('calendar/')) return <CalendarDayPage date={decodeURIComponent(rest.slice('calendar/'.length))} />;
  if (rest === 'rubric' || rest === 'belt') return <BeltPage />;
  if (rest === 'share') return <SharePage />;
  if (rest === 'competitor') return <CompetitorPage />;
  if (rest === 'weight') return <WeightPage />;
  if (rest === 'results') return <ResultsPage />;
  if (rest === 'videos') return <VideoLibraryPage />;
  if (rest === 'scouting') return <ScoutingPage />;
  return <Hub />;
}

function StudentClosed() {
  return (
    <main className="home home--student">
      <div className="home__inner">
        <HomeMark to="/" />
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

const HUB_LINKS = [
  { title: 'Journal', note: "Today's page", to: '/student/journal' },
  { title: 'Journal cards', note: 'Search your notes', to: '/student/cards' },
  { title: 'Fundamentals', note: 'Checklist', to: '/student/fundamentals' },
  { title: 'Calendar', note: 'Month and your events', to: '/student/calendar' },
  { title: 'Competitor', note: 'Tournaments and game', to: '/student/competitor' },
  { title: 'Weight', note: 'Weigh-ins and target', to: '/student/weight' },
  { title: 'Results', note: 'Matches and bracket notes', to: '/student/results' },
  { title: 'Scouting', note: 'Weight class and open class', to: '/student/scouting' },
  { title: 'Video Library', note: 'Technique and drill links', to: '/student/videos' },
  { title: 'Belt progress', note: 'Checkpoints and goals', to: '/student/rubric' },
] as const;

function Hub() {
  const to = useStudentPath();
  const [params] = useSearchParams();
  const home = params.get('student') === '1' ? '/?student=1' : '/';
  return (
    <main className="home home--student">
      <div className="home__inner">
        <HomeMark to={home} />
        <nav className="home__modes student-hub" aria-label="Advantage Student Edition">
          <header className="student-hub__band">
            <LeatherSpine />
            <h2>{STUDENT_EDITION_NAME}</h2>
            <p>{STUDENT_HOME_DESCRIPTION}</p>
          </header>
          {HUB_LINKS.map((item) => (
            <Link key={item.to} className="student-hub__link" to={to(item.to)} aria-label={item.title}>
              <LeatherSpine />
              <span className="student-hub__title">{item.title}</span>
              <small>{item.note}</small>
            </Link>
          ))}
          <details className="student-hub__menu">
            <LeatherSpine />
            <summary>Menu</summary>
            <div className="student-hub__menu-list">
              <Link to={to('/student/share')}>Send to coach</Link>
              <Link to={to('/student/share#import')}>Import from coach</Link>
            </div>
          </details>
        </nav>
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
        }),
      );
      const id = next.journal[next.journal.length - 1]?.id;
      if (id) navigate(to(`/student/cards/${id}`));
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
          <label className="ink ink--wobble">
            <span className="ink__label">Notes</span>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
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
      return `${resultWord(match.result)} · ${match.opponent}${method ? ` · ${method}` : ''}${note ? ` — ${note}` : ''}`;
    })
    .join('; ');
  const names = result.bracket.map((note) => note.name.trim()).filter(Boolean).join(', ');
  return `${result.division ? ` · ${result.division}` : ''}${matches ? ` · ${matches}` : ''}${names ? ` · ${names}` : ''}`;
}

function JournalList() {
  const to = useStudentPath();
  const { report } = useStudentFile();
  const [query, setQuery] = useState('');
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
            <Link key={card.id} className="ink student-card-link" to={to(`/student/cards/${card.id}`)}>
              <strong>
                {card.date}
                {card.className ? ` · ${card.className}` : ''}
              </strong>
              <span>{card.techniques.map((item) => item.name).filter(Boolean).join(', ') || 'No technique yet'}</span>
              <span>{card.notes || card.amendments[0]?.body || 'Empty notes'}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function JournalCardPage({ id }: { id: string }) {
  const { report, commit } = useStudentFile();
  const entry = report.journal.find((item) => item.id === id);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
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
          <CardBody card={card} />
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
        <p>Notes: {card.notes || '—'}</p>
      </div>
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
    </>
  );
}

function FundamentalsPage() {
  const { report, commit } = useStudentFile();
  const board = fundamentalsBoard(report);
  const [confirmRestore, setConfirmRestore] = useState(false);
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Fundamentals" />
      <div className="student-paper">
        <div className="student-sheet">
          {board.map((category) => (
            <section key={category.id} className="ink" aria-label={category.name}>
              <h2 className="student-count">
                {category.name} {category.learned} learned
              </h2>
              {category.items.map((item) => (
                <FundamentalLine
                  key={`${item.categoryId}-${item.catalogItemId || item.entryId}`}
                  item={item}
                  onLearn={(learned, date) =>
                    commit(setFundamentalLearned(report, item, learned, date || todayIso()))
                  }
                  onFields={(note, learnedOn) => commit(setFundamentalNote(report, item, note, learnedOn))}
                  onRename={(label) => commit(renameFundamental(report, item, label))}
                  onRemove={() => commit(hideFundamental(report, item))}
                />
              ))}
              <CustomFundamental
                categoryName={category.name}
                onAdd={(name) => commit(addCustomFundamental(report, category.id, name))}
              />
            </section>
          ))}
          <div className="student-restore">
            {confirmRestore ? (
              <div className="student-confirm" role="group" aria-label="Restore starter list">
                <p>Bring starter names back and show hidden starter techniques?</p>
                <button
                  type="button"
                  className="ink-btn"
                  onClick={() => {
                    commit(restoreStarterFundamentals(report));
                    setConfirmRestore(false);
                  }}
                >
                  Confirm restore starter list
                </button>
                <button type="button" className="ink-btn" onClick={() => setConfirmRestore(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="ink-btn" onClick={() => setConfirmRestore(true)}>
                Restore starter list
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 19.5l4.1-1.05L18.8 8.2 15.7 5.1 5.5 15.3 4.5 19.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.4 7.4l3.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function FundamentalLine({
  item,
  onLearn,
  onFields,
  onRename,
  onRemove,
}: {
  item: FundamentalRow;
  onLearn: (learned: boolean, date: string) => void;
  onFields: (note: string, learnedOn: string) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [date, setDate] = useState(item.learnedOn);
  const [note, setNote] = useState(item.note);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setDate(item.learnedOn);
    setNote(item.note);
    setDraft(item.label);
  }, [item.learnedOn, item.note, item.label]);
  const learned = Boolean(item.learnedOn);
  const saveName = () => {
    const next = draft.trim();
    if (next && next !== item.label) onRename(next);
    setEditing(false);
  };
  return (
    <div className="student-fund">
      <div className="student-fund__head">
        {editing ? (
          <form
            className="student-rename"
            onSubmit={(event) => {
              event.preventDefault();
              saveName();
            }}
          >
            <input
              aria-label={`New name for ${item.label}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="ink-btn">
              Save name
            </button>
          </form>
        ) : (
          <span className="student-fund__name">{item.label}</span>
        )}
        <div className="student-fund__tools">
          <button
            type="button"
            className="student-icon"
            aria-label={editing ? `Close rename for ${item.label}` : `Rename ${item.label}`}
            onClick={() => setEditing((open) => !open)}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="student-icon"
            aria-label={`Remove ${item.label}`}
            onClick={() => setConfirming(true)}
          >
            <CrossIcon />
          </button>
          <button
            type="button"
            className={learned ? 'student-learned is-on' : 'student-learned'}
            aria-pressed={learned}
            aria-label={learned ? `Learned ${item.label}` : `Mark ${item.label} learned`}
            onClick={() => onLearn(!learned, date)}
          >
            {learned ? 'Learned' : 'Mark learned'}
          </button>
        </div>
      </div>
      {confirming ? (
        <div className="student-confirm" role="group" aria-label={`Remove ${item.label}`}>
          <span>Hide {item.label}? Notes and journal cards stay.</span>
          <button type="button" className="ink-btn" aria-label={`Confirm remove ${item.label}`} onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="ink-btn" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : null}
      <div className="student-fund__fields">
        <input
          type="date"
          aria-label={`${item.label} date learned`}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          onBlur={() => onFields(note, date)}
        />
        <input
          aria-label={`${item.label} note`}
          value={note}
          placeholder="Note"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => onFields(note, date)}
        />
      </div>
    </div>
  );
}

function CustomFundamental({
  categoryName,
  onAdd,
}: {
  categoryName: string;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="student-add"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd(name);
        setName('');
      }}
    >
      <input
        aria-label={`Add your own to ${categoryName}`}
        value={name}
        placeholder="Add your own"
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="ink-btn">
        Add
      </button>
    </form>
  );
}

