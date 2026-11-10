/**
 * Identity card: Founders keeps spaces while typing, and a saved gym logo
 * replaces the upload prompt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { GymCharacterSheet } from './GymCharacterSheet.tsx';
import { CLOUD_ROLE_HOME } from '../lib/advantageCloudMedia.ts';
import { ADVANTAGE_CLOUD_DRIVE_NOTE } from '../lib/productNames.ts';
import { clearGymLogo, readGymLogo, writeGymLogo } from '../lib/gymLogo.ts';
import { GYM_NAME_STORAGE_KEY, readGymName, writeGymName } from '../lib/gymName.ts';
import { readGymProfile, writeGymProfile } from '../lib/gymProfile.ts';
import { installAcceptedSeat, signOutInstructorSeat } from '../lib/instructorSeats.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { getSchedule, setBoardTitle } from '../lib/scheduleStore.ts';

const dom = new Window({ url: 'http://localhost/pro' });
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

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function blankProfile() {
  writeGymProfile({ foundedOn: '', founders: '', lineage: '', lineageVisible: true, optIn: [] });
  clearGymLogo();
  writeGymName('');
  signOutInstructorSeat();
  clearOwnerTestGrant();
}

async function renderSheet(path = '/pro') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <GymCharacterSheet />
      </MemoryRouter>,
    );
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function field(host: ParentNode, name: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...host.querySelectorAll('label')].find((node) => {
    const text = [...node.childNodes]
      .filter((child) => child.nodeType === 3)
      .map((child) => child.textContent ?? '')
      .join('')
      .trim();
    return text === name;
  });
  const control = label?.querySelector('input, textarea');
  assert.ok(control instanceof view.HTMLElement, name);
  return control as HTMLInputElement | HTMLTextAreaElement;
}

async function openEditor(host: ParentNode) {
  const edit = host.querySelector('[data-testid="academy-edit"]') as HTMLButtonElement;
  assert.equal(edit.textContent, '✎ Edit academy profile');
  await act(async () => {
    edit.click();
  });
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set?.call(el, value);
  const key = Object.keys(el).find((name) => name.startsWith('__reactProps'));
  const props = key ? (el as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
  act(() => props?.onChange?.({ target: el, currentTarget: el }));
}

test('academy name keeps a trailing space while typing and trims when the field blurs', async () => {
  blankProfile();
  writeGymName('GracieBarra');
  const sheet = await renderSheet();
  await openEditor(sheet.host);
  const name = field(sheet.host, 'Academy name') as HTMLInputElement;
  setValue(name, 'GracieBarra');
  setValue(name, 'GracieBarra ');
  assert.equal(name.value, 'GracieBarra ');
  assert.equal(readGymName(), 'GracieBarra ');
  setValue(name, 'Gracie Barra Ellijay');
  assert.equal(name.value, 'Gracie Barra Ellijay');
  assert.equal(readGymName(), 'Gracie Barra Ellijay');
  const key = Object.keys(name).find((item) => item.startsWith('__reactProps'));
  const props = key ? (name as unknown as Record<string, { onBlur?: (event: unknown) => void }>)[key] : null;
  await act(async () => {
    props?.onBlur?.({ target: name, currentTarget: name });
  });
  assert.equal(readGymName(), 'Gracie Barra Ellijay');
  setValue(name, 'Gracie Barra Ellijay ');
  assert.equal(readGymName(), 'Gracie Barra Ellijay ');
  await act(async () => {
    props?.onBlur?.({ target: name, currentTarget: name });
  });
  assert.equal(readGymName(), 'Gracie Barra Ellijay');
  assert.equal(name.value, 'Gracie Barra Ellijay');
  await sheet.unmount();
});

test('founders and lineage keep a trailing space and a second space', async () => {
  blankProfile();
  const sheet = await renderSheet();
  assert.equal(sheet.host.querySelector('input[aria-label="Academy name"]'), null);
  await openEditor(sheet.host);
  const founders = field(sheet.host, 'Founders') as HTMLInputElement;
  const lineage = field(sheet.host, 'Lineage') as HTMLTextAreaElement;
  setValue(founders, 'Ana');
  setValue(founders, 'Ana ');
  assert.equal(founders.value, 'Ana ');
  setValue(founders, 'Ana  ');
  assert.equal(founders.value, 'Ana  ');
  setValue(founders, 'Ana  Luis');
  assert.equal(founders.value, 'Ana  Luis');
  setValue(lineage, 'Carlson');
  setValue(lineage, 'Carlson ');
  assert.equal(lineage.value, 'Carlson ');
  setValue(lineage, 'Carlson  Gracie');
  assert.equal(lineage.value, 'Carlson  Gracie');
  await sheet.unmount();
});

test('lineage can be hidden without losing the words, and a blank field has no placeholder', async () => {
  blankProfile();
  const story = 'Founded under Teacher A.\nThat teacher under Teacher B.';
  writeGymProfile({ lineage: story });
  const sheet = await renderSheet();
  await openEditor(sheet.host);
  const box = () => field(sheet.host, 'Lineage') as HTMLTextAreaElement;
  assert.equal(box().value, story);
  assert.equal(box().getAttribute('placeholder'), null);
  assert.match(sheet.host.textContent ?? '', /Teaching ancestry of this academy/);
  assert.match(sheet.host.textContent ?? '', /Not instructors who have taught or visited/);
  const toggle = () => sheet.host.querySelector('[role="switch"]') as HTMLButtonElement;
  assert.equal(toggle().getAttribute('aria-checked'), 'true');
  await act(async () => {
    toggle().click();
  });
  assert.equal(sheet.host.querySelector('textarea[aria-label="Lineage"]'), null);
  assert.equal(sheet.host.textContent?.includes(story), false);
  assert.equal(readGymProfile().lineage, story);
  assert.equal(readGymProfile().lineageVisible, false);
  await sheet.unmount();

  const again = await renderSheet();
  await openEditor(again.host);
  assert.equal(again.host.querySelector('textarea[aria-label="Lineage"]'), null);
  assert.equal(readGymProfile().lineage, story);
  const back = again.host.querySelector('[role="switch"]') as HTMLButtonElement;
  await act(async () => {
    back.click();
  });
  const restored = field(again.host, 'Lineage') as HTMLTextAreaElement;
  assert.equal(restored.value, story);
  assert.equal(readGymProfile().lineageVisible, true);
  await again.unmount();

  writeGymProfile({ lineage: '', lineageVisible: true });
  const empty = await renderSheet();
  await openEditor(empty.host);
  const emptyBox = field(empty.host, 'Lineage') as HTMLTextAreaElement;
  assert.equal(emptyBox.value, '');
  assert.equal(emptyBox.getAttribute('placeholder'), null);
  assert.equal(empty.host.querySelector('.gym-lineage-read'), null);
  await empty.unmount();
});

test('a gym logo replaces the upload prompt and stays tappable', async () => {
  blankProfile();
  const sheet = await renderSheet();
  await openEditor(sheet.host);
  const empty = sheet.host.querySelector('[data-gym-logo="empty"]');
  assert.ok(empty);
  assert.match(empty?.textContent ?? '', /Upload a gym logo/);
  assert.match(empty?.textContent ?? '', /Tap to upload/);
  assert.equal(sheet.host.querySelector('img[alt="Gym logo"]'), null);
  assert.equal(empty?.querySelector('input[type="file"]')?.getAttribute('aria-label'), 'Upload a gym logo');
  assert.equal(sheet.host.querySelector('.gym-fields input[type="file"]'), null);

  await act(async () => {
    writeGymLogo(LOGO);
  });

  const filled = sheet.host.querySelector('[data-gym-logo="set"]');
  assert.ok(filled);
  assert.equal(sheet.host.textContent?.includes('Upload a gym logo'), false);
  assert.equal(sheet.host.textContent?.includes('Tap to upload'), false);
  const img = filled?.querySelector('img');
  assert.equal(img?.getAttribute('alt'), 'Gym logo');
  assert.equal(img?.getAttribute('src'), LOGO);
  assert.equal(filled?.querySelector('input[type="file"]')?.getAttribute('aria-label'), 'Replace gym logo');
  await sheet.unmount();
});

test('academy name is the device gym name, and a board title and a student academy stay separate', async () => {
  blankProfile();
  writeGymName('Legacy Academy');
  writeGymLogo(LOGO);
  const story = 'Founded under Teacher A.\nThat teacher under Teacher B.';
  writeGymProfile({ lineage: story });
  localStorage.setItem('matboard.studentEdition.v1', '{"profile":{"gymName":"Student Gym"}}');
  localStorage.setItem('matboard.studentGymLogo.v1', 'student-mark');
  setBoardTitle('Open Mat Night');

  const sheet = await renderSheet();
  await openEditor(sheet.host);
  const name = field(sheet.host, 'Academy name') as HTMLInputElement;
  assert.equal(name.value, 'Legacy Academy');
  assert.equal(sheet.host.querySelector('h2')?.textContent, 'Legacy Academy');
  assert.equal(sheet.host.querySelector('img[alt="Gym logo"]')?.getAttribute('src'), LOGO);
  setValue(name, 'North Academy');
  assert.equal(readGymName(), 'North Academy');
  assert.equal(name.value, 'North Academy');
  assert.equal(sheet.host.querySelector('h2')?.textContent, 'North Academy');
  assert.equal(readGymLogo(), LOGO);
  assert.equal(getSchedule().title, 'Open Mat Night');
  assert.equal(localStorage.getItem('matboard.studentEdition.v1'), '{"profile":{"gymName":"Student Gym"}}');
  assert.equal(localStorage.getItem('matboard.studentGymLogo.v1'), 'student-mark');
  assert.equal(readGymProfile().lineage, story);

  const toggle = sheet.host.querySelector('[role="switch"]') as HTMLButtonElement;
  await act(async () => {
    toggle.click();
  });
  assert.equal(readGymProfile().lineage, story);
  assert.equal(readGymProfile().lineageVisible, false);
  assert.equal(readGymName(), 'North Academy');
  await sheet.unmount();

  const again = await renderSheet();
  await openEditor(again.host);
  assert.equal((field(again.host, 'Academy name') as HTMLInputElement).value, 'North Academy');
  assert.equal(again.host.querySelector('h2')?.textContent, 'North Academy');
  assert.equal(again.host.querySelector('textarea[aria-label="Lineage"]'), null);
  assert.equal(readGymProfile().lineage, story);
  setValue(field(again.host, 'Academy name'), '   ');
  assert.equal(readGymName(), '');
  assert.equal(localStorage.getItem(GYM_NAME_STORAGE_KEY), null);
  assert.equal(again.host.querySelector('h2')?.textContent, 'Your academy');
  assert.equal(getSchedule().title, 'Open Mat Night');
  assert.equal(readGymProfile().lineage, story);
  await again.unmount();
});

test('a signed-in seat sees the academy name and cannot edit it', async () => {
  blankProfile();
  writeGymName('Legacy Academy');
  const installed = installAcceptedSeat({
    id: 'seat-coach',
    email: 'coach@example.test',
    presetId: 'coach',
    inviteToken: 'tok-seat-coach',
  });
  assert.equal(installed.ok, true);
  const sheet = await renderSheet();
  assert.equal(sheet.host.querySelector('h2')?.textContent, 'Legacy Academy');
  assert.equal(sheet.host.querySelector('[data-testid="academy-edit"]'), null);
  assert.equal(sheet.host.querySelector('input[aria-label="Academy name"]'), null);
  assert.equal(sheet.host.querySelector('input[type="file"]'), null);
  assert.equal(sheet.host.querySelector('a.sheet-stat'), null);
  assert.equal(readGymName(), 'Legacy Academy');
  await sheet.unmount();
  signOutInstructorSeat();
  assert.equal(readGymName(), 'Legacy Academy');
});

test('with no logo the prompt is the empty state, and it is gone when a logo was already saved', async () => {
  blankProfile();
  const emptySheet = await renderSheet();
  assert.equal(emptySheet.host.textContent?.includes('Tap to upload'), false);
  await openEditor(emptySheet.host);
  assert.match(emptySheet.host.textContent ?? '', /Tap to upload/);
  await emptySheet.unmount();

  writeGymLogo(LOGO);
  const filledSheet = await renderSheet();
  assert.equal(filledSheet.host.textContent?.includes('Tap to upload'), false);
  assert.equal(filledSheet.host.textContent?.includes('Upload a gym logo'), false);
  assert.equal(filledSheet.host.querySelector('img[alt="Gym logo"]')?.getAttribute('src'), LOGO);
  await filledSheet.unmount();
});

test('count tiles open the existing screens and do not change the saved profile', async () => {
  blankProfile();
  writeGymName('North Academy');
  writeGymProfile({ founders: 'Teacher A', lineage: 'Founded under Teacher A.', lineageVisible: true });
  const sheet = await renderSheet('/pro-plus-cloud');
  const href = (label: string) =>
    [...sheet.host.querySelectorAll('a')].find((link) => link.textContent?.includes(label))?.getAttribute('href');
  assert.equal(href('Promotions'), '/roster?from=academy&home=%2Fpro-plus-cloud');
  assert.equal(href('Stripes given'), '/roster?from=academy&home=%2Fpro-plus-cloud');
  assert.equal(href('Classes taught'), '/notes?plan=unlimited&from=academy&home=%2Fpro-plus-cloud');
  assert.equal(href('Active students'), '/roster?from=academy&home=%2Fpro-plus-cloud');
  const instructors = sheet.host.querySelector('[data-zone="instructors"] a');
  assert.equal(instructors?.getAttribute('href'), '/instructors?from=academy&home=%2Fpro-plus-cloud');
  assert.match(instructors?.getAttribute('aria-label') ?? '', /not seat assignments/);
  await act(async () => {
    if (instructors instanceof view.HTMLElement) instructors.click();
  });
  assert.equal(readGymName(), 'North Academy');
  assert.equal(readGymProfile().founders, 'Teacher A');
  assert.equal(readGymProfile().lineage, 'Founded under Teacher A.');
  await sheet.unmount();
});

const CLOUD_TOKEN_KEY = 'advantage.entitlement.token';
const CLOUD_HOME_KEY = 'matboard.plusCloud.mediaHome.v1';

function cloudStatusResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      cloud: true,
      canUpload: true,
      licenseUsedBytes: 96_000_000,
      bucketUsedBytes: 397_000_000,
      capBytes: 8_000_000_000,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

test('a Cloud owner sees usage on the academy card and the details keep the cream-card actions', async () => {
  blankProfile();
  writeGymName('North Academy');
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  applyOwnerTestGrant({
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'pro',
  });
  localStorage.setItem(CLOUD_TOKEN_KEY, 'signed-token');
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('probe=1')) return new Response(JSON.stringify({ ok: true, bound: true }), { status: 200 });
    if (url.includes('/api/gym/cloud')) return cloudStatusResponse();
    if (url.includes('/api/token/refresh')) return new Response(JSON.stringify({ ok: false }), { status: 401 });
    return new Response(JSON.stringify({ ok: true, events: [], cursor: 0 }), { status: 200 });
  }) as typeof fetch;

  try {
    const sheet = await renderSheet('/pro');
    await settle();
    const metric = sheet.host.querySelector('[data-testid="cloud-usage-metric"]') as HTMLButtonElement;
    assert.ok(metric);
    assert.equal(metric.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(metric.getAttribute('aria-expanded'), 'false');
    assert.match(metric.textContent ?? '', /96/);
    assert.match(metric.textContent ?? '', /MB/);
    assert.match(metric.textContent ?? '', /This license/);
    assert.match(metric.textContent ?? '', /397/);
    assert.match(metric.textContent ?? '', /of 8 GB/);
    assert.equal(sheet.host.querySelector('.cloud-home'), null);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.match(metric.getAttribute('aria-label') ?? '', /This license is using 96 MB/);
    assert.match(metric.getAttribute('aria-label') ?? '', /397 MB of 8 GB/);

    await act(async () => {
      metric.click();
    });
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(metric.getAttribute('aria-expanded'), 'true');
    assert.match(dialog?.textContent ?? '', /This license is using 96 MB/);
    assert.match(dialog?.textContent ?? '', /Advantage Cloud is using 397 MB of 8 GB/);
    assert.ok((dialog?.textContent ?? '').includes(CLOUD_ROLE_HOME));
    assert.match(dialog?.textContent ?? '', /assistant coach can play and download/i);
    assert.match(dialog?.textContent ?? '', /does not need Google Drive or OneDrive/);
    assert.equal(ADVANTAGE_CLOUD_DRIVE_NOTE.includes('does not need Google Drive or OneDrive'), true);
    assert.match(dialog?.textContent ?? '', /Check again/);
    assert.match(dialog?.textContent ?? '', /Upload daily videos/);
    assert.match(dialog?.textContent ?? '', /Upload lesson-plan media/);
    assert.equal(dialog?.querySelector('.cloud-home'), null);

    const before = calls.filter((url) => url.includes('/api/gym/cloud')).length;
    const again = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Check again');
    assert.ok(again);
    await act(async () => {
      again.click();
    });
    await settle();
    assert.ok(calls.filter((url) => url.includes('/api/gym/cloud')).length > before);
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /397 MB of 8 GB/);

    const upload = [...document.querySelectorAll('a')].find((link) => link.textContent === 'Upload daily videos') as HTMLAnchorElement;
    assert.match(upload?.getAttribute('href') ?? '', /\/techniques\?from=unlimited/);
    await act(async () => {
      upload.click();
    });
    assert.equal(localStorage.getItem(CLOUD_HOME_KEY), 'advantage-cloud');

    const close = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close');
    await act(async () => {
      close?.click();
    });
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(sheet.host.querySelector('[data-testid="cloud-usage-metric"]'), metric);
    await sheet.unmount();
  } finally {
    globalThis.fetch = previousFetch;
    localStorage.removeItem(CLOUD_TOKEN_KEY);
    localStorage.removeItem(CLOUD_HOME_KEY);
    clearOwnerTestGrant();
  }
});

test('a non-Cloud owner and a signed-in seat do not get the Cloud metric', async () => {
  blankProfile();
  writeGymName('North Academy');
  const plain = await renderSheet('/pro');
  assert.equal(plain.host.querySelector('[data-testid="cloud-usage-metric"]'), null);
  assert.equal(plain.host.querySelector('.cloud-home'), null);
  await plain.unmount();

  applyOwnerTestGrant({
    grants: ['pro'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'pro',
  });
  installAcceptedSeat({
    id: 'seat-coach',
    email: 'coach@example.test',
    presetId: 'coach',
    inviteToken: 'tok-seat-coach',
  });
  const seated = await renderSheet('/pro-plus-cloud');
  assert.equal(seated.host.querySelector('[data-testid="cloud-usage-metric"]'), null);
  assert.equal(seated.host.querySelector('[data-testid="academy-edit"]'), null);
  await seated.unmount();
  signOutInstructorSeat();
  clearOwnerTestGrant();
});
