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
import { readFileSync } from 'node:fs';
import { EMPTY_JOURNAL, INDEX_CARDS_STORAGE_KEY, NEUTRAL_NOTE } from '../lib/indexCards.ts';
import { CAMERA_Z, MESH_RADIUS, NEAR_GAP, projectFit } from '../preview/crystallineSweeps/labels.ts';
import { D8_STAGE_DEFAULT, D8_STAGE_HEIGHT_KEY, d8StageMax } from './LiveD8.tsx';
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

test('a rating lights the pressed number and says Saved', async () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const css = readFileSync('src/indexCards/liveD8.css', 'utf8');
  assert.match(css, /\.d8-live-sheet \.d8sf-rate\[aria-pressed='true'\]/);
  assert.match(css, /background:\s*#004eba/);
  assert.match(css, /color:\s*#fff/);
  assert.match(css, /animation:\s*d8-saved-fade 2s/);
  const { root, host } = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(host, 'sweeps');
  click([...host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Hip bump sweep'));
  const card = host.querySelector('[data-testid="live-index-card"]');
  const five = card?.querySelector('[aria-label="Hip bump sweep 5"]') as HTMLButtonElement;
  const three = card?.querySelector('[aria-label="Hip bump sweep 3"]') as HTMLButtonElement;
  assert.equal(three.getAttribute('aria-pressed'), 'true');
  assert.equal(five.getAttribute('aria-pressed'), 'false');
  click(five);
  assert.equal(five.getAttribute('aria-pressed'), 'true');
  assert.equal(three.getAttribute('aria-pressed'), 'false');
  const saved = host.querySelector('[data-testid="rating-saved"]');
  assert.equal(saved?.getAttribute('aria-live'), 'polite');
  assert.equal(saved?.textContent, 'Saved');
  assert.equal(saved?.getAttribute('data-on'), 'true');
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 2200));
  });
  assert.equal(host.querySelector('[data-testid="rating-saved"]')?.textContent, '');
  act(() => root.unmount());
  host.remove();
});

test('the face score shows one decimal and the unrated line stays at 3', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const { root, host } = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(host, 'sweeps');
  assert.match(host.querySelector('[data-testid="face-score"]')?.textContent ?? '', /Face score \d\.\d \/ 5/);
  assert.match(host.textContent ?? '', /Average of every line on this face\. A line you have not rated stays at 3\./);
  click([...host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Hip bump sweep'));
  click(host.querySelector('[aria-label="Hip bump sweep 5"]'));
  click(host.querySelector('[data-testid="live-index-card"] header button'));
  assert.match(host.querySelector('[data-testid="face-score"]')?.textContent ?? '', /Face score \d\.\d \/ 5/);
  assert.equal(host.querySelector('[data-empty-slot]')?.textContent, '+ Add');
  act(() => root.unmount());
  host.remove();
});

test('the diamond height is remembered, and Expand and the grip change it', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  localStorage.setItem(D8_STAGE_HEIGHT_KEY, '480');
  let mounted = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  const heightOf = () => mounted.host.querySelector('[data-testid="live-d8"]')?.getAttribute('data-stage-height');
  assert.equal(heightOf(), '480');
  click(mounted.host.querySelector('[data-testid="d8-fit"]'));
  const expanded = d8StageMax(window.innerHeight);
  assert.equal(heightOf(), String(expanded));
  assert.equal(localStorage.getItem(D8_STAGE_HEIGHT_KEY), String(expanded));
  const grip = mounted.host.querySelector('[data-testid="d8-resize"]') as HTMLElement;
  act(() => {
    grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 100, pointerId: 7 }));
  });
  act(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 40, pointerId: 7 }));
  });
  act(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 40, pointerId: 7 }));
  });
  const dragged = Number(heightOf());
  assert.ok(dragged < expanded, String(dragged));
  assert.equal(localStorage.getItem(D8_STAGE_HEIGHT_KEY), String(dragged));
  act(() => mounted.root.unmount());
  mounted.host.remove();
  resetIndexCardStoreForTests();
  mounted = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  assert.equal(mounted.host.querySelector('[data-testid="live-d8"]')?.getAttribute('data-stage-height'), String(dragged));
  assert.ok(D8_STAGE_DEFAULT > 420);
  act(() => mounted.root.unmount());
  mounted.host.remove();
});

test('pressing zoom in many times keeps the diamond visible and the face centered', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const { root, host } = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(host, 'submissions');
  const plus = host.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;
  for (let step = 0; step < 8; step += 1) click(plus);
  const stage = host.querySelector('.topo-stage') as HTMLElement;
  assert.equal(stage.hasAttribute('hidden'), false);
  assert.ok(stage.querySelector('canvas'));
  const zoom = Number(stage.getAttribute('data-zoom'));
  assert.ok(zoom >= 1 && zoom <= 1.45, String(zoom));
  const anchor: [number, number, number] = [0.42, -0.18, 1.1];
  const placed = projectFit(anchor, anchor, zoom, 960, 630);
  assert.ok(Math.abs(placed.x - 480) < 0.5);
  assert.ok(Math.abs(placed.y - 315) < 0.5);
  assert.ok(placed.depth > 1.5);
  assert.ok(CAMERA_Z > MESH_RADIUS + NEAR_GAP);
  click([...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Reset view'));
  assert.equal(host.querySelector('.topo-stage')?.getAttribute('data-zoom'), '1');
  assert.equal(host.querySelector('.topo-stage')?.hasAttribute('hidden'), false);
  act(() => root.unmount());
  host.remove();
});
