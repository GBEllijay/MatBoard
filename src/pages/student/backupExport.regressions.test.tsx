/**
 * Backup and Connections controls still do their own job:
 * JSON backup, spreadsheet, both PDFs, include videos, Last backup,
 * restore Merge/Replace, drive-not-connected note, and clear.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { buildStudentBackup } from '../../lib/studentBackup.ts';
import { backupStampLabel, readStudentBackupStamp } from '../../lib/studentBackupStamp.ts';
import { emptyRankPhotoStore } from '../../lib/rankPhotos.ts';
import { writeFilms, type StudentFilm } from '../../lib/studentFilm.ts';
import { BackupMenu, ClearStudentMenu } from './BackupMenu.tsx';
import { ConnectionsPage } from './ConnectionsPage.tsx';

const dom = new Window({ url: 'http://localhost/student/backup?student=1' });
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
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
installGlobal('indexedDB', view.indexedDB);

const saved: { name: string; blob: Blob }[] = [];
let lastBlob: Blob | null = null;
const urlApi = globalThis.URL as unknown as {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};
urlApi.createObjectURL = (blob: Blob) => {
  lastBlob = blob;
  return 'blob:student-export';
};
urlApi.revokeObjectURL = () => undefined;
view.URL.createObjectURL = urlApi.createObjectURL;
view.URL.revokeObjectURL = urlApi.revokeObjectURL;
view.HTMLAnchorElement.prototype.click = function click() {
  if (lastBlob) saved.push({ name: (this as HTMLAnchorElement).download, blob: lastBlob });
};

function mount(node: ReactNode, entry: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function button(host: ParentNode, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  assert.equal(found?.tagName, 'BUTTON', name);
  return found as HTMLButtonElement;
}

function reactProps(node: Element): Record<string, (event: unknown) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

async function settle() {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}

function journal(note: string, now: number) {
  return addJournalEntry(
    blankStudentReport(now),
    {
      date: '2026-10-17',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [{ id: '', name: 'Armbar' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: note,
    },
    now,
  );
}

const clip: StudentFilm = {
  id: 'film.ui',
  fileName: 'clip.mp4',
  date: '2026-10-17',
  technique: 'Armbar',
  note: '',
  mime: 'video/mp4',
  size: 4,
  createdAt: 1,
  updatedAt: 1,
  where: 'phone',
  provider: '',
  driveFileId: '',
  dateFolder: '2026-10-17 (Sat)',
};

async function exerciseExports(host: HTMLElement) {
  const text = () => host.textContent ?? '';
  assert.match(text(), /Last backup: Not yet/);
  assert.match(text(), /Video files: off/);
  assert.match(text(), /Downloads advantage-student-backup-/);
  assert.match(text(), /Downloads advantage-student-templates-/);
  assert.match(text(), /Downloads advantage-student-progress-/);
  assert.match(text(), /Downloads advantage-student-self-assessment-/);
  assert.equal(host.querySelector('[data-on="no"]')?.textContent, 'Off');

  const before = saved.length;
  await click(button(host, 'Download spreadsheet (.csv)'));
  assert.equal(saved.length, before + 1);
  assert.match(saved.at(-1)?.name ?? '', /\.csv$/);
  assert.match(text(), /Last backup: Not yet/);
  assert.match(text(), /Downloaded advantage-student-templates-/);

  await click(button(host, 'Download progress report (.pdf)'));
  assert.equal(saved.length, before + 2);
  assert.match(saved.at(-1)?.name ?? '', /progress-.*\.pdf$/);
  assert.match(text(), /Last backup: Not yet/);

  await click(button(host, 'Download self-assessment (.pdf)'));
  assert.equal(saved.length, before + 3);
  assert.match(saved.at(-1)?.name ?? '', /self-assessment-.*\.pdf$/);
  assert.match(text(), /Last backup: Not yet/);

  const box = [...host.querySelectorAll('input[type="checkbox"]')].find((node) =>
    node.closest('label')?.textContent?.includes('Include video files kept on this device'),
  );
  assert.equal(box?.tagName, 'INPUT');
  const videoBox = box as HTMLInputElement;
  await act(async () => {
    videoBox.checked = true;
    videoBox.dispatchEvent(new view.Event('change', { bubbles: true }));
    reactProps(videoBox)?.onChange?.({ target: videoBox, currentTarget: videoBox });
  });
  assert.match(text(), /Video files: on/);
  assert.equal(host.querySelector('[data-on="yes"]')?.textContent, 'On');

  await click(button(host, 'Back up my journal (.json)'));
  assert.equal(saved.length, before + 4);
  assert.match(saved.at(-1)?.name ?? '', /\.json$/);
  const file = JSON.parse(await (saved.at(-1)?.blob.text() ?? '{}')) as {
    films?: { technique?: string }[];
    filmFiles?: unknown;
    filmFilesOmitted?: { id: string }[];
  };
  assert.equal(file.films?.[0]?.technique, 'Armbar');
  assert.equal(file.filmFiles, undefined);
  assert.equal(file.filmFilesOmitted?.[0]?.id, clip.id);
  assert.match(text(), /Last backup: \d{4}-\d{2}-\d{2}/);
  assert.equal(text().includes('Last backup: Not yet'), false);
  assert.match(text(), /No academy folder or personal drive is connected/);
  assert.notEqual(backupStampLabel(readStudentBackupStamp(localStorage)), 'Not yet');
}

test('backup page controls each download one file, then merge and replace still restore', async () => {
  localStorage.clear();
  saved.length = 0;
  writeFilms(localStorage, [clip]);
  saveStudentReport(localStorage, journal('only on this phone', 4));
  const page = mount(<BackupMenu />, '/student/backup?student=1');
  await exerciseExports(page.host);

  const built = await buildStudentBackup({
    report: journal('from the backup', 30),
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    recordStamp: false,
  });
  const input = page.host.querySelector('input[aria-label="Restore from backup"]');
  assert.ok(input);
  await act(async () => {
    reactProps(input)?.onChange?.({ target: { files: [{ text: async () => built.json }], value: '' } });
  });
  await settle();
  assert.match(page.host.textContent ?? '', /Merge with this phone/);
  await click(button(page.host, 'Merge with this phone'));
  assert.match(page.host.textContent ?? '', /merged/);
  assert.equal(loadStudentReport(localStorage).journal.length, 2);

  await act(async () => {
    reactProps(input)?.onChange?.({ target: { files: [{ text: async () => built.json }], value: '' } });
  });
  await settle();
  await click(button(page.host, 'Cancel restore'));
  assert.equal(page.host.textContent?.includes('Replace this phone'), false);

  await act(async () => {
    reactProps(input)?.onChange?.({ target: { files: [{ text: async () => built.json }], value: '' } });
  });
  await settle();
  await click(button(page.host, 'Replace this phone'));
  assert.match(page.host.textContent ?? '', /replaced/);
  const replaced = loadStudentReport(localStorage);
  assert.equal(replaced.journal.length, 1);
  assert.match(replaced.journal[0]?.body ?? '', /from the backup/);

  assert.match(page.host.querySelector('a[href="/student/print/progress?student=1"]')?.textContent ?? '', /Print progress report/);
  assert.match(page.host.querySelector('a[href="/student/print/assessment?student=1"]')?.textContent ?? '', /Print self-assessment/);
  assert.match(page.host.querySelector('a[href="/student/backup/clear?student=1"]')?.textContent ?? '', /Clear all Student Edition data/);
  unmount(page);
});

test('connections page keeps the same export, restore, and clear controls', async () => {
  localStorage.clear();
  saved.length = 0;
  localStorage.setItem('advantage.proUnlocked', '1');
  localStorage.setItem('advantage.studentUnlocked', '1');
  localStorage.setItem('matboard.pro.googleDriveFolder.v1', '{"folderId":"keep-folder"}');
  writeFilms(localStorage, [clip]);
  saveStudentReport(localStorage, journal('only on this phone', 4));
  const page = mount(<ConnectionsPage />, '/student/connections?student=1');
  await exerciseExports(page.host);
  assert.match(page.host.textContent ?? '', /Import from coach/);
  assert.match(page.host.textContent ?? '', /Print progress report/);
  assert.match(page.host.textContent ?? '', /Print self-assessment/);

  await click(button(page.host, 'Clear all Student Edition data'));
  assert.match(page.host.textContent ?? '', /Back up first \(\.json\)/);
  const count = saved.length;
  await click(button(page.host, 'Back up first (.json)'));
  assert.equal(saved.length, count + 1);
  assert.match(saved.at(-1)?.name ?? '', /\.json$/);
  assert.match(page.host.textContent ?? '', /Saved on this phone/);

  await click(button(page.host, 'Continue without a backup'));
  const erase = button(page.host, 'Erase Student Edition data');
  assert.equal(erase.disabled, true);
  const phrase = page.host.querySelector('input[aria-label="Type CLEAR to confirm"]');
  assert.equal(phrase?.tagName, 'INPUT');
  const clearPhrase = phrase as HTMLInputElement;
  await act(async () => {
    clearPhrase.value = 'CLEAR';
    clearPhrase.dispatchEvent(new view.Event('input', { bubbles: true }));
    reactProps(clearPhrase)?.onChange?.({ target: clearPhrase, currentTarget: clearPhrase });
  });
  assert.equal(button(page.host, 'Erase Student Edition data').disabled, false);
  await click(button(page.host, 'Erase Student Edition data'));
  assert.match(page.host.textContent ?? '', /Student Edition data on this device was cleared/);
  assert.equal(loadStudentReport(localStorage).journal.length, 0);
  assert.equal(localStorage.getItem('advantage.proUnlocked'), '1');
  assert.equal(localStorage.getItem('advantage.studentUnlocked'), '1');
  assert.match(localStorage.getItem('matboard.pro.googleDriveFolder.v1') ?? '', /keep-folder/);
  unmount(page);
});

test('clear from Backup & Print downloads one JSON file and still requires CLEAR', async () => {
  localStorage.clear();
  saved.length = 0;
  saveStudentReport(localStorage, journal('keep until clear', 8));
  const page = mount(<ClearStudentMenu />, '/student/backup/clear?student=1');
  await click(button(page.host, 'Clear all Student Edition data'));
  await click(button(page.host, 'Back up first (.json)'));
  assert.equal(saved.length, 1);
  assert.match(saved[0]?.name ?? '', /\.json$/);
  assert.match(await (saved[0]?.blob.text() ?? ''), /keep until clear/);
  assert.match(page.host.textContent ?? '', /Saved on this phone/);
  await click(button(page.host, 'Continue without a backup'));
  const erase = button(page.host, 'Erase Student Edition data');
  assert.equal(erase.disabled, true);
  const phrase = page.host.querySelector('input[aria-label="Type CLEAR to confirm"]');
  assert.equal(phrase?.tagName, 'INPUT');
  const clearPhrase = phrase as HTMLInputElement;
  await act(async () => {
    clearPhrase.value = 'clear';
    clearPhrase.dispatchEvent(new view.Event('input', { bubbles: true }));
    reactProps(clearPhrase)?.onChange?.({ target: clearPhrase, currentTarget: clearPhrase });
  });
  assert.equal(button(page.host, 'Erase Student Edition data').disabled, true);
  await act(async () => {
    clearPhrase.value = 'CLEAR';
    clearPhrase.dispatchEvent(new view.Event('input', { bubbles: true }));
    reactProps(clearPhrase)?.onChange?.({ target: clearPhrase, currentTarget: clearPhrase });
  });
  await click(button(page.host, 'Erase Student Edition data'));
  assert.equal(loadStudentReport(localStorage).journal.length, 0);
  unmount(page);
});
