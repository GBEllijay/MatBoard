/**
 * Rendered progression bar: active highlight, open links, quoted prices, fallback, seats.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { EditionLadder } from '../components/EditionLadder.tsx';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { STUDENT_PRICE_LINE } from '../lib/productPrices.ts';
import { PURCHASE_CREDIT_NOTE } from '../lib/upgradeQuoteClient.ts';
import { BuyCoachPage } from './BuyTier.tsx';

const dom = new Window({ url: 'http://localhost/white' });
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
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const calls: { tier?: string; email?: string }[] = [];

function installFetch() {
  calls.length = 0;
  const fetchImpl = async (_input: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { tier?: string; email?: string };
    calls.push(body);
    const due = body.tier === 'coach' ? 2000 : body.tier === 'pro' ? 8000 : body.tier === 'media' ? 2500 : 1500;
    return new Response(
      JSON.stringify({ ok: true, listPriceCents: due + 500, upgradePriceCents: due, creditApplied: 500 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  installGlobal('fetch', fetchImpl);
}

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  clearOwnerTestGrant();
  clearEntitlementToken();
  setEntitlementConfigForTests({ signing: false, keys: [], legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z' });
  installFetch();
}

function grant(doors: string[]) {
  assert.equal(applyOwnerTestGrant({ grants: doors, expiresAt: '2099-01-01T00:00:00.000Z', tier: doors[0] ?? '' }), true);
}

async function settle() {
  for (let step = 0; step < 6; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  await settle();
  return {
    host,
    done() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function role(host: HTMLElement, id: string) {
  return host.querySelector(`[data-rung="${id}"]`)?.getAttribute('data-role');
}

test('Student page highlights Student, opens White, and shows server upgrade prices', async () => {
  reset();
  grant(['student']);
  const m = await mount(<EditionLadder page="student" email="buyer@gym.test" />);
  assert.equal(role(m.host, 'white'), 'open');
  assert.equal(m.host.querySelector('[data-rung="white"] a')?.getAttribute('href'), '/white');
  assert.equal(role(m.host, 'student'), 'active');
  assert.equal(m.host.querySelector('[data-rung="student"]')?.getAttribute('aria-current'), 'page');
  assert.equal(m.host.querySelector('[data-rung="student"] a'), null);
  assert.equal(m.host.querySelector('[data-rung="student"]')?.className.includes('edition-ladder__rung--active'), true);
  assert.equal(role(m.host, 'instructor'), 'buy');
  assert.match(m.host.querySelector('[data-rung="instructor"] a')?.getAttribute('href') ?? '', /\/editions\/instructor\?upgradeEmail=buyer%40gym\.test/);
  assert.match(m.host.querySelector('[data-rung="instructor"]')?.textContent ?? '', /\$20\.00/);
  assert.match(m.host.querySelector('[data-rung="pro"]')?.textContent ?? '', /\$80\.00/);
  assert.doesNotMatch(m.host.querySelector('[data-rung="instructor"]')?.textContent ?? '', /\$49\.99/);
  assert.equal(role(m.host, 'pro-cloud'), 'soon');
  assert.equal(m.host.querySelector('[data-rung="pro-cloud"] a')?.getAttribute('href'), '/editions/pro-cloud');
  assert.match(m.host.querySelector('[data-rung="pro-cloud"]')?.textContent ?? '', /This product is in alpha/);
  assert.deepEqual(calls.map((call) => call.tier).sort(), ['coach', 'media', 'pro']);
  assert.equal(calls.every((call) => call.email === 'buyer@gym.test'), true);
  assert.equal(m.host.querySelector('.edition-ladder__note'), null);
  m.done();
});

test('without an email the buy rungs keep the list price and the credit note', async () => {
  reset();
  grant(['white']);
  const m = await mount(<EditionLadder page="white" email={null} />);
  assert.equal(calls.length, 0);
  assert.equal(role(m.host, 'white'), 'active');
  assert.equal(role(m.host, 'student'), 'buy');
  assert.match(m.host.querySelector('[data-rung="student"]')?.textContent ?? '', new RegExp(STUDENT_PRICE_LINE.replace('$', '\\$')));
  assert.equal(m.host.querySelector('.edition-ladder__note')?.textContent, PURCHASE_CREDIT_NOTE);
  assert.equal(m.host.querySelector('[data-rung="student"] a')?.getAttribute('href'), '/editions/student');
  m.done();
});

test('Pro Plus Cloud shows quick links only, and a seat shows no buy rungs', async () => {
  reset();
  grant(['pro']);
  let m = await mount(<EditionLadder page="pro-cloud" email="buyer@gym.test" />);
  assert.equal(role(m.host, 'pro-cloud'), 'active');
  assert.equal(m.host.querySelector('[data-role="buy"]'), null);
  assert.equal(m.host.querySelector('[data-role="soon"]'), null);
  assert.equal(m.host.querySelector('[data-rung="white"] a')?.getAttribute('href'), '/white');
  assert.equal(calls.length, 0);
  m.done();

  reset();
  grant(['white', 'student', 'seat']);
  m = await mount(<EditionLadder page="white" email="buyer@gym.test" />);
  assert.equal(role(m.host, 'student'), 'open');
  assert.equal(m.host.querySelector('[data-role="buy"]'), null);
  assert.equal(m.host.querySelector('[data-role="soon"]'), null);
  assert.equal(calls.length, 0);
  m.done();

  reset();
  grant(['white', 'seat']);
  m = await mount(<EditionLadder page="white" email={null} />);
  assert.equal(m.host.querySelector('[data-testid="edition-ladder"]'), null);
  m.done();
});

test('a buy page prefills the upgrade email and shows the credit note', async () => {
  reset();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/buy/coach?upgradeEmail=buyer@gym.test']}>
        <BuyCoachPage />
      </MemoryRouter>,
    );
  });
  const input = host.querySelector('input[name="upgradeEmail"]');
  assert.ok(input instanceof view.HTMLInputElement);
  assert.equal(input.value, 'buyer@gym.test');
  assert.equal(host.querySelector('[data-testid="purchase-credit-note"]')?.textContent, PURCHASE_CREDIT_NOTE);
  const note = host.querySelector('[data-testid="purchase-credit-note"]');
  const field = host.querySelector('input[name="upgradeEmail"]');
  assert.ok(note && field);
  assert.equal(note.compareDocumentPosition(field) & view.Node.DOCUMENT_POSITION_FOLLOWING, view.Node.DOCUMENT_POSITION_FOLLOWING);
  act(() => root.unmount());
  host.remove();
});
