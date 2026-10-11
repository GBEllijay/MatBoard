import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { FUNDAMENTALS_CATALOG } from '../lib/progress/catalog.ts';
import type { GameTag } from '../lib/progress/types.ts';
import {
  addCustomFundamental,
  addJournalAmendment,
  addJournalEntry,
  classLabel,
  fundamentalsBoard,
  loadStudentReport,
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

function StudentClock({ cover = false }: { cover?: boolean }) {
  return (
    <svg className={cover ? 'student-clock student-clock--cover' : 'student-clock'} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
        const inner = 44;
        const outer = 50;
        return (
          <line
            key={index}
            x1={60 + Math.cos(angle) * inner}
            y1={60 + Math.sin(angle) * inner}
            x2={60 + Math.cos(angle) * outer}
            y2={60 + Math.sin(angle) * outer}
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="50" cy="42" r="7" fill="currentColor" />
      <path
        fill="currentColor"
        d="M42 50h16l2 16h-6l1 16h-8l1-16h-8l2-16zm16 4 28-6 3 5-26 8-5-7z"
      />
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
      <StudentClock />
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
          <StudentClock cover />
          <p className="student-book__edition">Advantage - Student Edition</p>
          <p className="student-book__title">Jiu-Jitsu Journal</p>
        </button>
      </main>
    );
  }
  return (
    <main className="student">
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

  const choose = (index: 0 | 1, item: { id: string; name: string }) => {
    setTechniques((current) => current.map((slot, slotIndex) => (slotIndex === index ? { id: item.id, name: item.name } : slot)));
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
    <main className="student">
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
                <label key={index} className={index === 0 ? 'ink' : 'ink ink--wobble'}>
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
            <button type="submit" className="ink-btn">
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
          {FUNDAMENTALS_CATALOG.categories.map((category) => (
            <section key={category.id}>
              <h2>{category.name}</h2>
              {category.items.map((item) => (
                <button key={item.id} type="button" className="student-picker__item" onClick={() => choose(picker, item)}>
                  {item.name}
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
    <main className="student">
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
      <main className="student">
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
    <main className="student">
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
  return (
    <main className="student">
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
                  key={`${item.categoryId}-${item.catalogItemId}-${item.name}`}
                  item={item}
                  onLearn={(learned, date) =>
                    commit(setFundamentalLearned(report, item, learned, date || todayIso()))
                  }
                  onFields={(note, learnedOn) => commit(setFundamentalNote(report, item, note, learnedOn))}
                />
              ))}
              <CustomFundamental
                categoryName={category.name}
                onAdd={(name) => commit(addCustomFundamental(report, category.id, name))}
              />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function FundamentalLine({
  item,
  onLearn,
  onFields,
}: {
  item: FundamentalRow;
  onLearn: (learned: boolean, date: string) => void;
  onFields: (note: string, learnedOn: string) => void;
}) {
  const [date, setDate] = useState(item.learnedOn);
  const [note, setNote] = useState(item.note);
  useEffect(() => {
    setDate(item.learnedOn);
    setNote(item.note);
  }, [item.learnedOn, item.note]);
  const learned = Boolean(item.learnedOn);
  return (
    <div className="student-fund">
      <div className="student-fund__head">
        <span>{item.name}</span>
        <button
          type="button"
          className={learned ? 'student-learned is-on' : 'student-learned'}
          aria-pressed={learned}
          aria-label={learned ? `Learned ${item.name}` : `Mark ${item.name} learned`}
          onClick={() => onLearn(!learned, date)}
        >
          {learned ? 'Learned' : 'Mark learned'}
        </button>
      </div>
      <div className="student-fund__fields">
        <input
          type="date"
          aria-label={`${item.name} date learned`}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          onBlur={() => onFields(note, date)}
        />
        <input
          aria-label={`${item.name} note`}
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
    <main className="student">
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
