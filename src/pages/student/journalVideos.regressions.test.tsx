/**
 * One video section on a journal card. Videos the older Videos section attached still show,
 * untagged, with "Tag this". Film a move and Pick from gallery are add sources of Class videos.
 * Latest and earlier practice for the card's techniques still show.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addJournalClip, addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { loadFilms, writeFilms, type StudentFilm } from '../../lib/studentFilm.ts';
import { applyLinkIntent, setClipAnchor, setClipJournal } from '../../lib/videoAssociation.ts';
import { readWorkingGraph } from '../../lib/workingTechniques.ts';
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

function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  return { root, host };
}

function button(host: ParentNode, text: string) {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  assert.ok(found, text);
  return found as HTMLButtonElement;
}

function seed() {
  localStorage.clear();
  let report = applyLinkIntent(blankStudentReport(1), 'Waiter sweep', { kind: 'create-working' }, 2).report;
  const workingId = readWorkingGraph(report.working)?.nodes[0]?.id ?? '';
  const line = { id: '', name: 'Waiter sweep', workingId };
  const day = (date: string, className: string, now: number) => ({ date, className, gameTag: '' as const, techniques: [line], partners: '', drills: '', rolls: '', notes: '' });
  report = addJournalEntry(report, day('2026-11-01', 'First', 10), 10);
  report = addJournalEntry(report, day('2026-11-08', 'Later', 20), 20);
  const origin = report.journal[0]?.id ?? '';
  const later = report.journal[1]?.id ?? '';
  report = addJournalClip(report, 'https://example.com/waiter', 'Waiter sweep details', 11);
  const clipId = report.clips?.[0]?.id ?? '';
  report = setClipAnchor(report, clipId, { kind: 'working', id: workingId, name: 'Waiter sweep' }, 12);
  report = setClipJournal(report, clipId, origin, 13);
  const film: StudentFilm = {
    id: 'film.waiter',
    fileName: 'waiter.mp4',
    date: '2026-11-01',
    technique: 'Waiter sweep',
    note: '',
    mime: 'video/mp4',
    size: 8,
    createdAt: 1,
    updatedAt: 1,
    where: 'phone',
    provider: '',
    driveFileId: '',
    dateFolder: '2026-11-01',
    techniqueAnchor: { kind: 'working', id: workingId, name: 'Waiter sweep' },
    journalEntryId: origin,
  };
  writeFilms(localStorage, [film]);
  saveStudentReport(localStorage, report);
  return { origin, later, clipId, line };
}

test('Film a move and Pick from gallery are add sources of Class videos', () => {
  const { origin, line } = seed();
  const { host, root } = mount(<JournalCardVideos entryId={origin} date="2026-11-01" techniques={[line]} />);
  const record = document.getElementById(`journal-card-video-record-${origin}`) as HTMLInputElement | null;
  const gallery = document.getElementById(`journal-card-video-gallery-${origin}`) as HTMLInputElement | null;
  assert.equal(record?.getAttribute('capture'), 'environment');
  assert.equal(record?.getAttribute('accept'), 'video/*');
  assert.equal(gallery?.hasAttribute('capture'), false);
  const labels = [...host.querySelectorAll('label')];
  assert.equal(labels.find((item) => item.getAttribute('for') === `journal-card-video-record-${origin}`)?.textContent?.trim(), 'Film a move');
  assert.equal(labels.find((item) => item.getAttribute('for') === `journal-card-video-gallery-${origin}`)?.textContent?.trim(), 'Pick from gallery');
  button(host, 'Paste a video link');
  button(host, 'Choose a saved video');
  assert.equal(host.querySelectorAll('section').length, 1);
  act(() => root.unmount());
});

test('older videos on this card still show untagged, and Tag this keeps the library item', () => {
  const { origin, clipId, line } = seed();
  const { host, root } = mount(<JournalCardVideos entryId={origin} date="2026-11-01" techniques={[line]} />);
  assert.equal(host.querySelectorAll('[data-testid="journal-card-video-untagged"]').length, 2);
  assert.match(host.textContent ?? '', /Not tagged/);
  assert.match(host.textContent ?? '', /Latest practice · 2026-11-08/);
  act(() => button(host, 'Tag this: Waiter sweep').click());
  // The older video named its technique; that is offered as the tag.
  assert.match(host.querySelector('[data-testid="journal-card-video-term"]')?.textContent ?? '', /Waiter sweep/i);
  act(() => button(host, 'Save tag').click());
  const saved = loadStudentReport(localStorage).journal[0].videos ?? [];
  assert.equal(saved.length, 1);
  assert.match(saved[0].term.name, /^Waiter sweep$/i);
  const tagged = saved[0];
  assert.ok(tagged.filmId === 'film.waiter' || tagged.clipId === clipId);
  // Library items are unchanged.
  assert.equal(loadFilms(localStorage)[0]?.journalEntryId, origin);
  assert.equal(loadStudentReport(localStorage).clips?.[0]?.journalEntryId, origin);
  assert.equal(host.querySelectorAll('[data-testid="journal-card-video-untagged"]').length, 1);
  assert.equal(host.querySelectorAll('[data-testid="journal-card-video"]').length, 1);
  act(() => root.unmount());
});

test('a later card shows the older video under Same technique, other classes with its original class', () => {
  const { origin, later, line } = seed();
  const { host, root } = mount(<JournalCardVideos entryId={later} date="2026-11-08" techniques={[line]} />);
  const text = host.textContent ?? '';
  assert.match(text, /Same technique, other classes/);
  assert.match(text, /Earlier practice · 2026-11-01 · Waiter sweep/);
  assert.match(text, /This is the latest saved practice, 2026-11-08/);
  assert.equal(host.querySelectorAll('[data-testid="journal-card-video-untagged"]').length, 0);
  const originLink = [...host.querySelectorAll('a')].find((link) => link.textContent?.includes('Original class · 2026-11-01'));
  assert.match(originLink?.getAttribute('href') ?? '', new RegExp(origin));
  act(() => root.unmount());
});

test('removing an older video clears only its tie to this card', () => {
  const { origin, line } = seed();
  const { host, root } = mount(<JournalCardVideos entryId={origin} date="2026-11-01" techniques={[line]} />);
  act(() => button(host, 'Remove Waiter sweep details from card').click());
  act(() => button(host, 'Keep video').click());
  assert.equal(loadStudentReport(localStorage).clips?.[0]?.journalEntryId, origin);
  act(() => button(host, 'Remove Waiter sweep details from card').click());
  act(() => button(host, 'Confirm remove').click());
  assert.equal(loadStudentReport(localStorage).clips?.[0]?.journalEntryId, undefined);
  assert.equal(loadStudentReport(localStorage).clips?.length, 1);
  act(() => root.unmount());
});
