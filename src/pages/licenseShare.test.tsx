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
import { CoachUnlimitedPage } from './CoachUnlimited.tsx';
import { academyPathway, academyPathwayUrl } from '../lib/academyPathway.ts';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { DRIVE_BINDING_KEY } from '../lib/googleDrive.ts';
import { acceptInstructorInvite, instructorInviteLink, issueInstructorInvite } from '../lib/instructorSeats.ts';
import { INSTRUCTOR_SHARE_HEADER, SHARE_NO_FOLDER, SHARE_NO_INVITE, SHARE_OWNER_ONLY, STUDENT_SHARE_HEADER } from '../lib/licenseShare.ts';
import { GYM_LOGO_STORAGE_KEY } from '../lib/gymLogo.ts';
import { resolveShareLogo } from '../lib/licenseShare.ts';
import { clearGymLogo, getGymLogo, writeGymLogo } from '../lib/gymLogo.ts';
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

// The Instructor hub reads Vite's env while choosing a dev Drive client id.
if (typeof import.meta.env === 'undefined') {
  Object.defineProperty(import.meta, 'env', { configurable: true, value: { DEV: false, MODE: 'test' } });
}

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

function shareSlotOrder(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.belt-header, .instructor-jumps, .license-share-entry, .plan-card')].map((node) =>
    node.classList.contains('belt-header')
      ? 'belt'
      : node.classList.contains('instructor-jumps')
        ? 'tools'
        : node.classList.contains('license-share-entry')
          ? 'share'
          : 'plan',
  );
}

test('Instructor Edition share card sits after the tools and wears role buttons', async () => {
  reset();
  grant(['pro']);
  const m = await mount(<CoachUnlimitedPage />);
  assert.deepEqual(shareSlotOrder(m.host).slice(0, 4), ['belt', 'tools', 'share', 'plan']);
  const share = m.host.querySelector('.license-share-entry');
  assert.equal(share?.getAttribute('aria-label'), 'Share code');
  assert.match(share?.textContent ?? '', /Coach seat or Student Edition/);
  assert.deepEqual(shareTargets(m.host), ['/coach-unlimited/share/instructor', '/coach-unlimited/share/student']);
  assert.equal(m.host.querySelectorAll('.license-share-entry__btn').length, 2);
  assert.ok(m.host.querySelector('.license-share-entry__btn--instructor'));
  assert.ok(m.host.querySelector('.license-share-entry__btn--student'));
  m.done();

  reset();
  grant(['coach']);
  const coach = await mount(<CoachUnlimitedPage />);
  assert.deepEqual(shareSlotOrder(coach.host).slice(0, 4), ['belt', 'tools', 'share', 'plan']);
  assert.deepEqual(shareTargets(coach.host), ['/coach-unlimited/share/student']);
  assert.match(coach.host.querySelector('.license-share-entry')?.textContent ?? '', /Student Edition link/);
  coach.done();
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
  // One confirmation: check icon on the button, no duplicate helper line.
  assert.ok(button.querySelector('svg.license-share__check'));
  assert.ok(!(m.host.textContent ?? '').includes('Link copied.'));
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
  // Caption: small 'Student Edition academy link' with the folder / gym name on its own bold line.
  assert.equal(m.host.querySelector('.license-share__cap')?.textContent, 'Student Edition academy link');
  assert.equal(m.host.querySelector('.license-share__cap-title')?.textContent, 'Gym Academy');
  m.done();
});

test('share pages use one logo (in the card), no wordmark, and keep Back / Home links', async () => {
  reset();
  grant(['pro']);
  issueInstructorInvite({ email: 'coach@gym.test', presetId: 'coach', origin: ORIGIN, token: 'tok-one-logo' });
  localStorage.setItem(DRIVE_BINDING_KEY, JSON.stringify({ folderId: 'driveFolder123', folderName: 'Gym Academy' }));
  for (const node of [<InstructorSharePage />, <StudentSharePage />]) {
    const m = await mount(node);
    assert.equal(m.host.querySelectorAll('img.license-share__logo').length, 1);
    assert.ok(m.host.querySelector('.license-share__frame img.license-share__logo'));
    assert.equal(m.host.querySelector('.home__mark'), null);
    assert.equal(m.host.querySelector('h1'), null);
    const hrefs = [...m.host.querySelectorAll('.license-share__bar a')].map((a) => a.getAttribute('href'));
    assert.deepEqual(hrefs, ['/coach-unlimited', '/products']);
    m.done();
  }
});

test('link field uses the page origin (window.location.origin)', async () => {
  reset();
  grant(['pro']);
  issueInstructorInvite({ email: 'coach@gym.test', presetId: 'coach', origin: ORIGIN, token: 'tok-origin' });
  const m = await mount(<InstructorSharePage />);
  const input = m.host.querySelector('input[aria-label="Coach invite link"]') as HTMLInputElement | null;
  assert.ok(input?.value.startsWith(`${window.location.origin}/`));
  m.done();
});

const GYM_PNG = 'data:image/png;base64,iVBORw0KGgo=';

function cardLogo(host: HTMLElement): HTMLImageElement {
  return host.querySelector('.license-share__frame img.license-share__logo') as HTMLImageElement;
}

test('share card logo falls back to Advantage when no master gym logo is saved', async () => {
  reset();
  grant(['pro']);
  issueInstructorInvite({ email: 'coach@gym.test', presetId: 'coach', origin: ORIGIN, token: 'tok-logo-a' });
  const m = await mount(<InstructorSharePage />);
  assert.equal(cardLogo(m.host).getAttribute('src'), '/advantage-icon.png');
  assert.deepEqual(getGymLogo(), { src: '/advantage-icon.png', kind: 'advantage', dataUrl: null });
  // No upload on the share page: the master slot lives on the Gallery.
  assert.equal(m.host.querySelector('input[type="file"]'), null);
  m.done();
});

test('master gym logo swaps into the one slot on both pages live, and reset returns Advantage', async () => {
  reset();
  grant(['pro']);
  issueInstructorInvite({ email: 'coach@gym.test', presetId: 'coach', origin: ORIGIN, token: 'tok-logo-b' });
  localStorage.setItem(DRIVE_BINDING_KEY, JSON.stringify({ folderId: 'driveFolder123', folderName: 'Gym Academy' }));
  localStorage.setItem(GYM_LOGO_STORAGE_KEY, JSON.stringify({ version: 1, dataUrl: GYM_PNG }));
  assert.deepEqual(getGymLogo(), { src: GYM_PNG, kind: 'gym', dataUrl: GYM_PNG });
  for (const node of [<InstructorSharePage />, <StudentSharePage />]) {
    const m = await mount(node);
    assert.equal(cardLogo(m.host).getAttribute('src'), GYM_PNG);
    assert.equal(m.host.querySelectorAll('img.license-share__logo').length, 1);
    assert.equal(m.host.querySelectorAll('img[src="/advantage-icon.png"]').length, 0);
    m.done();
  }
  const m = await mount(<InstructorSharePage />);
  await act(async () => clearGymLogo());
  assert.equal(cardLogo(m.host).getAttribute('src'), '/advantage-icon.png');
  const next = 'data:image/png;base64,AAAA';
  await act(async () => writeGymLogo(next));
  assert.equal(cardLogo(m.host).getAttribute('src'), next);
  m.done();
});

test('Pro owner keeps the academy pathway and can see the free Student license pool', async () => {
  reset();
  grant(['pro']);
  localStorage.setItem(DRIVE_BINDING_KEY, JSON.stringify({ folderId: 'driveFolder123', folderName: 'Gym Academy' }));
  localStorage.setItem('advantage.entitlement.token', 'owner.token.value');
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/student-licenses/list')) {
      return new Response(JSON.stringify({ ok: true, role: 'owner', left: 4, cap: 5, claims: [], halfOff: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 503 });
  };
  const m = await mount(<StudentSharePage />);
  globalThis.fetch = previous;
  const input = m.host.querySelector('input[aria-label="Student Edition link"]') as HTMLInputElement | null;
  const pathway = academyPathway({ provider: 'googleDrive', folderId: 'driveFolder123', folderName: 'Gym Academy', gymName: '' });
  assert.ok(pathway);
  assert.equal(input?.value, academyPathwayUrl(pathway, ORIGIN));
  assert.match(m.host.textContent ?? '', /4 of 5 free Student licenses left/);
  assert.match(m.host.textContent ?? '', /Invite a student \(Student Edition only\)/);
  m.done();
});

test('Instructor Edition keeps the academy link and does not issue from the Pro pool', async () => {
  reset();
  grant(['coach']);
  localStorage.setItem(DRIVE_BINDING_KEY, JSON.stringify({ folderId: 'driveFolder123', folderName: 'Gym Academy' }));
  const m = await mount(<StudentSharePage />);
  assert.ok(m.host.querySelector('input[aria-label="Student Edition link"]'));
  assert.equal(m.host.querySelector('[data-student-license]'), null);
  m.done();
});

test('share logo helper: raster gym logo or Advantage, SVG refused', () => {
  assert.equal(resolveShareLogo(null), '/advantage-icon.png');
  assert.equal(resolveShareLogo('data:image/svg+xml;base64,AAAA'), '/advantage-icon.png');
  assert.equal(resolveShareLogo(GYM_PNG), GYM_PNG);
});
