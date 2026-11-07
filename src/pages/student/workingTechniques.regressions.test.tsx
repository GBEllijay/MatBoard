/**
 * Journal add/link, the working list, and the tree share one technique.
 * Controls: Techniques I'm working on, Add, List, Tree, Connect, Unlink, Remove.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { loadStudentReport } from '../../lib/studentEdition.ts';
import { StudentEditionPage } from '../StudentEdition.tsx';

const dom = new Window({ url: 'http://localhost/student/journal?student=1' });
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
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('HTMLSelectElement', view.HTMLSelectElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
installGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function click(node: HTMLElement) {
  act(() => {
    const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
    const props = key ? (node as unknown as Record<string, { onClick?: (event: { preventDefault: () => void }) => void }>)[key] : null;
    props?.onClick?.({ preventDefault() {} });
  });
}

function typeInto(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

test('journal add puts Uchi Mata on the working list once, and the tree can point back at it', () => {
  localStorage.clear();
  const journal = mount(<StudentEditionPage />, '/student/journal?student=1');
  const name = journal.host.querySelector('[aria-label="Technique drilled #1"]') as HTMLInputElement;
  assert.ok(name);
  typeInto(name, 'Uchi Mata from Sprawl');
  const open = [...journal.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === "Techniques I'm working on");
  assert.ok(open);
  click(open!);
  const add = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes('Add “Uchi Mata from Sprawl”'));
  assert.ok(add, 'add path is visible');
  click(add!);
  const stored = loadStudentReport(localStorage);
  assert.equal(stored.working?.nodes.length, 1);
  assert.equal(stored.working?.nodes[0]?.title, 'Uchi Mata from Sprawl');
  const id = stored.working?.nodes[0]?.id ?? '';
  click(open!);
  const again = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes('already on your list'));
  assert.ok(again);
  click(again!);
  assert.equal(loadStudentReport(localStorage).working?.nodes.length, 1);
  unmount(journal);

  const page = mount(<StudentEditionPage />, `/student/working?student=1&node=${id}&view=list`);
  assert.match(page.host.textContent ?? '', /Uchi Mata from Sprawl/);
  const treeTab = [...page.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Tree');
  assert.ok(treeTab);
  click(treeTab!);
  assert.match(page.host.textContent ?? '', /Uchi Mata from Sprawl/);
  const position = page.host.querySelector('[aria-label="Technique or position name"]') as HTMLInputElement;
  typeInto(position, 'Sprawl');
  click([...page.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Position')!);
  click([...page.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Add to my list')!);
  const sprawl = loadStudentReport(localStorage).working?.nodes.find((node) => node.title === 'Sprawl');
  assert.equal(sprawl?.kind, 'position');
  const show = [...page.host.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Show in tree' && button.closest('article')?.textContent?.includes('Uchi Mata'),
  );
  assert.ok(show);
  click(show!);
  const pick = [...page.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Sprawl (position)');
  assert.ok(pick);
  click(pick!);
  click([...page.host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Connect')!);
  const edges = loadStudentReport(localStorage).working?.edges ?? [];
  assert.equal(edges.length, 1, (page.host.textContent ?? '').replace(/\s+/g, ' ').slice(0, 500));
  assert.equal(edges[0]?.toId, sprawl?.id);
  assert.equal(loadStudentReport(localStorage).working?.nodes.length, 2);
  unmount(page);
});
