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
  freeStudentLicensesForLicense,
  freeStudentLicensesLeft,
  halfOffPoolNote,
  isStudentLicenseCode,
  studentCloudPathAllowed,
  isStudentInviteValue,
  looksLikeStudentInvite,
  studentAccountInvitePath,
  studentClaimWouldDowngrade,
  studentInviteJoinUrl,
  studentJoinRedirectPath,
  studentLicenseClaimUrl,
  STUDENT_INVITE_TYP,
  STUDENT_JOIN_PATH,
  STUDENT_LICENSE_GIVE,
} from './studentLicensePool.ts';
import { accountInvitePath } from './emailLogin.ts';
import { OWNER_ALPHA_LICENSE_ID } from './proBundleMath.ts';

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

test('owner alpha free Student pool is 25; any other license stays at 5', () => {
  assert.equal(freeStudentLicensesForLicense(), 5);
  assert.equal(freeStudentLicensesForLicense('paid-pro-license'), 5);
  assert.equal(freeStudentLicensesForLicense(OWNER_ALPHA_LICENSE_ID), 25);
  assert.equal(freeStudentLicensesLeft(0, 25), 25);
  assert.equal(freeStudentLicensesLeft(1, 25), 24);
  assert.equal(freeStudentLicenseTicker(1, 25), '24 of 25 free Student licenses left');
  assert.equal(freeStudentLicenseTicker(25, 25), '0 of 25 free Student licenses left');
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

test('claim and join links open the account invite screen, and older paths redirect there', () => {
  const code = 'ab'.repeat(32);
  assert.equal(isStudentLicenseCode(code), true);
  assert.equal(
    studentLicenseClaimUrl('https://advantagebjjtimer.com/', code, 'North Gym'),
    `https://advantagebjjtimer.com/account?${new URLSearchParams({ invite: code }).toString()}`,
  );
  assert.equal(
    studentLicenseClaimUrl('https://advantagebjjtimer.com/', code, 'North Gym', 'marty@gym.test'),
    `https://advantagebjjtimer.com/account?${new URLSearchParams({ invite: code, email: 'marty@gym.test' }).toString()}`,
  );
  assert.equal(studentAccountInvitePath(code, 'marty@gym.test'), accountInvitePath(code, 'marty@gym.test'));
  assert.equal(studentJoinRedirectPath('/join/student', `?code=${code}&gym=North+Gym&email=marty@gym.test`), studentAccountInvitePath(code, 'marty@gym.test'));
  assert.equal(studentJoinRedirectPath(`/student/claim/${code}`, '?email=marty@gym.test'), studentAccountInvitePath(code, 'marty@gym.test'));
  assert.equal(studentJoinRedirectPath('/join/student', ''), null);
  assert.equal(studentJoinRedirectPath('/student', `?code=${code}`), null);
  const page = readFileSync(new URL('../pages/student/StudentLicenseClaim.tsx', import.meta.url), 'utf8');
  assert.match(page, /Navigate to=\{studentClaimRedirectTo/);
  assert.doesNotMatch(page, /Claim Student Edition/);
  assert.equal(ADD_TO_HOME_TITLE, 'Add Advantage to your Home Screen');
  assert.equal(ADD_TO_HOME_IPHONE, 'iPhone: Share > Add to Home Screen');
  assert.equal(ADD_TO_HOME_ANDROID, 'Android: Install / Add to Home screen');
  assert.equal(ADD_TO_HOME_EMAIL, 'then sign in with this same email inside the app if asked');
});

test('join links open /account with the invite filled in, and signed or hex codes are accepted', () => {
  const code = 'ab'.repeat(32);
  const signed = 'aaa.bbb.ccc';
  assert.equal(isStudentInviteValue(code), true);
  assert.equal(isStudentInviteValue(signed), true);
  assert.equal(isStudentInviteValue('not-a-code'), false);
  assert.equal(
    studentInviteJoinUrl('https://advantagebjjtimer.com/', signed, 'North Gym'),
    `https://advantagebjjtimer.com/account?${new URLSearchParams({ invite: signed }).toString()}`,
  );
  assert.equal(
    studentInviteJoinUrl('https://advantagebjjtimer.com/', signed, 'North Gym', 'marty@gym.test'),
    `https://advantagebjjtimer.com/account?${new URLSearchParams({ invite: signed, email: 'marty@gym.test' }).toString()}`,
  );
  assert.equal(looksLikeStudentInvite(code), true);
  assert.equal(looksLikeStudentInvite('not-a-code'), false);
  const payload = Buffer.from(JSON.stringify({ typ: STUDENT_INVITE_TYP, code }), 'utf8').toString('base64url');
  const studentTok = `aaaaaaaaaaa.${payload}.bbbbbbbbbbb`;
  const seatTok = `aaaaaaaaaaa.${Buffer.from(JSON.stringify({ typ: 'seat-invite' }), 'utf8').toString('base64url')}.bbbbbbbbbbb`;
  assert.equal(looksLikeStudentInvite(studentTok), true);
  assert.equal(looksLikeStudentInvite(`https://advantagebjjtimer.com/join/student?code=${studentTok}`), true);
  assert.equal(looksLikeStudentInvite(seatTok), false);
  assert.equal(STUDENT_JOIN_PATH, '/join/student');
  assert.equal(STUDENT_INVITE_TYP, 'student-invite');
  assert.equal(STUDENT_LICENSE_GIVE, 'Invite a student (Student Edition only)');
});

test('a student claim does not overwrite a higher seat or license already on the phone', () => {
  assert.equal(studentClaimWouldDowngrade(null), false);
  assert.equal(studentClaimWouldDowngrade({ src: 'free', tier: 'student', grants: ['student', 'white'] }), false);
  assert.equal(studentClaimWouldDowngrade({ src: 'seat', tier: 'seat', grants: ['pro', 'coach', 'student'] }), true);
  assert.equal(studentClaimWouldDowngrade({ src: 'stripe', tier: 'pro', grants: ['pro', 'coach', 'student'] }), true);
  assert.equal(studentClaimWouldDowngrade({ src: 'stripe', tier: 'coach', grants: ['coach', 'student'] }), true);
  assert.equal(studentClaimWouldDowngrade({ src: 'stripe', tier: 'media', grants: ['media'] }), true);
  // One no-downgrade rule (passDowngrade.ts): White < Student on the ladder, so a Student claim keeps White open.
  assert.equal(studentClaimWouldDowngrade({ src: 'stripe', tier: 'white', grants: ['white'] }), false);
  assert.equal(studentClaimWouldDowngrade({ src: 'owner', tier: 'owner', grants: ['pro'] }), true);
  assert.equal(studentClaimWouldDowngrade({ src: 'seat', tier: 'seat', grants: [], subs: { state: 'locked' } }), false);
});

test('the Pro invite panel and public join page are wired to Student Edition only', () => {
  const panel = readFileSync(new URL('../components/InstructorInvitePanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /StudentLicenseOwnerPanel/);
  assert.match(panel, />\s*Email\s*</);
  assert.match(panel, /Issue invite/);
  assert.match(panel, /STUDENT_LICENSE_GIVE/);
  assert.match(panel, /isInviteEmail/);
  assert.match(panel, /hideIssue/);
  assert.doesNotMatch(panel, /Instructor email/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/join\/student"/);
  assert.match(app, /studentJoinRedirectPath/);
  const share = readFileSync(new URL('../components/StudentLicenseShare.tsx', import.meta.url), 'utf8');
  assert.match(share, /Copy link/);
  assert.match(share, /Download QR PNG/);
  assert.match(share, /Share/);
  assert.match(share, /studentInviteJoinUrl/);
  assert.match(share, /confirms their email, and chooses a password/);
  const account = readFileSync(new URL('../pages/Account.tsx', import.meta.url), 'utf8');
  assert.match(account, /INVITE_WELCOME_STUDENT/);
  assert.match(account, /looksLikeStudentInvite\(inviteCode\)/);
});
