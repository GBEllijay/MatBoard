/**
 * Live instructor character sheet: preview paint, student profile cards,
 * D12 empty state, save/reload of teaching-shape ratings, card delete, and toggles.
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
import { INSTRUCTOR_D12_CARDS_STORAGE_KEY } from '../lib/instructorD12Cards.ts';
import { INSTRUCTOR_D12_LINKS_STORAGE_KEY } from '../lib/instructorD12Mastery.ts';
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
  localStorage.removeItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  localStorage.removeItem(INSTRUCTOR_D12_LINKS_STORAGE_KEY);
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
  assert.match(empty?.textContent ?? '', /No teaching shape check-in yet/);
  assert.ok(d12.querySelector('[data-testid="instructor-d12-visual"]'), 'the D12 is on screen so cards can be added before a check-in');
  assert.equal(d12.querySelector('[data-testid="instructor-d12-scores"]'), null);
  const pressed = [...d12.querySelectorAll('.sheet-d12__form button[aria-pressed="true"]')];
  assert.equal(pressed.length, 0, 'empty state must not pre-select sample check-in scores');
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

test('the D12 deletes a card, shows map and cards together, toggles metrics, and never mixes the two stores', async () => {
  clearSheetStorage();
  const mounted = await renderSheet();
  const d12 = mounted.host.querySelector('[data-testid="instructor-d12"]') as HTMLElement;
  const visual = d12.querySelector('[data-testid="instructor-d12-visual"]') as HTMLElement;
  assert.ok(visual);
  assert.equal(visual.getAttribute('data-metric'), 'card-ratings');
  const metric = d12.querySelector('[data-testid="d12-shape-metric"]') as HTMLElement;
  assert.ok(metric);
  assert.equal(metric.querySelector('[data-testid="d12-metric-card-ratings"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(metric.querySelector('[data-testid="d12-metric-check-ins"]')?.textContent, 'Check-ins');

  await click(d12.querySelector('[data-testid="instructor-d12-preparation-5"]') as HTMLElement);
  await click(d12.querySelector('[data-testid="instructor-d12-safety-4"]') as HTMLElement);
  await click(d12.querySelector('[data-testid="instructor-d12-save"]') as HTMLElement);
  const checkIn = localStorage.getItem(INSTRUCTOR_D12_STORAGE_KEY);
  assert.ok(checkIn);
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY), null, 'saving a check-in does not write cards');

  const speaking = [...d12.querySelectorAll('.d8sf-face-scores button')].find((node) => node.textContent?.includes('Public Speaking')) as HTMLElement;
  assert.ok(speaking, 'expected a Public Speaking face button');
  await click(speaking);
  const readout = d12.querySelector('[data-testid="d12-face-readout"]') as HTMLElement;
  assert.ok(readout);
  assert.equal(readout.querySelector('[data-testid="d12-face-view"]'), null);
  assert.ok(readout.querySelector('[data-testid="face-pyramid"]'), 'focused face shows the 2D map');
  assert.ok(readout.querySelector('[data-testid="d12-face-card-list"]'), 'focused face shows the card list');
  const pyramid = readout.querySelector('[data-testid="face-pyramid"]') as HTMLElement;
  const list = readout.querySelector('[data-testid="d12-face-card-list"]') as HTMLElement;
  assert.equal(Boolean(pyramid.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING), true, 'map sits above the card list, like LiveD8 FaceReadout');

  const cardBtn = [...readout.querySelectorAll('[data-list-card] button')].find((node) =>
    node.textContent?.includes('Intro / end-of-class message'),
  ) as HTMLElement;
  assert.ok(cardBtn);
  await click(cardBtn);
  const dialog = d12.querySelector('[data-testid="instructor-d12-card-dialog"]') as HTMLElement;
  assert.ok(dialog);
  await click(dialog.querySelector('[data-testid="d12-card-delete"]') as HTMLElement);
  assert.match(dialog.textContent ?? '', /Remove this card/);
  await click(dialog.querySelector('[data-testid="d12-card-delete-keep"]') as HTMLElement);
  assert.ok(dialog.querySelector('[data-testid="d12-card-delete"]'));
  await click(dialog.querySelector('[data-testid="d12-card-delete"]') as HTMLElement);
  await click(dialog.querySelector('[data-testid="d12-card-delete-confirm"]') as HTMLElement);
  assert.equal(d12.querySelector('[data-testid="instructor-d12-card-dialog"]'), null);
  assert.doesNotMatch(readout.querySelector('[data-testid="d12-face-card-list"]')?.textContent ?? '', /Intro \/ end-of-class message/);
  assert.match(readout.querySelector('[data-testid="face-score"]')?.textContent ?? '', /Face score 3\.0 \/ 5/);
  const cardsFile = localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  assert.ok(cardsFile);
  assert.equal(cardsFile.includes('intro-end-of-class-message'), false);
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_STORAGE_KEY), checkIn, 'deleting a card does not rewrite the check-in');

  const cardsBeforeMetric = localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  await click(metric.querySelector('[data-testid="d12-metric-check-ins"]') as HTMLElement);
  assert.equal(visual.getAttribute('data-metric'), 'check-ins');
  assert.equal(metric.querySelector('[data-testid="d12-metric-check-ins"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY), cardsBeforeMetric);
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_STORAGE_KEY), checkIn);
  await click(metric.querySelector('[data-testid="d12-metric-card-ratings"]') as HTMLElement);
  assert.equal(visual.getAttribute('data-metric'), 'card-ratings');
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY), cardsBeforeMetric);
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_STORAGE_KEY), checkIn);
  await mounted.unmount();
});

function typeIn(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  let proto: object | null = Object.getPrototypeOf(node);
  while (proto && !Object.getOwnPropertyDescriptor(proto, 'value')) proto = Object.getPrototypeOf(proto);
  if (proto) Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(node, value);
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  const props = key ? (node as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
  props?.onChange?.({ target: node, currentTarget: node });
}

test('the D12 add form uses a visible face picker, and the card sheet mirrors the D8 card with Path to Mastery', async () => {
  clearSheetStorage();
  const mounted = await renderSheet();
  const d12 = mounted.host.querySelector('[data-testid="instructor-d12"]') as HTMLElement;
  const visual = d12.querySelector('[data-testid="instructor-d12-visual"]') as HTMLElement;
  assert.equal(visual.getAttribute('data-xray'), 'off');
  assert.equal(visual.getAttribute('data-branches'), 'off');

  // 1. The add form: twelve face chips instead of a dim select.
  await click(d12.querySelector('[data-testid="d12-add-card"]') as HTMLElement);
  let dialog = d12.querySelector('[data-testid="instructor-d12-card-dialog"]') as HTMLElement;
  assert.ok(dialog.classList.contains('d8-live-sheet'), 'uses the same cream sheet as the D8 card');
  assert.equal(dialog.querySelector('[data-testid="d12-new-card-face"]'), null);
  const picker = dialog.querySelector('[data-testid="d12-face-picker"]') as HTMLElement;
  assert.ok(picker);
  assert.equal(picker.getAttribute('data-prompt'), 'true');
  assert.match(picker.querySelector('legend')?.textContent ?? '', /D12 face/);
  assert.equal(picker.querySelectorAll('[data-face-pick]').length, 12);
  await click(picker.querySelector('[data-face-pick="energy"]') as HTMLElement);
  assert.equal(picker.querySelector('[data-face-pick="energy"]')?.getAttribute('aria-pressed'), 'true');
  await act(async () => typeIn(dialog.querySelector('[data-testid="d12-new-card-name"]') as HTMLInputElement, 'Warm-up tempo'));
  await click(dialog.querySelector('[data-testid="d12-new-card-save"]') as HTMLElement);
  assert.equal(d12.querySelector('[data-testid="instructor-d12-card-dialog"]'), null);
  const afterAdd = localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY) ?? '';
  assert.match(afterAdd, /Warm-up tempo/);
  assert.match(afterAdd, /"faceId":"energy"/);

  // 2. Open a starter card from its face.
  const speaking = [...d12.querySelectorAll('.d8sf-face-scores button')].find((node) => node.textContent?.includes('Public Speaking')) as HTMLElement;
  await click(speaking);
  const readout = d12.querySelector('[data-testid="d12-face-readout"]') as HTMLElement;
  assert.match(readout.querySelector('[data-testid="d12-face-definition"]')?.textContent ?? '', /Talking to a room/);
  const intro = [...readout.querySelectorAll('[data-list-card] button')].find((node) => node.textContent?.includes('Intro / end-of-class message')) as HTMLElement;
  await click(intro);
  dialog = d12.querySelector('[data-testid="instructor-d12-card-dialog"]') as HTMLElement;
  assert.match(dialog.querySelector('.d8sf-index-face')?.textContent ?? '', /D12 face\s*Public Speaking/);
  const tag = dialog.querySelector('[data-testid="d12-glossary-tag"]') as HTMLElement;
  assert.ok(tag, 'instructor glossary tag');
  assert.match(tag.textContent ?? '', /Glossary/);
  assert.match(tag.textContent ?? '', /short opening and closing talk/);
  assert.ok(dialog.querySelector('[data-testid="d12-card-edit-open"]'));
  assert.equal(dialog.querySelector('[data-testid="d12-card-edit-open"]')?.textContent, 'Rename or move');
  const path = dialog.querySelector('[data-testid="d12-card-path"]') as HTMLElement;
  assert.equal(path.querySelector('h3')?.textContent, 'Path to Mastery');
  assert.match(path.querySelector('[data-testid="d12-card-path-empty"]')?.textContent ?? '', /No Path to Mastery connections/);
  assert.deepEqual(
    [...path.querySelectorAll('[data-relation]')].map((node) => node.textContent),
    ['Connects to', 'Builds on', 'Supports'],
  );
  assert.equal(path.querySelector('[data-relation="connects"]')?.getAttribute('aria-checked'), 'true');
  assert.equal(dialog.querySelector('[aria-label="Journal"]'), null, 'no instructor journal yet');
  assert.ok(dialog.querySelector('[data-testid="d12-card-notes"]'));
  assert.ok(dialog.querySelector('[data-testid="d12-card-videos"]'));
  assert.ok(dialog.querySelector('[data-testid="d12-card-delete"]'));

  const cardsBefore = localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  // 3. Builds on Lesson plan, then Connects to the Time Management face.
  await click(path.querySelector('[data-relation="builds-on"]') as HTMLElement);
  const search = path.querySelector('[data-testid="d12-card-path-search"]') as HTMLInputElement;
  await act(async () => typeIn(search, 'lesson'));
  await click(path.querySelector('[data-connect="starter.preparation.lesson-plan-video-review"]') as HTMLElement);
  await click(path.querySelector('[data-relation="connects"]') as HTMLElement);
  await act(async () => typeIn(path.querySelector('[data-testid="d12-card-path-search"]') as HTMLInputElement, 'time'));
  await click(path.querySelector('[data-connect="face:time-management"]') as HTMLElement);
  const linksRaw = localStorage.getItem(INSTRUCTOR_D12_LINKS_STORAGE_KEY) ?? '';
  const saved = JSON.parse(linksRaw) as { linksBySeat: Record<string, { from: string; to: string; relation: string }[]> };
  const rows = Object.values(saved.linksBySeat)[0] ?? [];
  assert.deepEqual(rows, [
    { from: 'starter.preparation.lesson-plan-video-review', to: 'starter.public-speaking.intro-end-of-class-message', relation: 'connects' },
    { from: 'starter.public-speaking.intro-end-of-class-message', to: 'face:time-management', relation: 'connects' },
  ]);
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY), cardsBefore, 'connections never rewrite the card file');
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_STORAGE_KEY), null, 'connections never write the check-in');
  assert.match(path.querySelector('[data-testid="d12-path-builds-on"]')?.textContent ?? '', /Lesson plan \/ video review/);
  assert.match(path.querySelector('[data-testid="d12-path-connects"]')?.textContent ?? '', /Time Management/);

  // 4. Notes save on the card only.
  const notes = dialog.querySelector('[data-testid="d12-card-notes-input"]') as HTMLTextAreaElement;
  await act(async () => typeIn(notes, 'Two minutes, max.'));
  await click(dialog.querySelector('[data-testid="d12-card-notes-save"]') as HTMLElement);
  assert.match(localStorage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY) ?? '', /Two minutes, max\./);
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_LINKS_STORAGE_KEY), linksRaw, 'notes never rewrite the links');

  // 5. Rename or move opens the same face picker.
  await click(dialog.querySelector('[data-testid="d12-card-edit-open"]') as HTMLElement);
  const edit = dialog.querySelector('[data-testid="d12-card-edit"]') as HTMLElement;
  assert.equal(edit.querySelector('[data-face-pick="public-speaking"]')?.getAttribute('aria-pressed'), 'true');

  // 6. View on Path to Mastery: branches, X-ray, and the chain through this card.
  await click(dialog.querySelector('[data-testid="d12-view-on-path"]') as HTMLElement);
  assert.equal(d12.querySelector('[data-testid="instructor-d12-card-dialog"]'), null);
  assert.equal(visual.getAttribute('data-branches'), 'on');
  assert.equal(visual.getAttribute('data-xray'), 'on');
  assert.match(visual.getAttribute('data-chain') ?? '', /^chain:/);
  assert.equal(d12.querySelector('[data-testid="d12-chain"]')?.getAttribute('aria-pressed'), 'true');
  assert.equal(d12.querySelector('[data-testid="d12-chain"]')?.textContent, 'Stop chain');
  assert.match(d12.querySelector('[data-testid="d12-path-note"]')?.textContent ?? '', /Lesson plan \/ video review → Intro \/ end-of-class message → Time Management/);
  assert.match(d12.querySelector('[data-testid="d12-branches-note"]')?.textContent ?? '', /2 branches from your Path to Mastery connections/);
  assert.equal(d12.querySelector('[data-testid="d12-xray"]')?.hasAttribute('disabled'), true);
  await click(d12.querySelector('[data-testid="d12-chain"]') as HTMLElement);
  assert.equal(d12.querySelector('[data-testid="d12-chain"]')?.textContent, 'Follow the chain');
  await click(d12.querySelector('[data-testid="d12-branches"]') as HTMLElement);
  assert.equal(visual.getAttribute('data-xray'), 'off');
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_LINKS_STORAGE_KEY), linksRaw, 'viewing never writes');
  assert.equal(localStorage.getItem(INSTRUCTOR_D12_STORAGE_KEY), null);
  await mounted.unmount();
});
