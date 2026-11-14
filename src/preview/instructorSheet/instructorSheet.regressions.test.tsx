/**
 * Isolated instructor character-sheet preview.
 * Fictional sample only. The D8 is read from a linked student profile sample.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ASSESSMENT_STORAGE_KEY } from '../../lib/studentAssessment.ts';
import { PREVIEW_STORAGE_KEYS } from '../instructorProfile/model.ts';
import { InstructorSheetPreviewPage } from './InstructorSheetPreview.tsx';
import { INSTRUCTOR_D12_FACES, d12AxesFromScores } from '../../lib/instructorD12.ts';
import { INSTRUCTOR_D12_SAMPLE, INSTRUCTOR_SHEET_PATH, STUDENT_PROFILE_D8, d8FaceRows, teachingLengthLabel } from './model.ts';

const dom = new Window({ url: 'http://localhost/preview/instructor-sheet' });
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
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
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
    root.render(<MemoryRouter initialEntries={[INSTRUCTOR_SHEET_PATH]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function snapshotStorage() {
  const keys = [...PREVIEW_STORAGE_KEYS, ASSESSMENT_STORAGE_KEY];
  return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
}

test('the character sheet reuses the identity card and hides promotion counters', () => {
  const before = snapshotStorage();
  const mounted = mount(<InstructorSheetPreviewPage />);
  const text = mounted.host.textContent ?? '';
  assert.equal(mounted.host.querySelector('[data-testid="preview-path"]')?.textContent, INSTRUCTOR_SHEET_PATH);
  assert.ok(mounted.host.querySelector('[data-testid="stat-card"]'));
  assert.match(mounted.host.querySelector('[data-testid="teaching-since"]')?.textContent ?? '', /c\. 2013/);
  assert.match(mounted.host.querySelector('[data-testid="teaching-years"]')?.textContent ?? '', /13 years/);
  assert.equal(mounted.host.querySelector('[data-testid="profile-teaching-length"]')?.textContent, teachingLengthLabel());
  assert.equal(mounted.host.querySelector('[data-testid="combined-hours"]')?.textContent, '2,064 h');
  assert.equal(mounted.host.querySelector('[data-testid="stripes-given"]'), null);
  assert.equal(mounted.host.querySelector('[data-testid="belts-given"]'), null);
  assert.equal(text.includes('Stripes given'), false);
  assert.equal(text.includes('Promotions given'), false);
  assert.match(text, /Adult fundamentals/);
  assert.match(text, /Sunday gi/);
  assert.match(text, /Mestre Aurelio Vance/);
  assert.match(text, /Adult fundamentals · Kids · Open mat/);
  unmount(mounted);
  assert.deepEqual(snapshotStorage(), before);
});

test('the Instructor D12 has twelve named faces in order and no sub-scores', () => {
  const mounted = mount(<InstructorSheetPreviewPage />);
  const labels = [...mounted.host.querySelectorAll('[data-testid="d12-scores"] li')].map(
    (row) => row.querySelector('span')?.textContent,
  );
  const values = [...mounted.host.querySelectorAll('[data-testid="d12-scores"] li strong')].map(
    (row) => row.textContent,
  );
  assert.ok(mounted.host.querySelector('[data-testid="instructor-d12"]'));
  assert.ok(mounted.host.querySelector('[data-testid="instructor-d12-visual"]'));
  assert.ok(mounted.host.querySelector('[data-testid="instructor-d12-visual"] .topo-stage'));
  const select = mounted.host.querySelector('[data-testid="topo-face-select"]') as HTMLSelectElement | null;
  assert.ok(select, 'expected a compact face dropdown instead of ivory chips');
  assert.equal(mounted.host.querySelectorAll('[data-testid="instructor-d12-visual"] .topo-legend button').length, 0);
  const factors = [...(select?.querySelectorAll('option') ?? [])].slice(1).map((option) => option.textContent);
  assert.equal(factors.length, 12);
  assert.match(factors[0] ?? '', /Public Speaking/);
  assert.match(factors[5] ?? '', /Class Growth/);
  assert.match(factors[6] ?? '', /Student Leadership Development/);
  assert.match(factors[9] ?? '', /Student Retention/);
  assert.match(factors[11] ?? '', /Time Management/);
  assert.equal(factors.filter((text) => (text ?? '').includes('Student Retention')).length, 1);
  assert.deepEqual(labels, INSTRUCTOR_D12_FACES.map((face) => face.label));
  assert.deepEqual(values, d12AxesFromScores(INSTRUCTOR_D12_SAMPLE).map((face) => String(face.value)));
  assert.equal(mounted.host.querySelector('[data-submetric]'), null);
  assert.equal(mounted.host.querySelector('[data-testid="d12-class-growth-subs"]'), null);
  const scoreText = mounted.host.querySelector('[data-testid="d12-scores"]')?.textContent ?? '';
  assert.equal(scoreText.includes('Student Retention'), true);
  assert.equal(scoreText.includes('Class Growth'), true);
  assert.equal(scoreText.includes('Open slot'), false);
  assert.equal(scoreText.includes('Under '), false);
  assert.equal(labels.includes('Student Retention'), true);
  assert.equal(labels[labels.length - 1], 'Time Management');
  unmount(mounted);
});

test('the sample shows the student-profile D8, and the switch only hides it', () => {
  const before = snapshotStorage();
  const mounted = mount(<InstructorSheetPreviewPage />);
  const scores = [...mounted.host.querySelectorAll('[data-testid="own-d8-scores"] li')].map((row) => row.textContent);
  const expected = d8FaceRows(STUDENT_PROFILE_D8.scores).map((face) => `${face.label}${face.value}`);
  assert.ok(mounted.host.querySelector('[data-testid="own-d8"]'));
  assert.equal(mounted.host.querySelector('[data-testid="own-d8-switch"]')?.getAttribute('aria-checked'), 'true');
  assert.deepEqual(scores, expected);
  assert.match(mounted.host.querySelector('[data-testid="own-training"]')?.textContent ?? '', /not copied/);
  click(mounted.host.querySelector('[data-testid="own-d8-switch"]') as HTMLElement);
  assert.equal(mounted.host.querySelector('[data-testid="own-d8"]'), null);
  assert.ok(mounted.host.querySelector('[data-testid="own-d8-hidden"]'));
  assert.equal(mounted.host.querySelector('[data-testid="own-d8-switch"]')?.getAttribute('aria-checked'), 'false');
  click(mounted.host.querySelector('[data-testid="own-d8-switch"]') as HTMLElement);
  assert.ok(mounted.host.querySelector('[data-testid="own-d8"]'));
  const notes = mounted.host.querySelector('[data-testid="sheet-notes"]') as HTMLTextAreaElement;
  const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  proto?.set?.call(notes, 'Preview note');
  act(() => {
    const key = Object.keys(notes).find((name) => name.startsWith('__reactProps'));
    const props = key ? (notes as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: notes, currentTarget: notes });
  });
  assert.equal(notes.value, 'Preview note');
  unmount(mounted);
  assert.deepEqual(snapshotStorage(), before);
  assert.equal(localStorage.getItem(ASSESSMENT_STORAGE_KEY), null);
});

test('the preview route is registered and the page does not write storage keys', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const page = readFileSync('src/preview/instructorSheet/InstructorSheetPreview.tsx', 'utf8');
  assert.match(app, /path="\/preview\/instructor-sheet"/);
  assert.match(page, /InstructorIdentityCard/);
  assert.match(page, /StaticDiamond/);
  assert.match(page, /LiveD12/);
  assert.equal(page.includes('StaticD10'), false);
  assert.equal(page.includes('LiveD10'), false);
  assert.equal(page.includes('localStorage'), false);
  assert.equal(page.includes('sessionStorage'), false);
});
