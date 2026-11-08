/**
 * Journal video history: latest practice by date, earlier dates, and a cancelled choose.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addJournalClip, addJournalEntry, blankStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { writeFilms, type StudentFilm } from '../../lib/studentFilm.ts';
import { applyLinkIntent, setClipAnchor, setClipJournal, setFilmAnchor, setFilmJournal } from '../../lib/videoAssociation.ts';
import { readWorkingGraph } from '../../lib/workingTechniques.ts';
import { JournalVideos } from './JournalVideos.tsx';

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

test('the card shows the latest practice date and a cancelled choose does not move the original class', async () => {
  localStorage.clear();
  let report = applyLinkIntent(blankStudentReport(1), 'Waiter sweep', { kind: 'create-working' }, 2).report;
  const workingId = readWorkingGraph(report.working)?.nodes[0]?.id ?? '';
  report = addJournalEntry(report, {
    date: '2026-11-01',
    className: 'First',
    gameTag: '',
    techniques: [{ id: '', name: 'Waiter sweep', workingId }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 10);
  report = addJournalEntry(report, {
    date: '2026-11-08',
    className: 'Later',
    gameTag: '',
    techniques: [{ id: '', name: 'Waiter sweep', workingId }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 20);
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
  const { host, root } = mount(
    <JournalVideos entryId={origin} date="2026-11-01" techniques={[{ id: '', name: 'Waiter sweep', workingId }]} />,
  );
  const text = host.textContent ?? '';
  assert.match(text, /Latest practice · 2026-11-08/);
  assert.match(text, /Original class for this video/);
  const record = document.getElementById(`journal-film-record-${origin}`) as HTMLInputElement | null;
  const gallery = document.getElementById(`journal-film-library-${origin}`) as HTMLInputElement | null;
  assert.equal(record?.getAttribute('capture'), 'environment');
  assert.equal(record?.getAttribute('accept'), 'video/*');
  assert.equal(gallery?.hasAttribute('capture'), false);
  assert.equal(
    [...host.querySelectorAll('label')].find((item) => item.getAttribute('for') === `journal-film-record-${origin}`)?.textContent?.trim(),
    'Film a move',
  );
  assert.equal(
    [...host.querySelectorAll('label')].find((item) => item.getAttribute('for') === `journal-film-library-${origin}`)?.textContent?.trim(),
    'Pick from gallery',
  );
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:journal-film';
    URL.revokeObjectURL = () => {};
  }
  const clip = new File([new Uint8Array(8)], 'move.mp4', { type: 'video/mp4' });
  const files = {
    0: clip,
    length: 1,
    item: (index: number) => (index === 0 ? clip : null),
    *[Symbol.iterator]() {
      yield clip;
    },
  };
  Object.defineProperty(gallery, 'files', { configurable: true, value: files });
  await act(async () => {
    gallery?.dispatchEvent(new view.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  assert.match(host.textContent ?? '', /Review filmed move|Preview filmed move|Keep/);
  act(() => {
    button(host, 'Cancel').click();
  });
  assert.equal(host.querySelector('[aria-label="Review filmed move"]'), null);
  const afterCancel = JSON.parse(localStorage.getItem('matboard.studentEdition.films.v1') ?? '{}') as { films?: unknown[] };
  assert.equal(afterCancel.films?.length, 1);
  const latest = [...host.querySelectorAll('a')].find((link) => link.textContent?.includes('Latest practice'));
  assert.match(latest?.getAttribute('href') ?? '', new RegExp(later));
  act(() => {
    button(host, 'Choose a saved video').click();
  });
  act(() => {
    button(host, 'Cancel').click();
  });
  act(() => root.unmount());
  const again = mount(
    <JournalVideos entryId={later} date="2026-11-08" techniques={[{ id: '', name: 'Waiter sweep', workingId }]} />,
  );
  assert.match(again.host.textContent ?? '', /Earlier practice · 2026-11-01 · Waiter sweep/);
  assert.match(again.host.textContent ?? '', /This is the latest saved practice, 2026-11-08/);
  const stored = JSON.parse(localStorage.getItem('matboard.studentEdition.films.v1') ?? '{}') as { films?: { journalEntryId?: string }[] };
  assert.equal(stored.films?.[0]?.journalEntryId, origin);
  assert.equal(JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}').clips[0].journalEntryId, origin);
  act(() => again.root.unmount());
});
