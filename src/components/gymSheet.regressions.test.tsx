/**
 * Identity card: Founders keeps spaces while typing, and a saved gym logo
 * replaces the upload prompt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GymCharacterSheet } from './GymCharacterSheet.tsx';
import { clearGymLogo, writeGymLogo } from '../lib/gymLogo.ts';
import { writeGymProfile } from '../lib/gymProfile.ts';

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
  writeGymProfile({ foundedOn: '', founders: '', lineage: '', optIn: [] });
  clearGymLogo();
}

async function renderSheet() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<GymCharacterSheet />);
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

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set?.call(el, value);
  const key = Object.keys(el).find((name) => name.startsWith('__reactProps'));
  const props = key ? (el as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
  act(() => props?.onChange?.({ target: el, currentTarget: el }));
}

test('founders and lineage keep a trailing space and a second space', async () => {
  blankProfile();
  const sheet = await renderSheet();
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

test('a gym logo replaces the upload prompt and stays tappable', async () => {
  blankProfile();
  const sheet = await renderSheet();
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

test('with no logo the prompt is the empty state, and it is gone when a logo was already saved', async () => {
  blankProfile();
  const emptySheet = await renderSheet();
  assert.match(emptySheet.host.textContent ?? '', /Tap to upload/);
  await emptySheet.unmount();

  writeGymLogo(LOGO);
  const filledSheet = await renderSheet();
  assert.equal(filledSheet.host.textContent?.includes('Tap to upload'), false);
  assert.equal(filledSheet.host.textContent?.includes('Upload a gym logo'), false);
  assert.equal(filledSheet.host.querySelector('img[alt="Gym logo"]')?.getAttribute('src'), LOGO);
  await filledSheet.unmount();
});
