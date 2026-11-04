/**
 * Mat hours: student-logged time on journal cards, and the belt-cloth total.
 * Controls touched: Journal (today's page) Save entry, Class field, all fields;
 * Journal card Edit / Save card / Cancel edit / Delete; hub My profile row;
 * Preview my card sheet. New: session chips, quick time chips, − / + stepper, Clear.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { exportProgressPacket, parseProgressPacket } from '../../lib/progress/format.ts';
import { StudentEditionPage } from '../StudentEdition.tsx';
import { MatHoursStat } from './MatTime.tsx';

const dom = new Window({ url: 'http://localhost/student/journal?student=1' });
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
installGlobal('HTMLSelectElement', view.HTMLSelectElement);
installGlobal('HTMLFormElement', view.HTMLFormElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('FormData', view.FormData);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  );
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function field(host: ParentNode, name: string): HTMLInputElement | HTMLTextAreaElement {
  const byAria = host.querySelector(`[aria-label="${name}"]`);
  if (byAria instanceof HTMLInputElement || byAria instanceof HTMLTextAreaElement) return byAria;
  const label = [...host.querySelectorAll('label')].find((node) => node.querySelector('.ink__label')?.textContent === name);
  const control = label?.querySelector('input, textarea');
  assert.ok(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement, name);
  return control;
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function seed(belt = 'white', extra: Partial<Parameters<typeof addJournalEntry>[1]> = {}) {
  localStorage.clear();
  const report = blankStudentReport(10);
  report.profile.belt = belt as typeof report.profile.belt;
  const next = addJournalEntry(
    report,
    { date: '2026-10-11', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', ...extra },
    10,
  );
  saveStudentReport(localStorage, next);
  return next;
}

test('log sheet: session chips, quick chips, stepper, clear, quality and marks save to the card', () => {
  localStorage.clear();
  const mounted = mount(<StudentEditionPage />, '/student/journal?date=2026-10-11&student=1');
  const { host } = mounted;
  // Existing controls still there.
  for (const name of ['Class', 'Training partners', 'Drills', 'Rolls', 'Drill notes', 'Stop doing']) field(host, name);
  assert.ok(control(host, 'button', 'Save entry'));
  const kinds = labeled(host, 'Session type');
  assert.equal(control(kinds, 'button', 'Class').getAttribute('aria-pressed'), 'true');
  click(control(kinds, 'button', 'Open mat'));
  assert.equal(control(kinds, 'button', 'Open mat').getAttribute('aria-pressed'), 'true');
  const out = labeled(host, 'Minutes on the mat');
  assert.equal(out.textContent, 'Untimed');
  const quick = labeled(host, 'Quick time');
  click(control(quick, 'button', '1h 30m'));
  assert.equal(out.textContent, '1:30');
  click(control(quick, 'button', '1h 30m'));
  assert.equal(out.textContent, 'Untimed');
  click(control(quick, 'button', '1h'));
  click(labeled(host, 'More time'));
  assert.equal(out.textContent, '1:15');
  click(labeled(host, 'Less time'));
  click(labeled(host, 'Less time'));
  assert.equal(out.textContent, '0:45');
  click(control(host, 'button', 'Clear'));
  assert.equal(out.textContent, 'Untimed');
  click(control(quick, 'button', '2h'));
  click(control(labeled(host, 'Session quality'), 'button', 'Learned something'));
  click(control(labeled(host, 'Mark card'), 'button', 'Injury'));
  typeInto(field(host, 'Injury area'), 'Left knee');
  click(control(host, 'button', 'Save entry'));
  const stored = loadStudentReport(localStorage).journal;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].minutes, 120);
  assert.equal(stored[0].session, 'openMat');
  assert.equal(stored[0].quality, 3);
  assert.deepEqual(stored[0].injury, { area: 'Left knee', note: '' });
  // Reset after save.
  assert.equal(labeled(host, 'Minutes on the mat').textContent, 'Untimed');
  assert.equal(host.querySelector('[aria-label="Injury area"]'), null);
  unmount(mounted);
});

test('break mark saves start and end; card shows it; old untimed cards say untimed', () => {
  seed();
  const mounted = mount(<StudentEditionPage />, '/student/journal?date=2026-10-12&student=1');
  const { host } = mounted;
  click(control(labeled(host, 'Mark card'), 'button', 'Break / hiatus'));
  click(control(labeled(host, 'Break reason'), 'button', 'Medical'));
  typeInto(field(host, 'Break end'), '2026-10-30');
  click(control(host, 'button', 'Save entry'));
  const stored = loadStudentReport(localStorage).journal;
  assert.deepEqual(stored[1].hiatus, { reason: 'medical', start: '2026-10-12', end: '2026-10-30' });
  unmount(mounted);
  const card = mount(<StudentEditionPage />, `/student/cards/${stored[0].id}?student=1`);
  assert.equal(card.host.querySelector('[data-testid="card-mat-time"]')?.textContent, 'Class · untimed');
  unmount(card);
  const brk = mount(<StudentEditionPage />, `/student/cards/${stored[1].id}?student=1`);
  assert.match(brk.host.querySelector('[data-testid="card-hiatus"]')?.textContent ?? '', /Medical break · 2026-10-12 to 2026-10-30/);
  unmount(brk);
});

test('editing a card updates mat time and the total; other fields stay', () => {
  const report = seed('blue', { minutes: 60 });
  const id = report.journal[0].id;
  const mounted = mount(<StudentEditionPage />, `/student/cards/${id}?student=1`);
  const { host } = mounted;
  assert.equal(host.querySelector('[data-testid="card-mat-time"]')?.textContent, 'Class · 1h on the mat');
  const edit = [...host.querySelectorAll('a, button')].find((b) => /^Edit /.test(b.textContent?.trim() ?? ''));
  assert.ok(edit, 'Edit button');
  click(edit as HTMLElement);
  click(labeled(host, 'Edit More time'));
  click(labeled(host, 'Edit More time'));
  // Blue belt wording.
  assert.ok(control(labeled(host, 'Edit Session quality'), 'button', 'Solid flow'));
  click(control(host, 'button', 'Save card'));
  const stored = loadStudentReport(localStorage).journal[0];
  assert.equal(stored.minutes, 90);
  assert.equal(host.querySelector('[data-testid="card-mat-time"]')?.textContent, 'Class · 1h 30m on the mat');
  unmount(mounted);
});

test('total stat wears the belt cloth on white, blue, purple, black and toggles to days', () => {
  for (const [belt, rung, ink] of [
    ['white', 'rung--white', 'dark'],
    ['blue', 'rung--blue', 'light'],
    ['purple', 'rung--purple', 'light'],
    ['black', 'rung--black', 'light'],
  ] as const) {
    const report = seed(belt, { minutes: 90 });
    const mounted = mount(<MatHoursStat report={report} />, '/');
    const stat = mounted.host.querySelector('[data-testid="mat-hours"]') as HTMLElement;
    assert.equal(stat.dataset.ink, ink, belt);
    assert.ok(stat.querySelector(`.${rung}`), belt);
    const value = stat.querySelector('.mat-hours__value') as HTMLElement;
    assert.equal(value.textContent, '1.5 mat hours');
    click(value);
    assert.equal(value.textContent, '0.1 days on the mat');
    click(value);
    assert.equal(value.textContent, '1.5 mat hours');
    unmount(mounted);
  }
});

test('hub has no mat hours tile; profile shows stat, streak and report link; report shows streak, status and source labels', () => {
  seed('purple', { minutes: 60, injury: { area: 'Shoulder', note: '' } });
  const hub = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(hub.host.querySelector('[data-testid="mat-hours"]'), null);
  assert.equal(hub.host.querySelector('[aria-label="My report card"]'), null);
  assert.ok(labeled(hub.host, 'My profile'));
  unmount(hub);
  const profile = mount(<StudentEditionPage />, '/student/profile?student=1');
  const section = profile.host.querySelector('[data-testid="profile-mat-hours"]') as HTMLElement;
  assert.ok(section);
  assert.match(section.querySelector('[data-testid="mat-hours"]')?.textContent ?? '', /1 mat hour|1\.0 mat hours|mat hour/);
  assert.match(section.querySelector('[data-testid="profile-streak"]')?.textContent ?? '', /of 2 sessions|paused/);
  assert.equal(labeled(section, 'My report card').getAttribute('href'), '/student/report?student=1');
  unmount(profile);
  const page = mount(<StudentEditionPage />, '/student/report?student=1');
  const report = page.host.querySelector('[data-testid="profile-report"]');
  assert.ok(report);
  assert.match(report.textContent ?? '', /From your journal/);
  assert.match(report.textContent ?? '', /From you/);
  assert.match(page.host.querySelector('[data-testid="report-streak"]')?.textContent ?? '', /of 2 sessions/);
  assert.match(page.host.querySelector('[data-testid="report-status"]')?.textContent ?? '', /Shoulder|Training/);
  click(control(labeled(page.host, 'Weekly goal'), 'button', '3 sessions'));
  assert.equal(localStorage.getItem('matboard.student.streakTarget.v1'), '3');
  assert.match(page.host.querySelector('[data-testid="report-streak"]')?.textContent ?? '', /of 3 sessions/);
  assert.equal(page.host.querySelector('[data-testid="report-weight"]'), null);
  unmount(page);
});

test('backup carries mat time', () => {
  const report = seed('white', { minutes: 45, session: 'openMat' });
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.ok(parsed.ok);
  if (parsed.ok) assert.equal(parsed.value.journal[0].minutes, 45);
});

test('profile card stat: tap opens quick-add; save updates the same day record and the units chip toggles', () => {
  seed('blue', { minutes: 60 });
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const stat = page.host.querySelector('[data-testid="profile-mat-hours"]') as HTMLElement;
  assert.ok(stat);
  click(labeled(stat, 'Show days and years'));
  assert.match(stat.querySelector('.mat-hours__value')?.textContent ?? '', /days on the mat/);
  click(stat.querySelector('.mat-hours__value') as HTMLElement);
  const sheet = page.host.querySelector('[data-testid="mat-quick-add"]') as HTMLElement;
  assert.ok(sheet);
  typeInto(field(sheet, 'Date') as HTMLInputElement, '2026-10-11');
  click(control(sheet, 'button', '1h 30m'));
  click(control(sheet, 'button', 'Save'));
  assert.equal(page.host.querySelector('[data-testid="mat-quick-add"]'), null);
  const saved = loadStudentReport(localStorage);
  assert.equal(saved.journal.length, 1);
  assert.equal(saved.journal[0].minutes, 90);
  unmount(page);
});

test('calendar day: mark trained (untimed), then add time from the same sheet; journal shows one card', () => {
  localStorage.clear();
  saveStudentReport(localStorage, blankStudentReport(10));
  const day = mount(<StudentEditionPage />, '/student/calendar/2026-10-20?student=1');
  const section = () => day.host.querySelector('[data-testid="cal-mat"]') as HTMLElement;
  click(control(section(), 'button', 'Mark trained'));
  assert.match(section().textContent ?? '', /no time yet/);
  assert.equal(loadStudentReport(localStorage).journal.length, 1);
  click(control(section(), 'button', 'Add time'));
  click(control(section(), 'button', '2h'));
  click(control(section(), 'button', 'Save'));
  assert.match(section().textContent ?? '', /Trained · Class · 2h/);
  const saved = loadStudentReport(localStorage);
  assert.equal(saved.journal.length, 1);
  assert.equal(saved.journal[0].minutes, 120);
  unmount(day);
});
