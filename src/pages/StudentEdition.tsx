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
import {
  JOURNAL_DRILLS_LABEL,
  JOURNAL_NOTES_LABEL,
  JOURNAL_PARTNERS_LABEL,
  JOURNAL_ROLLS_LABEL,
  JOURNAL_SAVED_TOAST,
  JOURNAL_SEE_CARD,
  JOURNAL_STOP_LABEL,
  formatJournalDate,
  journalActionLabel,
} from '../lib/journalCopy';
import { BeltPage } from './student/BeltPage';
import { CalendarDayPage, CalendarPage } from './student/CalendarPages';
import { CompetitorPage } from './student/CompetitorPage';
import { SelfAssessmentPage } from './student/SelfAssessmentPage';
import { RankPage } from './student/RankPage';
import { ResultsPage } from './student/ResultsPage';
import { ScoutingPage } from './student/ScoutingPage';
import { VideoLibraryPage } from './student/VideoLibraryPage';
import { WeightPage } from './student/WeightPage';
import { CoachUpdateInbox } from '../components/CoachUpdateInbox';
import { GymLogoPrompt } from '../components/GymLogoPrompt';
import { ParentApprovals } from '../components/ParentApprovals';
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
  JOURNAL_CLASS_PLACEHOLDER,
  JOURNAL_TECHNIQUE_ROWS,
  searchStudentJournal,
  studentDemoMode,
  studentEditionOpen,
  techniqueDrilledLabel,
  todayIso,
  viewJournalEntry,
  type JournalCardView,
} from '../lib/studentEdition.ts';
import { clearStudentDemoOverlay } from '../lib/studentDemo';
import '../student-edition.css';
import './student/arena.css';
import './student/hub.css';
import './student/progressPages.css';
import './student/beltWeave.css';
import './student/journalPages.css';
import { ProfileReportPage } from './student/ProfileReport';
import { highlightParts, techniqueLineHits, videosForTechnique } from '../lib/journalIndex';
import { pageLabel, paginateJournal } from '../lib/journalPages';
import { TechniqueLines, blankTechniqueLines, techniqueLinesFrom } from './student/TechniqueLines';
import { EMPTY_EXTRAS, MatTimeField, SessionExtras, extrasDraft, extrasFromCard, matTimeLine, type SessionExtrasValue } from './student/MatTime';
import type { JournalSession } from '../lib/progress/types';

function firstTechnique(card: JournalCardView): string {
  return card.techniques.find((item) => item.name.trim())?.name.trim() ?? '';
}

function entryActionLabel(card: JournalCardView): string {
  return journalActionLabel(card.date, firstTechnique(card), card.className);
}

function journalFieldLines(card: JournalCardView): string[] {
  const techniques = card.techniques.filter((item) => item.name.trim());
  const techniqueLines = techniques.length
    ? techniques.flatMap((item, index) => [
        `${techniqueDrilledLabel(index)}: ${item.name}`,
        ...(item.note?.trim() ? [`What I learned: ${item.note.trim()}`] : []),
      ])
    : [`${techniqueDrilledLabel(0)}: —`];
  return [
    ...techniqueLines,
    `${JOURNAL_PARTNERS_LABEL}: ${card.partners || '—'}`,
    `${JOURNAL_DRILLS_LABEL}: ${card.drills || '—'}`,
    `${JOURNAL_ROLLS_LABEL}: ${card.rolls || '—'}`,
    ...(card.howItWent ? [`How it went: ${card.howItWent}`] : []),
    `${JOURNAL_NOTES_LABEL}: ${card.notes || '—'}`,
    `${JOURNAL_STOP_LABEL}: ${card.stopDoing || '—'}`,
  ];
}

function EntrySavedToast({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <p className="journal-toast" role="status" aria-live="polite">
      {JOURNAL_SAVED_TOAST}
    </p>
  );
}

function JournalDateField({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ink journal-date">
      <span className="ink__label">{label}</span>
      <span className="journal-date__value">{formatJournalDate(value)}</span>
      <input aria-label={ariaLabel} type="date" value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

export function StudentEditionPage() {
  const [params] = useSearchParams();
  const path = useLocation().pathname.replace(/\/+$/, '');
  const owner = {
    pro: useProUnlocked(),
    coach: useCoachUnlocked(),
    white: useWhiteUnlocked(),
    student: useStudentEditionUnlocked(),
  };
  const open = studentEditionOpen(params, owner);
  const demo = studentDemoMode(params, owner);
  if (!open) return <StudentClosed />;

  const rest = path.startsWith('/student') ? path.slice('/student'.length).replace(/^\//, '') : '';
  const screen = studentScreenNode(rest);
  return (
    <>
      {demo ? <StudentDemoBanner /> : null}
      <CoachUpdateInbox />
      <GymLogoPrompt />
      <ParentApprovals />
      {screen}
    </>
  );
}

function studentScreenNode(rest: string) {
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
    case 'report':
      return <ProfileReportPage />;
    case 'rank':
      return <RankPage />;
    case 'share':
      return <SharePage />;
    case 'self-assessment':
      return <SelfAssessmentPage />;
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

function StudentDemoBanner() {
  return (
    <div className="student-demo-banner" role="note">
      <p>DEMO MODE. Sample journal on this screen. It is not saved to your real Student Edition.</p>
      <a
        href="/products"
        onClick={() => {
          clearStudentDemoOverlay();
        }}
      >
        Exit demo
      </a>
    </div>
  );
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
            <p>Student Edition opens with a code or a purchase. The demo uses sample data and does not unlock it.</p>
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
  const [params] = useSearchParams();
  const requested = params.get('date') ?? '';
  const [date, setDate] = useState(isIsoDate(requested) ? requested : todayIso());
  const [className, setClassName] = useState('');
  const [session, setSession] = useState<JournalSession>('class');
  const [sessionOther, setSessionOther] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [extras, setExtras] = useState<SessionExtrasValue>(EMPTY_EXTRAS);
  const [techniques, setTechniques] = useState(() => blankTechniqueLines(JOURNAL_TECHNIQUE_ROWS));
  const [partners, setPartners] = useState('');
  const [drills, setDrills] = useState('');
  const [rolls, setRolls] = useState('');
  const [notes, setNotes] = useState('');
  const [stopDoing, setStopDoing] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [savedToast, setSavedToast] = useState(false);

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
          session,
          sessionOther,
          minutes,
          ...extrasDraft(extras, date),
        }),
      );
      const id = next.journal[next.journal.length - 1]?.id ?? '';
      setClassName('');
      setSession('class');
      setSessionOther('');
      setMinutes(0);
      setExtras(EMPTY_EXTRAS);
      setTechniques(blankTechniqueLines(JOURNAL_TECHNIQUE_ROWS));
      setPartners('');
      setDrills('');
      setRolls('');
      setNotes('');
      setStopDoing('');
      setError('');
      setSavedId(id);
      setSavedToast(true);
    } catch (err) {
      setSavedToast(false);
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
            <JournalDateField label="Date" ariaLabel="Date" value={date} onChange={setDate} />
            <label className="ink ink--wobble">
              <span className="ink__label">Class</span>
              <input
                aria-label="Class"
                spellCheck
                autoCorrect="on"
                value={className}
                maxLength={PROGRESS_NAME_MAX}
                placeholder={JOURNAL_CLASS_PLACEHOLDER}
                onChange={(event) => setClassName(event.target.value)}
              />
            </label>
          </div>
          <MatTimeField idPrefix="" session={session} minutes={minutes} onSession={setSession} onMinutes={setMinutes} sessionOther={sessionOther} onSessionOther={setSessionOther} />
          <SessionExtras idPrefix="" report={report} value={extras} onChange={setExtras} />
          <div className="student-split">
            <div className="student-stack">
              <label className="ink">
                <span className="ink__label">{JOURNAL_PARTNERS_LABEL}</span>
                <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={JOURNAL_PARTNERS_LABEL} rows={3} value={partners} onChange={(event) => setPartners(event.target.value)} />
              </label>
              <label className="ink ink--wobble">
                <span className="ink__label">{JOURNAL_DRILLS_LABEL}</span>
                <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={JOURNAL_DRILLS_LABEL} rows={2} value={drills} onChange={(event) => setDrills(event.target.value)} />
              </label>
              <label className="ink">
                <span className="ink__label">{JOURNAL_ROLLS_LABEL}</span>
                <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={JOURNAL_ROLLS_LABEL} rows={2} value={rolls} onChange={(event) => setRolls(event.target.value)} />
              </label>
            </div>
          </div>
          <label className="ink journal-note">
            <span className="ink__label">{JOURNAL_NOTES_LABEL}</span>
            <span className="student-quiet" aria-hidden="true">
              What you drilled and what to remember.
            </span>
            <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={JOURNAL_NOTES_LABEL} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label className="ink ink--wobble journal-note">
            <span className="ink__label">{JOURNAL_STOP_LABEL}</span>
            <span className="student-quiet" aria-hidden="true">
              Mistakes to stop making.
            </span>
            <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={JOURNAL_STOP_LABEL} rows={3} value={stopDoing} onChange={(event) => setStopDoing(event.target.value)} />
          </label>
          <section className="journal-techniques" aria-label="Techniques drilled (optional fundamentals add-on)" data-testid="journal-techniques">
            <h2 className="ink__label journal-techniques__title">Techniques drilled · optional</h2>
            <TechniqueLines idPrefix="" report={report} rows={techniques} onChange={setTechniques} />
          </section>
          {error ? <p role="alert">{error}</p> : null}
          <EntrySavedToast open={savedToast} />
          <div className="student-actions journal-actions">
            <button type="submit" className="ink-btn ink-btn--save">
              Save entry
            </button>
            {savedId ? (
              <Link className="ink-btn ink-btn--wide" to={to(`/student/cards/${savedId}`)}>
                {JOURNAL_SEE_CARD}
              </Link>
            ) : null}
            <Link className="ink-btn ink-btn--wide" to={to('/student/cards')}>
              Add note to an earlier card
            </Link>
          </div>
        </form>
      </div>
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

function JournalList() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const cards = searchStudentJournal(report, query).map(viewJournalEntry);
  const games = matchingGameTags(report.competition, query);
  const results = matchingResults(report.competition, query);
  const lineHits = techniqueLineHits(report.journal, query);
  const videos = videosForTechnique(report, query);
  return (
    <main className="student student-frame student--arena student--cards">
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
          {lineHits.length ? (
            <section className="ink" aria-label="Technique lines">
              <h2 className="ink__label">Technique lines</h2>
              {lineHits.map((hit, index) => (
                <p key={`${hit.entryId}-${index}`}>
                  <Link to={to(`/student/cards/${hit.entryId}?q=${encodeURIComponent(query.trim())}`)}>{formatJournalDate(hit.date)}</Link>
                  {' · '}
                  <Highlighted text={hit.name} query={query} />
                  {hit.note ? (
                    <>
                      {' — What I learned: '}
                      <Highlighted text={hit.note} query={query} />
                    </>
                  ) : null}
                </p>
              ))}
            </section>
          ) : null}
          {videos.length ? (
            <section className="ink" aria-label="Videos for this technique">
              <h2 className="ink__label">Videos</h2>
              {videos.map((clip) => (
                <p key={clip.id}>
                  <a href={clip.url} target="_blank" rel="noreferrer">
                    {clip.description || clip.url}
                  </a>
                </p>
              ))}
            </section>
          ) : null}
          {cards.length === 0 ? <p className="student-quiet">No cards match.</p> : null}
          {cards.map((card) => (
            <article key={card.id} className="ink student-card">
              <Link className="student-card-link" to={to(`/student/cards/${card.id}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)}>
                <strong>
                  {formatJournalDate(card.date)}
                  {card.className ? ` · ${card.className}` : ''}
                </strong>
                {journalFieldLines(card).map((line) => (
                  <span key={line}>
                    <Highlighted text={line} query={query} />
                  </span>
                ))}
                {card.amendments.map((item) =>
                  item.body.trim() ? <span key={item.id}>{item.body.trim()}</span> : null,
                )}
              </Link>
              <div className="student-card__actions">
                <Link className="ink-btn" to={to(`/student/cards/${card.id}?edit=1`)}>
                  {`Edit ${entryActionLabel(card)}`}
                </Link>
                {pendingDelete === card.id ? (
                  <div className="student-card__confirm" role="group" aria-label={`Delete ${entryActionLabel(card)}`}>
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
                    {`Delete ${entryActionLabel(card)}`}
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
      <main className="student student-frame student--arena student--cards">
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
    <main className="student student-frame student--arena student--cards">
      <StudentMarks />
      <LeatherHeader title="Journal card" />
      <div className="student-paper">
        <div className="student-sheet">
          <EntrySavedToast open={saved && !editing} />
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
            <CardBody card={card} query={params.get('q') ?? ''} />
          )}
          <Amendments card={card} />
          <div className="student-card__actions">
            {editing ? null : (
              <Link className="ink-btn" to={to(`/student/cards/${card.id}?edit=1`)}>
                {`Edit ${entryActionLabel(card)}`}
              </Link>
            )}
            {confirmDelete ? (
              <div className="student-card__confirm" role="group" aria-label={`Delete ${entryActionLabel(card)}`}>
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
                {`Delete ${entryActionLabel(card)}`}
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
              <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label="Amendment" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
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

function CardBody({ card, query = '' }: { card: JournalCardView; query?: string }) {
  return (
    <div className="ink">
      <p className="journal-card__when">
        {formatJournalDate(card.date)}
        {card.className ? ` · ${card.className}` : ''}
      </p>
      <p className="journal-card__mat" data-testid="card-mat-time">
        {matTimeLine(card.session, card.minutes, card.sessionOther)}
      </p>
      {card.injury ? <p className="journal-card__mat" data-testid="card-injury">Injury · {card.injury.area || 'unspecified'}{card.injury.note ? ` — ${card.injury.note}` : ''}</p> : null}
      {card.hiatus ? (
        <p className="journal-card__mat" data-testid="card-hiatus">
          {card.hiatus.reason === 'medical' ? 'Medical break' : 'Break'} · {card.hiatus.start}
          {card.hiatus.end ? ` to ${card.hiatus.end}` : ' · ongoing'}
        </p>
      ) : null}
      <JournalPages lines={journalFieldLines(card)} query={query} />
    </div>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="journal-hit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Binder pages: rows flow onto new lined pages when a card overflows. Presentation only. */
function JournalPages({ lines, query }: { lines: string[]; query: string }) {
  const pages = paginateJournal(lines);
  return (
    <div className="binder-pages" data-testid="binder-pages">
      {pages.map((rows, index) => (
        <section key={index} className="binder-page" aria-label={pageLabel(index, pages.length)} data-testid="binder-page">
          <span className="binder-page__holes" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {rows.map((row, at) => (
            <p key={at} className={row.lead ? 'binder-page__row' : 'binder-page__row binder-page__row--cont'}>
              <Highlighted text={row.text} query={query} />
            </p>
          ))}
          <p className="binder-page__number">{pageLabel(index, pages.length)}</p>
        </section>
      ))}
    </div>
  );
}

function Amendments({ card }: { card: JournalCardView }) {
  return (
    <section className="ink" aria-label="Amendments">
      <h2 className="ink__label">Later notes</h2>
      {card.amendments.length === 0 ? <p className="student-quiet">No later notes yet.</p> : null}
      {card.amendments.map((item) => (
        <article key={item.id} className="student-amend">
          <time dateTime={item.date}>{formatJournalDate(item.date)}</time>
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
    session: JournalSession;
    sessionOther: string;
    minutes: number;
  } & ReturnType<typeof extrasDraft>) => void;
}) {
  const { report } = useStudentFile();
  const [extras, setExtras] = useState<SessionExtrasValue>(() => extrasFromCard(card));
  const [date, setDate] = useState(card.date);
  const [className, setClassName] = useState(card.className);
  const [session, setSession] = useState<JournalSession>(card.session);
  const [sessionOther, setSessionOther] = useState(card.sessionOther);
  const [minutes, setMinutes] = useState(card.minutes);
  const [techniques, setTechniques] = useState(() => techniqueLinesFrom(card.techniques, JOURNAL_TECHNIQUE_ROWS));
  const [partners, setPartners] = useState(card.partners);
  const [drills, setDrills] = useState(card.drills);
  const [rolls, setRolls] = useState(card.rolls);
  const [notes, setNotes] = useState(card.notes);
  const [stopDoing, setStopDoing] = useState(card.stopDoing ?? '');
  const [error, setError] = useState('');

  return (
    <form
      className="ink"
      aria-label={`Edit ${entryActionLabel(card)}`}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave({ date, className, techniques, partners, drills, rolls, notes, stopDoing, session, sessionOther, minutes, ...extrasDraft(extras, date) });
          setError('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not save this card.');
        }
      }}
    >
      <div className="student-top">
        <JournalDateField label="Date" ariaLabel="Edit date" value={date} onChange={setDate} />
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
      <MatTimeField idPrefix="Edit " session={session} minutes={minutes} onSession={setSession} onMinutes={setMinutes} sessionOther={sessionOther} onSessionOther={setSessionOther} />
      <SessionExtras idPrefix="Edit " report={report} value={extras} onChange={setExtras} />
      <label className="ink">
        <span className="ink__label">{JOURNAL_PARTNERS_LABEL}</span>
        <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={`Edit ${JOURNAL_PARTNERS_LABEL}`} rows={3} value={partners} onChange={(event) => setPartners(event.target.value)} />
      </label>
      <label className="ink ink--wobble">
        <span className="ink__label">{JOURNAL_DRILLS_LABEL}</span>
        <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={`Edit ${JOURNAL_DRILLS_LABEL}`} rows={2} value={drills} onChange={(event) => setDrills(event.target.value)} />
      </label>
      <label className="ink">
        <span className="ink__label">{JOURNAL_ROLLS_LABEL}</span>
        <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={`Edit ${JOURNAL_ROLLS_LABEL}`} rows={2} value={rolls} onChange={(event) => setRolls(event.target.value)} />
      </label>
      <label className="ink journal-note">
        <span className="ink__label">{JOURNAL_NOTES_LABEL}</span>
        <span className="student-quiet" aria-hidden="true">
          What you drilled and what to remember.
        </span>
        <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={`Edit ${JOURNAL_NOTES_LABEL}`} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="ink ink--wobble journal-note">
        <span className="ink__label">{JOURNAL_STOP_LABEL}</span>
        <span className="student-quiet" aria-hidden="true">
          Mistakes to stop making.
        </span>
        <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={`Edit ${JOURNAL_STOP_LABEL}`} rows={3} value={stopDoing} onChange={(event) => setStopDoing(event.target.value)} />
      </label>
      <section className="journal-techniques" aria-label="Techniques drilled (optional fundamentals add-on)" data-testid="journal-techniques">
        <h2 className="ink__label journal-techniques__title">Techniques drilled · optional</h2>
        <TechniqueLines idPrefix="Edit " report={report} rows={techniques} onChange={setTechniques} />
      </section>
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
