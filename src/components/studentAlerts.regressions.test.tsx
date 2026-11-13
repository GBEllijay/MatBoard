/**
 * Student alerts: unread badge, "Updated" toast, photo decision notice, and
 * the no-message card update, on the real CoachUpdateInbox.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CoachUpdateInbox } from './CoachUpdateInbox.tsx';
import { StudentToast } from './StudentToast.tsx';
import { buildCoachRankUpdate, queueCoachUpdate, readCoachQueue } from '../lib/coachRankUpdate.ts';
import { blankStudentReport, saveStudentReport } from '../lib/studentEdition.ts';
import { assignStudentId } from '../lib/studentIdentity.ts';
import { INBOX_PASS_KEY } from '../lib/studentInboxClient.ts';
import { recordPhotoSent, STUDENT_TOAST_EVENT } from '../lib/studentAlerts.ts';

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

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function seed(studentId: string, note = '', updateId = 'rank-plain-1') {
  localStorage.clear();
  saveStudentReport(localStorage, assignStudentId(blankStudentReport(10), studentId));
  const built = buildCoachRankUpdate({ studentId, belt: 'Blue', stripeCount: 2, promotionDate: '2026-11-12', note, now: 20, updateId });
  if (!built.ok) throw new Error(built.error);
  queueCoachUpdate(localStorage, built.packet);
}

function toasts(): string[] {
  const seen: string[] = [];
  window.addEventListener(STUDENT_TOAST_EVENT, (event) => {
    seen.push(String((event as CustomEvent<{ text: string }>).detail.text));
  });
  return seen;
}

test('no-note card update shows "Your coach updated your card" with what changed, and the badge counts it', () => {
  const seen = toasts();
  seed('stu-marty');
  const { host, unmount } = mount(<CoachUpdateInbox />);
  const card = host.querySelector('section.coach-update');
  assert.ok(card);
  assert.match(card.querySelector('h2')?.textContent ?? '', /Your coach updated your card/);
  const changes = [...card.querySelectorAll('.coach-update__changes li')].map((li) => li.textContent);
  assert.deepEqual(changes, ['Rank: Blue belt, 2 stripes', 'Date: Nov 12']);
  const badge = host.querySelector('button.student-alert-badge');
  assert.ok(badge, 'badge shows');
  assert.equal(badge.querySelector('.student-alert-badge__count')?.textContent, '1');
  assert.ok(seen.includes('New from your coach'), 'arrival toast');
  // Tapping the badge marks them seen.
  click(badge as HTMLElement);
  assert.equal(host.querySelector('button.student-alert-badge'), null);
  unmount();
  // Re-open: still seen, no second arrival toast.
  const before = seen.length;
  const again = mount(<CoachUpdateInbox />);
  assert.equal(again.host.querySelector('button.student-alert-badge'), null);
  assert.equal(seen.length, before);
  click(button(again.host, /^Accept$/));
  assert.equal(readCoachQueue(localStorage).length, 0);
  assert.ok(seen.includes('Saved to your card'));
  again.unmount();
});

test('a note keeps the "From your coach" heading', () => {
  seed('stu-marty', 'Earned it', 'rank-noted-1');
  const { host, unmount } = mount(<CoachUpdateInbox />);
  assert.match(host.querySelector('section.coach-update h2')?.textContent ?? '', /From your coach/);
  unmount();
});

test('photo decision: the student sees it once from their own inbox read, and Got it hides it', async () => {
  localStorage.clear();
  saveStudentReport(localStorage, assignStudentId(blankStudentReport(10), 'stu-marty'));
  const pass = `${b64({ alg: 'ES256' })}.${b64({ typ: 'student-inbox', v: 1, gym: 'license01', studentId: 'stu-marty', exp: 9e9 })}.sig`;
  localStorage.setItem(INBOX_PASS_KEY, pass);
  recordPhotoSent(localStorage, 'photo-m1');
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify({
        ok: true,
        packets: [],
        fromInstructor: [],
        photoDecisions: [{ photoId: 'photo-m1', decision: 'approve', decidedAt: Date.now() }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    const { host, unmount } = mount(<CoachUpdateInbox />);
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    assert.equal(urls.length, 1);
    assert.match(urls[0], /studentId=stu-marty/);
    const notice = host.querySelector('section.coach-update--photo');
    assert.ok(notice, 'photo notice shows');
    assert.match(notice.textContent ?? '', /Your coach approved your profile photo/);
    assert.equal(host.querySelector('.student-alert-badge__count')?.textContent, '1');
    click(button(host, /Got it/));
    assert.equal(host.querySelector('section.coach-update--photo'), null);
    assert.equal(host.querySelector('button.student-alert-badge'), null);
    unmount();
    const again = mount(<CoachUpdateInbox />);
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    assert.equal(again.host.querySelector('section.coach-update--photo'), null);
    again.unmount();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the toast shows a short line and clears itself', async () => {
  const { host, unmount } = mount(<StudentToast />);
  act(() => {
    window.dispatchEvent(new CustomEvent(STUDENT_TOAST_EVENT, { detail: { text: 'Saved to your card' } }));
  });
  assert.equal(host.querySelector('.student-toast')?.textContent, 'Saved to your card');
  assert.equal(host.querySelector('[role="status"]')?.getAttribute('aria-live'), 'polite');
  unmount();
});

test('first open: the arrival toast still shows when the toast mounts after the inbox', () => {
  seed('stu-marty', '', 'rank-first-open');
  const { host, unmount } = mount(
    <>
      <CoachUpdateInbox />
      <StudentToast />
    </>,
  );
  assert.equal(host.querySelector('.student-toast')?.textContent, 'New from your coach');
  unmount();
});
