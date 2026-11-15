import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureRosterCardForStudent,
  ensureRosterCardsForAssessments,
  identityFromAssessment,
  linkedRosterCardForStudent,
  normalizeRosterPersonName,
} from './rosterCardFromInbox.ts';
import { rosterRankLabel } from './studentOwnedRank.ts';
import { acceptCardShare, receiveCardShare, type CardShareRoster } from './coachStudentInbox.ts';
import { assessmentItemId } from './instructorAssessments.ts';
import { createStudentCardShare } from './studentCardShare.ts';
import { addStudent, getRoster, linkRosterCard, resetRoster, updateStudent } from './rosterStore.ts';
import { testMemory } from './testPackets.ts';

function item(studentId: string, name: string, date = '2026-11-14') {
  const submissionId = `${studentId}-${date}`;
  return {
    kind: 'instructor-assessment-item' as const,
    v: 1 as const,
    id: assessmentItemId(studentId, submissionId),
    license: 'gym-1',
    instructorId: 'owner',
    route: 'connect-code' as const,
    status: 'pending' as const,
    submission: {
      kind: 'student-assessment-submission' as const,
      v: 1 as const,
      submissionId,
      studentId,
      profileId: 'default',
      date,
      note: '',
      scores: { mindset: 3 },
      studentName: name,
      sentAt: 1,
    },
    receivedAt: 1,
  };
}

test('normalizeRosterPersonName is exact after trim, space collapse, and case-fold', () => {
  assert.equal(normalizeRosterPersonName('  Haven   Cole  '), normalizeRosterPersonName('haven cole'));
  assert.notEqual(normalizeRosterPersonName('Haven Cole'), normalizeRosterPersonName('Haven'));
});

test('ensureRosterCardForStudent creates a linked card from an assessment and is idempotent', () => {
  resetRoster();
  const first = ensureRosterCardForStudent({ studentId: 'stu-haven', name: 'Haven' }, { actor: 'owner' });
  assert.equal(first.status, 'created');
  if (first.status !== 'created') return;
  assert.equal(first.card.name, 'Haven');
  assert.equal(first.card.belt, 'White');
  assert.equal(first.card.rankUnset, true);
  assert.equal(rosterRankLabel(first.card), 'Not set yet');
  assert.equal(first.card.rosterList, 'student');
  assert.equal(first.card.linkedStudentId, 'stu-haven');
  const second = ensureRosterCardForStudent({ studentId: 'stu-haven', name: 'Haven' }, { actor: 'owner' });
  assert.equal(second.status, 'existing');
  if (second.status !== 'existing') return;
  assert.equal(second.card.id, first.card.id);
  assert.equal(getRoster().students.filter((row) => row.linkedStudentId === 'stu-haven').length, 1);
  const batch = ensureRosterCardsForAssessments([item('stu-haven', 'Haven'), item('stu-haven', 'Haven')], { actor: 'owner' });
  assert.equal(batch.created.length, 0);
  assert.equal(batch.existing.length, 1);
  assert.equal(batch.existing[0].id, first.card.id);
});

test('ensureRosterCardForStudent links the one unlinked same-name student card', () => {
  resetRoster();
  const row = addStudent(
    { name: 'Haven', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' },
    { rosterList: 'student' },
  )!;
  const result = ensureRosterCardForStudent({ studentId: 'stu-haven', name: 'HAVEN' }, { actor: 'coach' });
  assert.equal(result.status, 'linked');
  if (result.status !== 'linked') return;
  assert.equal(result.card.id, row.id);
  assert.equal(result.card.linkedStudentId, 'stu-haven');
  assert.equal(getRoster().students.filter((r) => r.rosterList === 'student' && r.name === 'Haven').length, 1);
});

test('ensureRosterCardForStudent does not guess when two same-name cards exist, and assistants cannot add one', () => {
  resetRoster();
  addStudent(
    { name: 'Alex', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' },
    { rosterList: 'student' },
  );
  addStudent(
    { name: 'Alex', belt: 'Purple', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' },
    { rosterList: 'student' },
  );
  const created = ensureRosterCardForStudent({ studentId: 'stu-alex', name: 'Alex' }, { actor: 'owner' });
  assert.equal(created.status, 'created');
  if (created.status !== 'created') return;
  assert.equal(created.card.linkedStudentId, 'stu-alex');
  assert.equal(getRoster().students.filter((row) => row.name === 'Alex').length, 3);

  resetRoster();
  const skipped = ensureRosterCardForStudent({ studentId: 'stu-haven', name: 'Haven' }, { actor: 'assistant' });
  assert.deepEqual(skipped, { status: 'skipped', reason: 'not-allowed' });
  assert.equal(getRoster().students.length, 0);
});

test('a later card share accepted as new merges into the auto-created linked card', () => {
  resetRoster();
  const made = ensureRosterCardForStudent({ studentId: 'stu-haven', name: 'Haven' }, { actor: 'owner' });
  assert.equal(made.status, 'created');
  if (made.status !== 'created') return;
  const storage = testMemory();
  const built = createStudentCardShare({
    studentId: 'stu-haven',
    gym: { plusCloud: true },
    card: { name: 'Haven', belt: 'Blue', stripes: 2, division: 'Kids', gym: 'GB Ellijay' },
    parentRequired: false,
    shareId: 'share-haven',
    now: 9,
  });
  assert.ok(built.ok);
  if (!built.ok) return;
  assert.equal(receiveCardShare(storage, built.share), 'pending');
  const roster: CardShareRoster = {
    get students() {
      return getRoster().students;
    },
    add: addStudent,
    update: updateStudent,
    link: linkRosterCard,
  };
  const accepted = acceptCardShare(storage, 'share-haven', 'coach', { mode: 'new' }, roster);
  assert.ok(accepted.ok);
  if (!accepted.ok) return;
  assert.equal(accepted.decision, 'merged');
  assert.equal(accepted.card.id, made.card.id);
  assert.equal(accepted.card.linkedStudentId, 'stu-haven');
  assert.equal(accepted.card.belt, 'Blue', 'the shared belt replaces the auto-default White');
  assert.equal(accepted.card.rankUnset, undefined);
  assert.ok((accepted.card.studentRankAt ?? 0) > 0);
  assert.equal(accepted.card.stripes, 2);
  assert.equal(accepted.card.division, 'Kids');
  assert.equal(accepted.card.gym, 'GB Ellijay');
  assert.equal(getRoster().students.filter((row) => row.linkedStudentId === 'stu-haven').length, 1);
  assert.equal(identityFromAssessment(item('stu-haven', 'Haven')).studentId, 'stu-haven');
  assert.equal(linkedRosterCardForStudent(getRoster().students, 'stu-haven')?.id, made.card.id);
});

test('a share with no division or gym leaves coach-set values, and a name-only share does not zero stripes', () => {
  resetRoster();
  const made = ensureRosterCardForStudent(
    { studentId: 'stu-haven', name: 'Haven', belt: 'White', division: 'Kids', gym: 'GB Ellijay', stripes: 2 },
    { actor: 'owner' },
  );
  assert.equal(made.status, 'created');
  if (made.status !== 'created') return;
  const primed = updateStudent(made.card.id, { division: 'Kids', gym: 'GB Ellijay' })!;
  assert.equal(primed.stripes, 2);
  const storage = testMemory();
  const named = createStudentCardShare({
    studentId: 'stu-haven',
    gym: { plusCloud: true },
    card: { name: 'Haven Cole' },
    parentRequired: false,
    shareId: 'share-name-only',
    now: 10,
  });
  assert.ok(named.ok);
  if (!named.ok) return;
  assert.equal(receiveCardShare(storage, named.share), 'pending');
  const roster = {
    get students() {
      return getRoster().students;
    },
    add: addStudent,
    update: updateStudent,
    link: linkRosterCard,
  };
  const accepted = acceptCardShare(storage, 'share-name-only', 'coach', { mode: 'new' }, roster);
  assert.ok(accepted.ok);
  if (!accepted.ok) return;
  assert.equal(accepted.card.name, 'Haven Cole');
  assert.equal(accepted.card.belt, 'White');
  assert.equal(accepted.card.division, 'Kids');
  assert.equal(accepted.card.gym, 'GB Ellijay');
  assert.equal(accepted.card.stripes, 2);
});
