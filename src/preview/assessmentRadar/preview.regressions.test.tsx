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
import { ASSESSMENT_RADAR_PREVIEW_PATH, COMPARISON_VARIANT_PATH, SHEET_VARIANT_PATH } from './model.ts';

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
  assert.equal(host.querySelector('#area-first-example strong')?.textContent, 'Deep half guard');
  assert.equal(labeled(host, 'Guard/Control axis, Not rated, selected').textContent?.includes('Guard/Control'), true);
  assert.equal(labeled(host, 'Passing axis, 3 / 5').textContent?.includes('Passing'), true);
  assert.equal(labeled(host, 'Sweeps axis, Not rated').textContent?.includes('Not rated'), true);
  assert.equal(host.querySelector('.oct-shape--closed'), null);
  const detail = labeled(host, 'Guard/Control explanation');
  assert.match(detail.textContent ?? '', /Deep half guard/);
  assert.match(detail.textContent ?? '', /not a saved student record/);
  assert.match(detail.textContent ?? '', /Manual check-in: not rated/);
  assert.doesNotMatch(host.textContent ?? '', /UFC|Ultimate Fighting/);
  assert.equal(localStorage.getItem('matboard.studentEdition.assessment.v1'), null);

  click(labeled(host, 'Sweeps axis, Not rated'));
  const sweeps = labeled(host, 'Sweeps explanation');
  assert.match(sweeps.textContent ?? '', /not a score of 0/);
  assert.match(sweeps.textContent ?? '', /Sit-up sweep/i);
  assert.match(labeled(host, 'Sweeps axis, Not rated, selected').textContent ?? '', /Selected/);

  click(labeled(host, 'From techniques'));
  assert.equal(labeled(host, 'From techniques').getAttribute('aria-pressed'), 'true');
  assert.ok(host.querySelector('[aria-label="Sweeps axis, Not rated, selected"]'));
  assert.ok(host.querySelector('[aria-label="Conditioning axis, Manual only"]'));
  assert.equal(host.querySelector('.oct-shape--closed'), null);
  click(labeled(host, 'Guard/Control axis, 4.0 / 5'));
  assert.match(labeled(host, 'Guard/Control explanation').textContent ?? '', /4/);
  assert.match(labeled(host, 'Guard/Control explanation').textContent ?? '', /Deep half guard/);

  click(labeled(host, 'Deep half guard rating 1'));
  assert.ok(host.querySelector('[aria-label="Guard/Control axis, 3.3 / 5, selected"]'));
  click(labeled(host, 'Manual check-in'));
  assert.ok(host.querySelector('[aria-label="Guard/Control axis, Not rated, selected"]'));
  assert.equal(labeled(host, 'Manual check-in').getAttribute('aria-pressed'), 'true');

  click(labeled(host, 'Manual Guard/Control rating 4'));
  click(labeled(host, 'Manual Sweeps rating 4'));
  assert.ok(host.querySelector('.oct-shape--closed'));
  assert.ok(host.querySelector('[aria-label="Guard/Control axis, 4 / 5, selected"]'));
  click(labeled(host, 'Manual Sweeps no score'));
  assert.equal(host.querySelector('.oct-shape--closed'), null);
  assert.equal(localStorage.length, before);
  unmount(mounted);
});

test('the sheet comparison uses the character-sheet radar and does not score a gap as zero', () => {
  const mounted = mount(<AssessmentRadarPreviewPage />, SHEET_VARIANT_PATH);
  const { host } = mounted;
  assert.equal(labeled(host, 'Sheet radar').getAttribute('aria-pressed'), 'true');
  assert.equal(host.querySelectorAll('polygon.oct-grid').length, 5);
  assert.equal(host.querySelectorAll('line.oct-grid').length, 8);
  assert.equal(host.querySelectorAll('.oct-scale').length, 5);
  assert.equal(host.querySelectorAll('.oct-label').length, 8);
  assert.ok(host.querySelector('[aria-label="Guard/Control axis, Not rated, selected"]'));
  assert.ok(host.querySelector('[aria-label="Sweeps axis, Not rated"]'));
  assert.equal(host.querySelector('[aria-label="Sweeps axis, 0/5"]'), null);
  assert.equal(host.querySelectorAll('.oct-dot').length, 6);
  assert.match(host.textContent ?? '', /Attribute radar/);
  assert.match(host.textContent ?? '', /1 = Developing/);
  assert.match(host.textContent ?? '', /Assessment radar/);
  assert.equal(host.querySelector('#area-first-example strong')?.textContent, 'Deep half guard');
  click(labeled(host, 'Back to assessment radar'));
  click(labeled(host, 'Current chart'));
  assert.equal(host.querySelector('.oct-stage--sheet'), null);
  assert.equal(host.querySelectorAll('polygon.oct-grid').length, 2);
  assert.equal(host.querySelectorAll('line.oct-grid').length, 8);
  unmount(mounted);
});

test('the center mark keeps a filled shape, the pressed logo, and no spider web', () => {
  const mounted = mount(<AssessmentRadarPreviewPage />, `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=center`);
  const { host } = mounted;
  assert.equal(labeled(host, 'Center mark').getAttribute('aria-pressed'), 'true');
  assert.equal(host.querySelector('.oct-stage--sheet'), null);
  assert.equal(host.querySelectorAll('line.oct-grid').length, 0);
  assert.equal(host.querySelectorAll('polygon.oct-grid').length, 0);
  assert.equal(host.querySelectorAll('polygon.oct-cage').length, 1);
  assert.equal(host.querySelectorAll('polygon.oct-shape--filled').length, 1);
  assert.equal(host.querySelectorAll('.oct-dot').length, 8);
  const closing = host.querySelector('.oct-shape-line')?.getAttribute('points')?.trim().split(/\s+/) ?? [];
  assert.equal(closing[0], closing[closing.length - 1]);
  assert.ok(host.querySelector('.oct-mark'));
  assert.ok(host.querySelector('[aria-label="Guard/Control axis, Fictional cage 4 / 5, selected"]'));
  assert.ok(host.querySelector('[aria-label="Sweeps axis, Fictional cage 4 / 5"]'));
  assert.match(host.textContent ?? '', /not stored as zero/i);
  assert.equal(host.querySelector('#area-first-example strong')?.textContent, 'Deep half guard');
  assert.match(host.textContent ?? '', /Guard retention/);
  for (const [id, label] of [
    ['passing', 'Passing'],
    ['sweeps', 'Sweeps'],
    ['takedowns', 'Takedowns'],
    ['escapes-defense', 'Escapes/Defense'],
    ['submissions', 'Submissions'],
    ['guard-control', 'Guard/Control'],
    ['conditioning', 'Conditioning'],
    ['mindset', 'Mindset'],
  ] as const) {
    click(host.querySelector(`.oct-label[data-area="${id}"]`) as HTMLElement);
    assert.ok(host.querySelector('#area-first-example'));
    assert.match(host.querySelector('#area-panel')?.textContent ?? '', new RegExp(label.replace('/', '\\/')));
  }
  unmount(mounted);
});

test('coach, opponent, and the comparison stay fictional and share the cage', () => {
  const before = localStorage.length;
  const coach = mount(<AssessmentRadarPreviewPage />, `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=coach`);
  assert.equal(labeled(coach.host, 'Coach radar').getAttribute('aria-pressed'), 'true');
  assert.ok(coach.host.querySelector('[aria-label="Guard/Control axis, Coach 5 / 5, selected"]'));
  assert.equal(coach.host.querySelectorAll('line.oct-grid').length, 0);
  assert.equal(coach.host.querySelectorAll('polygon.oct-shape--filled').length, 1);
  assert.match(coach.host.textContent ?? '', /Coach example \(fictional\)/);
  unmount(coach);

  const opponent = mount(<AssessmentRadarPreviewPage />, `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=opponent`);
  assert.ok(opponent.host.querySelector('[aria-label="Guard/Control axis, Opponent 2 / 5, selected"]'));
  assert.match(opponent.host.textContent ?? '', /Opponent example \(fictional\)/);
  unmount(opponent);

  const both = mount(<AssessmentRadarPreviewPage />, COMPARISON_VARIANT_PATH);
  assert.equal(labeled(both.host, 'Coach and opponent comparison').getAttribute('aria-pressed'), 'true');
  assert.equal(both.host.querySelectorAll('polygon.oct-shape--coach').length, 1);
  assert.equal(both.host.querySelectorAll('polygon.oct-shape--opponent').length, 1);
  assert.equal(both.host.querySelectorAll('line.oct-grid').length, 0);
  assert.ok(both.host.querySelector('[aria-label="Guard/Control axis, Coach 5 / 5, Opponent 2 / 5, selected"]'));
  assert.match(both.host.querySelector('.oct-label[data-area="guard-control"]')?.textContent ?? '', /Coach 5\/5/);
  assert.match(both.host.querySelector('.oct-label[data-area="guard-control"]')?.textContent ?? '', /Opponent 2\/5/);
  assert.match(both.host.textContent ?? '', /Coach/);
  assert.match(both.host.textContent ?? '', /Opponent/);
  assert.equal(localStorage.length, before);
  unmount(both);
});
