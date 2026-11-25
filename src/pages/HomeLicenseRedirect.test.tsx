import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Navigate, RouterProvider, useSearchParams } from 'react-router-dom';
import {
  clearEntitlementToken,
  setEntitlementConfigForTests,
  setEntitlementReadyForTests,
} from '../lib/entitlement.ts';
import { PRODUCTS_PATH } from '../lib/productNames.ts';
import { clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { preservesAppHomeQuery } from '../lib/submenuNav.ts';
import { setWhiteUnlocked } from '../lib/whiteUnlock.ts';
import { HomePage } from './Home.tsx';
import { StorefrontPage } from './Storefront.tsx';

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

/** Same rules as PublicHomeRoute in App.tsx. A source test below keeps them in lockstep. */
function PublicHomeRoute() {
  const [params] = useSearchParams();
  if (preservesAppHomeQuery(params)) {
    const search = params.toString();
    return <Navigate to={search ? `${PRODUCTS_PATH}?${search}` : PRODUCTS_PATH} replace />;
  }
  return <StorefrontPage />;
}

const homeRoutes = [
  { path: '/', element: <PublicHomeRoute /> },
  { path: PRODUCTS_PATH, element: <div data-home="products">products</div> },
];

function openMyApps(host: HTMLElement) {
  return [...host.querySelectorAll('a')].find((node) => node.textContent?.trim() === 'Open my apps') ?? null;
}

test('no license: `/` stays on the public homepage and has no Open my apps button', async () => {
  reset();
  const { host, router, done } = await mountRouter(['/'], homeRoutes);
  assert.equal(router.state.location.pathname, '/');
  assert.ok(host.querySelector('main.home--store'));
  assert.match(host.textContent ?? '', /Win by Advantage/);
  assert.equal(openMyApps(host), null);
  done();
});

test('licensed: `/` stays on the public homepage with no Open my apps button', async () => {
  reset();
  setWhiteUnlocked(true);
  const { host, router, done } = await mountRouter(['/'], homeRoutes);
  assert.equal(router.state.location.pathname, '/');
  assert.equal(router.state.historyAction, 'POP');
  assert.ok(host.querySelector('main.home--store'));
  assert.match(host.textContent ?? '', /Win by Advantage/);
  assert.equal(openMyApps(host), null);
  const alpha = [...host.querySelectorAll('a')].find((node) => node.textContent?.trim() === 'Alpha testers');
  assert.ok(alpha, 'Alpha testers footer link should remain');
  assert.equal(alpha.getAttribute('href'), PRODUCTS_PATH);
  assert.equal(host.querySelector('[data-home="products"]'), null);
  done();
});

test('preview-bypass-only White stays on the public homepage with no Open my apps button', async () => {
  reset();
  const { host, router, done } = await mountRouter(['/'], homeRoutes);
  assert.equal(router.state.location.pathname, '/');
  assert.equal(openMyApps(host), null);
  done();
});

test('owner-code query keys still replace-forward to /products', async () => {
  reset();
  const { host, router, done } = await mountRouter(['/?unlock=1'], homeRoutes);
  assert.equal(router.state.location.pathname, PRODUCTS_PATH);
  assert.equal(router.state.historyAction, 'REPLACE');
  assert.match(router.state.location.search, /unlock=1/);
  assert.equal(host.querySelector('[data-home="products"]')?.textContent, 'products');
  done();
});

test('App.tsx PublicHomeRoute no longer auto-redirects saved access, and still forwards query keys', () => {
  const src = readFileSync(resolve('src/App.tsx'), 'utf8');
  assert.match(src, /if \(preservesAppHomeQuery\(params\)\)/);
  assert.match(src, /return <StorefrontPage \/>;/);
  assert.doesNotMatch(src, /HomeLicenseRedirect/);
  const hero = readFileSync(resolve('src/pages/StorefrontHero.tsx'), 'utf8');
  assert.doesNotMatch(hero, /Open my apps/);
  assert.doesNotMatch(hero, /useHasSavedAdvantageAccess/);
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
