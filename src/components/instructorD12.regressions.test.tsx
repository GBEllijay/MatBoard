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
import { INSTRUCTOR_PROFILE_STORAGE_KEY } from '../lib/instructorProfile.ts';
import { ASSESSMENT_STORAGE_KEY } from '../lib/studentAssessment.ts';
import { STUDENT_FILE_STORAGE_KEY } from '../lib/studentDemo.ts';
import { blankStudentReport, saveStudentReport, setStudentProfile } from '../lib/studentEdition.ts';
import { writeGymName } from '../lib/gymName.ts';
import { rememberAccountReference, forgetAccountReference } from '../lib/accountReference.ts';
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
installGlobal('HTMLSelectElement', view.HTMLSelectElement);
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
  localStorage.removeItem(INSTRUCTOR_PROFILE_STORAGE_KEY);
  localStorage.removeItem(ASSESSMENT_STORAGE_KEY);
  localStorage.removeItem(STUDENT_FILE_STORAGE_KEY);
  forgetAccountReference();
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
  assert.ok(sheet.indexOf('data-testid="instructor-record"') < sheet.indexOf('data-testid="instructor-d12-card"'));
  assert.doesNotMatch(sheet, /Belts promoted/);
  assert.doesNotMatch(sheet, /Promotion log/);
});

test('the instructor profile shows the student cards, an empty D12, and keeps saved scores', async () => {
  clearSheetStorage();
  const first = await renderSheet();
  const sheet = first.host.querySelector('[data-testid="instructor-sheet"]') as HTMLElement;
  assert.ok(sheet, 'expected the instructor profile');
  assert.equal(sheet.classList.contains('ip-preview'), true);
  assert.ok(sheet.querySelector('.ip-sheet'), 'expected the preview identity-card paint');
  const identity = first.host.querySelector('[data-testid="instructor-identity"]') as HTMLElement;
  const record = first.host.querySelector('[data-testid="instructor-record"]') as HTMLElement;
  const d12 = first.host.querySelector('[data-testid="instructor-d12"]') as HTMLElement;
  const student = first.host.querySelector('[data-testid="instructor-student-profile"]') as HTMLElement;
  assert.ok(identity && record && d12 && student);
  assert.equal(identity.contains(record), true);
  assert.ok(first.host.querySelector('[data-testid="student-card-layout"]'));
  assert.ok(student.querySelector('[data-testid="card-radar"]'), 'expected the student D8 on the student card');
  const following = Node.DOCUMENT_POSITION_FOLLOWING;
  assert.equal(Boolean(identity.compareDocumentPosition(d12) & following), true);
  assert.equal(Boolean(d12.compareDocumentPosition(student) & following), true);
  assert.equal(first.host.querySelector('[data-testid="instructor-log"]'), null);
  assert.doesNotMatch(first.host.textContent ?? '', /Belts promoted|Promotion log/);
  assert.ok(d12.querySelector('[data-testid="instructor-d12-form"]'), 'rating rows start open when nothing is saved');
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
  assert.equal(d12.querySelector('[data-testid="instructor-d12-form"]'), null);
  assert.ok(d12.querySelector('[data-testid="instructor-d12-new-assessment"]'));
  assert.equal(d12.querySelector('[data-testid="instructor-d12-scores"]'), null);
  await click(d12.querySelector('[data-testid="instructor-d12-scores-expand"]') as HTMLElement);
  const savedList = d12.querySelector('[data-testid="instructor-d12-scores"]')?.textContent ?? '';
  assert.match(savedList, /Preparation\s*5/);
  assert.match(savedList, /Safety\s*4/);
  await first.unmount();

  const again = await renderSheet();
  const againD12 = again.host.querySelector('[data-testid="instructor-d12"]') as HTMLElement;
  assert.equal(againD12.querySelector('[data-testid="instructor-d12-empty"]'), null);
  assert.equal(againD12.querySelector('[data-testid="instructor-d12-form"]'), null);
  assert.ok(againD12.querySelector('[data-testid="instructor-d12-new-assessment"]'));
  await click(againD12.querySelector('[data-testid="instructor-d12-scores-expand"]') as HTMLElement);
  const reloaded = againD12.querySelector('[data-testid="instructor-d12-scores"]')?.textContent ?? '';
  assert.match(reloaded, /Preparation\s*5/);
  assert.match(reloaded, /Safety\s*4/);
  assert.ok(again.host.querySelector('[data-testid="card-radar"]'));
  await click(againD12.querySelector('[data-testid="instructor-d12-new-assessment"]') as HTMLElement);
  assert.ok(againD12.querySelector('[data-testid="instructor-d12-form"]'));
  assert.equal(
    (againD12.querySelector('[data-testid="instructor-d12-preparation-5"]') as HTMLButtonElement).getAttribute(
      'aria-pressed',
    ),
    'true',
  );
  await again.unmount();
});

test('instructor name prefers the student profile over the academy and can be edited and reloaded', async () => {
  clearSheetStorage();
  writeGymName('Gracie Barra Ellijay');
  saveStudentReport(localStorage, setStudentProfile(blankStudentReport(), { displayName: 'Justin Guise', gymName: 'Gracie Barra Ellijay' }));
  const first = await renderSheet();
  assert.equal(first.host.querySelector('[data-testid="instructor-headline"]')?.textContent, 'Justin Guise');
  assert.equal(first.host.querySelector('[data-testid="instructor-name"]')?.textContent, 'Justin Guise');
  assert.equal(first.host.querySelector('[data-testid="instructor-academy-line"]')?.textContent?.trim(), 'Gracie Barra Ellijay');
  assert.doesNotMatch(first.host.querySelector('[data-testid="instructor-name"]')?.textContent ?? '', /Gracie Barra Ellijay/);
  await click(first.host.querySelector('[data-testid="instructor-edit"]') as HTMLElement);
  const nameInput = first.host.querySelector('[data-testid="instructor-edit-name"]') as HTMLInputElement;
  const beltSelect = first.host.querySelector('[data-testid="instructor-edit-belt"]') as HTMLSelectElement;
  assert.ok(nameInput && beltSelect);
  const typeInto = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  };
  const chooseSelect = (select: HTMLSelectElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value);
    const key = Object.keys(select).find((name) => name.startsWith('__reactProps'));
    const props = key ? (select as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: select, currentTarget: select });
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  await act(async () => {
    typeInto(nameInput, 'Maya Costa');
    chooseSelect(beltSelect, 'black');
  });
  await click(first.host.querySelector('[data-testid="instructor-edit-save"]') as HTMLElement);
  assert.equal(first.host.querySelector('[data-testid="instructor-headline"]')?.textContent, 'Maya Costa');
  assert.equal(first.host.querySelector('[data-testid="instructor-belt"]')?.textContent, 'Black belt');
  await first.unmount();

  const again = await renderSheet();
  assert.equal(again.host.querySelector('[data-testid="instructor-headline"]')?.textContent, 'Maya Costa');
  assert.equal(again.host.querySelector('[data-testid="instructor-name"]')?.textContent, 'Maya Costa');
  assert.equal(again.host.querySelector('[data-testid="instructor-belt"]')?.textContent, 'Black belt');
  assert.equal(again.host.querySelector('[data-testid="instructor-academy-line"]')?.textContent?.trim(), 'Gracie Barra Ellijay');
  await again.unmount();
});

test('the account reference is a copy control at the bottom, and the sheet is not duplicated', async () => {
  clearSheetStorage();
  writeGymName('Gracie Barra Ellijay');
  const id = 'ea5a2bee-90bd-4cf3-9a1b-e2de409f25f2';
  rememberAccountReference(id);
  const writes: string[] = [];
  Object.defineProperty(view.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value: string) => { writes.push(value); } },
  });
  installGlobal('navigator', view.navigator);
  const mounted = await renderSheet();
  assert.equal(mounted.host.querySelectorAll('[data-testid="instructor-sheet"]').length, 1);
  assert.equal(mounted.host.querySelectorAll('[data-testid="instructor-identity"]').length, 1);
  assert.equal(mounted.host.querySelector('[data-testid="account-reference"]'), null);
  assert.equal((mounted.host.textContent ?? '').includes(id), false);
  const copy = mounted.host.querySelector('[data-testid="account-reference-copy"]') as HTMLElement;
  const student = mounted.host.querySelector('[data-testid="instructor-student-profile"]') as HTMLElement;
  assert.ok(copy && student);
  assert.equal(Boolean(student.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING), true);
  await click(mounted.host.querySelector('[data-testid="account-reference-copy-btn"]') as HTMLElement);
  assert.deepEqual(writes, [id]);
  assert.match(mounted.host.querySelector('[data-testid="account-reference-copy-btn"]')?.textContent ?? '', /Copied/);
  await mounted.unmount();
});

test('Pro and Pro + Cloud do not remount the instructor identity card', () => {
  const pro = readFileSync('src/pages/Pro.tsx', 'utf8');
  const cloud = readFileSync('src/pages/ProPlusCloud.tsx', 'utf8');
  assert.doesNotMatch(pro, /InstructorSheet/);
  assert.doesNotMatch(cloud, /InstructorSheet/);
  assert.match(readFileSync('src/pages/CoachUnlimited.tsx', 'utf8'), /<InstructorSheet \/>/);
});
