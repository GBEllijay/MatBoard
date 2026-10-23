/**
 * Edits to the competition section of the on-device student progress file.
 * Tournaments, the standing A/B/C game, and weigh-ins. Nothing is uploaded.
 */

import { cleanOptionalLink, competitionOf, emptyCompetition } from './progress/competition.ts';
import {
  PROGRESS_BRACKET_NOTES_MAX,
  PROGRESS_MATCHES_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_RESULTS_MAX,
  PROGRESS_SEQUENCE_MAX,
  PROGRESS_TOURNAMENT_GOALS_MAX,
  PROGRESS_TOURNAMENTS_MAX,
  PROGRESS_WEIGH_INS_MAX,
  PROGRESS_WEIGHT_MAX,
  type CompetitionResult,
  type GameTag,
  type MatchMethod,
  type MatchResult,
  type StudentCompetition,
  type StudentProgressReport,
  type StudentTournament,
  type TournamentStatus,
  type WeighIn,
  type WeightUnit,
} from './progress/types.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type TournamentDraft = {
  name: string;
  date: string;
  location: string;
  division: string;
  deadline: string;
  link: string;
  status: TournamentStatus;
  targetWeight: string;
  targetUnit: WeightUnit;
};

export type WeighInDraft = {
  date: string;
  weight: string;
  unit: WeightUnit;
  note: string;
};

function newId(prefix: string, now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${now.toString(36)}.${rand}`;
}

function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function requireDate(value: string, label: string): string {
  const text = value.trim();
  if (!isIsoDate(text)) throw new Error(`${label} must be YYYY-MM-DD.`);
  return text;
}

function optionalDate(value: string, label: string): string {
  const text = value.trim();
  if (!text) return '';
  return requireDate(text, label);
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function parseWeight(value: string, label: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0 || number > PROGRESS_WEIGHT_MAX) {
    throw new Error(`${label} must be a weight above 0.`);
  }
  return Math.round(number * 10) / 10;
}

function withCompetition(
  report: StudentProgressReport,
  competition: StudentCompetition,
  now: number,
): StudentProgressReport {
  return { ...report, schemaVersion: 2, updatedAt: now, competition };
}

export function setCompetitionGame(
  report: StudentProgressReport,
  tag: GameTag,
  game: { techniques: string; notes: string },
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  const techniques = clip(game.techniques, PROGRESS_SEQUENCE_MAX);
  const notes = clip(game.notes, PROGRESS_NOTE_MAX);
  if (competition.games[tag].techniques === techniques && competition.games[tag].notes === notes) return report;
  return withCompetition(
    report,
    {
      ...competition,
      games: { ...competition.games, [tag]: { techniques, notes } },
    },
    now,
  );
}

export function setWeightUnit(report: StudentProgressReport, unit: WeightUnit, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (competition.weightUnit === unit) return report;
  return withCompetition(report, { ...competition, weightUnit: unit }, now);
}

export function setGoalWeight(
  report: StudentProgressReport,
  weight: string,
  unit: WeightUnit,
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  const goalWeight = parseWeight(weight, 'Goal weight');
  const goalUnit = unit === 'kg' ? 'kg' : 'lb';
  const current = competition.goalWeight ?? null;
  const currentUnit = competition.goalUnit === 'kg' ? 'kg' : 'lb';
  if (current === goalWeight && (goalWeight == null || currentUnit === goalUnit)) return report;
  return withCompetition(report, { ...competition, goalWeight, goalUnit }, now);
}

export function setWeighDate(report: StudentProgressReport, date: string, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  const weighDate = optionalDate(date, 'Competition weigh-in date');
  if ((competition.weighDate ?? '') === weighDate) return report;
  return withCompetition(report, { ...competition, weighDate }, now);
}

export function addWeighIn(report: StudentProgressReport, draft: WeighInDraft, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (competition.weighIns.length >= PROGRESS_WEIGH_INS_MAX) throw new Error('The weigh-in list is full.');
  const weight = parseWeight(draft.weight, 'Weigh-in');
  if (weight == null) throw new Error('Add a weight above 0.');
  const weighIn: WeighIn = {
    id: newId('weigh', now),
    date: requireDate(draft.date, 'Weigh-in date'),
    weight,
    unit: draft.unit,
    note: clip(draft.note, PROGRESS_NOTE_MAX),
  };
  return withCompetition(report, { ...competition, weighIns: [...competition.weighIns, weighIn] }, now);
}

export function removeWeighIn(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (!competition.weighIns.some((row) => row.id === id)) return report;
  return withCompetition(
    report,
    { ...competition, weighIns: competition.weighIns.filter((row) => row.id !== id) },
    now,
  );
}

function tournamentFromDraft(draft: TournamentDraft, id: string, goals: StudentTournament['goals']): StudentTournament {
  const name = clip(draft.name, PROGRESS_NAME_MAX);
  if (!name) throw new Error('Add a tournament name.');
  return {
    id,
    name,
    date: requireDate(draft.date, 'Tournament date'),
    location: clip(draft.location, PROGRESS_NOTE_MAX),
    division: clip(draft.division, PROGRESS_NAME_MAX),
    deadline: optionalDate(draft.deadline, 'Registration deadline'),
    link: cleanOptionalLink(draft.link),
    status: draft.status === 'entered' ? 'entered' : 'considering',
    targetWeight: parseWeight(draft.targetWeight, 'Target weight'),
    targetUnit: draft.targetUnit === 'kg' ? 'kg' : 'lb',
    goals,
  };
}

export function addTournament(report: StudentProgressReport, draft: TournamentDraft, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (competition.tournaments.length >= PROGRESS_TOURNAMENTS_MAX) throw new Error('The tournament list is full.');
  const tournament = tournamentFromDraft(draft, newId('tournament', now), []);
  return withCompetition(report, { ...competition, tournaments: [...competition.tournaments, tournament] }, now);
}

export function updateTournament(
  report: StudentProgressReport,
  id: string,
  draft: TournamentDraft,
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  const current = competition.tournaments.find((tournament) => tournament.id === id);
  if (!current) return report;
  const next = tournamentFromDraft(draft, id, current.goals);
  return withCompetition(
    report,
    {
      ...competition,
      tournaments: competition.tournaments.map((tournament) => (tournament.id === id ? next : tournament)),
    },
    now,
  );
}

export function removeTournament(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (!competition.tournaments.some((tournament) => tournament.id === id)) return report;
  return withCompetition(
    report,
    { ...competition, tournaments: competition.tournaments.filter((tournament) => tournament.id !== id) },
    now,
  );
}

export function addTournamentGoal(
  report: StudentProgressReport,
  tournamentId: string,
  name: string,
  note: string,
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  const tournament = competition.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return report;
  const goalName = clip(name, PROGRESS_NAME_MAX);
  if (!goalName) throw new Error('Add a goal name.');
  if (tournament.goals.length >= PROGRESS_TOURNAMENT_GOALS_MAX) throw new Error('That tournament’s goal list is full.');
  const goals = [
    ...tournament.goals,
    { id: newId('tgoal', now), name: goalName, note: clip(note, PROGRESS_NOTE_MAX), met: false },
  ];
  return withCompetition(
    report,
    {
      ...competition,
      tournaments: competition.tournaments.map((item) => (item.id === tournamentId ? { ...item, goals } : item)),
    },
    now,
  );
}

export function setTournamentGoalMet(
  report: StudentProgressReport,
  tournamentId: string,
  goalId: string,
  met: boolean,
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  return withCompetition(
    report,
    {
      ...competition,
      tournaments: competition.tournaments.map((tournament) => {
        if (tournament.id !== tournamentId) return tournament;
        return {
          ...tournament,
          goals: tournament.goals.map((goal) => (goal.id === goalId ? { ...goal, met } : goal)),
        };
      }),
    },
    now,
  );
}

export function removeTournamentGoal(
  report: StudentProgressReport,
  tournamentId: string,
  goalId: string,
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  return withCompetition(
    report,
    {
      ...competition,
      tournaments: competition.tournaments.map((tournament) =>
        tournament.id === tournamentId
          ? { ...tournament, goals: tournament.goals.filter((goal) => goal.id !== goalId) }
          : tournament,
      ),
    },
    now,
  );
}

export function blankCompetition(): StudentCompetition {
  return emptyCompetition();
}

export type ResultDraft = {
  tournamentId: string;
  tournamentName: string;
  division: string;
};

export function addCompetitionResult(report: StudentProgressReport, draft: ResultDraft, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (competition.results.length >= PROGRESS_RESULTS_MAX) throw new Error('The results list is full.');
  const tournamentName = clip(draft.tournamentName, PROGRESS_NAME_MAX);
  if (!tournamentName) throw new Error('Choose a tournament or type its name.');
  const result: CompetitionResult = {
    id: newId('result', now),
    tournamentId: clip(draft.tournamentId, PROGRESS_NAME_MAX),
    tournamentName,
    division: clip(draft.division, PROGRESS_NAME_MAX),
    matches: [],
    bracket: [],
    bracketPhoto: false,
  };
  return withCompetition(report, { ...competition, results: [...competition.results, result] }, now);
}

export function removeCompetitionResult(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  const competition = competitionOf(report);
  if (!competition.results.some((result) => result.id === id)) return report;
  return withCompetition(
    report,
    { ...competition, results: competition.results.filter((result) => result.id !== id) },
    now,
  );
}

export function addCompetitionMatch(
  report: StudentProgressReport,
  resultId: string,
  draft: { opponent: string; result: MatchResult; method: MatchMethod; note: string; date?: string },
  now = Date.now(),
): StudentProgressReport {
  return mapResult(report, resultId, now, (result) => {
    if (result.matches.length >= PROGRESS_MATCHES_MAX) throw new Error('That result’s match list is full.');
    const opponent = clip(draft.opponent, PROGRESS_NAME_MAX);
    if (!opponent) throw new Error('Add an opponent.');
    const date = (draft.date ?? '').trim();
    if (date && !isIsoDate(date)) throw new Error('Match date must be YYYY-MM-DD.');
    const match = {
      id: newId('match', now),
      opponent,
      result: draft.result,
      method: draft.method,
      note: clip(draft.note, PROGRESS_NOTE_MAX),
      ...(date ? { date } : {}),
    };
    return {
      ...result,
      matches: [...result.matches, match],
    };
  });
}

export function removeCompetitionMatch(
  report: StudentProgressReport,
  resultId: string,
  matchId: string,
  now = Date.now(),
): StudentProgressReport {
  return mapResult(report, resultId, now, (result) => ({
    ...result,
    matches: result.matches.filter((match) => match.id !== matchId),
  }));
}

export function addBracketNote(
  report: StudentProgressReport,
  resultId: string,
  round: string,
  name: string,
  now = Date.now(),
): StudentProgressReport {
  return mapResult(report, resultId, now, (result) => {
    if (result.bracket.length >= PROGRESS_BRACKET_NOTES_MAX) throw new Error('That bracket note list is full.');
    const person = clip(name, PROGRESS_NAME_MAX);
    if (!person) throw new Error('Add a name for the bracket.');
    return {
      ...result,
      bracket: [...result.bracket, { id: newId('bracket', now), round: clip(round, PROGRESS_NAME_MAX), name: person }],
    };
  });
}

export function removeBracketNote(
  report: StudentProgressReport,
  resultId: string,
  noteId: string,
  now = Date.now(),
): StudentProgressReport {
  return mapResult(report, resultId, now, (result) => ({
    ...result,
    bracket: result.bracket.filter((note) => note.id !== noteId),
  }));
}

export function setBracketPhotoFlag(
  report: StudentProgressReport,
  resultId: string,
  present: boolean,
  now = Date.now(),
): StudentProgressReport {
  return mapResult(report, resultId, now, (result) =>
    result.bracketPhoto === present ? result : { ...result, bracketPhoto: present },
  );
}

export function setTournamentTarget(
  report: StudentProgressReport,
  tournamentId: string,
  weight: string,
  unit: WeightUnit,
  now = Date.now(),
): StudentProgressReport {
  const competition = competitionOf(report);
  const tournament = competition.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) return report;
  const targetWeight = parseWeight(weight, 'Target weight');
  const targetUnit = unit === 'kg' ? 'kg' : 'lb';
  if (tournament.targetWeight === targetWeight && tournament.targetUnit === targetUnit) return report;
  return withCompetition(
    report,
    {
      ...competition,
      tournaments: competition.tournaments.map((item) =>
        item.id === tournamentId ? { ...item, targetWeight, targetUnit } : item,
      ),
    },
    now,
  );
}

function mapResult(
  report: StudentProgressReport,
  resultId: string,
  now: number,
  change: (result: CompetitionResult) => CompetitionResult,
): StudentProgressReport {
  const competition = competitionOf(report);
  const current = competition.results.find((result) => result.id === resultId);
  if (!current) return report;
  const next = change(current);
  if (next === current) return report;
  return withCompetition(
    report,
    {
      ...competition,
      results: competition.results.map((result) => (result.id === resultId ? next : result)),
    },
    now,
  );
}
