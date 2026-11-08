import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ownerIdentitySheetVisible } from './ownerIdentitySheet.ts';

const coach = readFileSync('src/pages/Coach.tsx', 'utf8');
const pro = readFileSync('src/pages/Pro.tsx', 'utf8');
const cloud = readFileSync('src/pages/ProPlusCloud.tsx', 'utf8');
const student = readFileSync('src/pages/student/StudentMenus.tsx', 'utf8');
const media = readFileSync('src/pages/MediaEditionHub.tsx', 'utf8');

test('the Owner identity sheet is only on an unseated Pro or Pro + Cloud page', () => {
  const show = (page: 'pro' | 'pro-cloud' | 'instructor' | 'student' | 'media' | 'other', proUnlocked: boolean, seated = false) =>
    ownerIdentitySheetVisible({ page, proUnlocked, seated });
  assert.equal(show('pro', true), true);
  assert.equal(show('pro-cloud', true), true);
  assert.equal(show('pro', true, true), false);
  assert.equal(show('pro-cloud', false), false);
  assert.equal(show('instructor', true), false);
  assert.equal(show('instructor', false), false);
  assert.equal(show('student', true), false);
  assert.equal(show('student', false), false);
  assert.equal(show('media', true), false);
  assert.equal(show('other', true), false);
});

test('Instructor Edition does not mount the Owner sheet, and its header is the brown belt', () => {
  assert.doesNotMatch(coach, /InstructorSheet/);
  assert.match(coach, /<GymCoachPulse \/>/);
  assert.match(coach, /<BeltHeader\s+kind="brown"/);
  assert.match(student, /<BeltHeader kind="blue"/);
  assert.doesNotMatch(student, /InstructorSheet/);
  assert.doesNotMatch(media, /InstructorSheet/);
});

test('Pro and Pro + Cloud ask the same visibility helper and do not treat Cloud as Pro', () => {
  assert.match(pro, /ownerIdentitySheetVisible\(\{ page: 'pro'/);
  assert.match(cloud, /ownerIdentitySheetVisible\(\{ page: 'pro-cloud'/);
  assert.match(pro, /proUnlocked: door\.proUnlocked/);
  assert.match(cloud, /proUnlocked: door\.proUnlocked/);
  assert.match(readFileSync('src/lib/ownerIdentitySheet.ts', 'utf8'), /if \(input\.seated \|\| !input\.proUnlocked\) return false/);
});
