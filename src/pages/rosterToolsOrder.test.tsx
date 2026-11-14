/**
 * Competitor and Student Roster: CSV / backup tools sit below the guest
 * (or student-inbox) block. Find, Sort, and Add stay at the top.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { PRO_UNLOCK_STORAGE_KEY } from '../lib/proUnlock.ts';
import { addStudent, resetRoster } from '../lib/rosterStore.ts';
import { RosterPage } from './Roster.tsx';

const dom = new Window({ url: 'http://localhost/roster' });
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
installGlobal('navigator', view.navigator);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);
installGlobal('StorageEvent', view.StorageEvent);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function follows(later: Element | null, earlier: Element | null, label: string) {
  assert.ok(earlier, `missing earlier node for ${label}`);
  assert.ok(later, `missing later node for ${label}`);
  assert.ok(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
    label,
  );
}

function byText(host: HTMLElement, selector: string, text: string): HTMLElement | null {
  return (
    [...host.querySelectorAll(selector)].find((node) => (node.textContent ?? '').includes(text)) as HTMLElement | undefined
  ) ?? null;
}

function seed(list: 'competitor' | 'student') {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  resetRoster();
  const added = addStudent(
    { name: 'Ava Santos', belt: 'Blue', division: '', gym: '', lastPromotion: '', note: '' },
    list === 'student' ? { rosterList: 'student' } : undefined,
  );
  assert.ok(added);
}

function mount(path: string, node: ReactNode): { root: Root; host: HTMLElement } {
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

test('competitor roster keeps Find at the top and Roster tools below guests', () => {
  seed('competitor');
  const page = mount('/roster?from=competitors', <RosterPage />);
  const host = page.host;

  const heading = host.querySelector('h1');
  const add = byText(host, 'header.roster__bar button', 'Add competitor');
  const find = host.querySelector('input[aria-label="Find competitor"]');
  const sort = host.querySelector('[data-testid="roster-sort"]');
  const guests = host.querySelector('[aria-label="Guest competitors"]');
  const addGuest = byText(host, 'button', 'Add guest');
  const noGuests = byText(host, 'p', 'No guests yet.');
  const tools = host.querySelector('#roster-tools-heading');
  const download = byText(host, 'button', 'Download template');
  const instructions = byText(host, 'button', 'Instructions');
  const exportBackup = byText(host, 'button', 'Export full backup');
  const importBackup = byText(host, 'button', 'Import full backup');

  assert.equal(heading?.textContent, 'Competitor Roster');
  assert.equal(tools?.textContent?.trim(), 'Roster tools');
  assert.ok(noGuests);
  follows(add, heading, 'Add competitor follows the title');
  follows(find, add, 'Find stays under Add competitor');
  follows(sort, find, 'Sort stays with Find at the top');
  follows(guests, sort, 'Guest competitors follow the list controls');
  follows(addGuest, guests, 'Add guest stays in the guest block');
  follows(noGuests, addGuest, 'No guests yet stays in the guest block');
  follows(tools, noGuests, 'Roster tools sit below Guest competitors');
  follows(download, tools, 'Download template is in Roster tools');
  follows(instructions, tools, 'Instructions is in Roster tools');
  follows(exportBackup, tools, 'Export full backup is in Roster tools');
  follows(importBackup, tools, 'Import full backup is in Roster tools');

  unmount(page);
});

test('student roster keeps Find at the top and Roster tools at the bottom', () => {
  seed('student');
  const page = mount('/roster?from=students', <RosterPage />);
  const host = page.host;

  const heading = host.querySelector('h1');
  const add = byText(host, 'button', 'Add student');
  const find = host.querySelector('input[aria-label="Find student"]');
  const sort = host.querySelector('[data-testid="roster-sort"]');
  const tools = host.querySelector('#roster-tools-heading');
  const download = byText(host, 'button', 'Download template');
  const guests = host.querySelector('[aria-label="Guest competitors"]');

  assert.equal(heading?.textContent, 'Student Roster');
  assert.equal(guests, null);
  assert.equal(tools?.textContent?.trim(), 'Roster tools');
  follows(add, heading, 'Add student stays at the top');
  follows(find, add, 'Find stays under Add student');
  follows(sort, find, 'Sort stays with Find at the top');
  follows(tools, sort, 'Roster tools sit below the student list');
  follows(download, tools, 'Download template is in Roster tools');

  unmount(page);
});
