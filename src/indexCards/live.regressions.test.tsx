/**
 * Live index card. One host, the student's own journal, and a rating that survives reload.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { STUDENT_EDITION_STORAGE_KEY, addJournalEntry, blankStudentReport, saveStudentReport } from '../lib/studentEdition.ts';
import { ASSESSMENT_STORAGE_KEY } from '../lib/studentAssessment.ts';
import { EMPTY_JOURNAL, INDEX_CARDS_STORAGE_KEY, NEUTRAL_NOTE } from '../lib/indexCards.ts';
import { IndexTermText } from './IndexTermLink.tsx';
import { IndexCardProvider } from './IndexCardHost.tsx';
import { LiveD8 } from './LiveD8.tsx';
import { resetIndexCardStoreForTests } from './store.ts';

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
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('HTMLFormElement', view.HTMLFormElement);
installGlobal('SVGElement', view.SVGElement);
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
    root.render(<MemoryRouter initialEntries={['/student?student=1']}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function click(node: Element | null | undefined) {
  assert.ok(node);
  act(() => {
    (node as HTMLElement).click();
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

function focusFace(host: HTMLElement, id: string) {
  click(host.querySelector(`[data-face-button="${id}"]`));
}

function seedJournal() {
  saveStudentReport(
    localStorage,
    addJournalEntry(
      blankStudentReport(1),
      {
        date: '2026-10-28',
        className: 'Gi',
        gameTag: '',
        techniques: [{ id: 'sweep.hip-bump', name: 'Hip bump sweep' }],
        partners: '',
        drills: '',
        rolls: '',
        notes: 'The hip bump sweep came up when they posted.',
      },
      2,
    ),
  );
}

test('a D8 term opens the shared card at 3, and the journal line is the same term', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  seedJournal();
  const journalKey = localStorage.getItem(STUDENT_EDITION_STORAGE_KEY);
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, 'kept-check-in');
  const { root, host } = mount(
    <IndexCardProvider>
      <LiveD8 />
      <IndexTermText text="The hip bump sweep came up when they posted." />
    </IndexCardProvider>,
  );
  assert.equal(host.querySelector('[data-label-policy="show"]'), null);
  assert.ok(host.querySelector('[aria-label="Zoom in"]'));
  assert.ok(host.querySelector('[data-spin]'));
  assert.match(host.textContent ?? '', /Reset view/);
  focusFace(host, 'mindset');
  const mindset = host.querySelector('[data-testid="face-card-list"] [data-term-link]');
  assert.ok(mindset);
  click(mindset);
  let card = host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-face'), 'mindset');
  assert.equal(card?.querySelector('[aria-pressed="true"]')?.textContent, '3');
  assert.match(card?.textContent ?? '', new RegExp(NEUTRAL_NOTE));
  assert.match(card?.textContent ?? '', new RegExp(EMPTY_JOURNAL));
  assert.equal(card?.querySelector('[data-branches]'), null);
  click(card?.querySelector('button'));
  focusFace(host, 'sweeps');
  const fromDiamond = [...host.querySelectorAll('[data-testid="face-card-list"] [data-term-link]')].find((node) => node.textContent === 'Hip bump sweep');
  const fromJournal = [...host.querySelectorAll('p, span, a')].find((node) => node.getAttribute('data-term-link') && node.textContent === 'hip bump sweep');
  assert.ok(fromDiamond);
  assert.ok(fromJournal);
  assert.equal(fromDiamond.getAttribute('data-term-link'), 'sweep.hip-bump');
  assert.equal(fromJournal.getAttribute('data-term-link'), fromDiamond.getAttribute('data-term-link'));
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), null);
  click(fromDiamond);
  card = host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-term'), 'sweep.hip-bump');
  assert.match(card?.textContent ?? '', /Hip bump sweep/);
  assert.match(card?.textContent ?? '', /Sweeps/);
  assert.match(card?.textContent ?? '', /hip bump sweep came up/i);
  assert.equal(card?.querySelector('[aria-label="Hip bump sweep 3"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), journalKey);
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), 'kept-check-in');
  act(() => root.unmount());
  host.remove();
});

test('a blank face slot creates a card, and a rating is still there after reload', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  seedJournal();
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, 'kept-check-in');
  const journalKey = localStorage.getItem(STUDENT_EDITION_STORAGE_KEY);
  let mounted = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(mounted.host, 'sweeps');
  click(mounted.host.querySelector('[data-empty-slot]'));
  let card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-term'), 'draft');
  assert.equal(card?.getAttribute('data-face'), 'sweeps');
  typeInto(card?.querySelector('[aria-label="New card name"]') as HTMLInputElement, 'De La Riva');
  click(card?.querySelector('[aria-label="New card 4"]'));
  click(card?.querySelector('button[type="submit"]'));
  assert.equal(mounted.host.querySelector('[data-testid="live-index-card"]'), null);
  const created = [...mounted.host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'De La Riva');
  assert.equal(created?.getAttribute('data-term-link'), 'term.de-la-riva');
  click(created);
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.querySelector('[aria-label="De La Riva 4"]')?.getAttribute('aria-pressed'), 'true');
  click(card?.querySelector('header button'));
  click([...mounted.host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Hip bump sweep'));
  click(mounted.host.querySelector('[aria-label="Hip bump sweep 5"]'));
  assert.equal(mounted.host.querySelector('[aria-label="Hip bump sweep 5"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), 'kept-check-in');
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY), journalKey);
  act(() => mounted.root.unmount());
  mounted.host.remove();
  resetIndexCardStoreForTests();
  mounted = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(mounted.host, 'sweeps');
  click([...mounted.host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Hip bump sweep'));
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.querySelector('[aria-label="Hip bump sweep 5"]')?.getAttribute('aria-pressed'), 'true');
  click(card?.querySelector('button'));
  const again = [...mounted.host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'De La Riva');
  assert.equal(again?.getAttribute('data-term-link'), 'term.de-la-riva');
  assert.ok(mounted.host.querySelector('[data-add-card="sweeps"]'));
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), 'kept-check-in');
  act(() => mounted.root.unmount());
  mounted.host.remove();
});
