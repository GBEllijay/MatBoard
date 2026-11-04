/**
 * Program director Camera window renders Take a photo / Take a video and the
 * Today's videos player with loop, mute, fullscreen, TV tip, and the
 * play-from-device fallback. No lesson plan controls.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraWindow } from './CameraWindow.tsx';

const dom = new Window({ url: 'http://localhost/slideshow?camera=1' });
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
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const fs = {
  supported: true,
  active: false,
  className: '',
  tvStation: false,
  showFallback: false,
  enter: async () => {},
  exit: async () => {},
  toggle: async () => {},
};

async function render(props: { photoAllowed: boolean; dailyAllowed: boolean }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const calls: string[] = [];
  await act(async () => {
    root.render(
      <CameraWindow
        {...props}
        dateKey="2026-11-04"
        statusText=""
        note=""
        muted
        fs={fs as never}
        onTakePhoto={() => calls.push('photo')}
        onTakeVideo={() => calls.push('video')}
        onToggleMute={() => calls.push('mute')}
      />,
    );
  });
  return { host, root, calls };
}

test('PD Camera window: photo and video capture, plus the Today\'s videos player controls', async () => {
  const { host, root, calls } = await render({ photoAllowed: true, dailyAllowed: true });
  const text = host.textContent ?? '';
  assert.match(text, /Camera/);
  assert.match(text, /Photos go to the Gallery/);
  const photo = host.querySelector('[data-camera-take="photo"]') as HTMLButtonElement;
  const video = host.querySelector('[data-camera-take="video"]') as HTMLButtonElement;
  assert.ok(photo && video);
  await act(async () => {
    photo.click();
    video.click();
  });
  assert.deepEqual(calls, ['photo', 'video']);

  assert.ok(host.querySelector('[data-todays-videos]'));
  assert.match(text, /Today's videos/);
  const loops = host.querySelectorAll('[data-loop-choice] [role="radio"]');
  assert.ok(loops.length >= 2, 'loop always plus timed loops');
  assert.match(loops[0].textContent ?? '', /Loop · Always/);
  assert.match(text, /Fullscreen/);
  assert.match(text, /Mute clips/);
  assert.ok(host.querySelector('label[for="camera-play-device"]'));
  assert.ok(host.querySelector('input#camera-play-device[type="file"]'));
  assert.doesNotMatch(text, /lesson plan/i);
  await act(async () => root.unmount());
});

test('PD with only today\'s videos: no photo button; with only Gallery: no player', async () => {
  const onlyDaily = await render({ photoAllowed: false, dailyAllowed: true });
  assert.equal(onlyDaily.host.querySelector('[data-camera-take="photo"]'), null);
  assert.ok(onlyDaily.host.querySelector('[data-camera-take="video"]'));
  assert.ok(onlyDaily.host.querySelector('[data-todays-videos]'));
  await act(async () => onlyDaily.root.unmount());

  const onlyGallery = await render({ photoAllowed: true, dailyAllowed: false });
  assert.ok(onlyGallery.host.querySelector('[data-camera-take="photo"]'));
  assert.equal(onlyGallery.host.querySelector('[data-todays-videos]'), null);
  await act(async () => onlyGallery.root.unmount());
});
