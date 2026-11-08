import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptCoachCompetitionUpdate, buildCoachCompetitionUpdate } from './coachCompetitionUpdate.ts';
import { emptyUpdateLedger } from './coachRankUpdate.ts';
import { competitionOf } from './progress/competition.ts';
import {
  countsAsAcademyCertified,
  personalProgressOpen,
  verificationAfterCoachReview,
} from './progressVerification.ts';
import { blankStudentReport } from './studentEdition.ts';
import { addCompetitionMatch, addCompetitionResult } from './studentCompetition.ts';

test('a student records progress with no coach, and that claim is not academy-certified', () => {
  assert.equal(personalProgressOpen({ coachConnected: false, coachApproved: false }), true);
  assert.equal(personalProgressOpen({ coachConnected: true, coachApproved: false }), true);
  let report = addCompetitionResult(blankStudentReport(1), { tournamentId: '', tournamentName: 'Fixture Open', division: 'Adult' }, 2);
  const resultId = competitionOf(report).results[0]?.id ?? '';
  report = addCompetitionMatch(report, resultId, { opponent: 'Sam', result: 'win', method: 'points', note: '' }, 3);
  assert.equal(competitionOf(report).results[0]?.matches.length, 1);
  assert.equal(verificationAfterCoachReview(false), 'self-reported');
  assert.equal(countsAsAcademyCertified('self-reported'), false);
});

test('accepting an official coach update verifies without removing the student match', () => {
  let report = addCompetitionResult(blankStudentReport(4), { tournamentId: '', tournamentName: 'Fixture Open', division: 'Adult' }, 5);
  report = { ...report, studentId: 'stu-1' };
  const resultId = competitionOf(report).results[0]?.id ?? '';
  report = addCompetitionMatch(report, resultId, { opponent: 'Sam', result: 'win', method: 'points', note: 'mine' }, 6);
  const built = buildCoachCompetitionUpdate({
    studentId: 'stu-1',
    tournamentName: 'Fixture Open',
    date: '2026-11-08',
    division: 'Adult',
    matches: [{ opponent: 'Sam', result: 'win', method: 'points', note: 'coach' }],
    now: 7,
    updateId: 'upd-1',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const accepted = acceptCoachCompetitionUpdate(report, built.packet, emptyUpdateLedger(), { 0: 'mine' }, 8);
  const matches = competitionOf(accepted.report).results.flatMap((result) => result.matches);
  assert.equal(matches.some((match) => match.note === 'mine'), true);
  assert.equal(accepted.applied, true);
  assert.equal(verificationAfterCoachReview(true), 'coach-verified');
  assert.equal(countsAsAcademyCertified('coach-verified'), true);
  assert.equal(countsAsAcademyCertified('self-reported'), false);
});
