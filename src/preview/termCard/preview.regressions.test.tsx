/**
 * Preview-only indexed term card. Sample journal, in-memory rating, no storage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NEUTRAL_NOTE, OPTIONAL_NOTE } from './model.ts';
import { TermCardPreviewPage } from './TermCardPreview.tsx';

const dom = new Window({ url: 'http://localhost/preview/term-card' });
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
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('PopStateEvent', view.PopStateEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function buttonNamed(host: ParentNode, name: string): HTMLButtonElement {
  const nodes = [...host.querySelectorAll('button')];
  const found = nodes.find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === name) ?? nodes.find((node) => node.getAttribute('aria-label') === name);
  assert.ok(found, name);
  return found as HTMLButtonElement;
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function storageSnapshot(): string {
  return JSON.stringify(localStorage);
}

test('armbar opens a filled card, and side control escape stays neutral with no videos', () => {
  const before = storageSnapshot();
  const mounted = mount(<TermCardPreviewPage />);
  const { host } = mounted;
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.match(host.textContent ?? '', /From closed/);
  assert.match(host.textContent ?? '', /armbar/);
  assert.match(host.textContent ?? '', /side control/);
  assert.match(host.textContent ?? '', /Side control escape/);
  assert.match(host.textContent ?? '', /Sample/);
  assert.equal(host.querySelectorAll('.tc-term').length, 4);

  click(buttonNamed(host, 'armbar'));
  const armbar = host.querySelector('[role="dialog"]');
  assert.ok(armbar);
  assert.equal(armbar.getAttribute('data-term'), 'armbar');
  assert.match(armbar.textContent ?? '', /Submissions/);
  assert.match(armbar.textContent ?? '', /Your journal/);
  assert.match(armbar.textContent ?? '', /Videos/);
  assert.match(armbar.textContent ?? '', /Rate it/);
  assert.match(armbar.textContent ?? '', /Armbar from closed guard/);
  assert.match(armbar.textContent ?? '', /1:42/);
  assert.equal(armbar.querySelectorAll('.tc-entry').length, 3);
  assert.doesNotMatch(armbar.textContent ?? '', /First clean tap/);
  assert.equal(buttonNamed(armbar, 'See all 7 entries').getAttribute('aria-expanded'), 'false');
  assert.equal(buttonNamed(armbar, 'Armbar 3').getAttribute('aria-pressed'), 'true');
  assert.match(armbar.textContent ?? '', new RegExp(NEUTRAL_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(storageSnapshot(), before);

  click(buttonNamed(armbar, 'See all 7 entries'));
  assert.equal(host.querySelectorAll('[role="dialog"] .tc-entry').length, 7);
  assert.match(host.textContent ?? '', /First clean tap/);

  click(buttonNamed(host, 'Armbar 5'));
  assert.equal(buttonNamed(host, 'Armbar 5').getAttribute('aria-pressed'), 'true');
  assert.equal(buttonNamed(host, 'Armbar 3').getAttribute('aria-pressed'), 'false');
  assert.match(host.querySelector('[role="dialog"]')?.textContent ?? '', new RegExp(OPTIONAL_NOTE));
  assert.equal(storageSnapshot(), before);

  click(buttonNamed(host, 'Close'));
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  assert.equal(host.querySelector('[role="dialog"]'), null);

  click(buttonNamed(host, 'Side control escape'));
  const escape = host.querySelector('[role="dialog"]');
  assert.ok(escape);
  assert.equal(escape.getAttribute('data-term'), 'side-control-escape');
  assert.match(escape.textContent ?? '', /Escapes \/ Defense/);
  assert.match(escape.textContent ?? '', /Stayed calm under side control, didn't panic/);
  assert.match(escape.textContent ?? '', /No videos linked yet/);
  assert.equal(escape.querySelector('.tc-video'), null);
  assert.equal(buttonNamed(escape, 'Side control escape 3').getAttribute('aria-pressed'), 'true');
  assert.match(escape.textContent ?? '', /Defaults to 3/);
  assert.equal(escape.querySelector('button.tc-more'), null);
  assert.equal(storageSnapshot(), before);

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(storageSnapshot(), before);
  unmount(mounted);
});
