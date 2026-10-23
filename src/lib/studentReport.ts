/**
 * Words on the Student Edition progress report and self-assessment.
 * The print page and the PDF both read this, so a section cannot show on
 * one and vanish on the other.
 */

import { competitionOf } from './progress/competition.ts';
import { checklistLevelLine, fundamentalLevelOf, proficiencySummary } from './fundamentals.ts';
import type { CompetitionMatch, JournalEntry, MatchMethod, ProgressBelt, StudentProgressReport } from './progress/types.ts';
import {
  ASSESSMENT_AREAS,
  assessmentAverage,
  isAssessmentScore,
  type AssessmentState,
} from './studentAssessment.ts';
import { decodeJournalBody } from './studentEdition.ts';
import type { StudentFilm } from './studentFilm.ts';
import type { AreaRatings } from './opponentAssessment.ts';
import type { ScoutingCard } from './studentScouting.ts';
import { BELT_LABELS, beltTrack, checkpointFilled, learnedCatalogIds } from './studentTools.ts';
import type { RubricCheckpoint, RubricLevel } from './progress/types.ts';

export type ReportIdentity = {
  name: string;
  gym: string;
  belt: string;
  started: string;
  named: boolean;
  gymNamed: boolean;
  startedSet: boolean;
};

export type ReportBlock = {
  title: string;
  lines: string[];
};

export type ReportExtras = {
  scouting?: readonly ScoutingCard[];
  films?: readonly StudentFilm[];
};

const RESULT_LABEL: Record<string, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' };
const METHOD_LABEL: Record<string, string> = {
  points: 'points',
  sub: 'submission',
  advantage: 'advantage',
  dq: 'disqualification',
};

export function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function reportIdentity(report: StudentProgressReport): ReportIdentity {
  const name = report.profile.displayName.trim();
  const gym = report.profile.gymName.trim();
  const started = report.profile.startedOn.trim();
  return {
    name: name || 'Not named',
    gym: gym || 'Not named',
    belt: BELT_LABELS[report.profile.belt] ?? report.profile.belt,
    started: started || 'Not set',
    named: Boolean(name),
    gymNamed: Boolean(gym),
    startedSet: Boolean(started),
  };
}

export function profileNeedsPrompt(report: StudentProgressReport): boolean {
  const identity = reportIdentity(report);
  return !identity.named || !identity.gymNamed || !identity.startedSet;
}

export function studentReportPdfName(kind: 'progress' | 'assessment', date: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : 'journal';
  const label = kind === 'assessment' ? 'self-assessment' : 'progress';
  return `advantage-student-${label}-${day}.pdf`;
}

export function rubricLevelsOnTrack(report: StudentProgressReport): RubricLevel[] {
  const track: readonly ProgressBelt[] = beltTrack(report.profile.belt);
  const order = new Map(track.map((belt, index) => [belt, index]));
  return report.rubric.levels
    .filter((level) => order.has(level.belt))
    .sort((left, right) => (order.get(left.belt) ?? 0) - (order.get(right.belt) ?? 0) || left.name.localeCompare(right.name));
}

export function checkpointStatusLabel(row: RubricCheckpoint, learned: ReadonlySet<string>): 'Met' | 'Not yet' | 'Unmarked' {
  if (checkpointFilled(row, learned)) return 'Met';
  if (row.met === false) return 'Not yet';
  return 'Unmarked';
}

function techniqueNames(entry: JournalEntry): string[] {
  const fromRefs = entry.techniqueRefs.map((item) => item.name.trim()).filter(Boolean);
  if (fromRefs.length) return fromRefs;
  const line = entry.body.split('\n').find((row) => row.startsWith('Techniques:'));
  if (!line) return [];
  return line
    .slice('Techniques:'.length)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Date, class when one was typed, techniques, and the note. Empty labels are left out. */
export function journalReportLine(entry: JournalEntry): string {
  const decoded = decodeJournalBody(entry.body);
  const parts = [entry.date];
  if (decoded.className.trim()) parts.push(decoded.className.trim());
  const techniques = techniqueNames(entry);
  if (techniques.length) parts.push(techniques.join('; '));
  const notes = decoded.notes.trim();
  if (notes) parts.push(notes);
  else {
    if (decoded.drills.trim()) parts.push(decoded.drills.trim());
    if (decoded.rolls.trim()) parts.push(decoded.rolls.trim());
  }
  const extra = entry.amendments.map((item) => item.body.trim()).filter(Boolean);
  if (extra.length) parts.push(extra[extra.length - 1] ?? '');
  return parts.filter(Boolean).join(' · ');
}

export function matchRecordLine(wins: number, losses: number, draws: number): string {
  const parts = [countPhrase(wins, 'win', 'wins'), countPhrase(losses, 'loss', 'losses')];
  if (draws > 0) parts.push(countPhrase(draws, 'draw', 'draws'));
  return `Recorded matches: ${parts.join(', ')}.`;
}

function methodLabel(method: MatchMethod | string): string {
  return METHOD_LABEL[method] ?? '';
}

function matchLine(match: CompetitionMatch): string {
  const result = RESULT_LABEL[match.result] ?? match.result;
  const method = methodLabel(match.method);
  const by = method ? ` by ${method}` : '';
  const note = match.note.trim() ? ` — ${match.note.trim()}` : '';
  const who = match.opponent.trim() || 'Unknown opponent';
  return `${result} vs ${who}${by}${note}`;
}

export function ratingLine(ratings: AreaRatings | undefined): string {
  return ASSESSMENT_AREAS.map((area) => {
    const score = ratings?.[area.id];
    return `${area.label} ${isAssessmentScore(score) ? score : 'not rated'}`;
  }).join(', ');
}

function rankBlock(report: StudentProgressReport): ReportBlock {
  const rank = report.rank;
  const lines = [`Current belt awarded: ${rank?.awardedOn || 'No date'}`, `Stripes: ${rank?.tapeCount ?? 0}`];
  rank?.tapeDates.forEach((date, index) => {
    if (rank && index < rank.tapeCount) lines.push(`Stripe ${index + 1}: ${date || 'No date'}`);
  });
  if (rank?.history.length) {
    lines.push('Earlier belts:');
    for (const row of rank.history) {
      const stripes = countPhrase(row.tapeCount, 'stripe', 'stripes');
      lines.push(`${BELT_LABELS[row.belt] ?? row.belt} awarded ${row.awardedOn || 'no date'}, ${stripes}`);
    }
  }
  if (rank?.lineage?.length) lines.push(`Lineage: ${rank.lineage.join(' / ')}`);
  return { title: 'Rank and stripes', lines };
}

function beltBlock(report: StudentProgressReport): ReportBlock {
  const levels = rubricLevelsOnTrack(report);
  if (!levels.length) return { title: 'Belt progress', lines: ['No belt progress recorded.'] };
  const learned = learnedCatalogIds(report);
  const lines: string[] = [];
  for (const level of levels) {
    lines.push(BELT_LABELS[level.belt] ?? level.name);
    for (const checkpoint of level.checkpoints) {
      const mark = checkpointStatusLabel(checkpoint, learned);
      const note = checkpoint.note.trim() ? ` — ${checkpoint.note.trim()}` : '';
      lines.push(`  ${checkpoint.name}: ${mark}${note}`);
    }
  }
  return { title: 'Belt progress', lines };
}

function fundamentalsBlock(report: StudentProgressReport): ReportBlock {
  const rows = report.checklist.filter((row) => !row.hidden);
  if (!rows.length) return { title: 'Fundamentals proficiency', lines: ['No fundamentals recorded.'] };
  const summary = proficiencySummary(rows.map((row) => ({ level: fundamentalLevelOf(row) })));
  const lines = [
    `Average ${summary.average.toFixed(1)} across ${countPhrase(summary.moves, 'fundamental', 'fundamentals')}.`,
    ...rows.map((row) => checklistLevelLine(row)),
  ];
  return { title: 'Fundamentals proficiency', lines };
}

function journalBlock(report: StudentProgressReport): ReportBlock {
  const cards = [...report.journal].sort((left, right) => right.date.localeCompare(left.date) || right.createdAt - left.createdAt);
  if (!cards.length) return { title: 'Journal summary', lines: ['No journal cards.'] };
  return { title: 'Journal summary', lines: cards.map((card) => journalReportLine(card)) };
}

function competitionBlock(report: StudentProgressReport): ReportBlock {
  const competition = competitionOf(report);
  const lines: string[] = [];
  for (const tag of ['a', 'b', 'c'] as const) {
    const game = competition.games[tag];
    if (game.techniques.trim()) lines.push(`${tag.toUpperCase()} game: ${game.techniques.trim()}`);
    if (game.notes.trim()) lines.push(`${tag.toUpperCase()} game notes: ${game.notes.trim()}`);
  }
  if (!competition.tournaments.length) lines.push('No tournaments recorded.');
  for (const event of competition.tournaments) {
    lines.push(`${event.date || 'No date'} ${event.name} (${event.status}) ${event.division}`.trim());
  }
  const matches = competition.results.flatMap((result) => result.matches);
  const wins = matches.filter((match) => match.result === 'win').length;
  const losses = matches.filter((match) => match.result === 'loss').length;
  const draws = matches.filter((match) => match.result === 'draw').length;
  if (competition.results.length) lines.push(matchRecordLine(wins, losses, draws));
  for (const result of competition.results) {
    const heading = [result.tournamentName || 'Matches', result.division].filter(Boolean).join(' — ');
    lines.push(heading);
    for (const match of result.matches) lines.push(`  ${matchLine(match)}`);
  }
  if (competition.goalWeight != null) {
    lines.push(`Goal weight: ${competition.goalWeight} ${competition.goalUnit ?? competition.weightUnit}`);
  }
  const weighs = [...competition.weighIns].sort((left, right) => right.date.localeCompare(left.date));
  for (const weigh of weighs) {
    lines.push(`${weigh.date}: ${weigh.weight} ${weigh.unit}${weigh.note.trim() ? ` — ${weigh.note.trim()}` : ''}`);
  }
  if (!weighs.length) lines.push('No weigh-ins.');
  return { title: 'Competition and weight', lines };
}

function assessmentBlock(assessment: AssessmentState): ReportBlock {
  const latest = [...assessment.entries].sort((left, right) => right.date.localeCompare(left.date))[0];
  if (!latest) {
    return { title: 'Self-assessment', lines: ['No self-assessment yet. A separate self-assessment report prints the chart.'] };
  }
  return {
    title: 'Self-assessment',
    lines: [`Latest ${latest.date}: average ${assessmentAverage(latest.scores).toFixed(1)}. See the self-assessment report for the chart.`],
  };
}

function scoutingBlock(cards: readonly ScoutingCard[]): ReportBlock {
  if (!cards.length) return { title: 'Scouting', lines: ['No scouting cards.'] };
  const lines: string[] = [];
  for (const card of cards) {
    const heading = [card.name, card.belt, card.gym.trim()].filter(Boolean).join(' — ');
    lines.push(heading);
    lines.push(`  ${ratingLine(card.ratings)}`);
    if (card.style.trim()) lines.push(`  Style: ${card.style.trim()}`);
    if (card.notes.trim()) lines.push(`  ${card.notes.trim()}`);
  }
  return { title: 'Scouting', lines };
}

function videoBlock(report: StudentProgressReport, films: readonly StudentFilm[]): ReportBlock {
  const lines: string[] = [];
  const clips = report.clips ?? [];
  if (!clips.length) lines.push('No saved links.');
  for (const clip of clips) {
    const note = clip.note?.trim() ? ` — ${clip.note.trim()}` : '';
    lines.push(`${clip.description}: ${clip.url}${note}`);
  }
  if (!films.length) lines.push('No filmed clips.');
  const ordered = [...films].sort((left, right) => right.createdAt - left.createdAt);
  for (const film of ordered) {
    const title = film.technique.trim() || 'Filmed move';
    const note = film.note.trim() ? ` — ${film.note.trim()}` : '';
    lines.push(`Filmed ${film.date} ${title}${note}`.replace(/\s+/g, ' ').trim());
  }
  return { title: 'Video library', lines };
}

export function progressReportBlocks(report: StudentProgressReport, assessment: AssessmentState, extra: ReportExtras = {}): ReportBlock[] {
  return [
    rankBlock(report),
    beltBlock(report),
    fundamentalsBlock(report),
    journalBlock(report),
    competitionBlock(report),
    assessmentBlock(assessment),
    scoutingBlock(extra.scouting ?? []),
    videoBlock(report, extra.films ?? []),
  ];
}

export function progressReportLines(report: StudentProgressReport, assessment: AssessmentState, extra: ReportExtras = {}): string[] {
  const identity = reportIdentity(report);
  const lines = [
    'Advantage Student Edition',
    'Progress report',
    '',
    'Hand this page to an instructor. Advantage does not host it.',
    '',
    `Student: ${identity.name}`,
    `Gym: ${identity.gym}`,
    `Belt: ${identity.belt}`,
    `Started: ${identity.started}`,
  ];
  for (const block of progressReportBlocks(report, assessment, extra)) {
    lines.push('', block.title, ...block.lines);
  }
  return lines;
}

export function selfAssessmentLines(report: StudentProgressReport, assessment: AssessmentState): string[] {
  const identity = reportIdentity(report);
  const lines = [
    'Advantage Student Edition',
    'Self-assessment report',
    '',
    'Hand this page to an instructor. 1 is early. 5 is ready to rely on.',
    `Student: ${identity.name}`,
    `Gym: ${identity.gym}`,
    `Belt: ${identity.belt}`,
    `Started: ${identity.started}`,
    '',
  ];
  const entries = [...assessment.entries].sort((left, right) => right.date.localeCompare(left.date));
  if (!entries.length) lines.push('No self-assessment saved on this phone.');
  for (const entry of entries) {
    lines.push(`${entry.date} — average ${assessmentAverage(entry.scores).toFixed(1)}`);
    for (const area of ASSESSMENT_AREAS) lines.push(`  ${area.label}: ${entry.scores[area.id]}`);
    if (entry.note.trim()) lines.push(`  Note: ${entry.note.trim()}`);
    lines.push('');
  }
  return lines;
}
