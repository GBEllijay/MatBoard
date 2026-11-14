/**
 * Instructor seat invite link (/instructors?invite=…), owner Nov 14 2026:
 * Checking your invite… then You're in (gym + seat, Continue to /products)
 * or the server's reason (expired / revoked / open on another device / not
 * valid) or an offline note, with Try again. Never a blank page.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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

const { SeatInviteAccept } = await import('./SeatInviteAccept.tsx');
const { forgetSeatAccept, SEAT_ACCEPT_OFFLINE } = await import('../lib/seatClient.ts');
const { setEntitlementConfigForTests, discardEntitlementPass } = await import('../lib/entitlement.ts');
const { issueToken } = await import('../server/tokenIssue.ts');
const { readFileSync } = await import('node:fs');

const INVITE = 'eyJhbGciOiJFUzI1NiJ9.eyJ0eXAiOiJzZWF0LWludml0ZSJ9.c2lnbmF0dXJlc2ln';

type Reply = { status: number; body: unknown } | 'offline';
let reply: Reply = 'offline';
const posted: unknown[] = [];
installGlobal('fetch', async (url: string, init?: { body?: string }) => {
  if (String(url).endsWith('/api/seats/accept')) {
    posted.push(init?.body ? JSON.parse(init.body) : null);
    if (reply === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
});

async function settle() {
  for (let i = 0; i < 8; i += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[`/instructors?invite=${INVITE}`]}>
        <Routes>
          <Route path="/instructors" element={<SeatInviteAccept token={INVITE} />} />
          <Route path="/products" element={<p>PRODUCTS PAGE</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}
function button(host: ParentNode, name: string) {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLButtonElement;
}
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}

test('checking, then the server reason for each refusal, then Try again re-asks', async () => {
  const cases: [number, string][] = [
    [409, 'This seat is already open on another device. The owner can reset it.'],
    [403, 'This seat was revoked.'],
    [400, 'This invite has expired. Ask the owner for a new link.'],
    [400, 'This invite is not valid.'],
  ];
  for (const [status, error] of cases) {
    forgetSeatAccept(INVITE);
    reply = { status, body: { ok: false, error } };
    const page = mount();
    assert.match(page.host.textContent ?? '', /Checking your invite…/);
    await settle();
    assert.equal(page.host.querySelector('[role="alert"]')?.textContent, error);
    assert.match(page.host.textContent ?? '', /This invite didn't open/);
    assert.ok(button(page.host, 'Try again'));
    page.done();
  }

  forgetSeatAccept(INVITE);
  reply = 'offline';
  posted.length = 0;
  const page = mount();
  await settle();
  assert.equal(page.host.querySelector('[role="alert"]')?.textContent, SEAT_ACCEPT_OFFLINE);
  reply = { status: 400, body: { ok: false, error: 'This invite is not valid.' } };
  await click(button(page.host, 'Try again'));
  assert.equal(posted.length, 2, 'Try again asks the server again');
  assert.equal(page.host.querySelector('[role="alert"]')?.textContent, 'This invite is not valid.');
  page.done();
});

test("success: You're in names the gym and seat; Continue goes to /products", async () => {
  localStorage.clear();
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = (await crypto.subtle.exportKey('jwk', key.privateKey)) as { x: string; y: string; d: string };
  const jwk = { kty: 'EC' as const, crv: 'P-256' as const, x: priv.x, y: priv.y };
  setEntitlementConfigForTests({ keys: [{ kid: 'k1', jwk }], signing: true });
  const token = await issueToken(JSON.stringify({ ...jwk, d: priv.d }), {
    licenseId: 'gymowner01', grants: ['white', 'student', 'coach', 'pro'], tier: 'seat', src: 'seat', kind: 'seat',
    deviceId: 'device-seat', now: new Date(), subs: { state: 'active', cloud: true }, gym: 'gymowner01', sid: 'seat-paige', preset: 'coach',
  });
  forgetSeatAccept(INVITE);
  reply = {
    status: 200,
    body: { ok: true, token, seatId: 'seat-paige', gymId: 'gymowner01', gymName: 'GB Ellijay', preset: 'coach', email: 'paige@example.com', status: 'claimed' },
  };
  const page = mount();
  await settle();
  assert.match(page.host.querySelector('h1')?.textContent ?? '', /You're in/);
  assert.match(page.host.textContent ?? '', /GB Ellijay added you as Coach\./);
  assert.match(page.host.textContent ?? '', /Seat: paige@example\.com/);
  await click(button(page.host, 'Continue'));
  assert.match(page.host.textContent ?? '', /PRODUCTS PAGE/);
  page.done();
  discardEntitlementPass();
});

test('App renders the invite screen for a signed invite instead of a blank page', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /if \(signedInvite && token\) return <SeatInviteAccept token=\{token\} \/>;/);
  assert.doesNotMatch(app, /if \(signedInvite\) return null;/);
});
