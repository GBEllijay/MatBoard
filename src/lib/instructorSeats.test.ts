import assert from 'node:assert/strict';
import test from 'node:test';
import { GYM_NAME_STORAGE_KEY, writeGymName } from './gymName.ts';
import {
  DEFAULT_INSTRUCTOR_PERMISSIONS,
  INSTRUCTOR_PERMISSION_FIELDS,
  INSTRUCTOR_SEATS_STORAGE_KEY,
  defaultInstructorPermissions,
  instructorInviteLink,
  instructorWristbandKind,
  instructorWristbandLabel,
  issueInstructorInvite,
  listInstructorSeats,
  normalizeInstructorPermissions,
  revokeInstructorSeat,
  seatPermissionAllows,
  updateInstructorSeatPermissions,
  type InstructorPermissions,
  type InstructorSeat,
} from './instructorSeats.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

function reset(): void {
  localStorage.clear();
}

function storedSeats(): InstructorSeat[] {
  const raw = JSON.parse(localStorage.getItem(INSTRUCTOR_SEATS_STORAGE_KEY) ?? '{}') as {
    seats: InstructorSeat[];
  };
  return raw.seats;
}

test('permission defaults and labels stay the soft-beta bundle', () => {
  assert.deepEqual(defaultInstructorPermissions(), {
    galleryUpload: false,
    dailyLessonPlanAccess: true,
    rosterSubmit: true,
    rosterPull: true,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
  });
  assert.deepEqual(
    INSTRUCTOR_PERMISSION_FIELDS.map((field) => field.label),
    [
      'Gallery upload',
      'Daily training lesson plan access',
      'Roster submit',
      'Roster pull',
      "Download today's videos",
      'Upload for instructor distribution',
    ],
  );
  assert.deepEqual(Object.keys(DEFAULT_INSTRUCTOR_PERMISSIONS), [
    'galleryUpload',
    'dailyLessonPlanAccess',
    'rosterSubmit',
    'rosterPull',
    'downloadTodaysVideos',
    'uploadForDistribution',
  ]);
  const filled = normalizeInstructorPermissions({ rosterPull: false });
  assert.equal(filled.rosterPull, false);
  assert.equal(filled.galleryUpload, false);
  assert.equal(filled.dailyLessonPlanAccess, true);
});

test('issuing an invite stores an invited seat and a copyable link', () => {
  reset();
  writeGymName('Alliance');
  const custom: InstructorPermissions = {
    galleryUpload: true,
    dailyLessonPlanAccess: false,
    rosterSubmit: true,
    rosterPull: false,
    downloadTodaysVideos: true,
    uploadForDistribution: false,
  };
  const issued = issueInstructorInvite({
    email: '  Coach@Alliance.gym ',
    permissions: custom,
    origin: 'https://advantage.test/',
    now: 1_700_000_000_000,
    token: 'invite-token-1',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  assert.equal(issued.seat.email, 'coach@alliance.gym');
  assert.equal(issued.seat.gymId, 'Alliance');
  assert.equal(issued.seat.status, 'invited');
  assert.equal(issued.seat.issuedAt, 1_700_000_000_000);
  assert.deepEqual(issued.seat.permissions, custom);
  assert.equal(issued.inviteLink, 'https://advantage.test/instructors?invite=invite-token-1');
  assert.equal(instructorInviteLink('invite-token-1', 'https://advantage.test'), issued.inviteLink);

  const raw = storedSeats();
  assert.equal(raw.length, 1);
  assert.deepEqual(raw[0].permissions, custom);
  assert.equal(raw[0].status, 'invited');
  assert.deepEqual(listInstructorSeats()[0].permissions, custom);
});

test('a blank gym name uses one stable device gym id', () => {
  reset();
  localStorage.removeItem(GYM_NAME_STORAGE_KEY);
  const first = issueInstructorInvite({
    email: 'a@gym.com',
    origin: 'https://advantage.test',
    now: 10,
    token: 'tok-a',
  });
  const second = issueInstructorInvite({
    email: 'b@gym.com',
    origin: 'https://advantage.test',
    now: 20,
    token: 'tok-b',
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.match(first.seat.gymId, /^device-/);
  assert.equal(second.seat.gymId, first.seat.gymId);
  writeGymName('Checkmat');
  const third = issueInstructorInvite({
    email: 'c@gym.com',
    origin: 'https://advantage.test',
    now: 30,
    token: 'tok-c',
  });
  assert.equal(third.ok && third.seat.gymId, 'Checkmat');
  assert.equal(listInstructorSeats().find((seat) => seat.email === 'a@gym.com')?.gymId, first.seat.gymId);
});

test('open seats can be edited and revoked, and a revoked email can be invited again', () => {
  reset();
  const issued = issueInstructorInvite({
    email: 'alex@gym.com',
    origin: 'https://advantage.test',
    now: 5,
    token: 'keep-me',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  assert.equal(issued.seat.permissions.galleryUpload, false);
  const edited = updateInstructorSeatPermissions(issued.seat.id, {
    ...issued.seat.permissions,
    galleryUpload: true,
    rosterSubmit: false,
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.seat.status, 'invited');
  assert.equal(edited.seat.inviteToken, 'keep-me');
  assert.equal(edited.seat.permissions.galleryUpload, true);
  assert.equal(edited.seat.permissions.rosterSubmit, false);
  assert.equal(edited.seat.permissions.rosterPull, true);

  const duplicate = issueInstructorInvite({
    email: 'Alex@gym.com',
    origin: 'https://advantage.test',
    now: 6,
  });
  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate' });

  const revoked = revokeInstructorSeat(issued.seat.id);
  assert.equal(revoked.ok && revoked.seat.status, 'revoked');
  const blocked = updateInstructorSeatPermissions(issued.seat.id, defaultInstructorPermissions());
  assert.deepEqual(blocked, { ok: false, reason: 'revoked' });
  assert.equal(listInstructorSeats()[0].permissions.galleryUpload, true);

  const again = issueInstructorInvite({
    email: 'alex@gym.com',
    origin: 'https://advantage.test',
    now: 7,
    token: 'new-token',
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.seat.status, 'invited');
  assert.equal(listInstructorSeats().length, 2);
  assert.equal(listInstructorSeats()[0].inviteToken, 'new-token');
});

test('there is no invite cap, and junk storage is ignored', () => {
  reset();
  for (let index = 0; index < 12; index += 1) {
    const issued = issueInstructorInvite({
      email: `coach${index}@gym.com`,
      origin: 'https://advantage.test',
      now: index,
      token: `tok-${index}`,
    });
    assert.equal(issued.ok, true);
  }
  assert.equal(listInstructorSeats().length, 12);
  assert.equal(listInstructorSeats()[0].email, 'coach11@gym.com');

  localStorage.setItem(INSTRUCTOR_SEATS_STORAGE_KEY, '{');
  assert.deepEqual(listInstructorSeats(), []);
  localStorage.setItem(
    INSTRUCTOR_SEATS_STORAGE_KEY,
    JSON.stringify({ version: 2, deviceGymId: 'device-old', seats: [] }),
  );
  assert.deepEqual(listInstructorSeats(), []);

  const bad = issueInstructorInvite({ email: 'not-an-email', origin: 'https://advantage.test' });
  assert.deepEqual(bad, { ok: false, reason: 'email' });
  assert.deepEqual(updateInstructorSeatPermissions('missing', defaultInstructorPermissions()), {
    ok: false,
    reason: 'missing',
  });
});

test('a stored seat with a missing permission fills that default on read', () => {
  reset();
  localStorage.setItem(
    INSTRUCTOR_SEATS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      deviceGymId: 'device-saved',
      seats: [
        {
          id: 'seat-1',
          gymId: 'device-saved',
          email: 'blair@gym.com',
          status: 'active',
          issuedAt: 4,
          inviteToken: 'tok-active',
          permissions: {
            dailyLessonPlanAccess: false,
            rosterSubmit: true,
            rosterPull: true,
            downloadTodaysVideos: false,
            uploadForDistribution: true,
          },
        },
      ],
    }),
  );
  const [seat] = listInstructorSeats();
  assert.equal(seat.status, 'active');
  assert.equal(seat.permissions.galleryUpload, false);
  assert.equal(seat.permissions.dailyLessonPlanAccess, false);
  assert.equal(seat.permissions.downloadTodaysVideos, false);
  assert.equal(seat.permissions.uploadForDistribution, true);
});

test('gallery upload fastens the black belt wristband', () => {
  const coach = defaultInstructorPermissions();
  assert.equal(instructorWristbandKind(coach), 'coach');
  assert.equal(instructorWristbandLabel('coach'), 'Coach wristband');
  assert.equal(instructorWristbandKind({ ...coach, galleryUpload: true }), 'black');
  assert.equal(instructorWristbandLabel('black'), 'Black belt wristband');
  assert.equal(instructorWristbandKind({ ...coach, rosterPull: false }), 'coach');
});

test('device guests have no seat, so collaboration controls stay hidden', () => {
  const guest = seatPermissionAllows(null, 'uploadForDistribution');
  assert.equal(guest, false);
  assert.equal(seatPermissionAllows(defaultInstructorPermissions(), 'galleryUpload'), false);
  assert.equal(seatPermissionAllows(defaultInstructorPermissions(), 'downloadTodaysVideos'), true);
  assert.equal(seatPermissionAllows(defaultInstructorPermissions(), 'uploadForDistribution'), true);
});
