import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAID_CHUNK_IDS,
  filesForAllowedChunks,
  paidChunkAllowed,
  paidChunkAllowedForClient,
  type PaidChunkId,
} from './paidChunkAccess.ts';
import { TOKEN_AUD, TOKEN_ISS, TOKEN_VERSION, type EntitlementClaims } from './entitlementToken.ts';

const NOW_MS = Date.parse('2026-10-29T12:00:00.000Z');

function claims(
  partial: Partial<EntitlementClaims> & Pick<EntitlementClaims, 'grants' | 'tier' | 'src'>,
): EntitlementClaims {
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

function allowed(row: EntitlementClaims, now = NOW_MS): PaidChunkId[] {
  return PAID_CHUNK_IDS.filter((id) => paidChunkAllowed(row, id, now));
}

const pro = ['student', 'coach', 'pro'] as const;

test('an active Pro token opens all four paid screens', () => {
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'active' } })),
    [...PAID_CHUNK_IDS],
  );
});

test('grace keeps the screens open until the lock instant', () => {
  const future = new Date(NOW_MS + 3 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(NOW_MS - 1000).toISOString();
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'grace', lock_at: future } })),
    [...PAID_CHUNK_IDS],
  );
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'grace', lock_at: past } })),
    [],
  );
});

test('a locked Pro token blocks every paid screen, including when the pro grant is still listed', () => {
  assert.deepEqual(
    allowed(claims({ grants: ['white', 'student'], tier: 'pro', src: 'stripe', subs: { state: 'locked' } })),
    [],
  );
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'locked' } })),
    [],
  );
});

test('cancel-at-period-end blocks the screens after the period end', () => {
  const past = new Date(NOW_MS - 1000).toISOString();
  const future = new Date(NOW_MS + 86_400_000).toISOString();
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'active', ends_at: future } })),
    [...PAID_CHUNK_IDS],
  );
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'active', ends_at: past } })),
    [],
  );
});

test('a full owner code opens every paid screen and a coach or student purchase opens none', () => {
  assert.deepEqual(
    allowed(claims({ grants: ['white', 'student', 'coach', 'pro'], tier: 'owner', src: 'owner' })),
    [...PAID_CHUNK_IDS],
  );
  assert.deepEqual(allowed(claims({ grants: ['coach'], tier: 'coach', src: 'stripe' })), []);
  assert.deepEqual(allowed(claims({ grants: ['student'], tier: 'student', src: 'stripe' })), []);
  assert.deepEqual(allowed(claims({ grants: ['white'], tier: 'white', src: 'free' })), []);
});

test('a program director seat keeps Media Console and the Pro hub without a Pro grant', () => {
  assert.deepEqual(
    allowed(claims({ grants: [], tier: 'seat', src: 'seat', preset: 'program-director', subs: { state: 'locked' } })),
    ['pro-console', 'media-console'],
  );
});

test('a coach seat follows the owner while Pro is open and keeps Lesson Cloud when Pro locks', () => {
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'seat', src: 'seat', preset: 'coach', subs: { state: 'active' } })),
    ['pro-console', 'lesson-cloud', 'coach-unlimited'],
  );
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'seat', src: 'seat', preset: 'assistant-coach', subs: { state: 'grace', lock_at: new Date(NOW_MS + 86_400_000).toISOString() } })),
    ['pro-console', 'lesson-cloud', 'coach-unlimited'],
  );
  assert.deepEqual(
    allowed(claims({ grants: [], tier: 'seat', src: 'seat', preset: 'coach', subs: { state: 'locked' } })),
    ['lesson-cloud'],
  );
});

test('an instructors seat keeps media and lessons when Pro locks, and Coach Unlimited only while Pro is open', () => {
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'seat', src: 'seat', preset: 'instructors', subs: { state: 'active' } })),
    [...PAID_CHUNK_IDS],
  );
  assert.deepEqual(
    allowed(claims({ grants: [], tier: 'seat', src: 'seat', preset: 'instructors', subs: { state: 'locked' } })),
    ['pro-console', 'media-console', 'lesson-cloud'],
  );
});

test('a custom seat with no preset keeps the seat screens the server cannot tell apart', () => {
  assert.deepEqual(
    allowed(claims({ grants: [...pro], tier: 'seat', src: 'seat', subs: { state: 'active' } })),
    [...PAID_CHUNK_IDS],
  );
  assert.deepEqual(
    allowed(claims({ grants: [], tier: 'seat', src: 'seat', subs: { state: 'locked' } })),
    ['pro-console', 'media-console', 'lesson-cloud'],
  );
});

test('the server refuses an expired token and the client may use a cached copy only while offline', () => {
  const expired = claims({
    grants: [...pro],
    tier: 'pro',
    src: 'stripe',
    subs: { state: 'active' },
    exp: Math.floor(NOW_MS / 1000) - 10,
    offline_grace: 3 * 24 * 60 * 60,
  });
  assert.deepEqual(allowed(expired), []);
  assert.equal(paidChunkAllowedForClient(expired, 'pro-console', NOW_MS, false), false);
  assert.equal(paidChunkAllowedForClient(expired, 'media-console', NOW_MS, true), true);
  assert.equal(paidChunkAllowedForClient(expired, 'coach-unlimited', NOW_MS, true), true);
});

test('a lock is not waived by offline grace or a future nbf', () => {
  const locked = claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'locked' } });
  assert.equal(paidChunkAllowedForClient(locked, 'pro-console', NOW_MS, true), false);
  const early = claims({
    grants: [...pro],
    tier: 'pro',
    src: 'stripe',
    subs: { state: 'active' },
    nbf: Math.floor(NOW_MS / 1000) + 100,
  });
  assert.equal(paidChunkAllowed(early, 'lesson-cloud', NOW_MS), false);
});

test('prefetch lists the files for every screen the token may open', () => {
  const files = {
    'pro-console': ['/paid/pro.js', '/paid/shared.js'],
    'media-console': ['/paid/media.js', '/paid/shared.js'],
    'lesson-cloud': ['/paid/lesson.js'],
    'coach-unlimited': ['/paid/coach.js'],
  };
  const open = filesForAllowedChunks(
    claims({ grants: [...pro], tier: 'pro', src: 'stripe', subs: { state: 'active' } }),
    files,
    NOW_MS,
  );
  assert.deepEqual(new Set(open), new Set(['/paid/pro.js', '/paid/shared.js', '/paid/media.js', '/paid/lesson.js', '/paid/coach.js']));
  const director = filesForAllowedChunks(
    claims({ grants: [], tier: 'seat', src: 'seat', preset: 'program-director', subs: { state: 'locked' } }),
    files,
    NOW_MS,
  );
  assert.deepEqual(new Set(director), new Set(['/paid/pro.js', '/paid/shared.js', '/paid/media.js']));
});
