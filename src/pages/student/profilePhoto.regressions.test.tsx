/**
 * Profile photo and gym logo errors sit on the control that was used.
 * A failed pick leaves the photo already stored on this phone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readProfilePortrait, writeProfilePortraitSync } from '../../lib/profilePortrait.ts';
import { readStudentGymLogo, writeStudentGymLogo } from '../../lib/studentGymMark.ts';
import { ProfileMedia, useProfileMedia } from './ProfileIdentity.tsx';

const dom = new Window({ url: 'http://localhost/student/profile?student=1', width: 390, height: 844 });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const KEPT = 'data:image/jpeg;base64,AAAA';
const KEPT_LOGO = 'data:image/png;base64,T1dO';

function Harness() {
  const media = useProfileMedia();
  return <ProfileMedia media={media} />;
}

function mount(): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness /> as ReactNode);
  });
  return { root, host };
}

function reactProps(node: Element): Record<string, (event: unknown) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:image-rights-preview';
  URL.revokeObjectURL = () => {};
}

async function choose(id: string, file: File) {
  const input = document.getElementById(id) as HTMLInputElement;
  assert.ok(input, id);
  const props = reactProps(input);
  await act(async () => {
    props?.onChange?.({ target: { files: [file], value: file.name } });
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

function rightsBox(): HTMLInputElement {
  return document.querySelector('[data-testid="image-rights-owned"]') as HTMLInputElement;
}

function rightsUse(): HTMLButtonElement {
  return document.querySelector('[data-testid="image-rights-use"]') as HTMLButtonElement;
}

async function acknowledgeAndUse() {
  const box = rightsBox();
  assert.ok(box, 'expected rights checkbox after a file pick');
  assert.equal(rightsUse().disabled, true);
  await act(async () => {
    box.click();
    const props = reactProps(box);
    props?.onChange?.({ target: { checked: true } });
  });
  assert.equal(box.checked, true);
  assert.equal(rightsUse().disabled, false);
  await act(async () => {
    rightsUse().click();
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

test('a rejected photo and logo say so beside their own controls and keep the saved picture', async () => {
  localStorage.clear();
  writeProfilePortraitSync(KEPT);
  writeStudentGymLogo(KEPT_LOGO);
  const page = mount();
  try {
    const photo = () => page.host.querySelector('[aria-label="Profile photo"]');
    const logo = () => page.host.querySelector('[aria-label="Gym logo"]');
    assert.equal(photo()?.querySelector('img')?.getAttribute('src'), KEPT);

    await choose('profile-portrait-library', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    assert.ok(document.querySelector('[data-testid="image-rights-confirm"]'));
    assert.equal(readProfilePortrait(), KEPT);
    await acknowledgeAndUse();
    const photoAlert = photo()?.querySelector('#profile-portrait-error');
    assert.match(photoAlert?.textContent ?? '', /That file is not a photo/);
    assert.equal(photoAlert?.getAttribute('role'), 'alert');
    assert.equal(logo()?.querySelector('#profile-portrait-error'), null);
    assert.equal(photo()?.querySelector('img')?.getAttribute('src'), KEPT);
    assert.equal(readProfilePortrait(), KEPT);
    const photoText = photo()?.textContent ?? '';
    assert.ok(photoText.indexOf('Choose photo') < photoText.indexOf('That file is not a photo'));

    await choose('profile-logo-library', new File(['mark'], 'notes.txt', { type: 'text/plain' }));
    assert.ok(document.querySelector('[data-testid="image-rights-confirm"]'));
    assert.equal(readStudentGymLogo(), KEPT_LOGO);
    await acknowledgeAndUse();
    const logoAlert = logo()?.querySelector('#profile-logo-error');
    assert.match(logoAlert?.textContent ?? '', /That file is not a logo photo/);
    assert.equal(photo()?.querySelector('#profile-logo-error'), null);
    assert.match(photo()?.querySelector('#profile-portrait-error')?.textContent ?? '', /That file is not a photo/);
    assert.equal(readStudentGymLogo(), KEPT_LOGO);
    assert.equal(readProfilePortrait(), KEPT);
    const direct = [...(page.host.querySelector('.profile-identity')?.children ?? [])].some(
      (node) => node.getAttribute('role') === 'alert',
    );
    assert.equal(direct, false);
  } finally {
    act(() => page.root.unmount());
    page.host.remove();
  }
});

test('a camera photo that encodes is saved from the Choose photo control', async () => {
  localStorage.clear();
  writeProfilePortraitSync(KEPT);
  const previousBitmap = globalThis.createImageBitmap;
  const realCreate = document.createElement.bind(document);
  globalThis.createImageBitmap = (async () => ({
    width: 4032,
    height: 3024,
    close() {},
  })) as typeof createImageBitmap;
  document.createElement = ((tag: string) => {
    if (String(tag).toLowerCase() !== 'canvas') return realCreate(tag);
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          fillStyle: '',
          save() {},
          restore() {},
          beginPath() {},
          arc() {},
          clip() {},
          fillRect() {},
          drawImage() {},
        };
      },
      toBlob(callback: (blob: Blob | null) => void, mime: string) {
        callback(mime === 'image/jpeg' ? new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/jpeg' }) : null);
      },
    } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement;
  const page = mount();
  try {
    await choose('profile-portrait-library', new File([new Uint8Array(2_000_000)], 'IMG_4032.JPG', { type: 'image/jpeg' }));
    assert.equal(readProfilePortrait(), KEPT);
    assert.ok(document.querySelector('[data-testid="image-rights-confirm"]'));
    assert.equal(rightsUse().disabled, true);
    await acknowledgeAndUse();
    const photo = page.host.querySelector('[aria-label="Profile photo"]');
    const savedNote = photo?.querySelector('.save-confirm');
    assert.match(savedNote?.textContent ?? '', /Saved on this phone/);
    assert.equal(savedNote?.querySelector('.save-confirm__mark')?.textContent?.trim(), '✓');
    assert.doesNotMatch(savedNote?.textContent ?? '', /Cloud/);
    assert.equal(photo?.querySelector('#profile-portrait-error'), null);
    const src = photo?.querySelector('img')?.getAttribute('src') ?? '';
    assert.match(src, /^data:image\/jpeg;base64,/);
    assert.equal(readProfilePortrait(), src);
    assert.notEqual(src, KEPT);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    document.createElement = realCreate;
    act(() => page.root.unmount());
    page.host.remove();
  }
});

test('the rights checkbox is absent on the profile view until a file is picked, and Cancel does not save', async () => {
  localStorage.clear();
  const page = mount();
  try {
    const photo = page.host.querySelector('[aria-label="Profile photo"]');
    const logo = page.host.querySelector('[aria-label="Gym logo"]');
    assert.equal(photo?.textContent?.includes('I own the rights'), false);
    assert.equal(logo?.textContent?.includes('I own the rights'), false);
    assert.equal(document.querySelector('[data-testid="image-rights-confirm"]'), null);
    assert.match(logo?.textContent ?? '', /Choose logo/);
    assert.match(photo?.textContent ?? '', /Choose photo/);

    await choose('profile-logo-library', new File([new Uint8Array([1, 2, 3])], 'crest.png', { type: 'image/png' }));
    assert.ok(document.querySelector('[data-testid="image-rights-confirm"]'));
    assert.match(document.querySelector('[data-testid="image-rights-confirm"]')?.textContent ?? '', /I own the rights to this image or have permission to use it/);
    assert.equal(rightsUse().disabled, true);
    assert.equal(readStudentGymLogo(), null);

    await act(async () => {
      const cancel = [...document.querySelectorAll('.sheet--image-rights button')].find((node) => node.textContent === 'Cancel') as HTMLButtonElement;
      cancel?.click();
    });
    assert.equal(document.querySelector('[data-testid="image-rights-confirm"]'), null);
    assert.equal(readStudentGymLogo(), null);
    assert.equal(logo?.textContent?.includes('I own the rights'), false);
  } finally {
    act(() => page.root.unmount());
    page.host.remove();
  }
});
