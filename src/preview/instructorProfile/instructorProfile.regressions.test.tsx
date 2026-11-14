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
  combinedHours,
  estimatedClasses,
  estimatedHours,
  formatHourCount,
  instructionBackupPreview,
  loggedMinutesTotal,
  logLessonHours,
  previewInstructionRestore,
  promotionKey,
  studentIdentity,
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

test('teaching duration options are the student 15-minute wheel, not the 15-second lesson timer', () => {
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
  assert.deepEqual(teachingTallies(rows), { stripes: 24, belts: 7 });
  const retryKey = promotionKey(rows.find((row) => row.id === 'done-stripe-0-declined') ?? rows[0]);
  const retry = rows.filter((row) => promotionKey(row) === retryKey);
  assert.equal(retry.length, 2);
  assert.equal(retry.filter((row) => row.status === 'applied').length, 1);
  const doubled = teachingTallies([...rows, { ...retry[1], id: 'stripe-again', attempt: 3 }]);
  assert.deepEqual(doubled, { stripes: 24, belts: 7 });
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
  assert.equal(loggedMinutesTotal(sampleClasses()), 36 * 60);
  assert.equal(combinedHours(2028, 36 * 60), 2064);
  assert.equal(formatHourCount(2064), '2,064');
  assert.equal(estimatedClasses({ ...estimate, teachingAroundYear: INSTRUCTOR.officialStartYear }), 3 * 52 * 3);
  assert.notEqual(estimatedClasses({ ...estimate, teachingAroundYear: INSTRUCTOR.officialStartYear }), 2028);
});

test('logging a class length adds it once, and editing the length replaces it', () => {
  const plan = samplePlan();
  const start = sampleClasses();
  assert.equal(weekMinutes(start, '2026-11-02'), 180);
  const added = logLessonHours(start, { ...plan, minutes: 60 });
  assert.equal(added.outcome, 'added');
  assert.equal(weekMinutes(added.classes, '2026-11-02'), 240);
  const again = logLessonHours(added.classes, { ...plan, minutes: 60 });
  assert.equal(again.outcome, 'unchanged');
  assert.equal(again.classes.filter((row) => row.planId === plan.planId).length, 1);
  const edited = logLessonHours(again.classes, { ...plan, minutes: 90 });
  assert.equal(edited.outcome, 'replaced');
  assert.equal(weekMinutes(edited.classes, '2026-11-02'), 270);
  const cleared = logLessonHours(edited.classes, { ...plan, minutes: 0 });
  assert.equal(cleared.outcome, 'removed');
  assert.equal(weekMinutes(cleared.classes, '2026-11-02'), 180);
});

test('an instruction restore keeps student identity and a PDF restores nothing', () => {
  const identity = studentIdentity();
  const pdf = previewInstructionRestore('%PDF-1.4 INSTRUCTOR PROFILE AND STAT SHEET', identity);
  assert.equal(pdf.ok, false);
  assert.match(pdf.detail, /does not restore/);
  assert.deepEqual(pdf.kept, identity);
  const student = previewInstructionRestore('{"advantage":"student-journal-backup","version":1}', identity);
  assert.equal(student.ok, false);
  assert.match(student.detail, /not replaced/);
  const instruction = previewInstructionRestore(
    JSON.stringify({ advantage: 'instructor-teaching-backup', version: 1, displayName: 'Someone Else' }),
    identity,
  );
  assert.equal(instruction.ok, true);
  assert.match(instruction.detail, /Someone Else/);
  assert.equal(instruction.kept.name, identity.name);
  assert.equal(instruction.kept.trainingStart, '2014-03-01');
  const file = instructionBackupPreview({
    estimate: sampleEstimate(),
    classes: sampleClasses(),
    notes: '',
    stripesGiven: 24,
    promotionsGiven: 7,
  });
  assert.equal(file.advantage, 'instructor-teaching-backup');
  assert.equal(file.fictional, true);
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
  const belt = mounted.host.querySelector('.belt-header--brown');
  const card = mounted.host.querySelector('[data-testid="stat-card"]');
  const lesson = mounted.host.querySelector('[data-testid="lesson-plan"]');
  assert.ok(belt && card && lesson);
  assert.ok(belt.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(card.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(mounted.host.querySelector('[data-testid="sheet-title"]')?.textContent, SHEET_TITLE);
  assert.match(text, /A black belt is not a requirement/);
  assert.match(text, /does not have Log hours/);
  assert.equal(text.includes('Coach Notes'), false);
  assert.match(mounted.host.querySelector('[data-testid="teaching-since"]')?.textContent ?? '', /c\. 2013/);
  assert.equal((mounted.host.querySelector('[data-testid="teaching-since"]')?.textContent ?? '').includes('2014-03-01'), false);
  assert.match(text, /Training start 2014-03-01/);
  assert.equal(mounted.host.querySelector('[data-testid="stripes-given"]'), null);
  assert.equal(mounted.host.querySelector('[data-testid="belts-given"]'), null);
  assert.equal((mounted.host.querySelector('[data-testid="stat-card"]')?.textContent ?? '').includes('Stripes given'), false);
  assert.equal((mounted.host.querySelector('[data-testid="stat-card"]')?.textContent ?? '').includes('Promotions given'), false);
  assert.match(mounted.host.querySelector('[data-testid="teaching-years"]')?.textContent ?? '', /13 years/);
  assert.equal(mounted.host.querySelector('[data-testid="combined-hours"]')?.textContent, '2,064 h');
  assert.equal(mounted.host.querySelector('[data-testid="logged-hours"]')?.textContent, '36');
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /180 min/);
  assert.equal(mounted.host.querySelectorAll('[data-status="pending"]').length, 1);
  assert.equal(mounted.host.querySelectorAll('[data-status="applied"]').length, 3);
  assert.equal(mounted.host.querySelectorAll('[data-status="declined"]').length, 1);

  click(mounted.host.querySelector('[data-testid="lineage-switch"]') as HTMLElement);
  assert.equal(mounted.host.querySelector('[data-testid="lineage-text"]'), null);
  assert.equal(INSTRUCTOR.lineage.length, 4);
  click(mounted.host.querySelector('[data-testid="lineage-switch"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="lineage-text"]')?.textContent ?? '', /Mestre Aurelio Vance/);

  click(mounted.host.querySelector('[data-testid="log-hours"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /240 min/);
  assert.equal(mounted.host.querySelector('[data-testid="logged-hours"]')?.textContent, '37');
  click(mounted.host.querySelector('[data-testid="log-hours"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="log-note"]')?.textContent ?? '', /Not counted twice/);
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /240 min/);
  pickTime('Class length', '1:30');
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /270 min/);

  typeInto(mounted.host.querySelector('[aria-label="Official start"]') as HTMLInputElement, '2020');
  assert.equal(mounted.host.querySelector('[data-testid="estimated-classes"]')?.textContent, '2,028');
  assert.match(mounted.host.querySelector('[data-testid="estimate-formula"]')?.textContent ?? '', /Official start 2020 is not in that formula/);
  assert.match(mounted.host.querySelector('[data-testid="teaching-since"]')?.textContent ?? '', /Official: 2020/);

  typeInto(mounted.host.querySelector('[aria-label="Active weeks a year"]') as HTMLInputElement, '40');
  assert.equal(mounted.host.querySelector('[data-testid="estimated-classes"]')?.textContent, '1,560');
  assert.match(mounted.host.querySelector('[data-testid="week-total"]')?.textContent ?? '', /270 min/);

  click(mounted.host.querySelector('[data-testid="try-pdf"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="restore-note"]')?.textContent ?? '', /does not restore/);
  click(mounted.host.querySelector('[data-testid="try-student-backup"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="restore-note"]')?.textContent ?? '', /not replaced/);
  click(mounted.host.querySelector('[data-testid="try-instruction-backup"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="restore-note"]')?.textContent ?? '', /Someone Else/);
  assert.match(mounted.host.querySelector('[data-testid="restore-note"]')?.textContent ?? '', /Example Instructor/);
  click(mounted.host.querySelector('[data-testid="preview-backup"]') as HTMLElement);
  assert.match(mounted.host.querySelector('[data-testid="backup-note"]')?.textContent ?? '', /Not downloaded/);

  for (const key of PREVIEW_STORAGE_KEYS) assert.equal(localStorage.getItem(key), null, key);
  unmount(mounted);
});

test('the live instructor identity card no longer displays promotions or stripes given', () => {
  const sheet = readFileSync('src/components/InstructorSheet.tsx', 'utf8');
  const identity = readFileSync('src/preview/instructorProfile/InstructorIdentityCard.tsx', 'utf8');
  assert.match(sheet, /Classes taught/);
  assert.match(sheet, /Hours taught/);
  assert.equal(sheet.includes('Promotions awarded'), false);
  assert.equal(sheet.includes('Stripes given'), false);
  assert.equal(identity.includes('Stripes given'), false);
  assert.equal(identity.includes('Promotions given'), false);
  assert.match(identity, /Length of time teaching/);
  assert.doesNotMatch(sheet, /Promotion log/);
  assert.doesNotMatch(sheet, /Belts promoted/);
  assert.match(sheet, />Record</);
  assert.match(sheet, /Mark past plans as taught/);
  // Stored tallies stay in the model. The live sheet no longer shows a promotion log.
  assert.match(readFileSync('src/preview/instructorProfile/model.ts', 'utf8'), /export function teachingTallies/);
});
