import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCoachRankUpdate,
  buildCoachRankUpdate,
  dismissCoachRankUpdate,
  emptyUpdateLedger,
  latestJournalNotes,
  queueCoachUpdate,
  rankSendOffer,
  rankUpdateSentence,
  readCoachQueue,
  writeUpdateLedger,
} from './coachRankUpdate.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { addStudent, getRoster, linkRosterCard, normalizeRoster, resetRoster, updateStudent } from './rosterStore.ts';
import { blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import { applyCoachFile } from './studentTools.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

function sample(now = 50) {
  const built = buildCoachRankUpdate({
    studentId: 'stu-alex',
    belt: 'Blue',
    stripeCount: 2,
    promotionDate: '2026-11-03',
    note: 'Nice work',
    gym: { name: 'Advantage' },
    now,
    updateId: 'rank-nov3',
  });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

test('coach-rank-update validates and rejects checklist marks', () => {
  const packet = sample();
  const parsed = parseProgressPacket(exportProgressPacket(packet));
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.value.kind === 'coach-rank-update') {
    assert.equal(parsed.value.rankUpdate.belt, 'blue');
    assert.equal(parsed.value.rankUpdate.stripeCount, 2);
    assert.equal(parsed.value.rankUpdate.promotionDate, '2026-11-03');
    assert.equal(parsed.value.updateId, 'rank-nov3');
    assert.equal(parsed.value.gym?.name, 'Advantage');
  }
  assert.equal(rankUpdateSentence(packet), 'Coach recorded Blue belt, stripe 2 on Nov 3.');

  const marked = JSON.parse(exportProgressPacket(packet)) as { checklist?: unknown; rankUpdate?: { stripes?: number } };
  marked.checklist = [{ id: 'skill-1', met: true }];
  const refused = parseProgressPacket(JSON.stringify(marked));
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.errors.join(' '), /cannot set student marks/);

  const stripesKey = JSON.parse(exportProgressPacket(packet)) as { rankUpdate: { stripes?: number } };
  stripesKey.rankUpdate.stripes = 2;
  const banned = parseProgressPacket(JSON.stringify(stripesKey));
  assert.equal(banned.ok, false);
});

test('accept writes rank and a journal card once; dismiss leaves the file alone', () => {
  const packet = sample();
  const report = assignStudentId(blankStudentReport(1), 'stu-alex', 1);
  const checklist = report.checklist;
  const accepted = acceptCoachRankUpdate(report, packet, emptyUpdateLedger(), 80);
  assert.equal(accepted.applied, true);
  assert.equal(accepted.report.checklist, checklist);
  assert.equal(accepted.report.rubric, report.rubric);
  assert.equal(accepted.report.goals, report.goals);
  assert.equal(accepted.report.profile.belt, 'blue');
  assert.equal(accepted.report.rank?.tapeCount, 2);
  assert.equal(accepted.report.rank?.tapeDates[1], '2026-11-03');
  assert.match(latestJournalNotes(accepted.report), /Coach recorded Blue belt, stripe 2 on Nov 3/);
  assert.match(latestJournalNotes(accepted.report), /Nice work/);
  assert.equal(accepted.report.profile.gymName, 'Advantage');

  const again = acceptCoachRankUpdate(accepted.report, packet, accepted.ledger, 90);
  assert.equal(again.applied, false);
  assert.equal(again.report, accepted.report);
  assert.equal(again.report.journal.length, 1);

  const fresh = assignStudentId(blankStudentReport(1), 'stu-alex', 1);
  const dismissed = dismissCoachRankUpdate(fresh, packet, emptyUpdateLedger());
  assert.equal(dismissed.applied, true);
  assert.equal(dismissed.report, fresh);
  assert.equal(dismissed.report.journal.length, 0);
  assert.equal(dismissed.report.profile.belt, 'white');
  const afterDismiss = acceptCoachRankUpdate(fresh, packet, dismissed.ledger, 90);
  assert.equal(afterDismiss.applied, false);
  assert.equal(afterDismiss.report, fresh);

  const afterAccept = dismissCoachRankUpdate(accepted.report, packet, accepted.ledger);
  assert.equal(afterAccept.applied, false);
  assert.equal(afterAccept.report.journal.length, 1);

  const foreign = { ...packet, studentId: 'stu-other' };
  const skipped = acceptCoachRankUpdate(fresh, foreign, emptyUpdateLedger(), 90);
  assert.equal(skipped.applied, false);
  assert.equal(skipped.report, fresh);
});

test('import queues a rank file and does not change the checklist', () => {
  const packet = sample();
  const report = assignStudentId(blankStudentReport(1), 'stu-alex', 1);
  const imported = applyCoachFile(report, { plan: null, feedback: null }, exportProgressPacket(packet));
  assert.equal(imported.error, '');
  assert.equal(imported.report, report);
  assert.equal(imported.pendingRankUpdate?.updateId, 'rank-nov3');
  const store = memory();
  queueCoachUpdate(store, imported.pendingRankUpdate!);
  queueCoachUpdate(store, imported.pendingRankUpdate!);
  assert.equal(readCoachQueue(store).length, 1);
  writeUpdateLedger(store, { accepted: ['rank-nov3'], dismissed: [] });
  queueCoachUpdate(store, packet);
  assert.equal(readCoachQueue(store).length, 1);
});

test('an unlinked roster card does not offer a send', () => {
  const before = { belt: 'White', lastPromotion: '', stripes: 0 as number | undefined };
  const after = { belt: 'Blue', lastPromotion: '2026-11-03', stripes: 2 as number | undefined };
  assert.equal(rankSendOffer(before, after), 'noop');
  assert.equal(rankSendOffer({ ...before, linkedStudentId: 'stu-alex' }, { ...after, linkedStudentId: 'stu-alex' }), 'send');
  assert.equal(
    rankSendOffer({ ...after, linkedStudentId: 'stu-alex' }, { ...after, linkedStudentId: 'stu-alex' }),
    'noop',
  );
  assert.equal(rankSendOffer({ ...before, stripes: undefined, linkedStudentId: 'stu-alex' }, { ...before, stripes: 0, linkedStudentId: 'stu-alex' }), 'noop');
});

test('linking a roster card keeps the student id across a later save', () => {
  resetRoster();
  try {
    const added = addStudent(
      { name: 'Alex', belt: 'White', division: '', gym: '', lastPromotion: '', note: '' },
      { rosterList: 'student' },
    );
    assert.ok(added);
    assert.equal(linkRosterCard(added.id, 'student-local'), null);
    const linked = linkRosterCard(added.id, 'stu-alex');
    assert.equal(linked?.linkedStudentId, 'stu-alex');
    const saved = updateStudent(added.id, {
      name: 'Alex',
      belt: 'Blue',
      division: '',
      gym: '',
      lastPromotion: '2026-11-03',
      note: '',
      stripes: 2,
    });
    assert.equal(saved?.linkedStudentId, 'stu-alex');
    assert.equal(saved?.stripes, 2);
    assert.equal(saved?.rosterList, 'student');
    const round = normalizeRoster(JSON.parse(JSON.stringify(getRoster())));
    assert.equal(round.students.find((row) => row.id === added.id)?.linkedStudentId, 'stu-alex');
    assert.equal(round.students.find((row) => row.id === added.id)?.stripes, 2);
  } finally {
    resetRoster();
  }
});
