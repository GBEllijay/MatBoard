/**
 * The sub-factor preview opens, rates in memory, and does not write storage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ASSESSMENT_STORAGE_KEY } from '../../lib/studentAssessment.ts';
import { PREVIEW_BANNER } from '../crystallineSweeps/adapter.ts';
import { CONDITIONING_ITEMS, MINDSET_GOALS } from '../../lib/studentAssessment.ts';
import { EMPTY_JOURNAL, EMPTY_VIDEOS } from '../termCard/model.ts';
import { D8_SUBFACTORS_PATH, D8SubfactorsPreview } from './D8SubfactorsPreview.tsx';
import { DUPLICATE_NAME, FACES, SAMPLE_CHIP, SUBFACTOR_DISCLAIMER } from './model.ts';
import { EMPTY_BRANCHES, VARIANT_A_LABEL, VARIANT_B_LABEL } from './cards.ts';

const dom = new Window({ url: 'http://localhost/preview/d8-subfactors' });
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

function mount(node: ReactNode, path = D8_SUBFACTORS_PATH): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

test('sample ratings update the face score and the scissor chain stays in memory', () => {
  localStorage.clear();
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, 'kept');
  const { root, host } = mount(<D8SubfactorsPreview />);
  assert.match(host.textContent ?? '', new RegExp(PREVIEW_BANNER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(host.textContent ?? '', /Sample scores stay on this page/);
  assert.equal(host.querySelector('.d8sf-sample')?.textContent, SAMPLE_CHIP);
  assert.match(host.textContent ?? '', /Proposed/);
  assert.equal(SUBFACTOR_DISCLAIMER.includes('D8 score'), true);
  const faces = [...host.querySelectorAll('[data-face-button]')];
  assert.equal(faces.length, 8);
  for (const button of faces) assert.match(button.textContent ?? '', /\(6\)/);
  assert.ok(host.querySelector('[aria-label="Zoom in"]'));
  assert.ok(host.querySelector('[aria-label="Zoom out"]'));
  assert.ok(host.querySelector('[data-spin]'));
  assert.match(host.textContent ?? '', /Reset view/);
  const stage = () => host.querySelector('.topo-stage') as HTMLElement;
  const techniqueLabels = () =>
    [...host.querySelectorAll('[data-technique-label]')].filter((node) => node.getAttribute('data-technique-label'));
  assert.equal(stage().dataset.labelTier, 'faces');
  assert.ok(techniqueLabels().length >= 48);
  for (const node of techniqueLabels()) assert.equal((node as HTMLElement).hidden, true);

  act(() => {
    (host.querySelector('[data-face-button="sweeps"]') as HTMLButtonElement).click();
  });
  assert.equal(stage().dataset.labelTier, 'faces');
  assert.equal(stage().dataset.drilled, '');
  for (const node of techniqueLabels()) assert.equal((node as HTMLElement).hidden, true);
  assert.match(host.textContent ?? '', /Scissor sweep/);
  assert.match(host.textContent ?? '', /Hip bump sweep/);
  assert.match(host.textContent ?? '', /Butterfly sweep/);
  assert.equal(host.querySelector('[data-testid="face-score"]')?.textContent, 'Face score 4 / 5');
  assert.equal(host.querySelectorAll('[data-subfactor]').length, 6);

  act(() => {
    (host.querySelector('[aria-label="Scissor sweep 1"]') as HTMLButtonElement).click();
  });
  assert.equal(host.querySelector('[data-testid="face-score"]')?.textContent, 'Face score 3 / 5');
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), 'kept');

  act(() => {
    (host.querySelector('[data-chain-open="scissor-mount-subs"]') as HTMLButtonElement).click();
  });
  const trail = host.querySelector('[data-chain="scissor-mount-subs"]');
  assert.ok(trail);
  assert.match(trail?.textContent ?? '', /Scissor sweep/);
  assert.match(trail?.textContent ?? '', /Mount/);
  assert.match(trail?.textContent ?? '', /Armbar from mount/);
  assert.match(trail?.textContent ?? '', /Cross collar choke/);
  assert.match(trail?.textContent ?? '', /Americana/);
  assert.match(trail?.textContent ?? '', /Sweep side to submission side/);
  assert.equal(host.querySelector('[data-face-button="sweeps"]')?.getAttribute('data-on-trail'), 'true');
  assert.equal(host.querySelector('[data-face-button="guard-control"]')?.getAttribute('data-on-trail'), 'true');
  assert.equal(host.querySelector('[data-face-button="submissions"]')?.getAttribute('data-on-trail'), 'true');
  assert.equal(host.querySelector('[data-face-button="passing"]')?.getAttribute('data-on-trail'), 'false');

  act(() => {
    (host.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click();
  });
  assert.equal(stage().dataset.labelTier, 'techniques');
  assert.equal(stage().dataset.labelFace, 'sweeps');
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  const sweepsNames = techniqueLabels().filter((node) => node.getAttribute('data-technique-face') === 'sweeps');
  assert.equal(sweepsNames.length, 6);
  for (const node of sweepsNames) assert.equal(node.getAttribute('data-label-policy'), 'show');
  for (const node of techniqueLabels()) {
    if (node.getAttribute('data-technique-face') !== 'sweeps') assert.equal((node as HTMLElement).hidden, true);
  }
  act(() => {
    (host.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement).click();
  });
  assert.equal(stage().dataset.labelTier, 'faces');
  for (const node of techniqueLabels()) assert.equal((node as HTMLElement).hidden, true);

  act(() => {
    (host.querySelector('[data-face-button="conditioning"]') as HTMLButtonElement).click();
  });
  for (const item of CONDITIONING_ITEMS) assert.match(host.textContent ?? '', new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  act(() => {
    (host.querySelector('[data-face-button="mindset"]') as HTMLButtonElement).click();
  });
  for (const goal of MINDSET_GOALS) assert.match(host.textContent ?? '', new RegExp(goal.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), 'kept');

  act(() => {
    root.unmount();
  });
  host.remove();
});

function typeInto(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function click(node: Element | null | undefined) {
  assert.ok(node);
  act(() => {
    (node as HTMLElement).click();
  });
}

function focusFace(host: HTMLElement, id: string) {
  click(host.querySelector(`[data-face-button="${id}"]`));
}

function addCard(host: HTMLElement, name: string, rating?: number) {
  click(host.querySelector('[data-add-card]'));
  const dialog = host.querySelector('[role="dialog"]');
  assert.ok(dialog);
  typeInto(dialog.querySelector('[aria-label="New sub-factor name"]') as HTMLInputElement, name);
  if (rating) click(dialog.querySelector(`[aria-label="New sub-factor ${rating}"]`));
  click(dialog.querySelector('button[type="submit"]'));
}

function zoomIn(host: HTMLElement, times: number) {
  for (let index = 0; index < times; index += 1) click(host.querySelector('[aria-label="Zoom in"]'));
}

test('blank and duplicate names are refused, and a saved line opens its face card', () => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(ASSESSMENT_STORAGE_KEY, 'kept');
  const { root, host } = mount(<D8SubfactorsPreview />, `${D8_SUBFACTORS_PATH}?variant=a`);
  assert.equal(host.querySelector('[data-variant-label]')?.textContent, VARIANT_A_LABEL);
  focusFace(host, 'sweeps');
  click(host.querySelector('[data-empty-slot]'));
  assert.ok(host.querySelector('[data-testid="face-card-list"]'));
  assert.equal(host.querySelectorAll('[data-list-card]').length, 6);

  click(host.querySelector('[data-add-card]'));
  const dialog = () => host.querySelector('[role="dialog"]');
  typeInto(dialog()?.querySelector('[aria-label="New sub-factor name"]') as HTMLInputElement, '   ');
  click(dialog()?.querySelector('button[type="submit"]'));
  assert.ok(dialog());
  assert.equal(dialog()?.querySelector('[role="alert"]'), null);
  assert.equal(host.querySelectorAll('[data-list-card]').length, 6);

  typeInto(dialog()?.querySelector('[aria-label="New sub-factor name"]') as HTMLInputElement, 'Scissor sweep');
  click(dialog()?.querySelector('button[type="submit"]'));
  assert.equal(dialog()?.querySelector('[role="alert"]')?.textContent, DUPLICATE_NAME);
  assert.equal(host.querySelector('[data-testid="face-score"]')?.textContent, 'Face score 4 / 5');

  click(dialog()?.querySelector('button[type="button"]'));
  assert.equal(dialog(), null);
  addCard(host, 'De La Riva', 3);
  assert.equal(host.querySelector('[data-testid="face-score"]')?.textContent, 'Face score 3 / 5');
  const link = [...host.querySelectorAll('[data-testid="face-card-list"] [data-term-link]')].find((node) => node.textContent === 'De La Riva');
  assert.ok(link);
  click(link);
  const card = host.querySelector('[role="dialog"]');
  assert.ok(card);
  assert.match(card.textContent ?? '', /De La Riva/);
  assert.match(card.textContent ?? '', /Sweeps/);
  assert.match(card.textContent ?? '', new RegExp(EMPTY_JOURNAL));
  assert.match(card.textContent ?? '', new RegExp(EMPTY_VIDEOS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(card.querySelector('[aria-label="De La Riva 3"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), 'kept');
  assert.equal(sessionStorage.length, 0);
  act(() => {
    root.unmount();
  });
  host.remove();
});

test('every face line is a link, and a blank on Passing or Mindset opens that face list', () => {
  const { root, host } = mount(<D8SubfactorsPreview />, `${D8_SUBFACTORS_PATH}?variant=a`);
  for (const face of FACES) {
    focusFace(host, face.id);
    for (const line of face.subfactors) {
      const link = [...host.querySelectorAll('a[data-term-link]')].find((node) => node.textContent === line.label);
      assert.ok(link, `${face.id} ${line.label}`);
    }
  }
  for (const id of ['passing', 'mindset'] as const) {
    focusFace(host, id);
    click(host.querySelector('[data-empty-slot]'));
    const list = host.querySelector('[data-testid="face-card-list"]');
    assert.ok(list);
    assert.match(list.textContent ?? '', new RegExp(id === 'passing' ? 'Passing' : 'Mindset'));
    assert.equal(list.querySelectorAll('[data-term-link]').length, 6);
    assert.ok(list.querySelector('[data-add-card]'));
    click(list.querySelector('[data-term-link]'));
    const card = host.querySelector('[role="dialog"]');
    assert.ok(card);
    assert.equal(card.getAttribute('data-face'), id);
    click(card.querySelector('button'));
  }
  act(() => {
    root.unmount();
  });
  host.remove();
});

test('a full face shows nine tiles, a +3 more badge, the average of all twelve, and Add still works', () => {
  const { root, host } = mount(<D8SubfactorsPreview />, `${D8_SUBFACTORS_PATH}?variant=a`);
  focusFace(host, 'sweeps');
  click(host.querySelector('[data-empty-slot]'));
  for (let index = 1; index <= 6; index += 1) addCard(host, `Low ${index}`, 1);
  assert.equal(host.querySelectorAll('[data-testid="face-pyramid"] [data-term-link]').length, 9);
  assert.equal(host.querySelectorAll('[data-testid="face-pyramid"] [data-empty-slot]').length, 0);
  assert.equal(host.querySelector('[data-more="sweeps"]')?.textContent, '+3 more');
  assert.equal(host.querySelector('[data-testid="face-score"]')?.textContent, 'Face score 2 / 5');
  assert.match(host.querySelector('[data-face-button="sweeps"]')?.textContent ?? '', /\(9\)/);
  assert.equal(host.querySelectorAll('[data-list-card]').length, 12);
  addCard(host, 'Still room', 3);
  assert.equal(host.querySelector('[data-more="sweeps"]')?.textContent, '+4 more');
  assert.equal(host.querySelectorAll('[data-list-card]').length, 13);
  assert.equal(host.querySelectorAll('[data-testid="face-pyramid"] [data-term-link]').length, 9);
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  zoomIn(host, 4);
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  assert.equal(host.querySelector('.topo-stage')?.hasAttribute('hidden'), false);
  act(() => {
    root.unmount();
  });
  host.remove();
});

test('variant B lists every card after zooming in, then Back and Reset step up to the diamond', () => {
  localStorage.clear();
  const { root, host } = mount(<D8SubfactorsPreview />);
  assert.equal(host.querySelector('[data-variant-label]')?.textContent, VARIANT_B_LABEL);
  focusFace(host, 'sweeps');
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  zoomIn(host, 4);
  const list = host.querySelector('[data-testid="face-card-list"]');
  assert.ok(list);
  for (const name of ['Scissor sweep', 'Hip bump sweep', 'Pendulum sweep', 'Flower sweep', 'Tripod sweep', 'Butterfly sweep']) {
    assert.match(list.textContent ?? '', new RegExp(name));
  }
  assert.equal(host.querySelector('.topo-stage')?.hasAttribute('hidden'), true);
  assert.ok(host.querySelector('[aria-label="Zoom in"]'));
  assert.ok(host.querySelector('[data-spin]'));
  assert.match(host.textContent ?? '', /Reset view/);
  click([...list.querySelectorAll('[data-term-link]')].find((node) => node.textContent === 'Scissor sweep'));
  assert.match(host.querySelector('[data-testid="drill-crumb"]')?.textContent ?? '', /Scissor sweep/);
  assert.match(host.textContent ?? '', /Sweeps/);
  click(host.querySelector('[data-branches]'));
  assert.match(host.querySelector('[data-testid="branch-level"]')?.textContent ?? '', new RegExp(EMPTY_BRANCHES));
  click(host.querySelector('[data-testid="drill-back"]'));
  assert.equal(host.querySelector('[data-testid="branch-level"]'), null);
  assert.match(host.textContent ?? '', /Scissor sweep/);
  click(host.querySelector('[data-testid="drill-back"]'));
  assert.ok(host.querySelector('[data-testid="face-card-list"]'));
  click(host.querySelector('[data-testid="drill-back"]'));
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  assert.equal(host.querySelector('.topo-stage')?.hasAttribute('hidden'), false);

  zoomIn(host, 4);
  assert.ok(host.querySelector('[data-testid="drill-view"]'));
  click([...host.querySelectorAll('[data-testid="face-card-list"] [data-term-link]')].find((node) => node.textContent === 'Scissor sweep'));
  click(host.querySelector('[data-branches]'));
  click(host.querySelector('.topo-reset'));
  assert.equal(host.querySelector('[data-testid="drill-view"]'), null);
  assert.equal(host.querySelector('.topo-stage')?.hasAttribute('hidden'), false);
  assert.ok(host.querySelector('[aria-label="Zoom out"]'));
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), null);
  act(() => {
    root.unmount();
  });
  host.remove();
});
