/**
 * My rank controls. Belt tap stays a belt change. A stripe tap opens the
 * stripe detail, where a photo and a date are each optional and removable.
 * An undated stripe does not show a stand-in date.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import type { StudentProgressReport } from '../../lib/progress/types';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { RANK_PHOTO_KEY } from '../../lib/rankPhotos.ts';
import { BENCHMARK_DISCLAIMER_MEDIUM, BENCHMARK_DISCLAIMER_SHORT, BLACK_BELT_AGE_NOTE } from '../../lib/studentBenchmarks.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport, setFundamentalLevel, setTrainingStyle } from '../../lib/studentEdition.ts';
import { OPEN_GOAL_LINE, TIME_BASED_PROGRESS, withStarterRubric } from '../../lib/studentTools.ts';
import { setBeltMode, setBirthYear, setKidsBelt, setKidsTapeCount } from '../../lib/beltBook.ts';
import { ProfilePage } from './ProfilePage.tsx';
import { INSTRUCTOR_BARS_LABEL } from '../../lib/blackBeltDegrees.ts';
import { setInstructorBars, setInstructorBarsOn, setRankAwardedOn, setRankBelt, setRankTapeCount, setRankTapeDate } from '../../lib/studentRank.ts';
import { TermsPage } from '../Terms.tsx';
import { BeltPage } from './BeltPage.tsx';
import { RankPage } from './RankPage.tsx';
import { withLegacySavedRubric } from '../../lib/testFixtures/legacySavedRubric.ts';

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

async function dateEvent(input: HTMLInputElement, name: 'onFocus' | 'onChange' | 'onBlur', value?: string) {
  await act(async () => {
    if (value != null) {
      const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
      proto?.set?.call(input, value);
    }
    reactProps(input)?.[name]?.({ target: input, currentTarget: input } as never);
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

test('a saved stripe photo stays visible on the belt', () => {
  const css = readFileSync('src/pages/student/beltWeave.css', 'utf8');
  const start = css.indexOf(':is(.student.student--rank, .s-belt-mark) .rank-stripe-thumb');
  const rule = css.slice(start, css.indexOf('}', start));
  assert.doesNotMatch(rule, /clip:\s*rect/);
  assert.match(rule, /border-radius:\s*50%/);
  assert.match(rule, /width:\s*20px/);
  const report = setRankTapeCount(blankStudentReport(18), 1, 19);
  saveStudentReport(localStorage, report);
  localStorage.setItem(RANK_PHOTO_KEY, JSON.stringify({ tapes: { white: [[STRIPE_PHOTO], [], [], []] } }));
  const mounted = mount(<RankPage />);
  try {
    const onBelt = document.querySelector('img.rank-stripe-saved__thumb');
    assert.ok(onBelt instanceof HTMLImageElement);
    assert.equal(onBelt.getAttribute('alt'), 'White stripe 1 photo');
    assert.equal(onBelt.getAttribute('src'), STRIPE_PHOTO);
    const badge = document.querySelector('img.rank-stripe-thumb');
    assert.ok(badge instanceof HTMLImageElement);
    assert.equal(badge.getAttribute('src'), STRIPE_PHOTO);
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
    // A new file starts with three editable seed cards and no box row.
    assert.equal(document.querySelector('.checkpoint-row'), null);
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
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
    assert.equal(document.querySelectorAll('[aria-label="Kids belt ladder"] > li').length, 13);
    assert.equal(document.querySelector('[role="status"]'), null);
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

test('kids belts show one stripe slot per tape, including 5 on grey/white and 11 elsewhere', async () => {
  saveStudentReport(localStorage, setBeltMode(blankStudentReport(80), 'kids', 81));
  const mounted = mount(<RankPage />);
  try {
    const greyWhite = buttonNamed('Grey/White').closest('li');
    assert.match(greyWhite?.className ?? '', /rank-rung/);
    assert.match(greyWhite?.className ?? '', /rung--kids-ink-navy/);
    assert.equal(greyWhite?.querySelectorAll('.belt__bar button').length, 5);
    assert.equal(document.querySelector('[aria-label="Stripes"]')?.querySelectorAll('button').length, 5);
    assert.equal(document.querySelector('[aria-label="Grey stripes"]')?.querySelectorAll('button').length, 11);
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
    assert.equal(labeled('Stripe 5').getAttribute('aria-pressed'), 'false');
    await click(labeled('Stripe 5'));
    assert.match(tape('Stripe 5'), /#d21f1f/i);
    await click(buttonNamed('Add a class'));
    const stored = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      beltBook?: { kids?: { beltId?: string; tapeCount?: number; classCount?: number } };
    };
    assert.equal(stored.beltBook?.kids?.beltId, 'grey-white');
    assert.equal(stored.beltBook?.kids?.tapeCount, 5);
    assert.equal(stored.beltBook?.kids?.classCount, 1);

    await click(buttonNamed('Grey'));
    await click(labeled('Stripe 11'));
    assert.match(tape('Stripe 9'), /#121214/i);
    assert.match(tape('Stripe 11'), /#121214/i);
    assert.equal(labeled('Last 3 stripe color') instanceof HTMLInputElement, true);
    const grey = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      beltBook?: { kids?: { beltId?: string; tapeCount?: number } };
    };
    assert.equal(grey.beltBook?.kids?.beltId, 'grey');
    assert.equal(grey.beltBook?.kids?.tapeCount, 11);

    await click(buttonNamed('White'));
    await click(labeled('Stripe 5'));
    assert.match(tape('Stripe 5'), /#d21f1f/i);
    const white = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      beltBook?: { kids?: { beltId?: string; tapeCount?: number } };
    };
    assert.equal(white.beltBook?.kids?.beltId, 'white');
    assert.equal(white.beltBook?.kids?.tapeCount, 5);
    assert.equal(document.querySelector('[aria-label="Last 3 stripe color"]'), null);
  } finally {
    unmount(mounted);
  }
});

test('the 16-year prompt starts the adult belt and keeps kids belts under Earlier belts', async () => {
  let report = setBeltMode(blankStudentReport(40), 'kids', 41);
  report = setBirthYear(report, new Date().getFullYear() - 16, 42);
  report = setKidsBelt(report, 'orange', 43);
  report = setKidsTapeCount(report, 2, 44);
  saveStudentReport(localStorage, report);
  const mounted = mount(<RankPage />);
  try {
    assert.match(document.body.textContent ?? '', /Time to switch to the adult system/);
    assert.ok(buttonNamed('Start at blue'));
    assert.equal(hasButton('Start at purple'), false);
    assert.equal(hasButton('Stay on white'), false);
    await click(buttonNamed('Start at blue'));
    assert.equal(buttonNamed('Blue').getAttribute('aria-pressed'), 'true');
    assert.ok(document.querySelector('[aria-label="Earlier belts"]'));
    assert.match(document.querySelector('[aria-label="Earlier belts"]')?.textContent ?? '', /Orange/);
    assert.equal(document.querySelector('[aria-label="Remove Orange history"]'), null);
    const stored = JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
      profile?: { belt?: string };
      beltBook?: { templateId?: string; kids?: { beltId?: string; tapeCount?: number } };
    };
    assert.equal(stored.profile?.belt, 'blue');
    assert.equal(stored.beltBook?.templateId, 'adult-ibjjf@1');
    assert.equal(stored.beltBook?.kids?.beltId, 'orange');
    assert.equal(stored.beltBook?.kids?.tapeCount, 2);
    const cheer = document.querySelector('.kids-grandmaster');
    assert.ok(cheer instanceof HTMLElement);
    assert.match(cheer.textContent ?? '', /Congratulations, Coach!/);
    assert.match(cheer.textContent ?? '', /The blue belt is yours\./);
    assert.match(cheer.querySelector('img')?.getAttribute('src') ?? '', /^\/assets\/kids\/grandmaster-(?:classic|[a-d])\.webp$/);
    await click(buttonNamed('Got it'));
    assert.equal(document.querySelector('.kids-grandmaster'), null);
  } finally {
    unmount(mounted);
  }
  const again = mount(<RankPage />);
  try {
    assert.equal(document.querySelector('.kids-grandmaster'), null);
    assert.equal(document.body.textContent?.includes('Congratulations, Coach!'), false);
  } finally {
    unmount(again);
  }
});

test('The grandmaster congratulates a blue-belt graduation once, and not a white or purple choice', async () => {
  const at16 = (beltId: 'white' | 'green') => {
    let report = setBeltMode(blankStudentReport(40), 'kids', 41);
    report = setBirthYear(report, new Date().getFullYear() - 16, 42);
    report = setKidsBelt(report, beltId, 43);
    return report;
  };
  saveStudentReport(localStorage, at16('white'));
  const white = mount(<RankPage />);
  try {
    await click(buttonNamed('Stay on white'));
    assert.equal(buttonNamed('White').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('.kids-grandmaster'), null);
  } finally {
    unmount(white);
  }
  saveStudentReport(localStorage, at16('green'));
  const purple = mount(<RankPage />);
  try {
    await click(buttonNamed('Start at purple'));
    assert.equal(buttonNamed('Purple').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('.kids-grandmaster'), null);
  } finally {
    unmount(purple);
  }
  saveStudentReport(localStorage, at16('green'));
  const blue = mount(<RankPage />);
  try {
    await click(buttonNamed('Start at blue'));
    assert.match(document.querySelector('.kids-grandmaster')?.textContent ?? '', /Coach/);
    await click(buttonNamed('Got it'));
    assert.equal(document.querySelector('.kids-grandmaster'), null);
  } finally {
    unmount(blue);
  }
});

test('a kids profile shows her photo on this phone, and reports stay off until a parent turns that on', async () => {
  const report = setBeltMode(blankStudentReport(50), 'kids', 51);
  report.profile.gymName = 'North Gym';
  saveStudentReport(localStorage, report);
  const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  localStorage.setItem('matboard.studentPortrait.v1', JSON.stringify({ version: 1, dataUrl: portrait }));
  const mounted = mount(<ProfilePage />, '/student/profile?student=1');
  try {
    assert.ok(document.querySelector('[aria-label="Kid or Adult"]'));
    assert.ok(labeled('Birth year'));
    assert.equal(buttonNamed('Kid').getAttribute('aria-pressed'), 'true');
    assert.equal(buttonNamed('Gi').getAttribute('aria-checked'), 'true');
    assert.equal(buttonNamed('Both').getAttribute('aria-checked'), 'false');
    assert.match(document.body.textContent ?? '', /Illegal under 16/);
    assert.match(document.body.textContent ?? '', /coach or parent/);
    assert.doesNotMatch(document.body.textContent ?? '', /Gracie Barra|Alliance/);
    const avatar = document.querySelector('img.profile-avatar');
    assert.ok(avatar instanceof HTMLImageElement);
    assert.equal(avatar.getAttribute('src'), portrait);
    assert.equal(document.querySelector('.profile-corner img[alt="Profile photo"]')?.getAttribute('src'), portrait);
    assert.match(document.body.textContent ?? '', /Change photo/);
    assert.equal(buttonNamed('Remove photo').textContent?.trim(), 'Remove photo');
    const photoSwitch = [...document.querySelectorAll('[role="switch"]')].find((node) => node.textContent?.includes('Photo on reports'));
    assert.equal(photoSwitch?.getAttribute('aria-checked'), 'false');
    await click(buttonNamed('Adult'));
    assert.match(document.body.textContent ?? '', /Your history stays/);
    await click(buttonNamed('Stay'));
    assert.equal(buttonNamed('Kid').getAttribute('aria-pressed'), 'true');
  } finally {
    unmount(mounted);
  }
});

test('a kids profile with no photo shows the gym name in the corner', () => {
  const report = setBeltMode(blankStudentReport(52), 'kids', 53);
  report.profile.gymName = 'North Gym';
  saveStudentReport(localStorage, report);
  const mounted = mount(<ProfilePage />, '/student/profile?student=1');
  try {
    assert.equal(document.querySelector('img.profile-avatar'), null);
    assert.match(document.querySelector('.profile-corner__name')?.textContent ?? '', /North Gym/);
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
      return stripe.getAttribute('aria-pressed') === 'true' || stripe.classList.contains('is-on');
    };
    await click(buttonNamed('Grey/White'));
    await click(labeled('Stripe 4'));
    await click(labeled('Stripe 1'));
    await click(labeled('Stripe 5'));
    assert.equal(filled('Stripe 1'), true);
    assert.equal(filled('Stripe 5'), true);
    for (const name of ['Stripe 5', 'Stripe 4', 'Stripe 3', 'Stripe 2', 'Stripe 1']) await click(labeled(name));
    for (const slot of [1, 2, 3, 4, 5]) assert.equal(filled(`Stripe ${slot}`), false);
    await click(buttonNamed('White'));
    for (const slot of [1, 2, 3, 4, 5]) assert.equal(filled(`Grey/White stripe ${slot}`), false);
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

/** These tests are about tap-to-add goals, so they start from a file with no seeded goal prompts. */
function withoutGoalSeeds(report: StudentProgressReport): StudentProgressReport {
  return { ...report, goals: report.goals.filter((goal) => !goal.id.startsWith('goal.seed.')) };
}

test('kids belt progress gets the three starter prompts in both lists, once', async () => {
  let report = setRankBelt(blankStudentReport(70), 'blue', 71);
  report = setBeltMode(report, 'kids', 72);
  saveStudentReport(localStorage, report);
  const kids = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', /Practical Benchmarks/);
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
    for (const name of ['Techniques your instructor calls out in class', 'Positions your coach wants you working', 'Whatever they name before your next promotion']) {
      assert.equal((labeled(`Edit ${name}`) as HTMLTextAreaElement).value, name);
    }
    for (const name of ['How often you want to train', 'One thing you want to feel confident in', 'Anything else on your mind']) {
      assert.equal((labeled(`Edit ${name}`) as HTMLTextAreaElement).value, name);
    }
    const seedLine = "These are seeds, not requirements — add what your instructor actually said, or your own words, and delete what doesn't fit.";
    assert.equal((document.body.textContent ?? '').split(seedLine).length - 1, 2);
    assert.equal((document.body.textContent ?? '').includes(BENCHMARK_DISCLAIMER_MEDIUM), true);
    assert.doesNotMatch(document.body.textContent ?? '', /stripe/i);
    assert.ok(buttonNamed('Add another practical benchmark'));
    assert.ok(document.querySelector('[aria-label="Personal Goals"]'));
    assert.equal(labeled('Personal goals count').textContent, '3 personal goals added, 0 met.');
    assert.equal(document.querySelector('[aria-label="Practical benchmarks between White and Blue"]'), null);
    assert.equal(document.body.textContent?.includes('Next: 1st degree'), false);
    assert.equal(document.body.textContent?.includes('not on this page yet'), false);
    await click(buttonNamed('Add another practical benchmark'));
    await typeControl(labeled('Edit New practical benchmark') as HTMLInputElement, 'Breakfall');
    await submitNamed('Save New practical benchmark');
    assert.equal((labeled('Edit Breakfall') as HTMLInputElement).value, 'Breakfall');
    assert.equal(labeled('Practical benchmarks count').textContent, '4 practical benchmarks added, 0 met.');
    await click(buttonNamed('Remove Techniques your instructor calls out in class'));
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
    assert.ok(buttonNamed('Competition'));
    await click(buttonNamed('Competition'));
    assert.match(document.body.textContent ?? '', /Competition prompt is on/);
    assert.equal(document.body.textContent?.includes('Tap to add: results'), false);
  } finally {
    unmount(kids);
  }
  const kidsAgain = mount(<BeltPage />);
  try {
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
    assert.equal(document.querySelector('[aria-label="Edit Techniques your instructor calls out in class"]'), null);
  } finally {
    unmount(kidsAgain);
  }
  const back = setBeltMode(report, 'adult', 73);
  saveStudentReport(localStorage, back);
  const adult = mount(<BeltPage />);
  try {
    assert.equal(document.querySelector('.checkpoint-row'), null);
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
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
    // The count is what was added and what the student marked met. No requirement or glossary extras.
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
    assert.equal(document.querySelector('.checkpoint-row'), null);
    assert.equal(document.body.textContent?.includes('Counted from your fundamentals'), false);
    assert.equal(document.body.textContent?.includes('Closed guard, Scissor sweep'), false);
    assert.equal(document.body.textContent?.includes('Hold closed guard.'), false);
    assert.equal(labeled('Practical Benchmarks').tagName, 'SECTION');
    assert.match(document.body.textContent ?? '', /These are the techniques and positions that your instructor or coach has indicated are expected\./);
    await click(buttonNamed('Mark Guard benchmark met'));
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 1 met.');
    assert.equal(document.querySelector('[aria-label="Personal goal name"]'), null);
    assert.ok(buttonNamed('Add another personal goal'));
    assert.equal(labeled('Personal goals count').textContent, 'No personal goals added yet.');
  } finally {
    unmount(mounted);
  }
});

test('brown tap-to-add goals can be edited and removed without becoming checkpoints', async () => {
  const report = setRankBelt(withoutGoalSeeds(withStarterRubric(withLegacySavedRubric(blankStudentReport(80)), 80)), 'brown', 81);
  saveStudentReport(localStorage, report);
  const mounted = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', new RegExp(OPEN_GOAL_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(document.querySelector('[aria-label="Tap to add"]'));
    assert.ok(buttonNamed('Add another personal goal'));
    assert.equal(document.querySelector('[aria-label="Goal name"]'), null);
    assert.match(document.body.textContent ?? '', /These are the goals that you're setting for yourself and hope to achieve before your next promotion\./);
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
    assert.equal(hasButton('Teaching: lead a class'), false);
  } finally {
    unmount(mounted);
  }
});

test('a dismissed suggestion stays gone after reload, and removing an adopted one does not bring it back', async () => {
  let report = setRankBelt(withoutGoalSeeds(withStarterRubric(withLegacySavedRubric(blankStudentReport(300)), 300)), 'brown', 301);
  report = setRankAwardedOn(report, '2021-02-03', 302);
  report = setRankTapeCount(report, 2, 303);
  report.rubric.studentsCanEdit = false;
  const brown = report.rubric.levels.find((level) => level.belt === 'brown');
  assert.ok(brown);
  brown.checkpoints = [
    ...brown.checkpoints,
    {
      id: 'checkpoint.brown.coach-lock',
      name: 'Coach requires this',
      met: null,
      note: 'Keep this',
      source: 'coach',
      criteria: [],
    },
  ];
  saveStudentReport(localStorage, report);
  const first = mount(<BeltPage />);
  try {
    assert.ok(buttonNamed('Dismiss Lineage and history'));
    assert.match(document.body.textContent ?? '', /From your coach\. This practical benchmark stays as they sent it\./);
    assert.equal(hasButton('Remove Coach requires this'), false);
    await click(buttonNamed('Dismiss Lineage and history'));
    assert.equal(hasButton('Lineage and history'), false);
    assert.equal(hasButton('Dismiss Lineage and history'), false);
    const stored = loadStudentReport(localStorage);
    assert.deepEqual(stored.dismissedGoalPrompts, ['Lineage and history']);
    assert.equal(stored.goals.length, 0);
    assert.equal(stored.profile.belt, 'brown');
    assert.equal(stored.rank?.tapeCount, 2);
    assert.equal(stored.rank?.awardedOn, '2021-02-03');
    assert.equal(stored.rubric.studentsCanEdit, false);
    assert.equal(
      stored.rubric.levels.find((level) => level.belt === 'brown')?.checkpoints.some((row) => row.id === 'checkpoint.brown.coach-lock' && row.note === 'Keep this'),
      true,
    );
  } finally {
    unmount(first);
  }

  const again = mount(<BeltPage />);
  try {
    assert.equal(hasButton('Lineage and history'), false);
    assert.equal(hasButton('Dismiss Lineage and history'), false);
    assert.ok(buttonNamed('Teaching: lead a class'));
    await click(buttonNamed('Teaching: lead a class'));
    await typeControl(labeled('Edit Teaching: lead a class') as HTMLInputElement, 'Lead the kids class');
    await submitNamed('Save Teaching: lead a class');
    assert.equal(hasButton('Teaching: lead a class'), false);
    await click(buttonNamed('Remove Lead the kids class'));
    assert.equal(hasButton('Teaching: lead a class'), false);
    assert.equal(loadStudentReport(localStorage).goals.length, 0);
    assert.ok(loadStudentReport(localStorage).dismissedGoalPrompts?.includes('Teaching: lead a class'));
    await click(buttonNamed('Add another personal goal'));
    await typeControl(labeled('Edit New personal goal') as HTMLInputElement, 'Film my closed guard');
    await typeControl(labeled('Note for New personal goal') as HTMLInputElement, 'from the knees');
    await submitNamed('Save New personal goal');
    await click(buttonNamed('Mark Film my closed guard met'));
    const custom = loadStudentReport(localStorage);
    assert.equal(custom.goals[0]?.name, 'Film my closed guard');
    assert.equal(custom.goals[0]?.note, 'from the knees');
    assert.equal(custom.goals[0]?.met, true);
    assert.equal(custom.goals[0]?.prompt, undefined);
    await click(buttonNamed('Remove Film my closed guard'));
    const cleared = loadStudentReport(localStorage);
    assert.equal(cleared.goals.length, 0);
    assert.equal(cleared.dismissedGoalPrompts?.includes('Film my closed guard'), false);
    assert.equal(cleared.dismissedGoalPrompts?.includes('Lineage and history'), true);
    assert.equal(cleared.dismissedGoalPrompts?.includes('Teaching: lead a class'), true);
    assert.equal(hasButton('Remove Coach requires this'), false);
    assert.equal(cleared.profile.belt, 'brown');
    assert.equal(cleared.rank?.tapeCount, 2);
    assert.ok(buttonNamed('Add another personal goal'));
    assert.ok(buttonNamed('Competition or rolling goals'));
  } finally {
    unmount(again);
  }
});

test('black belt goals and degree focus do not change degree milestones', async () => {
  let report = setRankBelt(withoutGoalSeeds(withStarterRubric(withLegacySavedRubric(blankStudentReport(90)), 90)), 'black', 91);
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
    assert.equal((labeled('Guard* benchmark').querySelector('textarea[aria-label="Edit Guard"]') as HTMLTextAreaElement | null)?.value, 'Guard');
    assert.ok(buttonNamed('Remove Guard'));
    assert.match(document.body.textContent ?? '', /Edited from the coach list\./);
    assert.equal(document.body.textContent?.includes('This practical benchmark stays as they sent it'), false);
  } finally {
    unmount(starred);
  }
});

test('a new file shows three seed cards per list, the preface, seed lines and Add another, never reseeded after a delete', async () => {
  saveStudentReport(localStorage, blankStudentReport(190));
  const white = mount(<BeltPage />);
  try {
    const text = document.body.textContent ?? '';
    assert.equal(text.includes('Advantage does not set requirements. Your federation and your instructor decide all actual promotion requirements.'), true);
    assert.doesNotMatch(text, /commonly taught|stripe|0 of 0|NaN/i);
    assert.equal(document.querySelector('.checkpoint-row'), null);
    assert.equal(document.querySelector('.belt-stripe'), null);
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
    assert.equal(labeled('Personal goals count').textContent, '3 personal goals added, 0 met.');
    for (const name of ['Techniques your instructor calls out in class', 'Positions your coach wants you working', 'Whatever they name before your next promotion']) {
      assert.equal((labeled(`Edit ${name}`) as HTMLInputElement).value, name);
      assert.ok(labeled(`${name} note`));
      assert.ok(buttonNamed(`Mark ${name} benchmark met`));
    }
    for (const name of ['How often you want to train', 'One thing you want to feel confident in', 'Anything else on your mind']) {
      assert.equal((labeled(`Edit ${name}`) as HTMLInputElement).value, name);
    }
    const seedLine = "These are seeds, not requirements — add what your instructor actually said, or your own words, and delete what doesn't fit.";
    assert.equal(text.split(seedLine).length - 1, 2);
    assert.equal([...document.querySelectorAll('button')].some((b) => /Restore/.test(b.textContent ?? '')), false);
    assert.equal(document.querySelector('[aria-label="Practical benchmark name"]'), null);
    assert.equal(buttonNamed('Add another practical benchmark').textContent, 'Add another');
    assert.equal(buttonNamed('Add another personal goal').textContent, 'Add another');

    await click(buttonNamed('Mark Positions your coach wants you working benchmark met'));
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 1 met.');
    await typeControl(labeled('Edit Techniques your instructor calls out in class') as HTMLInputElement, 'Knee shield from half guard', 'blur');
    assert.ok(labeled('Edit Knee shield from half guard'));
    await click(buttonNamed('Add another practical benchmark'));
    assert.equal((labeled('Edit New practical benchmark') as HTMLInputElement).value, 'New practical benchmark');
    assert.equal(labeled('Practical benchmarks count').textContent, '4 practical benchmarks added, 1 met.');
    await click(buttonNamed('Remove Whatever they name before your next promotion'));
    await click(buttonNamed('Confirm remove Whatever they name before your next promotion'));
    await click(buttonNamed('Remove Anything else on your mind'));
    assert.equal(labeled('Personal goals count').textContent, '2 personal goals added, 0 met.');
  } finally {
    unmount(white);
  }
  const again = mount(<BeltPage />);
  try {
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 1 met.');
    assert.equal(labeled('Personal goals count').textContent, '2 personal goals added, 0 met.');
    assert.equal(document.querySelector('[aria-label="Edit Whatever they name before your next promotion"]'), null);
    assert.equal(document.querySelector('[aria-label="Edit Anything else on your mind"]'), null);
  } finally {
    unmount(again);
  }

  saveStudentReport(localStorage, setRankBelt(blankStudentReport(195), 'brown', 196));
  const brown = mount(<BeltPage />);
  try {
    assert.equal(labeled('Practical benchmarks count').textContent, '3 practical benchmarks added, 0 met.');
    assert.equal([...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Competition'), false);
  } finally {
    unmount(brown);
  }
});

test('black belt shows the Practical benchmarks section with one blank card that is not counted, and the three goal prompts', async () => {
  saveStudentReport(localStorage, setRankBelt(blankStudentReport(600), 'black', 601));
  const first = mount(<BeltPage />);
  try {
    const section = labeled('Practical Benchmarks');
    assert.equal(section.tagName, 'SECTION');
    assert.equal(labeled('Practical benchmarks count').textContent, 'No practical benchmarks added yet.');
    const blank = labeled('Edit blank practical benchmark') as HTMLTextAreaElement;
    assert.equal(blank.value, '');
    assert.equal(blank.getAttribute('placeholder'), 'Name this practical benchmark');
    assert.equal(document.querySelector('[aria-label="Edit Techniques your instructor calls out in class"]'), null);
    const text = document.body.textContent ?? '';
    const seedLine = "These are seeds, not requirements — add what your instructor actually said, or your own words, and delete what doesn't fit.";
    assert.equal(text.split(seedLine).length - 1, 1, 'only under Personal goals');
    assert.ok(buttonNamed('Add another practical benchmark'));
    assert.equal(labeled('Personal goals count').textContent, '3 personal goals added, 0 met.');
    for (const name of ['How often you want to train', 'One thing you want to feel confident in', 'Anything else on your mind']) {
      assert.equal((labeled(`Edit ${name}`) as HTMLTextAreaElement).value, name);
    }
    await typeControl(blank, 'Teach the Tuesday fundamentals class', 'blur');
    assert.equal(labeled('Practical benchmarks count').textContent, '1 practical benchmark added, 0 met.');
    await click(buttonNamed('Remove Teach the Tuesday fundamentals class'));
    await click(buttonNamed('Confirm remove Teach the Tuesday fundamentals class'));
    assert.equal(document.querySelector('[aria-label="Edit blank practical benchmark"]'), null);
  } finally {
    unmount(first);
  }
  const again = mount(<BeltPage />);
  try {
    assert.equal(document.querySelector('[aria-label="Edit blank practical benchmark"]'), null, 'never reseeded after a delete');
    assert.equal(labeled('Practical benchmarks count').textContent, 'No practical benchmarks added yet.');
    assert.equal(loadStudentReport(localStorage).profile.belt, 'black');
  } finally {
    unmount(again);
  }
});

test('each list on Belt progress opens with its own line under the heading, on adult, kids and black belt', async () => {
  const BENCH = 'These are the techniques and positions that your instructor or coach has indicated are expected.';
  const GOALS = "These are the goals that you're setting for yourself and hope to achieve before your next promotion.";
  const files = [
    ['adult', blankStudentReport(700)],
    ['kids', setBeltMode(blankStudentReport(710), 'kids', 711)],
    ['black', setRankBelt(blankStudentReport(720), 'black', 721)],
  ] as const;
  for (const [name, file] of files) {
    saveStudentReport(localStorage, file);
    const mounted = mount(<BeltPage />);
    try {
      const bench = labeled('Practical Benchmarks');
      const goals = labeled('Personal Goals');
      const benchLine = [...bench.querySelectorAll('p')].find((p) => p.textContent === BENCH);
      const goalLine = [...goals.querySelectorAll('p')].find((p) => p.textContent === GOALS);
      assert.ok(benchLine, `${name}: benchmarks line`);
      assert.ok(goalLine, `${name}: goals line`);
      assert.equal(goals.querySelector('h2')?.nextElementSibling, goalLine, `${name}: goals line sits right under the heading`);
      const text = document.body.textContent ?? '';
      assert.equal(text.split(BENCH).length - 1, 1, `${name}: one benchmarks line`);
      assert.equal(text.split(GOALS).length - 1, 1, `${name}: one goals line`);
      assert.equal(text.includes('Skills the coach or template expects before the next belt.'), false, `${name}: old line replaced`);
      assert.equal(text.includes('Your own goals, which never affect belt or degree milestones.'), false, `${name}: old line replaced`);
      // The line comes before the count and the cards.
      const count = labeled('Practical benchmarks count');
      assert.ok(benchLine!.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING);
    } finally {
      unmount(mounted);
    }
  }
});

test('benchmark and goal names are wrapping one-line fields: Enter saves and newlines are never stored', async () => {
  saveStudentReport(localStorage, blankStudentReport(220));
  const mounted = mount(<BeltPage />);
  try {
    for (const name of ['Techniques your instructor calls out in class', 'How often you want to train']) {
      const field = labeled(`Edit ${name}`);
      assert.equal(field.tagName, 'TEXTAREA', `${name} wraps instead of cutting off`);
      assert.equal(field.getAttribute('rows'), '1');
      assert.ok(field.classList.contains('name-field'));
      assert.equal((field as HTMLTextAreaElement).value, name);
    }
    const bench = labeled('Edit Techniques your instructor calls out in class') as HTMLTextAreaElement;
    await typeControl(bench, 'Knee shield\nfrom half guard');
    assert.equal(bench.value, 'Knee shield from half guard');
    await act(async () => {
      reactProps(bench)?.onKeyDown?.({ key: 'Enter', preventDefault() {}, currentTarget: bench } as never);
    });
    await typeControl(bench, bench.value, 'blur');
    const saved = loadStudentReport(localStorage).rubric.levels.find((level) => level.belt === 'white');
    assert.equal(saved?.checkpoints[0]?.name, 'Knee shield from half guard');
    assert.equal(saved?.checkpoints.some((row) => /[\r\n]/.test(row.name)), false);

    const goal = labeled('Edit How often you want to train') as HTMLTextAreaElement;
    await typeControl(goal, 'Three\r\nclasses a week');
    assert.equal(goal.value, 'Three classes a week');
    await submitNamed('Save How often you want to train');
    assert.equal(loadStudentReport(localStorage).goals.some((row) => row.name === 'Three classes a week'), true);
    assert.equal(loadStudentReport(localStorage).goals.some((row) => /[\r\n]/.test(row.name)), false);
  } finally {
    unmount(mounted);
  }
});

test('saved lists show flat cards with only name, note and Mark benchmark met, and brown prompts', async () => {
  saveStudentReport(localStorage, withStarterRubric(withLegacySavedRubric(blankStudentReport(200)), 200));
  const white = mount(<BeltPage />);
  try {
    const text = document.body.textContent ?? '';
    assert.doesNotMatch(text, /stripe/i);
    assert.equal(document.querySelector('.checkpoint-row'), null);
    assert.equal(document.querySelector('.belt-stripe'), null);
    assert.equal(text.includes('No-gi version of saved benchmark'), false);
    assert.equal(text.includes('Counted from your fundamentals'), false);
    assert.equal(text.includes('IBJJF rule book'), false);
    assert.match(labeled('Practical benchmarks count').textContent ?? '', /^\d+ practical benchmarks added, 0 met\.$/);
    const card = labeled('Saved white benchmark s1-positions benchmark');
    assert.equal((card.querySelector('textarea[aria-label="Edit Saved white benchmark s1-positions"]') as HTMLTextAreaElement | null)?.value, 'Saved white benchmark s1-positions');
    assert.ok(card.querySelector('[aria-label="Saved white benchmark s1-positions note"]'));
    assert.equal(card.querySelectorAll('.student-quiet').length, 0);
    assert.equal((document.body.textContent ?? '').includes(BENCHMARK_DISCLAIMER_MEDIUM), true);
    assert.equal(document.querySelector('.belt-disclaimer button'), null);
    assert.equal(document.querySelector('.belt-disclaimer[role="note"]')?.getAttribute('aria-label'), 'Benchmark guidelines');
    assert.equal(
      [...document.querySelectorAll('a')].find((link) => link.textContent?.trim() === 'Terms of Service')?.getAttribute('href'),
      '/terms?student=1#practical-benchmarks',
    );
    assert.equal([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Restore')), false);
  } finally {
    unmount(white);
  }
  const savedWhite = loadStudentReport(localStorage).rubric.levels.find((level) => level.belt === 'white');
  assert.equal(savedWhite?.checkpoints.length, 33);
  assert.equal(savedWhite?.checkpoints[0]?.stage, 'stripe-1');

  saveStudentReport(localStorage, setRankBelt(withStarterRubric(withLegacySavedRubric(blankStudentReport(210)), 210), 'brown', 211));
  const brown = mount(<BeltPage />);
  try {
    assert.match(document.body.textContent ?? '', new RegExp(BLACK_BELT_AGE_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(document.querySelector('[aria-label="Edit Saved brown benchmark s3-competition"]'), null);
    await click(buttonNamed('Competition'));
    assert.ok(labeled('Edit Saved brown benchmark s3-competition'));
  } finally {
    unmount(brown);
  }
});

test('Terms contain the Practical Benchmarks section', () => {
  const page = mount(<TermsPage />, '/terms#practical-benchmarks');
  try {
    const section = document.getElementById('practical-benchmarks');
    assert.ok(section instanceof HTMLElement);
    assert.match(section?.textContent ?? '', /17\. Practical Benchmarks/);
    assert.equal(
      section?.querySelector('p')?.textContent,
      'Advantage does not set requirements and does not include a list of Practical Benchmarks. A new belt starts with three editable starter prompts (black belt and up start with one blank card instead), which are seeds, not requirements, and the Practical Benchmarks feature is a place to keep the benchmarks you or your coach add. They are general guidance only, not an official curriculum, a promotion standard, or a replacement for instruction from a qualified coach. Every academy and coach sees things differently. Always review and adjust the benchmarks with your coach, who has the final say on your progress and promotions. For children, a parent or guardian is responsible for deciding what their child trains and when. Advantage App, LLC does not set, guarantee, or award belt promotions.',
    );
    assert.equal(
      BENCHMARK_DISCLAIMER_MEDIUM,
      'Advantage does not set requirements. Your federation and your instructor decide all actual promotion requirements.',
    );
    assert.match(document.body.textContent ?? '', /Last updated: October 27, 2026/);
  } finally {
    unmount(page);
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

test('a blue benchmark anchor opens Blue and scrolls, and a white anchor still scrolls on White', async () => {
  const scrolled: string[] = [];
  const previous = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function remember(this: HTMLElement) {
    scrolled.push(this.id);
  };
  saveStudentReport(localStorage, withStarterRubric(withLegacySavedRubric(blankStudentReport(80)), 81));
  const blue = mount(<BeltPage />, '/student/rubric?student=1#blue.s1-turtle');
  try {
    const turtle = document.getElementById('checkpoint.blue.s1-turtle');
    assert.ok(turtle);
    assert.equal(turtle?.classList.contains('is-anchor'), true);
    const opened = document.querySelector('[aria-label="Blue belt benchmarks"]');
    assert.equal(opened?.querySelector('h2')?.textContent, 'Blue belt');
    assert.match(opened?.textContent ?? '', /Your current belt stays White/);
    assert.ok(opened?.querySelector('textarea[aria-label="Edit Saved blue benchmark s1-turtle"]'));
    const back = [...document.querySelectorAll('a')].find((link) => link.textContent === 'Back to White belt');
    assert.equal(back?.getAttribute('href'), '/student/rubric?student=1');
    assert.ok(document.querySelector('[aria-label="Add a practical benchmark"]'));
    assert.ok(scrolled.includes('checkpoint.blue.s1-turtle'));
    assert.equal(loadStudentReport(localStorage).profile.belt, 'white');
    assert.equal(document.getElementById('checkpoint.white.s1-guard-attack')?.classList.contains('is-anchor'), false);
    await click(back as HTMLAnchorElement);
    assert.equal(document.querySelector('[aria-label="Blue belt benchmarks"]'), null);
    assert.ok(document.getElementById('checkpoint.white.s1-positions'));
  } finally {
    unmount(blue);
    HTMLElement.prototype.scrollIntoView = previous;
  }

  scrolled.length = 0;
  HTMLElement.prototype.scrollIntoView = function remember(this: HTMLElement) {
    scrolled.push(this.id);
  };
  const white = mount(<BeltPage />, '/student/rubric?student=1#checkpoint.white.s1-guard-attack');
  try {
    assert.equal(document.querySelector('[aria-label="Blue belt benchmarks"]'), null);
    const card = document.getElementById('checkpoint.white.s1-guard-attack');
    assert.ok(card);
    assert.equal(card?.classList.contains('is-anchor'), true);
    assert.equal(document.getElementById('checkpoint.blue.s1-turtle'), null);
    assert.ok(scrolled.includes('checkpoint.white.s1-guard-attack'));
    assert.equal(document.querySelector('.checkpoint-row'), null);
  } finally {
    unmount(white);
    HTMLElement.prototype.scrollIntoView = previous;
  }
});

const BLUE_PHOTO_A = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const BLUE_PHOTO_B = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';
const KIDS_PHOTO = BLUE_PHOTO_B;

function storedRankFile() {
  return JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as {
    rank?: { awardedOn?: string; tapeDates?: string[]; history?: { belt?: string; awardedOn?: string }[] };
    beltBook?: { kids?: { awardedOn?: string; beltId?: string; history?: { beltId?: string; awardedOn?: string }[] } };
  };
}

test('editing an achieved date saves the first time and stays after leaving the page', async () => {
  let report = setRankAwardedOn(blankStudentReport(30), '2014-02-15', 31);
  report = setRankBelt(report, 'blue', 32);
  report = setRankAwardedOn(report, '2015-03-26', 33);
  report = setRankTapeCount(report, 1, 34);
  report = setRankTapeDate(report, 0, '2015-06-01', 35);
  saveStudentReport(localStorage, report);
  const mounted = mount(<RankPage />);
  try {
    const blue = labeled('Date of this belt') as HTMLInputElement;
    assert.equal(blue.value, '2015-03-26');
    assert.equal(blue.parentElement?.querySelector('b')?.textContent, 'Mar 26, 2015');
    await dateEvent(blue, 'onFocus');
    await act(async () => {
      const props = reactProps(blue);
      const set = (value: string) => {
        const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(blue), 'value');
        proto?.set?.call(blue, value);
        props?.onChange?.({ target: blue, currentTarget: blue } as never);
      };
      set('');
      set('2016-04-02');
      set('2015-03-26');
    });
    assert.equal(blue.value, '2016-04-02');
    assert.equal(blue.parentElement?.querySelector('b')?.textContent, 'Apr 2, 2016');
    assert.equal(storedRankFile().rank?.awardedOn, '2016-04-02');
    assert.equal(storedRankFile().rank?.history?.find((row) => row.belt === 'white')?.awardedOn, '2014-02-15');
    assert.equal(storedRankFile().rank?.tapeDates?.[0], '2015-06-01');
    assert.equal((labeled('Date of White belt') as HTMLInputElement).value, '2014-02-15');

    const white = labeled('Date of White belt') as HTMLInputElement;
    await dateEvent(white, 'onFocus');
    await act(async () => {
      const props = reactProps(white);
      const set = (value: string) => {
        const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(white), 'value');
        proto?.set?.call(white, value);
        props?.onChange?.({ target: white, currentTarget: white } as never);
      };
      set('');
      set('2014-03-01');
      set('2014-02-15');
    });
    assert.equal(white.value, '2014-03-01');
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2016-04-02');
    assert.equal(storedRankFile().rank?.awardedOn, '2016-04-02');
    assert.equal(storedRankFile().rank?.tapeDates?.[0], '2015-06-01');
  } finally {
    unmount(mounted);
  }

  const again = mount(<RankPage />);
  try {
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2016-04-02');
    assert.equal((labeled('Date of White belt') as HTMLInputElement).value, '2014-03-01');
    assert.equal(storedRankFile().rank?.awardedOn, '2016-04-02');
    assert.equal(storedRankFile().rank?.history?.find((row) => row.belt === 'white')?.awardedOn, '2014-03-01');
    assert.equal(storedRankFile().rank?.tapeDates?.[0], '2015-06-01');
  } finally {
    unmount(again);
  }
});

test('a first achieved date still saves when the picker only publishes it on blur', async () => {
  const mounted = mount(<RankPage />);
  try {
    const white = labeled('Date of this belt') as HTMLInputElement;
    assert.equal(white.value, '');
    await dateEvent(white, 'onFocus');
    await dateEvent(white, 'onChange', '');
    assert.equal(storedRankFile().rank?.awardedOn ?? '', '');
    await dateEvent(white, 'onBlur', '2014-02-15');
    assert.equal(white.value, '2014-02-15');
    assert.equal(white.parentElement?.querySelector('b')?.textContent, 'Feb 15, 2014');
    assert.equal(storedRankFile().rank?.awardedOn, '2014-02-15');
  } finally {
    unmount(mounted);
  }
  const again = mount(<RankPage />);
  try {
    assert.equal((labeled('Date of this belt') as HTMLInputElement).value, '2014-02-15');
  } finally {
    unmount(again);
  }
});

test('My rank keeps the shared mat behind the belt cards and drops the center photo row', () => {
  const pages = readFileSync('src/pages/student/progressPages.css', 'utf8');
  const hub = readFileSync('src/pages/student/hub.css', 'utf8');
  const mat = hub.slice(hub.indexOf('.student.student--arena.s-group {'), hub.indexOf('}', hub.indexOf('.student.student--arena.s-group {')));
  assert.match(mat, /background-color:\s*var\(--mat-fill\)/);
  assert.match(mat, /background-image:\s*var\(--mat-image\)/);
  assert.doesNotMatch(mat, /url\(/);
  assert.doesNotMatch(pages, /\.student\.student--arena\.student--rank,\s*\n\.student\.student--arena\.student--belt \{\s*\n\s*background:\s*#000000/);
  const hero = pages.slice(pages.indexOf('.student.student--arena.student--rank .rank-hero {'), pages.indexOf('}', pages.indexOf('.student.student--arena.student--rank .rank-hero {')));
  assert.match(hero, /background:\s*transparent/);
  const mounted = mount(<RankPage />);
  try {
    const page = document.querySelector('main.student--rank');
    assert.equal(page?.classList.contains('s-group'), true);
    assert.equal(page?.classList.contains('student--belt'), false);
    assert.equal(document.querySelector('.rung .rank-photos'), null);
  } finally {
    unmount(mounted);
  }
});

test('each belt gallery shows only that belt and opens a photo larger', async () => {
  let report = setRankAwardedOn(blankStudentReport(40), '2014-02-15', 41);
  report = setRankBelt(report, 'blue', 42);
  report = setRankAwardedOn(report, '2015-03-26', 43);
  saveStudentReport(localStorage, report);
  localStorage.setItem(
    RANK_PHOTO_KEY,
    JSON.stringify({ belts: { white: [STRIPE_PHOTO], blue: [BLUE_PHOTO_A, BLUE_PHOTO_B] } }),
  );
  const mounted = mount(<RankPage />);
  try {
    const tools = document.querySelector('.rung--blue .rung__photo-tools');
    const stack = labeled('Open Blue photos, 2 photos');
    assert.equal(stack.classList.contains('rank-photo-stack'), true);
    assert.equal(tools?.firstElementChild, stack);
    assert.equal(stack.nextElementSibling?.classList.contains('photo'), true);
    assert.equal(tools?.lastElementChild?.classList.contains('photo'), true);
    assert.equal(stack.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(stack.querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), BLUE_PHOTO_A);
    assert.equal(stack.querySelector('.rank-photo-stack__card--mid')?.getAttribute('src'), BLUE_PHOTO_B);
    assert.equal(stack.textContent?.trim(), '');
    assert.equal(tools?.querySelector('.photo .n')?.textContent, '2');
    assert.equal(document.querySelector('.rung--blue .rank-photos'), null);
    assert.equal(document.querySelector('.rung .rank-photos'), null);
    const blueOutside = [...(document.querySelector('.rung--blue')?.querySelectorAll('img') ?? [])].filter((img) => !img.closest('.rank-photo-stack'));
    assert.equal(blueOutside.length, 0);
    const whiteStack = labeled('Open White photos, 1 photo');
    assert.equal(whiteStack.querySelectorAll('img').length, 1);
    assert.equal(whiteStack.querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), STRIPE_PHOTO);
    assert.equal(document.querySelector('.rung--purple .rank-photo-stack'), null);
    assert.ok(document.querySelector('.rung--purple .photo'));

    await click(stack);
    const dialog = document.querySelector('[aria-label="Blue gallery"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.equal(dialog.querySelector('.rank-gallery__stage')?.getAttribute('src'), BLUE_PHOTO_A);
    assert.match(dialog.textContent ?? '', /Photo 1 of 2/);
    for (const img of dialog.querySelectorAll('img')) assert.notEqual(img.getAttribute('src'), STRIPE_PHOTO);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    assert.equal(document.querySelector('.rank-gallery__stage')?.getAttribute('src'), BLUE_PHOTO_B);
    await click(labeled('Blue photo 1'));
    assert.equal(document.querySelector('.rank-gallery__stage')?.getAttribute('src'), BLUE_PHOTO_A);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(document.querySelector('[aria-label="Blue gallery"]'), null);
    assert.equal(labeled('Open Blue photos, 2 photos').getAttribute('aria-expanded'), 'false');

    await click(stack);
    await click(labeled('Remove Blue photo 1 from gallery'));
    assert.equal(document.querySelector('.rung--blue .rank-photos'), null);
    assert.equal(labeled('Open Blue photos, 1 photo').querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), BLUE_PHOTO_B);
    assert.equal(document.querySelector('.rung--purple .rank-photo-stack'), null);
    const kept = JSON.parse(localStorage.getItem(RANK_PHOTO_KEY) ?? '{}') as { belts?: { blue?: string[]; white?: string[] } };
    assert.deepEqual(kept.belts?.blue, [BLUE_PHOTO_B]);
    assert.deepEqual(kept.belts?.white, [STRIPE_PHOTO]);
  } finally {
    unmount(mounted);
  }
});

test('a kids belt gallery does not show adult or other kids belt photos', async () => {
  let report = setBeltMode(blankStudentReport(50), 'kids', 51);
  report = setKidsBelt(report, 'grey-white', 52);
  saveStudentReport(localStorage, report);
  localStorage.setItem(
    RANK_PHOTO_KEY,
    JSON.stringify({
      belts: { white: [STRIPE_PHOTO] },
      kidsBelts: { 'grey-white': [KIDS_PHOTO], grey: [BLUE_PHOTO_A] },
    }),
  );
  const mounted = mount(<RankPage />);
  try {
    const greyWhite = labeled('Grey/White').closest('li');
    const tools = greyWhite?.querySelector('.rung__photo-tools');
    const opener = labeled('Open Grey/White photos, 1 photo');
    assert.equal(opener.nextElementSibling?.classList.contains('photo'), true);
    assert.equal(tools?.querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), KIDS_PHOTO);
    await click(opener);
    const dialog = document.querySelector('[aria-label="Grey/White gallery"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.equal(dialog.querySelector('.rank-gallery__stage')?.getAttribute('src'), KIDS_PHOTO);
    for (const img of dialog.querySelectorAll('img')) {
      assert.notEqual(img.getAttribute('src'), STRIPE_PHOTO);
      assert.notEqual(img.getAttribute('src'), BLUE_PHOTO_A);
    }
    const grey = labeled('Grey').closest('li');
    assert.equal(grey?.querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), BLUE_PHOTO_A);
    assert.notEqual(grey?.querySelector('img')?.getAttribute('src'), KIDS_PHOTO);
    assert.notEqual(grey?.querySelector('img')?.getAttribute('src'), STRIPE_PHOTO);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(document.querySelector('[role="dialog"]'), null);
  } finally {
    unmount(mounted);
  }
});
