/**
 * The menu door and the paid-chunk grant have to agree.
 * Every seat preset, with Pro open and with Pro closed, is checked on both sides.
 * A link is shown only when the existing door is open AND the token would be granted
 * that chunk. The grant itself is not widened.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TOKEN_AUD, TOKEN_ISS, TOKEN_VERSION, type EntitlementClaims } from './entitlementToken.ts';
import {
  DEFAULT_INSTRUCTOR_PERMISSIONS,
  instructorPresetPermissions,
  type InstructorPermissions,
  type InstructorPresetId,
} from './instructorSeats.ts';
import {
  PAID_CHUNK_IDS,
  paidChunkForHref,
  paidChunkGrant,
  paidChunkMenuAgrees,
  paidImportFailure,
  type PaidChunkId,
} from './paidChunkAccess.ts';
import {
  coachUnlimitedDoorOpen,
  grantedConsoleHubs,
  mediaConsoleDoorOpen,
  proConsoleEntryOpen,
  visibleProHubs,
  type ProSurfaceInput,
} from './productNames.ts';

const NOW_MS = Date.parse('2026-10-29T12:00:00.000Z');

function claims(partial: Partial<EntitlementClaims> & Pick<EntitlementClaims, 'grants' | 'tier' | 'src'>): EntitlementClaims {
  const now = Math.floor(NOW_MS / 1000);
  return {
    iss: TOKEN_ISS,
    aud: TOKEN_AUD,
    kid: 'k1',
    sub: 'lic',
    exp: now + 3600,
    iat: now,
    nbf: now,
    refresh_after: now + 60,
    did: 'dev',
    v: TOKEN_VERSION,
    ...partial,
  };
}

function seatClaims(preset: InstructorPresetId | null, proOpen: boolean): EntitlementClaims {
  return claims({
    grants: proOpen ? ['student', 'coach', 'pro'] : [],
    tier: 'seat',
    src: 'seat',
    ...(preset ? { preset } : {}),
    subs: { state: proOpen ? 'active' : 'locked' },
  });
}

function surface(preset: InstructorPresetId | null, proOpen: boolean, permissions: InstructorPermissions): ProSurfaceInput {
  return {
    proUnlocked: proOpen,
    seated: true,
    seatGrantsMedia: permissions.galleryUpload || permissions.eventsAccess || permissions.proShopAccess,
    programDirectorSeat: preset === 'program-director',
    coachMenus: permissions.dailyLessonPlanAccess || permissions.downloadTodaysVideos,
  };
}

/** The route door before the grant intersection. Lesson Cloud follows the lesson-plan switch. */
function doorOpenFor(row: ProSurfaceInput, permissions: InstructorPermissions, chunk: PaidChunkId): boolean {
  if (chunk === 'pro-console') return visibleProHubs(row).length > 0;
  if (chunk === 'media-console') return mediaConsoleDoorOpen(row);
  if (chunk === 'coach-unlimited') return coachUnlimitedDoorOpen(row);
  return permissions.dailyLessonPlanAccess;
}

const PRESETS: readonly { id: InstructorPresetId | 'custom'; preset: InstructorPresetId | null; permissions: InstructorPermissions }[] = [
  { id: 'instructors', preset: 'instructors', permissions: instructorPresetPermissions('instructors') },
  { id: 'program-director', preset: 'program-director', permissions: instructorPresetPermissions('program-director') },
  { id: 'coach', preset: 'coach', permissions: instructorPresetPermissions('coach') },
  { id: 'assistant-coach', preset: 'assistant-coach', permissions: instructorPresetPermissions('assistant-coach') },
  { id: 'custom', preset: null, permissions: { ...DEFAULT_INSTRUCTOR_PERMISSIONS } },
];

function shownChunks(preset: InstructorPresetId | null, permissions: InstructorPermissions, proOpen: boolean): PaidChunkId[] {
  const row = surface(preset, proOpen, permissions);
  const token = seatClaims(preset, proOpen);
  return PAID_CHUNK_IDS.filter((chunk) => {
    const door = doorOpenFor(row, permissions, chunk);
    const shown = paidChunkMenuAgrees({ claims: token, chunk, nowMs: NOW_MS, doorOpen: door, amnesty: false });
    const server = paidChunkGrant(token, chunk, NOW_MS);
    assert.equal(shown, door && server, `${preset ?? 'custom'} ${chunk} pro ${proOpen ? 'open' : 'closed'}`);
    assert.equal(shown && !server, false);
    return shown;
  });
}

test('instructors: Pro open shows every paid screen; Pro closed keeps Pro, Media, and Lesson Cloud', () => {
  assert.deepEqual(shownChunks('instructors', instructorPresetPermissions('instructors'), true), [...PAID_CHUNK_IDS]);
  assert.deepEqual(shownChunks('instructors', instructorPresetPermissions('instructors'), false), [
    'pro-console',
    'media-console',
    'lesson-cloud',
  ]);
});

test('program director: Pro Console and Media Console stay open with Pro closed, and nothing else', () => {
  const permissions = instructorPresetPermissions('program-director');
  assert.deepEqual(shownChunks('program-director', permissions, true), ['pro-console', 'media-console']);
  assert.deepEqual(shownChunks('program-director', permissions, false), ['pro-console', 'media-console']);
});

test('coach and assistant coach: Pro open keeps Pro, Lesson Cloud, and Coach Unlimited; Pro closed keeps Lesson Cloud only', () => {
  for (const preset of ['coach', 'assistant-coach'] as const) {
    const permissions = instructorPresetPermissions(preset);
    assert.deepEqual(shownChunks(preset, permissions, true), ['pro-console', 'lesson-cloud', 'coach-unlimited'], preset);
    assert.deepEqual(shownChunks(preset, permissions, false), ['lesson-cloud'], preset);
    const token = seatClaims(preset, false);
    assert.equal(paidChunkGrant(token, 'pro-console', NOW_MS), false);
    assert.equal(paidChunkGrant(token, 'media-console', NOW_MS), false);
  }
});

test('custom seat: the server still allows the seat screens, and the menu only shows doors the toggles open', () => {
  const permissions = { ...DEFAULT_INSTRUCTOR_PERMISSIONS };
  assert.deepEqual(shownChunks(null, permissions, true), ['pro-console', 'lesson-cloud', 'coach-unlimited']);
  assert.deepEqual(shownChunks(null, permissions, false), ['lesson-cloud']);
  const locked = seatClaims(null, false);
  assert.equal(paidChunkGrant(locked, 'pro-console', NOW_MS), true);
  assert.equal(paidChunkGrant(locked, 'media-console', NOW_MS), true);
  assert.equal(paidChunkGrant(locked, 'coach-unlimited', NOW_MS), false);
});

test('a coach preset with Gallery switched on is not offered Pro Console or Media Console when Pro is closed', () => {
  const permissions = { ...instructorPresetPermissions('coach'), galleryUpload: true };
  const row = surface('coach', false, permissions);
  const token = seatClaims('coach', false);
  assert.equal(visibleProHubs(row).length > 0, true);
  assert.equal(mediaConsoleDoorOpen(row), true);
  assert.equal(
    paidChunkMenuAgrees({ claims: token, chunk: 'pro-console', nowMs: NOW_MS, doorOpen: true, amnesty: false }),
    false,
  );
  assert.equal(
    paidChunkMenuAgrees({ claims: token, chunk: 'media-console', nowMs: NOW_MS, doorOpen: true, amnesty: false }),
    false,
  );
  assert.equal(proConsoleEntryOpen(row, token, NOW_MS, false), false);
  assert.equal(
    paidChunkMenuAgrees({
      claims: token,
      chunk: 'lesson-cloud',
      nowMs: NOW_MS,
      doorOpen: permissions.dailyLessonPlanAccess,
      amnesty: false,
    }),
    true,
  );
  const open = seatClaims('coach', true);
  const hubs = grantedConsoleHubs(
    [
      { title: 'Gallery', to: '/gallery', belt: 'purple' },
      { title: 'Advantage Instructor Edition', to: '/coach-unlimited', belt: 'brown' },
    ],
    open,
    NOW_MS,
    false,
  );
  assert.deepEqual(hubs.map((hub) => hub.to), ['/coach-unlimited']);
});

test('every preset times Pro open or closed never shows a chunk the server would refuse', () => {
  for (const preset of PRESETS) {
    for (const proOpen of [true, false]) {
      const token = seatClaims(preset.preset, proOpen);
      const row = surface(preset.preset, proOpen, preset.permissions);
      for (const chunk of PAID_CHUNK_IDS) {
        const door = doorOpenFor(row, preset.permissions, chunk);
        const shown = paidChunkMenuAgrees({ claims: token, chunk, nowMs: NOW_MS, doorOpen: door, amnesty: false });
        if (shown) assert.equal(paidChunkGrant(token, chunk, NOW_MS), true, `${preset.id} ${chunk} pro ${proOpen}`);
      }
    }
  }
});

test('no token shows the confirm door only during amnesty, and a hub href maps to its chunk', () => {
  assert.equal(
    paidChunkMenuAgrees({ claims: null, chunk: 'pro-console', nowMs: NOW_MS, doorOpen: true, amnesty: true }),
    true,
  );
  assert.equal(
    paidChunkMenuAgrees({ claims: null, chunk: 'pro-console', nowMs: NOW_MS, doorOpen: true, amnesty: false }),
    false,
  );
  assert.equal(
    paidChunkMenuAgrees({ claims: null, chunk: 'pro-console', nowMs: NOW_MS, doorOpen: false, amnesty: true }),
    false,
  );
  assert.equal(paidChunkForHref('/pro'), 'pro-console');
  assert.equal(paidChunkForHref('/gallery'), 'media-console');
  assert.equal(paidChunkForHref('/slideshow?folder=gallery'), 'media-console');
  assert.equal(paidChunkForHref('/class-history'), 'lesson-cloud');
  assert.equal(paidChunkForHref('/coach-unlimited'), 'coach-unlimited');
  assert.equal(paidChunkForHref('/review'), 'coach-unlimited');
  assert.equal(paidChunkForHref('/suite'), null);
  assert.equal(paidChunkForHref('/instructors'), null);
});

test('a network or stale-cache import is retried once; a second failure is the fallback', () => {
  const stale = new TypeError('Failed to fetch dynamically imported module: /paid/Pro-old.js');
  const network = new TypeError('Failed to fetch');
  assert.equal(paidImportFailure(stale, false, false), 'retry');
  assert.equal(paidImportFailure(stale, false, true), 'failed');
  assert.equal(paidImportFailure(network, true, false), 'retry');
  assert.equal(paidImportFailure(network, true, true), 'offline');
  assert.equal(paidImportFailure(new Error('something else'), false, false), 'failed');
});

test('the paid screen offers a way back to products and the routes use the shared grant', () => {
  const screen = readFileSync(new URL('../components/PaidScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /Back to products/);
  assert.match(screen, /paidImportFailure/);
  assert.match(screen, /Try again/);
  assert.match(screen, /Refresh access/);
  assert.match(screen, /Restore access/);
  assert.match(screen, /to="\/editions\/pro-cloud"/);
  assert.match(screen, /Enter a code/);
  assert.doesNotMatch(screen, /home__text-btn" to="\/products"/);
  assert.doesNotMatch(screen, /could not be loaded/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /paidDoorAgrees\('pro-console', visibleProHubs\(door\)\.length > 0\)/);
  assert.match(app, /paidDoorAgrees\('media-console', mediaConsoleDoorOpen\(door\)\)/);
  assert.match(app, /paidDoorAgrees\('coach-unlimited', coachUnlimitedDoorOpen\(door\)\)/);
  assert.match(app, /paidDoorAgrees\('lesson-cloud', open\)/);
  // The /products card rules live in productTiles.ts; Home.tsx renders them.
  const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8') + readFileSync(new URL('./productTiles.ts', import.meta.url), 'utf8');
  assert.match(home, /proConsoleEntryOpen\(door, access\.claims/);
  const unlimited = readFileSync(new URL('../pages/CoachUnlimited.tsx', import.meta.url), 'utf8');
  assert.match(unlimited, /proConsoleEntryOpen\(door, access\.claims/);
  assert.match(unlimited, /PRODUCTS_PATH/);
});
