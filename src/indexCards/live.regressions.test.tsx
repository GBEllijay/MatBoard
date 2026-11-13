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
import { GLOSSARY_ADDITIONS_KEY } from '../lib/glossaryAdditions.ts';
import { CAMERA_Z, LIVE_ZOOM_MAX, MESH_RADIUS, NEAR_GAP, projectFit } from '../preview/crystallineSweeps/labels.ts';
import { D8_FACE_CAP, D8_STAGE_DEFAULT, D8_STAGE_HEIGHT_KEY, d8FaceGrids, d8StageMax } from './LiveD8.tsx';
import { D8GridPreview, d8GridSampleFile } from './D8GridPreview.tsx';
import { IndexTermText } from './IndexTermLink.tsx';
import { IndexCardProvider } from './IndexCardHost.tsx';
import { GlossaryField } from '../glossary/GlossaryField.tsx';
import { useState } from 'react';
import { LiveD8 } from './LiveD8.tsx';
import { commitIndexCards, enterIndexCardPreview, getIndexCardFile, indexCardPreviewActive, leaveIndexCardPreview, resetIndexCardStoreForTests } from './store.ts';
import type { IndexCardFile, IndexFaceId } from '../lib/indexCards.ts';
import { FACES } from '../preview/d8Subfactors/model.ts';

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
installGlobal('HTMLTextAreaElement', view.HTMLTextAreaElement);
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
  // Still clamped. The unmeasured test stage uses the small fallback; the measured ceiling is checked in model.test.ts.
  assert.ok(zoom >= 1 && zoom <= LIVE_ZOOM_MAX, String(zoom));
  // A deep zoom keeps the face readout; it does not swap to the drill list.
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  assert.ok(host.querySelector('[data-testid="face-pyramid"]'));
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

function extraCards(faceId: IndexFaceId, count: number, start = 0): IndexCardFile['cards'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `extra.${faceId}.${start + index + 1}`,
    faceId,
    name: `Extra ${faceId} ${start + index + 1}`,
    rating: 3 as const,
    addedAt: start + index + 1,
    tree: null,
  }));
}

function tilesOn(host: HTMLElement, faceId: string): number {
  return host.querySelectorAll(`[data-technique-face="${faceId}"]`).length;
}

test('each face grows from 9 to 16 to 25 tiles as cards are added, and stays 5x5 past 25', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const { root, host } = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  for (const face of FACES) assert.equal(tilesOn(host, face.id), 9, face.id);
  // Six built-in lines + 3 = 9: still 3x3.
  act(() => {
    commitIndexCards({ version: 1, cards: extraCards('passing', 3) });
  });
  assert.equal(tilesOn(host, 'passing'), 9);
  // + 4 = 10: 4x4.
  act(() => {
    commitIndexCards({ version: 1, cards: extraCards('passing', 4) });
  });
  assert.equal(tilesOn(host, 'passing'), 16);
  assert.equal(tilesOn(host, 'sweeps'), 9);
  // + 10 = 16: still 4x4, every tile named.
  act(() => {
    commitIndexCards({ version: 1, cards: extraCards('passing', 10) });
  });
  assert.equal(tilesOn(host, 'passing'), 16);
  assert.equal(host.querySelectorAll('[data-technique-face="passing"][data-technique-label]:not([data-technique-label=""])').length, 16);
  // + 11 = 17: 5x5.
  act(() => {
    commitIndexCards({ version: 1, cards: extraCards('passing', 11) });
  });
  assert.equal(tilesOn(host, 'passing'), 25);
  // + 24 = 30: stays 5x5, 25 drawn, +5 more.
  act(() => {
    commitIndexCards({ version: 1, cards: extraCards('passing', 24) });
  });
  assert.equal(tilesOn(host, 'passing'), D8_FACE_CAP);
  assert.equal(host.querySelectorAll('[data-technique-face="passing"]:not([data-technique-label=""])').length, 25);
  focusFace(host, 'passing');
  assert.match(host.textContent ?? '', /\+5 more/);
  const pyramid = host.querySelector('[data-testid="face-pyramid"]') as HTMLElement;
  assert.equal(pyramid.getAttribute('data-grid'), '5');
  assert.equal(pyramid.querySelectorAll('.d8-live-pyramid-row').length, 5);
  assert.equal(pyramid.querySelectorAll('[data-slot]').length, 25);
  // Every card, including the five not drawn, stays in the list.
  assert.equal(host.querySelectorAll('[data-list-card]').length, 30);
  // Other faces were not touched.
  assert.equal(tilesOn(host, 'sweeps'), 9);
  assert.equal(tilesOn(host, 'mindset'), 9);
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  resetIndexCardStoreForTests();
});

test('a 3x3 face keeps its placed pyramid, a 4x4 face lays out in rows', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  commitIndexCards({ version: 1, cards: extraCards('sweeps', 5) });
  const { root, host } = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(host, 'guard-control');
  let pyramid = host.querySelector('[data-testid="face-pyramid"]') as HTMLElement;
  assert.equal(pyramid.getAttribute('data-grid'), '3');
  assert.equal(pyramid.querySelectorAll('.d8-live-pyramid-row').length, 0);
  const placed = pyramid.querySelector('[data-slot]') as HTMLElement;
  assert.match(placed.getAttribute('style') ?? '', /left:/);
  focusFace(host, 'sweeps');
  pyramid = host.querySelector('[data-testid="face-pyramid"]') as HTMLElement;
  assert.equal(pyramid.getAttribute('data-grid'), '4');
  const rows = [...pyramid.querySelectorAll('.d8-live-pyramid-row')];
  assert.deepEqual(rows.map((row) => row.querySelectorAll('[data-slot]').length), [1, 3, 5, 7]);
  assert.equal(pyramid.querySelectorAll('.d8sf-term').length, 11);
  assert.equal(pyramid.querySelectorAll('[data-empty-slot]').length, 5);
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  resetIndexCardStoreForTests();
});

test('d8FaceGrids follows each face card count', () => {
  const grid = (counts: Partial<Record<IndexFaceId, number>>) => {
    const cards = FACES.flatMap((face) =>
      Array.from({ length: counts[face.id as IndexFaceId] ?? 6 }, (_, index) => ({
        id: `${face.id}.${index}`,
        faceId: face.id as IndexFaceId,
        faceLabel: face.label,
        name: `${face.id} ${index}`,
        tile: `${face.id} ${index}`,
        rating: 3 as const,
        touched: false,
        addedAt: 0,
        custom: true,
        video: null,
        tree: null,
      })),
    );
    return d8FaceGrids(cards);
  };
  assert.deepEqual(grid({}), FACES.map(() => 3));
  const index = (id: string) => FACES.findIndex((face) => face.id === id);
  const mixed = grid({ passing: 10, sweeps: 17, submissions: 40, mindset: 9 });
  assert.equal(mixed[index('passing')], 4);
  assert.equal(mixed[index('sweeps')], 5);
  assert.equal(mixed[index('submissions')], 5);
  assert.equal(mixed[index('mindset')], 3);
});

test('the grid preview shows sample cards in memory and never writes the saved file', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const saved = JSON.stringify({ version: 1, cards: extraCards('mindset', 1) });
  localStorage.setItem(INDEX_CARDS_STORAGE_KEY, saved);
  const { root, host } = mount(
    <IndexCardProvider>
      <D8GridPreview />
    </IndexCardProvider>,
  );
  assert.equal(indexCardPreviewActive(), true);
  assert.equal(tilesOn(host, 'takedowns'), 9);
  assert.equal(tilesOn(host, 'passing'), 16);
  assert.equal(tilesOn(host, 'sweeps'), 25);
  assert.equal(tilesOn(host, 'submissions'), 25);
  assert.equal(tilesOn(host, 'mindset'), 9);
  act(() => {
    commitIndexCards({ version: 1, cards: [...d8GridSampleFile().cards, ...extraCards('guard-control', 1)] });
  });
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), saved);
  act(() => root.unmount());
  host.remove();
  assert.equal(indexCardPreviewActive(), false);
  assert.deepEqual(getIndexCardFile().cards.map((card) => card.id), ['extra.mindset.1']);
  enterIndexCardPreview({ version: 1, cards: [] });
  leaveIndexCardPreview();
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), saved);
  localStorage.clear();
  resetIndexCardStoreForTests();
});

test('an unlisted move asks for a face, saves on it, and lands in the additions pool', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const mounted = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  click(mounted.host.querySelector('[data-testid="add-any-move"]'));
  let card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-face'), 'none');
  const input = card?.querySelector('[aria-label="New card name"]') as HTMLInputElement;
  typeInto(input, 'kim');
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.querySelector('[data-testid="glossary-suggest"] [data-suggest]')?.getAttribute('data-suggest'), 'Kimura');
  typeInto(input, 'Zombie sweep');
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.match(card?.querySelector('[data-testid="draft-new-note"]')?.textContent ?? '', /Which face/);
  assert.equal(card?.querySelector('[data-testid="face-picker"]')?.getAttribute('data-prompt'), 'true');
  assert.equal(card?.querySelector('[data-face-pick="other"]'), null);
  assert.equal(card?.querySelectorAll('[data-face-pick]').length, 8);
  click(card?.querySelector('button[type="submit"]'));
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.match(card?.querySelector('[role="alert"]')?.textContent ?? '', /Pick a D8 face/);
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), null);
  click(card?.querySelector('[data-face-pick="sweeps"]'));
  click(card?.querySelector('button[type="submit"]'));
  assert.equal(mounted.host.querySelector('[data-testid="live-index-card"]'), null);
  assert.match(localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '', /Zombie sweep/);
  assert.match(localStorage.getItem(GLOSSARY_ADDITIONS_KEY) ?? '', /"kind":"new"/);
  const review = mounted.host.querySelector('[data-testid="glossary-additions"]');
  assert.match(review?.textContent ?? '', /Zombie sweep/);
  focusFace(mounted.host, 'sweeps');
  const made = [...mounted.host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Zombie sweep');
  assert.equal(made?.getAttribute('data-term-link'), 'term.zombie-sweep');
  click(made);
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.ok(card?.querySelector('[data-testid="glossary-tag-none"]'));
  act(() => mounted.root.unmount());
  mounted.host.remove();
});

test('a built-in move can be renamed and moved, and reset back to the glossary', () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const mounted = mount(
    <IndexCardProvider>
      <LiveD8 />
    </IndexCardProvider>,
  );
  focusFace(mounted.host, 'submissions');
  click([...mounted.host.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Kimura'));
  let card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.querySelector('[data-testid="glossary-tag"]')?.getAttribute('data-glossary'), 'kimura');
  click(card?.querySelector('[data-testid="card-edit-open"]'));
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  typeInto(card?.querySelector('[aria-label="Card name"]') as HTMLInputElement, 'Figure four');
  click(card?.querySelector('[data-testid="card-edit"] [data-face-pick="guard-control"]'));
  click(card?.querySelector('[data-testid="card-edit-save"]'));
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-face'), 'guard-control');
  assert.equal(card?.querySelector('h2')?.textContent, 'Figure four');
  assert.match(card?.querySelector('[data-testid="glossary-tag"]')?.textContent ?? '', /Glossary lists it under Submissions/);
  assert.ok(card?.querySelector('[data-testid="card-edited"]'));
  assert.match(localStorage.getItem(GLOSSARY_ADDITIONS_KEY) ?? '', /"kind":"renamed"/);
  click(card?.querySelector('[data-testid="card-reset"]'));
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.querySelector('h2')?.textContent, 'Kimura');
  assert.equal(card?.getAttribute('data-face'), 'submissions');
  act(() => mounted.root.unmount());
  mounted.host.remove();
});

function NotesField() {
  const [value, setValue] = useState('');
  return <GlossaryField label="Drill notes" ariaLabel="Drill notes" value={value} onChange={setValue} testId="journal-notes" />;
}

async function typeNotes(area: HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  proto?.set?.call(area, value);
  area.setSelectionRange(value.length, value.length);
  act(() => {
    const key = Object.keys(area).find((name) => name.startsWith('__reactProps'));
    const props = key ? (area as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: area, currentTarget: area });
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 450));
  });
}

test('journal notes suggest glossary names, insert the canonical one, and tag the shared card', async () => {
  localStorage.clear();
  resetIndexCardStoreForTests();
  const mounted = mount(
    <IndexCardProvider>
      <NotesField />
    </IndexCardProvider>,
  );
  const area = mounted.host.querySelector('textarea[aria-label="Drill notes"]') as HTMLTextAreaElement;
  assert.ok(area);
  assert.equal(area.getAttribute('autocorrect'), 'on');
  await typeNotes(area, 'ki');
  assert.equal(mounted.host.querySelector('[data-testid="glossary-suggestions"]'), null);

  await typeNotes(area, 'worked a kimmura');
  const chips = [...mounted.host.querySelectorAll('[data-testid="glossary-suggestions"] [role="option"]')];
  assert.equal(chips[0]?.querySelector('span')?.textContent, 'Kimura');
  click(chips[0]);
  assert.equal((mounted.host.querySelector('textarea') as HTMLTextAreaElement).value, 'worked a Kimura');
  const prompt = mounted.host.querySelector('[data-testid="glossary-tag-prompt"]');
  assert.match(prompt?.textContent ?? '', /Tag and open/);
  click(prompt?.querySelector('[data-testid="glossary-tag-confirm"]'));
  let card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-term'), 'sub.kimura');
  assert.equal(localStorage.getItem(INDEX_CARDS_STORAGE_KEY), null, 'opening a built-in card writes nothing');
  click(card?.querySelector('header button'));

  await typeNotes(area, 'worked a kimura then a berimbolo');
  const bolo = [...mounted.host.querySelectorAll('[data-testid="glossary-suggestions"] [role="option"]')].find((node) => node.querySelector('span')?.textContent === 'Berimbolo');
  click(bolo);
  const create = mounted.host.querySelector('[data-testid="glossary-tag-prompt"]');
  assert.match(create?.textContent ?? '', /Tag and create/);
  click(create?.querySelector('[data-testid="glossary-tag-confirm"]'));
  card = mounted.host.querySelector('[data-testid="live-index-card"]');
  assert.equal(card?.getAttribute('data-term'), 'term.berimbolo');
  assert.equal(card?.getAttribute('data-face'), 'guard-control');
  const saved = JSON.parse(localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '{"cards":[]}') as IndexCardFile;
  assert.equal(saved.cards.filter((row) => row.id === 'term.berimbolo').length, 1);
  click(card?.querySelector('header button'));

  await typeNotes(area, 'berimbolo');
  click([...mounted.host.querySelectorAll('[data-testid="glossary-suggestions"] [role="option"]')].find((node) => node.querySelector('span')?.textContent === 'Berimbolo'));
  assert.match(mounted.host.querySelector('[data-testid="glossary-tag-prompt"]')?.textContent ?? '', /Tag and open/);
  click(mounted.host.querySelector('[data-testid="glossary-tag-confirm"]'));
  const again = JSON.parse(localStorage.getItem(INDEX_CARDS_STORAGE_KEY) ?? '{"cards":[]}') as IndexCardFile;
  assert.equal(again.cards.filter((row) => row.id === 'term.berimbolo').length, 1);
  assert.equal(localStorage.getItem(GLOSSARY_ADDITIONS_KEY), null, 'a glossary move on its own face is not an addition');
  act(() => mounted.root.unmount());
  mounted.host.remove();
});
