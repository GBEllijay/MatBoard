/**
 * Preview-only 2036 journal. Lined paper stays on typed fields.
 * Drill links, the analytics opt-in, academy autofill, lesson-plan duration, and mat time kinds.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Journal2036Page } from './Journal2036Page.tsx';
import { PREVIEW_BANNER, PREVIEW_JOURNAL_PATH, addLocalItem, lessonExpectedMinutes, seedPreview } from './model.ts';

const dom = new Window({ url: 'http://localhost/preview/journal-2036' });
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
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[PREVIEW_JOURNAL_PATH]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const nodes = [...host.querySelectorAll(tag)];
  const found = nodes.find((node) => node.getAttribute('aria-label') === name) ?? nodes.find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function setChecked(input: HTMLInputElement, checked: boolean) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  proto?.set?.call(input, checked);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function assertNotebookOnly(host: ParentNode) {
  const typed = [...host.querySelectorAll('input, textarea')].filter((node) => {
    if (node instanceof HTMLTextAreaElement) return true;
    return node instanceof HTMLInputElement && (node.type === 'text' || node.type === 'search');
  });
  assert.ok(typed.length > 0, 'expected typed fields');
  for (const node of host.querySelectorAll('input, textarea')) {
    const input = node as HTMLInputElement;
    const isTyped = node instanceof HTMLTextAreaElement || input.type === 'text' || input.type === 'search';
    const name = input.getAttribute('aria-label') || input.type;
    assert.equal(input.classList.contains('j2036-line'), isTyped, name);
    if (isTyped) assert.equal(input.getAttribute('data-surface'), 'notebook', name);
  }
  for (const node of host.querySelectorAll('button, select, ul, [role="listbox"], [role="dialog"]')) {
    assert.equal((node as HTMLElement).classList.contains('j2036-line'), false, (node as HTMLElement).getAttribute('aria-label') || node.tagName);
  }
  for (const node of host.querySelectorAll('[data-surface="app"]')) {
    assert.equal((node as HTMLElement).classList.contains('j2036-line'), false);
  }
  for (const node of host.querySelectorAll('[data-surface="notebook"]')) {
    assert.ok((node as HTMLElement).classList.contains('j2036-line'));
  }
}

test('lined paper is only on text fields; the preview banner is Advantage and not the live journal', () => {
  const mounted = mount(<Journal2036Page />);
  const { host } = mounted;
  assert.equal(host.querySelector('[data-testid="preview-banner"]')?.textContent, PREVIEW_BANNER);
  assert.equal(host.querySelector('h1')?.textContent, 'Advantage');
  assert.equal(host.querySelector('[data-testid="preview-path"]')?.textContent, PREVIEW_JOURNAL_PATH);
  assert.doesNotMatch(host.textContent ?? '', /matboard/i);
  assertNotebookOnly(host);

  click(control(host, 'button', 'Miscellaneous'));
  assert.ok(labeled(host, 'What was it').classList.contains('j2036-line'));
  assertNotebookOnly(host);

  click(control(host, 'button', 'Injury'));
  assert.ok(labeled(host, 'Injury area').classList.contains('j2036-line'));
  assert.ok(labeled(host, 'Injury note').classList.contains('j2036-line'));
  assert.equal(labeled(host, 'Injury zone').classList.contains('j2036-line'), false);
  assert.equal(labeled(host, 'Injury zone').tagName, 'SELECT');
  assertNotebookOnly(host);

  click(control(host, 'button', 'Hiatus'));
  assert.ok(labeled(host, 'Hiatus note').classList.contains('j2036-line'));
  assert.equal(labeled(host, 'Hiatus reason').tagName, 'SELECT');
  assert.equal(labeled(host, 'Hiatus reason').classList.contains('j2036-line'), false);
  assert.equal((labeled(host, 'Hiatus start') as HTMLInputElement).type, 'date');
  assert.equal(labeled(host, 'Hiatus start').classList.contains('j2036-line'), false);
  assertNotebookOnly(host);

  click(labeled(host, 'Link fundamental for drill 1'));
  const picker = labeled(host, 'Link a fundamental for drill 1');
  assert.equal(picker.getAttribute('role'), 'dialog');
  assert.equal(picker.classList.contains('j2036-line'), false);
  assert.ok(labeled(picker, 'Search fundamentals').classList.contains('j2036-line'));
  assert.equal((labeled(picker, 'Search fundamentals') as HTMLInputElement).type, 'search');
  for (const button of picker.querySelectorAll('button')) assert.equal(button.classList.contains('j2036-line'), false);
  assertNotebookOnly(host);
  unmount(mounted);
});

test('a drill links to a fundamental from the academy index', () => {
  const mounted = mount(<Journal2036Page />);
  const { host } = mounted;
  assert.equal(host.querySelector('[data-testid="drill-link-d2"]')?.textContent, 'Not linked to a fundamental');
  assert.match(host.querySelector('[data-testid="drill-link-d1"]')?.textContent ?? '', /Linked to Scissor sweep/);
  click(labeled(host, 'Link fundamental for drill 2'));
  const picker = labeled(host, 'Link a fundamental for drill 2');
  assert.equal(picker.querySelector('[data-surface="notebook"]')?.getAttribute('aria-label'), 'Search fundamentals');
  assert.ok(picker.querySelectorAll('button').length > 2);
  click(control(picker, 'button', 'Knee slice pass'));
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(host.querySelector('[data-testid="drill-link-d2"]')?.textContent, 'Linked to Knee slice pass');
  unmount(mounted);
});

test('the fundamentals toggle is opt-in and names linked drills when mat time counts', () => {
  const mounted = mount(<Journal2036Page />);
  const { host } = mounted;
  const box = labeled(host, 'Count this entry toward comprehensive analytics') as HTMLInputElement;
  assert.equal(box.type, 'checkbox');
  assert.equal(box.checked, false);
  assert.equal(box.classList.contains('j2036-line'), false);
  assert.equal(host.querySelector('[data-testid="analytics-status"]')?.textContent, 'This entry stays off comprehensive analytics.');
  setChecked(box, true);
  assert.match(
    host.querySelector('[data-testid="analytics-status"]')?.textContent ?? '',
    /Mat time counts toward comprehensive analytics and belt progress: Scissor sweep\./,
  );
  setChecked(box, false);
  assert.equal(host.querySelector('[data-testid="analytics-status"]')?.textContent, 'This entry stays off comprehensive analytics.');
  unmount(mounted);
});

test('what I learned autofills from the academy index, and a local add does not write back', () => {
  const seed = seedPreview();
  const academyBefore = seed.academyIndex.map((item) => item.name).join('|');
  const added = addLocalItem(seed.localIndex, 'Grip fight note', seed.academyIndex);
  assert.equal(seed.academyIndex.map((item) => item.name).join('|'), academyBefore);
  assert.equal(added.some((item) => item.name === 'Grip fight note' && item.source === 'local'), true);
  assert.equal(addLocalItem(added, 'Scissor sweep', seed.academyIndex).some((item) => item.name === 'Scissor sweep'), false);
  assert.equal(lessonExpectedMinutes(), 45);

  const mounted = mount(<Journal2036Page />);
  const { host } = mounted;
  const academy = () => host.querySelector('[data-testid="academy-index"]')?.textContent ?? '';
  const before = academy();
  assert.match(before, /Scissor sweep/);
  assert.doesNotMatch(before, /Grip fight note/);

  typeInto(labeled(host, 'What I learned 3') as HTMLTextAreaElement, 'scis');
  const scissorList = labeled(host, 'Suggestions for what I learned 3');
  const scissor = control(scissorList, 'button', 'Scissor sweep');
  assert.match(scissor.textContent ?? '', /Academy index/);
  click(scissor);
  assert.equal((labeled(host, 'What I learned 3') as HTMLTextAreaElement).value, 'Scissor sweep');
  assert.equal(academy(), before);

  typeInto(labeled(host, 'What I learned 2') as HTMLTextAreaElement, 'knee');
  const kneeList = labeled(host, 'Suggestions for what I learned 2');
  assert.match(control(kneeList, 'button', 'Knee slice pass').textContent ?? '', /Academy index/);
  assert.match(control(kneeList, 'button', 'Knee shield detail').textContent ?? '', /My list/);

  typeInto(labeled(host, 'What I learned 3') as HTMLTextAreaElement, 'Grip fight note');
  click(control(host, 'button', 'Add to my list'));
  assert.match(host.querySelector('[data-testid="local-index"]')?.textContent ?? '', /Grip fight note/);
  assert.equal(academy(), before);
  const buttonText = [...host.querySelectorAll('button')].map((node) => `${node.getAttribute('aria-label') ?? ''} ${node.textContent ?? ''}`).join('\n');
  assert.doesNotMatch(buttonText, /add to academy|push to academy|write to academy|save to academy/i);

  click(control(host, 'button', 'Reset to sample'));
  assert.doesNotMatch(host.querySelector('[data-testid="local-index"]')?.textContent ?? '', /Grip fight note/);
  assert.match(host.querySelector('[data-testid="local-index"]')?.textContent ?? '', /Knee shield detail/);
  assert.equal((labeled(host, 'What I learned 3') as HTMLTextAreaElement).value, '');
  unmount(mounted);
});

test('lesson-plan duration prefills mat time, and the four kinds are Class, Open mat, Miscellaneous, and Untimed', () => {
  const mounted = mount(<Journal2036Page />);
  const { host } = mounted;
  const expected = host.querySelector('[data-testid="lesson-expected"]');
  assert.equal(expected?.getAttribute('data-minutes'), '45');
  assert.match(expected?.textContent ?? '', /Expected duration from today's lesson plan: 45 min/);
  assert.match(host.textContent ?? '', /Friday fundamentals/);
  const readout = () => host.querySelector('[data-testid="mat-time-readout"]')?.textContent;
  assert.equal(readout(), 'Class · 45 min');
  for (const name of ['Class', 'Open mat', 'Miscellaneous', 'Untimed']) {
    const button = control(host, 'button', name);
    assert.equal(button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-pressed') === 'false', true);
    assert.equal(button.classList.contains('j2036-line'), false);
  }
  click(control(host, 'button', 'Open mat'));
  assert.equal(readout(), 'Open mat · 45 min');
  click(control(host, 'button', 'Miscellaneous'));
  assert.equal(readout(), 'Miscellaneous · 45 min');
  click(control(host, 'button', 'Untimed'));
  assert.equal(readout(), 'Untimed');
  click(control(host, 'button', 'Class'));
  assert.equal(readout(), 'Class · 45 min');
  unmount(mounted);
});

test('injury, break, and hiatus are optional, and reset restores the sample', () => {
  const mounted = mount(<Journal2036Page />);
  const { host } = mounted;
  assert.equal((labeled(host, 'Training partners') as HTMLTextAreaElement).value, 'Alex, Sam');
  assert.match((labeled(host, 'How it went') as HTMLTextAreaElement).value, /knee shield/);
  assert.equal(host.querySelector('[aria-label="Injury area"]'), null);

  click(control(host, 'button', 'Injury'));
  typeInto(labeled(host, 'Injury area') as HTMLInputElement, 'Left knee');
  typeInto(labeled(host, 'Injury note') as HTMLTextAreaElement, 'Tweaked on the sweep');
  click(control(host, 'button', 'Break'));
  assert.equal(host.querySelector('[aria-label="Injury area"]'), null);
  typeInto(labeled(host, 'Break note') as HTMLTextAreaElement, 'Sat out the last round');
  click(control(host, 'button', 'Hiatus'));
  assert.ok(labeled(host, 'Hiatus note'));
  assert.equal((labeled(host, 'Hiatus reason') as HTMLSelectElement).value, 'other');

  typeInto(labeled(host, 'Class') as HTMLInputElement, 'No-gi');
  click(control(host, 'button', 'Reset to sample'));
  assert.equal((labeled(host, 'Class') as HTMLInputElement).value, 'Fundamentals');
  assert.equal((labeled(host, 'Training partners') as HTMLTextAreaElement).value, 'Alex, Sam');
  assert.equal(host.querySelector('[aria-label="Hiatus note"]'), null);
  assert.equal(control(host, 'button', 'No mark').getAttribute('aria-pressed'), 'true');
  unmount(mounted);
});

test('the preview route is separate from the live student journal', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const live = readFileSync('src/pages/StudentEdition.tsx', 'utf8');
  const mat = readFileSync('src/pages/student/MatTime.tsx', 'utf8');
  const lines = readFileSync('src/pages/student/TechniqueLines.tsx', 'utf8');
  const page = readFileSync('src/preview/journal2036/Journal2036Page.tsx', 'utf8');
  assert.match(app, /path="\/preview\/journal-2036" element=\{<Journal2036Page/);
  assert.match(app, /path="\/student\/\*" element=\{<StudentEditionPage/);
  assert.doesNotMatch(live, /Journal2036|journal2036|preview\/journal-2036/);
  assert.doesNotMatch(mat, /Journal2036|journal2036/);
  assert.doesNotMatch(lines, /Journal2036|journal2036/);
  assert.doesNotMatch(page, /addJournalEntry/);
});
