/**
 * Competition card v1: numbers drawn from data the Competitor Roster already holds
 * (the card itself and the imported student progress file). Nothing here saves.
 */
import type { ImportedCompetitionPlan } from './progress/competition';
import type { MatchMethod, StudentTournament } from './progress/types';

export type CompetitionRecord = {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  /** Whole percent of decided and drawn matches won. Null with no matches. */
  winRate: number | null;
  /** How the matches ended, most first. */
  methods: { method: Exclude<MatchMethod, ''> | 'other'; label: string; wins: number; losses: number }[];
};

export const METHOD_LABELS: Record<Exclude<MatchMethod, ''> | 'other', string> = {
  sub: 'Submission',
  points: 'Points',
  advantage: 'Advantage',
  dq: 'DQ',
  other: 'Not noted',
};

export function competitionRecord(plan: ImportedCompetitionPlan | null | undefined): CompetitionRecord {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const methods = new Map<keyof typeof METHOD_LABELS, { wins: number; losses: number }>();
  for (const result of plan?.results ?? []) {
    for (const match of result.matches) {
      if (match.result === 'win') wins += 1;
      else if (match.result === 'loss') losses += 1;
      else draws += 1;
      if (match.result === 'draw') continue;
      const key = (match.method || 'other') as keyof typeof METHOD_LABELS;
      const row = methods.get(key) ?? { wins: 0, losses: 0 };
      if (match.result === 'win') row.wins += 1;
      else row.losses += 1;
      methods.set(key, row);
    }
  }
  const total = wins + losses + draws;
  return {
    wins,
    losses,
    draws,
    total,
    winRate: total ? Math.round((wins / total) * 100) : null,
    methods: [...methods.entries()]
      .map(([method, row]) => ({ method, label: METHOD_LABELS[method], ...row }))
      .sort((a, b) => b.wins + b.losses - (a.wins + a.losses)),
  };
}

/** Upcoming events, soonest first. Entered (registered) before Considering on the same day. */
export function upcomingTournaments(plan: ImportedCompetitionPlan | null | undefined, today: string): StudentTournament[] {
  return [...(plan?.tournaments ?? [])]
    .filter((row) => row.date >= today || Boolean(row.deadline && row.deadline >= today))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.status === b.status ? 0 : a.status === 'entered' ? -1 : 1));
}

export type OpponentLine = { opponent: string; wins: number; losses: number; draws: number; last: string };

/** Scouting from existing data: everyone this competitor has faced, with the record against them. */
export function opponentsFaced(plan: ImportedCompetitionPlan | null | undefined): OpponentLine[] {
  const rows = new Map<string, OpponentLine>();
  for (const result of plan?.results ?? []) {
    for (const match of result.matches) {
      const name = match.opponent.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const row = rows.get(key) ?? { opponent: name, wins: 0, losses: 0, draws: 0, last: '' };
      if (match.result === 'win') row.wins += 1;
      else if (match.result === 'loss') row.losses += 1;
      else row.draws += 1;
      row.last = result.tournamentName;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

/** Latest weigh-in, or null. */
export function latestWeighIn(plan: ImportedCompetitionPlan | null | undefined) {
  const rows = [...(plan?.weighIns ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return rows[0] ?? null;
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** An all-day calendar file for the upcoming events. Saved on this phone; nothing is sent. */
export function tournamentsIcs(name: string, rows: readonly StudentTournament[], stamp = new Date()): string {
  const now = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = rows
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .map((row) => {
      const start = row.date.replace(/-/g, '');
      const next = new Date(`${row.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const end = next.toISOString().slice(0, 10).replace(/-/g, '');
      return [
        'BEGIN:VEVENT',
        `UID:${row.id}@advantage.local`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsText(`${name}: ${row.name}`)}`,
        row.location ? `LOCATION:${icsText(row.location)}` : '',
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n');
    });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Advantage//Competition card//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}
