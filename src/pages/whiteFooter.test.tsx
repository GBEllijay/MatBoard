/**
 * White hub legal footer: web keeps the Alpha testers link to /products;
 * the native Capacitor build hides it because /products redirects back to /white.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { setAppTargetForTests } from '../lib/appTarget.ts';
import { WHITE_IAP_PRICE_LABEL } from '../lib/nativeWhiteIap.ts';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
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
  setAppTargetForTests(undefined);
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

function footerLinks(host: HTMLElement) {
  return [...host.querySelectorAll('.site-footer__legal a')].map((node) => ({
    href: node.getAttribute('href'),
    text: node.textContent?.trim(),
  }));
}

function alphaTesters(host: HTMLElement) {
  return [...host.querySelectorAll('.site-footer__legal a')].find((node) => node.textContent?.trim() === 'Alpha testers');
}

test.describe('White footer Alpha testers link', { concurrency: false }, () => {
  test.afterEach(() => {
    setAppTargetForTests(undefined);
  });

  test('the web White footer keeps Alpha testers and hides the edition ladder', () => {
    reset();
    const m = mount();
    const alpha = alphaTesters(m.host);
    assert.equal(alpha?.getAttribute('href'), '/products');
    assert.deepEqual(footerLinks(m.host), [
      { href: '/products', text: 'Alpha testers' },
      { href: '/faq', text: 'FAQ' },
      { href: '/privacy', text: 'Privacy Policy' },
      { href: '/terms', text: 'Terms of Service' },
    ]);
    assert.equal(m.host.querySelector('.site-footer a[href="/account"]'), null);
    assert.equal(m.host.querySelector('[data-testid="white-upgrade"]'), null);
    assert.doesNotMatch(m.host.textContent ?? '', /grow into Pro/);
    assert.match(m.host.textContent ?? '', /Buy Advantage White — \$9\.99/);
    m.done();
  });

  test('the native White footer hides Alpha testers because /products redirects to /white', () => {
    reset();
    setAppTargetForTests('white');
    const m = mount();
    assert.equal(alphaTesters(m.host), undefined);
    assert.deepEqual(footerLinks(m.host), [
      { href: '/faq', text: 'FAQ' },
      { href: '/privacy', text: 'Privacy Policy' },
      { href: '/terms', text: 'Terms of Service' },
    ]);
    assert.equal(m.host.querySelector('.site-footer a[href="/account"]'), null);
    assert.doesNotMatch(m.host.textContent ?? '', /Alpha testers/);
    assert.doesNotMatch(m.host.textContent ?? '', /Buy Advantage White — \$9\.99/);
    assert.doesNotMatch(m.host.textContent ?? '', /Install Advantage as an app from your browser menu/);
    assert.ok((m.host.textContent ?? '').includes(`Unlock scoreboard, brackets, and skins — ${WHITE_IAP_PRICE_LABEL}`));
    m.done();
  });
});
