/**
 * The claim page asks for an email, then shows the home screen tip.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StudentLicenseClaimPage, StudentLicenseClaimSuccess } from './student/StudentLicenseClaim.tsx';
import { ADD_TO_HOME_ANDROID, ADD_TO_HOME_EMAIL, ADD_TO_HOME_IPHONE, ADD_TO_HOME_TITLE } from '../lib/studentLicensePool.ts';

const dom = new Window({ url: 'http://localhost/student/claim/abc' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('Event', view.Event);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const CODE = 'ab'.repeat(32);

async function settle() {
  for (let step = 0; step < 4; step += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
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

test('claim page asks for the restore email before it claims', async () => {
  const page = await mount(<StudentLicenseClaimPage code={CODE} gymName="North Gym" />);
  assert.match(page.host.textContent ?? '', /Confirm the email/);
  assert.equal(page.host.querySelector('input[aria-label="Email"]') instanceof view.HTMLInputElement, true);
  assert.equal(page.host.textContent?.includes(ADD_TO_HOME_TITLE), false);
  const broken = await mount(<StudentLicenseClaimPage code="not-a-code" gymName="" />);
  assert.match(broken.host.textContent ?? '', /not a free Student license/);
  assert.equal((broken.host.querySelector('button') as HTMLButtonElement).disabled, true);
  broken.done();
  page.done();
});

test('after a claim, the page tells the student how to add the home screen app and restore', async () => {
  const page = await mount(<StudentLicenseClaimSuccess email="student@gym.test" gym="North Gym" cloud />);
  const text = page.host.textContent ?? '';
  assert.match(text, /This phone has Student Edition at North Gym/);
  assert.match(text, new RegExp(ADD_TO_HOME_TITLE));
  assert.match(text, new RegExp(ADD_TO_HOME_IPHONE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, new RegExp(ADD_TO_HOME_ANDROID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, new RegExp(ADD_TO_HOME_EMAIL));
  assert.match(text, /student@gym\.test/);
  assert.match(text, /Coach lesson files, private coach notes, and other students stay closed/);
  const restore = page.host.querySelector('a[href^="/restore"]');
  assert.equal(restore?.getAttribute('href'), '/restore?email=student%40gym.test');
  page.done();
});

test('claim page prefills the issue-time email from the invite link', async () => {
  const page = await mount(<StudentLicenseClaimPage code={CODE} gymName="North Gym" initialEmail="marty@gym.test" />);
  const input = page.host.querySelector('input[aria-label="Email"]') as HTMLInputElement | null;
  assert.equal(input?.value, 'marty@gym.test');
  page.done();
});
