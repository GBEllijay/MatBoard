import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ADD_TO_HOME_ANDROID,
  ADD_TO_HOME_EMAIL,
  ADD_TO_HOME_IPHONE,
  ADD_TO_HOME_TITLE,
  FREE_STUDENT_LICENSES,
  STUDENT_LICENSE_EMPTY,
  freeStudentLicenseTicker,
  freeStudentLicensesLeft,
  halfOffPoolNote,
  isStudentLicenseCode,
  studentCloudPathAllowed,
  studentLicenseClaimUrl,
} from './studentLicensePool.ts';

const STUDENT = 'student-license-id-1';

test('free Student license pool is 5, and a revoke returns one immediately', () => {
  assert.equal(FREE_STUDENT_LICENSES, 5);
  assert.equal(freeStudentLicensesLeft(0), 5);
  assert.equal(freeStudentLicensesLeft(1), 4);
  assert.equal(freeStudentLicensesLeft(5), 0);
  assert.equal(freeStudentLicensesLeft(6), 0);
  assert.equal(freeStudentLicenseTicker(0), '5 of 5 free Student licenses left');
  assert.equal(freeStudentLicenseTicker(5), STUDENT_LICENSE_EMPTY.replace('No free Student licenses left.', '0 of 5 free Student licenses left'));
  assert.equal(freeStudentLicenseTicker(5), '0 of 5 free Student licenses left');
  const afterRevoke = freeStudentLicensesLeft(4);
  assert.equal(afterRevoke, 1);
  assert.equal(freeStudentLicenseTicker(4), '1 of 5 free Student licenses left');
  assert.match(halfOffPoolNote(100), /100-use half-off code still has 100 uses/);
});

test('student cloud scope is only that student\'s own files', () => {
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/inbox/update.json`, STUDENT), true);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/photos/pending/photo-1.json`, STUDENT), true);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/photos/approved/photo-1.png`, STUDENT), true);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/events/open.json`, STUDENT), true);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/from-instructor/2026-11-04/clip.mp4`, STUDENT), true);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/from-instructor/2026-11-04.json`, STUDENT), false);
  assert.equal(studentCloudPathAllowed(`students/other-student/from-instructor/2026-11-04/clip.mp4`, STUDENT), false);
  assert.equal(studentCloudPathAllowed('lessons/current/2026-W45/2026-11-04.json', STUDENT), false);
  assert.equal(studentCloudPathAllowed('lessons/current/2026-W45/media/2026-11-04/clip.mp4', STUDENT), false);
  assert.equal(studentCloudPathAllowed('videos/daily/2026-11-04/class.mp4', STUDENT), false);
  assert.equal(studentCloudPathAllowed('roster/private/owner.json', STUDENT), false);
  assert.equal(studentCloudPathAllowed('roster/master.json', STUDENT), false);
  assert.equal(studentCloudPathAllowed('skins/abcdefghi', STUDENT), false);
  assert.equal(studentCloudPathAllowed('pending/replays/seat/2026-11-04/clip.mp4', STUDENT), false);
  assert.equal(studentCloudPathAllowed('students/other-student/inbox/update.json', STUDENT), false);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/inbox/nested/update.json`, STUDENT), false);
  assert.equal(studentCloudPathAllowed(`students/${STUDENT}/../roster/private/owner.json`, STUDENT), false);
});

test('claim links carry the code, and the home screen tip is on the claim page', () => {
  const code = 'ab'.repeat(32);
  assert.equal(isStudentLicenseCode(code), true);
  assert.equal(studentLicenseClaimUrl('https://advantagebjjtimer.com/', code, 'North Gym'), `https://advantagebjjtimer.com/student/claim/${code}?gym=North%20Gym`);
  const page = readFileSync(new URL('../pages/student/StudentLicenseClaim.tsx', import.meta.url), 'utf8');
  assert.match(page, /\{ADD_TO_HOME_TITLE\}/);
  assert.match(page, /\{ADD_TO_HOME_IPHONE\}/);
  assert.match(page, /\{ADD_TO_HOME_ANDROID\}/);
  assert.match(page, /\{ADD_TO_HOME_EMAIL\}/);
  assert.equal(ADD_TO_HOME_TITLE, 'Add Advantage to your Home Screen');
  assert.equal(ADD_TO_HOME_IPHONE, 'iPhone: Share > Add to Home Screen');
  assert.equal(ADD_TO_HOME_ANDROID, 'Android: Install / Add to Home screen');
  assert.equal(ADD_TO_HOME_EMAIL, 'then sign in with this same email inside the app if asked');
});
