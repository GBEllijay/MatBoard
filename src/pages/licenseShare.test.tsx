/**
 * Rendered license share pages: Share code button doors, page headers,
 * links built from the existing invite / academy path, and the Copy button.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LicenseShareButton } from '../components/LicenseShareButton.tsx';
import { InstructorSharePage, StudentSharePage } from '../components/LicenseSharePage.tsx';
import { academyPathway, academyPathwayUrl } from '../lib/academyPathway.ts';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { DRIVE_BINDING_KEY } from '../lib/googleDrive.ts';
import { acceptInstructorInvite, instructorInviteLink, issueInstructorInvite } from '../lib/instructorSeats.ts';
import { INSTRUCTOR_SHARE_HEADER, SHARE_NO_FOLDER, SHARE_NO_INVITE, SHARE_OWNER_ONLY, STUDENT_SHARE_HEADER } from '../lib/licenseShare.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';

const dom = new Window({ url: 'http://localhost/coach-unlimited' });
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
installGlobal('StorageEvent', view.StorageEvent);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
installGlobal('fetch', async () => new Response('{}', { status: 503 }));

const ORIGIN = 'http://localhost';
const clipboard: string[] = [];
Object.defineProperty(view.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (text: string) => void clipboard.push(text) },
});

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  clearOwnerTestGrant();
  clearEntitlementToken();
  setEntitlementConfigForTests({ signing: false, keys: [], legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z' });
  clipboard.length = 0;
}

function grant(doors: string[]) {
  assert.equal(applyOwnerTestGrant({ grants: doors, expiresAt: '2099-01-01T00:00:00.000Z', tier: doors[0] ?? '' }), true);
}

async function settle() {
  for (let step = 0; step < 8; step += 1) {
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

function shareTargets(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-share]')].map((node) => node.getAttribute('href') ?? '');
}

test('Pro owner sees Share code for both pages', async () => {
  reset();
  grant(['pro']);
  const m = await mount(<LicenseShareButton />);
  assert.match(m.host.textContent ?? '', /Share code/);
  assert.deepEqual(shareTargets(m.host), ['/coach-unlimited/share/instructor', '/coach-unlimited/share/student']);
  m.done();
});

test('Instructor Edition owner sees the Student share only', async () => {
  reset();
  grant(['coach']);
  const m = await mount(<LicenseShareButton />);
  assert.deepEqual(shareTargets(m.host), ['/coach-unlimited/share/student']);
  m.done();
});

test('lower tiers never see Share code', async () => {
  for (const tier of [[], ['white'], ['student'], ['media']]) {
    reset();
    if (tier.length) grant(tier);
    const m = await mount(<LicenseShareButton />);
    assert.equal(m.host.querySelector('.license-share-entry'), null, tier.join(',') || 'none');
    m.done();
  }
});

test('a signed-in seat (assistant coach) does not see Share code', async () => {
  reset();
  const issued = issueInstructorInvite({ email: 'assist@gym.test', presetId: 'assistant-coach', origin: ORIGIN, token: 'tok-assist' });
  assert.equal(issued.ok, true);
  assert.equal(acceptInstructorInvite('tok-assist').ok, true);
  grant(['coach']);
  const m = await mount(<LicenseShareButton />);
  assert.equal(m.host.querySelector('.license-share-entry'), null);
  m.done();
  const page = await mount(<StudentSharePage />);
  assert.ok((page.host.textContent ?? '').includes(SHARE_OWNER_ONLY));
  assert.equal(page.host.querySelector('.license-share__frame'), null);
  page.done();
});

test('Instructor page wears its header and shares the issued seat invite link', async () => {
  reset();
  grant(['pro']);
  const empty = await mount(<InstructorSharePage />);
  assert.equal(empty.host.querySelector('.belt-header__title')?.textContent, INSTRUCTOR_SHARE_HEADER);
  assert.ok((empty.host.textContent ?? '').includes(SHARE_NO_INVITE));
  assert.match(empty.host.textContent ?? '', /5 of 5 coach seats left/);
  empty.done();

  const issued = issueInstructorInvite({ email: 'coach@gym.test', presetId: 'coach', origin: ORIGIN, token: 'tok-coach' });
  assert.equal(issued.ok, true);
  const m = await mount(<InstructorSharePage />);
  const input = m.host.querySelector('input[aria-label="Coach invite link"]') as HTMLInputElement | null;
  assert.equal(input?.value, instructorInviteLink('tok-coach', ORIGIN));
  assert.equal(input?.value, issued.ok ? issued.inviteLink : '');
  assert.match(m.host.textContent ?? '', /4 of 5 coach seats left/);
  assert.match(m.host.querySelector('.license-share__qr img')?.getAttribute('src') ?? '', /^data:image\/png/);

  const button = m.host.querySelector('.license-share__copy') as HTMLButtonElement;
  assert.equal(button.textContent, 'Copy link');
  await act(async () => {
    button.click();
  });
  await settle();
  assert.deepEqual(clipboard, [instructorInviteLink('tok-coach', ORIGIN)]);
  assert.equal(button.textContent, 'Copied');
  m.done();
});

test('Student page wears its header and shares the academy pathway link', async () => {
  reset();
  grant(['pro']);
  const empty = await mount(<StudentSharePage />);
  assert.equal(empty.host.querySelector('.belt-header__title')?.textContent, STUDENT_SHARE_HEADER);
  assert.ok((empty.host.textContent ?? '').includes(SHARE_NO_FOLDER));
  empty.done();

  localStorage.setItem(DRIVE_BINDING_KEY, JSON.stringify({ folderId: 'driveFolder123', folderName: 'Gym Academy' }));
  const m = await mount(<StudentSharePage />);
  const input = m.host.querySelector('input[aria-label="Student Edition link"]') as HTMLInputElement | null;
  const pathway = academyPathway({ provider: 'googleDrive', folderId: 'driveFolder123', folderName: 'Gym Academy', gymName: '' });
  assert.ok(pathway);
  assert.equal(input?.value, academyPathwayUrl(pathway, ORIGIN));
  assert.match(m.host.querySelector('.license-share__qr img')?.getAttribute('src') ?? '', /^data:image\/png/);
  const button = m.host.querySelector('.license-share__copy') as HTMLButtonElement;
  await act(async () => {
    button.click();
  });
  await settle();
  assert.equal(clipboard.at(-1), input?.value);
  assert.equal(button.textContent, 'Copied');
  m.done();
});
