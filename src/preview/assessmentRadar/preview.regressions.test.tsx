/**
 * Preview-only eight-area chart. Labels are buttons, not hover tips.
 * Manual scores and technique ratings stay on separate states.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AssessmentRadarPreviewPage } from './AssessmentRadarPreview.tsx';
import { ASSESSMENT_RADAR_PREVIEW_PATH, CENTER_MARK_ASSET, CENTER_VARIANT_PATH } from './model.ts';

const dom = new Window({ url: 'http://localhost/preview/assessment-radar' });
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
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, entry = ASSESSMENT_RADAR_PREVIEW_PATH): { root: Root; host: HTMLElement } {
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

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

test('axis labels stay visible, Control is not zero, and Deep half guard is a Guard sample', () => {
  const before = localStorage.length;
  const mounted = mount(<AssessmentRadarPreviewPage />);
  const { host } = mounted;
  assert.equal(host.querySelectorAll('.oct-label').length, 8);
  assert.equal(host.querySelectorAll('line.oct-grid').length, 8);
  assert.equal(host.querySelector('.oct-mark'), null);
  assert.equal(labeled(host, 'Guard axis, 5, selected').textContent?.includes('Guard'), true);
  assert.equal(labeled(host, 'Passing axis, 3').textContent?.includes('Passing'), true);
  assert.equal(labeled(host, 'Control axis, Not rated').textContent?.includes('Not rated'), true);
  assert.equal(host.querySelector('.oct-shape--closed'), null);
  const detail = labeled(host, 'Guard explanation');
  assert.match(detail.textContent ?? '', /Deep half guard/);
  assert.match(detail.textContent ?? '', /not a saved student record/);
  assert.match(detail.textContent ?? '', /Manual check-in: 5/);
  assert.doesNotMatch(host.textContent ?? '', /UFC|Ultimate Fighting/);
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1'), null);

  click(labeled(host, 'Control axis, Not rated'));
  const control = labeled(host, 'Control explanation');
  assert.match(control.textContent ?? '', /side control/i);
  assert.match(control.textContent ?? '', /not a score of 0/);
  assert.match(control.textContent ?? '', /Back control/);
  assert.match(labeled(host, 'Control axis, Not rated, selected').textContent ?? '', /Selected/);

  click(labeled(host, 'From techniques'));
  assert.equal(labeled(host, 'From techniques').getAttribute('aria-pressed'), 'true');
  assert.ok(host.querySelector('[aria-label="Control axis, 4.3, selected"]'));
  assert.ok(host.querySelector('[aria-label="Conditioning axis, Manual only"]'));
  assert.equal(host.querySelector('.oct-shape--closed'), null);
  click(labeled(host, 'Guard axis, 3.5'));
  assert.match(labeled(host, 'Guard explanation').textContent ?? '', /3\.5/);
  assert.match(labeled(host, 'Guard explanation').textContent ?? '', /Deep half guard/);

  click(labeled(host, 'Deep half guard rating 1'));
  assert.ok(host.querySelector('[aria-label="Guard axis, 2.0, selected"]'));
  click(labeled(host, 'Manual check-in'));
  assert.ok(host.querySelector('[aria-label="Guard axis, 5, selected"]'));
  assert.equal(labeled(host, 'Manual check-in').getAttribute('aria-pressed'), 'true');

  click(labeled(host, 'Manual Control rating 4'));
  assert.ok(host.querySelector('.oct-shape--closed'));
  assert.ok(host.querySelector('[aria-label="Control axis, 4"]'));
  click(labeled(host, 'Manual Control no score'));
  assert.equal(host.querySelector('.oct-shape--closed'), null);
  assert.equal(localStorage.length, before);
  unmount(mounted);
});

test('the center-mark comparison drops spokes and rings and keeps the outer octagon', () => {
  const mounted = mount(<AssessmentRadarPreviewPage />, CENTER_VARIANT_PATH);
  const { host } = mounted;
  assert.equal(labeled(host, 'Center mark').getAttribute('aria-pressed'), 'true');
  assert.equal(host.querySelectorAll('line.oct-grid').length, 0);
  assert.equal(host.querySelectorAll('polygon.oct-grid:not(.oct-grid--outer)').length, 0);
  assert.equal(host.querySelectorAll('polygon.oct-grid--outer').length, 1);
  assert.equal(host.querySelectorAll('.oct-label').length, 8);
  assert.ok(host.querySelector('[aria-label="Control axis, Not rated"]'));
  const mark = host.querySelector('.oct-mark');
  assert.ok(mark);
  assert.equal(mark?.getAttribute('aria-hidden'), 'true');
  assert.match(mark?.getAttribute('style') ?? '', new RegExp(CENTER_MARK_ASSET.replaceAll('/', '\\/')));
  assert.match(host.textContent ?? '', /Spokes and the inner ring are removed/);
  assert.match(host.textContent ?? '', /not a score/);
  click(labeled(host, 'Current chart'));
  assert.equal(host.querySelector('.oct-mark'), null);
  assert.equal(host.querySelectorAll('line.oct-grid').length, 8);
  unmount(mounted);
});
