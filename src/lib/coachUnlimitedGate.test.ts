/**
 * Owner 2026-11-01: Coach Unlimited IS the Instructor Edition.
 * Instructor (and legacy $29.99 Coach) purchases and the alpha-coach code reach
 * /coach-unlimited; Pro still does; White, Student and Media do not; seats are unchanged.
 * Covers both the client route gate and the server paid-chunk gate.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { CLIENT_APP_VERSION } from './appCapability.ts';
import { isCoachUnlimitedUnlocked } from './coachUnlock.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  entitlementSnapshot,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { clearOwnerTestGrant } from './ownerTestGrant.ts';
import { paidChunkAllowed } from './paidChunkAccess.ts';
import { coachUnlimitedDoorOpen, visibleProHubs, COACH_UNLIMITED_PATH } from './productNames.ts';
import { isProUnlocked } from './proUnlock.ts';
import { grantsForKind } from '../server/codeCatalog.ts';
import { grantsForProduct } from '../server/grantMatrix.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_MEDIA, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from '../server/routes.ts';
import { issueToken } from '../server/tokenIssue.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: () => null,
    length: 0,
    clear: () => store.clear(),
  };
}
const local = memoryStorage();
const session = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });

let signingKey = '';

async function freshKeys() {
  local.clear();
  session.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  signingKey = JSON.stringify(privateJwk);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }] });
}

type Pass = { grants: string[]; src: 'stripe' | 'code'; subs?: { state: 'active' | 'locked' } };

async function accept(pass: Pass) {
  await freshKeys();
  const token = await issueToken(
    signingKey,
    {
      licenseId: 'lic-gate',
      grants: pass.grants as never,
      tier: pass.src === 'code' ? 'alpha' : 'white',
      src: pass.src,
      deviceId: 'dev',
      now: new Date(),
      kind: pass.subs ? 'subscription' : 'onetime',
      appVersion: CLIENT_APP_VERSION,
      ...(pass.subs ? { subs: pass.subs } : {}),
    } as Parameters<typeof issueToken>[1],
    'k1',
  );
  assert.ok(token);
  assert.equal(await acceptServerToken(token as string), true);
  const claims = entitlementSnapshot().claims;
  assert.ok(claims);
  return claims;
}

/** What App.tsx's CoachUnlimitedRoute sees for an unseated browser, plus the server chunk rule. */
async function gate(pass: Pass) {
  const claims = await accept(pass);
  const door = {
    proUnlocked: isProUnlocked(),
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
    coachUnlocked: isCoachUnlimitedUnlocked(),
  };
  return { route: coachUnlimitedDoorOpen(door), chunk: paidChunkAllowed(claims, 'coach-unlimited', Date.now()), door };
}

const ALLOWED: [string, Pass][] = [
  // Old $29.99 Coach and new $49.99 Instructor both carry metadata product advantage-coach.
  ['Instructor purchase (new or legacy Coach price)', { grants: grantsForProduct(API_PRODUCT_COACH), src: 'stripe' }],
  ['alpha-coach code', { grants: grantsForKind('alpha-coach'), src: 'code' }],
  ['Pro purchase', { grants: grantsForProduct(API_PRODUCT_PRO), src: 'stripe', subs: { state: 'active' } }],
  ['alpha-pro code', { grants: grantsForKind('alpha-pro'), src: 'code' }],
];

const BLOCKED: [string, Pass][] = [
  ['White purchase', { grants: grantsForProduct(API_PRODUCT_ID), src: 'stripe' }],
  ['Student purchase', { grants: grantsForProduct(API_PRODUCT_STUDENT), src: 'stripe' }],
  ['Media purchase', { grants: grantsForProduct(API_PRODUCT_MEDIA), src: 'stripe' }],
  ['alpha-media code', { grants: grantsForKind('alpha-media'), src: 'code' }],
  ['alpha-student code', { grants: grantsForKind('alpha-student'), src: 'code' }],
  ['free-white code', { grants: grantsForKind('free-white'), src: 'code' }],
  ['locked Pro subscription', { grants: grantsForProduct(API_PRODUCT_PRO), src: 'stripe', subs: { state: 'locked' } }],
];

for (const [label, pass] of ALLOWED) {
  test(`${label} reaches /coach-unlimited (route gate and paid chunk)`, async () => {
    const result = await gate(pass);
    assert.equal(result.route, true, label);
    assert.equal(result.chunk, true, label);
  });
}

for (const [label, pass] of BLOCKED) {
  test(`${label} does not reach /coach-unlimited`, async () => {
    const result = await gate(pass);
    assert.equal(result.route, false, label);
    assert.equal(result.chunk, false, label);
  });
}

test('the coach door does not add the Pro Console hubs for an unseated Instructor', async () => {
  const { door } = await gate({ grants: grantsForProduct(API_PRODUCT_COACH), src: 'stripe' });
  assert.equal(door.proUnlocked, false);
  assert.deepEqual(visibleProHubs(door), []);
});

test('seats are unchanged: the coach door never opens Coach Unlimited for a seat', () => {
  const seat = { proUnlocked: false, seated: true, seatGrantsMedia: false, programDirectorSeat: false, coachMenus: true, coachUnlocked: true };
  assert.equal(coachUnlimitedDoorOpen(seat), false);
  assert.equal(coachUnlimitedDoorOpen({ ...seat, proUnlocked: true, coachMenus: false }), false);
  assert.equal(coachUnlimitedDoorOpen({ ...seat, proUnlocked: true }), true);
  assert.deepEqual(visibleProHubs({ ...seat, proUnlocked: true }).map((hub) => hub.to), [COACH_UNLIMITED_PATH]);
});

test('/student-roster stays on the Coach Unlimited gate and opens the real student roster', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const route = app.slice(app.indexOf('path="/student-roster"'), app.indexOf('path="/coach-unlimited/academy"'));
  assert.match(route, /<CoachUnlimitedRoute>\s*<RosterPage \/>\s*<\/CoachUnlimitedRoute>/);
  assert.doesNotMatch(route, /StudentRosterPlaceholder|Coming soon/);
  assert.doesNotMatch(app, /StudentRosterPlaceholderPage/);
  const roster = readFileSync(new URL('../pages/Roster.tsx', import.meta.url), 'utf8');
  assert.match(roster, /isCoachStudentRoster\(pathname, searchParams\.get\('from'\)\)/);
  assert.match(roster, /const showCsv = rosterCsvAvailable\(proUnlocked, coachUnlocked\)/);
  assert.doesNotMatch(roster, /showCsv = !studentRoster/);
  assert.match(roster, /addStudents\(result\.students, \{ rosterList: studentRoster \? 'student' : 'competitor' \}\)/);
  assert.match(roster, /serializeRosterCsv\(listed, studentRoster \? STUDENT_NOTES_LABEL : undefined\)/);
  assert.doesNotMatch(roster, /Coming soon/);
  assert.equal(existsSync(new URL('../pages/StudentRosterPlaceholder.tsx', import.meta.url)), false);
});

test('callers that leave coachUnlocked out keep the old Pro-only rule', () => {
  const base = { seated: false, seatGrantsMedia: false, programDirectorSeat: false, coachMenus: false };
  assert.equal(coachUnlimitedDoorOpen({ ...base, proUnlocked: false }), false);
  assert.equal(coachUnlimitedDoorOpen({ ...base, proUnlocked: true }), true);
});
