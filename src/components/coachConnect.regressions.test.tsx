/**
 * Coach connect QR (Advantage Cloud, no Drive folder). One academy-wide code.
 * Owner: the panel sits once with the instructor seat invites, shows with
 * Cloud and no folder, stays closed without Cloud, and can be replaced.
 * Instructor: opening the scanned link joins the academy on Advantage Cloud.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const dom = new Window({ url: 'https://advantagebjjtimer.com/instructors' });
const view = dom as unknown as Window & typeof globalThis;
function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
installGlobal('indexedDB', view.indexedDB);
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);

const { CoachConnectQrPanel, COACH_CONNECT_CREATE, COACH_CONNECT_NEEDS_CLOUD, COACH_CONNECT_ROTATE, COACH_CONNECT_ROTATE_CONFIRM } =
  await import('./CoachConnectQrPanel.tsx');
const { AcademyConnectPage } = await import('../pages/student/ConnectionsPage.tsx');
const { applyOwnerTestGrant, clearOwnerTestGrant } = await import('../lib/ownerTestGrant.ts');
const { ENTITLEMENT_TOKEN_KEY } = await import('../lib/entitlement.ts');
const { loadAcademyLink, ACADEMY_BINDING_KEY } = await import('../lib/academyPathway.ts');
const { readMembership } = await import('../lib/academyMembership.ts');
const { readAcademyLicense } = await import('../lib/studentInboxClient.ts');
const { COACH_CONNECT_LINK_KEY, coachConnectUrl, parseCoachConnectInput } = await import('../lib/coachConnect.ts');
const { readFileSync } = await import('node:fs');

const INVITE = 'eyJhbGciOiJFUzI1NiJ9.eyJ0eXAiOiJjb2FjaC1jb25uZWN0In0.c2lnbmF0dXJl';
const NEW_INVITE = 'eyJhbGciOiJFUzI1NiJ9.eyJ0eXAiOiJjb2FjaC1jb25uZWN0IiwibmV3Ijp0cnVlfQ.bmV3c2ln';
const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
function fakeFetch(reply: (body: Record<string, unknown>) => { status: number; body: unknown }) {
  installGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url !== '/api/gym/coach-connect') {
      // Cloud status and anything else the page asks: answer "off" so only the coach connect call decides.
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = new Headers(init.headers);
    calls.push({ url, body, auth: headers.get('authorization') });
    const out = reply(body);
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
  });
}

function mount(node: ReactNode, entry: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>));
  return { root, host };
}
function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}
const buttons = (host: ParentNode) => [...host.querySelectorAll('button')].map((node) => node.textContent?.trim() ?? '');
function button(host: ParentNode, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  assert.equal(found?.tagName, 'BUTTON', name);
  return found as HTMLButtonElement;
}
async function settle() {
  for (let i = 0; i < 10; i += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}

test('one coach connect QR sits in the instructor invite panel, next to the seat invites, not on each seat', () => {
  const panel = readFileSync('src/components/InstructorInvitePanel.tsx', 'utf8');
  assert.match(panel, /<CoachConnectQrPanel \/>\s*<section className="binder-list"/);
  assert.equal(panel.match(/<CoachConnectQrPanel/g)?.length, 1);
  const source = readFileSync('src/components/CoachConnectQrPanel.tsx', 'utf8');
  assert.doesNotMatch(source, /useDriveConnected|DriveHandoff|academyPathway|seat\.id|email/, 'no Drive gate, nothing per seat');
});

test('without Advantage Cloud the QR stays closed', async () => {
  localStorage.clear();
  clearOwnerTestGrant();
  const page = mount(<CoachConnectQrPanel />, '/instructors');
  assert.ok((page.host.textContent ?? '').includes(COACH_CONNECT_NEEDS_CLOUD));
  assert.equal(buttons(page.host).includes(COACH_CONNECT_CREATE), false);
  assert.equal(page.host.querySelector('img'), null);
  unmount(page);
});

test('with Advantage Cloud and no Drive folder the owner shows, keeps, and can replace the one QR', async () => {
  localStorage.clear();
  calls.length = 0;
  applyOwnerTestGrant({ grants: ['pro', 'coach', 'media', 'student', 'white'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'all' });
  localStorage.setItem(ENTITLEMENT_TOKEN_KEY, 'owner.token.value');
  assert.equal(localStorage.getItem(ACADEMY_BINDING_KEY), null);
  fakeFetch((body) =>
    body.action === 'current'
      ? { status: 404, body: { ok: false, reason: 'none' } }
      : { status: 200, body: { ok: true, invite: INVITE, gym: 'gymowner01', gymName: 'Advantage BJJ' } },
  );
  const page = mount(<CoachConnectQrPanel />, '/instructors');
  await settle();
  assert.equal(calls[0]?.body.action, 'current', 'looks for a code made on another device first');
  calls.length = 0;
  assert.ok(buttons(page.host).includes(COACH_CONNECT_CREATE));
  await click(button(page.host, COACH_CONNECT_CREATE));
  assert.equal(calls[0]?.url, '/api/gym/coach-connect');
  assert.equal(calls[0]?.body.action, 'issue');
  assert.equal(calls[0]?.auth, 'Bearer owner.token.value');
  const field = page.host.querySelector('input[readonly]') as HTMLInputElement;
  assert.equal(field.value, coachConnectUrl(INVITE, 'https://advantagebjjtimer.com'));
  assert.match(field.value, /^https:\/\/advantagebjjtimer\.com\/student\/connections\?coach=/);
  const img = page.host.querySelector('img[alt="Coach connect QR"]') as HTMLImageElement | null;
  assert.match(img?.getAttribute('src') ?? '', /^data:image\/png;base64,/);
  assert.equal(page.host.querySelectorAll('img[alt="Coach connect QR"]').length, 1);
  assert.ok(buttons(page.host).includes('Copy coach connect link'));
  assert.ok(localStorage.getItem(COACH_CONNECT_LINK_KEY));
  assert.match(page.host.textContent ?? '', /Academy-wide · reusable/);
  assert.match(page.host.textContent ?? '', /does\s+not use or give an instructor seat/);

  // Replace (rotate) asks first, then calls rotate and shows the new link.
  fakeFetch(() => ({ status: 200, body: { ok: true, invite: NEW_INVITE, gym: 'gymowner01', gymName: 'Advantage BJJ' } }));
  await click(button(page.host, COACH_CONNECT_ROTATE));
  assert.equal(calls.length, 1, 'nothing sent before the confirm');
  await click(button(page.host, COACH_CONNECT_ROTATE_CONFIRM));
  assert.equal(calls[1]?.body.action, 'rotate');
  assert.equal((page.host.querySelector('input[readonly]') as HTMLInputElement).value, coachConnectUrl(NEW_INVITE, 'https://advantagebjjtimer.com'));
  assert.match(page.host.textContent ?? '', /old QR and link no longer work/);
  unmount(page);

  // Still there after a reload on this device.
  const again = mount(<CoachConnectQrPanel />, '/instructors');
  await settle();
  assert.ok(again.host.querySelector('img[alt="Coach connect QR"]'));
  assert.equal((again.host.querySelector('input[readonly]') as HTMLInputElement).value, coachConnectUrl(NEW_INVITE, 'https://advantagebjjtimer.com'));
  unmount(again);

  fakeFetch((body) =>
    body.action === 'current'
      ? { status: 404, body: { ok: false, reason: 'none' } }
      : { status: 403, body: { ok: false, error: 'The coach connect QR needs Advantage Cloud on this gym.' } },
  );
  localStorage.removeItem(COACH_CONNECT_LINK_KEY);
  const refused = mount(<CoachConnectQrPanel />, '/instructors');
  await settle();
  await click(button(refused.host, COACH_CONNECT_CREATE));
  assert.match(refused.host.textContent ?? '', /needs Advantage Cloud on this gym/);
  assert.equal(refused.host.querySelector('img'), null);
  unmount(refused);
  clearOwnerTestGrant();
});

test('scanning the link joins the academy on Advantage Cloud, with no folder, and her card can go to the owner', async () => {
  localStorage.clear();
  calls.length = 0;
  fakeFetch((body) =>
    body.action === 'accept'
      ? { status: 200, body: { ok: true, gym: 'gymowner01', gymName: 'Advantage BJJ' } }
      : { status: 200, body: { ok: true } },
  );
  assert.equal(parseCoachConnectInput(coachConnectUrl(INVITE, 'https://advantagebjjtimer.com')), INVITE);
  const page = mount(<AcademyConnectPage />, `/student/academy?coach=${INVITE}`);
  await settle();
  assert.equal(calls[0]?.body.action, 'accept');
  assert.equal(calls[0]?.body.invite, INVITE);
  assert.equal(readAcademyLicense(localStorage), 'gymowner01');
  assert.equal(readMembership(localStorage).current?.name, 'Advantage BJJ');
  assert.equal(loadAcademyLink(localStorage), null, 'no Drive folder link was needed');
  const text = page.host.textContent ?? '';
  assert.match(text, /Connected on Advantage Cloud/);
  assert.match(text, /Connected to Advantage BJJ on Advantage Cloud/);
  for (const name of ['Send my ID to coach', 'Share my card with my coach', 'Leave academy']) {
    assert.ok(buttons(page.host).includes(name), name);
  }
  unmount(page);
});

test('a replaced (rotated) coach link changes nothing on the phone', async () => {
  localStorage.clear();
  fakeFetch(() => ({ status: 400, body: { ok: false, error: 'This coach connect QR was replaced. Ask the gym owner for the current one.' } }));
  const page = mount(<AcademyConnectPage />, `/student/academy?coach=${INVITE}`);
  await settle();
  assert.match(page.host.textContent ?? '', /was replaced/);
  assert.equal(readAcademyLicense(localStorage), '');
  assert.equal(readMembership(localStorage).current, null);
  unmount(page);
});

/* ---------------- Instructor Edition › Connect to my academy (/coach-unlimited/academy) ---------------- */

const { AcademyPathwayPanel } = await import('./AcademyPathwayPanel.tsx');
const { acceptServerToken, discardEntitlementPass, setEntitlementConfigForTests } = await import('../lib/entitlement.ts');
const { issueToken } = await import('../server/tokenIssue.ts');

async function signInAsSeat(): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = (await crypto.subtle.exportKey('jwk', key.privateKey)) as { x: string; y: string; d: string };
  const jwk = { kty: 'EC' as const, crv: 'P-256' as const, x: priv.x, y: priv.y };
  setEntitlementConfigForTests({ keys: [{ kid: 'k1', jwk }], signing: true });
  const token = await issueToken(JSON.stringify({ ...jwk, d: priv.d }), {
    licenseId: 'gymowner01', grants: ['white', 'student', 'coach', 'pro'], tier: 'seat', src: 'seat', kind: 'seat',
    deviceId: 'device-seat', now: new Date(), subs: { state: 'active', cloud: true }, gym: 'gymowner01', sid: 'seat-paige', preset: 'coach',
  });
  assert.ok(token);
  assert.equal(await acceptServerToken(token as string), true);
}

test('the Instructor Edition Connect to my academy button routes to the panel that now carries the coach connect QR', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /path="\/coach-unlimited\/academy"[\s\S]{0,120}<PaidAcademyPathwayPage \/>/);
  const hub = readFileSync('src/pages/CoachUnlimited.tsx', 'utf8');
  assert.match(hub, /to="\/coach-unlimited\/academy"[\s\S]{0,60}Connect to my academy/);
  assert.match(hub, /export function AcademyPathwayPage[\s\S]{0,400}<AcademyPathwayPanel \/>/);
  const panel = readFileSync('src/components/AcademyPathwayPanel.tsx', 'utf8');
  assert.match(panel, /<CoachConnectQrPanel hideWithoutCloud onCloud=\{setCoachCloud\} \/>/);
});

test('owner with Cloud and no folder: the coach connect QR leads, Replace is there, the Drive pathway is a secondary link', async () => {
  localStorage.clear();
  calls.length = 0;
  applyOwnerTestGrant({ grants: ['pro', 'coach', 'media', 'student', 'white'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'all' });
  localStorage.setItem(ENTITLEMENT_TOKEN_KEY, 'owner.token.value');
  fakeFetch(() => ({ status: 200, body: { ok: true, invite: INVITE, gym: 'gymowner01', gymName: 'Advantage BJJ', owner: true } }));
  const page = mount(<AcademyPathwayPanel />, '/coach-unlimited/academy');
  await settle();
  const text = page.host.textContent ?? '';
  assert.equal(page.host.querySelectorAll('h2').length, 1);
  assert.ok(page.host.querySelector('img[alt="Coach connect QR"]'));
  assert.equal((page.host.querySelector('input[readonly]') as HTMLInputElement).value, coachConnectUrl(INVITE, 'https://advantagebjjtimer.com'));
  assert.ok(buttons(page.host).includes('Copy coach connect link'));
  assert.ok(buttons(page.host).includes(COACH_CONNECT_ROTATE));
  assert.doesNotMatch(text, /none is connected/);
  assert.match(text, /Prefer a Google Drive or OneDrive folder too\? Connect the folder/);
  unmount(page);
  clearOwnerTestGrant();
});

test('non-owner instructor seat: the same QR and Copy link, no Replace, no Show button', async () => {
  localStorage.clear();
  clearOwnerTestGrant();
  calls.length = 0;
  await signInAsSeat();
  fakeFetch(() => ({ status: 200, body: { ok: true, invite: INVITE, gym: 'gymowner01', gymName: 'Advantage BJJ', owner: false } }));
  const page = mount(<AcademyPathwayPanel />, '/coach-unlimited/academy');
  await settle();
  assert.equal(calls[0]?.body.action, 'current');
  assert.equal(calls.some((call) => call.body.action === 'issue' || call.body.action === 'rotate'), false);
  assert.ok(page.host.querySelector('img[alt="Coach connect QR"]'));
  assert.equal((page.host.querySelector('input[readonly]') as HTMLInputElement).value, coachConnectUrl(INVITE, 'https://advantagebjjtimer.com'));
  assert.ok(buttons(page.host).includes('Copy coach connect link'));
  assert.equal(buttons(page.host).includes(COACH_CONNECT_ROTATE), false);
  assert.equal(buttons(page.host).includes(COACH_CONNECT_CREATE), false);
  assert.match(page.host.textContent ?? '', /until the owner replaces it/);
  assert.match(page.host.textContent ?? '', /Advantage BJJ · Academy-wide/);
  unmount(page);

  // Owner has not shown it yet: the seat is told to ask, still no Show or Replace.
  fakeFetch(() => ({ status: 404, body: { ok: false, reason: 'none', error: 'not yet' } }));
  const waiting = mount(<AcademyPathwayPanel />, '/coach-unlimited/academy');
  await settle();
  assert.match(waiting.host.textContent ?? '', /has not shown the coach connect QR yet/);
  assert.equal(buttons(waiting.host).includes(COACH_CONNECT_CREATE), false);
  unmount(waiting);
});

test('academy without Cloud: no coach connect QR, the Drive folder pathway card stays as before', async () => {
  localStorage.clear();
  clearOwnerTestGrant();
  await signInAsSeat();
  fakeFetch(() => ({ status: 403, body: { ok: false, reason: 'no-cloud', error: 'needs Cloud' } }));
  const page = mount(<AcademyPathwayPanel />, '/coach-unlimited/academy');
  await settle();
  assert.equal(page.host.querySelector('img[alt="Coach connect QR"]'), null);
  assert.equal(page.host.querySelectorAll('h2').length, 1);
  assert.match(page.host.textContent ?? '', /Send students a pathway into the academy folder/);
  assert.match(page.host.textContent ?? '', /Connect the folder/);
  unmount(page);
  discardEntitlementPass();
  setEntitlementConfigForTests(null);
});
