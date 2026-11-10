/**
 * Preview-only index card. Sample rows, in-memory rating and branches, no storage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NEUTRAL_NOTE, OPTIONAL_NOTE } from '../termCard/model.ts';
import { IndexCardPreviewPage } from './IndexCardPreview.tsx';

const dom = new Window({ url: 'http://localhost/preview/index-card' });
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
  return JSON.stringify({ local: localStorage, session: sessionStorage });
}

test('the card starts at 3, a new rating stays in memory, Add branch names a branch, and Other shows Needs review', () => {
  const before = storageSnapshot();
  const mounted = mount(<IndexCardPreviewPage />);
  const { host } = mounted;
  const card = host.querySelector('[data-testid="index-card"]');
  assert.ok(card);
  assert.match(card.textContent ?? '', /Scissor sweep/);
  assert.match(card.textContent ?? '', /Sweeps/);
  assert.match(card.textContent ?? '', /Sweep/);
  assert.match(card.textContent ?? '', /Sample data/);
  assert.match(card.textContent ?? '', /Nothing is written to a record/);
  assert.match(card.textContent ?? '', /Oct 28, 2026/);
  assert.match(card.textContent ?? '', /Oct 14, 2026/);
  assert.match(card.textContent ?? '', /Sep 30, 2026/);
  assert.match(card.textContent ?? '', /Collar-and-sleeve scissor sweep/);
  assert.match(card.textContent ?? '', /Mount/);
  assert.match(card.textContent ?? '', /Armbar from mount/);
  assert.match(card.textContent ?? '', /Posture and base/);
  assert.equal(card.querySelectorAll('[data-kind="defense"]').length, 2);
  assert.equal(card.querySelector('iframe'), null);
  assert.equal(card.querySelector('video'), null);

  const video = card.querySelector('a');
  assert.ok(video);
  assert.equal(video.getAttribute('href'), 'https://www.youtube.com/watch?v=sample-scissor-sweep');
  assert.match(video.textContent ?? '', /Scissor sweep from closed guard/);
  assert.match(video.textContent ?? '', /youtube\.com\/watch\?v=sample-scissor-sweep/);

  assert.equal(buttonNamed(card, 'Scissor sweep 3').getAttribute('aria-pressed'), 'true');
  assert.equal(buttonNamed(card, 'Scissor sweep 1').getAttribute('aria-pressed'), 'false');
  assert.match(card.textContent ?? '', new RegExp(NEUTRAL_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(storageSnapshot(), before);

  click(buttonNamed(card, 'Scissor sweep 5'));
  assert.equal(buttonNamed(card, 'Scissor sweep 5').getAttribute('aria-pressed'), 'true');
  assert.equal(buttonNamed(card, 'Scissor sweep 3').getAttribute('aria-pressed'), 'false');
  assert.match(card.textContent ?? '', new RegExp(OPTIONAL_NOTE));
  assert.equal(storageSnapshot(), before);

  click(buttonNamed(card, 'Scissor sweep 3'));
  assert.equal(buttonNamed(card, 'Scissor sweep 3').getAttribute('aria-pressed'), 'true');
  assert.match(card.textContent ?? '', /Defaults to 3/);
  assert.equal(storageSnapshot(), before);

  assert.doesNotMatch(card.textContent ?? '', /New branch/);
  click(buttonNamed(card, 'Add branch'));
  const added = card.querySelector('[data-node="added-7"]');
  assert.ok(added);
  assert.equal(added.getAttribute('data-kind'), 'follow');
  assert.match(added.textContent ?? '', /New branch/);
  assert.match(added.textContent ?? '', /Follow-up/);
  click(buttonNamed(card, 'Add branch'));
  assert.match(card.textContent ?? '', /New branch 2/);
  assert.equal(storageSnapshot(), before);

  const other = card.querySelector('[data-testid="other-item"]');
  assert.ok(other);
  assert.match(other.textContent ?? '', /Needs review/);
  assert.match(other.textContent ?? '', /Posted the near hand and stood/);
  assert.match(card.textContent ?? '', /Other/);
  assert.equal(card.querySelectorAll('[data-testid="other-item"]').length, 1);
  assert.equal(storageSnapshot(), before);

  unmount(mounted);
});
