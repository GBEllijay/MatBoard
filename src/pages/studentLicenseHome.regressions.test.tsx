/**
 * After a claimed Student license, /products and the public homepage open White
 * and Student Edition. Media, Instructor and Pro keep their buy / learn-more paths.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CLIENT_APP_VERSION } from '../lib/appCapability.ts';
import {
  clearEntitlementToken,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
  setEntitlementReadyForTests,
} from '../lib/entitlement.ts';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { applyClaimedStudentLicense } from '../lib/studentLicenseClient.ts';
import { STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import { TIER_BUY_PATHS } from '../lib/tierBuyPages.ts';
import { expandGrants } from '../server/grantMatrix.ts';
import { issueToken } from '../server/tokenIssue.ts';
import { HomePage } from './Home.tsx';
import { StorefrontPage } from './Storefront.tsx';

const dom = new Window({ url: 'http://localhost/products' });
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

let signingKey = '';

async function keys() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  signingKey = JSON.stringify(privateJwk);
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests({
    signing: true,
    keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }],
    legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z',
  });
}

async function claim() {
  localStorage.clear();
  sessionStorage.clear();
  clearEntitlementToken();
  await keys();
  const token = await issueToken(
    signingKey,
    {
      licenseId: 'student-lic-1',
      grants: expandGrants(['student']),
      tier: 'student',
      src: 'free',
      deviceId: 'dev-student',
      now: new Date(),
      kind: 'onetime',
      gym: 'academy01',
      preset: STUDENT_LICENSE_PRESET,
      appVersion: CLIENT_APP_VERSION,
    },
    'k1',
  );
  assert.ok(token);
  const applied = await applyClaimedStudentLicense(
    { ok: true, token, grants: ['student'], gymId: 'academy01', deviceId: 'dev-student', cloud: false },
    'North Gym',
  );
  assert.deepEqual(applied, { applied: true, keptHigher: false });
  setEntitlementReadyForTests(true);
}

async function settle() {
  for (let step = 0; step < 4; step += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(path: string, node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  await settle();
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function hrefs(host: HTMLElement, selector: string): string[] {
  return [...host.querySelectorAll(selector)].map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? '');
}

test('/products: a claimed Student license opens White and Student, and keeps higher-tier buy pages', async () => {
  await claim();
  const page = await mount('/products', <HomePage />);
  const text = page.host.textContent ?? '';
  assert.match(text, /Open White/);
  assert.match(text, /Open Student Edition/);
  assert.doesNotMatch(text, /Buy — /);
  assert.equal(hrefs(page.host, '.mode-card--white a.mode-card__hit').every((href) => href === '/white'), true);
  assert.equal(hrefs(page.host, '.mode-card--student a.mode-card__hit').every((href) => href === '/student'), true);
  assert.equal(
    hrefs(page.host, '.mode-card--student a').some((href) => href === TIER_BUY_PATHS.student || href === '/buy'),
    false,
  );
  assert.equal(
    hrefs(page.host, '.mode-card--white a').some((href) => href === '/buy' || href === TIER_BUY_PATHS.white),
    false,
  );
  assert.ok(hrefs(page.host, '.mode-card--media a').some((href) => href === TIER_BUY_PATHS.media || href === '/editions/media'));
  assert.ok(hrefs(page.host, '.mode-card--coach a').some((href) => href === TIER_BUY_PATHS.instructor));
  assert.ok(hrefs(page.host, '.mode-card--pro a').some((href) => href === TIER_BUY_PATHS.pro));
  assert.match(text, /Learn more about Media Edition|Learn more about Instructor Edition|Learn more about Advantage Pro/);
  page.done();
});

test('homepage: a claimed Student license opens White and Student tiles, and keeps higher-tier buy / learn-more links', async () => {
  await claim();
  const page = await mount('/', <StorefrontPage />);
  const whiteHit = page.host.querySelector('.sf-step--white .sf-step__hit, .sf-step--white a.sf-step__hit') as HTMLAnchorElement | null;
  const studentHit = page.host.querySelector('.sf-step--student .sf-step__hit, a.sf-step--student') as HTMLAnchorElement | null;
  const instructorHit = page.host.querySelector('.sf-step--coach .sf-step__hit, a.sf-step--coach') as HTMLAnchorElement | null;
  const hero = hrefs(page.host, '.sfh-buy, .sf-buy');
  const studentOpen = hrefs(page.host, 'a.sf-open, .sfh-more');
  assert.equal(whiteHit?.getAttribute('href') ?? (page.host.querySelector('.sf-step--white') as HTMLAnchorElement | null)?.getAttribute('href'), '/white');
  assert.equal(studentHit?.getAttribute('href'), '/student');
  assert.equal(instructorHit?.getAttribute('href'), TIER_BUY_PATHS.instructor);
  assert.ok(hero.includes('/white'));
  assert.equal(hero.includes('/buy'), false);
  assert.ok(studentOpen.includes('/student'));
  const learn = [...page.host.querySelectorAll('a.sf-learn')].map((node) => node.getAttribute('href') ?? '');
  assert.ok(learn.some((href) => href === TIER_BUY_PATHS.instructor || href === TIER_BUY_PATHS.pro));
  assert.equal(learn.includes('/buy'), false);
  assert.equal(learn.includes(TIER_BUY_PATHS.student), false);
  page.done();
});
