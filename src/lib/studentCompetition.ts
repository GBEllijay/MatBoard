/**
 * Edits to the competition section of the on-device student progress file.
 * Tournaments, the standing A/B/C game, and weigh-ins. Nothing is uploaded.
 */

import { cleanOptionalLink, competitionOf, emptyCompetition } from './progress/competition.ts';
import {
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_SEQUENCE_MAX,
  PROGRESS_TOURNAMENT_GOALS_MAX,
  PROGRESS_TOURNAMENTS_MAX,
  PROGRESS_WEIGH_INS_MAX,
  PROGRESS_WEIGHT_MAX,
  type GameTag,
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
