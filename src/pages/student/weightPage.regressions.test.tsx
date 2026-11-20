/**
 * Weigh-ins on the TV: the competition date label must render once, and
 * Add weigh-in uses the readable matte-navy / gold style — not the white CTA.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addTournament, setWeighDate } from '../../lib/studentCompetition.ts';
import { blankStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { WeightPage } from './WeightPage.tsx';

const dom = new Window({ url: 'http://localhost/student/weight' });
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
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, initialEntry = '/student/weight'): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[initialEntry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function ownText(el: Element): string {
  return [...el.childNodes]
    .filter((node) => node.nodeType === 3)
    .map((node) => (node.textContent ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function competitionWeighInLabels(host: ParentNode): string[] {
  return [...host.querySelectorAll('.ink__label, .weight-count__days, h1, h2, p, span, label, legend')]
    .map((el) => {
      const direct = ownText(el);
      const text = direct || (el.matches('.ink__label, .weight-count__days') ? (el.textContent ?? '').trim() : '');
      return text;
    })
    .filter((text) => /competition weigh-?in/i.test(text));
}

test('the empty weight page shows the competition weigh-in date label once', () => {
  localStorage.clear();
  const mounted = mount(<WeightPage />);
  const { host } = mounted;
  assert.ok(host.querySelector('main')?.classList.contains('student--weight'));
  assert.deepEqual(competitionWeighInLabels(host), ['Competition weigh-in date']);
  assert.equal(host.querySelectorAll('.weight-count__days').length, 0);
  assert.equal(host.querySelector('[aria-label="Competition weigh-in date"]')?.tagName, 'INPUT');
  assert.match(host.textContent ?? '', /The countdown starts when you save a date/);
  unmount(mounted);
});

test('a countdown keeps Until weigh-in and still has one competition weigh-in date field label', () => {
  localStorage.clear();
  const report = setWeighDate(
    addTournament(blankStudentReport(10), {
      name: 'Spring Open',
      date: '2026-12-01',
      location: 'Atlanta',
      division: 'Adult Blue',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '170',
      targetUnit: 'lb',
    }, 11),
    '2026-11-28',
    12,
  );
  saveStudentReport(localStorage, report);
  const mounted = mount(<WeightPage />);
  const { host } = mounted;
  assert.match(host.querySelector('.weight-count__days')?.textContent ?? '', /day/);
  assert.equal(
    [...host.querySelectorAll('.ink__label')].filter((el) => (el.textContent ?? '').trim() === 'Until weigh-in').length,
    1,
  );
  assert.deepEqual(competitionWeighInLabels(host), ['Competition weigh-in date']);
  unmount(mounted);
});

test('Add weigh-in uses the readable matte-navy / gold style', () => {
  localStorage.clear();
  const mounted = mount(<WeightPage />);
  const add = [...mounted.host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Add weigh-in');
  assert.ok(add);
  assert.equal(add.classList.contains('weight-add-btn'), true);
  assert.equal(add.classList.contains('ink-btn--save'), true);
  const css = readFileSync('src/pages/student/weightPage.css', 'utf8');
  const rule = css.slice(css.indexOf('.weight-add-btn'));
  assert.match(rule, /background:\s*#0c2344/);
  assert.match(rule, /color:\s*#fcc000/);
  assert.match(rule, /border:\s*2px solid #fcc000/);
  unmount(mounted);
});
