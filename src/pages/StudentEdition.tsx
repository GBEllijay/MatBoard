import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import type { GameTag } from '../lib/progress/types.ts';
import {
  addCustomFundamental,
  addJournalAmendment,
  addJournalEntry,
  classLabel,
  fundamentalsBoard,
  hideFundamental,
  loadStudentReport,
  renameFundamental,
  restoreStarterFundamentals,
  saveStudentReport,
  searchStudentJournal,
  setFundamentalLearned,
  setFundamentalNote,
  studentEditionOpen,
  todayIso,
  viewJournalEntry,
  type ClassKind,
  type FundamentalRow,
  type JournalCardView,
} from '../lib/studentEdition.ts';
import '../student-edition.css';

const GAMES: { tag: GameTag; letter: string }[] = [
  { tag: 'a', letter: 'A' },
  { tag: 'b', letter: 'B' },
  { tag: 'c', letter: 'C' },
];

function useStudentPath() {
  const [params] = useSearchParams();
  const preview = params.get('student') === '1';
  return (path: string) => (preview ? `${path}?student=1` : path);
}

function useStudentFile() {
  const [report, setReport] = useState(() => loadStudentReport(localStorage));
  const commit = (next: ReturnType<typeof loadStudentReport>) => {
    const saved = saveStudentReport(localStorage, next);
    setReport(saved);
    return saved;
  };
  return { report, commit };
}

export function StudentEditionPage() {
  const [params] = useSearchParams();
  const path = useLocation().pathname.replace(/\/+$/, '');
  const open = studentEditionOpen(params, {
    pro: useProUnlocked(),
    coach: useCoachUnlocked(),
    white: useWhiteUnlocked(),
  });
  if (!open) return <StudentClosed />;

  const rest = path.startsWith('/student') ? path.slice('/student'.length).replace(/^\//, '') : '';
  if (rest === 'journal') return <JournalToday />;
  if (rest === 'cards') return <JournalList />;
  if (rest.startsWith('cards/')) return <JournalCardPage id={decodeURIComponent(rest.slice('cards/'.length))} />;
  if (rest === 'fundamentals') return <FundamentalsPage />;
  if (rest === 'calendar') return <ComingNext name="Calendar" />;
  if (rest === 'rubric') return <ComingNext name="Rubric" />;
  return <Cover />;
}

function StudentClosed() {
  return (
    <main className="student student-closed">
      <div className="ink">
        <h1>Jiu-Jitsu Journal</h1>
        <p>This preview opens with the owner unlock, or with ?student=1 on the address.</p>
      </div>
    </main>
  );
}

/** Circle, 24 ticks, and the black pointing figure from advantage-icon.png. No yellow band. */
const MARK_TICKS = [
  { x1: 100, y1: 26, x2: 100, y2: 15 },
  { x1: 119.4, y1: 28.5, x2: 122, y2: 18.2 },
  { x1: 137.3, y1: 35.9, x2: 142.3, y2: 27.2 },
  { x1: 152.6, y1: 47.7, x2: 159.6, y2: 40.7 },
  { x1: 164.1, y1: 62.7, x2: 172.8, y2: 57.7 },
  { x1: 171.5, y1: 80.6, x2: 181.1, y2: 78 },
  { x1: 174, y1: 100, x2: 185, y2: 100 },
  { x1: 171.5, y1: 119.4, x2: 181.1, y2: 122 },
  { x1: 164.1, y1: 137.3, x2: 172.8, y2: 142.3 },
  { x1: 152.6, y1: 152.3, x2: 159.6, y2: 159.3 },
  { x1: 137.3, y1: 164.1, x2: 142.3, y2: 172.8 },
  { x1: 119.4, y1: 171.5, x2: 122, y2: 181.1 },
  { x1: 100, y1: 174, x2: 100, y2: 185 },
  { x1: 80.6, y1: 171.5, x2: 78, y2: 181.1 },
  { x1: 62.7, y1: 164.1, x2: 57.7, y2: 172.8 },
  { x1: 47.7, y1: 152.3, x2: 40.7, y2: 159.3 },
  { x1: 35.9, y1: 137.3, x2: 27.2, y2: 142.3 },
  { x1: 28.5, y1: 119.4, x2: 18.2, y2: 122 },
  { x1: 26, y1: 100, x2: 15, y2: 100 },
  { x1: 28.5, y1: 80.6, x2: 18.2, y2: 78 },
  { x1: 35.9, y1: 62.7, x2: 27.2, y2: 57.7 },
  { x1: 47.7, y1: 47.7, x2: 40.7, y2: 40.7 },
  { x1: 62.7, y1: 35.9, x2: 57.7, y2: 27.2 },
  { x1: 80.6, y1: 28.5, x2: 78, y2: 18.2 },
] as const;

const MARK_FIGURE =
  'M 75.9 50.4 L 71.8 53.4 L 70.7 58.8 L 70.7 64.3 L 72.4 72.5 L 63.3 77.2 L 61.4 79.6 L 59.8 91.1 L 53.2 116.8 L 52.1 129.4 L 53.2 132.2 L 55.7 134.6 L 59 135.2 L 59.8 134.4 L 58.7 133.3 L 59.8 131.1 L 59.2 127.2 L 65.5 110 L 65.8 114.1 L 64.2 121.2 L 62.5 137.6 L 62.5 157.3 L 69.4 160.3 L 77 162 L 79.2 151 L 80.6 154.6 L 81.1 161.7 L 82.5 163.1 L 94.5 163.1 L 95.3 161.7 L 95.3 153 L 98.1 126.7 L 102.5 124.5 L 101.9 116.3 L 98.6 99.3 L 98.6 93.3 L 100.8 85.7 L 102.2 84.3 L 131.7 77.7 L 133.9 74.4 L 136.7 75 L 141 73.9 L 143.2 71.2 L 146 70.6 L 146.8 68.7 L 137.8 70.1 L 129.5 69.5 L 107.1 71.7 L 100.5 71.2 L 98.4 68.4 L 90.2 69.5 L 86.6 66.5 L 87.7 61 L 87.7 55 L 86.6 53.4 L 81.9 50.4 Z';

function AdvantageMark({ header = false }: { header?: boolean }) {
  return (
    <svg className={header ? 'student-mark student-mark--header' : 'student-mark'} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="91" fill="none" stroke="currentColor" />
      {MARK_TICKS.map((tick) => (
        <line key={`${tick.x1}-${tick.y1}`} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="currentColor" strokeLinecap="butt" />
      ))}
      <path d={MARK_FIGURE} fill="currentColor" />
    </svg>
  );
}

function BeltDoodle() {
  return (
    <svg className="student-belt" viewBox="0 0 140 70" aria-hidden="true">
      <path
        d="M8 36c18-16 28-16 40-4 6 6 8 8 14 2 8-8 14-10 22-4 10 8 8 16-2 18-8 2-12-2-16-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M78 28c10 2 22 10 34 8 8-1 16 4 18 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M62 40c8 10 18 14 28 8 4-2 6-8 2-12-6-6-16-2-22 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LeatherHeader({ title = 'Jiu-Jitsu Journal' }: { title?: string }) {
  const to = useStudentPath();
  return (
    <header className="student-leather">
      <AdvantageMark header />
      <h1>{title}</h1>
      <Link className="student-leather__back" to={to('/student')}>
        Cover
      </Link>
    </header>
  );
}

function Cover() {
  const to = useStudentPath();
  const [opened, setOpened] = useState(false);
  if (!opened) {
    return (
      <main className="student student-cover">
        <button type="button" className="student-book" aria-label="Open journal" onClick={() => setOpened(true)}>
          <span className="student-book__pages" aria-hidden="true" />
          <span className="student-book__band" aria-hidden="true" />
          <span className="student-book__ribbon" aria-hidden="true" />
          <span className="student-book__face">
            <AdvantageMark />
            <span className="student-book__edition">Advantage - Student Edition</span>
            <span className="student-book__title">Jiu-Jitsu Journal</span>
          </span>
        </button>
      </main>
    );
  }
  return (
    <main className="student student-frame">
      <LeatherHeader />
      <div className="student-paper">
        <div className="student-sheet">
          <nav className="student-menu" aria-label="Journal">
            <Link to={to('/student/journal')}>Journal</Link>
            <Link to={to('/student/fundamentals')}>Fundamentals</Link>
            <Link to={to('/student/calendar')}>
              Calendar <small>coming next</small>
            </Link>
            <Link to={to('/student/rubric')}>
              Rubric <small>coming next</small>
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}

function JournalToday() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [classKind, setClassKind] = useState<ClassKind>('');
  const [gameTag, setGameTag] = useState<GameTag | ''>('');
  const [techniques, setTechniques] = useState([
    { id: '', name: '' },
    { id: '', name: '' },
  ]);
  const [partners, setPartners] = useState('');
  const [drills, setDrills] = useState('');
  const [rolls, setRolls] = useState('');
  const [notes, setNotes] = useState('');
  const [picker, setPicker] = useState<0 | 1 | null>(null);
  const [error, setError] = useState('');

  const choose = (index: 0 | 1, item: FundamentalRow) => {
    setTechniques((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { id: item.catalogItemId || item.entryId, name: item.label } : slot,
      ),
    );
    setPicker(null);
  };

  const save = () => {
    if (!gameTag) {
      setError('Pick an A, B, or C game.');
      return;
    }
    try {
      const next = commit(
        addJournalEntry(report, {
          date,
          classKind,
          gameTag,
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
      <LeatherHeader />
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
            <div className="ink ink--wobble">
              <span className="ink__label">Class</span>
              <div className="student-class" role="group" aria-label="Class">
                <button type="button" className={classKind === 'gi' ? 'student-choice is-on' : 'student-choice'} aria-pressed={classKind === 'gi'} onClick={() => setClassKind(classKind === 'gi' ? '' : 'gi')}>
                  Gi
                </button>
                <button type="button" className={classKind === 'nogi' ? 'student-choice is-on' : 'student-choice'} aria-pressed={classKind === 'nogi'} onClick={() => setClassKind(classKind === 'nogi' ? '' : 'nogi')}>
                  No-Gi
                </button>
              </div>
            </div>
          </div>
          <div className="student-games" role="group" aria-label="Game">
            {GAMES.map((game) => (
              <button
                key={game.tag}
                type="button"
                className={gameTag === game.tag ? 'game-chip is-on' : 'game-chip'}
                aria-pressed={gameTag === game.tag}
                onClick={() => setGameTag(game.tag)}
              >
                <span className="game-chip__letter">{game.letter}</span>
                game
              </button>
            ))}
          </div>
          <div className="student-split">
            <div className="student-stack">
              {[0, 1].map((index) => (
                <label key={index} className={index === 0 ? 'ink ink--tech' : 'ink ink--wobble ink--tech'}>
                  <span className="ink__label">Technique {index + 1}</span>
                  <input
                    aria-label={`Technique ${index + 1}`}
                    value={techniques[index].name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setTechniques((current) =>
                        current.map((slot, slotIndex) => (slotIndex === index ? { id: slot.name === name ? slot.id : '', name } : slot)),
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="student-pick"
                    aria-label={`Pick technique ${index + 1} from fundamentals`}
                    onClick={() => setPicker(index as 0 | 1)}
                  >
                    Pick
                  </button>
                </label>
              ))}
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
          <div className="student-notes-row">
            <label className="ink ink--wobble">
              <span className="ink__label">Notes</span>
              <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <BeltDoodle />
          </div>
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
        <div className="student-picker" role="dialog" aria-label={`Pick technique ${picker + 1}`}>
          <button type="button" className="ink-btn" onClick={() => setPicker(null)}>
            Close
          </button>
          {fundamentalsBoard(report).map((category) => (
            <section key={category.id}>
              <h2>{category.name}</h2>
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

function JournalList() {
  const to = useStudentPath();
  const { report } = useStudentFile();
  const [query, setQuery] = useState('');
  const cards = searchStudentJournal(report, query).map(viewJournalEntry);
  return (
    <main className="student student-frame">
      <LeatherHeader title="Journal" />
      <div className="student-paper">
        <div className="student-sheet">
          <label className="ink student-search">
            <span className="ink__label">Search</span>
            <input
              aria-label="Search journal"
              value={query}
              placeholder="Technique, note, or later note"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Link className="ink-btn" to={to('/student/journal')}>
            Today’s page
          </Link>
          {cards.length === 0 ? <p className="student-quiet">No cards match.</p> : null}
          {cards.map((card) => (
            <Link key={card.id} className="ink student-card-link" to={to(`/student/cards/${card.id}`)}>
              <strong>
                {card.date}
                {classLabel(card.classKind) ? ` · ${classLabel(card.classKind)}` : ''} · {card.gameTag.toUpperCase()} game
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
        <LeatherHeader />
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
      <LeatherHeader />
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
          {classLabel(card.classKind) ? ` · ${classLabel(card.classKind)}` : ''} · {card.gameTag.toUpperCase()} game
        </p>
        <p>Technique 1: {card.techniques[0]?.name || '—'}</p>
        <p>Technique 2: {card.techniques[1]?.name || '—'}</p>
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

function ComingNext({ name }: { name: string }) {
  return (
    <main className="student student-frame">
      <LeatherHeader title={name} />
      <div className="student-paper">
        <div className="student-sheet">
          <div className="ink">
            <h2 className="ink__label">{name}</h2>
            <p>Coming next. The journal and fundamentals are the first pages.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
