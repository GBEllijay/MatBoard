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

async function choose(id: string, file: File) {
  const input = document.getElementById(id) as HTMLInputElement;
  assert.ok(input, id);
  const props = reactProps(input);
  await act(async () => {
    props?.onChange?.({ target: { files: [file], value: file.name } });
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

test('a rejected photo says so beside its control, the gym logo upload is hidden, and saved pictures stay', async () => {
  localStorage.clear();
  writeProfilePortraitSync(KEPT);
  writeStudentGymLogo(KEPT_LOGO);
  const page = mount();
  try {
    const photo = () => page.host.querySelector('[aria-label="Profile photo"]');
    const logo = () => page.host.querySelector('[aria-label="Gym logo"]');
    assert.equal(photo()?.querySelector('img')?.getAttribute('src'), KEPT);

    await choose('profile-portrait-library', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const photoAlert = photo()?.querySelector('#profile-portrait-error');
    assert.match(photoAlert?.textContent ?? '', /That file is not a photo/);
    assert.equal(photoAlert?.getAttribute('role'), 'alert');
    assert.equal(photo()?.querySelector('img')?.getAttribute('src'), KEPT);
    assert.equal(readProfilePortrait(), KEPT);
    const photoText = photo()?.textContent ?? '';
    assert.ok(photoText.indexOf('Choose photo') < photoText.indexOf('That file is not a photo'));

    assert.equal(logo(), null, 'gym logo upload is hidden');
    assert.equal(document.getElementById('profile-logo-library'), null, 'logo file input is gone');
    assert.equal(readStudentGymLogo(), KEPT_LOGO, 'saved logo data is kept');
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
