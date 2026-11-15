import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Instructor seat invite, end to end on this browser:
 * owner issues a seat -> /api/login/invite (in-memory SQLite) -> applyLoginPayload ->
 * the cards on /products. Every edition the seat pass grants must be open, with no
 * price and no demo. Media Edition is not on a seat pass and stays a buy card unless
 * the seat's switches include Media Console. Nothing here touches production.
 */

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}
const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: '' }, configurable: true });

const {
  ENTITLEMENT_DEVICE_KEY,
  clearEntitlementToken,
  entitlementNowMs,
  entitlementSnapshot,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
  setEntitlementReadyForTests,
} = await import('./entitlement.ts');
const { LEGACY_AMNESTY_ENDS_AT, PRO_RELOCK_KEY, COACH_RELOCK_KEY } = await import('./legacyUnlock.ts');
const { applyLoginPayload } = await import('./emailLogin.ts');
const { proPlusCloudUnlocked } = await import('./proPlusCloud.ts');
const { homeTiles } = await import('./productTiles.ts');
const { isWhiteUnlocked } = await import('./whiteUnlock.ts');
const { isProUnlocked } = await import('./proUnlock.ts');
const { isCoachUnlocked, isCoachUnlimitedUnlocked } = await import('./coachUnlock.ts');
const { isMediaUnlocked } = await import('./mediaUnlock.ts');
const { isStudentEditionUnlocked } = await import('./studentUnlock.ts');
const { studentEditionEntitled } = await import('./studentEdition.ts');
const { rankSeatDoor } = await import('./ownerPassRank.ts');
const {
  instructorInviteLink,
  isLiveSeat,
  isProgramDirectorSeat,
  readCurrentSeat,
  seatGrantsCoachMenus,
  seatGrantsMediaConsole,
} = await import('./instructorSeats.ts');
const { handleLogin } = await import('../server/loginAccount.ts');
const { handleSeatIssue } = await import('../server/seats.ts');
const { recordPurchase } = await import('../server/purchaseRecords.ts');
const { sqliteD1 } = await import('../server/sqliteD1.ts');
const { issueToken } = await import('../server/tokenIssue.ts');

import type { LoginPayload } from './emailLogin.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';

const PEPPER = 'seat-home-pepper';
const NOW = new Date('2026-11-14T18:12:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const DEVICE = '6b1c43f1-7e0e-4bb2-9e0f-0a6b3e2b8c11';

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const pub = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return { secret: JSON.stringify(privateJwk), publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: pub.x, y: pub.y } };
}

function post(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-advantage-app': '9.9.9', 'cf-connecting-ip': '198.51.100.21' },
    body: JSON.stringify(body),
  });
}

type Permissions = Record<string, boolean>;

/** Owner (Pro) issues one seat; the instructor sets a password with the invite link. */
async function seatSignIn(preset: string, permissions?: Permissions) {
  const db = sqliteD1();
  const pair = await keys();
  const env = { CODE_HASH_PEPPER: PEPPER, ENTITLEMENT_SIGNING_KEY: pair.secret, ENTITLEMENT_KEY_ID: 'k1', TURNSTILE_SECRET_KEY: 't' };
  const { licenseId } = await recordPurchase(db, {
    email: 'owner@gym.test',
    product: 'advantage-pro',
    source: 'code',
    sourceRef: 'code:alpha-1:salt:pro',
    sessionId: 'code:alpha-1:salt:pro',
    pepper: PEPPER,
    now: NOW,
  } as never);
  const ownerToken = await issueToken(pair.secret, {
    licenseId,
    grants: ['white', 'student', 'coach', 'pro', 'media'],
    tier: 'alpha',
    src: 'code',
    deviceId: 'owner-phone',
    now: NOW,
    kind: 'pro',
    subs: { state: 'active', cloud: true },
  } as never);
  const issued = await handleSeatIssue(
    post('/api/seats/issue', { token: ownerToken, email: 'marty@gym.test', preset, ...(permissions ? { permissions } : {}) }),
    env as never,
    db,
    () => NOW,
  );
  assert.equal(issued.status, 200);
  const seat = (await issued.json()) as { seatId: string; invite: string };
  const link = instructorInviteLink(seat.invite, ORIGIN);
  const response = await handleLogin(
    post('/api/login/invite', { email: 'marty@gym.test', code: link, password: 'marty pass 12', deviceId: DEVICE }),
    env as never,
    db,
    () => NOW,
    async () => new Response('{}', { status: 404 }),
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as LoginPayload;
  return { pair, payload, link, env, db, seat };
}

function resetBrowser(publicJwk: PublicJwk) {
  local.clear();
  clearEntitlementToken();
  setEntitlementClockForTests(() => NOW.getTime() + 1000);
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: publicJwk }], legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT });
  setEntitlementReadyForTests(true);
  local.setItem(ENTITLEMENT_DEVICE_KEY, DEVICE);
}

/** The same reads the /products hooks make, with no ?student=1 in the address. */
function productsTiles() {
  const seat = readCurrentSeat();
  const claims = entitlementSnapshot().claims;
  const door = rankSeatDoor(
    {
      proUnlocked: isProUnlocked(),
      seat,
      seated: isLiveSeat(seat),
      seatGrantsMedia: seatGrantsMediaConsole(seat),
      programDirectorSeat: isProgramDirectorSeat(seat),
      coachMenus: seatGrantsCoachMenus(seat),
      mediaUnlocked: isMediaUnlocked(),
      coachUnlocked: isCoachUnlimitedUnlocked(),
    },
    claims,
  );
  const owner = { pro: door.proUnlocked, coach: isCoachUnlocked(), white: isWhiteUnlocked(), student: isStudentEditionUnlocked() };
  const entitled = studentEditionEntitled(owner);
  return homeTiles({
    door,
    claims,
    nowMs: entitlementNowMs(),
    amnesty: entitlementSnapshot().amnesty,
    settled: true,
    whiteUnlocked: isWhiteUnlocked(),
    coachUnlocked: isCoachUnlocked(),
    studentOpen: entitled,
    studentDemo: !entitled,
    cloudOpen: proPlusCloudUnlocked(),
  });
}

test('the invite link and QR open the account page in invite mode', () => {
  assert.equal(instructorInviteLink('a.b.c', 'https://gym.test/'), 'https://gym.test/account?invite=a.b.c');
});

test('Instructors preset seat: White, Student, Instructor and Pro are open with no price; Media follows the switches', async () => {
  const { pair, payload } = await seatSignIn('instructors');
  assert.ok(payload.seat?.token, 'sign-in returns the seat pass');
  resetBrowser(pair.publicJwk);
  await applyLoginPayload(payload, local as unknown as Storage);
  assert.equal(entitlementSnapshot().claims?.src, 'seat');
  const tiles = productsTiles();
  assert.deepEqual(tiles, {
    white: 'open',
    student: 'open',
    // The Instructors preset turns on Gallery, Events and Pro Shop: Media Console opens.
    media: 'open',
    instructor: 'open',
    pro: 'open',
    proTo: '/pro',
    cloudButton: false,
    proPrice: false,
  });
});

test('Coach preset seat: everything the pass grants is open; Media Edition (not granted) stays a buy card', async () => {
  const { pair, payload } = await seatSignIn('coach');
  resetBrowser(pair.publicJwk);
  await applyLoginPayload(payload, local as unknown as Storage);
  const tiles = productsTiles();
  assert.equal(tiles.white, 'open');
  assert.equal(tiles.student, 'open');
  assert.equal(tiles.instructor, 'open');
  assert.equal(tiles.pro, 'open');
  assert.equal(tiles.proTo, '/pro');
  assert.equal(tiles.media, 'buy');
  assert.equal(tiles.proPrice, false);
});

test('a Lock Pro or Lock Coach left on this browser does not make a seat sign-in look locked', async () => {
  const { pair, payload } = await seatSignIn('instructors');
  resetBrowser(pair.publicJwk);
  local.setItem(PRO_RELOCK_KEY, '1');
  local.setItem(COACH_RELOCK_KEY, '1');
  await applyLoginPayload(payload, local as unknown as Storage);
  // The doors themselves reopen, so Coach Unlimited and the full seat console come back too.
  assert.equal(isProUnlocked(), true);
  assert.equal(isCoachUnlocked(), true);
  const tiles = productsTiles();
  assert.equal(tiles.instructor, 'open');
  assert.equal(tiles.pro, 'open');
  assert.equal(tiles.white, 'open');
  assert.equal(tiles.student, 'open');
});

test('a seat never opens the owner Pro + Cloud page; its academy tools are in the Pro console', async () => {
  const { pair, payload } = await seatSignIn('instructors');
  resetBrowser(pair.publicJwk);
  await applyLoginPayload(payload, local as unknown as Storage);
  assert.equal(proPlusCloudUnlocked(), false);
  assert.equal(productsTiles().proTo, '/pro');
});

test('a second try with the same invite answers 409, and the account page switches to Sign in with the email kept', async () => {
  const { link, env, db } = await seatSignIn('coach');
  const again = await handleLogin(
    post('/api/login/invite', { email: 'marty@gym.test', code: link, password: 'another pass 1', deviceId: DEVICE }),
    env as never,
    db,
    () => NOW,
    async () => new Response('{}', { status: 404 }),
  );
  assert.equal(again.status, 409);
  const { readFileSync } = await import('node:fs');
  const account = readFileSync(new URL('../pages/Account.tsx', import.meta.url), 'utf8');
  assert.match(account, /result\.status === 409[\s\S]{0,200}setMode\('signin'\)[\s\S]{0,40}setNote\(INVITE_ALREADY_SET_UP\)/);
  assert.match(account, /INVITE_WELCOME/);
});

test('after sign-in, an invite link or the homepage prompt goes back to the products page', async () => {
  const { accountReturnPath, accountInvitePath, ACCOUNT_SIGN_IN_FROM_HOME } = await import('./emailLogin.ts');
  assert.equal(accountInvitePath('a.b.c'), '/account?invite=a.b.c');
  assert.equal(accountReturnPath(new URLSearchParams('invite=a.b.c')), '/products');
  assert.equal(accountReturnPath(new URLSearchParams(ACCOUNT_SIGN_IN_FROM_HOME.split('?')[1])), '/products');
  assert.equal(accountReturnPath(new URLSearchParams('')), null, 'a plain visit to /account stays on the account page');
  assert.equal(accountReturnPath(new URLSearchParams('return=https://evil.test')), null, 'never a path from the address');
});

test('homepage "Returning user?" line: Sign in here when signed out, the masked email and Account when signed in', async () => {
  const { returningUserPrompt } = await import('./returningUser.ts');
  assert.deepEqual(returningUserPrompt(null), { signedIn: false, lead: 'Returning user?', link: 'Sign in here' });
  assert.deepEqual(returningUserPrompt('m***@gym.test'), { signedIn: true, lead: 'Signed in as m***@gym.test.', link: 'Account' });
  const { readFileSync } = await import('node:fs');
  const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
  assert.match(home, /<ReturningUserPrompt \/>/);
  const prompt = readFileSync(new URL('../components/ReturningUserPrompt.tsx', import.meta.url), 'utf8');
  assert.match(prompt, /ACCOUNT_SIGN_IN_FROM_HOME/);
});

test('invite links never paint a blank page and never turn a seat on without a login', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  // The old door returned null for every signed invite, including /account?invite=, which left only
  // the background (seen in Messenger, whose browser has its own storage so the silent accept failed).
  assert.doesNotMatch(app, /acceptSignedSeat/);
  assert.match(app, /const signedInvite = Boolean\(token && !onAccount && isSignedSeatInvite\(token\)\)/);
  assert.match(app, /if \(token && window\.location\.pathname === ACCOUNT_PATH\) return;/);
  assert.match(app, /replaceState\(window\.history\.state, '', accountInvitePath\(token\)\)/);
});
