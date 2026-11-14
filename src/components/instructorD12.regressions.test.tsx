/**
 * Live instructor character sheet: preview paint, student profile cards,
 * D12 empty state, and save/reload of teaching-shape ratings.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { InstructorSheet } from './InstructorSheet.tsx';
import { INSTRUCTOR_D12_STORAGE_KEY } from '../lib/instructorD12.ts';
import { ASSESSMENT_STORAGE_KEY } from '../lib/studentAssessment.ts';
import { STUDENT_FILE_STORAGE_KEY } from '../lib/studentDemo.ts';
import { INSTRUCTOR_D12_SAMPLE } from '../preview/instructorSheet/model.ts';

const dom = new Window({ url: 'http://localhost/coach-unlimited' });
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
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('navigator', view.navigator);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
if (typeof view.matchMedia !== 'function') {
  installGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }));
}

function clearSheetStorage() {
  localStorage.removeItem(INSTRUCTOR_D12_STORAGE_KEY);
  localStorage.removeItem(ASSESSMENT_STORAGE_KEY);
  localStorage.removeItem(STUDENT_FILE_STORAGE_KEY);
}

async function renderSheet() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/coach-unlimited']}>
        <InstructorSheet />
      </MemoryRouter>,
    );
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function click(node: HTMLElement) {
  await act(async () => {
    node.click();
  });
}

test('Instructor Edition mounts the painted instructor sheet', () => {
  const page = readFileSync('src/pages/CoachUnlimited.tsx', 'utf8');
  const sheet = readFileSync('src/components/InstructorSheet.tsx', 'utf8');
  assert.match(page, /<InstructorSheet \/>/);
  assert.match(sheet, /ip-preview ip-preview--embedded/);
  assert.match(sheet, /instructorProfile\.css/);
  assert.match(sheet, /instructorSheet\.css/);
  assert.match(sheet, /<StudentCardLayout/);
  assert.match(sheet, /<InstructorD12Panel/);
  assert.doesNotMatch(sheet, /shapeExtra/);
  assert.ok(sheet.indexOf('<InstructorD12Panel') < sheet.indexOf('<StudentCardLayout'));
  assert.ok(sheet.indexOf('data-testid="instructor-log"') < sheet.indexOf('data-testid="instructor-student-profile"'));
});

test('the instructor profile shows the student cards, an empty D12, and keeps saved scores', async () => {
  clearSheetStorage();
  const first = await renderSheet();
  const sheet = first.host.querySelector('[data-testid="instructor-sheet"]') as HTMLElement;
  assert.ok(sheet, 'expected the instructor profile');
  assert.equal(sheet.classList.contains('ip-preview'), true);
  assert.ok(sheet.querySelector('.ip-sheet'), 'expected the preview identity-card paint');
  const identity = first.host.querySelector('[data-testid="instructor-identity"]') as HTMLElement;
  const d12 = first.host.querySelector('[data-testid="instructor-d12"]') as HTMLElement;
  const log = first.host.querySelector('[data-testid="instructor-log"]') as HTMLElement;
  const student = first.host.querySelector('[data-testid="instructor-student-profile"]') as HTMLElement;
  assert.ok(identity && d12 && log && student);
  assert.ok(first.host.querySelector('[data-testid="student-card-layout"]'));
  assert.ok(student.querySelector('[data-testid="card-radar"]'), 'expected the student D8 on the student card');
  const following = Node.DOCUMENT_POSITION_FOLLOWING;
  assert.equal(Boolean(identity.compareDocumentPosition(d12) & following), true);
  assert.equal(Boolean(d12.compareDocumentPosition(log) & following), true);
  assert.equal(Boolean(log.compareDocumentPosition(student) & following), true);
  assert.equal(d12.closest('[data-testid="instructor-student-profile"]'), null);
  assert.equal(student.querySelector('[data-testid="instructor-d12"]'), null);
  const empty = d12.querySelector('[data-testid="instructor-d12-empty"]');
  assert.ok(empty, 'expected a clear empty state when nothing is saved');
  assert.match(empty?.textContent ?? '', /No teaching shape ratings yet/);
  assert.equal(d12.querySelector('[data-testid="instructor-d12-visual"]'), null);
  assert.equal(d12.querySelector('[data-testid="instructor-d12-scores"]'), null);
  const pressed = [...d12.querySelectorAll('button[aria-pressed="true"]')];
  assert.equal(pressed.length, 0, 'empty state must not pre-select sample scores');
  assert.equal(JSON.stringify(INSTRUCTOR_D12_SAMPLE).includes('"preparation":5'), true);

  await click(d12.querySelector('[data-testid="instructor-d12-preparation-5"]') as HTMLElement);
  await click(d12.querySelector('[data-testid="instructor-d12-safety-4"]') as HTMLElement);
  await click(d12.querySelector('[data-testid="instructor-d12-save"]') as HTMLElement);
  assert.match(d12.textContent ?? '', /Saved/);
  assert.ok(d12.querySelector('[data-testid="instructor-d12-visual"]'));
  const savedList = d12.querySelector('[data-testid="instructor-d12-scores"]')?.textContent ?? '';
  assert.match(savedList, /Preparation\s*5/);
  assert.match(savedList, /Safety\s*4/);
  await first.unmount();

  const again = await renderSheet();
  const againD12 = again.host.querySelector('[data-testid="instructor-d12"]') as HTMLElement;
  assert.equal(againD12.querySelector('[data-testid="instructor-d12-empty"]'), null);
  const reloaded = againD12.querySelector('[data-testid="instructor-d12-scores"]')?.textContent ?? '';
  assert.match(reloaded, /Preparation\s*5/);
  assert.match(reloaded, /Safety\s*4/);
  assert.ok(again.host.querySelector('[data-testid="card-radar"]'));
  assert.equal(
    (againD12.querySelector('[data-testid="instructor-d12-preparation-5"]') as HTMLButtonElement).getAttribute(
      'aria-pressed',
    ),
    'true',
  );
  await again.unmount();
});
