import assert from 'node:assert/strict';
import test from 'node:test';
import { isNewerStudentRank, rosterRankHint, rosterRankLabel, studentOwnsRosterRank } from './studentOwnedRank.ts';
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
  assert.match(rosterRankHint(row) ?? '', /Not set yet/);
  assert.equal(rosterRankLabel({ belt: 'Blue', linkedStudentId: 'stu-haven', studentRankAt: 1 }), 'Blue');
  assert.equal(rosterRankHint({ belt: 'Blue', linkedStudentId: 'stu-haven', studentRankAt: 1 }), 'Set by the student');
});

test('isNewerStudentRank ignores placeholders and older stamps', () => {
  const local = { belt: 'Blue', studentRankAt: 200, linkedStudentId: 's' };
  assert.equal(isNewerStudentRank({ belt: 'White', rankUnset: true, studentRankAt: 300 }, local), false);
  assert.equal(isNewerStudentRank({ belt: 'White' }, local), false);
  assert.equal(isNewerStudentRank({ belt: 'Purple', studentRankAt: 100 }, local), false);
  assert.equal(isNewerStudentRank({ belt: 'Purple', studentRankAt: 200 }, local), true);
  assert.equal(isNewerStudentRank({ belt: 'Purple', studentRankAt: 300 }, { belt: 'White', rankUnset: true }), true);
});

test('updateStudent ignores instructor belt edits on a linked card, and a student submission wins', () => {
  resetRoster();
  const card = addStudent({ name: 'Haven', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  linkRosterCard(card.id, 'stu-haven');
  markRosterRankUnset(card.id);
  const blocked = updateStudent(card.id, { belt: 'Purple', stripes: 4, note: 'Coach note' });
  assert.equal(blocked?.belt, 'White');
  assert.equal(blocked?.stripes, undefined);
  assert.equal(blocked?.note, 'Coach note');
  assert.equal(blocked?.rankUnset, true);
  const applied = updateStudent(card.id, { belt: 'Blue', stripes: 2 }, { source: 'student-submission', now: 50 });
  assert.equal(applied?.belt, 'Blue');
  assert.equal(applied?.stripes, 2);
  assert.equal(applied?.studentRankAt, 50);
  assert.equal(applied?.rankUnset, undefined);
  assert.equal(rosterRankLabel(applied!), 'Blue');
});
