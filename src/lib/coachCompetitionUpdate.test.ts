import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCoachCompetitionUpdate,
  buildCoachCompetitionUpdate,
  competitionConflicts,
  competitionSendOffer,
  keptStudentMatch,
  studentMatchCount,
} from './coachCompetitionUpdate.ts';
import { emptyUpdateLedger } from './coachRankUpdate.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { addCompetitionMatch, addCompetitionResult, addTournament } from './studentCompetition.ts';
import { blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';

function packet() {
  const built = buildCoachCompetitionUpdate({
    studentId: 'stu-alex',
    tournamentName: 'Mock tournament',
    date: '2026-11-03',
    location: 'Ellijay',
    division: 'Adult Blue',
    weightClass: 'Middle',
    matches: [{ opponent: 'Sam', result: 'win', method: 'sub', note: 'armbar' }],
    now: 50,
    updateId: 'comp-nov3',
  });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

test('competition update validates and rejects a checklist', () => {
  const update = packet();
  const parsed = parseProgressPacket(exportProgressPacket(update));
  assert.equal(parsed.ok, true);
  const marked = JSON.parse(exportProgressPacket(update)) as { checklist?: unknown };
  marked.checklist = [{ id: 'skill', met: true }];
  const refused = parseProgressPacket(JSON.stringify(marked));
  assert.equal(refused.ok, false);
});

test('accept creates a tournament, and a repeated match stays until the student chooses', () => {
  const update = packet();
  const report = assignStudentId(blankStudentReport(1), 'stu-alex', 1);
  const checklist = report.checklist;
  const accepted = acceptCoachCompetitionUpdate(report, update, emptyUpdateLedger(), {}, 80);
  assert.equal(accepted.applied, true);
  assert.equal(accepted.report.checklist, checklist);
  assert.equal(studentMatchCount(accepted.report), 1);
  assert.equal(keptStudentMatch(accepted.report, 'Sam')?.method, 'sub');

  const again = acceptCoachCompetitionUpdate(accepted.report, update, accepted.ledger, {}, 90);
  assert.equal(again.applied, false);
  assert.equal(studentMatchCount(again.report), 1);

  let existing = addTournament(
    report,
    {
      name: 'Mock tournament',
      date: '2026-11-03',
      location: 'Home',
      division: 'Adult Blue',
      weightClass: 'Middle',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '',
      targetUnit: 'lb',
    },
    2,
  );
  const tournamentId = existing.competition?.tournaments[0]?.id ?? '';
  existing = addCompetitionResult(existing, { tournamentId, tournamentName: 'Mock tournament', division: 'Adult Blue' }, 3);
  const resultId = existing.competition?.results[0]?.id ?? '';
  existing = addCompetitionMatch(existing, resultId, { opponent: 'Sam', result: 'win', method: 'points', note: 'mine' }, 4);
  const conflicts = competitionConflicts(existing, update);
  assert.equal(conflicts.length, 1);
  const mine = acceptCoachCompetitionUpdate(existing, update, emptyUpdateLedger(), { 0: 'mine' }, 90);
  assert.equal(studentMatchCount(mine.report), 1);
  assert.equal(keptStudentMatch(mine.report, 'Sam')?.method, 'points');
  assert.equal(mine.report.competition?.tournaments[0]?.location, 'Home');
  const both = acceptCoachCompetitionUpdate(existing, update, emptyUpdateLedger(), { 0: 'both' }, 90);
  assert.equal(studentMatchCount(both.report), 2);
  assert.equal(keptStudentMatch(both.report, 'Sam')?.note, 'mine');
});

test('an unlinked card and a guest card do not offer a competition send', () => {
  assert.equal(competitionSendOffer({ rosterList: undefined, linkedStudentId: undefined, guestId: undefined }), 'noop');
  assert.equal(competitionSendOffer({ linkedStudentId: 'stu-alex', guestId: 'guest-1' }), 'noop');
  assert.equal(competitionSendOffer({ rosterList: 'student', linkedStudentId: 'stu-alex' }), 'noop');
  assert.equal(competitionSendOffer({ linkedStudentId: 'stu-alex' }), 'send');
});
