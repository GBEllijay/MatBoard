/**
 * Kids belt → Blue from the coach. Student inbox confirm prompt + cheer once; coach send sheet confirm.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CoachUpdateInbox } from './CoachUpdateInbox.tsx';
import { SendRankUpdateSheet } from './CoachStudentLink.tsx';
import { buildCoachRankUpdate, queueCoachUpdate, readCoachQueue, readUpdateLedger } from '../lib/coachRankUpdate.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport } from '../lib/studentEdition.ts';
import { assignStudentId } from '../lib/studentIdentity.ts';
import { beltModeOf } from '../lib/beltBook.ts';
import { setBeltMode, setBirthYear, setKidsBelt } from '../lib/studentRank.ts';
import type { Student } from '../lib/rosterStore.ts';

const dom = new Window({ url: 'http://localhost/student' });
const view = dom as unknown as Window & typeof globalThis;
function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
for (const key of [
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'Element', 'Node',
  'DocumentFragment', 'Event', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent', 'CustomEvent',
] as const) installGlobal(key, (view as unknown as Record<string, unknown>)[key]);
installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={['/student']}>{node}</MemoryRouter>));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function button(host: ParentNode, label: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((node) => label.test(node.textContent ?? ''));
  assert.ok(found, `button ${label}`);
  return found as HTMLButtonElement;
}

function click(node: HTMLElement) {
  act(() => node.dispatchEvent(new view.MouseEvent('click', { bubbles: true }) as unknown as Event));
}

function reactProps(node: Element): Record<string, ((event: unknown) => void) | undefined> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

function type(input: HTMLInputElement, value: string) {
  let proto: object | null = Object.getPrototypeOf(input);
  let setter: ((value: string) => void) | undefined;
  while (proto && !setter) {
    setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    proto = Object.getPrototypeOf(proto);
  }
  setter?.call(input, value);
  act(() => reactProps(input)?.onChange?.({ target: input, currentTarget: input }));
}

function check(input: HTMLInputElement) {
  input.checked = true;
  act(() => reactProps(input)?.onChange?.({ target: input, currentTarget: input }));
}

function seedKid(updateId: string, belt = 'Blue') {
  localStorage.clear();
  let report = assignStudentId(blankStudentReport(10), 'stu-kid');
  report = setBeltMode(report, 'kids', 11);
  report = setBirthYear(report, 2010, 12);
  report = setKidsBelt(report, 'green', 13);
  saveStudentReport(localStorage, report);
  const built = buildCoachRankUpdate({ studentId: 'stu-kid', belt, stripeCount: 0, promotionDate: '2026-11-10', now: 20, updateId });
  if (!built.ok) throw new Error(built.error);
  queueCoachUpdate(localStorage, built.packet);
}

test('student: Accept asks to confirm Blue and birth year; Not yet changes nothing', () => {
  seedKid('rank-blue-ui-1');
  const { host, unmount } = mount(<CoachUpdateInbox />);
  click(button(host, /Accept blue belt/));
  const confirm = host.querySelector('fieldset.blue-belt-confirm');
  assert.ok(confirm, 'confirm prompt');
  assert.match(confirm.textContent ?? '', /Your coach promoted you to Blue belt/);
  assert.match(confirm.textContent ?? '', /New belt: Blue/);
  const year = host.querySelector('input[aria-label="Birth year"]') as HTMLInputElement;
  assert.equal(year.value, '2010');
  click(button(host, /Not yet/));
  assert.equal(host.querySelector('fieldset.blue-belt-confirm'), null);
  assert.equal(beltModeOf(loadStudentReport(localStorage)), 'kids');
  assert.equal(readCoachQueue(localStorage).length, 1);
  assert.equal(host.querySelector('.kids-grandmaster'), null);
  unmount();
});

test('student: Confirm applies blue, fires the cheer once, and never replays on reload', () => {
  seedKid('rank-blue-ui-2');
  const first = mount(<CoachUpdateInbox />);
  click(button(first.host, /Accept blue belt/));
  type(first.host.querySelector('input[aria-label="Birth year"]') as HTMLInputElement, '2009');
  click(button(first.host, /Confirm Blue belt, born 2009/));
  const cheer = first.host.querySelector('.kids-grandmaster');
  assert.ok(cheer, 'cheer shows');
  assert.match(cheer.textContent ?? '', /Parabéns, Coach!/);
  assert.ok(cheer.querySelector('.kids-confetti'), 'confetti');
  const saved = loadStudentReport(localStorage);
  assert.equal(saved.profile.belt, 'blue');
  assert.equal(beltModeOf(saved), 'adult');
  assert.equal(saved.beltBook?.birthYear, 2009);
  assert.deepEqual(readUpdateLedger(localStorage).accepted, ['rank-blue-ui-2']);
  first.unmount();
  const again = mount(<CoachUpdateInbox />);
  assert.equal(again.host.querySelector('.kids-grandmaster'), null);
  assert.equal(again.host.querySelector('.coach-update'), null);
  again.unmount();
});

test('student: a kids belt update that is not Blue stays the plain Accept, no cheer', () => {
  seedKid('rank-green-ui', 'Green');
  const { host, unmount } = mount(<CoachUpdateInbox />);
  click(button(host, /^Accept$/));
  assert.equal(host.querySelector('fieldset.blue-belt-confirm'), null);
  assert.equal(host.querySelector('.kids-grandmaster'), null);
  unmount();
});

const card: Student = {
  id: 'card-ana',
  name: 'Ana',
  belt: 'Blue',
  division: '',
  gym: '',
  photo: '',
  lastPromotion: '2026-11-10',
  lastPromotionDetail: '',
  note: '',
  checkedIn: false,
  rosterList: 'student',
  linkedStudentId: 'stu-ana',
  stripes: 0,
};

test('coach: Green to Blue needs the belt + birth year confirmation before Send', () => {
  localStorage.clear();
  const { unmount } = mount(
    <SendRankUpdateSheet student={card} previousBelt="Green" facts={{ birthYear: null, trainingSince: '2026-06-01' }} onClose={() => {}} />,
  );
  const sheet = document.body;
  const confirm = sheet.querySelector('fieldset.blue-belt-confirm');
  assert.ok(confirm, 'coach confirm');
  assert.match(confirm.textContent ?? '', /Ana moves from Green to Blue/);
  assert.match(confirm.textContent ?? '', /No birth year yet/);
  assert.match(confirm.textContent ?? '', /under a year/);
  const send = button(sheet, /Send to student/);
  assert.equal(send.disabled, true);
  const box = confirm.querySelector('input[type="checkbox"]') as HTMLInputElement;
  assert.equal(box.disabled, true);
  type(confirm.querySelector('input[aria-label="Birth year"]') as HTMLInputElement, '2010');
  assert.equal(box.disabled, false);
  check(box);
  assert.equal(button(sheet, /Send to student/).disabled, false);
  assert.match(confirm.textContent ?? '', /I confirm Blue belt and birth year 2010/);
  unmount();
});

test('coach: Blue to Purple and a first Blue stripe show no blue-belt confirmation', () => {
  localStorage.clear();
  const purple = mount(<SendRankUpdateSheet student={{ ...card, belt: 'Purple' }} previousBelt="Blue" onClose={() => {}} />);
  assert.equal(document.body.querySelector('fieldset.blue-belt-confirm'), null);
  assert.equal(button(document.body, /Send to student/).disabled, false);
  purple.unmount();
  const stripe = mount(<SendRankUpdateSheet student={{ ...card, stripes: 1 }} previousBelt="Blue" onClose={() => {}} />);
  assert.equal(document.body.querySelector('fieldset.blue-belt-confirm'), null);
  stripe.unmount();
});
