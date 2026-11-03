/**
 * One-way coach competition update.
 * Check-in, readiness, roster notes, and photos stay on the coach's card.
 * Accept adds a tournament or fills blanks, and adds matches.
 * A match the student already recorded is kept. The student chooses whether
 * to add the coach's copy beside it. This never deletes a student match.
 */

import { createUpdateId, shortPromotionDate } from './coachRankUpdate.ts';
import { competitionOf } from './progress/competition.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import {
  PROGRESS_NOTE_MAX,
  PROGRESS_SCHEMA_VERSION,
  type CoachCompetitionUpdatePacket,
  type CoachGymBrand,
  type CompetitionMatch,
  type MatchMethod,
  type MatchResult,
  type StudentProgressReport,
} from './progress/types.ts';
import {
  addCompetitionMatch,
  addCompetitionResult,
  addTournament,
  updateTournament,
} from './studentCompetition.ts';
import type { Student } from './rosterStore.ts';
import type { UpdateLedger } from './coachRankUpdate.ts';

export type MatchKeep = 'mine' | 'both';

export type CompetitionConflict = {
  index: number;
  opponent: string;
  studentSummary: string;
  coachSummary: string;
};

const RESULT_LABEL: Record<MatchResult, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' };

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function seen(ledger: UpdateLedger, updateId: string): boolean {
  return ledger.accepted.includes(updateId) || ledger.dismissed.includes(updateId);
}

export function competitionSendOffer(card: Pick<Student, 'guestId' | 'linkedStudentId' | 'rosterList'>): 'send' | 'noop' {
  if (card.rosterList === 'student') return 'noop';
  if (card.guestId || !card.linkedStudentId) return 'noop';
  return 'send';
}

export function buildCoachCompetitionUpdate(input: {
  studentId: string;
  tournamentName: string;
  date: string;
  location?: string;
  division?: string;
  weightClass?: string;
  matches: { opponent: string; result: MatchResult; method: MatchMethod; note?: string }[];
  gym?: CoachGymBrand;
  now?: number;
  updateId?: string;
}): { ok: true; packet: CoachCompetitionUpdatePacket } | { ok: false; error: string } {
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? createUpdateId(now);
  const packet: CoachCompetitionUpdatePacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-competition-update',
    id: updateId,
    studentId: input.studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    competitionUpdate: {
      tournamentName: input.tournamentName.trim(),
      date: input.date,
      location: (input.location ?? '').trim(),
      division: (input.division ?? '').trim(),
      weightClass: (input.weightClass ?? '').trim(),
      matches: input.matches.map((match) => ({
        opponent: match.opponent.trim(),
        result: match.result,
        method: match.method,
        note: (match.note ?? '').trim().slice(0, PROGRESS_NOTE_MAX),
      })),
    },
  };
  if (input.gym?.name || input.gym?.logo) packet.gym = input.gym;
  const parsed = parseProgressPacket(exportProgressPacket(packet));
  if (!parsed.ok || parsed.value.kind !== 'coach-competition-update') {
    const detail = parsed.ok ? 'Competition update could not be read back.' : parsed.errors.join(' ');
    return { ok: false, error: detail };
  }
  return { ok: true, packet: parsed.value };
}

export function competitionUpdateSentence(packet: CoachCompetitionUpdatePacket): string {
  const event = packet.competitionUpdate;
  const count = event.matches.length;
  const matches = count === 1 ? '1 match' : `${count} matches`;
  return `Coach recorded ${event.tournamentName} on ${shortPromotionDate(event.date)}. ${matches}.`;
}

function summary(match: { result: MatchResult; method: MatchMethod }): string {
  return match.method ? `${RESULT_LABEL[match.result]} by ${match.method}` : RESULT_LABEL[match.result];
}

export function competitionConflicts(
  report: StudentProgressReport,
  packet: CoachCompetitionUpdatePacket,
): CompetitionConflict[] {
  const event = packet.competitionUpdate;
  const competition = competitionOf(report);
  const tournament = competition.tournaments.find(
    (item) => sameText(item.name, event.tournamentName) && item.date === event.date,
  );
  const result = competition.results.find(
    (item) =>
      (tournament && item.tournamentId === tournament.id) || sameText(item.tournamentName, event.tournamentName),
  );
  if (!result) return [];
  const conflicts: CompetitionConflict[] = [];
  event.matches.forEach((match, index) => {
    const existing = result.matches.find((item) => sameText(item.opponent, match.opponent));
    if (!existing) return;
    conflicts.push({
      index,
      opponent: match.opponent,
      studentSummary: summary(existing),
      coachSummary: summary(match),
    });
  });
  return conflicts;
}

function ensureTournament(report: StudentProgressReport, packet: CoachCompetitionUpdatePacket, now: number): StudentProgressReport {
  const event = packet.competitionUpdate;
  const competition = competitionOf(report);
  const existing = competition.tournaments.find(
    (item) => sameText(item.name, event.tournamentName) && item.date === event.date,
  );
  if (!existing) {
    return addTournament(
      report,
      {
        name: event.tournamentName,
        date: event.date,
        location: event.location,
        division: event.division,
        weightClass: event.weightClass,
        deadline: '',
        link: '',
        status: 'entered',
        targetWeight: '',
        targetUnit: 'lb',
      },
      now,
    );
  }
  const location = existing.location.trim() || event.location;
  const division = existing.division.trim() || event.division;
  const weightClass = existing.weightClass?.trim() || event.weightClass;
  if (location === existing.location && division === existing.division && weightClass === (existing.weightClass ?? '')) {
    return report;
  }
  return updateTournament(
    report,
    existing.id,
    {
      name: existing.name,
      date: existing.date,
      location,
      division,
      weightClass,
      deadline: existing.deadline,
      link: existing.link,
      status: existing.status,
      targetWeight: existing.targetWeight == null ? '' : String(existing.targetWeight),
      targetUnit: existing.targetUnit,
    },
    now,
  );
}

function tournamentIdOf(report: StudentProgressReport, packet: CoachCompetitionUpdatePacket): string {
  const event = packet.competitionUpdate;
  const found = competitionOf(report).tournaments.find(
    (item) => sameText(item.name, event.tournamentName) && item.date === event.date,
  );
  return found?.id ?? '';
}

function ensureResult(report: StudentProgressReport, packet: CoachCompetitionUpdatePacket, now: number): StudentProgressReport {
  const event = packet.competitionUpdate;
  const tournamentId = tournamentIdOf(report, packet);
  const competition = competitionOf(report);
  const existing = competition.results.find(
    (item) => item.tournamentId === tournamentId || sameText(item.tournamentName, event.tournamentName),
  );
  if (existing) return report;
  return addCompetitionResult(
    report,
    { tournamentId, tournamentName: event.tournamentName, division: event.division },
    now,
  );
}

function resultIdOf(report: StudentProgressReport, packet: CoachCompetitionUpdatePacket): string {
  const event = packet.competitionUpdate;
  const tournamentId = tournamentIdOf(report, packet);
  const found = competitionOf(report).results.find(
    (item) => item.tournamentId === tournamentId || sameText(item.tournamentName, event.tournamentName),
  );
  return found?.id ?? '';
}

export function acceptCoachCompetitionUpdate(
  report: StudentProgressReport,
  packet: CoachCompetitionUpdatePacket,
  ledger: UpdateLedger,
  choices: Readonly<Record<number, MatchKeep>> = {},
  now = Date.now(),
): { report: StudentProgressReport; ledger: UpdateLedger; applied: boolean } {
  if (packet.studentId !== report.studentId || seen(ledger, packet.updateId)) {
    return { report, ledger, applied: false };
  }
  const beforeMatches = JSON.stringify(competitionOf(report).results);
  let next = ensureTournament(report, packet, now);
  next = ensureResult(next, packet, now);
  const resultId = resultIdOf(next, packet);
  const conflicts = new Set(competitionConflicts(report, packet).map((item) => item.index));
  if (resultId) {
    packet.competitionUpdate.matches.forEach((match, index) => {
      const choice = choices[index] ?? 'both';
      if (conflicts.has(index) && choice === 'mine') return;
      next = addCompetitionMatch(
        next,
        resultId,
        {
          opponent: match.opponent,
          result: match.result,
          method: match.method,
          note: match.note,
          date: packet.competitionUpdate.date,
        },
        now + index,
      );
    });
  }
  if (!next.profile.gymName.trim() && packet.gym?.name) {
    next = { ...next, profile: { ...next.profile, gymName: packet.gym.name } };
  }
  if (JSON.stringify(competitionOf(next).results) === beforeMatches && next.profile.gymName === report.profile.gymName) {
    const created = competitionOf(next).tournaments.length !== competitionOf(report).tournaments.length;
    if (!created) {
      return {
        report: next,
        ledger: { ...ledger, accepted: [...ledger.accepted, packet.updateId].slice(-200) },
        applied: true,
      };
    }
  }
  return {
    report: next,
    ledger: { ...ledger, accepted: [...ledger.accepted, packet.updateId].slice(-200) },
    applied: true,
  };
}

export function studentMatchCount(report: StudentProgressReport): number {
  return competitionOf(report).results.reduce((sum, result) => sum + result.matches.length, 0);
}

export function keptStudentMatch(report: StudentProgressReport, opponent: string): CompetitionMatch | undefined {
  for (const result of competitionOf(report).results) {
    const found = result.matches.find((match) => sameText(match.opponent, opponent));
    if (found) return found;
  }
  return undefined;
}
