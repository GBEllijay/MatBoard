/**
 * Older /join/student and /student/claim routes redirect to the account invite screen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StudentJoinPage, StudentLicenseClaimPage, studentClaimRedirectTo } from './student/StudentLicenseClaim.tsx';
import { studentAccountInvitePath } from '../lib/studentLicensePool.ts';

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

function Where() {
  const loc = useLocation();
  return <div data-path={`${loc.pathname}${loc.search}`} />;
}

async function mountAt(entry: string, node: ReactNode, path: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={node} />
          <Route path="/account" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
  return {
    host,
    path: host.querySelector('[data-path]')?.getAttribute('data-path') ?? '',
    done() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test('the claim page redirects to the account invite screen with the code and email', async () => {
  const page = await mountAt(
    '/student/claim',
    <StudentLicenseClaimPage code={CODE} gymName="North Gym" initialEmail="marty@gym.test" />,
    '/student/claim',
  );
  assert.equal(page.path, studentAccountInvitePath(CODE, 'marty@gym.test'));
  assert.equal(page.path.startsWith('/account?'), true);
  assert.match(page.path, /invite=/);
  assert.match(page.path, /email=marty/);
  assert.doesNotMatch(page.host.textContent ?? '', /Claim Student Edition/);
  page.done();
});

test('the join page redirects a code and email to the same account invite screen', async () => {
  const entry = `/join/student?${new URLSearchParams({ code: CODE, gym: 'North Gym', email: 'marty@gym.test' }).toString()}`;
  const page = await mountAt(entry, <StudentJoinPage />, '/join/student');
  assert.equal(page.path, studentAccountInvitePath(CODE, 'marty@gym.test'));
  page.done();
});

test('a claim link with no code still lands on the account page', async () => {
  assert.equal(studentClaimRedirectTo(''), '/account');
  const page = await mountAt('/student/claim', <StudentLicenseClaimPage code="" gymName="" />, '/student/claim');
  assert.equal(page.path, '/account');
  page.done();
});
