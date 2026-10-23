/**
 * Grouped Student Edition hub. Old destinations stay reachable, and the
 * vague Menu card is gone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import {
  FORMER_HUB_ITEMS,
  TRAINING_GROUP_LABEL,
  menuDestination,
} from '../../lib/studentHubMenu.ts';
import { BackupMenu, ClearStudentMenu } from './BackupMenu.tsx';
import { CoachMenu, CompeteMenu, ProgressMenu, StudentHub, TrainingMenu } from './StudentMenus.tsx';

const dom = new Window({ url: 'http://localhost/student?student=1' });
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

function mount(node: ReactNode, entry: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function hrefs(host: ParentNode): string[] {
  return [...host.querySelectorAll('a')].map((node) => node.getAttribute('href') ?? '');
}

test('the hub is five groups and has no Menu card', () => {
  const hub = mount(<StudentHub />, '/student?student=1');
  const text = hub.host.textContent ?? '';
  assert.equal(text.includes(TRAINING_GROUP_LABEL), true);
  assert.equal(text.includes('Training and Journal'), false);
  assert.equal(hub.host.querySelector('summary'), null);
  assert.equal(text.includes('>Menu<'), false);
  assert.equal(hub.host.querySelector('[aria-label="Menu"]'), null);
  assert.equal(hub.host.querySelector('a[aria-label="Back. Hold for Home."]'), null);
  assert.match(hub.host.querySelector('a[aria-label="Home"]')?.getAttribute('href') ?? '', /\/products\?student=1$/);
  const labels = [...hub.host.querySelectorAll('a')].map((node) => node.getAttribute('aria-label') ?? '');
  assert.equal(labels.includes('Training & Journal'), true);
  assert.equal(labels.includes('Rank & Progress'), true);
  assert.equal(labels.includes('Competitor'), true);
  assert.equal(labels.includes('Coach & Academy'), true);
  assert.equal(labels.some((label) => label.startsWith('Backup & Print')), true);
  unmount(hub);
});

test('every former hub item is linked from a group menu', () => {
  const pages = [
    mount(<TrainingMenu />, '/student/training?student=1'),
    mount(<ProgressMenu />, '/student/progress?student=1'),
    mount(<CompeteMenu />, '/student/compete?student=1'),
    mount(<CoachMenu />, '/student/coach?student=1'),
    mount(<BackupMenu />, '/student/backup?student=1'),
    mount(<ClearStudentMenu />, '/student/backup/clear?student=1'),
  ];
  const links = pages.flatMap((page) => hrefs(page.host));
  for (const item of FORMER_HUB_ITEMS) {
    const target = menuDestination(item.to);
    assert.equal(
      links.some((href) => menuDestination(href) === target),
      true,
      item.label,
    );
  }
  const training = pages[0];
  assert.equal(training?.host.textContent?.includes(TRAINING_GROUP_LABEL), true);
  assert.ok(training?.host.querySelector('a[aria-label="Back. Hold for Home."]'));
  assert.match(
    training?.host.querySelector('a[aria-label="Back. Hold for Home."]')?.getAttribute('href') ?? '',
    /\/student\?student=1$/,
  );
  const clear = pages[5];
  assert.match(clear?.host.textContent ?? '', /Clear all Student Edition data/);
  assert.match(
    clear?.host.querySelector('a[aria-label="Back. Hold for Home."]')?.getAttribute('href') ?? '',
    /\/student\/backup\?student=1$/,
  );
  for (const page of pages) unmount(page);
});
