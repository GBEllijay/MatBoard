/**
 * Isolated instructor profile preview. Counting, the sample estimate,
 * and the 15-minute class length. No student, academy, or lesson-plan storage.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { matQuarterOptions } from '../../lib/matHours.ts';
import { InstructorProfilePreviewPage } from './InstructorProfilePreview.tsx';
import {
  INSTRUCTOR,
  PREVIEW_PATH,
  PREVIEW_STORAGE_KEYS,
  SHEET_TITLE,
  estimatedClasses,
  estimatedHours,
  logLessonHours,
  promotionKey,
  sampleClasses,
  sampleEstimate,
  samplePlan,
  sampleUpdates,
  teachingDurationOptions,
  teachingTallies,
  teachingYears,
  weekMinutes,
} from './model.ts';

const dom = new Window({ url: 'http://localhost/preview/instructor-profile' });
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
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[PREVIEW_PATH]}>{node}</MemoryRouter>);
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

function typeInto(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function pickTime(label: string, option: string) {
  const opener = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label')?.startsWith(`${label},`));
  assert.ok(opener, label);
  click(opener as HTMLElement);
  const lists = [...document.querySelectorAll(`[role="listbox"][aria-label="${label}"]`)];
  const list = lists[lists.length - 1];
  assert.ok(list, `${label} wheel`);
  const row = [...list.querySelectorAll('[role="option"]')].find((node) => node.textContent?.trim() === option);
  assert.ok(row, option);
  click(row as HTMLElement);
  const sheet = list.closest('[role="dialog"]') ?? document.body;
  const done = [...sheet.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Done');
  if (done) click(done as HTMLElement);
}

test('teaching duration options are the student 15-minute wheel, not 30-second or 1-second steps', () => {
  const options = teachingDurationOptions();
  assert.deepEqual(options, matQuarterOptions());
  assert.equal(options[0]?.label, 'Untimed');
  assert.ok(options.every((option) => option.value % 15 === 0));
  assert.equal(options.some((option) => option.value === 0.5), false);
  assert.equal(options.find((option) => option.label === '1:00')?.value, 60);
  assert.equal(options.find((option) => option.label === '1:15')?.value, 75);
  assert.equal(options.some((option) => option.label === '1:01'), false);
});

test('pending and declined promotions do not count, and a retry counts once', () => {
  const rows = sampleUpdates();
  assert.deepEqual(teachingTallies(rows), { stripes: 2, belts: 1 });
  const retry = rows.filter((row) => promotionKey(row) === promotionKey(rows[1]));
  assert.equal(retry.length, 2);
  assert.equal(retry.filter((row) => row.status === 'applied').length, 1);
  const doubled = teachingTallies([
    ...rows,
    { ...rows[2], id: 'noah-again', attempt: 3, stripeFrom: 0, stripeTo: 1 },
  ]);
  assert.deepEqual(doubled, { stripes: 2, belts: 1 });
  const pendingOnly = teachingTallies(rows.map((row) => ({ ...row, status: 'pending' as const })));
  assert.deepEqual(pendingOnly, { stripes: 0, belts: 0 });
});

test('the sample estimate is 13 × 52 × 3 = 2028, and 2028 hours only at 1 hour', () => {
  const estimate = sampleEstimate();
  assert.equal(teachingYears(estimate.teachingAroundYear), 13);
  assert.equal(teachingYears(INSTRUCTOR.officialStartYear), 3);
  assert.equal(estimatedClasses(estimate), 13 * 52 * 3);
  assert.equal(estimatedClasses(estimate), 2028);
  assert.equal(estimatedHours(2028, 60), 2028);
  assert.equal(estimatedHours(2028, 75), 2535);
  assert.equal(estimatedClasses({ ...estimate, teachingAroundYear: INSTRUCTOR.officialStartYear }), 3 * 52 * 3);
  assert.notEqual(estimatedClasses({ ...estimate, teachingAroundYear: INSTRUCTOR.officialStartYear }), 2028);
});

test('logging a class length adds it once, and editing the length replaces it', () => {
  const plan = samplePlan();
  const start = sampleClasses();
  assert.equal(weekMinutes(start, '2026-11-02'), 195);
  const added = logLessonHours(start, { ...plan, minutes: 60 });
  assert.equal(added.outcome, 'added');
  assert.equal(weekMinutes(added.classes, '2026-11-02'), 255);
  const again = logLessonHours(added.classes, { ...plan, minutes: 60 });
  assert.equal(again.outcome, 'unchanged');
  assert.equal(again.classes.filter((row) => row.planId === plan.planId).length, 1);
  const edited = logLessonHours(again.classes, { ...plan, minutes: 90 });
  assert.equal(edited.outcome, 'replaced');
  assert.equal(weekMinutes(edited.classes, '2026-11-02'), 285);
  const cleared = logLessonHours(edited.classes, { ...plan, minutes: 0 });
  assert.equal(cleared.outcome, 'removed');
  assert.equal(weekMinutes(cleared.classes, '2026-11-02'), 195);
});

test('the preview page keeps logged hours, the estimate, and approval status apart', () => {
  const page = readFileSync('src/preview/instructorProfile/InstructorProfilePreview.tsx', 'utf8');
  const model = readFileSync('src/preview/instructorProfile/model.ts', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const hub = readFileSync('src/lib/studentHubMenu.ts', 'utf8');
  assert.equal(page.includes('setPlanTaught'), false);
  assert.equal(page.includes('saveStudentReport'), false);
  assert.equal(page.includes('writeGymProfile'), false);
  assert.equal(page.includes('EXPECTED_MINUTE_OPTIONS'), false);
  assert.equal(model.includes('localStorage'), false);
  assert.match(app, /path="\/preview\/instructor-profile"/);
  assert.equal(hub.includes(PREVIEW_PATH), false);
  assert.equal(page.includes('jspdf'), false);

  const mounted = mount(<InstructorProfilePreviewPage />);
  const text = mounted.host.textContent ?? '';
  assert.equal(mounted.host.querySelector('[data-testid="sheet-title"]')?.textContent, SHEET_TITLE);
  assert.match(text, /A black belt is not a requirement/);
  assert.match(text, /Brown/);
  assert.match(text, /Sam Okonkwo \(fictional\)/);
  assert.match(text, /defaults off/);
  assert.match(text, /does not have Log hours/);
  assert.equal(mounted.host.querySelector('[data-testid="stripes-given"] strong')?.textContent, '2');
  assert.equal(mounted.host.querySelector('[data-testid="belts-given"] strong')?.textContent, '1');
  assert.equal(mounted.host.querySelector('[data-testid="estimated-classes"]')?.textContent, '2028');
  assert.match(mounted.host.querySelector('[data-testid="estimated-hours"]')?.textContent ?? '', /2028/);
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /195 min/);
  assert.equal(mounted.host.querySelectorAll('[data-status="pending"]').length, 2);
  assert.equal(mounted.host.querySelectorAll('[data-status="applied"]').length, 3);
  assert.equal(mounted.host.querySelectorAll('[data-status="declined"]').length, 2);
  const waitingParent = [...mounted.host.querySelectorAll('[data-status="pending"]')].filter((row) => row.getAttribute('data-parent') === 'on');
  const waitingStudent = [...mounted.host.querySelectorAll('[data-status="pending"]')].filter((row) => row.getAttribute('data-parent') === 'off');
  assert.equal(waitingParent.length, 1);
  assert.equal(waitingStudent.length, 1);

  click(mounted.host.querySelector('[data-testid="lineage-switch"]') as HTMLElement);
  assert.equal(mounted.host.querySelector('[data-testid="lineage-text"]'), null);
  assert.equal(INSTRUCTOR.lineage.length, 3);
  click(mounted.host.querySelector('[data-testid="lineage-switch"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="lineage-text"]')?.textContent ?? '', /Professor Lena Cho/);

  click(mounted.host.querySelector('[data-testid="log-hours"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /255 min/);
  click(mounted.host.querySelector('[data-testid="log-hours"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="log-note"]')?.textContent ?? '', /Not counted twice/);
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /255 min/);
  pickTime('Class length', '1:30');
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /285 min/);
  assert.equal(mounted.host.querySelectorAll('[data-testid="log-hours"]').length, 1);

  typeInto(mounted.host.querySelector('[aria-label="Official start"]') as HTMLInputElement, '2020');
  assert.equal(mounted.host.querySelector('[data-testid="estimated-classes"]')?.textContent, '2028');
  assert.match(mounted.host.querySelector('[data-testid="estimate-formula"]')?.textContent ?? '', /Official start 2020 is not in that formula/);

  typeInto(mounted.host.querySelector('[aria-label="Active weeks a year"]') as HTMLInputElement, '40');
  assert.equal(mounted.host.querySelector('[data-testid="estimated-classes"]')?.textContent, String(13 * 40 * 3));
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /285 min/);

  pickTime('Example class length', '1:15');
  assert.equal(mounted.host.querySelector('[data-testid="estimated-classes"]')?.textContent, String(13 * 40 * 3));
  assert.match(mounted.host.querySelector('[data-testid="estimated-hours"]')?.textContent ?? '', /1950/);
  assert.match(mounted.host.querySelector('[data-testid="logged-hours"]')?.textContent ?? '', /285 min/);

  for (const key of PREVIEW_STORAGE_KEYS) assert.equal(localStorage.getItem(key), null, key);
  unmount(mounted);
});
