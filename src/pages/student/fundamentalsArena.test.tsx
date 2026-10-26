/**
 * Fundamentals controls the quiet dark restyle has to keep.
 *
 * Touched controls:
 * Back. Hold for Home. Home.
 * Overall proficiency.
 * Self-assessment, Practical benchmarks, Video Library.
 * Sort: List order, Weakest first, Recently updated.
 * Filter: All, Not started, In progress, Against resistance.
 * Per move: proficiency 0 Not started through 5 Can teach it, note, date learned.
 * Rename, Close rename, Save name, Remove, Confirm remove, Keep.
 * Add your own, Add, Restore starter list, Confirm restore starter list, Cancel.
 * Open {area} self-assessment, Open {checkpoint} benchmark,
 * and Open {clip} in Video Library when a clip matches.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { exportProgressPacket } from '../../lib/progress/format.ts';
import {
  addJournalClip,
  blankStudentReport,
  saveStudentReport,
  setFundamentalLearned,
  STUDENT_EDITION_STORAGE_KEY,
} from '../../lib/studentEdition.ts';
import { FundamentalsPage } from './FundamentalsPage.tsx';

const dom = new Window({ url: 'http://localhost/student/fundamentals' });
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
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/student/fundamentals']}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

test('fundamentals keeps every control on the dark arena surface', () => {
  localStorage.clear();
  const mounted = mount(<FundamentalsPage />);
  const { host } = mounted;
  const main = host.querySelector('main');
  assert.ok(main?.classList.contains('student--arena'));
  assert.ok(main?.classList.contains('student--fundamentals'));
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student/progress');
  assert.equal(labeled(host, 'Home').getAttribute('href'), '/products');
  assert.equal(host.querySelector('h1')?.textContent, 'Fundamentals');
  assert.ok(host.textContent?.includes('0.0'));
  assert.ok(host.textContent?.includes('0 of 5 ready when a partner resists'));
  assert.equal(host.textContent?.toLowerCase().includes('live or better'), false);

  for (const name of ['Self-assessment', 'Practical benchmarks', 'Video Library', 'List order', 'Weakest first', 'Recently updated', 'All', 'Not started', 'In progress', 'Against resistance', 'Restore starter list']) {
    control(host, name === 'Self-assessment' || name === 'Practical benchmarks' || name === 'Video Library' ? 'a' : 'button', name);
  }
  const sweeps = labeled(host, 'Sweeps');
  labeled(sweeps, 'Scissor sweep proficiency');
  for (const level of [0, 1, 2, 3, 4, 5]) {
    const names = ['Not started', 'Introduced', 'Drilling', 'Live with resistance', 'Hitting in rolls', 'Can teach it'];
    labeled(sweeps, `Scissor sweep ${level} ${names[level]}`);
  }
  labeled(sweeps, 'Scissor sweep note');
  labeled(sweeps, 'Scissor sweep date learned');
  labeled(sweeps, 'Rename Scissor sweep');
  labeled(sweeps, 'Remove Scissor sweep');
  labeled(sweeps, 'Add your own to Sweeps');
  assert.equal(control(host, 'a', 'Self-assessment').getAttribute('href'), '/student/self-assessment?from=fundamentals');
  assert.equal(control(host, 'a', 'Practical benchmarks').getAttribute('href'), '/student/rubric');
  assert.equal(control(host, 'a', 'Video Library').getAttribute('href'), '/student/videos');
  assert.ok(sweeps.textContent?.includes('Not updated yet'));
  unmount(mounted);
});

test('a learned date without a level opens at live, and taps, sort, filter, notes, and links still work', () => {
  localStorage.clear();
  let report = setFundamentalLearned(
    blankStudentReport(10),
    { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' },
    true,
    '2026-10-11',
    11,
  );
  report = addJournalClip(report, 'https://example.com/scissor', 'Scissor sweep detail', 12);
  const raw = JSON.parse(exportProgressPacket(report)) as { checklist: { level?: number }[] };
  delete raw.checklist[0].level;
  localStorage.setItem(STUDENT_EDITION_STORAGE_KEY, JSON.stringify(raw));

  const mounted = mount(<FundamentalsPage />);
  const { host } = mounted;
  const sweeps = labeled(host, 'Sweeps');
  const live = labeled(sweeps, 'Scissor sweep 3 Live with resistance');
  assert.equal(live.getAttribute('aria-checked'), 'true');
  assert.ok(sweeps.textContent?.includes('1 of 5 ready when a partner resists'));
  assert.equal(
    control(sweeps, 'a', 'Open Guard self-assessment').getAttribute('href'),
    '/student/self-assessment?from=fundamentals#assess-guard',
  );
  assert.equal(control(sweeps, 'a', 'Open Guard benchmark').getAttribute('href'), '/student/rubric#checkpoint.white.guard');
  assert.equal(control(sweeps, 'a', 'Open Scissor sweep detail in Video Library').getAttribute('href')?.startsWith('/student/videos#clip-'), true);
  assert.ok(sweeps.textContent?.includes('Updated'));

  const sweepsMeter = () => labeled(host, 'Sweeps').querySelector('.fund-meter');
  const before = sweepsMeter()?.getAttribute('data-value');
  act(() => {
    labeled(sweeps, 'Scissor sweep 5 Can teach it').click();
  });
  assert.equal(labeled(sweeps, 'Scissor sweep 5 Can teach it').getAttribute('aria-checked'), 'true');
  const afterMeter = sweepsMeter();
  assert.notEqual(afterMeter?.getAttribute('data-value'), before);
  assert.equal((afterMeter?.querySelector('span') as HTMLElement | null)?.style.width.endsWith('%'), true);
  const escapes = labeled(host, 'Escapes');
  assert.equal(control(escapes, 'a', 'Open Back escape benchmark').getAttribute('href'), '/student/rubric#checkpoint.white.escapes');
  const saved = JSON.parse(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY) ?? '{}') as {
    checklist: { catalogItemId: string; level: number; learnedOn: string; note: string }[];
  };
  const scissor = saved.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor');
  assert.equal(scissor?.level, 5);
  assert.equal(scissor?.learnedOn, '2026-10-11');

  const note = labeled(labeled(host, 'Sweeps'), 'Scissor sweep note') as HTMLInputElement;
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(note, 'collar deeper');
  const noteKey = Object.keys(note).find((name) => name.startsWith('__reactProps'));
  const noteProps = noteKey
    ? (note as unknown as Record<string, { onChange?: (event: unknown) => void; onBlur?: (event: unknown) => void }>)[noteKey]
    : null;
  act(() => {
    noteProps?.onChange?.({ target: note, currentTarget: note });
  });
  act(() => {
    noteProps?.onBlur?.({ target: note, currentTarget: note });
  });
  const noted = JSON.parse(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY) ?? '{}') as {
    checklist: { catalogItemId: string; level: number; note: string }[];
  };
  assert.equal(noted.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor')?.note, 'collar deeper');
  assert.equal(noted.checklist.find((entry) => entry.catalogItemId === 'sweep.scissor')?.level, 5);

  act(() => {
    control(host, 'button', 'Weakest first').click();
  });
  const weakest = labeled(host, 'Sweeps');
  const names = [...weakest.querySelectorAll('h3')].map((node) => node.textContent);
  assert.equal(names[0], 'Flower sweep');
  assert.ok(names.indexOf('Scissor sweep') > names.indexOf('Hip bump sweep'));

  act(() => {
    control(host, 'button', 'Against resistance').click();
  });
  const liveNames = [...labeled(host, 'Sweeps').querySelectorAll('h3')].map((node) => node.textContent);
  assert.deepEqual(liveNames, ['Scissor sweep']);
  unmount(mounted);
});

test('rename, remove, add, and restore keep the saved level', () => {
  localStorage.clear();
  saveStudentReport(localStorage, blankStudentReport(10));
  const mounted = mount(<FundamentalsPage />);
  const { host } = mounted;
  const sweeps = labeled(host, 'Sweeps');
  act(() => {
    labeled(sweeps, 'Scissor sweep 4 Hitting in rolls').click();
  });
  act(() => {
    labeled(sweeps, 'Rename Scissor sweep').click();
  });
  const name = labeled(sweeps, 'New name for Scissor sweep') as HTMLInputElement;
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(name, 'Hip scissor');
  act(() => {
    const key = Object.keys(name).find((item) => item.startsWith('__reactProps'));
    const props = key ? (name as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: name, currentTarget: name });
  });
  act(() => {
    control(sweeps, 'button', 'Save name').click();
  });
  assert.equal(sweeps.querySelector('h3')?.textContent === 'Hip scissor' || [...sweeps.querySelectorAll('h3')].some((node) => node.textContent === 'Hip scissor'), true);

  act(() => {
    labeled(host, 'Remove Hip scissor').click();
  });
  act(() => {
    labeled(host, 'Confirm remove Hip scissor').click();
  });
  assert.equal([...sweeps.querySelectorAll('h3')].some((node) => node.textContent === 'Hip scissor'), false);

  const add = labeled(sweeps, 'Add your own to Sweeps') as HTMLInputElement;
  proto?.set?.call(add, 'Lasso sweep');
  act(() => {
    const key = Object.keys(add).find((item) => item.startsWith('__reactProps'));
    const props = key ? (add as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: add, currentTarget: add });
  });
  act(() => {
    control(sweeps, 'button', 'Add').click();
  });
  assert.ok([...sweeps.querySelectorAll('h3')].some((node) => node.textContent === 'Lasso sweep'));

  act(() => {
    control(host, 'button', 'Restore starter list').click();
  });
  assert.ok(host.textContent?.includes('Bring starter names back'));
  act(() => {
    control(host, 'button', 'Cancel').click();
  });
  act(() => {
    control(host, 'button', 'Restore starter list').click();
  });
  act(() => {
    control(host, 'button', 'Confirm restore starter list').click();
  });
  const restored = labeled(host, 'Sweeps');
  assert.ok([...restored.querySelectorAll('h3')].some((node) => node.textContent === 'Scissor sweep'));
  assert.equal(labeled(restored, 'Scissor sweep 4 Hitting in rolls').getAttribute('aria-checked'), 'true');
  const file = JSON.parse(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY) ?? '{}') as {
    checklist: { name: string; hidden: boolean; level: number; learnedOn: string }[];
  };
  const hiddenCustom = file.checklist.find((entry) => entry.name === 'Lasso sweep');
  assert.equal(hiddenCustom?.hidden, false);
  const scissor = file.checklist.find((entry) => entry.name === 'Scissor sweep');
  assert.equal(scissor?.level, 4);
  assert.ok(scissor?.learnedOn);
  unmount(mounted);
});
