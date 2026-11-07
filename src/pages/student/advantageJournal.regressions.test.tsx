/**
 * Live Student journal wears the Advantage shell. Typed fields stay notebook.
 * The sample preview route stays separate. Demo and profile gates are unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { STUDENT_EDITION_UNLOCK_STORAGE_KEY } from '../../lib/studentUnlock.ts';
import {
  addJournalEntry,
  blankStudentReport,
  loadStudentReport,
  saveStudentReport,
} from '../../lib/studentEdition.ts';
import { StudentEditionPage } from '../StudentEdition.tsx';

const dom = new Window({ url: 'http://localhost/student/journal' });
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
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('HTMLTextAreaElement', view.HTMLTextAreaElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('HTMLSelectElement', view.HTMLSelectElement);
installGlobal('HTMLFormElement', view.HTMLFormElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('FormData', view.FormData);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path: string): { root: Root; host: HTMLElement } {
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

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  );
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function unlock() {
  localStorage.clear();
  localStorage.setItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY, '1');
}

test('a licensed student journal uses the Advantage shell and keeps real fields', () => {
  unlock();
  const mounted = mount(<StudentEditionPage />, '/student/journal');
  const { host } = mounted;
  const main = host.querySelector('main');
  assert.equal(main?.classList.contains('adv-journal'), true);
  assert.equal(main?.classList.contains('student--arena'), false);
  assert.ok(main?.querySelector('.student-paper'));
  assert.equal(host.querySelector('h1')?.textContent, 'Journal');
  assert.match(host.textContent ?? '', /Advantage/);
  assert.equal(host.textContent?.includes('DEMO MODE'), false);
  assert.equal(host.textContent?.includes('Preview only'), false);
  assert.equal(host.textContent?.includes('Reset to sample'), false);
  assert.equal(host.textContent?.includes('Friday fundamentals'), false);
  assert.equal(host.querySelector('[data-testid="preview-banner"]'), null);
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student/training');
  assert.equal((labeled(host, 'Date') as HTMLInputElement).type, 'date');
  assert.equal((labeled(host, 'Class') as HTMLInputElement).tagName, 'INPUT');
  assert.equal((labeled(host, 'Training partners') as HTMLTextAreaElement).tagName, 'TEXTAREA');
  assert.equal((labeled(host, 'How it went') as HTMLTextAreaElement).tagName, 'TEXTAREA');
  assert.ok((labeled(host, 'How it went') as HTMLElement).closest('label.ink.journal-note'));
  const kinds = labeled(host, 'Session type');
  for (const name of ['Class', 'Open mat', 'Miscellaneous', 'Other']) {
    assert.equal(control(kinds, 'button', name).tagName, 'BUTTON');
  }
  assert.ok(control(labeled(host, 'Mark card'), 'button', 'Injury'));
  assert.ok(control(labeled(host, 'Mark card'), 'button', 'Break / hiatus'));
  assert.ok(labeled(host, 'Pick Technique drilled #1 from fundamentals'));
  assert.equal(host.querySelector('[aria-label="Count this entry toward comprehensive analytics"]'), null);
  unmount(mounted);
});

test('licensed save, reload, and edit keep the real journal file', () => {
  unlock();
  const seeded = saveStudentReport(
    localStorage,
    addJournalEntry(
      blankStudentReport(10),
      {
        date: '2026-10-11',
        className: 'Fundamentals',
        gameTag: '',
        techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
        partners: 'Alex',
        drills: 'hip escapes',
        rolls: '5 rounds',
        notes: 'grip the collar deeper',
        stopDoing: 'posting the near hand',
      },
      10,
    ),
  );
  const id = seeded.journal[0]?.id ?? '';
  const first = mount(<StudentEditionPage />, `/student/cards/${id}`);
  assert.match(first.host.textContent ?? '', /Scissor sweep/);
  assert.match(first.host.textContent ?? '', /Training partners: Alex/);
  assert.equal(first.host.textContent?.includes('DEMO MODE'), false);
  const edit = [...first.host.querySelectorAll('a')].find((node) => node.textContent?.trim().startsWith('Edit '));
  assert.ok(edit);
  click(edit as HTMLElement);
  typeInto(labeled(first.host, 'Edit Training partners') as HTMLTextAreaElement, 'Riley');
  click(control(first.host, 'button', 'Save card'));
  assert.match(first.host.textContent ?? '', /Training partners: Riley/);
  unmount(first);

  const again = mount(<StudentEditionPage />, `/student/cards/${id}`);
  assert.match(again.host.textContent ?? '', /Training partners: Riley/);
  assert.match(again.host.textContent ?? '', /grip the collar deeper/);
  const stored = loadStudentReport(localStorage).journal[0];
  assert.match(stored?.body ?? '', /Riley/);
  assert.match(stored?.body ?? '', /Scissor sweep/);
  assert.equal(loadStudentReport(localStorage).journal.length, 1);
  unmount(again);

  const today = mount(<StudentEditionPage />, '/student/journal?date=2026-11-07');
  typeInto(labeled(today.host, 'Class') as HTMLInputElement, 'Open rounds');
  typeInto(labeled(today.host, 'Drill notes') as HTMLTextAreaElement, 'kept after reload');
  click(control(today.host, 'button', 'Save entry'));
  const after = loadStudentReport(localStorage);
  assert.equal(after.journal.length, 2);
  assert.ok(after.journal.some((entry) => entry.body.includes('kept after reload')));
  assert.ok(after.journal.some((entry) => entry.body.includes('Riley')));
  unmount(today);

  const reloaded = mount(<StudentEditionPage />, '/student/cards');
  assert.match(reloaded.host.textContent ?? '', /kept after reload/);
  assert.match(reloaded.host.textContent ?? '', /Riley/);
  assert.equal(reloaded.host.querySelector('main')?.classList.contains('adv-journal'), true);
  unmount(reloaded);
});

test('demo query and profile page stay on their own gates', () => {
  localStorage.clear();
  const demo = mount(<StudentEditionPage />, '/student/journal?student=1');
  assert.match(demo.host.textContent ?? '', /DEMO MODE/);
  assert.equal(demo.host.querySelector('main')?.classList.contains('adv-journal'), true);
  assert.equal(demo.host.textContent?.includes('Preview only'), false);
  unmount(demo);

  unlock();
  const profile = mount(<StudentEditionPage />, '/student/profile');
  assert.equal(profile.host.querySelector('h1')?.textContent, 'My profile');
  assert.equal(profile.host.querySelector('main')?.classList.contains('adv-journal'), false);
  assert.equal(profile.host.textContent?.includes('DEMO MODE'), false);
  assert.equal(profile.host.textContent?.includes('Preview only'), false);
  assert.ok(profile.host.textContent?.includes('Preview my card') === false);
  unmount(profile);
});

test('the shell stylesheet lines typed fields and leaves the preview route alone', () => {
  const css = readFileSync('src/pages/student/advantageJournal.css', 'utf8');
  const live = readFileSync('src/pages/StudentEdition.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const profile = readFileSync('src/pages/student/ProfilePage.tsx', 'utf8');
  assert.match(css, /#071422/);
  assert.match(css, /Patrick Hand/);
  assert.match(css, /textarea/);
  assert.match(css, /input\[type='date'\]/);
  assert.match(css, /input\[type='checkbox'\]/);
  assert.doesNotMatch(css, /button[^,{]*repeating-linear-gradient/);
  assert.match(live, /className="student student-frame adv-journal"/);
  assert.doesNotMatch(live, /Journal2036|journal2036|preview\/journal-2036|Reset to sample|Friday fundamentals/);
  assert.match(app, /path="\/preview\/journal-2036"/);
  assert.match(app, /path="\/student\/\*"/);
  assert.doesNotMatch(profile, /adv-journal|Preview only/);
});
