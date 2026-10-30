import assert from 'node:assert/strict';
import test from 'node:test';
import { PAID_CHUNK_COOKIE } from '../lib/paidChunkAccess.ts';
import { issueToken } from './tokenIssue.ts';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { handlePaidChunk, paidAssetName, readPaidRequestToken, type PaidAssets } from './paidChunks.ts';

const NOW = new Date('2026-10-29T12:00:00.000Z');

async function pair(): Promise<{ secret: string; publicJwk: PublicJwk }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } };
}

const manifest = {
  files: {
    'pro-console.js': ['pro-console'],
    'media-console.js': ['media-console'],
    'lesson-cloud.js': ['lesson-cloud'],
    'coach-unlimited.js': ['coach-unlimited'],
    'shared.js': ['media-console', 'lesson-cloud'],
  },
};

const bodies: Record<string, string> = {
  'manifest.json': JSON.stringify(manifest),
  'pro-console.js': 'pro-screen-code',
  'media-console.js': 'media-screen-code',
  'lesson-cloud.js': 'lesson-screen-code',
  'coach-unlimited.js': 'coach-screen-code',
  'shared.js': 'shared-screen-code',
};

function assets(): { binding: PaidAssets; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    binding: {
      async fetch(input: RequestInfo | URL) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const name = new URL(url).pathname.split('/').pop() ?? '';
        calls.push(name);
        if (!(name in bodies)) return new Response('missing', { status: 404 });
        return new Response(bodies[name], { status: 200, headers: { 'content-type': 'text/plain', 'content-length': String(bodies[name].length) } });
      },
    },
  };
}

async function signed(
  keys: { secret: string },
  input: Parameters<typeof issueToken>[1],
): Promise<string> {
  const token = await issueToken(keys.secret, input);
  if (!token) throw new Error('token was not issued');
  return token;
}

function request(path: string, token?: string, cookie = false): Request {
  const headers = new Headers();
  if (token && cookie) headers.set('cookie', `${PAID_CHUNK_COOKIE}=${encodeURIComponent(token)}`);
  else if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request(`https://advantagebjjtimer.com${path}`, { headers });
}

test('paid asset names stay a single script or stylesheet', () => {
  assert.equal(paidAssetName('/paid/pro-console-abc.js'), 'pro-console-abc.js');
  assert.equal(paidAssetName('/paid/media.css'), 'media.css');
  assert.equal(paidAssetName('/paid/manifest.json'), null);
  assert.equal(paidAssetName('/paid/../assets/index.js'), null);
  assert.equal(paidAssetName('/assets/pro-console.js'), null);
  assert.equal(paidAssetName('/paid/nested/file.js'), null);
});

test('a query token is ignored', () => {
  const headers = new Headers();
  const bare = new Request('https://advantagebjjtimer.com/paid/pro-console.js?token=abc.def.ghi');
  assert.equal(readPaidRequestToken(bare), '');
  headers.set('authorization', 'Bearer real.token.value');
  assert.equal(readPaidRequestToken(new Request('https://advantagebjjtimer.com/paid/pro-console.js', { headers })), 'real.token.value');
});

test('the function does not release a file until the token and the grant both pass', async () => {
  const keys = await pair();
  const store = assets();
  const env = { ENTITLEMENT_SIGNING_KEY: keys.secret, ENTITLEMENT_KEY_ID: 'k1' };
  const missing = await handlePaidChunk(request('/paid/pro-console.js'), env, store.binding, () => NOW);
  assert.equal(missing.status, 401);
  assert.deepEqual(store.calls, ['manifest.json']);

  const forged = await handlePaidChunk(request('/paid/pro-console.js', 'not-a-token'), env, store.binding, () => NOW);
  assert.equal(forged.status, 401);

  const coach = await signed(keys, {
    licenseId: 'lic',
    grants: ['coach'],
    tier: 'coach',
    src: 'stripe',
    deviceId: 'dev',
    now: NOW,
    kind: 'onetime',
  });
  const denied = await handlePaidChunk(request('/paid/pro-console.js', coach), env, store.binding, () => NOW);
  assert.equal(denied.status, 403);
  assert.equal(await denied.text(), 'This access does not include that screen.');
  assert.equal(store.calls.includes('pro-console.js'), false);

  const pro = await signed(keys, {
    licenseId: 'lic',
    grants: ['student', 'coach', 'pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now: NOW,
    kind: 'pro',
    subs: { state: 'active' },
  });
  const released = await handlePaidChunk(request('/paid/pro-console.js', pro), env, store.binding, () => NOW);
  assert.equal(released.status, 200);
  assert.equal(released.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(released.headers.get('cache-control'), 'private, no-store');
  assert.equal(await released.text(), 'pro-screen-code');
  assert.equal(store.calls.filter((name) => name === 'pro-console.js').length, 1);
});

test('cookie auth works and a tampered token does not fetch the chunk', async () => {
  const keys = await pair();
  const store = assets();
  const env = { ENTITLEMENT_SIGNING_KEY: keys.secret };
  const pro = await signed(keys, {
    licenseId: 'lic',
    grants: ['student', 'coach', 'pro'],
    tier: 'owner',
    src: 'owner',
    deviceId: 'dev',
    now: NOW,
    kind: 'code',
  });
  const viaCookie = await handlePaidChunk(request('/paid/coach-unlimited.js', pro, true), env, store.binding, () => NOW);
  assert.equal(viaCookie.status, 200);
  assert.equal(await viaCookie.text(), 'coach-screen-code');
  const tampered = `${pro.slice(0, -4)}xxxx`;
  const before = store.calls.filter((name) => name === 'media-console.js').length;
  const bad = await handlePaidChunk(request('/paid/media-console.js', tampered), env, store.binding, () => NOW);
  assert.equal(bad.status, 401);
  assert.equal(store.calls.filter((name) => name === 'media-console.js').length, before);
});

test('a program director without Pro receives media files and not Coach Unlimited', async () => {
  const keys = await pair();
  const store = assets();
  const env = { ENTITLEMENT_SIGNING_KEY: keys.secret };
  const seat = await signed(keys, {
    licenseId: 'gym',
    grants: [],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-dev',
    now: NOW,
    kind: 'seat',
    preset: 'program-director',
    subs: { state: 'locked' },
  });
  const media = await handlePaidChunk(request('/paid/media-console.js', seat), env, store.binding, () => NOW);
  assert.equal(media.status, 200);
  assert.equal(await media.text(), 'media-screen-code');
  const shared = await handlePaidChunk(request('/paid/shared.js', seat), env, store.binding, () => NOW);
  assert.equal(shared.status, 200);
  const coach = await handlePaidChunk(request('/paid/coach-unlimited.js', seat), env, store.binding, () => NOW);
  assert.equal(coach.status, 403);
  const lesson = await handlePaidChunk(request('/paid/lesson-cloud.js', seat), env, store.binding, () => NOW);
  assert.equal(lesson.status, 403);
});

test('grace still releases the file and a passed lock or expiry does not', async () => {
  const keys = await pair();
  const env = { ENTITLEMENT_SIGNING_KEY: keys.secret };
  const grace = await signed(keys, {
    licenseId: 'lic',
    grants: ['student', 'coach', 'pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now: NOW,
    kind: 'pro',
    subs: { state: 'grace', lock_at: '2026-11-05T12:00:00.000Z' },
  });
  const during = assets();
  const open = await handlePaidChunk(request('/paid/lesson-cloud.js', grace), env, during.binding, () => NOW);
  assert.equal(open.status, 200);

  const locked = await signed(keys, {
    licenseId: 'lic',
    grants: ['student', 'coach', 'pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'dev',
    now: NOW,
    kind: 'pro',
    subs: { state: 'locked' },
  });
  const afterLock = assets();
  const shut = await handlePaidChunk(request('/paid/pro-console.js', locked), env, afterLock.binding, () => NOW);
  assert.equal(shut.status, 403);
  assert.equal(afterLock.calls.includes('pro-console.js'), false);

  const expiredAt = new Date('2026-12-01T00:00:00.000Z');
  const stale = await handlePaidChunk(request('/paid/pro-console.js', grace), env, assets().binding, () => expiredAt);
  assert.equal(stale.status, 401);
});

test('a coach seat can fetch Lesson Cloud while Pro is locked and not the media chunk', async () => {
  const keys = await pair();
  const env = { ENTITLEMENT_SIGNING_KEY: keys.secret };
  const seat = await signed(keys, {
    licenseId: 'gym',
    grants: [],
    tier: 'seat',
    src: 'seat',
    deviceId: 'seat-dev',
    now: NOW,
    kind: 'seat',
    preset: 'coach',
    subs: { state: 'locked' },
  });
  const store = assets();
  const lesson = await handlePaidChunk(request('/paid/lesson-cloud.js', seat), env, store.binding, () => NOW);
  assert.equal(lesson.status, 200);
  const media = await handlePaidChunk(request('/paid/media-console.js', seat), env, store.binding, () => NOW);
  assert.equal(media.status, 403);
  const shared = await handlePaidChunk(request('/paid/shared.js', seat), env, store.binding, () => NOW);
  assert.equal(shared.status, 200);
});

test('missing signing, a missing manifest, and an unknown file do not return screen code', async () => {
  const store = assets();
  const unsigned = await handlePaidChunk(request('/paid/pro-console.js'), {}, store.binding, () => NOW);
  assert.equal(unsigned.status, 503);
  assert.deepEqual(store.calls, []);

  const keys = await pair();
  const env = { ENTITLEMENT_SIGNING_KEY: keys.secret };
  const unknown = await handlePaidChunk(request('/paid/other.js'), env, store.binding, () => NOW);
  assert.equal(unknown.status, 404);
  const empty = assets();
  empty.binding = {
    async fetch() {
      empty.calls.push('manifest.json');
      return new Response('nope', { status: 404 });
    },
  };
  const down = await handlePaidChunk(request('/paid/pro-console.js'), env, empty.binding, () => NOW);
  assert.equal(down.status, 503);
  assert.equal(down.status === 503 && empty.calls.includes('pro-console.js'), false);
});
