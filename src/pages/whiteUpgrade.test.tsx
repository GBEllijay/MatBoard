/**
 * Rendered White hub: the upgrade prompt is present for White only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { clearOwnerTestGrant, applyOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { WHITE_UPGRADE_LABEL, WHITE_UPGRADE_LINE, WHITE_UPGRADE_SUB } from '../lib/whiteUpgradePrompt.ts';
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

test('White only: the prompt sits under Match names with the exact lines and no price', () => {
  reset();
  grant(['white']);
  const m = mount();
  const button = prompt(m.host);
  const names = m.host.querySelector('.mode-card--names');
  assert.ok(button instanceof view.HTMLAnchorElement);
  assert.ok(names);
  assert.equal(names.compareDocumentPosition(button) & view.Node.DOCUMENT_POSITION_FOLLOWING, view.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(button.getAttribute('aria-label'), WHITE_UPGRADE_LABEL);
  assert.equal(button.getAttribute('href'), '/editions/student');
  assert.equal(button.querySelector('.white-upgrade__line')?.textContent, WHITE_UPGRADE_LINE);
  assert.equal(button.querySelector('.white-upgrade__sub')?.textContent, WHITE_UPGRADE_SUB);
  assert.equal(button.querySelector('.belt-tip--blue') instanceof view.HTMLElement, true);
  assert.doesNotMatch(button.textContent ?? '', /\$/);
  assert.equal(WHITE_UPGRADE_LINE, 'Start with White, grow into Pro.');
  assert.equal(
    WHITE_UPGRADE_SUB,
    'Your investment grows with you. Your purchase price counts towards each upgrade.',
  );
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
