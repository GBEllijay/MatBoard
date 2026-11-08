/**
 * Mat hours: student-logged time on journal cards, and the belt-cloth total.
 * Controls touched: Journal (today's page) Save entry, Class field, all fields;
 * Journal card Edit / Save card / Cancel edit / Delete; hub My profile row;
 * Preview my card sheet. New: session chips (Class / Open mat / Miscellaneous / Other + text), the time wheel, Clear.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { STUDENT_EDITION_UNLOCK_STORAGE_KEY } from '../../lib/studentUnlock.ts';
import { setRankBelt, setRankTapeCount } from '../../lib/studentRank.ts';
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

/** The time wheel (shared WheelPicker): open it, tap the minute row, Done. */
function pickTime(host: ParentNode, prefix: string, label: string) {
  const opener = host.querySelector(`[aria-label^="${prefix}Time on the mat,"]`) as HTMLElement;
  assert.ok(opener, `${prefix}time wheel`);
  click(opener);
  const lists = [...document.querySelectorAll(`[role="listbox"][aria-label="${prefix}Time on the mat"]`)];
  const list = lists[lists.length - 1];
  assert.ok(list, 'wheel list');
  click(control(list, '[role="option"]', label));
  const sheet = list.closest('[role="dialog"]') ?? document.body;
  const done = [...sheet.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Done');
  if (done.length) click(done[done.length - 1] as HTMLElement);
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

test('log sheet: session chips, quick chips, stepper, clear, how it went and marks save to the card', () => {
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
  assert.equal(host.querySelector('[aria-label="Quick time"]'), null, 'preset chips replaced by the wheel');
  assert.equal(host.querySelector('[aria-label="More time"]'), null, 'no − / + stepper');
  pickTime(host, '', '1:30');
  assert.equal(out.textContent, '1:30', '15-minute steps');
  click(control(host, 'button', 'Clear'));
  assert.equal(out.textContent, 'Untimed');
  pickTime(host, '', '12:00');
  const clear = control(host, 'button', 'Clear');
  assert.equal(clear.textContent?.trim(), 'Clear');
  assert.equal(clear.classList.contains('mat-time__clear'), true);
  assert.equal(out.textContent, '12:00');
  const journalCss = readFileSync('src/pages/student/advantageJournal.css', 'utf8');
  assert.match(journalCss, /\.student\.adv-journal \.mat-time__clear\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(journalCss, /\.student\.adv-journal \.mat-time__clear\s*\{[^}]*min-width:\s*5\.5rem/);
  assert.match(journalCss, /\.student\.adv-journal \.mat-time__stepper\s*\{[^}]*flex-wrap:\s*wrap/);
  const motion = readFileSync('src/pages/student/hub.css', 'utf8');
  assert.match(motion, /@keyframes save-confirm-pulse/);
  assert.match(motion, /animation:\s*save-confirm-pulse 720ms ease-out 1/);
  assert.match(motion, /prefers-reduced-motion:\s*reduce[\s\S]*\.save-confirm__mark\s*\{[^}]*animation:\s*none/);
  pickTime(host, '', '2:00');
  assert.equal(host.querySelector('[aria-label="Session quality"]'), null, 'no rating chips');
  const how = field(host, 'How it went');
  assert.equal(how.tagName, 'TEXTAREA');
  assert.ok(how.closest('label.ink.journal-note'), 'lined-paper note treatment');
  typeInto(how, 'Learned something new');
  click(control(labeled(host, 'Mark card'), 'button', 'Injury'));
  typeInto(field(host, 'Injury area'), 'Left knee');
  click(control(host, 'button', 'Save entry'));
  const stored = loadStudentReport(localStorage).journal;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].minutes, 120);
  assert.equal(stored[0].session, 'openMat');
  assert.equal(stored[0].quality, undefined);
  assert.match(stored[0].body, /^How it went: Learned something new$/m);
  assert.deepEqual(stored[0].injury, { area: 'Left knee', note: '' });
  // Reset after save.
  assert.equal(labeled(host, 'Minutes on the mat').textContent, 'Untimed');
  assert.equal(host.querySelector('[aria-label="Injury area"]'), null);
  unmount(mounted);
});

test('an off-step saved time stays on the card until the wheel is changed', () => {
  const report = seed('white', { minutes: 148 });
  const mounted = mount(<StudentEditionPage />, `/student/cards/${report.journal[0].id}?student=1`);
  const { host } = mounted;
  assert.equal(host.querySelector('[data-testid="card-mat-time"]')?.textContent, 'Class · 2h 28m on the mat');
  const edit = [...host.querySelectorAll('a, button')].find((node) => /^Edit /.test(node.textContent?.trim() ?? ''));
  assert.ok(edit, 'Edit button');
  click(edit as HTMLElement);
  const opener = host.querySelector('[aria-label^="Edit Time on the mat,"]') as HTMLElement;
  assert.match(opener.getAttribute('aria-label') ?? '', /2:28/);
  click(opener);
  const lists = [...document.querySelectorAll('[role="listbox"][aria-label="Edit Time on the mat"]')];
  const list = lists[lists.length - 1];
  assert.ok(list, 'wheel list');
  const labels = [...list.querySelectorAll('[role="option"]')].map((row) => row.textContent?.trim());
  assert.ok(labels.includes('0:00'));
  assert.ok(labels.includes('0:15'));
  assert.ok(labels.includes('2:15'));
  assert.ok(labels.includes('2:28'));
  assert.ok(labels.includes('2:30'));
  assert.equal(labels.includes('2:29'), false);
  assert.equal(labels.includes('2:31'), false);
  const sheet = list.closest('[role="dialog"]') ?? document.body;
  const done = [...sheet.querySelectorAll('button')].filter((node) => node.textContent?.trim() === 'Done');
  if (done.length) click(done[done.length - 1] as HTMLElement);
  assert.equal(labeled(host, 'Edit Minutes on the mat').textContent, '2:28');
  click(control(host, 'button', 'Save card'));
  assert.equal(loadStudentReport(localStorage).journal[0].minutes, 148);
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
  pickTime(host, 'Edit ', '1:30');
  // Blue belt wording.
  assert.equal((field(host, 'Edit How it went') as HTMLTextAreaElement).placeholder, 'Solid flow');
  typeInto(field(host, 'Edit How it went'), 'Flowed');
  click(control(host, 'button', 'Save card'));
  const stored = loadStudentReport(localStorage).journal[0];
  assert.equal(stored.minutes, 90);
  assert.match(stored.body, /^How it went: Flowed$/m);
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
  const hub = mount(<StudentEditionPage />, '/student/hub?student=1');
  assert.equal(hub.host.querySelector('[data-testid="mat-hours"]'), null);
  assert.equal(hub.host.querySelector('[aria-label="My report card"]'), null);
  assert.ok(labeled(hub.host, 'My profile'));
  unmount(hub);
  const profile = mount(<StudentEditionPage />, '/student/profile?student=1');
  const section = profile.host.querySelector('[data-testid="profile-mat-hours"]') as HTMLElement;
  assert.ok(section);
  const stats = section.closest('[data-testid="profile-face-stats"]') as HTMLElement;
  assert.ok(stats, 'mat hours sit in the card stats (#399 card face)');
  assert.equal(stats.previousElementSibling?.getAttribute('data-testid'), 'card-medals', 'details sit at the bottom, under the medals');
  assert.match(profile.host.querySelector('[data-testid="mat-hours-frame"]')?.textContent ?? '', /^1mat hrs$/);
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

test('profile card: the timer opens quick-add; save updates the same day record; the frame toggles units', () => {
  seed('blue', { minutes: 60 });
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const frame = page.host.querySelector('[data-testid="mat-hours-frame"]') as HTMLElement;
  assert.ok(frame);
  click(frame);
  assert.match(frame.textContent ?? '', /mat days/);
  assert.equal(frame.getAttribute('aria-pressed'), 'true');
  click(frame);
  assert.match(frame.textContent ?? '', /mat hrs/);
  assert.equal(page.host.querySelector('[data-testid="mat-quick-add"]'), null, 'frame does not open quick-add');
  click(labeled(page.host, 'Add mat time'));
  const sheet = page.host.querySelector('[data-testid="mat-quick-add"]') as HTMLElement;
  assert.ok(sheet);
  typeInto(field(sheet, 'Date') as HTMLInputElement, '2026-10-11');
  pickTime(sheet, 'Quick ', '1:30');
  click(control(sheet, 'button', 'Save'));
  assert.equal(page.host.querySelector('[data-testid="mat-quick-add"]'), null);
  const saved = loadStudentReport(localStorage);
  assert.equal(saved.journal.length, 1);
  assert.equal(saved.journal[0].minutes, 90);
  unmount(page);
});

test('log mat time: Class, Open mat, and Misc; 15-minute wheel; 1:15 stores 75 minutes', () => {
  localStorage.clear();
  saveStudentReport(localStorage, blankStudentReport(10));
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  click(labeled(page.host, 'Add mat time'));
  const sheet = page.host.querySelector('[data-testid="mat-quick-add"]') as HTMLElement;
  assert.ok(sheet);
  const kinds = labeled(sheet, 'Quick Session type');
  assert.deepEqual([...kinds.querySelectorAll('button')].map((button) => button.textContent?.trim()), ['Class', 'Open mat', 'Misc']);
  assert.equal(sheet.querySelector('[aria-label="Quick Other session type"]'), null);
  click(control(kinds, 'button', 'Misc'));
  assert.equal(control(kinds, 'button', 'Misc').getAttribute('aria-pressed'), 'true');
  click(control(sheet, 'button', 'Clear'));
  assert.equal(labeled(sheet, 'Quick Minutes on the mat').textContent, 'Untimed');
  const opener = sheet.querySelector('[aria-label^="Quick Time on the mat,"]') as HTMLElement;
  click(opener);
  const list = [...document.querySelectorAll('[role="listbox"][aria-label="Quick Time on the mat"]')].at(-1);
  assert.ok(list, '15-minute wheel');
  const labels = [...list.querySelectorAll('[role="option"]')].map((option) => option.textContent?.trim() ?? '');
  assert.ok(labels.includes('1:15') && labels.includes('0:45') && labels.includes('2:00'));
  assert.ok(!labels.includes('1:01') && !labels.includes('0:01'));
  click(control(list, '[role="option"]', '1:15'));
  const wheel = list.closest('[role="dialog"]') ?? document.body;
  const done = [...wheel.querySelectorAll('button')].filter((button) => button.textContent?.trim() === 'Done');
  if (done.length) click(done[done.length - 1] as HTMLElement);
  assert.equal(labeled(sheet, 'Quick Minutes on the mat').textContent, '1:15');
  click(control(sheet, 'button', 'Save'));
  const saved = loadStudentReport(localStorage);
  assert.equal(saved.journal.length, 1);
  assert.equal(saved.journal[0].session, 'misc');
  assert.equal(saved.journal[0].minutes, 75);
  const css = readFileSync('src/pages/student/matHours.css', 'utf8');
  assert.match(css, /\.mat-quick \{[^}]*background:\s*#0a1a30/);
  assert.doesNotMatch(css, /\.mat-quick \{[^}]*#fffdf6/);
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
  pickTime(section(), 'Quick ', '2:00');
  click(control(section(), 'button', 'Save'));
  assert.match(section().textContent ?? '', /Trained · Class · 2h/);
  const saved = loadStudentReport(localStorage);
  assert.equal(saved.journal.length, 1);
  assert.equal(saved.journal[0].minutes, 120);
  unmount(day);
});

test('session type Other shows an optional text field; it saves and shows on the card', () => {
  localStorage.clear();
  const mounted = mount(<StudentEditionPage />, '/student/journal?date=2026-10-13&student=1');
  const { host } = mounted;
  const kinds = labeled(host, 'Session type');
  assert.deepEqual([...kinds.querySelectorAll('button')].map((b) => b.textContent), ['Class', 'Open mat', 'Miscellaneous', 'Other']);
  assert.equal(host.querySelector('[aria-label="Other session type"]'), null, 'text field only for Other');
  click(control(kinds, 'button', 'Other'));
  typeInto(field(host, 'Other session type'), 'Wrestling');
  pickTime(host, '', '1:30');
  click(control(host, 'button', 'Save entry'));
  const stored = loadStudentReport(localStorage).journal[0];
  assert.equal(stored.session, 'other');
  assert.equal(stored.sessionOther, 'Wrestling');
  assert.equal(stored.minutes, 90);
  unmount(mounted);
  const card = mount(<StudentEditionPage />, `/student/cards/${stored.id}?student=1`);
  assert.equal(card.host.querySelector('[data-testid="card-mat-time"]')?.textContent, 'Other · Wrestling · 1h 30m on the mat');
  unmount(card);
});

test('journal page: techniques drilled sits last; lines carry What I learned and the fundamentals checkbox', () => {
  localStorage.clear();
  const mounted = mount(<StudentEditionPage />, '/student/journal?date=2026-10-14&student=1');
  const { host } = mounted;
  const section = host.querySelector('[data-testid="journal-techniques"]') as HTMLElement;
  assert.ok(section);
  const stop = field(host, 'Stop doing');
  assert.ok(stop.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING, 'techniques after Stop doing');
  assert.equal(section.querySelectorAll('[data-testid="technique-line"]').length, 3);
  typeInto(field(section, 'Technique drilled #1'), 'Zorbo pass');
  typeInto(field(section, 'What I learned #1'), 'Angle off the hip');
  const box = labeled(section, 'On my fundamentals list? #1') as HTMLInputElement;
  assert.equal(box.checked, false, 'free text defaults unchecked');
  click(control(host, 'button', 'Save entry'));
  const stored = loadStudentReport(localStorage).journal[0];
  assert.match(stored.body, /^What I learned #1: Angle off the hip$/m);
  unmount(mounted);
  const card = mount(<StudentEditionPage />, `/student/cards/${stored.id}?student=1`);
  const pages = card.host.querySelectorAll('[data-testid="binder-page"]');
  assert.ok(pages.length >= 1);
  assert.equal(pages[0].getAttribute('aria-label'), `Page 1 of ${pages.length}`);
  unmount(card);
});

test('journal search: a typo finds the card and the hit is highlighted', () => {
  seed('white', { notes: 'Scissor sweep from closed guard' });
  const page = mount(<StudentEditionPage />, '/student/cards?student=1');
  typeInto(field(page.host, 'Search journal') as HTMLInputElement, 'scisor');
  const mark = page.host.querySelector('mark.journal-hit');
  assert.ok(mark, 'highlighted hit');
  assert.match(mark?.textContent ?? '', /Scissor/i);
  const link = [...page.host.querySelectorAll('a')].find((a) => /[?&]q=scisor/.test(a.getAttribute('href') ?? ''));
  assert.ok(link, 'result opens the entry with the query');
  unmount(page);
});

/* Student card layout (belt → mat hours frame + timer → radar → medals → details).
 * Controls touched: profile mat hours frame (units toggle), Add mat time timer, card radar link,
 * medal buttons, match log Close, Results link, My report card. */
import { recentMedals } from '../../lib/cardMedals.ts';
import { ASSESSMENT_AREAS, saveAssessment, writeAssessments } from '../../lib/studentAssessment.ts';
import { beltFrameColor } from './StudentCardLayout.tsx';
import { wornBeltPreview } from '../../lib/studentRank.ts';
import type { CompetitionResult, StudentProgressReport } from '../../lib/progress/types.ts';

function result(id: string, name: string, outcomes: Array<'win' | 'loss'>, date = '', notes: string[] = []): CompetitionResult {
  return {
    id,
    tournamentId: '',
    tournamentName: name,
    division: 'Adult / Light',
    bracket: [],
    bracketPhoto: false,
    matches: outcomes.map((r, i) => ({ id: `${id}.m${i}`, opponent: `Opp ${i}`, result: r, method: r === 'win' ? 'sub' : 'points', note: notes[i] ?? '', ...(date ? { date } : {}) })),
  };
}

function seedResults(results: CompetitionResult[]): StudentProgressReport {
  const report = seed('purple', { minutes: 60 });
  const next = { ...report, competition: { ...report.competition!, results } } as StudentProgressReport;
  saveStudentReport(localStorage, next);
  return next;
}

test('card order: belt → mat hours frame + timer → radar → medals → details', () => {
  seed('blue', { minutes: 60 });
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const face = page.host.querySelector('[data-testid="profile-card-face"]') as HTMLElement;
  const belt = face.querySelector('.profile-face__belt') as HTMLElement;
  const row = face.querySelector('[data-testid="mat-hours-row"]') as HTMLElement;
  assert.equal(belt.nextElementSibling, row, 'frame row directly under the belt');
  const ids = [...(page.host.querySelector('[data-testid="student-card-layout"]') as HTMLElement).children].map((n) => n.getAttribute('data-testid'));
  assert.deepEqual(ids, ['profile-card-face', 'card-radar', 'card-medals', 'profile-face-stats']);
  assert.ok(row.querySelector('[data-testid="mat-hours-frame"]'));
  assert.ok(row.querySelector('[aria-label="Add mat time"]'));
  unmount(page);
});

test('mat hours frame: belt-colored border, not the belt cloth', () => {
  for (const belt of ['white', 'blue', 'purple', 'brown', 'black']) {
    const report = seed(belt, { minutes: 60 });
    const page = mount(<StudentEditionPage />, '/student/profile?student=1');
    const frame = page.host.querySelector('[data-testid="mat-hours-frame"]') as HTMLElement;
    assert.equal(frame.getAttribute('data-belt'), belt);
    const color = beltFrameColor(wornBeltPreview(report));
    assert.ok(frame.getAttribute('style')?.includes(color), `${belt} frame uses ${color}`);
    assert.equal(frame.querySelector('.belt, .rung, .belt__body'), null, 'no belt shape or weave');
    assert.equal(page.host.querySelector('[data-testid="mat-hours"]'), null, 'old belt-cloth stat gone from the card');
    unmount(page);
  }
  assert.notEqual(beltFrameColor({ kind: 'striped', belt: 'blue', base: '' } as never), beltFrameColor({ kind: 'striped', belt: 'purple', base: '' } as never));
  assert.equal(beltFrameColor({ kind: 'kids', belt: 'grey', base: '#9a9a9a' } as never), '#9a9a9a', 'kids frame follows the kids belt');
});

test('medals: capped at three, most recent first, podium rules', () => {
  const comp = {
    tournaments: [],
    results: [
      result('a', 'Old Open', ['win'], '2026-01-01'),
      result('b', 'Spring Cup', ['win', 'loss'], '2026-04-01'),
      result('c', 'Summer Classic', ['win', 'loss'], '2026-06-01', ['', 'semi final']),
      result('d', 'Fall Open', ['win', 'win'], '2026-09-01'),
      result('e', 'Lost Early', ['loss'], '2026-10-01'),
    ],
  };
  const medals = recentMedals(comp);
  assert.equal(medals.length, 3);
  assert.deepEqual(medals.map((m) => m.name), ['Fall Open', 'Summer Classic', 'Spring Cup']);
  assert.deepEqual(medals.map((m) => m.kind), ['gold', 'bronze', 'silver']);
  assert.deepEqual(recentMedals({ tournaments: [], results: [] }), []);
});

test('medals on the card open a match log; empty states for medals and radar', () => {
  seed('white', { minutes: 0 });
  let page = mount(<StudentEditionPage />, '/student/profile?student=1');
  assert.ok(page.host.querySelector('[data-testid="card-medals-empty"]'));
  assert.ok(page.host.querySelector('[data-testid="card-radar-empty"]'));
  unmount(page);
  seedResults([result('x', 'Sample Open', ['win', 'win'], '2026-03-14', ['6-2', ''])]);
  page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const medals = page.host.querySelectorAll('[data-testid="card-medal"]');
  assert.equal(medals.length, 1);
  assert.match(medals[0].textContent ?? '', /Sample Open.*1st/);
  click(medals[0] as HTMLElement);
  const log = page.host.querySelector('[data-testid="match-log"]') as HTMLElement;
  assert.ok(log);
  assert.equal(log.querySelectorAll('[data-testid="match-log-row"]').length, 2);
  assert.match(log.textContent ?? '', /Opp 0.*6-2.*Win.*Submission/);
  click(control(log, 'button', 'Close'));
  assert.equal(page.host.querySelector('[data-testid="match-log"]'), null);
  unmount(page);
});

test('card radar reads the latest check-in; the self-assessment page is unchanged', () => {
  seed('white', { minutes: 0 });
  writeAssessments(localStorage, saveAssessment({ entries: [] }, { date: '2026-10-01', note: '', scores: Object.fromEntries(ASSESSMENT_AREAS.map((a) => [a.id, 3])) as never }));
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const radar = page.host.querySelector('[data-testid="card-radar"]') as HTMLElement;
  assert.ok(radar.querySelector('svg.assess-chart polygon.assess-chart__shape'));
  assert.equal(radar.querySelector('button.assess-tap'), null, 'read-only');
  unmount(page);
  const assess = mount(<StudentEditionPage />, '/student/self-assessment?student=1');
  assert.ok(assess.host.querySelector('#self-assessment .assess-visuals svg.assess-chart'));
  assert.ok(assess.host.querySelectorAll('button.assess-tap').length >= 5);
  assert.equal(assess.host.querySelector('[data-testid="card-radar"], [data-testid="card-medals"], [data-testid="mat-hours-frame"]'), null);
  unmount(assess);
});

test('the profile rank link is the rank only and still opens My rank', () => {
  localStorage.clear();
  let report = setRankBelt(blankStudentReport(10), 'black', 11);
  report = setRankTapeCount(report, 1, 12);
  saveStudentReport(localStorage, report);
  const page = mount(<StudentEditionPage />, '/student/profile?student=1');
  const belt = page.host.querySelector('a.profile-face__belt') as HTMLAnchorElement;
  assert.ok(belt);
  assert.equal(belt.querySelector('.profile-face__belt-text')?.textContent, 'Black belt · 1st degree');
  assert.equal(belt.textContent?.includes('change on the rank page'), false);
  assert.equal(belt.getAttribute('href'), '/student/rank?student=1');
  assert.equal(belt.tabIndex >= 0, true);
  unmount(page);

  localStorage.clear();
  let blue = setRankBelt(blankStudentReport(20), 'blue', 21);
  blue = setRankTapeCount(blue, 2, 22);
  saveStudentReport(localStorage, blue);
  const stripes = mount(<StudentEditionPage />, '/student/profile?student=1');
  assert.equal(stripes.host.querySelector('.profile-face__belt-text')?.textContent, 'Blue belt · 2 stripes');
  unmount(stripes);
});

test('short and long mat-hour totals stay whole inside the frame, and the timer stays', () => {
  const css = readFileSync('src/pages/student/profile.css', 'utf8');
  const layout = readFileSync('src/pages/student/studentCardLayout.css', 'utf8');
  assert.match(css, /\.profile-face \.mh-frame[\s\S]*padding: 8px 12px/);
  assert.match(css, /\.profile-face \.mh-frame[\s\S]*flex-direction: column/);
  assert.match(css, /@media \(min-width: 480px\) \{\s*\.profile-face \.mh-frame \{ flex-direction: row/);
  assert.match(layout, /flex-direction: column/);
  assert.match(layout, /flex-direction: row/);
  assert.doesNotMatch(css, /\.profile-face \.mh-frame[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.profile-face \.mh-timer[\s\S]*min-height: 44px/);

  localStorage.clear();
  const short = addJournalEntry(
    blankStudentReport(1),
    { date: '2026-10-11', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', minutes: 150 },
    2,
  );
  saveStudentReport(localStorage, short);
  const small = mount(<StudentEditionPage />, '/student/profile?student=1');
  const shortFrame = small.host.querySelector('[data-testid="mat-hours-frame"]') as HTMLElement;
  assert.equal(shortFrame.querySelector('.mh-frame__value')?.textContent, '2.5');
  assert.equal(shortFrame.querySelector('.mh-frame__unit')?.textContent, 'mat hrs');
  assert.ok(small.host.querySelector('[aria-label="Add mat time"]'));
  unmount(small);

  localStorage.clear();
  const one = addJournalEntry(
    blankStudentReport(3),
    { date: '2026-10-11', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', minutes: 720 },
    4,
  ).journal[0];
  const longReport = {
    ...blankStudentReport(5),
    journal: Array.from({ length: 500 }, (_, index) => ({ ...one, id: `hour-${index}`, createdAt: index, updatedAt: index })),
  };
  saveStudentReport(localStorage, longReport);
  const big = mount(<StudentEditionPage />, '/student/profile?student=1');
  const longFrame = big.host.querySelector('[data-testid="mat-hours-frame"]') as HTMLElement;
  assert.equal(longFrame.querySelector('.mh-frame__value')?.textContent, '6000');
  assert.equal(longFrame.querySelector('.mh-frame__unit')?.textContent, 'mat hrs');
  click(longFrame);
  assert.equal(longFrame.querySelector('.mh-frame__value')?.textContent, '250.0');
  assert.equal(longFrame.querySelector('.mh-frame__unit')?.textContent, 'mat days');
  assert.ok(big.host.querySelector('[aria-label="Add mat time"]'));
  unmount(big);
});

test('a licensed profile shows the same rank link and mat-hours frame without the demo query', () => {
  localStorage.clear();
  localStorage.setItem(STUDENT_EDITION_UNLOCK_STORAGE_KEY, '1');
  let report = setRankBelt(blankStudentReport(8), 'black', 9);
  report = setRankTapeCount(report, 1, 10);
  report = addJournalEntry(
    report,
    { date: '2026-10-11', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', minutes: 150 },
    11,
  );
  saveStudentReport(localStorage, report);
  const page = mount(<StudentEditionPage />, '/student/profile');
  assert.equal(page.host.textContent?.includes('DEMO MODE'), false);
  const belt = page.host.querySelector('a.profile-face__belt') as HTMLAnchorElement;
  assert.equal(belt.querySelector('.profile-face__belt-text')?.textContent, 'Black belt · 1st degree');
  assert.equal(belt.getAttribute('href'), '/student/rank');
  const frame = page.host.querySelector('[data-testid="mat-hours-frame"]') as HTMLElement;
  assert.equal(frame.querySelector('.mh-frame__value')?.textContent, '2.5');
  assert.equal(frame.querySelector('.mh-frame__unit')?.textContent, 'mat hrs');
  unmount(page);
});
