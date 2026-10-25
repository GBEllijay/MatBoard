/**
 * Competitor, Calendar, and Results share one tournament list.
 * The list lives on `competition.tournaments`.
 * A tournament also has one calendar event (kind `other`, the Tournament choice)
 * so its day, time, and repeat stay on the calendar.
 * Classes, open mats, and promotion tests stay calendar-only.
 * Older files that stored the same meet in both places collapse on load.
 */

import { competitionOf } from './progress/competition.ts';
import {
  PROGRESS_CALENDAR_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_TOURNAMENTS_MAX,
  type CalendarEvent,
  type CalendarRepeat,
  type StudentProgressReport,
  type StudentTournament,
} from './progress/types.ts';

export type TournamentEventDraft = {
  date: string;
  title: string;
  note: string;
  time: string;
  repeat: CalendarRepeat;
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameMeet(tournament: StudentTournament, title: string, date: string): boolean {
  return Boolean(tournament.date) && tournament.date === date && norm(tournament.name) === norm(title);
}

function fitId(raw: string, used: Set<string>): string {
  let id = raw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
  if (!id || !/^[A-Za-z0-9]/.test(id)) id = `x${id}`.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  for (let n = 2; n < 10000; n += 1) {
    const suffix = `.${n}`;
    const next = `${id.slice(0, 80 - suffix.length)}${suffix}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  const fallback = `t${Date.now().toString(36)}`.slice(0, 80);
  used.add(fallback);
  return fallback;
}

function calendarEventSame(left: CalendarEvent, right: CalendarEvent): boolean {
  return (
    left.id === right.id &&
    left.date === right.date &&
    left.title === right.title &&
    left.kind === right.kind &&
    left.note === right.note &&
    left.time === right.time &&
    left.repeat === right.repeat &&
    left.tournamentId === right.tournamentId
  );
}

/** A kind-other event that belongs to this tournament and not to a same-day sibling. */
export function eventTargetsTournament(
  event: CalendarEvent,
  tournament: StudentTournament,
  others: readonly StudentTournament[],
): boolean {
  if (event.kind !== 'other') return false;
  if (event.tournamentId) return event.tournamentId === tournament.id;
  if (!sameMeet(tournament, event.title, event.date)) return false;
  return !others.some((other) => sameMeet(other, tournament.name, tournament.date));
}

/**
 * Hide the linked Tournament event on a day that already shows that tournament,
 * including its registration deadline. Repeat days still show the event.
 */
export function eventHiddenBehindTournament(
  event: CalendarEvent,
  tournaments: readonly StudentTournament[],
  iso: string,
): boolean {
  if (event.kind !== 'other') return false;
  return tournaments.some((tournament) => {
    if (tournament.date !== iso && tournament.deadline !== iso) return false;
    return eventTargetsTournament(
      event,
      tournament,
      tournaments.filter((other) => other.id !== tournament.id),
    );
  });
}

export function linkedCalendarEvent(report: StudentProgressReport, tournament: StudentTournament): CalendarEvent | undefined {
  const others = (report.competition?.tournaments ?? []).filter((other) => other.id !== tournament.id);
  return report.calendar.find((event) => eventTargetsTournament(event, tournament, others));
}

export function tournamentMatchingName(report: StudentProgressReport, title: string, date: string): StudentTournament | undefined {
  return competitionOf(report).tournaments.find((tournament) => sameMeet(tournament, title, date));
}

function linkEvent(event: CalendarEvent, tournament: StudentTournament): CalendarEvent {
  const note = event.note.trim() ? event.note : tournament.location;
  const next: CalendarEvent = {
    ...event,
    title: tournament.name,
    date: tournament.date,
    note,
    tournamentId: tournament.id,
  };
  return calendarEventSame(event, next) ? event : next;
}

function mergeEventDetails(kept: CalendarEvent, extra: CalendarEvent): CalendarEvent {
  const notes = [kept.note.trim()];
  const extraNote = extra.note.trim();
  if (extraNote && extraNote !== notes[0] && !notes[0].includes(extraNote)) notes.push(extraNote);
  let time = kept.time;
  if (!time && extra.time) time = extra.time;
  else if (time && extra.time && time !== extra.time && !notes.some((note) => note.includes(extra.time ?? ''))) notes.push(extra.time);
  let repeat = kept.repeat;
  if (!repeat && extra.repeat) repeat = extra.repeat;
  else if (repeat && extra.repeat && repeat !== extra.repeat && !notes.some((note) => note.includes(extra.repeat ?? ''))) {
    notes.push(extra.repeat);
  }
  const note = notes.filter(Boolean).join(' · ').slice(0, PROGRESS_NOTE_MAX);
  const next: CalendarEvent = { ...kept, note };
  if (time) next.time = time;
  else delete next.time;
  if (repeat) next.repeat = repeat;
  else delete next.repeat;
  return calendarEventSame(kept, next) ? kept : next;
}

function tournamentFromEvent(event: CalendarEvent, id: string, unit: StudentTournament['targetUnit']): StudentTournament {
  return {
    id,
    name: event.title.trim().slice(0, PROGRESS_NAME_MAX),
    date: event.date,
    location: event.note.trim().slice(0, PROGRESS_NOTE_MAX),
    division: '',
    weightClass: '',
    deadline: '',
    link: '',
    status: 'considering',
    targetWeight: null,
    targetUnit: unit,
    goals: [],
  };
}

/**
 * One tournament per saved meet, plus one linked calendar event.
 * A second copy with the same name and date is folded in.
 * Goals, division, weight, results, and unrelated events stay.
 * Returns the same report when nothing has to change.
 */
export function shareTournaments(report: StudentProgressReport): StudentProgressReport {
  const competition = competitionOf(report);
  let tournaments = competition.tournaments;
  const calendar: CalendarEvent[] = [];
  let changed = false;
  const usedIds = new Set<string>([...tournaments.map((tournament) => tournament.id), ...report.calendar.map((event) => event.id)]);
  const keptFor = new Map<string, CalendarEvent>();

  const remember = (tournament: StudentTournament) => {
    if (tournaments.some((item) => item.id === tournament.id)) {
      tournaments = tournaments.map((item) => (item.id === tournament.id ? tournament : item));
    } else {
      tournaments = [...tournaments, tournament];
    }
  };

  for (const event of report.calendar) {
    const titled = event.kind === 'other' && event.title.trim() && event.date;
    if (!titled) {
      calendar.push(event);
      continue;
    }
    let tournament = event.tournamentId ? tournaments.find((item) => item.id === event.tournamentId) : undefined;
    if (!tournament) tournament = tournaments.find((item) => !keptFor.has(item.id) && sameMeet(item, event.title, event.date));
    const alreadyKept = tournament ? keptFor.get(tournament.id) : undefined;
    if (!tournament || alreadyKept) {
      const taken = tournament ?? tournaments.find((item) => keptFor.has(item.id) && sameMeet(item, event.title, event.date));
      if (taken) {
        const kept = keptFor.get(taken.id);
        if (kept) {
          const merged = mergeEventDetails(kept, event);
          if (merged !== kept) {
            const index = calendar.indexOf(kept);
            if (index >= 0) calendar[index] = merged;
            keptFor.set(taken.id, merged);
          }
          if (!taken.location.trim() && merged.note.trim()) {
            remember({ ...taken, location: merged.note.trim().slice(0, PROGRESS_NOTE_MAX) });
          }
        }
        changed = true;
        continue;
      }
      if (tournaments.length >= PROGRESS_TOURNAMENTS_MAX) {
        calendar.push(event);
        continue;
      }
      const id = fitId(`t.${event.id}`, usedIds);
      tournament = tournamentFromEvent(event, id, competition.weightUnit === 'kg' ? 'kg' : 'lb');
      remember(tournament);
      changed = true;
    } else if (!tournament.location.trim() && event.note.trim()) {
      tournament = { ...tournament, location: event.note.trim().slice(0, PROGRESS_NOTE_MAX) };
      remember(tournament);
      changed = true;
    }

    const linked = linkEvent(event, tournament);
    if (linked !== event) changed = true;
    calendar.push(linked);
    keptFor.set(tournament.id, linked);
  }

  for (const tournament of tournaments) {
    if (keptFor.has(tournament.id)) continue;
    if (calendar.length >= PROGRESS_CALENDAR_MAX) break;
    const id = fitId(`e.${tournament.id}`, usedIds);
    const event: CalendarEvent = {
      id,
      date: tournament.date,
      title: tournament.name,
      kind: 'other',
      note: tournament.location,
      tournamentId: tournament.id,
    };
    calendar.push(event);
    keptFor.set(tournament.id, event);
    changed = true;
  }

  if (!changed) return report;
  return {
    ...report,
    calendar,
    competition: { ...competition, tournaments },
  };
}

/** Write the calendar form onto the shared tournament event. One name and date stays one tournament. */
export function applyTournamentEventDraft(
  report: StudentProgressReport,
  draft: TournamentEventDraft,
  now: number,
): StudentProgressReport {
  const shared = shareTournaments(report);
  const tournament = tournamentMatchingName(shared, draft.title, draft.date);
  if (!tournament) return shared;
  let changed = false;
  const calendar = shared.calendar.map((event) => {
    if (event.kind !== 'other') return event;
    if (event.tournamentId !== tournament.id && !sameMeet(tournament, event.title, event.date)) return event;
    const next: CalendarEvent = {
      ...event,
      title: tournament.name,
      date: tournament.date,
      note: draft.note,
      tournamentId: tournament.id,
    };
    if (draft.time) next.time = draft.time;
    if (draft.repeat !== 'none') next.repeat = draft.repeat;
    else delete next.repeat;
    if (!calendarEventSame(event, next)) changed = true;
    return next;
  });
  if (!changed) return shared;
  return { ...shared, updatedAt: now, calendar };
}
