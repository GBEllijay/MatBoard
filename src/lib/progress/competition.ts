/**
 * Competition section of a student progress file.
 * Tournaments, the standing A/B/C game, and weigh-ins stay in the progress JSON.
 * Advantage does not host them.
 */

import {
  GAME_TAGS,
  PROGRESS_CLIP_URL_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_SEQUENCE_MAX,
  type CompetitionGame,
  type CompetitionGames,
  type GameTag,
  type JournalEntry,
  type StudentCompetition,
  type StudentProgressReport,
  type CompetitionResult,
  type ProgressBelt,
  type RankHistory,
  type RankTapeDates,
  type StudentTournament,
  type WeighIn,
  type WeightUnit,
} from './types.ts';

export const LB_PER_KG = 2.2046226218;

export function emptyGame(): CompetitionGame {
  return { techniques: '', notes: '' };
}

export function emptyGames(): CompetitionGames {
  return { a: emptyGame(), b: emptyGame(), c: emptyGame() };
}

export function emptyCompetition(): StudentCompetition {
  return {
    games: emptyGames(),
    tournaments: [],
    weighIns: [],
    results: [],
    weightUnit: 'lb',
    goalWeight: null,
    goalUnit: 'lb',
    weighDate: '',
  };
}

export function competitionOf(report: { competition?: StudentCompetition }): StudentCompetition {
  const competition = report.competition;
  if (!competition) return emptyCompetition();
  return {
    ...emptyCompetition(),
    ...competition,
    games: competition.games ?? emptyGames(),
    tournaments: competition.tournaments ?? [],
    weighIns: competition.weighIns ?? [],
    results: competition.results ?? [],
    weightUnit: competition.weightUnit === 'kg' ? 'kg' : 'lb',
    goalWeight: competition.goalWeight ?? null,
    goalUnit: competition.goalUnit === 'kg' ? 'kg' : 'lb',
    weighDate: competition.weighDate ?? '',
  };
}

/** Empty is allowed. Anything else must be an http or https link. */
export function cleanOptionalLink(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (text.length > PROGRESS_CLIP_URL_MAX) throw new Error('That link is too long.');
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('Use an http or https link.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Use an http or https link.');
  return text;
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function notesFromJournalBody(body: string): string {
  const lines = body.split('\n');
  const notesAt = lines.findIndex((row) => row === 'Notes:' || row.startsWith('Notes:'));
  if (notesAt >= 0) return lines.slice(notesAt + 1).join('\n').trim();
  if (
    lines.some(
      (row) =>
        row.startsWith('Class:') ||
        row.startsWith('Techniques:') ||
        row.startsWith('Technique drilled #') ||
        row.startsWith('Training partners:'),
    )
  ) {
    return '';
  }
  return body.trim();
}

function techniquesFromEntry(entry: JournalEntry): string {
  const names = entry.techniqueRefs.map((ref) => ref.name.trim()).filter(Boolean);
  if (names.length) return names.join('; ');
  const drilled = entry.body
    .split('\n')
    .filter((row) => row.startsWith('Technique drilled #'))
    .map((row) => row.replace(/^Technique drilled #\d+:\s*/, '').trim())
    .filter(Boolean);
  if (drilled.length) return drilled.join('; ');
  const line = entry.body.split('\n').find((row) => row.startsWith('Techniques:'));
  return line ? line.slice('Techniques:'.length).trim() : '';
}

/**
 * Version 1 files stored A/B/C only as a tag on each journal card.
 * The newest card for each letter becomes the standing game when the file has no competition section.
 */
export function seedGamesFromJournal(journal: readonly JournalEntry[]): CompetitionGames {
  const games = emptyGames();
  const sorted = [...journal].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  for (const tag of GAME_TAGS) {
    const entry = sorted.find((item) => item.gameTag === tag);
    if (!entry) continue;
    games[tag] = {
      techniques: clip(techniquesFromEntry(entry), PROGRESS_SEQUENCE_MAX),
      notes: clip(notesFromJournalBody(entry.body), PROGRESS_NOTE_MAX),
    };
  }
  return games;
}

export function gameLetter(tag: GameTag): string {
  return tag.toUpperCase();
}

export function tournamentStatusLabel(status: StudentTournament['status']): string {
  return status === 'entered' ? 'Entered' : 'Considering';
}

export function weightUnitLabel(unit: WeightUnit): string {
  return unit === 'kg' ? 'kg' : 'lb';
}

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight;
  const pounds = from === 'lb' ? weight : weight * LB_PER_KG;
  const value = to === 'lb' ? pounds : pounds / LB_PER_KG;
  return Math.round(value * 10) / 10;
}

export function formatWeight(weight: number, unit: WeightUnit): string {
  const rounded = Math.round(weight * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${weightUnitLabel(unit)}`;
}

export function gameHaystack(tag: GameTag, game: CompetitionGame): string {
  return `${tag} game\n${game.techniques}\n${game.notes}`.toLowerCase();
}

export function matchingGameTags(competition: StudentCompetition | undefined, query: string): GameTag[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !competition) return [];
  return GAME_TAGS.filter((tag) => gameHaystack(tag, competition.games[tag]).includes(needle));
}

/** Tournament, division, opponents, result, method, match notes, and filled-in bracket names. */
export function resultHaystack(result: CompetitionResult): string {
  return [
    result.tournamentName,
    result.division,
    ...result.matches.flatMap((match) => [match.opponent, match.result, match.method, match.note]),
    ...result.bracket.map((note) => note.name),
  ]
    .join('\n')
    .toLowerCase();
}

export function matchingResults(
  competition: StudentCompetition | undefined,
  query: string,
): CompetitionResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !competition) return [];
  return (competition.results ?? []).filter((result) => resultHaystack(result).includes(needle));
}

/** Coach lookup: opponent, tournament name, or method. */
export function coachResultHaystack(result: CompetitionResult): string {
  return [result.tournamentName, ...result.matches.flatMap((match) => [match.opponent, match.method])]
    .join('\n')
    .toLowerCase();
}

export function planMatchesCoachResultQuery(
  plan: { results?: readonly CompetitionResult[] } | undefined,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle || !plan) return false;
  return (plan.results ?? []).some((result) => coachResultHaystack(result).includes(needle));
}

export function tournamentHaystack(tournament: StudentTournament): string {
  return [
    tournament.name,
    tournament.date,
    tournament.location,
    tournament.division,
    tournament.deadline,
    tournament.link,
    tournament.status,
    tournamentStatusLabel(tournament.status),
    tournament.targetWeight == null ? '' : String(tournament.targetWeight),
    tournament.targetUnit,
    ...tournament.goals.flatMap((goal) => [goal.name, goal.note]),
  ]
    .join('\n')
    .toLowerCase();
}

export function weighInHaystack(weighIn: WeighIn): string {
  return [weighIn.date, String(weighIn.weight), weighIn.unit, weighIn.note, formatWeight(weighIn.weight, weighIn.unit)]
    .join('\n')
    .toLowerCase();
}

export function textHits(haystack: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystack.includes(needle);
}

/** Event day or registration deadline. */
export function tournamentsOnDate(tournaments: readonly StudentTournament[], iso: string): StudentTournament[] {
  return tournaments.filter((tournament) => tournament.date === iso || tournament.deadline === iso);
}

export function isUpcomingTournament(tournament: StudentTournament, today: string): boolean {
  if (tournament.date >= today) return true;
  return Boolean(tournament.deadline && tournament.deadline >= today);
}

export function workingOnLine(games: CompetitionGames): string {
  return GAME_TAGS.map((tag) => {
    const techniques = games[tag].techniques.trim();
    if (!techniques) return '';
    return `${gameLetter(tag)} game: ${techniques}`;
  })
    .filter(Boolean)
    .join(' · ');
}

/**
 * The student's own belt and stripes, copied with the progress file.
 * `belt` is profile.belt at import. The roster card's belt is separate.
 */
export type ImportedRank = {
  belt: ProgressBelt;
  tapeCount: number;
  awardedOn: string;
  tapeDates: RankTapeDates;
  history: RankHistory[];
  lineage: string[];
  pictureNote: string;
  pictureCount: number;
};

/** A student's competition plan, copied onto a coach's roster. It stays on that device. */
export type ImportedCompetitionPlan = {
  studentId: string;
  displayName: string;
  importedAt: number;
  sourceUpdatedAt: number;
  games: CompetitionGames;
  tournaments: StudentTournament[];
  weighIns: WeighIn[];
  results: CompetitionResult[];
  weightUnit: WeightUnit;
  /** Chart goal. Absent on roster copies saved before the weight chart redesign. */
  goalWeight?: number | null;
  goalUnit?: WeightUnit;
  /** YYYY-MM-DD, or empty. Absent on older roster copies. */
  weighDate?: string;
  /** Present when the progress file included My rank. */
  rank?: ImportedRank;
};

export function rankHasContent(rank: ImportedRank | null | undefined): boolean {
  if (!rank) return false;
  if (rank.belt !== 'white') return true;
  if (rank.tapeCount > 0 || rank.awardedOn.trim()) return true;
  if (rank.tapeDates.some((date) => date.trim())) return true;
  if (rank.history.length > 0) return true;
  if (rank.lineage?.length) return true;
  if (rank.pictureNote?.trim()) return true;
  return (rank.pictureCount ?? 0) > 0;
}

export function rankSummary(rank: ImportedRank): string {
  const name = rank.belt.charAt(0).toUpperCase() + rank.belt.slice(1);
  const stripes = rank.tapeCount === 1 ? '1 stripe' : `${rank.tapeCount} stripes`;
  const date = rank.awardedOn ? ` · belt on ${rank.awardedOn}` : '';
  const earlier = rank.history.length === 1 ? ' · 1 earlier belt' : rank.history.length > 1 ? ` · ${rank.history.length} earlier belts` : '';
  return `${name} · ${stripes}${date}${earlier}`;
}

export function competitionSnapshot(report: StudentProgressReport, importedAt: number): ImportedCompetitionPlan {
  const competition = competitionOf(report);
  return {
    studentId: report.studentId,
    displayName: report.profile.displayName.trim().slice(0, 80),
    importedAt,
    sourceUpdatedAt: report.updatedAt,
    games: {
      a: { ...competition.games.a },
      b: { ...competition.games.b },
      c: { ...competition.games.c },
    },
    tournaments: competition.tournaments.map((tournament) => ({
      ...tournament,
      goals: tournament.goals.map((goal) => ({ ...goal })),
    })),
    weighIns: competition.weighIns.map((row) => ({ ...row })),
    results: competition.results.map((result) => ({
      ...result,
      matches: result.matches.map((match) => ({ ...match })),
      bracket: result.bracket.map((note) => ({ ...note })),
    })),
    weightUnit: competition.weightUnit,
    goalWeight: competition.goalWeight ?? null,
    goalUnit: competition.goalUnit === 'kg' ? 'kg' : 'lb',
    weighDate: competition.weighDate ?? '',
    rank: report.rank
      ? {
          belt: report.profile.belt,
          tapeCount: report.rank.tapeCount,
          awardedOn: report.rank.awardedOn,
          tapeDates: [...report.rank.tapeDates] as RankTapeDates,
          history: report.rank.history.map((row) => ({ ...row, tapeDates: [...row.tapeDates] as RankTapeDates })),
          lineage: [...(report.rank.lineage ?? [])],
          pictureNote: report.rank.pictureNote ?? '',
          pictureCount: report.rank.pictureCount ?? report.rank.pictures?.length ?? 0,
        }
      : undefined,
  };
}

export function planHasContent(plan: {
  games: CompetitionGames;
  tournaments: readonly StudentTournament[];
  weighIns: readonly WeighIn[];
  results?: readonly CompetitionResult[];
  rank?: ImportedRank | null;
}): boolean {
  const games = GAME_TAGS.some((tag) => plan.games[tag].techniques.trim() || plan.games[tag].notes.trim());
  return games || plan.tournaments.length > 0 || plan.weighIns.length > 0 || (plan.results?.length ?? 0) > 0 || rankHasContent(plan.rank);
}

export type ChartPoint = { date: string; value: number };

export function chartPoints(weighIns: readonly WeighIn[], unit: WeightUnit): ChartPoint[] {
  return [...weighIns]
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((row) => ({ date: row.date, value: convertWeight(row.weight, row.unit, unit) }));
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole days from `today` to `target`. Negative when the date has passed. */
export function daysUntil(target: string, today: string): number | null {
  if (!ISO_DAY.test(target) || !ISO_DAY.test(today)) return null;
  return Math.round((utcDay(target) - utcDay(today)) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  const count = Math.abs(days);
  const word = count === 1 ? 'day' : 'days';
  return days > 0 ? `${count} ${word}` : `${count} ${word} ago`;
}

export type WeightCountdown = {
  date: string;
  days: number;
  source: 'saved' | 'tournament';
  tournamentName: string;
};

/** Saved weigh-in date, or the next tournament day when the student has not set one. */
export function weightCountdown(competition: StudentCompetition, today: string): WeightCountdown | null {
  const saved = (competition.weighDate ?? '').trim();
  if (saved) {
    const days = daysUntil(saved, today);
    if (days == null) return null;
    return { date: saved, days, source: 'saved', tournamentName: '' };
  }
  const next = [...competition.tournaments]
    .filter((tournament) => tournament.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))[0];
  if (!next) return null;
  const days = daysUntil(next.date, today);
  if (days == null) return null;
  return { date: next.date, days, source: 'tournament', tournamentName: next.name };
}

export type ResolvedGoal = {
  weight: number;
  unit: WeightUnit;
  source: 'goal' | 'tournament';
  tournamentName: string;
};

/** Saved goal, or the next upcoming tournament target when the goal field is empty. */
export function resolvedGoal(competition: StudentCompetition, today: string): ResolvedGoal | null {
  if (competition.goalWeight != null) {
    return {
      weight: competition.goalWeight,
      unit: competition.goalUnit === 'kg' ? 'kg' : 'lb',
      source: 'goal',
      tournamentName: '',
    };
  }
  const next = [...competition.tournaments]
    .filter((tournament) => tournament.targetWeight != null && tournament.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))[0];
  if (!next || next.targetWeight == null) return null;
  return {
    weight: next.targetWeight,
    unit: next.targetUnit === 'kg' ? 'kg' : 'lb',
    source: 'tournament',
    tournamentName: next.name,
  };
}

/** Signed distance from a weigh-in to the goal, in the display unit. Positive is still above the goal. */
export function weightToTarget(
  weight: number,
  weightUnit: WeightUnit,
  goal: number,
  goalUnit: WeightUnit,
  display: WeightUnit,
): number {
  const shown = convertWeight(weight, weightUnit, display);
  const target = convertWeight(goal, goalUnit, display);
  return Math.round((shown - target) * 10) / 10;
}

export function formatWeightDelta(delta: number, unit: WeightUnit): string {
  const rounded = Math.round(delta * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${weightUnitLabel(unit)}`;
}

/** Visible table heading. Pounds when the chart is in lb, kilograms when it is in kg. */
export function toTargetColumn(unit: WeightUnit): string {
  return unit === 'kg' ? 'Kilograms to Target' : 'Pounds to Target';
}
