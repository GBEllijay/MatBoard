import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combinedDuplicateCard,
  findRosterDuplicates,
  mergeDuplicateRosterCardsOnDevice,
  mergeDuplicateStudents,
} from './rosterDuplicates.ts';
import { addStudent, getRoster, isArchivedStudent, linkRosterCard, resetRoster } from './rosterStore.ts';

test('findRosterDuplicates groups by student id, then by normalized name', () => {
  resetRoster();
  const havenA = addStudent({ name: 'Haven', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  const havenB = addStudent({ name: 'HAVEN', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  linkRosterCard(havenA.id, 'stu-haven');
  linkRosterCard(havenB.id, 'stu-haven');
  const alexA = addStudent({ name: 'Alex Rivera', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  const alexB = addStudent({ name: 'alex   rivera', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  const groups = findRosterDuplicates(getRoster().students);
  assert.equal(groups.length, 2);
  const byId = groups.find((group) => group.reason === 'linked-student');
  const byName = groups.find((group) => group.reason === 'name');
  assert.ok(byId && byId.cards.some((row) => row.id === havenA.id) && byId.cards.some((row) => row.id === havenB.id));
  assert.ok(byName && byName.cards.some((row) => row.id === alexA.id) && byName.cards.some((row) => row.id === alexB.id));
});

test('mergeDuplicateStudents keeps the chosen card, fills blanks, and archives the other', () => {
  resetRoster();
  const keep = addStudent({ name: 'Haven', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: 'Coach note' }, { rosterList: 'student' })!;
  const drop = addStudent({ name: 'Haven', belt: 'Blue', division: 'Kids', gym: 'GB', lastPromotion: '', lastPromotionDetail: '', note: '' }, { rosterList: 'student' })!;
  linkRosterCard(drop.id, 'stu-haven');
  const merged = mergeDuplicateStudents(getRoster().students, keep.id, drop.id);
  assert.ok(merged.ok);
  if (!merged.ok) return;
  assert.equal(merged.kept.id, keep.id);
  assert.equal(merged.kept.note, 'Coach note');
  assert.equal(merged.kept.division, 'Kids');
  assert.equal(merged.kept.gym, 'GB');
  assert.equal(merged.kept.linkedStudentId, 'stu-haven');
  assert.equal(merged.kept.belt, 'White', 'the kept card wins conflicts');
  assert.ok(isArchivedStudent(merged.dropped));
  const device = mergeDuplicateRosterCardsOnDevice(keep.id, drop.id);
  assert.ok(device.ok);
  if (!device.ok) return;
  assert.equal(getRoster().students.filter((row) => row.name === 'Haven' && !isArchivedStudent(row)).length, 1);
});
