import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ownerIdentitySheetVisible } from './ownerIdentitySheet.ts';

const coach = readFileSync('src/pages/Coach.tsx', 'utf8');
const instructor = readFileSync('src/pages/CoachUnlimited.tsx', 'utf8');
const pro = readFileSync('src/pages/Pro.tsx', 'utf8');
const cloud = readFileSync('src/pages/ProPlusCloud.tsx', 'utf8');
const student = readFileSync('src/pages/student/StudentMenus.tsx', 'utf8');
const media = readFileSync('src/pages/MediaEditionHub.tsx', 'utf8');

test('the instructor identity sheet is no longer mounted on Pro or Pro + Cloud', () => {
  const show = (page: 'pro' | 'pro-cloud' | 'instructor' | 'student' | 'media' | 'other', proUnlocked: boolean, seated = false) =>
    ownerIdentitySheetVisible({ page, proUnlocked, seated });
  assert.equal(show('pro', true), false);
  assert.equal(show('pro-cloud', true), false);
  assert.equal(show('pro', true, true), false);
  assert.equal(show('instructor', true), false);
  assert.doesNotMatch(pro, /InstructorSheet/);
  assert.doesNotMatch(cloud, /InstructorSheet/);
  assert.doesNotMatch(pro, /ownerIdentitySheetVisible/);
  assert.doesNotMatch(cloud, /ownerIdentitySheetVisible/);
  assert.match(pro, /GymCharacterSheet/);
  assert.match(cloud, /GymCharacterSheet/);
});

test('Instructor Edition mounts the character sheet once, and other hubs do not', () => {
  assert.match(instructor, /<InstructorSheet \/>/);
  assert.equal(instructor.split('<InstructorSheet />').length - 1, 1);
  assert.doesNotMatch(coach, /InstructorSheet/);
  assert.match(coach, /<GymCoachPulse \/>/);
  assert.match(coach, /<BeltHeader\s+kind="brown"/);
  assert.match(student, /<BeltHeader kind="blue"/);
  assert.doesNotMatch(student, /InstructorSheet/);
  assert.doesNotMatch(media, /InstructorSheet/);
});
