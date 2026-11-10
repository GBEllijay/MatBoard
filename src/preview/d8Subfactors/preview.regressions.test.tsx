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
import { D8_SUBFACTORS_PATH, D8SubfactorsPreview } from './D8SubfactorsPreview.tsx';
import { SAMPLE_CHIP, SUBFACTOR_DISCLAIMER } from './model.ts';

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
    root.render(<MemoryRouter initialEntries={[D8_SUBFACTORS_PATH]}>{node}</MemoryRouter>);
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
