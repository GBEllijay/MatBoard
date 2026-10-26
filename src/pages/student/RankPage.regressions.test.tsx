/**
 * My rank controls. Belt tap stays a belt change. A stripe tap opens the
 * stripe detail, where a photo and a date are each optional and removable.
 * An undated stripe does not show a stand-in date.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { RANK_PHOTO_KEY } from '../../lib/rankPhotos.ts';
import { BENCHMARK_DISCLAIMER_MEDIUM, BENCHMARK_DISCLAIMER_SHORT, BLACK_BELT_AGE_NOTE } from '../../lib/studentBenchmarks.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport, setFundamentalLevel, setTrainingStyle } from '../../lib/studentEdition.ts';
import { OPEN_GOAL_LINE, TIME_BASED_PROGRESS, withStarterRubric } from '../../lib/studentTools.ts';
import { setBeltMode, setKidsBelt, setKidsTapeCount } from '../../lib/beltBook.ts';
import { INSTRUCTOR_BARS_LABEL } from '../../lib/blackBeltDegrees.ts';
import { setInstructorBars, setInstructorBarsOn, setRankAwardedOn, setRankBelt, setRankTapeCount, setRankTapeDate } from '../../lib/studentRank.ts';
import { BeltPage } from './BeltPage.tsx';
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
  const found = findButton(name);
  assert.ok(found instanceof HTMLButtonElement, `missing button: ${name}`);
  return found;
}

function hasButton(name: string): boolean {
  return findButton(name) instanceof HTMLButtonElement;
}

function findButton(name: string): Element | undefined {
  return [...document.querySelectorAll('button')].find((button) => {
    const label = button.getAttribute('aria-label');
    return label === name || button.textContent?.trim() === name;
  });
}

async function submitNamed(name: string) {
  const button = buttonNamed(name);
  const form = button.closest('form');
  assert.ok(form instanceof HTMLElement && form.tagName === 'FORM', `missing form for ${name}`);
  await act(async () => {
    reactProps(form)?.onSubmit?.({ preventDefault() {}, stopPropagation() {} } as never);
  });
}

function reactProps(node: Element): Record<string, (...args: never[]) => void> | null {
  const key = reactExpando(node, '__reactProps');
  return key ? (node as unknown as Record<string, Record<string, (...args: never[]) => void>>)[key] : null;
}

/** Happy-dom form proxies hide expando keys from Object.keys. The suffix is shared. */
function reactExpando(node: Element, prefix: string): string | undefined {
  const direct = Object.keys(node).find((name) => name.startsWith(prefix));
  if (direct) return direct;
  const sample = document.querySelector('button, input');
  const sampleKey = sample ? Object.keys(sample).find((name) => name.startsWith(prefix)) : undefined;
  if (!sampleKey) return undefined;
  const candidate = `${prefix}${sampleKey.slice(prefix.length)}`;
  return (node as unknown as Record<string, unknown>)[candidate] ? candidate : undefined;
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

function mount(node: ReactNode, entry = '/student/rank?student=1'): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
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
    await click(labeled('Stripe 1'));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await click(labeled('Stripe 2'));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 2').getAttribute('aria-pressed'), 'true');
    await click(labeled('Stripe 2'));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.equal(dialog.getAttribute('aria-label'), 'Stripe 2 details');
    assert.equal(dialog.querySelector('[aria-label="Date of this belt"]'), null);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 2').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 3').getAttribute('aria-pressed'), 'false');
    const emptyDate = labeled('Stripe 2 date');
    assert.ok(emptyDate instanceof HTMLInputElement);
    assert.equal(emptyDate.required, false);
    assert.equal(emptyDate.value, '');
    assert.doesNotMatch(dialog.textContent ?? '', /No date|Invalid Date/);
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
    assert.doesNotMatch(dialog.textContent ?? '', /No date|Invalid Date|2026-04-02/);
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
    assert.doesNotMatch(dialog.textContent ?? '', /No date|Invalid Date/);
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
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(labeled('Stripe 3').getAttribute('aria-pressed'), 'true');
    await click(labeled('Stripe 3'));
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
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    await click(labeled('Stripe 1'));
    await typeControl(labeled('Stripe 1 date') as HTMLInputElement, '2026-03-01');
    await click(buttonNamed('Blue'));
    assert.equal(document.querySelector('[aria-label="Stripe 1 details"]'), null);
    const history = document.querySelector('[aria-label="Promotion history"]');
    const row = history?.querySelector('.rank-history');
    assert.equal(row?.querySelector('.rank-history__label')?.textContent, 'White');
    assert.equal(row?.querySelector('.rank-history__date')?.textContent, '2026-02-01');
    assert.match(row?.querySelector('.rank-history__stripes')?.textContent ?? '', /stripe/);
    assert.notEqual(row?.querySelector('.rank-history__label'), row?.querySelector('.rank-history__date'));
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

    const lineageHeadings = [...document.querySelectorAll('h2')].filter((heading) => heading.textContent === 'Lineage');
    assert.equal(lineageHeadings.length, 1);
    assert.equal(document.querySelector('textarea'), null);
    await click(buttonNamed('Add instructor'));
    await typeControl(labeled('Instructor 1') as HTMLInputElement, 'Coach Ana', 'input');
    await typeControl(labeled('Instructor 1') as HTMLInputElement, 'Coach Ana', 'blur');
    assert.equal((labeled('Instructor 1') as HTMLInputElement).value, 'Coach Ana');

    await click(labeled('Remove White history'));
    await click(labeled('Confirm remove White history'));
    assert.doesNotMatch(document.querySelector('[aria-label="Promotion history"]')?.textContent ?? '', /2026-02-01/);
    assert.ok(document.querySelector('a[href="/student/rubric?student=1"]'));
  } finally {
    unmount(mounted);
  }
});

test('editing instructor 1 keeps the second instructor', async () => {
  const report = blankStudentReport(40);
  const raw = {
    ...report,
    rank: { ...report.rank, lineage: 'Mestre Paulo Reis (mock)\nProf. Elena Duarte (mock)' },
  };
  localStorage.setItem('matboard.studentEdition.v1', JSON.stringify(raw));
  const mounted = mount(<RankPage />);
  try {
    assert.equal((labeled('Instructor 1') as HTMLInputElement).value, 'Mestre Paulo Reis (mock)');
    assert.equal((labeled('Instructor 2') as HTMLInputElement).value, 'Prof. Elena Duarte (mock)');
    await typeControl(labeled('Instructor 1') as HTMLInputElement, 'New Coach', 'input');
    await typeControl(labeled('Instructor 1') as HTMLInputElement, 'New Coach', 'blur');
    assert.equal((labeled('Instructor 2') as HTMLInputElement).value, 'Prof. Elena Duarte (mock)');
    const stored = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      rank?: { lineage?: string[] };
    };
    assert.deepEqual(stored.rank?.lineage, ['New Coach', 'Prof. Elena Duarte (mock)']);
    await click(labeled('Move instructor 2 up'));
    assert.equal((labeled('Instructor 1') as HTMLInputElement).value, 'Prof. Elena Duarte (mock)');
    assert.equal((labeled('Instructor 2') as HTMLInputElement).value, 'New Coach');
    await click(labeled('Move instructor 1 down'));
    assert.equal((labeled('Instructor 1') as HTMLInputElement).value, 'New Coach');
    await click(labeled('Remove instructor 2'));
    assert.equal(document.querySelector('[aria-label="Instructor 2"]'), null);
    assert.equal((labeled('Instructor 1') as HTMLInputElement).value, 'New Coach');
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

test('coral stays locked until a black belt is worn, then the quiet rows unlock', async () => {
  const mounted = mount(<RankPage />);
  try {
    assert.equal(document.querySelector('[aria-label="Unlocked after black belt"]'), null);
    assert.match(labeled('1st degree').textContent ?? '', /3 yrs/);
    assert.match(labeled('6th degree').textContent ?? '', /24 yrs/);
    assert.match(document.body.textContent ?? '', /guideline minimums/i);
    assert.equal(document.querySelector('.mini-belt'), null);
    await click(buttonNamed('Black'));
    const unlocked = document.querySelector('[aria-label="Unlocked after black belt"]');
    assert.ok(unlocked instanceof HTMLElement);
    assert.match(unlocked.textContent ?? '', /Unlocked after black belt/);
    assert.match(unlocked.textContent ?? '', /31 years cumulative/);
    assert.match(unlocked.textContent ?? '', /38 years cumulative/);
    assert.match(unlocked.textContent ?? '', /48\+ years cumulative/);
    assert.equal(unlocked.querySelectorAll('.mini-belt').length, 3);
  } finally {
    unmount(mounted);
  }
});

test('instructor bars sit on the red bar and are not a seventh stripe', async () => {
  saveStudentReport(localStorage, setRankBelt(blankStudentReport(40), 'black', 41));
  const mounted = mount(<RankPage />);
  try {
    const black = document.querySelector('.rung--black');
    assert.equal(black?.querySelectorAll('.stripe').length, 6);
    assert.equal(black?.querySelector('[data-instructor-bars="on"]'), null);
    assert.equal(black?.querySelectorAll('.ibar').length, 0);
    await click(labeled('Instructor bars (some schools award these at about 2 years)'));
    assert.ok(black?.querySelector('[data-instructor-bars="on"]'));
    assert.equal(black?.querySelectorAll('.ibar').length, 2);
    assert.equal(black?.querySelectorAll('.stripe').length, 6);
  } finally {
    unmount(mounted);
  }
});

test('an old four-stripe save still loads and does not unlock coral', async () => {
  let report = setRankBelt(blankStudentReport(50), 'blue', 51);
  report = setRankTapeCount(report, 2, 52);
  report = setRankTapeDate(report, 0, '2012-01-01', 53);
  saveStudentReport(localStorage, report);
  const mounted = mount(<RankPage />);
  try {
    assert.equal(buttonNamed('Blue').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 2').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[aria-label="Unlocked after black belt"]'), null);
    await click(labeled('Stripe 1'));
    assert.equal((labeled('Stripe 1 date') as HTMLInputElement).value, '2012-01-01');
  } finally {
    unmount(mounted);
  }
});

test('belt progress hides coral until black is worn', async () => {
  const locked = mount(<BeltPage />);
  try {
    assert.equal(document.body.textContent?.includes('Unlocked after black belt'), false);
    assert.equal(document.body.textContent?.includes('Next: 1st degree'), false);
    assert.ok(document.querySelector('[aria-label="Practical benchmarks between White and Blue"]'));
  } finally {
    unmount(locked);
  }
  saveStudentReport(localStorage, setRankBelt(blankStudentReport(60), 'black', 61));
  const open = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', /Next: 1st degree/);
    assert.match(document.body.textContent ?? '', /3 years at black belt/);
    assert.match(document.body.textContent ?? '', /Unlocked after black belt/);
    assert.match(document.body.textContent ?? '', /31 years as a black belt/);
    assert.match(document.body.textContent ?? '', /48\+ years as a black belt/);
    assert.match(document.body.textContent ?? '', /Instructor bars: off/);
  } finally {
    unmount(open);
  }
});

test('adult belts stay put when the student switches to kids and back', async () => {
  const mounted = mount(<RankPage />);
  try {
    assert.equal(buttonNamed('Adult').getAttribute('aria-pressed'), 'true');
    assert.equal(buttonNamed('Kids').getAttribute('aria-pressed'), 'false');
    assert.equal(document.querySelector('[aria-label="Kids belt ladder"]'), null);
    await click(labeled('Stripe 1'));
    await click(buttonNamed('Black'));
    await click(labeled('1st degree'));
    assert.equal(labeled('1st degree').getAttribute('aria-pressed'), 'true');
    await click(buttonNamed('Kids'));
    assert.equal(buttonNamed('Adult').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.match(document.body.textContent ?? '', /Your adult belts stay on this phone/);
    await click(buttonNamed('Stay'));
    assert.equal(labeled('1st degree').getAttribute('aria-pressed'), 'true');
    await click(buttonNamed('Kids'));
    await click(buttonNamed('Switch'));
    assert.equal(buttonNamed('Kids').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[aria-label="1st degree"]'), null);
    assert.equal(document.querySelector('[aria-label="Unlocked after black belt"]'), null);
    assert.ok(document.querySelector('[aria-label="Kids belt ladder"]'));
    assert.equal(buttonNamed('Grey/White').getAttribute('aria-pressed'), 'false');
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'false');
    const stored = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      profile?: { belt?: string };
      rank?: { tapeCount?: number };
      beltBook?: { mode?: string };
    };
    assert.equal(stored.profile?.belt, 'black');
    assert.equal(stored.rank?.tapeCount, 1);
    assert.equal(stored.beltBook?.mode, 'kids');
    assert.equal(JSON.stringify(stored).includes('"stripes"'), false);

    await click(buttonNamed('Yellow'));
    assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /IBJJF suggests this belt from age 7/);
    await click(buttonNamed('Add a class'));
    await click(buttonNamed('Add a class'));
    assert.match(document.querySelector('.class-tally__count')?.textContent ?? '', /2 of 8/);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'false');
    await typeControl(labeled('Classes per stripe') as HTMLInputElement, '4');
    assert.match(document.querySelector('.class-tally__count')?.textContent ?? '', /2 of 4/);
    await click(buttonNamed('Add a class'));
    await click(buttonNamed('Add a class'));
    assert.match(document.body.textContent ?? '', /Your instructor decides when the stripe goes on/);
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'false');
    await click(labeled('Stripe 1'));
    assert.equal(labeled('Stripe 1').getAttribute('aria-pressed'), 'true');
    assert.match(document.querySelector('.class-tally__count')?.textContent ?? '', /0 of 4/);

    const year = String(new Date().getFullYear() - 16);
    await typeControl(labeled('Birth year') as HTMLInputElement, year);
    assert.match(document.body.textContent ?? '', /Time to switch to the adult system/);
    await click(buttonNamed('Adult'));
    await click(buttonNamed('Switch'));
    assert.equal(buttonNamed('Black').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('1st degree').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[aria-label="Kids belt ladder"]'), null);
    const restored = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      beltBook?: { kids?: { beltId?: string; tapeCount?: number } };
    };
    assert.equal(restored.beltBook?.kids?.beltId, 'yellow');
    assert.equal(restored.beltBook?.kids?.tapeCount, 1);
  } finally {
    unmount(mounted);
  }
});

test('kids stripes sit on the adult belt row and change color in place', async () => {
  saveStudentReport(localStorage, setBeltMode(blankStudentReport(80), 'kids', 81));
  const mounted = mount(<RankPage />);
  try {
    const greyWhite = buttonNamed('Grey/White').closest('li');
    assert.match(greyWhite?.className ?? '', /rank-rung/);
    assert.match(greyWhite?.className ?? '', /rung--kids-ink-navy/);
    assert.equal(greyWhite?.querySelectorAll('.belt__bar button').length, 4);
    assert.equal(document.querySelector('[aria-label="Stripes"]')?.querySelectorAll('button').length, 4);
    assert.equal(document.querySelector('[aria-label="Grey stripes"]')?.querySelectorAll('button').length, 4);
    assert.match(buttonNamed('Grey/Black').closest('li')?.className ?? '', /rung--kids-ink-navy/);
    assert.match(buttonNamed('Yellow/White').closest('li')?.className ?? '', /rung--kids-ink-navy/);
    assert.match(buttonNamed('Yellow/Black').closest('li')?.className ?? '', /rung--kids-ink-navy/);
    assert.ok(labeled('Add Grey/White photo'));
    assert.ok(greyWhite?.querySelector('.belt.belt--kids > .belt__bar'));

    const tape = (name: string) => labeled(name).getAttribute('style') ?? '';
    await click(buttonNamed('Grey/White'));
    await click(labeled('Stripe 4'));
    assert.match(tape('Stripe 1'), /#f4f1ea/i);
    assert.match(tape('Stripe 4'), /#f4f1ea/i);
    await click(labeled('Stripe 1'));
    assert.match(tape('Stripe 1'), /#d21f1f/i);
    assert.match(tape('Stripe 2'), /#f4f1ea/i);
    await click(labeled('Stripe 4'));
    assert.match(tape('Stripe 1'), /#d21f1f/i);
    assert.match(tape('Stripe 4'), /#d21f1f/i);
    await click(labeled('Stripe 1'));
    assert.match(tape('Stripe 1'), /#121214/i);
    assert.match(tape('Stripe 2'), /#d21f1f/i);
    await click(labeled('Stripe 3'));
    assert.match(tape('Stripe 3'), /#121214/i);
    assert.match(tape('Stripe 4'), /#d21f1f/i);
    await click(buttonNamed('Add a class'));
    const stored = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      beltBook?: { kids?: { beltId?: string; tapeCount?: number; classCount?: number } };
    };
    assert.equal(stored.beltBook?.kids?.beltId, 'grey-white');
    assert.equal(stored.beltBook?.kids?.tapeCount, 11);
    assert.equal(stored.beltBook?.kids?.classCount, 1);

    await click(buttonNamed('White'));
    await click(labeled('Stripe 4'));
    await click(labeled('Stripe 1'));
    assert.match(tape('Stripe 1'), /#d21f1f/i);
    assert.match(tape('Stripe 4'), /#f4f1ea/i);
    await click(labeled('Stripe 2'));
    const white = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      beltBook?: { kids?: { beltId?: string; tapeCount?: number } };
    };
    assert.equal(white.beltBook?.kids?.beltId, 'white');
    assert.equal(white.beltBook?.kids?.tapeCount, 5);
  } finally {
    unmount(mounted);
  }
});

test('Grey/White stripes are empty after stepping back to zero and to White', async () => {
  saveStudentReport(localStorage, setBeltMode(blankStudentReport(90), 'kids', 91));
  const mounted = mount(<RankPage />);
  try {
    const filled = (label: string) => {
      const stripe = labeled(label);
      const style = stripe.getAttribute('style') ?? '';
      return stripe.getAttribute('aria-pressed') === 'true' || stripe.classList.contains('is-on') || /#(?:d21f1f|121214|f4f1ea)/i.test(style);
    };
    await click(buttonNamed('Grey/White'));
    await click(labeled('Stripe 4'));
    await click(labeled('Stripe 1'));
    await click(labeled('Stripe 4'));
    await click(labeled('Stripe 1'));
    await click(labeled('Stripe 3'));
    assert.equal(filled('Stripe 1'), true);
    const back = ['Stripe 3', 'Stripe 2', 'Stripe 1', 'Stripe 4', 'Stripe 3', 'Stripe 2', 'Stripe 1', 'Stripe 4', 'Stripe 3', 'Stripe 2', 'Stripe 1'];
    for (const name of back) await click(labeled(name));
    for (const slot of [1, 2, 3, 4]) assert.equal(filled(`Stripe ${slot}`), false);
    await click(buttonNamed('White'));
    for (const slot of [1, 2, 3, 4]) assert.equal(filled(`Grey/White stripe ${slot}`), false);
    for (const belt of ['Grey', 'Yellow/White', 'Yellow', 'Orange/Black', 'Green/Black']) {
      for (const slot of [1, 2, 3, 4]) assert.equal(filled(`${belt} stripe ${slot}`), false);
    }
  } finally {
    unmount(mounted);
  }
});

test('Black to Brown to Black and Coral to Black keep the black belt record', async () => {
  let report = setRankBelt(blankStudentReport(90), 'black', 91);
  report = setRankAwardedOn(report, '2010-01-02', 92);
  report = setRankTapeCount(report, 2, 93);
  report = setRankTapeDate(report, 0, '2013-03-04', 94);
  report = setRankTapeDate(report, 1, '2016-05-06', 95);
  report = setInstructorBars(report, true, 96);
  report = setInstructorBarsOn(report, '2012-02-02', 97);
  saveStudentReport(localStorage, report);
  const mounted = mount(<RankPage />);
  const historyLabels = () => [...document.querySelectorAll('.rank-history__label')].map((node) => node.textContent);
  const storedRank = () =>
    JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      profile?: { belt?: string };
      rank?: {
        tapeCount?: number;
        awardedOn?: string;
        instructorBars?: boolean;
        instructorBarsOn?: string;
        tapeDates?: string[];
        history?: { belt?: string; tapeCount?: number; awardedOn?: string }[];
      };
    };
  try {
    assert.equal(buttonNamed('Black').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('2nd degree').getAttribute('aria-pressed'), 'true');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2010-01-02');
    assert.equal(labeled(INSTRUCTOR_BARS_LABEL).getAttribute('aria-checked'), 'true');
    assert.equal((labeled('Instructor bars date') as HTMLInputElement).value, '2012-02-02');
    assert.match(labeled('Stripe 1').textContent ?? '', /2013-03-04/);
    assert.match(labeled('Stripe 2').textContent ?? '', /2016-05-06/);

    await click(buttonNamed('Brown'));
    assert.equal(buttonNamed('Brown').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('2nd degree').getAttribute('aria-pressed'), 'true');
    assert.equal((labeled('Date of Black belt') as HTMLInputElement).value, '2010-01-02');
    assert.equal(labeled(INSTRUCTOR_BARS_LABEL).getAttribute('aria-checked'), 'true');
    assert.deepEqual(historyLabels(), ['Black']);

    await click(buttonNamed('Black'));
    assert.equal(buttonNamed('Black').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('2nd degree').getAttribute('aria-pressed'), 'true');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2010-01-02');
    assert.equal((labeled('Instructor bars date') as HTMLInputElement).value, '2012-02-02');
    assert.match(labeled('Stripe 1').textContent ?? '', /2013-03-04/);
    assert.match(labeled('Stripe 2').textContent ?? '', /2016-05-06/);
    assert.deepEqual(historyLabels(), []);
    assert.equal(storedRank().rank?.tapeCount, 2);
    assert.equal(storedRank().rank?.instructorBars, true);
    assert.equal(storedRank().rank?.history?.length, 0);

    await click(buttonNamed('Brown'));
    await click(buttonNamed('Black'));
    await click(buttonNamed('Brown'));
    assert.deepEqual(historyLabels(), ['Black']);
    assert.equal(storedRank().rank?.history?.filter((row) => row.belt === 'black').length, 1);

    await click(buttonNamed('Black'));
    await click(labeled('Coral, red and black'));
    await typeControl(labeled('Date of this belt') as HTMLInputElement, '2024-08-09');
    await click(buttonNamed('Black'));
    assert.equal(labeled('2nd degree').getAttribute('aria-pressed'), 'true');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2010-01-02');
    assert.equal(labeled(INSTRUCTOR_BARS_LABEL).getAttribute('aria-checked'), 'true');
    assert.deepEqual(historyLabels(), ['Coral']);
    await click(labeled('Coral, red and black'));
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2024-08-09');
    await click(buttonNamed('Black'));
    await click(labeled('Coral, red and black'));
    await click(buttonNamed('Black'));
    assert.equal(storedRank().rank?.tapeCount, 2);
    assert.equal(storedRank().rank?.awardedOn, '2010-01-02');
    assert.equal(storedRank().rank?.instructorBarsOn, '2012-02-02');
    assert.deepEqual(storedRank().rank?.tapeDates, ['2013-03-04', '2016-05-06', '', '']);
    assert.equal(storedRank().rank?.history?.filter((row) => row.belt === 'coral').length, 1);
    assert.equal(storedRank().rank?.history?.filter((row) => row.belt === 'black').length, 0);

    await click(buttonNamed('Kids'));
    await click(buttonNamed('Switch'));
    assert.ok(document.querySelector('[aria-label="Kids belt ladder"]'));
    await click(buttonNamed('Grey/White'));
    await click(labeled('Stripe 1'));
    assert.match(labeled('Stripe 1').getAttribute('style') ?? '', /#f4f1ea/i);
    await click(buttonNamed('Add a class'));
    assert.match(document.querySelector('.class-tally__count')?.textContent ?? '', /1 of 8/);
    await click(buttonNamed('Yellow'));
    await click(buttonNamed('Grey/White'));
    assert.equal(buttonNamed('Grey/White').getAttribute('aria-pressed'), 'true');
    const kids = storedRank() as {
      beltBook?: { kids?: { beltId?: string; history?: { beltId?: string }[] } };
      rank?: { tapeCount?: number };
    };
    assert.equal(kids.beltBook?.kids?.beltId, 'grey-white');
    assert.equal(kids.rank?.tapeCount, 2);
    await click(buttonNamed('Adult'));
    await click(buttonNamed('Switch'));
    assert.equal(buttonNamed('Black').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled('2nd degree').getAttribute('aria-pressed'), 'true');
    assert.equal(labeled(INSTRUCTOR_BARS_LABEL).getAttribute('aria-checked'), 'true');
  } finally {
    unmount(mounted);
  }
});

test('kids belt progress hides checkpoints and keeps them for adult', async () => {
  let report = setRankBelt(blankStudentReport(70), 'blue', 71);
  report = setBeltMode(report, 'kids', 72);
  saveStudentReport(localStorage, report);
  const kids = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', /Checkpoints and fundamentals for kids are not on this page yet/);
    assert.equal(document.querySelector('[aria-label="Practical benchmarks between White and Blue"]'), null);
    assert.equal(document.body.textContent?.includes('Next: 1st degree'), false);
    assert.ok(document.querySelector('[aria-label="Goals"]'));
  } finally {
    unmount(kids);
  }
  const back = setBeltMode(report, 'adult', 73);
  saveStudentReport(localStorage, back);
  const adult = mount(<BeltPage />);
  try {
    assert.ok(document.querySelector('[aria-label="Practical benchmarks between Blue and Purple"]'));
    assert.equal(document.body.textContent?.includes('not on this page yet'), false);
  } finally {
    unmount(adult);
  }
});

test('fundamentals at live level fill the white belt checkpoint count', async () => {
  let report = blankStudentReport(70);
  report.rubric.levels = [
    {
      id: 'level.white',
      name: 'White',
      belt: 'white',
      checkpoints: [
        {
          id: 'checkpoint.white.guard',
          name: 'Guard',
          met: null,
          note: '',
          criteria: [
            { id: 'rubric.white.closed-guard', requirement: 'Hold closed guard.', techniqueRefs: [{ id: 'pos.closed-guard', name: 'Closed guard' }], met: null, note: '' },
            { id: 'rubric.white.scissor-sweep', requirement: 'Finish a scissor sweep.', techniqueRefs: [{ id: 'sweep.scissor', name: 'Scissor sweep' }], met: null, note: '' },
          ],
        },
        {
          id: 'checkpoint.white.escapes',
          name: 'Escapes',
          met: null,
          note: '',
          criteria: [
            { id: 'rubric.white.mount-escape', requirement: 'Escape mount.', techniqueRefs: [{ id: 'escape.mount', name: 'Mount escape' }], met: null, note: '' },
            { id: 'rubric.white.side-control-escape', requirement: 'Escape side control.', techniqueRefs: [{ id: 'escape.side-control', name: 'Side control escape' }], met: null, note: '' },
          ],
        },
        {
          id: 'checkpoint.white.passes',
          name: 'Passes',
          met: null,
          note: '',
          criteria: [
            { id: 'rubric.white.knee-slice', requirement: 'Finish a knee slice pass.', techniqueRefs: [{ id: 'pass.knee-slice', name: 'Knee slice pass' }], met: null, note: '' },
            { id: 'rubric.white.torreando', requirement: 'Finish a torreando pass.', techniqueRefs: [{ id: 'pass.torreando', name: 'Torreando pass' }], met: null, note: '' },
          ],
        },
      ],
    },
  ];
  report = setFundamentalLevel(report, { catalogItemId: 'pos.closed-guard', categoryId: 'positions', name: 'Closed guard' }, 3, 71);
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 5, 72);
  saveStudentReport(localStorage, report);
  const mounted = mount(<BeltPage />);
  try {
    assert.match(labeled('Belt progress count').textContent ?? '', /2 of 6 requirements counted\. 2 from fundamentals\./);
    assert.match(labeled('Belt progress count').textContent ?? '', /1 of 3 practical benchmarks filled/);
    assert.equal(labeled('Guard, filled').tagName, 'LI');
    assert.match(document.body.textContent ?? '', /Counted from your fundamentals\./);
    assert.equal(labeled('Practical Benchmarks').tagName, 'SECTION');
    assert.match(document.body.textContent ?? '', /Skills the coach or template expects before the next belt/);
    assert.ok(labeled('Personal goal name'));
    assert.ok(labeled('Personal goal note'));
    assert.ok(buttonNamed('Add personal goal'));
  } finally {
    unmount(mounted);
  }
});

test('brown tap-to-add goals can be edited and removed without becoming checkpoints', async () => {
  const report = setRankBelt(withStarterRubric(blankStudentReport(80), 80), 'brown', 81);
  saveStudentReport(localStorage, report);
  const mounted = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', new RegExp(OPEN_GOAL_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(document.querySelector('[aria-label="Tap to add"]'));
    assert.ok(buttonNamed('Add personal goal'));
    assert.equal(document.querySelector('[aria-label="Goal name"]'), null);
    assert.match(document.body.textContent ?? '', /Your own goals, which never affect belt or degree milestones/);
    assert.equal(document.body.textContent?.includes('not on this page yet'), false);
    await click(buttonNamed('Teaching: lead a class'));
    const added = loadStudentReport(localStorage);
    assert.equal(added.goals[0]?.name, 'Teaching: lead a class');
    assert.equal(added.goals[0]?.belt, 'brown');
    assert.equal(added.profile.belt, 'brown');
    await typeControl(labeled('Edit Teaching: lead a class') as HTMLInputElement, 'Lead the kids class');
    await submitNamed('Save Teaching: lead a class');
    const renamed = loadStudentReport(localStorage);
    assert.equal(renamed.goals[0]?.name, 'Lead the kids class');
    assert.equal(renamed.goals[0]?.belt, 'brown');
    const brownCount = renamed.rubric.levels.find((level) => level.belt === 'brown')?.checkpoints.length ?? 0;
    assert.ok(brownCount > 0);
    assert.equal(brownCount, added.rubric.levels.find((level) => level.belt === 'brown')?.checkpoints.length);
    await click(buttonNamed('Remove Lead the kids class'));
    assert.equal(loadStudentReport(localStorage).goals.length, 0);
  } finally {
    unmount(mounted);
  }
});

test('black belt goals and degree focus do not change degree milestones', async () => {
  let report = setRankBelt(withStarterRubric(blankStudentReport(90), 90), 'black', 91);
  report = setRankAwardedOn(report, '2010-01-02', 92);
  report = setRankTapeCount(report, 2, 93);
  saveStudentReport(localStorage, report);
  const mounted = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', new RegExp(TIME_BASED_PROGRESS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(document.body.textContent ?? '', /Next: 3rd degree/);
    assert.equal(document.querySelector('[aria-label="Practical benchmarks between Black and Coral"]'), null);
    await click(buttonNamed('Teaching: lead a class'));
    await click(buttonNamed('Mark Teaching: lead a class met'));
    await typeControl(labeled('Focus for this degree') as HTMLInputElement, 'Teach the Thursday class', 'blur');
    const stored = loadStudentReport(localStorage);
    assert.equal(stored.profile.belt, 'black');
    assert.equal(stored.rank?.tapeCount, 2);
    assert.equal(stored.rank?.awardedOn, '2010-01-02');
    assert.equal(stored.rank?.degreeFocus?.[2], 'Teach the Thursday class');
    assert.equal(stored.goals[0]?.name, 'Teaching: lead a class');
    assert.equal(stored.goals[0]?.met, true);
    assert.equal(stored.goals[0]?.belt, 'black');
  } finally {
    unmount(mounted);
  }
});

function savedGuard(now: number, source: 'coach', edited?: boolean) {
  const report = blankStudentReport(now);
  report.rubric.studentsCanEdit = edited ? undefined : false;
  report.rubric.levels = [
    {
      id: 'level.white',
      name: 'White',
      belt: 'white',
      checkpoints: [
        {
          id: 'checkpoint.white.guard',
          name: 'Guard',
          met: null,
          note: '',
          source,
          ...(edited ? { edited: true } : {}),
          criteria: [
            { id: 'rubric.white.closed-guard', requirement: 'Hold closed guard.', techniqueRefs: [{ id: 'pos.closed-guard', name: 'Closed guard' }], met: null, note: '' },
          ],
        },
      ],
    },
  ];
  if (edited) report.rubric.studentsCanEdit = true;
  return report;
}

test('a locked coach checkpoint is read-only and an edited coach checkpoint shows an asterisk', async () => {
  const locked = savedGuard(100, 'coach');
  saveStudentReport(localStorage, locked);
  const readOnly = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', /From your coach\. This practical benchmark stays as they sent it\./);
    assert.equal(hasButton('Rename Guard'), false);
    assert.equal(hasButton('Remove Guard'), false);
    assert.ok(buttonNamed('Mark Guard benchmark met'));
    assert.equal(labeled('Guard benchmark').querySelector('h2')?.textContent, 'Guard');
  } finally {
    unmount(readOnly);
  }

  saveStudentReport(localStorage, savedGuard(110, 'coach', true));
  const starred = mount(<BeltPage />);
  try {
    assert.equal(labeled('Guard* benchmark').querySelector('h2')?.textContent, 'Guard*');
    assert.match(labeled('Guard*, open').textContent ?? '', /Guard\*/);
    assert.ok(buttonNamed('Rename Guard'));
    assert.match(document.body.textContent ?? '', /Edited from the coach list\./);
    assert.equal(document.body.textContent?.includes('This practical benchmark stays as they sent it'), false);
  } finally {
    unmount(starred);
  }
});

test('stripe lists show the disclaimer, no-gi line, and brown prompts', async () => {
  saveStudentReport(localStorage, withStarterRubric(blankStudentReport(200), 200));
  const white = mount(<BeltPage />);
  try {
    assert.equal(labeled('Stripe 1, open').tagName, 'LI');
    assert.match(document.body.textContent ?? '', /Stripe 1 — First safe positions/);
    assert.match(document.body.textContent ?? '', /No-gi uses underhooks/);
    await click(buttonNamed(BENCHMARK_DISCLAIMER_SHORT));
    assert.match(document.body.textContent ?? '', new RegExp(BENCHMARK_DISCLAIMER_MEDIUM.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(buttonNamed('Restore suggested list'));
  } finally {
    unmount(white);
  }

  saveStudentReport(localStorage, setRankBelt(withStarterRubric(blankStudentReport(210), 210), 'brown', 211));
  const brown = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', new RegExp(BLACK_BELT_AGE_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(document.body.textContent?.includes('Leg locks (optional'), false);
    await click(buttonNamed('Competition'));
    assert.match(document.body.textContent ?? '', /only if you compete/);
  } finally {
    unmount(brown);
  }

  saveStudentReport(localStorage, setTrainingStyle(withStarterRubric(blankStudentReport(220), 220), 'gi', 221));
  const gi = mount(<BeltPage />);
  try {
    assert.equal(document.body.textContent?.includes('No-gi uses underhooks'), false);
    assert.equal(document.body.textContent?.includes('No-gi: Guillotine'), false);
  } finally {
    unmount(gi);
  }
});

test('My rank anchors the belt the student is wearing', () => {
  saveStudentReport(localStorage, setRankTapeCount(setRankBelt(blankStudentReport(1), 'brown', 2), 2, 3));
  const adult = mount(<RankPage />, '/student/rank?student=1#current');
  try {
    const current = document.getElementById('current');
    assert.equal(current?.classList.contains('rung--brown'), true);
    assert.equal(current?.classList.contains('is-current'), true);
    assert.equal(document.querySelector('.rung--white')?.id ?? '', '');
    assert.equal(labeled('Back. Hold for Home.').getAttribute('href'), '/student/progress?student=1');
    assert.equal(labeled('Home').getAttribute('href'), '/products?student=1');
  } finally {
    unmount(adult);
  }

  saveStudentReport(localStorage, setRankBelt(blankStudentReport(4), 'coral', 5));
  const coral = mount(<RankPage />);
  try {
    const current = document.getElementById('current');
    assert.equal(current?.classList.contains('final-row'), true);
    assert.equal(current?.querySelector('.mini-belt--red-black') instanceof HTMLElement, true);
    assert.equal(document.querySelector('.rung--black')?.id ?? '', '');
  } finally {
    unmount(coral);
  }

  let kids = setBeltMode(blankStudentReport(6), 'kids', 7);
  kids = setKidsBelt(kids, 'green-black', 8);
  kids = setKidsTapeCount(kids, 1, 9);
  saveStudentReport(localStorage, kids);
  const kidsPage = mount(<RankPage />, '/student/rank?student=1#current');
  try {
    const current = document.getElementById('current');
    assert.equal(current?.classList.contains('rung--kids'), true);
    assert.equal(current?.querySelector('[aria-label="Green/Black"]')?.getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[aria-label="Adult or kids belts"] [aria-pressed="true"]')?.textContent, 'Kids');
  } finally {
    unmount(kidsPage);
  }
});
