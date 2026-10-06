import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollaborationGate } from '../components/CollaborationGate.ts';
import { GYM_NAME_STORAGE_KEY, writeGymName } from './gymName.ts';
import {
  DEFAULT_INSTRUCTOR_PERMISSIONS,
  INSTRUCTOR_PERMISSION_FIELDS,
  INSTRUCTOR_SEAT_SESSION_KEY,
  INSTRUCTOR_SEAT_SIGNED_OUT_KEY,
  INSTRUCTOR_SEATS_STORAGE_KEY,
  INSTRUCTOR_PRESETS,
  defaultInstructorPermissions,
  instructorInviteLink,
  instructorPresetPermissions,
  instructorPresetPlan,
  instructorSeatBinderLabel,
  acceptInstructorInvite,
  isProgramDirectorSeat,
  issueInstructorInvite,
  menuCloudSharing,
  seatGrantsMediaConsole,
  seatMenuAllowed,
  peekInstructorInvite,
  permissionsMatchPreset,
  listInstructorSeats,
  normalizeInstructorPermissions,
  inviteReloadBlocked,
  purchasePromptsHidden,
  readCurrentSeat,
  readSignedOutToast,
  seatChromeHidden,
  revokeInstructorSeat,
  coachToolVisible,
  seatPermissionAllows,
  signOutInstructorSeat,
  updateInstructorSeatPermissions,
  visibleCoachControl,
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
    eventsAccess: false,
    proShopAccess: false,
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
      'Events access',
      'Pro Shop access',
    ],
  );
  assert.deepEqual(Object.keys(DEFAULT_INSTRUCTOR_PERMISSIONS), [
    'galleryUpload',
    'dailyLessonPlanAccess',
    'rosterSubmit',
    'rosterPull',
    'downloadTodaysVideos',
    'uploadForDistribution',
    'eventsAccess',
    'proShopAccess',
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
    eventsAccess: false,
    proShopAccess: true,
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
  assert.equal(seat.permissions.eventsAccess, false);
  assert.equal(seat.permissions.proShopAccess, false);
  assert.equal(seat.presetId, null);
});

test('four binder presets fill the toggles and stay overridable', () => {
  const assistant = instructorPresetPermissions('assistant-coach');
  assert.deepEqual(assistant, {
    galleryUpload: false,
    dailyLessonPlanAccess: true,
    rosterSubmit: false,
    rosterPull: false,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
    eventsAccess: false,
    proShopAccess: false,
  });
  assert.deepEqual(instructorPresetPermissions('coach'), defaultInstructorPermissions());
  assert.deepEqual(instructorPresetPermissions('program-director'), {
    galleryUpload: true,
    dailyLessonPlanAccess: false,
    rosterSubmit: false,
    rosterPull: false,
    downloadTodaysVideos: false,
    uploadForDistribution: false,
    eventsAccess: true,
    proShopAccess: true,
  });
  const instructors = instructorPresetPermissions('instructors');
  assert.equal(INSTRUCTOR_PRESETS.length, 4);
  assert.ok(INSTRUCTOR_PERMISSION_FIELDS.every((field) => instructors[field.key]));
  assert.equal(permissionsMatchPreset('instructors', instructors), true);
  const adjusted = { ...instructors, galleryUpload: false };
  assert.equal(permissionsMatchPreset('instructors', adjusted), false);
  assert.equal(instructorSeatBinderLabel('instructors', adjusted), 'Instructors · adjusted');
  assert.equal(instructorSeatBinderLabel(null, adjusted), 'Custom binder');
  assert.equal(instructorSeatBinderLabel('assistant-coach', assistant), 'Assistant coach');
  assert.deepEqual(
    INSTRUCTOR_PRESETS.map((preset) => preset.label),
    ['Assistant coach', 'Coach', 'Program director', 'Instructors'],
  );
  assert.deepEqual(
    INSTRUCTOR_PRESETS.map((preset) => preset.detail),
    [
      ['Lesson plans and daily videos', 'Full cloud and sharing in these menus'],
      ['Lesson plans, daily videos, and uploads', 'Full cloud and sharing in these menus'],
      ['Events, Pro Shop, and gallery', 'Full cloud and sharing in these menus'],
      ['Lessons, uploads, events, Pro Shop, and gallery', 'Full cloud and sharing in these menus'],
    ],
  );
  assert.deepEqual(
    INSTRUCTOR_PRESETS.map((preset) => [preset.id, preset.plan]),
    [
      ['assistant-coach', 'Coach Unlimited'],
      ['coach', 'Coach Unlimited'],
      ['program-director', 'Pro · Gallery'],
      ['instructors', 'Coach Unlimited + Pro'],
    ],
  );
  assert.equal(instructorPresetPlan('assistant-coach'), 'Coach Unlimited');
  assert.equal(instructorPresetPlan('coach'), 'Coach Unlimited');
  assert.equal(instructorPresetPlan('program-director'), 'Pro · Gallery');
  assert.equal(instructorPresetPlan('instructors'), 'Coach Unlimited + Pro');
  assert.equal(instructorPresetPlan(null), null);

  reset();
  const issued = issueInstructorInvite({
    email: 'director@gym.com',
    permissions: adjusted,
    presetId: 'instructors',
    origin: 'https://advantage.test',
    now: 9,
    token: 'tok-preset',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  assert.equal(issued.seat.presetId, 'instructors');
  assert.equal(issued.seat.permissions.galleryUpload, false);
  assert.equal(issued.seat.permissions.eventsAccess, true);
  const edited = updateInstructorSeatPermissions(issued.seat.id, assistant, 'assistant-coach');
  assert.equal(edited.ok && edited.seat.presetId, 'assistant-coach');
  assert.equal(edited.ok && edited.seat.permissions.rosterSubmit, false);
});

test('the first assistant coach invite for hapkidoka311@yahoo.com accepts and gates Coach tools', () => {
  reset();
  const assistant = instructorPresetPermissions('assistant-coach');
  const issued = issueInstructorInvite({
    email: 'hapkidoka311@yahoo.com',
    permissions: assistant,
    presetId: 'assistant-coach',
    origin: 'https://advantage.test',
    token: 'hapkido-invite',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  assert.equal(issued.seat.email, 'hapkidoka311@yahoo.com');
  assert.equal(issued.seat.status, 'invited');
  assert.deepEqual(
    issueInstructorInvite({
      email: 'Hapkidoka311@yahoo.com',
      origin: 'https://advantage.test',
    }),
    { ok: false, reason: 'duplicate' },
  );

  const accepted = acceptInstructorInvite('hapkido-invite');
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.seat.status, 'active');
  assert.equal(readCurrentSeat()?.email, 'hapkidoka311@yahoo.com');
  const session = JSON.parse(localStorage.getItem(INSTRUCTOR_SEAT_SESSION_KEY) ?? '{}') as {
    seatId?: string;
  };
  assert.equal(session.seatId, accepted.seat.id);
  assert.equal(listInstructorSeats()[0].status, 'active');

  const seated = { owner: true, seat: accepted.seat };
  assert.equal(visibleCoachControl('dailyLessonPlanAccess', seated), true);
  assert.equal(visibleCoachControl('downloadTodaysVideos', seated), true);
  assert.equal(visibleCoachControl('galleryUpload', seated), false);
  assert.equal(visibleCoachControl('rosterSubmit', seated), false);
  assert.equal(visibleCoachControl('rosterPull', seated), false);
  assert.equal(visibleCoachControl('uploadForDistribution', seated), true);
  assert.equal(visibleCoachControl('eventsAccess', seated), false);
  assert.equal(visibleCoachControl('proShopAccess', seated), false);
});

test('a valid invite is the door and does not write the owner purchase unlock', () => {
  reset();
  const issued = issueInstructorInvite({
    email: 'assistant@gym.com',
    permissions: instructorPresetPermissions('assistant-coach'),
    presetId: 'assistant-coach',
    origin: 'https://advantage.test',
    token: 'door-token',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  const link = new URL(issued.inviteLink);
  assert.equal(link.pathname, '/instructors');
  assert.deepEqual([...link.searchParams.keys()], ['invite']);
  assert.equal(link.searchParams.get('invite'), 'door-token');
  assert.equal(peekInstructorInvite('door-token'), 'open');
  assert.equal(peekInstructorInvite('missing-token'), 'missing');

  const accepted = acceptInstructorInvite('door-token');
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.seat.status, 'active');
  assert.equal(peekInstructorInvite('door-token'), 'open');
  assert.equal(localStorage.getItem('advantage.proUnlocked'), null);
  assert.equal(localStorage.getItem('advantage.coachUnlocked'), null);

  revokeInstructorSeat(accepted.seat.id);
  assert.equal(peekInstructorInvite('door-token'), 'revoked');
  const again = acceptInstructorInvite('door-token');
  assert.equal(again.ok, false);
  if (again.ok) return;
  assert.equal(again.reason, 'revoked');
  assert.equal(localStorage.getItem('advantage.proUnlocked'), null);
  assert.equal(localStorage.getItem('advantage.coachUnlocked'), null);
  assert.equal(readCurrentSeat(), null);
});

test('accepting an assistant coach invite starts a seat session and gates controls', () => {
  reset();
  const assistant = instructorPresetPermissions('assistant-coach');
  assert.deepEqual(assistant, {
    galleryUpload: false,
    dailyLessonPlanAccess: true,
    rosterSubmit: false,
    rosterPull: false,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
    eventsAccess: false,
    proShopAccess: false,
  });
  const issued = issueInstructorInvite({
    email: 'assistant@gym.com',
    permissions: assistant,
    presetId: 'assistant-coach',
    origin: 'https://advantage.test',
    token: 'assist-token',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  assert.equal(issued.seat.status, 'invited');

  const accepted = acceptInstructorInvite('assist-token');
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.seat.status, 'active');
  assert.equal(accepted.seat.email, 'assistant@gym.com');
  assert.equal(readCurrentSeat()?.id, accepted.seat.id);
  assert.equal(listInstructorSeats()[0].status, 'active');

  const seated = { owner: true, seat: accepted.seat };
  assert.equal(visibleCoachControl('dailyLessonPlanAccess', seated), true);
  assert.equal(visibleCoachControl('downloadTodaysVideos', seated), true);
  assert.equal(visibleCoachControl('galleryUpload', seated), false);
  assert.equal(visibleCoachControl('rosterSubmit', seated), false);
  assert.equal(visibleCoachControl('rosterPull', seated), false);
  assert.equal(visibleCoachControl('uploadForDistribution', seated), true);
  assert.equal(visibleCoachControl('eventsAccess', seated), false);
  assert.equal(visibleCoachControl('proShopAccess', seated), false);
  assert.equal(visibleCoachControl('uploadForDistribution', { owner: true, seat: null }), true);
  assert.equal(visibleCoachControl('downloadTodaysVideos', { owner: false, seat: null }), false);
  assert.equal(visibleCoachControl('uploadForDistribution', { owner: true, seat: readCurrentSeat() }), true);

  signOutInstructorSeat();
  assert.equal(readCurrentSeat(), null);
  assert.equal(visibleCoachControl('uploadForDistribution', { owner: true, seat: readCurrentSeat() }), true);

  const resumed = acceptInstructorInvite('assist-token');
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.seat.status, 'active');
  assert.equal(readCurrentSeat()?.email, 'assistant@gym.com');

  const missing = acceptInstructorInvite('missing-token');
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.reason, 'missing');
  assert.equal(readCurrentSeat()?.email, 'assistant@gym.com');

  revokeInstructorSeat(accepted.seat.id);
  const revoked = acceptInstructorInvite('assist-token');
  assert.equal(revoked.ok, false);
  if (revoked.ok) return;
  assert.equal(revoked.reason, 'revoked');
  assert.equal(readCurrentSeat(), null);

  signOutInstructorSeat();
  assert.equal(readCurrentSeat(), null);
});

test('assistant cloud sharing stays on inside authorized menus and Media Console stays closed', () => {
  reset();
  const legacy = {
    ...instructorPresetPermissions('assistant-coach'),
    uploadForDistribution: false,
  };
  const issued = issueInstructorInvite({
    email: 'assistant@gym.com',
    permissions: legacy,
    presetId: 'assistant-coach',
    origin: 'https://advantage.test',
    token: 'assist-ui',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  const accepted = acceptInstructorInvite('assist-ui');
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  const seat = accepted.seat;
  assert.equal(seat.permissions.uploadForDistribution, false);
  assert.equal(seatGrantsMediaConsole(seat), false);
  assert.equal(isProgramDirectorSeat(seat), false);
  assert.equal(menuCloudSharing(false, seat, seatMenuAllowed(seat, 'downloadTodaysVideos')), true);
  assert.equal(menuCloudSharing(false, seat, seatMenuAllowed(seat, 'dailyLessonPlanAccess')), true);
  assert.equal(menuCloudSharing(true, seat, seatMenuAllowed(seat, 'galleryUpload')), false);
  assert.equal(menuCloudSharing(true, null, true), true);
  assert.equal(menuCloudSharing(false, null, true), false);
  const share = renderToStaticMarkup(
    createElement(
      CollaborationGate,
      { show: menuCloudSharing(false, seat, seatMenuAllowed(seat, 'downloadTodaysVideos')) },
      createElement('button', null, 'Share to the gym Drive'),
    ),
  );
  assert.match(share, /Share to the gym Drive/);
});

test('Coach tool seats hide lesson plan and videos and leave the other hubs', () => {
  const open = {
    permissions: {
      ...defaultInstructorPermissions(),
      dailyLessonPlanAccess: false,
      downloadTodaysVideos: false,
    },
  };
  assert.equal(coachToolVisible('/notes', null), true);
  assert.equal(coachToolVisible('/techniques', null), true);
  assert.equal(coachToolVisible('/notes', open), false);
  assert.equal(coachToolVisible('/notes?plan=unlimited', open), false);
  assert.equal(coachToolVisible('/techniques', open), false);
  assert.equal(coachToolVisible('/technique-tree', open), true);
  assert.equal(coachToolVisible('/coaching-tools', open), true);
  assert.equal(coachToolVisible('/competition', open), true);
  const videosOnly = {
    permissions: {
      ...defaultInstructorPermissions(),
      dailyLessonPlanAccess: false,
      downloadTodaysVideos: true,
    },
  };
  assert.equal(coachToolVisible('/notes', videosOnly), false);
  assert.equal(coachToolVisible('/techniques', videosOnly), true);
});

test('device guests have no seat, so collaboration controls stay hidden', () => {
  const guest = seatPermissionAllows(null, 'uploadForDistribution');
  assert.equal(guest, false);
  assert.equal(seatPermissionAllows(defaultInstructorPermissions(), 'galleryUpload'), false);
  assert.equal(seatPermissionAllows(defaultInstructorPermissions(), 'downloadTodaysVideos'), true);
  assert.equal(seatPermissionAllows(defaultInstructorPermissions(), 'uploadForDistribution'), true);
});

test('sign out clears Coach Two immediately and does not fall back to the program director seat', () => {
  reset();
  const coach = issueInstructorInvite({
    email: 'coach.two@gym.com',
    presetId: 'coach',
    origin: 'https://advantage.test',
    token: 'coach-two',
  });
  const director = issueInstructorInvite({
    email: 'pd@gym.com',
    presetId: 'program-director',
    origin: 'https://advantage.test',
    token: 'pd-seat',
  });
  assert.equal(coach.ok, true);
  assert.equal(director.ok, true);
  if (!coach.ok || !director.ok) return;
  assert.equal(acceptInstructorInvite('coach-two').ok, true);
  assert.equal(readCurrentSeat()?.email, 'coach.two@gym.com');
  assert.equal(purchasePromptsHidden(readCurrentSeat()), true);

  signOutInstructorSeat();
  assert.equal(localStorage.getItem(INSTRUCTOR_SEAT_SESSION_KEY), null);
  assert.ok(localStorage.getItem(INSTRUCTOR_SEAT_SIGNED_OUT_KEY)?.includes('coach-two'));
  assert.equal(readCurrentSeat(), null);
  assert.equal(purchasePromptsHidden(readCurrentSeat()), false);
  assert.equal(readSignedOutToast(), true);
  assert.equal(inviteReloadBlocked('coach-two', 'reload', 'coach-two'), true);
  assert.equal(inviteReloadBlocked('coach-two', 'navigate', 'coach-two'), false);
  assert.equal(inviteReloadBlocked('coach-two', 'reload', null), false);
  assert.deepEqual(
    listInstructorSeats().map((seat) => seat.email).sort(),
    ['coach.two@gym.com', 'pd@gym.com'],
  );

  const resumed = acceptInstructorInvite('pd-seat');
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(readCurrentSeat()?.email, 'pd@gym.com');
  assert.equal(readSignedOutToast(), false);
  assert.equal(purchasePromptsHidden(readCurrentSeat()), true);
  signOutInstructorSeat();
  assert.equal(readCurrentSeat(), null);
  assert.equal(purchasePromptsHidden(readCurrentSeat()), false);
  assert.equal(acceptInstructorInvite('coach-two').ok, true);
  assert.equal(readCurrentSeat()?.email, 'coach.two@gym.com');
});

test('seat chrome stays off the gym TV and purchase prompts follow the live seat', () => {
  assert.equal(seatChromeHidden('/match'), true);
  assert.equal(seatChromeHidden('/training'), true);
  assert.equal(seatChromeHidden('/slideshow'), true);
  assert.equal(seatChromeHidden('/screensaver'), true);
  assert.equal(seatChromeHidden('/match/control'), false);
  assert.equal(seatChromeHidden('/'), false);
  assert.equal(seatChromeHidden('/coach'), false);
  assert.equal(seatChromeHidden('/pro'), false);
  assert.equal(purchasePromptsHidden(null), false);
  assert.equal(purchasePromptsHidden({ status: 'active' }), true);
  assert.equal(purchasePromptsHidden({ status: 'invited' }), true);
  assert.equal(purchasePromptsHidden({ status: 'revoked' }), false);

  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const coach = read('../pages/Coach.tsx');
  const pro = read('../pages/Pro.tsx');
  const home = read('../pages/Home.tsx');
  const bar = read('../components/SeatSessionBar.tsx');
  const invite = read('../components/InstructorInvitePanel.tsx');
  const unlimited = read('../pages/CoachUnlimited.tsx');
  assert.match(coach, /purchasePromptsHidden\(seat\)/);
  assert.match(coach, /Buy Advantage Coach/);
  assert.match(pro, /purchasePromptsHidden\(seat\)/);
  assert.match(pro, /Buy Advantage Pro/);
  assert.match(home, /purchasePromptsHidden\(seat\)/);
  assert.match(bar, /Sign out of seat/);
  assert.match(bar, /Signed out/);
  assert.match(bar, /seat-session-dock/);
  assert.match(invite, /preset\.detail\.map/);
  assert.match(invite, /cloud and sharing match the owner/);
  assert.doesNotMatch(invite, /Downloads only/i);
  assert.match(unlimited, /<DriveConnectCard \/>/);
  assert.doesNotMatch(unlimited, /seat \? null : <DriveConnectCard/);
});
