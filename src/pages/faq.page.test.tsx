/**
 * FAQ search, expand, and keyboard. Layout itself is checked in the browser.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FaqPage } from './Faq.tsx';

const dom = new Window({ url: 'http://localhost/faq' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('navigator', view.navigator);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/faq']}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

test('search expands a short match and Escape clears the box', () => {
  const page = mount(<FaqPage />);
  const input = page.host.querySelector('input[type="search"]') as HTMLInputElement;
  assert.ok(input);
  const welcome = page.host.querySelector('button[aria-controls="faq-start-with-your-belt-answer"]') as HTMLButtonElement;
  assert.equal(welcome.getAttribute('aria-expanded'), 'true');
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, 'mat hours');
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
  const hours = [...page.host.querySelectorAll('button.faq__q')].find((node) => node.textContent?.includes('mat hours'));
  assert.ok(hours);
  assert.equal(page.host.querySelectorAll('button.faq__q').length, 1);
  assert.equal(hours?.getAttribute('aria-expanded'), 'true');
  assert.match(page.host.textContent ?? '', /not your lifetime/i);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onKeyDown?: (event: { key: string; preventDefault: () => void }) => void }>)[key] : null;
    props?.onKeyDown?.({ key: 'Escape', preventDefault() {} });
  });
  assert.equal(input.value, '');
  unmount(page);
});

test('a question toggles with the button and arrows move focus', () => {
  const page = mount(<FaqPage />);
  const buttons = [...page.host.querySelectorAll('button.faq__q')] as HTMLButtonElement[];
  assert.ok(buttons.length > 4);
  const second = buttons[1];
  assert.equal(second.getAttribute('aria-expanded'), 'false');
  act(() => {
    second.click();
  });
  assert.equal(second.getAttribute('aria-expanded'), 'true');
  const panel = page.host.querySelector(`#${second.getAttribute('aria-controls')}`);
  assert.equal(panel?.hasAttribute('hidden'), false);
  act(() => {
    second.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  assert.equal(document.activeElement, buttons[2]);
  act(() => {
    buttons[2].dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  });
  assert.equal(document.activeElement, buttons[0]);
  unmount(page);
});
