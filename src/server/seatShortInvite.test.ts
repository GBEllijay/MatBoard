import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import { instructorInviteLink } from '../lib/instructorSeats.ts';
import { QR_QUIET_ZONE, qrDataUrl, qrModuleCount } from '../lib/qr.ts';
import {
  SHORT_INVITE_LENGTH,
  encodeShortSeatInvite,
  parseShortSeatInvite,
  shortCodeForSignedSeatInvite,
  shortInviteCodeFromPath,
} from '../lib/seatShortInvite.ts';
import { INVITE_CLAIMED, INVITE_EMAIL_MISMATCH, INVITE_EXPIRED, INVITE_REPLACED, INVITE_REVOKED, handleLogin, type LoginEnv } from './loginAccount.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { handleSeatAccept, handleSeatIssue, handleSeatReset, handleSeatRevoke } from './seats.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { issueToken } from './tokenIssue.ts';
import type { D1Database } from './d1.ts';

/**
 * Short instructor invite links (/i/<code>) for the invite QR, Nov 18. The signed link made a
 * ~100-module QR that phone cameras could not read. In-memory SQLite only: no production data.
 */

const PEPPER = 'short-invite-pepper';
const NOW = new Date('2026-11-18T13:00:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'some pass 123';

type Fixture = { db: D1Database; env: LoginEnv; secret: string };

async function fixture(): Promise<Fixture> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const env: LoginEnv = {
    CODE_HASH_PEPPER: PEPPER,
    ENTITLEMENT_SIGNING_KEY: JSON.stringify(privateJwk),
    ENTITLEMENT_KEY_ID: 'k1',
    TURNSTILE_SECRET_KEY: 'turnstile-test',
  };
  return { db: sqliteD1(), env, secret: JSON.stringify(privateJwk) };
}

function post(path: string, body: unknown, ip = '198.51.100.7'): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

const noNetwork = async () => new Response('{}', { status: 404 });

async function login(f: Fixture, body: Record<string, unknown>, at: Date = NOW) {
  const response = await handleLogin(post('/api/login/invite', { password: PASSWORD, ...body }), f.env, f.db, () => at, noNetwork);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function accept(f: Fixture, invite: string, deviceId: string, at: Date = NOW) {
  const response = await handleSeatAccept(post('/api/seats/accept', { invite, deviceId }), f.env, f.db, noNetwork, () => at);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function ownerPro(f: Fixture): Promise<string> {
  const { licenseId } = await recordPurchase(f.db, {
    email: 'owner@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_owner',
    sessionId: 'cs_owner',
    pepper: PEPPER,
    now: NOW,
  });
  const token = await issueToken(f.secret, {
    licenseId,
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'stripe',
    deviceId: 'owner-phone',
    now: NOW,
    kind: 'pro',
    subs: { state: 'active' },
  });
  if (!token) throw new Error('owner token');
  return token;
}

async function issueSeat(f: Fixture, ownerToken: string, email: string, at: Date = NOW) {
  const issued = await handleSeatIssue(post('/api/seats/issue', { token: ownerToken, email, preset: 'program-director' }), f.env, f.db, () => at);
  assert.equal(issued.status, 200);
  const body = (await issued.json()) as { seatId: string; invite: string };
  const code = shortCodeForSignedSeatInvite(body.invite);
  assert.ok(code, 'a server-issued seat always has a short code');
  return { ...body, code, link: instructorInviteLink(body.invite, ORIGIN) };
}

function decodePng(dataUrl: string): { text: string | null; width: number } {
  const png = PNG.sync.read(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  const found = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height);
  return { text: found?.data ?? null, width: png.width };
}

test('short code round-trips seat id + nonce, and only the canonical 44-character form parses', () => {
  const sid = '3f1c2b9a-6d4e-4b8f-9a1c-2d3e4f5a6b7c';
  const nonce = 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d';
  const code = encodeShortSeatInvite(sid, nonce);
  assert.equal(code?.length, SHORT_INVITE_LENGTH);
  assert.deepEqual(parseShortSeatInvite(code ?? ''), { sid, nonce });
  assert.equal(parseShortSeatInvite('not-an-invite'), null);
  assert.equal(parseShortSeatInvite('a.b.c'), null);
  assert.equal(encodeShortSeatInvite('legacy-device-token', nonce), null);
  assert.equal(shortInviteCodeFromPath(`/i/${code}`), code);
  assert.equal(shortInviteCodeFromPath(`/i/${code}/`), code);
  assert.equal(shortInviteCodeFromPath('/i/short'), null);
  assert.equal(shortInviteCodeFromPath(`/account`), null);
  // Legacy device tokens keep the long /account?invite= link.
  assert.equal(instructorInviteLink('tok-coach', ORIGIN), `${ORIGIN}/account?invite=tok-coach`);
});

test('the invite link and QR carry the short /i/ link; the QR decodes with a real decoder', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  // Long, realistic address so the old link is as long as the one in the owner's screenshot.
  const seat = await issueSeat(f, owner, 'augustus.maximilian.longname.coach@gmail.com');
  assert.ok(seat.invite.length > 300, `signed invite is long (${seat.invite.length})`);
  const longLink = `${ORIGIN}/account?invite=${encodeURIComponent(seat.invite)}`;
  assert.equal(seat.link, `${ORIGIN}/i/${seat.code}`);
  assert.ok(seat.link.length <= 80, `short link length ${seat.link.length}`);

  const shortModules = qrModuleCount(seat.link);
  const longModules = qrModuleCount(longLink);
  assert.ok(shortModules - QR_QUIET_ZONE * 2 <= 41, `short QR is version 6 or smaller (${shortModules - 8} modules)`);
  assert.ok(longModules > shortModules * 1.8, `old QR was far denser (${longModules - 8} vs ${shortModules - 8})`);

  for (const text of [seat.link, longLink]) {
    const png = decodePng(await qrDataUrl(text));
    assert.equal(png.text, text);
    assert.ok(png.width >= 780, 'raster stays sharp at 260 CSS px on a DPR 3 phone');
  }
  console.log(`invite QR: signed link ${longLink.length} chars / ${longModules - 8} modules -> short link ${seat.link.length} chars / ${shortModules - 8} modules`);
});

test('/i/<code> keeps every invite check: wrong email, revoked, expired, replaced after reset, open on another device', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);

  // Works as a pasted /i/ link and as the bare code (what /account?invite=<code> sends).
  const good = await issueSeat(f, owner, 'coach.good@gym.test');
  const wrong = await login(f, { email: 'someone.else@gym.test', code: good.link });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.reason, 'email');
  assert.equal(wrong.body.error, INVITE_EMAIL_MISMATCH);
  const ok = await login(f, { email: 'coach.good@gym.test', code: good.link, deviceId: 'good-phone' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const bare = await issueSeat(f, owner, 'coach.bare@gym.test');
  const okBare = await login(f, { email: 'coach.bare@gym.test', code: bare.code, deviceId: 'bare-phone' });
  assert.equal(okBare.status, 200, JSON.stringify(okBare.body));

  const revoked = await issueSeat(f, owner, 'gone@gym.test');
  await handleSeatRevoke(post('/api/seats/revoke', { token: owner, seatId: revoked.seatId }), f.env, f.db, () => NOW);
  const r = await login(f, { email: 'gone@gym.test', code: revoked.code });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, INVITE_REVOKED);
  assert.equal((await accept(f, revoked.code, 'gone-phone')).status, 403);

  const old = await issueSeat(f, owner, 'late@gym.test', new Date(NOW.getTime() - 15 * DAY));
  const e = await login(f, { email: 'late@gym.test', code: old.link });
  assert.equal(e.status, 400);
  assert.equal(e.body.error, INVITE_EXPIRED);
  const lateAccept = await accept(f, old.code, 'late-phone');
  assert.equal(lateAccept.status, 400);
  assert.match(String(lateAccept.body.error), /expired/);

  const reset = await issueSeat(f, owner, 'reset@gym.test');
  const fresh = await handleSeatReset(post('/api/seats/reset', { token: owner, seatId: reset.seatId }), f.env, f.db, () => NOW);
  const freshCode = shortCodeForSignedSeatInvite(((await fresh.json()) as { invite: string }).invite);
  assert.ok(freshCode && freshCode !== reset.code, 'reset gives a new short code');
  const replaced = await login(f, { email: 'reset@gym.test', code: reset.code });
  assert.equal(replaced.status, 400);
  assert.equal(replaced.body.error, INVITE_REPLACED);
  assert.equal((await accept(f, reset.code, 'reset-phone')).status, 400);
  const withFresh = await login(f, { email: 'reset@gym.test', code: `${ORIGIN}/i/${freshCode}`, deviceId: 'reset-phone' });
  assert.equal(withFresh.status, 200, JSON.stringify(withFresh.body));

  const onPhone = await issueSeat(f, owner, 'phone.coach@gym.test');
  assert.equal((await accept(f, onPhone.code, 'first-phone')).status, 200);
  const other = await accept(f, onPhone.code, 'second-phone');
  assert.equal(other.status, 409);
  const claimed = await login(f, { email: 'phone.coach@gym.test', code: onPhone.link, deviceId: 'laptop' });
  assert.equal(claimed.status, 409);
  assert.equal(claimed.body.error, INVITE_CLAIMED);
});

test('a guessed nonce does not open a seat', async () => {
  const f = await fixture();
  const owner = await ownerPro(f);
  const seat = await issueSeat(f, owner, 'target@gym.test');
  const forged = encodeShortSeatInvite(seat.seatId, crypto.randomUUID());
  assert.ok(forged);
  assert.equal((await accept(f, forged, 'attacker')).status, 400);
  const viaLogin = await login(f, { email: 'target@gym.test', code: forged });
  assert.equal(viaLogin.status, 400);
});

test('every other qrDataUrl link (coach connect, academy pathway, event and shop cast) still decodes with the 4-module quiet zone', async () => {
  const f = await fixture();
  const { signJson } = await import('../lib/entitlementToken.ts');
  const { coachConnectUrl } = await import('../lib/coachConnect.ts');
  const { academyPathway, academyPathwayUrl } = await import('../lib/academyPathway.ts');
  const privateJwk = JSON.parse(f.secret) as PrivateJwk;
  const coachInvite = await signJson(
    'k1',
    { typ: 'coach-connect', v: 1, gym: crypto.randomUUID(), name: 'Advantage Brazilian Jiu-Jitsu Ellijay Academy', key: 'k'.repeat(43), via: crypto.randomUUID() },
    privateJwk,
  );
  const pathway = academyPathway({
    provider: 'googleDrive',
    folderId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
    folderName: 'Advantage Academy Lessons and Student Videos 2026',
    gymName: 'Advantage Brazilian Jiu-Jitsu Ellijay',
    license: crypto.randomUUID(),
  });
  assert.ok(pathway);
  const links = {
    coachConnect: coachConnectUrl(coachInvite, ORIGIN),
    academyPathway: academyPathwayUrl(pathway, ORIGIN),
    eventCast: 'https://www.smoothcomp.com/en/event/24567/registration?utm_source=advantage&utm_medium=tv',
    studentId: 'advantage-student:6c1f8d2e-4b3a-4f5e-9d8c-7b6a5f4e3d2c',
  };
  for (const [name, text] of Object.entries(links)) {
    const png = decodePng(await qrDataUrl(text));
    assert.equal(png.text, text, `${name} decodes`);
    console.log(`${name}: ${text.length} chars, ${qrModuleCount(text) - QR_QUIET_ZONE * 2} modules`);
  }
});
