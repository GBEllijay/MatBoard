import assert from 'node:assert/strict';
import test from 'node:test';
import { handleGymMedia } from '../../functions/api/gym/media.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import type { D1Database } from './d1.ts';
import { streamFrom } from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-10T18:00:00.000Z');
const PHOTO = 'gallery/approved/2026-11-10/class.jpg';

function bucketWith(keys: string[]) {
  return {
    async get(key: string) {
      if (!keys.includes(key)) return null;
      return { body: streamFrom(new TextEncoder().encode('jpeg')), httpMetadata: { contentType: 'image/jpeg' } };
    },
  };
}

function fakeDb(seat: { status: string; revokedAt: string | null } | null): D1Database {
  return {
    prepare(sql: string) {
      const prepared = {
        bind() {
          return prepared;
        },
        async all<T>() {
          const grants = sql.includes('FROM grants')
            ? [{ licenseId: 'lic-owner1', product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null }]
            : [];
          return { results: grants as T[] };
        },
        async first<T>() {
          return (sql.includes('FROM seats') ? seat : null) as T | null;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
      return prepared;
    },
    async exec() {
      return undefined;
    },
  };
}

async function secret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

async function ownerToken(signing: string, licenseId: string): Promise<string> {
  const issued = await issueToken(signing, {
    licenseId,
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: `device-${licenseId}`,
    now,
    kind: 'code',
  });
  assert.ok(issued);
  return issued;
}

async function seatToken(signing: string, preset: string, licenseId = 'lic-owner1'): Promise<string> {
  const issued = await issueToken(signing, {
    licenseId,
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: `device-${preset}`,
    now,
    kind: 'seat',
    gym: licenseId,
    sid: `seat-${preset}`,
    preset,
  });
  assert.ok(issued);
  return issued;
}

function get(env: Parameters<typeof handleGymMedia>[1], query: string, bearer = '', at = now): Promise<Response> {
  const headers = new Headers();
  if (bearer) headers.set('authorization', bearer.startsWith('Bearer') ? bearer : `Bearer ${bearer}`);
  return handleGymMedia(new Request(`https://advantagebjjtimer.com/api/gym/media?${query}`, { headers }), env, () => at);
}

const q = (license: string, path = PHOTO) => `license=${license}&path=${encodeURIComponent(path)}`;

test('gym media: valid same-license pass reads approved bytes; others are refused', async () => {
  const signing = await secret();
  const env = {
    GYM_MEDIA: bucketWith([`groups/lic-owner1/${PHOTO}`, `groups/lic-other22/${PHOTO}`]),
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ status: 'claimed', revokedAt: null }),
  };
  const owner = await ownerToken(signing, 'lic-owner1');

  // Same license, valid pass: 200 with the same headers as before.
  const ok = await get(env, q('lic-owner1'), owner);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), 'jpeg');
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.equal(ok.headers.get('cache-control'), 'private, no-store');
  assert.equal(ok.headers.get('cloudflare-cdn-cache-control'), 'public, max-age=86400');
  assert.equal(ok.headers.get('vary'), 'authorization');

  // Coach, instructors, and assistant-coach seats of the same license still read.
  for (const preset of ['coach', 'instructors', 'assistant-coach']) {
    const seat = await seatToken(signing, preset);
    assert.equal((await get(env, q('lic-owner1'), seat)).status, 200, preset);
  }

  // Missing, short, and garbage-but-long tokens: 401.
  assert.equal((await get(env, q('lic-owner1'))).status, 401);
  assert.equal((await get(env, q('lic-owner1'), 'Bearer abc')).status, 401);
  const garbage = await get(env, q('lic-owner1'), 'this-is-not-a-signed-pass-at-all-1234567890');
  assert.equal(garbage.status, 401);
  assert.equal(await garbage.text(), 'Sign in required.');
  // A pass signed by a different key: 401.
  const forged = await ownerToken(await secret(), 'lic-owner1');
  assert.equal((await get(env, q('lic-owner1'), forged)).status, 401);
  // An expired pass: 401.
  assert.equal((await get(env, q('lic-owner1'), owner, new Date('2030-01-01T00:00:00.000Z'))).status, 401);

  // A valid pass for another license: 403, and no bytes.
  const other = await get(env, q('lic-other22'), owner);
  assert.equal(other.status, 403);
  assert.doesNotMatch(await other.text(), /jpeg/);
  const otherSeat = await seatToken(signing, 'coach', 'lic-other22');
  assert.equal((await get(env, q('lic-owner1'), otherSeat)).status, 403);

  // Path rules are unchanged for an authorized caller.
  assert.equal((await get(env, q('lic-owner1', 'gallery/pending/2026-11-10/class.jpg'), owner)).status, 404);
  assert.equal((await get(env, q('lic-owner1', 'gallery/approved/../pending/x.jpg'), owner)).status, 404);
  assert.equal((await get(env, q('lic-owner1', 'gallery/approved/2026-11-10/missing.jpg'), owner)).status, 404);
  assert.equal((await get(env, 'license=bad&path=x', owner)).status, 400);
});

test('gym media: revoked seats and free Student passes get no gallery bytes', async () => {
  const signing = await secret();
  const revokedEnv = {
    GYM_MEDIA: bucketWith([`groups/lic-owner1/${PHOTO}`]),
    ENTITLEMENT_SIGNING_KEY: signing,
    ENTITLEMENT_KEY_ID: 'k1',
    ENTITLEMENTS_DB: fakeDb({ status: 'claimed', revokedAt: '2026-11-09T00:00:00.000Z' }),
  };
  const seat = await seatToken(signing, 'coach');
  assert.equal((await get(revokedEnv, q('lic-owner1'), seat)).status, 403);

  const student = await issueToken(signing, {
    licenseId: 'lic-owner1',
    grants: ['student'],
    tier: 'student',
    src: 'code',
    deviceId: 'device-student',
    now,
    kind: 'code',
    preset: STUDENT_LICENSE_PRESET,
  });
  assert.ok(student);
  assert.equal((await get({ ...revokedEnv, ENTITLEMENTS_DB: fakeDb(null) }, q('lic-owner1'), student)).status, 403);
});

test('gym media: probe and unbound need no sign-in, and no signing key refuses bytes', async () => {
  assert.equal((await get({}, 'probe=1')).status, 503);
  const probe = await get({ GYM_MEDIA: bucketWith([]) }, 'probe=1');
  assert.equal(probe.status, 200);
  assert.deepEqual(await probe.json(), { ok: true, bound: true });
  const unset = await get({ GYM_MEDIA: bucketWith([`groups/lic-owner1/${PHOTO}`]) }, q('lic-owner1'), 'a-long-enough-token-value-123456');
  assert.equal(unset.status, 503);
});
