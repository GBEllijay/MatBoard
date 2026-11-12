/**
 * Class videos on one journal card: paste a link, tag a glossary term, save, remove with confirm.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { JournalCardVideos } from './JournalCardVideos.tsx';

const dom = new Window({ url: 'http://localhost/student/cards/card' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('navigator', view.navigator);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, url = '/student/cards/card') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function button(host: ParentNode, text: string) {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  assert.ok(found, text);
  return found as HTMLButtonElement;
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    input.dispatchEvent(new view.Event('input', { bubbles: true }));
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function seed() {
  localStorage.clear();
  const report = addJournalEntry(blankStudentReport(1), {
    date: '2026-11-12',
    className: 'Fundamentals',
    gameTag: '',
    techniques: [{ id: '', name: 'Kimura' }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 10);
  saveStudentReport(localStorage, report);
  return report.journal[0].id;
}

test('a card with no videos shows the empty section and both add buttons', () => {
  const id = seed();
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniqueNames={['Kimura']} />);
  assert.match(host.textContent ?? '', /Class videos · 2026-11-12/);
  assert.match(host.textContent ?? '', /No class videos on this card yet/);
  button(host, 'Paste a video link');
  button(host, 'Add a video from this phone');
  act(() => root.unmount());
});

test('paste a link, tag it from the glossary, save, then remove with confirm', async () => {
  const id = seed();
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniqueNames={['Kimura']} />);
  act(() => button(host, 'Paste a video link').click());
  const link = host.querySelector('input[aria-label="Video link"]') as HTMLInputElement;
  type(link, 'not a link');
  act(() => button(host, 'Save video to card').click());
  assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /http or https/);
  type(link, 'https://youtu.be/kimura');
  act(() => button(host, 'Save video to card').click());
  assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /glossary term/);
  // One-tap tag from this card's own technique.
  act(() => button(host, 'Kimura').click());
  assert.match(host.querySelector('[data-testid="journal-card-video-term"]')?.textContent ?? '', /Tagged: Kimura/);
  // Typing three letters offers glossary terms too.
  const term = host.querySelector('input[aria-label="Glossary term"]') as HTMLInputElement;
  type(term, 'arm');
  assert.ok(host.querySelector('[aria-label="Matching glossary terms"]'));
  act(() => button(host, 'Kimura').click());
  type(host.querySelector('textarea[aria-label="Video note"]') as HTMLTextAreaElement, 'From side control');
  await act(async () => {
    button(host, 'Save video to card').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const saved = loadStudentReport(localStorage).journal[0].videos ?? [];
  assert.equal(saved.length, 1);
  assert.equal(saved[0].url, 'https://youtu.be/kimura');
  assert.deepEqual(saved[0].term, { id: 'gl.kimura', name: 'Kimura' });
  assert.equal(saved[0].note, 'From side control');
  assert.equal(host.querySelectorAll('[data-testid="journal-card-video"]').length, 1);
  const open = [...host.querySelectorAll('a')].find((item) => item.textContent === 'Open Kimura link');
  assert.equal(open?.getAttribute('href'), 'https://youtu.be/kimura');
  assert.equal(open?.getAttribute('target'), '_blank');
  act(() => button(host, 'Remove Kimura video').click());
  act(() => button(host, 'Keep video').click());
  assert.equal(loadStudentReport(localStorage).journal[0].videos?.length, 1);
  act(() => button(host, 'Remove Kimura video').click());
  act(() => button(host, 'Confirm remove').click());
  assert.equal(loadStudentReport(localStorage).journal[0].videos, undefined);
  assert.match(host.textContent ?? '', /No class videos on this card yet/);
  act(() => root.unmount());
});

test('the public demo offers links only', () => {
  const id = seed();
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniqueNames={[]} />, '/student/cards/card?student=1');
  button(host, 'Paste a video link');
  assert.equal([...host.querySelectorAll('button')].some((item) => item.textContent === 'Add a video from this phone'), false);
  act(() => root.unmount());
});
