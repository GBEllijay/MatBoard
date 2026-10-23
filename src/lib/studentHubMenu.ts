/**
 * Student Edition hub groups. Old /student/* pages stay on their URLs.
 * This module only decides which group owns a page, and what the hub lists.
 */

import {
  competitionOf,
  countdownLabel,
  daysUntil,
  formatWeightDelta,
  isUpcomingTournament,
  resolvedGoal,
  weightToTarget,
} from './progress/competition.ts';
import type { StudentProgressReport } from './progress/types.ts';

export const TRAINING_GROUP_LABEL = 'Training & Journal';
export const RANK_GROUP_LABEL = 'Rank & Progress';
export const COMPETE_GROUP_LABEL = 'Competitor';
export const COACH_GROUP_LABEL = 'Coach & Academy';
export const BACKUP_GROUP_LABEL = 'Backup & Print';
export const COACH_FILE_LABEL = 'Make a file for my coach';
export const COACH_FILE_HINT = 'This makes a file. You send it yourself.';
export const LOG_TODAY_LABEL = "Log today's class";
export const CLEAR_STUDENT_LABEL = 'Clear all Student Edition data';

export type MenuLink = {
  label: string;
  note: string;
  to: string;
};

export const TRAINING_LINKS: readonly MenuLink[] = [
  { label: "Today's page", note: 'The journal for class', to: '/student/journal' },
  { label: 'Journal cards', note: 'Search your notes', to: '/student/cards' },
  { label: 'Calendar', note: 'Classes, open mats, and tournaments', to: '/student/calendar' },
  { label: 'Video Library', note: 'Technique and drill links', to: '/student/videos' },
];

export const TRAINING_EXTRAS: readonly MenuLink[] = [
  { label: 'Film a move', note: '', to: '/student/videos#student-film-record' },
  { label: 'Log a roll result', note: '', to: '/student/results' },
];

const RANK_LINK: MenuLink = { label: 'My rank', note: 'Belt and stripes', to: '/student/rank' };
const BELT_LINK: MenuLink = { label: 'Belt progress', note: 'Checkpoints and goals', to: '/student/rubric' };
const FUNDAMENTALS_LINK: MenuLink = { label: 'Fundamentals', note: 'Levels', to: '/student/fundamentals' };
const ASSESSMENT_LINK: MenuLink = {
  label: 'Self-assessment',
  note: 'How you are doing',
  to: '/student/competitor?from=progress#self-assessment',
};

/** White and blue, plus kids belts, open Fundamentals first. Purple and up open My rank first. */
const FUNDAMENTALS_FIRST = new Set(['white', 'blue', 'grey', 'yellow', 'orange', 'green']);

export function progressLinks(belt: string): MenuLink[] {
  if (FUNDAMENTALS_FIRST.has(belt)) return [FUNDAMENTALS_LINK, BELT_LINK, RANK_LINK, ASSESSMENT_LINK];
  return [RANK_LINK, BELT_LINK, FUNDAMENTALS_LINK, ASSESSMENT_LINK];
}

export const COMPETE_LINKS: readonly MenuLink[] = [
  { label: 'Upcoming tournaments', note: 'A, B, and C game plan', to: '/student/competitor' },
  { label: 'Weight management', note: 'Weigh-ins and target', to: '/student/weight' },
  {
    label: 'Scouting-Opponent Research and Tracker',
    note: 'Weight class and open class',
    to: '/student/scouting',
  },
  { label: 'Results', note: 'Matches and bracket notes', to: '/student/results' },
  { label: 'Self-assessment', note: 'Shortcut', to: '/student/competitor#self-assessment' },
];

export const COMPETE_EXTRAS: readonly MenuLink[] = [
  { label: 'Calendar', note: 'Tournament dates', to: '/student/calendar' },
];

export const COACH_LINKS: readonly MenuLink[] = [
  { label: 'Connect to my academy', note: 'Scan the academy QR or paste a link', to: '/student/academy' },
  { label: COACH_FILE_LABEL, note: COACH_FILE_HINT, to: '/student/share' },
  { label: 'Import from coach', note: 'A coach plan or feedback file', to: '/student/share#import' },
];

export const BACKUP_LINKS: readonly MenuLink[] = [
  { label: 'Print progress report', note: 'PDF of rank, journal, and competition', to: '/student/print/progress' },
  { label: 'Print self-assessment', note: 'PDF of the seven areas', to: '/student/print/assessment' },
  { label: 'Connections', note: 'Academy folder, personal drive, and backup', to: '/student/connections' },
];

/** Hub rows before this regroup, including the three items folded under Menu. */
export const FORMER_HUB_ITEMS: readonly MenuLink[] = [
  { label: 'Journal', note: "Today's page", to: '/student/journal' },
  { label: 'Journal cards', note: 'Search your notes', to: '/student/cards' },
  { label: 'Fundamentals', note: 'Levels', to: '/student/fundamentals' },
  { label: 'Calendar', note: 'Month and your events', to: '/student/calendar' },
  { label: 'Competitor', note: 'Tournaments and game', to: '/student/competitor' },
  { label: 'Weight', note: 'Weigh-ins and target', to: '/student/weight' },
  { label: 'Results', note: 'Matches and bracket notes', to: '/student/results' },
  { label: 'Scouting-Opponent Research', note: 'Weight class and open class', to: '/student/scouting' },
  { label: 'Video Library', note: 'Technique and drill links', to: '/student/videos' },
  { label: 'My rank', note: 'Belt and stripes', to: '/student/rank' },
  { label: 'Belt progress', note: 'Checkpoints and goals', to: '/student/rubric' },
  { label: 'Connections', note: 'Backup, print, and restore', to: '/student/connections' },
  { label: 'Send to coach', note: 'Progress file', to: '/student/share' },
  { label: 'Import from coach', note: '', to: '/student/share#import' },
  { label: 'Connect to my academy', note: 'Scan the academy QR', to: '/student/academy' },
];

export function groupMenuLinks(belt = 'white'): MenuLink[] {
  return [
    { label: LOG_TODAY_LABEL, note: '', to: '/student/journal' },
    ...TRAINING_LINKS,
    ...TRAINING_EXTRAS,
    ...progressLinks(belt),
    ...COMPETE_LINKS,
    ...COMPETE_EXTRAS,
    ...COACH_LINKS,
    ...BACKUP_LINKS,
    { label: CLEAR_STUDENT_LABEL, note: '', to: '/student/backup/clear' },
  ];
}

/** Path plus hash, ignoring the preview query. */
export function menuDestination(to: string): string {
  const hashAt = to.indexOf('#');
  const hash = hashAt >= 0 ? to.slice(hashAt) : '';
  const before = hashAt >= 0 ? to.slice(0, hashAt) : to;
  return `${before.split('?')[0]}${hash}`;
}

export function formerHubItemReachable(item: MenuLink, links: readonly MenuLink[]): boolean {
  const target = menuDestination(item.to);
  return links.some((link) => menuDestination(link.to) === target);
}

const PAGE_PARENT: Record<string, string> = {
  '/student/training': '/student',
  '/student/progress': '/student',
  '/student/compete': '/student',
  '/student/coach': '/student',
  '/student/backup': '/student',
  '/student/journal': '/student/training',
  '/student/cards': '/student/training',
  '/student/calendar': '/student/training',
  '/student/videos': '/student/training',
  '/student/rank': '/student/progress',
  '/student/rubric': '/student/progress',
  '/student/belt': '/student/progress',
  '/student/fundamentals': '/student/progress',
  '/student/competitor': '/student/compete',
  '/student/weight': '/student/compete',
  '/student/results': '/student/compete',
  '/student/scouting': '/student/compete',
  '/student/academy': '/student/coach',
  '/student/share': '/student/coach',
  '/student/connections': '/student/backup',
  '/student/print/progress': '/student/backup',
  '/student/print/assessment': '/student/backup',
};

/**
 * One level up from a Student Edition page.
 * `preview` is `?student=1` or empty. Card and calendar-day backs are handled
 * before this, because they return to the list rather than the group.
 */
export function studentPageBack(path: string, preview: string, from: string | null): string {
  if (path === '/student/backup/clear') return `/student/backup${preview}`;
  if (path === '/student/competitor' && from === 'progress') return `/student/progress${preview}`;
  const parent = PAGE_PARENT[path];
  if (parent) return `${parent}${preview}`;
  return `/student${preview}`;
}

export type StudentScreen =
  | 'hub'
  | 'training'
  | 'progress'
  | 'compete'
  | 'coach'
  | 'backup'
  | 'backup-clear'
  | 'journal'
  | 'cards'
  | 'card'
  | 'fundamentals'
  | 'calendar'
  | 'calendar-day'
  | 'rubric'
  | 'rank'
  | 'share'
  | 'competitor'
  | 'weight'
  | 'results'
  | 'videos'
  | 'connections'
  | 'academy'
  | 'print-progress'
  | 'print-assessment'
  | 'scouting';

/** Which screen a /student path renders. Unknown paths stay on the hub. */
export function studentScreen(rest: string): StudentScreen {
  if (rest.startsWith('cards/')) return 'card';
  if (rest.startsWith('calendar/')) return 'calendar-day';
  switch (rest) {
    case '':
      return 'hub';
    case 'training':
    case 'progress':
    case 'compete':
    case 'coach':
    case 'backup':
    case 'journal':
    case 'cards':
    case 'fundamentals':
    case 'calendar':
    case 'rank':
    case 'share':
    case 'competitor':
    case 'weight':
    case 'results':
    case 'videos':
    case 'connections':
    case 'academy':
    case 'scouting':
      return rest;
    case 'backup/clear':
      return 'backup-clear';
    case 'rubric':
    case 'belt':
      return 'rubric';
    case 'print/progress':
      return 'print-progress';
    case 'print/assessment':
      return 'print-assessment';
    default:
      return 'hub';
  }
}

/** Routes that existed before the grouped hub. Each one must keep a screen. */
export const LEGACY_STUDENT_RESTS = [
  'journal',
  'cards',
  'cards/card.1',
  'fundamentals',
  'calendar',
  'calendar/2026-10-23',
  'rubric',
  'belt',
  'rank',
  'share',
  'competitor',
  'weight',
  'results',
  'videos',
  'connections',
  'academy',
  'print/progress',
  'print/assessment',
  'scouting',
] as const;

export type CompetitorHubSummary = {
  eventName: string;
  countdown: string;
  weight: string;
  record: string;
  tile: string;
};

function matchRecord(report: StudentProgressReport): { wins: number; losses: number; draws: number } {
  const totals = { wins: 0, losses: 0, draws: 0 };
  for (const result of competitionOf(report).results) {
    for (const match of result.matches) {
      if (match.result === 'win') totals.wins += 1;
      else if (match.result === 'loss') totals.losses += 1;
      else totals.draws += 1;
    }
  }
  return totals;
}

function recordLabel(totals: { wins: number; losses: number; draws: number }): string {
  if (totals.draws) return `${totals.wins}–${totals.losses}–${totals.draws}`;
  return `${totals.wins}–${totals.losses}`;
}

/** Next event, days out, pounds to go, and match record for the Competitor group. */
export function competitorHubSummary(report: StudentProgressReport, today: string): CompetitorHubSummary {
  const competition = competitionOf(report);
  const next = competition.tournaments
    .filter((tournament) => isUpcomingTournament(tournament, today))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))[0];
  const eventName = next?.name.trim() ?? '';
  const days = next ? daysUntil(next.date, today) : null;
  const countdown = days == null ? '' : countdownLabel(days);

  const latest = [...competition.weighIns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  const goal = resolvedGoal(competition, today);
  let weight = '';
  if (latest && goal) {
    const delta = weightToTarget(latest.weight, latest.unit, goal.weight, goal.unit, competition.weightUnit);
    if (delta > 0) weight = `${formatWeightDelta(delta, competition.weightUnit)} to go`;
    else if (delta < 0) weight = `${formatWeightDelta(Math.abs(delta), competition.weightUnit)} under`;
    else weight = 'At target';
  }

  const totals = matchRecord(report);
  const record = recordLabel(totals);
  const hasMatches = totals.wins + totals.losses + totals.draws > 0;
  let tile = 'Tournaments, weight, opponents, and results';
  if (eventName) {
    tile = [eventName, countdown, weight].filter(Boolean).join(' · ');
  } else if (hasMatches) {
    tile = `Record ${record}`;
  }

  return { eventName, countdown, weight, record, tile };
}
