/**
 * License share pages: who sees Share code, which header each page wears,
 * that each link is built from the existing invite / academy path, and the copy fallback.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { academyPathway, academyPathwayUrl, parseAcademyInput } from './academyPathway.ts';
import { instructorInviteLink, type InstructorSeat } from './instructorSeats.ts';
import {
  INSTRUCTOR_SHARE_HEADER,
  INSTRUCTOR_SHARE_PATH,
  STUDENT_SHARE_HEADER,
  STUDENT_SHARE_PATH,
  copyShareLink,
  instructorSeatTicker,
  instructorShareLink,
  licenseShareKinds,
  shareButtonVisible,
  shareHeaderFor,
  sharePathFor,
  shareableInvites,
  studentShareLinks,
} from './licenseShare.ts';
import { OWNER_ALPHA_LICENSE_ID } from './proBundleMath.ts';

function seat(id: string, status: InstructorSeat['status']): InstructorSeat {
  return {
    id,
    gymId: 'gym',
    email: `${id}@gym.test`,
    status,
    issuedAt: 1,
    presetId: 'coach',
    permissions: {} as InstructorSeat['permissions'],
    inviteToken: `tok-${id}`,
  };
}

test('Share code shows only for an Instructor Edition or Pro owner', () => {
  assert.deepEqual(licenseShareKinds({ proUnlocked: true, coachUnlocked: false, seated: false }), ['instructor', 'student']);
  assert.deepEqual(licenseShareKinds({ proUnlocked: false, coachUnlocked: true, seated: false }), ['student']);
  assert.deepEqual(licenseShareKinds({ proUnlocked: false, coachUnlocked: false, seated: false }), []);
  // Any signed-in seat (assistant coach, coach, program director) cannot invite, so no button.
  assert.deepEqual(licenseShareKinds({ proUnlocked: true, coachUnlocked: true, seated: true }), []);
  assert.equal(shareButtonVisible({ proUnlocked: false, coachUnlocked: false, seated: false }), false);
  assert.equal(shareButtonVisible({ proUnlocked: true, coachUnlocked: false, seated: true }), false);
});

test('each page has its own header and path', () => {
  assert.equal(shareHeaderFor('instructor'), 'Advantage Instructor Edition');
  assert.equal(shareHeaderFor('student'), 'Advantage Student Edition');
  assert.equal(INSTRUCTOR_SHARE_HEADER, 'Advantage Instructor Edition');
  assert.equal(STUDENT_SHARE_HEADER, 'Advantage Student Edition');
  assert.equal(sharePathFor('instructor'), INSTRUCTOR_SHARE_PATH);
  assert.equal(sharePathFor('student'), STUDENT_SHARE_PATH);
  // Both live under the Coach Unlimited paid chunk path.
  assert.match(INSTRUCTOR_SHARE_PATH, /^\/coach-unlimited\//);
  assert.match(STUDENT_SHARE_PATH, /^\/coach-unlimited\//);
});

test('instructor link is the existing seat invite link for an issued, unclaimed seat', () => {
  const seats = [seat('a', 'active'), seat('b', 'invited'), seat('c', 'revoked')];
  const open = shareableInvites(seats);
  assert.deepEqual(open.map((row) => row.id), ['b']);
  assert.equal(instructorShareLink(open[0], 'https://gym.test'), instructorInviteLink('tok-b', 'https://gym.test'));
  assert.equal(instructorShareLink(open[0], 'https://gym.test'), 'https://gym.test/account?invite=tok-b');
});

test('seat ticker reads the local archive against the seat cap', () => {
  assert.equal(instructorSeatTicker([]), '5 of 5 coach seats left');
  assert.equal(instructorSeatTicker([seat('a', 'active'), seat('b', 'invited'), seat('c', 'revoked')]), '3 of 5 coach seats left');
  assert.equal(instructorSeatTicker([], OWNER_ALPHA_LICENSE_ID), '20 of 20 coach seats left');
  assert.equal(
    instructorSeatTicker([seat('a', 'active'), seat('b', 'invited'), seat('c', 'revoked')], OWNER_ALPHA_LICENSE_ID),
    '18 of 20 coach seats left',
  );
});

test('student link is the existing academy pathway for each connected folder', () => {
  const google = { folderId: 'driveFolder123', folderName: 'Gym Academy' };
  const oneDrive = { folderId: 'ONEDRIVE!123', folderName: 'Gym OneDrive' };
  const links = studentShareLinks({ google, oneDrive, gymName: 'Ellijay', license: 'lic_12345678', origin: 'https://gym.test' });
  assert.deepEqual(links.map((row) => row.provider), ['googleDrive', 'oneDrive']);
  const expected = academyPathway({ provider: 'googleDrive', ...google, gymName: 'Ellijay', license: 'lic_12345678' });
  assert.ok(expected);
  assert.equal(links[0].url, academyPathwayUrl(expected, 'https://gym.test'));
  assert.match(links[0].url, /^https:\/\/gym\.test\/student\/connections\?academy=/);
  const parsed = parseAcademyInput(links[0].url);
  assert.equal(parsed?.folderId, 'driveFolder123');
  assert.equal(parsed?.license, 'lic_12345678');
  assert.deepEqual(studentShareLinks({ google: null, oneDrive: null, origin: 'https://gym.test' }), []);
});

test('copy uses the clipboard first, then the select-and-copy fallback', async () => {
  const written: string[] = [];
  const ok = await copyShareLink('https://gym.test/x', {
    navigator: { clipboard: { writeText: async (text) => void written.push(text) } },
    execCopy: () => {
      throw new Error('fallback should not run');
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(written, ['https://gym.test/x']);

  let selected = false;
  let execs = 0;
  const fallback = await copyShareLink('https://gym.test/y', {
    navigator: { clipboard: { writeText: async () => Promise.reject(new Error('denied')) } },
    field: { select: () => void (selected = true) },
    execCopy: () => ++execs > 0,
  });
  assert.equal(fallback, true);
  assert.equal(selected, true);
  assert.equal(execs, 1);

  const none = await copyShareLink('https://gym.test/z', { navigator: {}, execCopy: () => false });
  assert.equal(none, false);
});

test('share code never logs, mints, signs, or emails anything', () => {
  for (const file of ['src/lib/licenseShare.ts', 'src/components/LicenseSharePage.tsx', 'src/components/LicenseShareButton.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /console\.(log|info|warn|error|debug)/, file);
    assert.doesNotMatch(source, /mailto:|sendEmail|emailSender/, file);
    assert.doesNotMatch(source, /issueSeatWithServer|issueInstructorInvite|requestServerSeat|fetch\(/, file);
    assert.doesNotMatch(source, /pepper|signToken|stripe/i, file);
  }
});
