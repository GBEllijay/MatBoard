/**
 * Rendered White hub: the upgrade prompt is no longer on /white.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { clearOwnerTestGrant, applyOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { WhitePage } from './White.tsx';

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

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  clearOwnerTestGrant();
  clearEntitlementToken();
  setEntitlementConfigForTests({
    signing: false,
    keys: [],
    legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z',
  });
}

function grant(doors: string[]) {
  assert.equal(
    applyOwnerTestGrant({ grants: doors, expiresAt: '2099-01-01T00:00:00.000Z', tier: doors[0] ?? '' }),
    true,
  );
}

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/white']}>
        <WhitePage />
      </MemoryRouter>,
    );
  });
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function prompt(host: HTMLElement) {
  return host.querySelector('[data-testid="white-upgrade"]');
}

test('the White hub no longer shows the upgrade prompt, even when White is unlocked', () => {
  reset();
  grant(['white']);
  const m = mount();
  assert.equal(prompt(m.host), null);
  assert.ok(m.host.querySelector('#bracket-roster'));
  assert.doesNotMatch(m.host.textContent ?? '', /grow into Pro/);
  assert.equal(m.host.querySelector('.site-footer a[href="/faq"]')?.textContent, 'FAQ');
  assert.equal([...m.host.querySelectorAll('a')].filter((node) => node.textContent?.trim() === 'FAQ').length, 1);
  assert.ok(m.host.querySelector('button, a, summary') && [...m.host.querySelectorAll('button, a, summary')].some((node) => /Instructions/.test(node.textContent ?? '')));
  m.done();
});

test('the prompt is hidden with no White door, at Student and above, and for a seat', () => {
  reset();
  let m = mount();
  assert.equal(prompt(m.host), null);
  m.done();

  for (const doors of [['student'], ['media'], ['coach'], ['pro']]) {
    reset();
    grant(doors);
    m = mount();
    assert.equal(prompt(m.host), null, doors.join(','));
    m.done();
  }

  reset();
  grant(['white', 'seat']);
  m = mount();
  assert.equal(prompt(m.host), null);
  m.done();
});
