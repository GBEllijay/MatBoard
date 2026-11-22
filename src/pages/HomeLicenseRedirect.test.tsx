import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  clearEntitlementToken,
  setEntitlementConfigForTests,
  setEntitlementReadyForTests,
} from '../lib/entitlement.ts';
import { PRODUCTS_PATH } from '../lib/productNames.ts';
import { clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { setWhiteUnlocked } from '../lib/whiteUnlock.ts';
import { HomeLicenseRedirect } from './HomeLicenseRedirect.tsx';
import { HomePage } from './Home.tsx';

const dom = new Window({ url: 'http://localhost/' });
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

function reset(): void {
  localStorage.clear();
  sessionStorage.clear();
  clearEntitlementToken();
  clearOwnerTestGrant();
  setEntitlementReadyForTests(true);
  setEntitlementConfigForTests({
    signing: false,
    keys: [],
    legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z',
  });
}

async function settle() {
  for (let step = 0; step < 4; step += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountRouter(initialEntries: string[], routes: { path: string; element: ReactNode }[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const router = createMemoryRouter(routes, { initialEntries });
  const root = createRoot(host);
  await act(async () => {
    root.render(<RouterProvider router={router} />);
  });
  await settle();
  return {
    host,
    router,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const licenseRoutes = [
  {
    path: '/',
    element: (
      <HomeLicenseRedirect>
        <div data-home="storefront">storefront</div>
      </HomeLicenseRedirect>
    ),
  },
  { path: PRODUCTS_PATH, element: <div data-home="products">products</div> },
];

test('no license: `/` stays on the public homepage', async () => {
  reset();
  const { host, router, done } = await mountRouter(['/'], licenseRoutes);
  assert.equal(router.state.location.pathname, '/');
  assert.equal(host.querySelector('[data-home="storefront"]')?.textContent, 'storefront');
  assert.equal(host.querySelector('[data-home="products"]'), null);
  done();
});

test('licensed: `/` replace-redirects to /products', async () => {
  reset();
  setWhiteUnlocked(true);
  const { host, router, done } = await mountRouter(['/'], licenseRoutes);
  assert.equal(router.state.location.pathname, PRODUCTS_PATH);
  assert.equal(router.state.historyAction, 'REPLACE');
  assert.equal(host.querySelector('[data-home="products"]')?.textContent, 'products');
  assert.equal(host.querySelector('[data-home="storefront"]'), null);
  done();
});

test('preview-bypass-only White stays on the public homepage', async () => {
  reset();
  const { host, router, done } = await mountRouter(['/'], licenseRoutes);
  assert.equal(router.state.location.pathname, '/');
  assert.equal(host.querySelector('[data-home="storefront"]')?.textContent, 'storefront');
  done();
});

test('/products home and back stay on /products and never link to `/`', async () => {
  reset();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const router = createMemoryRouter([{ path: PRODUCTS_PATH, element: <HomePage /> }], {
    initialEntries: [PRODUCTS_PATH],
  });
  const root = createRoot(host);
  await act(async () => {
    root.render(<RouterProvider router={router} />);
  });
  await settle();
  const hrefs = [...host.querySelectorAll('a')].map((node) => node.getAttribute('href') ?? '');
  assert.ok(hrefs.includes(PRODUCTS_PATH), 'Home or Back should stay on /products');
  assert.equal(
    hrefs.includes('/'),
    false,
    ` /products must not send people back to /; found ${hrefs.filter((href) => href === '/').join(', ') || 'none'}`,
  );
  act(() => root.unmount());
  host.remove();
});
