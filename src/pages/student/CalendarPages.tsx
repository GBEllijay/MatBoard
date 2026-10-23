import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CalendarKind } from '../../lib/progress/types';
import {
  addCalendarEvent,
  CALENDAR_KIND_CHOICES,
  CALENDAR_REPEAT_CHOICES,
  calendarKindLabel,
  calendarRepeatLabel,
  calendarRepeatOf,
  eventsOnDate,
  GYM_SCHEDULE_STORAGE_KEY,
  isIsoDate,
  journalDates,
  monthGrid,
  readGymSchedule,
  removeCalendarEvent,
} from '../../lib/studentTools';
import { isUpcomingTournament, tournamentStatusLabel, tournamentsOnDate } from '../../lib/progress/competition';
import type { CalendarEvent, CalendarRepeat } from '../../lib/progress/types';
import { formatClassTime } from '../../lib/gymCalendar';
import { rankMarks, rankMarksOnDate } from '../../lib/studentRank';
import { todayIso, viewJournalEntry } from '../../lib/studentEdition';
import { StudentMarks, useStudentFile, useStudentPath } from './chrome';
import './fundamentals.css';
import './calendar.css';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function monthName(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayLabel(iso: string, journal: boolean, event: boolean, tournament: boolean, rank: boolean): string {
  const [year, month, day] = iso.split('-').map(Number);
  const pretty = new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const bits = [pretty];
  if (journal) bits.push('journal entry');
  if (event) bits.push('calendar event');
  if (tournament) bits.push('tournament');
  if (rank) bits.push('belt');
  return bits.join(', ');
}

function CalendarFrame({ children }: { children: ReactNode }) {
  return (
    <main className="student student-frame student--arena student--fundamentals student--calendar">
      <StudentMarks />
      <div className="arena-scroll">
        <header className="arena-hero fund-hero">
          <h1>Calendar</h1>
        </header>
        <div className="fund-stack">{children}</div>
      </div>
    </main>
  );
}

export function CalendarPage() {
  const to = useStudentPath();
  const navigate = useNavigate();
  const { report, commit } = useStudentFile();
  const today = todayIso();
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, month };
  });
  const [date, setDate] = useState(today);
  const [dateKey, setDateKey] = useState(0);
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<CalendarRepeat>('none');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarKind>('class');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [showGym, setShowGym] = useState(false);
  const gym = readGymSchedule(typeof localStorage === 'undefined' ? null : localStorage.getItem(GYM_SCHEDULE_STORAGE_KEY));
  const marked = new Set(journalDates(report));
  const weeks = monthGrid(cursor.year, cursor.month);
  const tournaments = report.competition?.tournaments ?? [];
  const tournamentDays = new Set(tournaments.flatMap((tournament) => [tournament.date, tournament.deadline].filter(Boolean)));
  const rankDays = new Set(rankMarks(report).map((mark) => mark.date));
  const upcoming = tournaments
    .filter((tournament) => isUpcomingTournament(tournament, today))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const openDay = (iso: string) => {
    const hasJournal = marked.has(iso);
    const hasTournament = tournamentDays.has(iso);
    const hasEvent = eventsOnDate(report, iso).length > 0;
    const hasRank = rankDays.has(iso);
    if (!hasJournal && !hasTournament && !hasEvent && !hasRank && iso === today) {
      navigate(to('/student/journal'));
      return;
    }
    navigate(to(`/student/calendar/${iso}`));
  };

  const shift = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  };

  return (
    <CalendarFrame>
      <div className="cal-nav">
        <button type="button" className="ink-btn" onClick={() => shift(-1)}>
          Previous month
        </button>
        <p className="cal-nav__label">{monthName(cursor.year, cursor.month)}</p>
        <button type="button" className="ink-btn" onClick={() => shift(1)}>
          Next month
        </button>
      </div>
      <div className="cal-grid ink" role="group" aria-label={monthName(cursor.year, cursor.month)}>
        {WEEKDAYS.map((name) => (
          <div key={name} className="cal-dow">
            <span className="cal-sr">{name}</span>
            <span aria-hidden="true">{name.slice(0, 1)}</span>
          </div>
        ))}
        {weeks.flat().map((cell) => {
          const hasJournal = marked.has(cell.iso);
          const hasEvent = eventsOnDate(report, cell.iso).length > 0;
          return cell.inMonth ? (
            <button
              key={cell.iso}
              type="button"
              className={`cal-day${cell.iso === today ? ' is-today' : ''}${hasJournal ? ' has-journal' : ''}${tournamentDays.has(cell.iso) ? ' has-tournament' : ''}${rankDays.has(cell.iso) ? ' has-rank' : ''}`}
              aria-current={cell.iso === today ? 'date' : undefined}
              aria-label={dayLabel(cell.iso, hasJournal, hasEvent, tournamentDays.has(cell.iso), rankDays.has(cell.iso))}
              data-journal={hasJournal ? 'true' : 'false'}
              data-tournament={tournamentDays.has(cell.iso) ? 'true' : 'false'}
              data-rank={rankDays.has(cell.iso) ? 'true' : 'false'}
              onClick={() => openDay(cell.iso)}
            >
              <span>{cell.day}</span>
              <span className="cal-marks">
                {hasJournal && !hasEvent ? <span className="cal-dot" /> : null}
                {hasEvent ? <span className="cal-dot cal-dot--event" /> : null}
                {hasJournal && hasEvent ? <span className="cal-dot cal-dot--journal" /> : null}
                {tournamentDays.has(cell.iso) ? <span className="cal-dot cal-dot--tournament" /> : null}
                {rankDays.has(cell.iso) ? <span className="cal-dot cal-dot--rank" /> : null}
              </span>
            </button>
          ) : (
            <span key={cell.iso} className="cal-day cal-day--out" aria-hidden="true">
              {cell.day}
            </span>
          );
        })}
      </div>
      <p className="student-quiet">
        A filled dot is a journal entry. An open dot is another event. A red ring is a tournament. A blue square is a belt date from My rank. Tap a day to open that day’s cards, or start today’s page.
      </p>
      {upcoming.length ? (
        <section className="ink" aria-label="Tournaments">
          <h2 className="ink__label">Tournaments</h2>
          <ul className="comp-list">
            {upcoming.map((tournament) => (
              <li key={tournament.id}>
                <Link to={to(`/student/calendar/${tournament.date}`)}>
                  {tournamentStatusLabel(tournament.status)} · {tournament.name}
                  {tournament.division ? ` · ${tournament.division}` : ''}
                </Link>
                <span>
                  {tournament.date}
                  {tournament.location ? ` · ${tournament.location}` : ''}
                  {tournament.deadline ? ` · register by ${tournament.deadline}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <Link className="ink-btn" to={to('/student/competitor')}>
            Competitor page
          </Link>
        </section>
      ) : null}
      {gym ? (
        <label className="ink cal-gym-toggle">
          <input type="checkbox" checked={showGym} onChange={(event) => setShowGym(event.target.checked)} />
          <span>Show gym class schedule</span>
        </label>
      ) : null}
      {showGym && gym ? (
        <section className="ink" aria-label="Gym class schedule">
          <h2 className="ink__label">Gym class schedule</h2>
          <p className="student-quiet">Read-only. This stays on the gym schedule. It is not saved in your progress file.</p>
          <ul className="cal-gym">
            {gym.hints.map((hint) => (
              <li key={hint.id}>{hint.label}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <form
        className="ink"
        onSubmit={(event) => {
          event.preventDefault();
          const picked = inputValue(event.currentTarget, 'event-date');
          const nextDate = isIsoDate(picked) ? picked : date;
          try {
            commit(addCalendarEvent(report, { date: nextDate, title, kind, note, time, repeat }));
            setTitle('');
            setNote('');
            setTime('');
            setRepeat('none');
            setDate(todayIso());
            setDateKey((value) => value + 1);
            setError('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add that event.');
          }
        }}
      >
        <h2 className="ink__label">Add an event</h2>
        <label>
          <span className="ink__label">Date</span>
          <input
            key={dateKey}
            type="date"
            name="event-date"
            aria-label="Event date"
            autoComplete="off"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label>
          <span className="ink__label">Time</span>
          <input type="time" aria-label="Event time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <div className="student-games" role="group" aria-label="Repeat">
          {CALENDAR_REPEAT_CHOICES.map((choice) => (
            <button
              key={choice.repeat}
              type="button"
              className={repeat === choice.repeat ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={repeat === choice.repeat}
              onClick={() => setRepeat(choice.repeat)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <label>
          <span className="ink__label">Title</span>
          <input aria-label="Event title" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <div className="student-games" role="group" aria-label="Event kind">
          {CALENDAR_KIND_CHOICES.map((choice) => (
            <button
              key={choice.kind}
              type="button"
              className={kind === choice.kind ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={kind === choice.kind}
              onClick={() => setKind(choice.kind)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <label>
          <span className="ink__label">Note</span>
          <input aria-label="Event note" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="ink-btn ink-btn--save">
          Add event
        </button>
      </form>
    </CalendarFrame>
  );
}

export function CalendarDayPage({ date }: { date: string }) {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarKind>('training');
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<CalendarRepeat>('none');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (!isIsoDate(date)) {
    return (
      <CalendarFrame>
        <p className="student-quiet">That day is not on the calendar.</p>
      </CalendarFrame>
    );
  }
  const cards = entriesFor(report, date);
  const events = eventsOnDate(report, date);
  const tournaments = tournamentsOnDate(report.competition?.tournaments ?? [], date);
  const ranks = rankMarksOnDate(report, date);
  const today = date === todayIso();
  return (
    <CalendarFrame>
      <p className="cal-nav__label cal-day-title">{dayLabel(date, cards.length > 0, events.length > 0, tournaments.length > 0, ranks.length > 0)}</p>
      {ranks.length ? (
        <section className="ink" aria-label="My rank">
          <h2 className="ink__label">My rank</h2>
          <ul className="comp-list">
            {ranks.map((mark) => (
              <li key={`${mark.date}-${mark.label}`}>{mark.label}</li>
            ))}
          </ul>
          <Link className="ink-btn" to={to('/student/rank')}>
            My rank
          </Link>
        </section>
      ) : null}
      {tournaments.length ? (
        <section className="ink" aria-label="Tournaments">
          <h2 className="ink__label">Tournaments</h2>
          <ul className="comp-list">
            {tournaments.map((tournament) => (
              <li key={tournament.id}>
                <strong>
                  {tournament.date === date ? tournamentStatusLabel(tournament.status) : 'Registration deadline'} · {tournament.name}
                </strong>
                <span>
                  {[tournament.location, tournament.division].filter(Boolean).join(' · ')}
                  {tournament.deadline && tournament.deadline !== tournament.date ? ` · register by ${tournament.deadline}` : ''}
                </span>
                {tournament.link ? (
                  <a href={tournament.link} target="_blank" rel="noopener noreferrer">
                    {tournament.link}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <Link className="ink-btn" to={to('/student/competitor')}>
            Competitor page
          </Link>
        </section>
      ) : null}
      {cards.length === 0 ? <p className="student-quiet">No journal card on this day.</p> : null}
      {cards.map((card) => (
        <Link key={card.id} className="ink student-card-link" to={to(`/student/cards/${card.id}`)}>
          <strong>
            {card.gameTag.toUpperCase()} game
            {card.techniques.map((item) => item.name).filter(Boolean).length
              ? ` · ${card.techniques.map((item) => item.name).filter(Boolean).join(', ')}`
              : ''}
          </strong>
          <span>{card.notes || 'Empty notes'}</span>
        </Link>
      ))}
      <Link className="ink-btn" to={to(today ? '/student/journal' : `/student/journal?date=${date}`)}>
        {today ? "Start today's page" : 'Start a card for this day'}
      </Link>
      {events.length ? (
        <ul className="cal-events">
          {events.map((event) => (
            <li key={event.id} className="ink">
              <strong>
                {calendarKindLabel(event.kind)} · {event.title}
              </strong>
              {eventDetail(event) ? <span>{eventDetail(event)}</span> : null}
              <button
                type="button"
                className="ink-btn"
                aria-label={`Remove ${event.title}`}
                onClick={() => commit(removeCalendarEvent(report, event.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="ink"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            commit(addCalendarEvent(report, { date, title, kind, note, time, repeat }));
            setTitle('');
            setNote('');
            setTime('');
            setRepeat('none');
            setError('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add that event.');
          }
        }}
      >
        <h2 className="ink__label">Add an event</h2>
        <label>
          <span className="ink__label">Title</span>
          <input aria-label="Event title" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          <span className="ink__label">Time</span>
          <input type="time" aria-label="Event time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <div className="student-games" role="group" aria-label="Repeat">
          {CALENDAR_REPEAT_CHOICES.map((choice) => (
            <button
              key={choice.repeat}
              type="button"
              className={repeat === choice.repeat ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={repeat === choice.repeat}
              onClick={() => setRepeat(choice.repeat)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className="student-games" role="group" aria-label="Event kind">
          {CALENDAR_KIND_CHOICES.map((choice) => (
            <button
              key={choice.kind}
              type="button"
              className={kind === choice.kind ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={kind === choice.kind}
              onClick={() => setKind(choice.kind)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <label>
          <span className="ink__label">Note</span>
          <input aria-label="Event note" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="ink-btn ink-btn--save">
          Add event
        </button>
      </form>
    </CalendarFrame>
  );
}

function inputValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : '';
}

function eventDetail(event: CalendarEvent): string {
  const bits: string[] = [];
  if (event.time) bits.push(formatClassTime(event.time));
  const repeat = calendarRepeatOf(event);
  if (repeat !== 'none') bits.push(`${calendarRepeatLabel(repeat)} from ${event.date}`);
  if (event.note) bits.push(event.note);
  return bits.join(' · ');
}

function entriesFor(report: ReturnType<typeof useStudentFile>['report'], date: string) {
  return report.journal.filter((entry) => entry.date === date).map(viewJournalEntry);
}
