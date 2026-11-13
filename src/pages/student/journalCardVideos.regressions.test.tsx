/**
 * Class videos on one journal card: paste a link, tag a glossary term, save, remove with confirm.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addJournalClip, addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
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
installGlobal('indexedDB', (view as unknown as { indexedDB?: unknown }).indexedDB);
const urlApi = globalThis.URL as unknown as { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
urlApi.createObjectURL = () => 'blob:card-video';
urlApi.revokeObjectURL = () => undefined;

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

function label(host: ParentNode, text: string) {
  const found = [...host.querySelectorAll('label')].find((item) => item.textContent?.trim() === text);
  assert.ok(found, text);
  return found as HTMLLabelElement;
}

test('a card with no videos shows the empty section and every add source', () => {
  const id = seed();
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniques={[{ id: '', name: 'Kimura' }]} />);
  assert.match(host.textContent ?? '', /Class videos · 2026-11-12/);
  assert.match(host.textContent ?? '', /No class videos on this card yet/);
  label(host, 'Film a move');
  label(host, 'Pick from gallery');
  button(host, 'Paste a video link');
  button(host, 'Choose a saved video');
  act(() => root.unmount());
});

test('paste a link, tag it from the glossary, save, then remove with confirm', async () => {
  const id = seed();
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniques={[{ id: '', name: 'Kimura' }]} />);
  act(() => button(host, 'Paste a video link').click());
  const link = host.querySelector('input[aria-label="Video link"]') as HTMLInputElement;
  type(link, 'not a link');
  act(() => button(host, 'Save video to card').click());
  assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /http or https/);
  type(link, 'https://youtu.be/kimura');
  // The card's one glossary technique is offered already; clear it to see the tag is required.
  assert.match(host.querySelector('[data-testid="journal-card-video-term"]')?.textContent ?? '', /Tagged: Kimura/);
  type(host.querySelector('input[aria-label="Glossary term"]') as HTMLInputElement, '');
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

test('the public demo offers every add source and keeps filmed videos in memory', () => {
  const id = seed();
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniques={[]} />, '/student/cards/card?student=1');
  button(host, 'Paste a video link');
  button(host, 'Choose a saved video');
  label(host, 'Film a move');
  assert.match(host.textContent ?? '', /not saved to this phone/);
  act(() => root.unmount());
});

test('Film a move: review the clip, tag it, and it saves on this card only (no library film, no cloud)', async () => {
  const id = seed();
  const kept = new Map<string, Blob>();
  const store = { put: async (key: string, blob: Blob) => void kept.set(key, blob), remove: async (key: string) => void kept.delete(key) };
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniques={[{ id: '', name: 'Kimura' }]} store={store} />);
  const record = document.getElementById(`journal-card-video-record-${id}`) as HTMLInputElement;
  assert.equal(record.getAttribute('capture'), 'environment');
  const clip = new File([new Uint8Array(16)], 'move.mp4', { type: 'video/mp4' });
  const files = { 0: clip, length: 1, item: (index: number) => (index === 0 ? clip : null), *[Symbol.iterator]() { yield clip; } };
  Object.defineProperty(record, 'files', { configurable: true, value: files });
  await act(async () => {
    record.dispatchEvent(new view.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  assert.ok(host.querySelector('[aria-label="Review filmed move"]'));
  assert.ok(host.querySelector('video[aria-label="Preview filmed move"]'));
  // The card has one glossary technique, so it is offered already.
  assert.match(host.querySelector('[data-testid="journal-card-video-term"]')?.textContent ?? '', /Tagged: Kimura/);
  await act(async () => {
    button(host, 'Save video to card').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  const alert = host.querySelector('[role="alert"]')?.textContent ?? '';
  assert.equal(alert, '');
  const saved = loadStudentReport(localStorage).journal[0].videos ?? [];
  assert.equal(saved.length, 1);
  assert.equal(saved[0].source, 'phone');
  assert.equal(saved[0].fileName, 'move.mp4');
  assert.equal(saved[0].filmId, undefined);
  assert.deepEqual(saved[0].term, { id: 'gl.kimura', name: 'Kimura' });
  assert.equal(localStorage.getItem('matboard.studentEdition.films.v1'), null);
  assert.equal(kept.size, 1);
  assert.ok(kept.has(saved[0].id));
  button(host, 'Play Kimura video');
  act(() => button(host, 'Remove Kimura video').click());
  act(() => button(host, 'Confirm remove').click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.equal(kept.size, 0);
  act(() => root.unmount());
});

test('Choose a saved video adds a library link by reference and keeps the library item', () => {
  const id = seed();
  let report = loadStudentReport(localStorage);
  report = addJournalClip(report, 'https://example.com/kimura', 'Kimura from guard', 30);
  saveStudentReport(localStorage, report);
  const { host, root } = mount(<JournalCardVideos entryId={id} date="2026-11-12" techniques={[{ id: '', name: 'Kimura' }]} />);
  act(() => button(host, 'Choose a saved video').click());
  const radio = host.querySelector('input[type="radio"]') as HTMLInputElement;
  act(() => radio.click());
  act(() => button(host, 'Kimura').click());
  act(() => button(host, 'Save video to card').click());
  const after = loadStudentReport(localStorage);
  assert.equal(after.journal[0].videos?.[0]?.clipId, after.clips?.[0]?.id);
  assert.equal(after.journal[0].videos?.[0]?.url, 'https://example.com/kimura');
  assert.equal(after.clips?.length, 1);
  act(() => root.unmount());
});
