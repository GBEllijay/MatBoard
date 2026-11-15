import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROSTER_RANK_STAYS_LOCAL,
  incomingRankSource,
  isNewerStudentRank,
  rosterRankHint,
  rosterRankLabel,
  stripCoachToStudentRank,
  studentOwnsRosterRank,
} from './studentOwnedRank.ts';
import {
  addStudent,
  linkRosterCard,
  markRosterRankUnset,
  resetRoster,
  updateStudent,
} from './rosterStore.ts';

test('studentOwnsRosterRank is only for non-guest linked cards', () => {
  assert.equal(studentOwnsRosterRank({ belt: 'Blue', linkedStudentId: 'stu-haven' }), true);
  assert.equal(studentOwnsRosterRank({ belt: 'Blue', linkedStudentId: 'stu-haven', guestId: 'guest-1' }), false);
  assert.equal(studentOwnsRosterRank({ belt: 'Blue' }), false);
});

test('rosterRankLabel shows Not set yet on an unset linked card, not White', () => {
  const row = { belt: 'White', linkedStudentId: 'stu-haven', rankUnset: true };
  assert.equal(rosterRankLabel(row), 'Not set yet');
  assert.equal(rosterRankHint(row), ROSTER_RANK_STAYS_LOCAL);
  assert.equal(rosterRankLabel({ belt: 'Blue', linkedStudentId: 'stu-haven', studentRankAt: 1 }), 'Blue');
  assert.equal(rosterRankHint({ belt: 'Blue', linkedStudentId: 'stu-haven', studentRankAt: 1 }), ROSTER_RANK_STAYS_LOCAL);
  assert.equal(rosterRankHint({ belt: 'Blue', linkedStudentId: 'stu-haven' }), ROSTER_RANK_STAYS_LOCAL);
  assert.equal(rosterRankLabel({ belt: 'Purple', linkedStudentId: 'stu-haven', rankUnset: true, coachRankAt: 9 }), 'Purple');
  assert.equal(rosterRankHint({ belt: 'Blue' }), null);
});

test('isNewerStudentRank ignores placeholders and older stamps', () => {
  const local = { belt: 'Blue', studentRankAt: 200, linkedStudentId: 's' };
  assert.equal(isNewerStudentRank({ belt: 'White', rankUnset: true, studentRankAt: 300 }, local), false);
  assert.equal(isNewerStudentRank({ belt: 'White' }, local), false);
  assert.equal(isNewerStudentRank({ belt: 'Purple', studentRankAt: 100 }, local), false);
  assert.equal(isNewerStudentRank({ belt: 'Purple', studentRankAt: 200 }, local), true);
  assert.equal(isNewerStudentRank({ belt: 'Purple', studentRankAt: 300 }, { belt: 'White', rankUnset: true }), true);
});

test('incomingRankSource lets a later student submission win, and a later coach edit apply', () => {
  const localStudent = { belt: 'Blue', studentRankAt: 200, linkedStudentId: 's' };
  assert.equal(incomingRankSource({ belt: 'Purple', studentRankAt: 250 }, localStudent), 'student');
  assert.equal(incomingRankSource({ belt: 'White', coachRankAt: 150 }, localStudent), null);
  assert.equal(incomingRankSource({ belt: 'Purple', coachRankAt: 250 }, localStudent), 'coach');
  const localCoach = { belt: 'Purple', studentRankAt: 100, coachRankAt: 300, linkedStudentId: 's' };
  assert.equal(incomingRankSource({ belt: 'Blue', studentRankAt: 250 }, localCoach), null);
  assert.equal(incomingRankSource({ belt: 'Blue', studentRankAt: 350 }, localCoach), 'student');
  assert.equal(incomingRankSource({ belt: 'Brown', coachRankAt: 400 }, localCoach), 'coach');
  assert.equal(incomingRankSource({ belt: 'White' }, localCoach), null);
});

test('a coach can edit belt on a linked card; a later student submission still wins', () => {
  resetRoster();
  const card = addStudent({ name: 'Haven', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  linkRosterCard(card.id, 'stu-haven');
  markRosterRankUnset(card.id);
  const edited = updateStudent(card.id, { belt: 'Purple', stripes: 4, note: 'Coach note' }, { now: 40 });
  assert.equal(edited?.belt, 'Purple');
  assert.equal(edited?.stripes, 4);
  assert.equal(edited?.note, 'Coach note');
  assert.equal(edited?.coachRankAt, 40);
  assert.equal(edited?.rankUnset, undefined);
  assert.equal(rosterRankLabel(edited!), 'Purple');
  const applied = updateStudent(card.id, { belt: 'Blue', stripes: 2 }, { source: 'student-submission', now: 50 });
  assert.equal(applied?.belt, 'Blue');
  assert.equal(applied?.stripes, 2);
  assert.equal(applied?.studentRankAt, 50);
  assert.equal(applied?.coachRankAt, 40);
  assert.equal(applied?.rankUnset, undefined);
  assert.equal(rosterRankLabel(applied!), 'Blue');
  const follow = updateStudent(card.id, { belt: 'Brown', stripes: 1 }, { source: 'follow-student-rank', now: 60 });
  assert.equal(follow?.belt, 'Brown');
  assert.equal(follow?.studentRankAt, 50);
  assert.equal(follow?.coachRankAt, 40);
});

test('stripCoachToStudentRank removes only promotions, stripes, and last-promotion', () => {
  const packet = stripCoachToStudentRank({
    kind: 'coach-assessment-update',
    studentId: 'stu-haven',
    belt: 'Purple',
    stripes: 4,
    lastPromotion: '2026-01-01',
    lastPromotionDetail: '4th stripe',
    suggestedVideoLinks: ['https://example.com/guard'],
    note: 'Keep working the knee slice.',
    assessment: {
      date: '2026-11-14',
      scores: { guard: 4, passing: 3 },
      belt: 'Purple',
      stripes: 4,
      note: 'Solid day',
    },
    rankUpdate: { belt: 'Purple', stripeCount: 4, promotionDate: '2026-11-01', note: 'Congrats' },
  });
  assert.equal(packet.belt, undefined);
  assert.equal(packet.stripes, undefined);
  assert.equal(packet.lastPromotion, undefined);
  assert.equal(packet.lastPromotionDetail, undefined);
  assert.deepEqual(packet.suggestedVideoLinks, ['https://example.com/guard']);
  assert.equal(packet.note, 'Keep working the knee slice.');
  assert.equal(packet.assessment.scores.guard, 4);
  assert.equal(packet.assessment.note, 'Solid day');
  assert.equal(packet.assessment.belt, undefined);
  assert.equal(packet.assessment.stripes, undefined);
  assert.equal(packet.rankUpdate?.belt, undefined);
  assert.equal(packet.rankUpdate?.stripeCount, undefined);
  assert.equal(packet.rankUpdate?.promotionDate, undefined);
  assert.equal(packet.rankUpdate?.note, 'Congrats');

  const progress = stripCoachToStudentRank({
    kind: 'coach-belt-progress-update',
    beltProgress: { belt: 'blue', benchmarks: [{ targetId: 't1', name: 'Guard', coachStatus: 'ready' }], note: 'Watch this drill' },
  });
  assert.equal(progress.beltProgress.belt, 'blue');
  assert.equal(progress.beltProgress.benchmarks[0].name, 'Guard');
  assert.equal(progress.beltProgress.note, 'Watch this drill');
});
