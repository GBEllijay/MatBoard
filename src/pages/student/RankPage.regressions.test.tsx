/**
 * My rank controls. Belt tap stays a belt change. A stripe tap opens the
 * stripe detail, where a photo and a date are each optional and removable.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { RANK_PHOTO_KEY } from '../../lib/rankPhotos.ts';
import { blankStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { setRankAwardedOn, setRankBelt, setRankTapeCount, setRankTapeDate } from '../../lib/studentRank.ts';
import { RankPage } from './RankPage.tsx';

const dom = new Window({ url: 'http://localhost/student/rank?student=1' });
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
installGlobal('HTMLLabelElement', view.HTMLLabelElement);
installGlobal('HTMLImageElement', view.HTMLImageElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const STRIPE_PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function labeled(label: string): HTMLElement {
  const found = [...document.querySelectorAll('[aria-label]')].find((node) => node.getAttribute('aria-label') === label);
  assert.ok(found instanceof HTMLElement, `missing control: ${label}`);
  return found;
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((button) => {
    const label = button.getAttribute('aria-label');
    return label === name || button.textContent?.trim() === name;
  });
  assert.ok(found instanceof HTMLButtonElement, `missing button: ${name}`);
  return found;
}

function reactProps(node: Element): Record<string, (...args: never[]) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (...args: never[]) => void>>)[key] : null;
}

async function click(el: Element) {
  const inDialog = Boolean(el.closest('[role="dialog"]'));
  await act(async () => {
    if (inDialog) {
      reactProps(el)?.onClick?.({ preventDefault() {}, stopPropagation() {} } as never);
      return;
    }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function typeControl(input: HTMLInputElement | HTMLTextAreaElement, value: string, eventName: 'input' | 'blur' = 'input') {
  await act(async () => {
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    proto?.set?.call(input, value);
    input.dispatchEvent(new Event(eventName, { bubbles: true }));
    const handler = eventName === 'blur' ? reactProps(input)?.onBlur : reactProps(input)?.onChange;
    handler?.({ target: input, currentTarget: input } as never);
  });
}

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/student/rank?student=1']}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => {
    mounted.root.unmount();
  });
  mounted.host.remove();
}

test.beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

test('belt tap still sets the belt and does not open a stripe editor', async () => {
  const mounted = mount(<RankPage />);
  try {
    assert.equal(buttonNamed('White').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Date of this belt').tagName, 'INPUT');
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await click(buttonNamed('Blue'));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(buttonNamed('Blue').getAttribute('aria-pressed'), 'true');
    assert.equal(buttonNamed('White').getAttribute('aria-pressed'), 'false');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).disabled, false);
    assert.ok(document.querySelector('[aria-label="Add Blue photo"]'));
    assert.equal((labeled('Date of White belt') as HTMLInputElement).disabled, true);
    const stored = localStorage.getItem('matboard.studentEdition.v1') ?? '';
    assert.match(stored, /"belt":"blue"/);
  } finally {
    unmount(mounted);
  }
});

test('tapping a stripe opens an editor for an optional date and photo', async () => {
  const mounted = mount(<RankPage />);
  try {
    await click(labeled('Stripe 2'));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.equal(dialog.getAttribute('aria-label'), 'Stripe 2 details');
    assert.equal(dialog.querySelector('[aria-label="Date of this belt"]'), null);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 2').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 3').getAttribute('aria-pressed'), 'false');
    assert.match(dialog.textContent ?? '', /No date/);
    assert.match(dialog.textContent ?? '', /No photo/);
    assert.ok(dialog.querySelector('[aria-label="Add White stripe 2 photo"]'));
    assert.equal(dialog.textContent?.includes('Take off Stripe 2'), true);

    const date = labeled('Stripe 2 date');
    assert.ok(date instanceof HTMLInputElement);
    await typeControl(date, '2026-04-02');
    assert.match(dialog.textContent ?? '', /Date 2026-04-02/);
    assert.equal(document.querySelector('.rank-stripe-date')?.textContent, '2026-04-02');
    const stored = localStorage.getItem('matboard.studentEdition.v1') ?? '';
    assert.match(stored, /2026-04-02/);
    assert.equal(stored.includes(STRIPE_PHOTO), false);

    await click(buttonNamed('Remove date'));
    assert.equal((labeled('Stripe 2 date') as HTMLInputElement).value, '');
    assert.match(dialog.textContent ?? '', /No date/);
    assert.equal(document.querySelector('.rank-stripe-date'), null);
    assert.doesNotMatch(localStorage.getItem('matboard.studentEdition.v1') ?? '', /2026-04-02/);

    await click([...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Close') as HTMLButtonElement);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(labeled('Stripe 2').getAttribute('aria-pressed'), 'true');
  } finally {
    unmount(mounted);
  }
});

test('a saved stripe photo with no date opens in the stripe detail and can be removed', async () => {
  const report = setRankTapeCount(blankStudentReport(20), 1, 21);
  saveStudentReport(localStorage, report);
  localStorage.setItem(
    RANK_PHOTO_KEY,
    JSON.stringify({ tapes: { white: [[STRIPE_PHOTO], [], [], []] } }),
  );
  const mounted = mount(<RankPage />);
  try {
    const thumb = document.querySelector('img[alt="White stripe 1 photo 1"]');
    assert.ok(thumb instanceof HTMLImageElement);
    assert.equal(thumb.src, STRIPE_PHOTO);
    await click(labeled('Stripe 1'));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.match(dialog.textContent ?? '', /No date/);
    assert.match(dialog.textContent ?? '', /1 photo/);
    assert.equal((dialog.querySelector('[aria-label="Stripe 1 date"]') as HTMLInputElement).value, '');
    assert.equal([...dialog.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Remove date'), false);
    const photo = dialog.querySelector('img[alt="White stripe 1 photo 1"]');
    assert.ok(photo instanceof HTMLImageElement);
    await click(labeled('Remove White stripe 1 photo 1'));
    assert.equal(dialog.querySelector('img'), null);
    assert.match(dialog.textContent ?? '', /No photo/);
    const raw = localStorage.getItem(RANK_PHOTO_KEY) ?? '';
    assert.equal(raw.includes(STRIPE_PHOTO), false);
    assert.match(localStorage.getItem('matboard.studentEdition.v1') ?? '', /"tapeCount":1/);
  } finally {
    unmount(mounted);
  }
});

test('take off, add again, and drop later stripes stay available inside the stripe editor', async () => {
  const mounted = mount(<RankPage />);
  try {
    await click(labeled('Stripe 3'));
    assert.equal(labeled('Stripe 3').getAttribute('aria-pressed'), 'true');
    await click([...document.querySelectorAll('button')].find((button) => button.textContent === 'Close') as HTMLButtonElement);
    await click(labeled('Stripe 1'));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.match(dialog.textContent ?? '', /Drop stripes after Stripe 1/);
    await click([...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Drop stripes after Stripe 1') as HTMLButtonElement);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 2').getAttribute('aria-pressed'), 'false');
    assert.equal(labeled('Stripe 3').getAttribute('aria-pressed'), 'false');
    await click([...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Take off Stripe 1') as HTMLButtonElement);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'false');
    assert.match(dialog.textContent ?? '', /not on the belt yet/);
    await click([...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Add Stripe 1') as HTMLButtonElement);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.ok(dialog.querySelector('[aria-label="Stripe 1 date"]'));
    assert.ok(dialog.querySelector('[aria-label="Add White stripe 1 photo"]'));
  } finally {
    unmount(mounted);
  }
});

test('belt date, lineage, belt photo, and promotion history stay in place', async () => {
  const mounted = mount(<RankPage />);
  try {
    const beltDate = labeled('Date of this belt');
    assert.ok(beltDate instanceof HTMLInputElement);
    await typeControl(beltDate, '2026-02-01');
    await click(labeled('Stripe 1'));
    await typeControl(labeled('Stripe 1 date') as HTMLInputElement, '2026-03-01');
    await click(buttonNamed('Blue'));
    assert.equal(document.querySelector('[aria-label="Stripe 1 details"]'), null);
    const history = document.querySelector('[aria-label="Promotion history"]');
    assert.match(history?.textContent ?? '', /White/);
    assert.match(history?.textContent ?? '', /2026-02-01/);
    assert.equal(buttonNamed('Blue').getAttribute('aria-pressed'), 'true');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '');
    assert.ok(document.querySelector('[aria-label="Add Blue photo"]'));

    await click(labeled('White stripe 1'));
    const past = document.querySelector('[aria-label="White stripe 1 details"]');
    assert.ok(past instanceof HTMLElement);
    assert.match(past.textContent ?? '', /Date 2026-03-01/);
    assert.equal(past.textContent?.includes('Take off'), false);
    assert.equal(past.textContent?.includes('Add White stripe 1'), false);
    await typeControl(labeled('White stripe 1 date') as HTMLInputElement, '2026-03-15');
    assert.match(past.textContent ?? '', /Date 2026-03-15/);
    await click(buttonNamed('Remove date'));
    assert.equal((labeled('White stripe 1 date') as HTMLInputElement).value, '');
    await click(labeled('Close stripe'));

    const lineage = labeled('Lineage');
    assert.ok(lineage instanceof HTMLTextAreaElement);
    await typeControl(lineage, 'Coach Ana', 'input');
    await typeControl(lineage, 'Coach Ana', 'blur');
    assert.equal((labeled('Instructor 1') as HTMLInputElement).value, 'Coach Ana');

    await click(labeled('Remove White history'));
    await click(labeled('Confirm remove White history'));
    assert.doesNotMatch(document.querySelector('[aria-label="Promotion history"]')?.textContent ?? '', /2026-02-01/);
    assert.ok(document.querySelector('a[href="/student/rubric?student=1"]'));
  } finally {
    unmount(mounted);
  }
});

test('an earlier belt date stays on the line and is not moved into the stripe editor', async () => {
  let report = setRankBelt(blankStudentReport(30), 'purple', 31);
  report = setRankAwardedOn(report, '2026-07-01', 32);
  report = setRankTapeDate(setRankTapeCount(report, 1, 33), 0, '2026-08-01', 34);
  saveStudentReport(localStorage, report);
  const mounted = mount(<RankPage />);
  try {
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2026-07-01');
    await click(labeled('Stripe 1'));
    const dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog?.querySelector('[aria-label="Date of this belt"]'), null);
    assert.equal((labeled('Stripe 1 date') as HTMLInputElement).value, '2026-08-01');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2026-07-01');
  } finally {
    unmount(mounted);
  }
});
