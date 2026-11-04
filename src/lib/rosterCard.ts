/**
 * Coach Clipboard roster card. Pure view helpers shared by the coach card and
 * the student's preview after Save profile.
 *
 * The card shows the current rank only. No next stripe, no percent, no per-stripe dates.
 * Belt achieved is the day the current belt was awarded.
 * Last stripe awarded is the newest dated stripe on that belt, or — with none.
 */

import { currentKidsBelt, beltModeOf } from './beltBook.ts';
import { rosterBeltToProgress } from './coachRankUpdate.ts';
import { emptyRank, emptyTapeDates, rankBeltLabel, wornBeltPreview, type WornBeltPreview } from './studentRank.ts';
import { KIDS_BELTS, canonicalBelt, type Student } from './rosterStore.ts';
import { ASSESSMENT_AREAS, assessmentAverage, type AssessmentAreaId, type AssessmentEntry } from './studentAssessment.ts';
import { RANK_TAPE_MAX, type BeltBook, type ProgressBelt, type RubricCheckpoint, type StudentProgressReport, type StudentRank } from './progress/types.ts';
import type { CoachRankLog } from './rosterCardStore.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const NO_DATE = '—';

/** Just the parts of a Student Edition file the rank dates read. */
export type RankDateSource = {
  profile: { belt: ProgressBelt };
  rank?: StudentRank;
  beltBook?: BeltBook;
};

export function cardDate(iso: string | null | undefined): string {
  const text = (iso ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || !day) return '';
  return `${month} ${day}, ${match[1]}`;
}

function latestDate(dates: readonly (string | undefined)[]): string {
  let best = '';
  for (const raw of dates) {
    const date = (raw ?? '').trim();
    if (DATE_RE.test(date) && date > best) best = date;
  }
  return best;
}

export type PromotionDates = {
  beltLabel: string;
  stripes: number;
  /** YYYY-MM-DD or empty. */
  beltAchievedOn: string;
  /** YYYY-MM-DD or empty. */
  lastStripeOn: string;
};

/**
 * Belt achieved and Last stripe awarded from Student Edition rank data.
 * Adult: `rank.awardedOn`, and the newest of the dated stripes in use
 * (`tapeDates`, plus `highDegreeDates` for black-belt degrees 5 and 6).
 * Kids: the current kids belt on `beltBook.kids`.
 */
export function promotionDates(source: RankDateSource): PromotionDates {
  const report = source as unknown as StudentProgressReport;
  if (beltModeOf(report) === 'kids') {
    const rung = currentKidsBelt(report);
    const count = Math.max(0, rung.tapeCount);
    return {
      beltLabel: rung.label,
      stripes: count,
      beltAchievedOn: DATE_RE.test(rung.awardedOn) ? rung.awardedOn : '',
      lastStripeOn: count ? latestDate(rung.tapeDates.slice(0, count)) : '',
    };
  }
  const rank = source.rank ?? emptyRank();
  const count = Math.max(0, rank.tapeCount);
  const used = rank.tapeDates.slice(0, Math.min(count, RANK_TAPE_MAX));
  const high = count > RANK_TAPE_MAX ? (rank.highDegreeDates ?? []).slice(0, count - RANK_TAPE_MAX) : [];
  return {
    beltLabel: rankBeltLabel(source.profile.belt),
    stripes: count,
    beltAchievedOn: DATE_RE.test(rank.awardedOn) ? rank.awardedOn : '',
    lastStripeOn: count ? latestDate([...used, ...high]) : '',
  };
}

export type DateFacts = {
  beltAchieved: string;
  lastStripe: string;
  /** Under Last stripe awarded when it reads —. */
  lastStripeNote: string;
};

export function dateFacts(dates: PromotionDates): DateFacts {
  const lastStripe = cardDate(dates.lastStripeOn) || NO_DATE;
  return {
    beltAchieved: cardDate(dates.beltAchievedOn) || NO_DATE,
    lastStripe,
    lastStripeNote:
      lastStripe !== NO_DATE ? '' : dates.stripes === 0 ? `No stripes yet on ${dates.beltLabel}` : 'Stripe date not recorded',
  };
}

export function isKidsRosterBelt(belt: string): boolean {
  return (KIDS_BELTS as readonly string[]).includes(canonicalBelt(belt));
}

/**
 * A rank source for a roster student on the coach device.
 * Uses the coach's own belt log when it matches the roster belt.
 */
export function coachRankSource(student: Pick<Student, 'belt' | 'stripes' | 'lastPromotion'>, log?: CoachRankLog): RankDateSource {
  const stripes = Math.max(0, student.stripes ?? 0);
  const matched = log && log.belt === student.belt ? log : undefined;
  const awardedOn = matched ? matched.awardedOn : stripes === 0 && DATE_RE.test(student.lastPromotion) ? student.lastPromotion : '';
  const dates = (matched?.stripeDates ?? []).slice(0, stripes);
  if (isKidsRosterBelt(student.belt)) {
    return {
      profile: { belt: 'white' },
      rank: emptyRank(),
      beltBook: {
        mode: 'kids',
        kids: {
          beltId: canonicalBelt(student.belt).toLowerCase(),
          awardedOn,
          tapeCount: stripes,
          tapeDates: dates,
          history: [],
          classCount: 0,
        },
      },
    };
  }
  const belt = rosterBeltToProgress(student.belt) ?? 'white';
  const tapeDates = emptyTapeDates();
  dates.slice(0, RANK_TAPE_MAX).forEach((date, index) => {
    tapeDates[index] = date;
  });
  return {
    profile: { belt },
    rank: {
      ...emptyRank(),
      awardedOn,
      tapeCount: stripes,
      tapeDates,
      ...(dates.length > RANK_TAPE_MAX ? { highDegreeDates: dates.slice(RANK_TAPE_MAX, RANK_TAPE_MAX + 2) as [string, string] } : {}),
    },
  };
}

/** The existing worn-belt drawing, for any rank source. */
export function cardBelt(source: RankDateSource): WornBeltPreview {
  return wornBeltPreview(source as unknown as StudentProgressReport);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

export type AssessmentRow = { id: AssessmentAreaId; label: string; coach: number | null; self: number | null; gap: number | null };

export type AssessmentSummary = {
  rows: AssessmentRow[];
  coachLatest: AssessmentEntry | null;
  selfLatest: AssessmentEntry | null;
  strengths: string;
  weaknesses: string;
  /** Coach average, first saved → latest. */
  trend: { from: number; to: number; count: number; points: number[] } | null;
};

function latest(entries: readonly AssessmentEntry[]): AssessmentEntry | null {
  let best: AssessmentEntry | null = null;
  for (const entry of entries) if (!best || entry.date >= best.date) best = entry;
  return best;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Table, strengths and weaknesses for the view the coach picked. */
export function assessmentSummary(
  coach: readonly AssessmentEntry[],
  self: readonly AssessmentEntry[],
  view: 'coach' | 'self' | 'both',
): AssessmentSummary {
  const coachLatest = latest(coach);
  const selfLatest = latest(self);
  const rows = ASSESSMENT_AREAS.map((area) => {
    const c = coachLatest?.scores[area.id] ?? null;
    const s = selfLatest?.scores[area.id] ?? null;
    return { id: area.id, label: area.label, coach: c, self: s, gap: c !== null && s !== null ? s - c : null };
  });
  const lead = view === 'self' ? selfLatest : coachLatest ?? (view === 'both' ? selfLatest : null);
  let strengths = '';
  let weaknesses = '';
  if (lead) {
    const scores = ASSESSMENT_AREAS.map((area) => ({ label: area.label, score: lead.scores[area.id] }));
    const max = Math.max(...scores.map((row) => row.score));
    const min = Math.min(...scores.map((row) => row.score));
    strengths = `${scores.filter((row) => row.score === max).map((row) => row.label).join(', ')} (${max})`;
    weaknesses = max === min ? '' : `${scores.filter((row) => row.score === min).map((row) => row.label).join(', ')} (${min})`;
    if (view === 'both') {
      const wide = rows
        .filter((row) => row.gap !== null && row.gap <= -2)
        .sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))[0];
      if (wide) weaknesses = `${weaknesses ? `${weaknesses} · ` : ''}rates ${wide.label} ${Math.abs(wide.gap ?? 0)} lower than coach`;
    }
  }
  const ordered = [...coach].sort((a, b) => a.date.localeCompare(b.date));
  const points = ordered.map((entry) => round1(assessmentAverage(entry.scores)));
  return {
    rows,
    coachLatest,
    selfLatest,
    strengths,
    weaknesses,
    trend: points.length ? { from: points[0], to: points[points.length - 1], count: points.length, points } : null,
  };
}

export type BenchmarkItem = { id: string; name: string; state: 'done' | 'open' | 'student-done' };

/**
 * Practical benchmarks for the current belt.
 * Done is a coach confirm on the coach card, or the student's own mark on the student card.
 * A student mark the coach has not confirmed shows as Student marked done.
 */
export function benchmarkItems(
  rows: readonly RubricCheckpoint[],
  coachChecks: Record<string, boolean> | null,
): { items: BenchmarkItem[]; done: number; total: number } {
  const items = rows.map((row) => {
    const studentDone = row.met === true;
    if (!coachChecks) return { id: row.id, name: row.name, state: studentDone ? 'done' : 'open' } as BenchmarkItem;
    const coachDone = coachChecks[row.id] === true;
    return {
      id: row.id,
      name: row.name,
      state: coachDone ? 'done' : studentDone ? 'student-done' : 'open',
    } as BenchmarkItem;
  });
  return { items, done: items.filter((item) => item.state === 'done').length, total: items.length };
}
